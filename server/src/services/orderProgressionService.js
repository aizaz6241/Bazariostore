import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { releaseSellerOrderDelivered } from '../routes/sellers/orders.routes.js';
import { notify } from '../utils/notify.js';

// Configuration: Realistic 5 to 7 days progression schedule
export const PROGRESSION_STEPS = {
  confirmed: {
    next: 'processing',
    minHours: 12,
    maxHours: 18,
    label: 'Processing & Packaging',
    note: 'Order moved to warehouse processing and inventory allocation.',
  },
  processing: {
    next: 'packed',
    minHours: 14,
    maxHours: 20,
    label: 'Quality Checked & Packed',
    note: 'Items verified, securely packed, and barcoded for dispatch.',
  },
  packed: {
    next: 'out_from_warehouse',
    minHours: 18,
    maxHours: 24,
    label: 'Dispatched from Warehouse',
    note: 'Package handed over to regional logistics and departed central warehouse.',
  },
  out_from_warehouse: {
    next: 'delivery_warehouse',
    minHours: 36,
    maxHours: 48,
    label: 'Arrived at Delivery Hub',
    note: 'Package completed inter-city transit and checked into destination delivery station.',
  },
  // Legacy / fallback support if an order has status 'shipped'
  shipped: {
    next: 'delivery_warehouse',
    minHours: 24,
    maxHours: 36,
    label: 'Arrived at Delivery Hub',
    note: 'In-transit shipment reached destination delivery warehouse.',
  },
  delivery_warehouse: {
    next: 'out_for_delivery',
    minHours: 20,
    maxHours: 28,
    label: 'Out for Delivery',
    note: 'Dispatched with local delivery courier for doorstep delivery.',
  },
  out_for_delivery: {
    next: 'delivered',
    minHours: 12,
    maxHours: 18,
    label: 'Delivered & Settled',
    note: 'Parcel successfully delivered to customer. All merchant funds & profits settled.',
  },
};

/**
 * Calculates a random delay in milliseconds between minHours and maxHours
 */
export function calculateRandomDelayMs(minHours, maxHours) {
  const hours = minHours + Math.random() * (maxHours - minHours);
  return Math.round(hours * 3600 * 1000);
}

/**
 * Schedule next progression step for an order
 */
export function scheduleNextOrderStep(order) {
  const stepConfig = PROGRESSION_STEPS[order.status];
  if (!stepConfig) {
    order.nextStatus = null;
    order.nextStatusAt = null;
    return false;
  }

  const delayMs = calculateRandomDelayMs(stepConfig.minHours, stepConfig.maxHours);
  order.nextStatus = stepConfig.next;
  order.nextStatusAt = new Date(Date.now() + delayMs);
  return true;
}

/**
 * Background worker: Checks and auto-progresses all due orders
 */
export async function processAutoProgressOrders(app) {
  try {
    const now = new Date();

    // 1. Process orders that are due for their next status
    const dueOrders = await Order.find({
      status: {
        $in: [
          'confirmed',
          'processing',
          'packed',
          'out_from_warehouse',
          'delivery_warehouse',
          'shipped',
          'out_for_delivery',
        ],
      },
      nextStatusAt: { $ne: null, $lte: now },
    });

    // 2. Also pick up any confirmed or in-transit orders that don't have nextStatusAt scheduled yet (backfill existing orders)
    const unscheduledOrders = await Order.find({
      status: {
        $in: [
          'confirmed',
          'processing',
          'packed',
          'out_from_warehouse',
          'delivery_warehouse',
          'shipped',
          'out_for_delivery',
        ],
      },
      $or: [{ nextStatusAt: null }, { nextStatus: null }],
    }).limit(20);

    for (const ord of unscheduledOrders) {
      if (scheduleNextOrderStep(ord)) {
        await ord.save().catch((err) =>
          console.error(`Failed to schedule existing order #${ord.orderNumber}:`, err.message)
        );
      }
    }

    if (!dueOrders || dueOrders.length === 0) return;

    for (const order of dueOrders) {
      try {
        const prevStatus = order.status;
        const newStatus = order.nextStatus;
        if (!newStatus) continue;

        const stepConfig = PROGRESSION_STEPS[prevStatus];
        const stepNote = stepConfig?.note || `Status automatically progressed to ${newStatus}.`;

        // Update items to match order status
        if (Array.isArray(order.items)) {
          order.items.forEach((it) => {
            it.itemStatus = newStatus;
          });
        }

        order.status = newStatus;
        order.statusHistory.push({
          status: newStatus,
          note: stepNote,
          at: now,
          by: 'Logistics Auto-Engine',
        });

        // If newly reached 'delivered', execute complete delivery & settlement lifecycle!
        if (newStatus === 'delivered') {
          // A. Product sold counter and reserved stock release
          for (const it of order.items) {
            if (it.product) {
              await Product.updateOne(
                { _id: it.product._id || it.product },
                { $inc: { reservedStock: -(it.qty || 1), sold: it.qty || 1 } }
              ).catch(() => {});
            }
          }

          // B. Cash on delivery payment status marked paid
          if (order.paymentMethod === 'cod' && order.paymentStatus !== 'paid') {
            order.paymentStatus = 'paid';
            order.payment = {
              ...(order.payment?.toObject?.() || order.payment || {}),
              status: 'paid',
              paidAt: now,
            };
            if (app) {
              notify(app, {
                type: 'payment',
                title: 'Payment received (COD Auto-Delivered)',
                body: `${order.orderNumber} — $${order.total}`,
                link: `/admin/orders/${order._id}`,
              });
            }
          }

          // C. Release locked processing fund + 20% profit payout to each seller
          const sellerIds = [...new Set(order.items.map((i) => i.seller?.toString()).filter(Boolean))];
          for (const sId of sellerIds) {
            await releaseSellerOrderDelivered(app, sId, order);
          }

          // Completed lifecycle: clear next timers
          order.nextStatus = null;
          order.nextStatusAt = null;
        } else {
          // Schedule the subsequent step
          scheduleNextOrderStep(order);
        }

        await order.save();

        // Populate for real-time broadcasts
        await order.populate([
          { path: 'seller', select: 'storeName ownerName email phone' },
          { path: 'items.product', select: 'name price image' },
        ]);

        // Broadcast real-time socket events
        const io = app?.get('io');
        if (io) {
          io.to('admins').emit('order:update', order);
          io.to('admins').emit('order:status_update', {
            orderId: order._id,
            orderNumber: order.orderNumber,
            status: order.status,
            order,
          });

          const sellerIds = [
            ...new Set(
              order.items
                .map((i) => i.seller?._id?.toString() || i.seller?.toString())
                .filter(Boolean)
            ),
          ];
          for (const sId of sellerIds) {
            io.to(`seller:${sId}`).emit('order:update', order);
            io.to(`seller:${sId}`).emit('seller:status_update', { order });
          }
        }

        // Notify sellers
        const sellerIds = [
          ...new Set(
            order.items
              .map((i) => i.seller?._id?.toString() || i.seller?.toString())
              .filter(Boolean)
          ),
        ];
        for (const sId of sellerIds) {
          if (app) {
            notify(app, {
              recipientType: 'seller',
              sellerId: sId,
              type: 'order',
              title: `📦 Order #${order.orderNumber}: ${newStatus.replace(/_/g, ' ').toUpperCase()}`,
              body: `Order #${order.orderNumber} is now: ${stepConfig?.label || newStatus}.`,
              link: '/seller/orders',
            });
          }
        }

        console.log(`🚚 [Logistics Auto-Engine] Order #${order.orderNumber} progressed: ${prevStatus} ➔ ${newStatus}`);
      } catch (ordErr) {
        console.error(`❌ [Logistics Auto-Engine] Failed to auto-progress order #${order.orderNumber}:`, ordErr.message);
      }
    }
  } catch (err) {
    console.error('❌ [Logistics Auto-Engine] Fatal error in processAutoProgressOrders:', err.message);
  }
}
