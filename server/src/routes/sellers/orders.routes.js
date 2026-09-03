import express from 'express';
import mongoose from 'mongoose';
import Seller from '../../models/Seller.js';
import Product from '../../models/Product.js';
import Order from '../../models/Order.js';
import Withdrawal from '../../models/Withdrawal.js';
import { nextSeq } from '../../models/System.js';
import { authSeller, authAdmin, authSellerOrAdmin } from '../../middleware/auth.js';
import { notify } from '../../utils/notify.js';
import { audit } from '../../utils/audit.js';
import { adjustTreasuryStock } from '../../utils/stockSync.js';

const router = express.Router();

// Helper: securely find seller from authenticated token payload or verified admin request
async function getSellerFromReq(req) {
  // If caller is an Admin, allow targeting specific seller via params / body / query
  if (req.admin) {
    const sId = req.params?.id || req.body?.sellerId || req.query?.sellerId || req.seller?.id || req.seller?._id;
    if (sId && mongoose.Types.ObjectId.isValid(sId)) {
      const s = await Seller.findById(sId);
      if (s) return s;
    }
  }

  // If caller is a Seller, strictly use authenticated seller token payload
  if (req.seller) {
    const sId = req.seller.id || req.seller._id;
    if (sId && mongoose.Types.ObjectId.isValid(sId)) {
      const s = await Seller.findById(sId);
      if (s) return s;
    }
    if (req.seller.email) {
      const s = await Seller.findOne({ email: req.seller.email.toLowerCase() });
      if (s) return s;
    }
    if (req.seller.storeSlug) {
      const s = await Seller.findOne({ storeSlug: req.seller.storeSlug });
      if (s) return s;
    }
  }

  return null;
}

// ----------------------------------------------------
// FINANCIAL SETTLEMENT HELPERS (PROCESSING FUND & 20% PROFIT)
// ----------------------------------------------------

/**
 * 1. Lock Order Processing Fund:
 * When seller or admin confirms an order, deducts item total amount from available balance
 * and moves it into seller.wallet.processingFund.
 */
export async function lockSellerOrderFund(app, sellerId, order) {
  const seller = await Seller.findById(sellerId);
  if (!seller) return { totalToLock: 0, itemsLocked: 0 };

  seller.wallet = seller.wallet || {};
  let totalToLock = 0;
  let itemsLocked = 0;

  order.items.forEach((it) => {
    if (it.seller && it.seller.toString() === sellerId.toString()) {
      if (!it.processingLocked && !it.payoutSettled) {
        const itemVal = (it.price || 0) * (it.qty || 1);
        totalToLock += itemVal;
      }
    }
  });

  const availableBal = seller.wallet.balance || 0;
  if (totalToLock > 0 && availableBal < totalToLock) {
    const deficit = (totalToLock - availableBal).toFixed(2);
    throw new Error(
      `Insufficient wallet balance ($${availableBal.toFixed(2)}). To confirm and process this order ($${totalToLock.toFixed(2)}), you must deposit at least $${deficit} into your merchant wallet.`
    );
  }

  totalToLock = 0;
  order.items.forEach((it) => {
    if (it.seller && it.seller.toString() === sellerId.toString()) {
      if (!it.processingLocked && !it.payoutSettled) {
        const itemVal = (it.price || 0) * (it.qty || 1);
        it.processingLocked = true;
        it.lockedAmount = itemVal;
        it.profitRate = 20; // 20% profit margin
        it.profitAmount = Number((itemVal * 0.20).toFixed(2));
        totalToLock += itemVal;
        itemsLocked++;
      }
    }
  });

  if (totalToLock > 0) {
    // Deduct from available balance & add to processing fund
    seller.wallet.balance = (seller.wallet.balance || 0) - totalToLock;
    seller.wallet.processingFund = (seller.wallet.processingFund || 0) + totalToLock;
    seller.markModified('wallet');
    await seller.save();

    // Create ledger transaction
    await Withdrawal.create({
      type: 'order_processing_lock',
      seller: seller._id,
      storeName: seller.storeName,
      amount: totalToLock,
      principalAmount: totalToLock,
      profitAmount: Number((totalToLock * 0.20).toFixed(2)),
      profitRate: 20,
      order: order._id,
      orderNumber: order.orderNumber,
      status: 'completed',
      balanceAfter: seller.wallet.balance,
      processingFundAfter: seller.wallet.processingFund,
      adminNote: `Order #${order.orderNumber} Confirmed — $${totalToLock.toFixed(2)} moved to Processing Fund (20% Profit on Delivery: +$${(totalToLock * 0.20).toFixed(2)})`,
      processedAt: new Date(),
    });

    if (app) {
      notify(app, {
        recipientType: 'seller',
        sellerId: seller._id.toString(),
        type: 'order',
        title: `⚡ Order #${order.orderNumber} Confirmed`,
        body: `$${totalToLock.toFixed(2)} moved to Processing Fund. You will earn +$${(totalToLock * 0.20).toFixed(2)} (20% profit) upon delivery! Total return: $${(totalToLock * 1.20).toFixed(2)}.`,
        link: '/seller/orders',
      });

      app.get('io')?.to(`seller:${seller._id}`).emit('wallet:update', {
        balance: seller.wallet.balance,
        processingFund: seller.wallet.processingFund,
      });
    }
  }

  return { totalToLock, itemsLocked };
}

/**
 * 2. Release Delivered Order Fund (Principal + 20% Profit):
 * When order is delivered, releases locked processing fund + 20% profit directly into available balance!
 */
export async function releaseSellerOrderDelivered(app, sellerId, order) {
  const seller = await Seller.findById(sellerId);
  if (!seller) return { totalPrincipal: 0, totalProfit: 0, totalPayout: 0, settledItems: 0 };

  seller.wallet = seller.wallet || {};
  let totalPrincipal = 0;
  let totalProfit = 0;
  let totalPayout = 0;
  let settledItems = 0;

  for (const it of order.items) {
    if (it.seller && it.seller.toString() === sellerId.toString()) {
      if (!it.payoutSettled) {
        const itemVal = it.lockedAmount || (it.price || 0) * (it.qty || 1);
        const itemProfit = it.profitAmount || Number((itemVal * 0.20).toFixed(2));
        const itemReturn = itemVal + itemProfit;

        it.payoutSettled = true;
        it.settledAt = new Date();
        it.lockedAmount = itemVal;
        it.profitAmount = itemProfit;

        totalPrincipal += itemVal;
        totalProfit += itemProfit;
        totalPayout += itemReturn;
        settledItems++;

        // Synchronize product sold and release reservedStock
        if (it.product) {
          await Product.updateOne(
            { _id: it.product._id || it.product },
            { $inc: { reservedStock: -(it.qty || 1), sold: (it.qty || 1) } }
          ).catch(() => {});
        }
      }
    }
  }

  if (totalPayout > 0) {
    // Release from processing fund
    seller.wallet.processingFund = Math.max(0, (seller.wallet.processingFund || 0) - totalPrincipal);
    // Credit full payout ($100 principal + $20 profit = $120) to available balance
    seller.wallet.balance = (seller.wallet.balance || 0) + totalPayout;
    seller.wallet.totalProfitEarned = (seller.wallet.totalProfitEarned || 0) + totalProfit;
    seller.wallet.totalEarned = (seller.wallet.totalEarned || 0) + totalPayout;
    seller.markModified('wallet');
    await seller.save();

    // Create ledger transaction
    await Withdrawal.create({
      type: 'order_delivered_release',
      seller: seller._id,
      storeName: seller.storeName,
      amount: totalPayout,
      principalAmount: totalPrincipal,
      profitAmount: totalProfit,
      profitRate: 20,
      order: order._id,
      orderNumber: order.orderNumber,
      status: 'completed',
      balanceAfter: seller.wallet.balance,
      processingFundAfter: seller.wallet.processingFund,
      adminNote: `Order #${order.orderNumber} Delivered — $${totalPrincipal.toFixed(2)} Processing Fund released + $${totalProfit.toFixed(2)} Profit (20%) credited! Total: +$${totalPayout.toFixed(2)}`,
      processedAt: new Date(),
    });

    // Check & Advance Performance Target Milestones
    if (Array.isArray(seller.targets) && seller.targets.length > 0) {
      let targetUpdated = false;
      for (const target of seller.targets) {
        if (target.status === 'active') {
          target.currentOrders = (target.currentOrders || 0) + 1;
          targetUpdated = true;

          if (target.currentOrders >= target.targetOrders) {
            target.status = 'completed';
            target.completedAt = new Date();
            const bonusAmt = target.bonusAmount || 0;

            if (bonusAmt > 0) {
              seller.wallet.balance = (seller.wallet.balance || 0) + bonusAmt;
              seller.wallet.totalProfitEarned = (seller.wallet.totalProfitEarned || 0) + bonusAmt;
              seller.wallet.totalEarned = (seller.wallet.totalEarned || 0) + bonusAmt;

              // Create transaction record
              await Withdrawal.create({
                type: 'adjustment',
                seller: seller._id,
                storeName: seller.storeName,
                amount: bonusAmt,
                approvedAmount: bonusAmt,
                balanceAfter: seller.wallet.balance,
                isManualAdjustment: true,
                status: 'approved',
                adminNote: `🎯 Target Completed Bonus: "${target.title}" (${target.targetOrders} orders delivered)`,
                processedAt: new Date(),
                processedBy: 'Platform Growth Rewards',
              });

              // Celebrate in Seller-Admin chat
              try {
                let conv = await Conversation.findOne({ seller: seller._id });
                if (conv) {
                  const bonusMsg =
                    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `🏆 SALES TARGET COMPLETED & BONUS CREDITED!\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `Target: ${target.title}\n` +
                    `Goal: ${target.targetOrders} Delivered Orders\n` +
                    `Bonus Credited: +$${bonusAmt.toLocaleString('en-US')} Cash\n` +
                    `New Wallet Balance: $${seller.wallet.balance.toLocaleString('en-US')}\n\n` +
                    `Great performance! Your reward has been credited directly to your balance.\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━`;

                  const msg = await Message.create({
                    conversation: conv._id,
                    seller: seller._id,
                    sender: 'admin',
                    senderName: 'Platform Rewards Desk',
                    text: bonusMsg,
                  });

                  conv.lastMessage = `🏆 Bonus Credited: +$${bonusAmt}`;
                  conv.lastSender = 'admin';
                  conv.lastAt = new Date();
                  conv.unreadForSeller = (conv.unreadForSeller || 0) + 1;
                  await conv.save();

                  app?.get('io')?.to(`seller:${seller._id}`).emit('message:new', msg);
                }
              } catch (targetChatErr) {
                console.error('Target bonus chat error:', targetChatErr.message);
              }

              notify(app, {
                recipientType: 'seller',
                sellerId: seller._id.toString(),
                type: 'approval',
                title: `🏆 Target Completed: +$${bonusAmt} Bonus!`,
                body: `You completed "${target.title}"! $${bonusAmt} cash bonus has been credited to your wallet balance.`,
                link: '/seller/wallet',
              });
            }
          }
        }
      }

      if (targetUpdated) {
        seller.markModified('targets');
        seller.markModified('wallet');
        await seller.save();
        app?.get('io')?.to(`seller:${seller._id}`).emit('seller:targets_update', { targets: seller.targets });
      }
    }

    if (app) {
      notify(app, {
        recipientType: 'seller',
        sellerId: seller._id.toString(),
        type: 'order',
        title: `🎉 Order #${order.orderNumber} Delivered & Settled!`,
        body: `+$${totalPayout.toFixed(2)} credited to your wallet! ($${totalPrincipal.toFixed(2)} processing release + $${totalProfit.toFixed(2)} 20% profit).`,
        link: '/seller/wallet',
      });

      app.get('io')?.to(`seller:${seller._id}`).emit('wallet:update', {
        balance: seller.wallet.balance,
        processingFund: seller.wallet.processingFund,
        totalProfitEarned: seller.wallet.totalProfitEarned,
      });
    }
  }

  return { totalPrincipal, totalProfit, totalPayout, settledItems };
}

/**
 * 3. Release Cancelled Order Fund:
 * Returns locked processing fund back to available balance without profit/loss.
 */
export async function releaseSellerOrderCancelled(app, sellerId, order) {
  const seller = await Seller.findById(sellerId);
  if (!seller) return;

  seller.wallet = seller.wallet || {};
  let totalToRefund = 0;

  for (const it of order.items) {
    if (it.seller && it.seller.toString() === sellerId.toString()) {
      if (it.processingLocked && !it.payoutSettled) {
        totalToRefund += it.lockedAmount || (it.price || 0) * (it.qty || 1);
        it.processingLocked = false;
        it.lockedAmount = 0;
        it.profitAmount = 0;

        // Restore product stock and release reservedStock
        if (it.product) {
          const prodToRestore = await Product.findById(it.product._id || it.product);
          if (prodToRestore) {
            prodToRestore.stock = (prodToRestore.stock || 0) + (it.qty || 1);
            prodToRestore.reservedStock = Math.max(0, (prodToRestore.reservedStock || 0) - (it.qty || 1));
            await prodToRestore.save();
            if (prodToRestore.treasuryProduct) {
              await adjustTreasuryStock(prodToRestore.treasuryProduct, (it.qty || 1), {
                releaseReserved: true,
                reason: 'seller_order_cancelled',
                note: `Order #${order.orderNumber} cancelled by seller`,
              });
            }
          }
        }
      }
    }
  }

  if (totalToRefund > 0) {
    seller.wallet.processingFund = Math.max(0, (seller.wallet.processingFund || 0) - totalToRefund);
    seller.wallet.balance = (seller.wallet.balance || 0) + totalToRefund;
    seller.markModified('wallet');
    await seller.save();

    await Withdrawal.create({
      type: 'order_cancelled_refund',
      seller: seller._id,
      storeName: seller.storeName,
      amount: totalToRefund,
      principalAmount: totalToRefund,
      profitAmount: 0,
      order: order._id,
      orderNumber: order.orderNumber,
      status: 'completed',
      balanceAfter: seller.wallet.balance,
      processingFundAfter: seller.wallet.processingFund,
      adminNote: `Order #${order.orderNumber} Cancelled — $${totalToRefund.toFixed(2)} Processing Fund returned to Available Balance`,
      processedAt: new Date(),
    });

    if (app) {
      notify(app, {
        recipientType: 'seller',
        sellerId: seller._id.toString(),
        type: 'order',
        title: `↩️ Order #${order.orderNumber} Cancelled`,
        body: `$${totalToRefund.toFixed(2)} processing fund returned to your available balance.`,
        link: '/seller/wallet',
      });

      app.get('io')?.to(`seller:${seller._id}`).emit('wallet:update', {
        balance: seller.wallet.balance,
        processingFund: seller.wallet.processingFund,
      });
    }
  }
}

// ----------------------------------------------------
// SELLER ORDER MANAGEMENT ROUTES
// ----------------------------------------------------

// GET /api/sellers/orders
router.get('/orders', authSellerOrAdmin, async (req, res) => {
  try {
    const seller = await getSellerFromReq(req);
    if (!seller) return res.status(404).json({ message: 'Seller not found. Please log in again.' });

    const sellerId = seller._id.toString();
    const sellerProducts = await Product.find({
      $or: [
        { seller: seller._id },
        { sellerName: seller.storeName },
        { sellerSlug: seller.storeSlug },
      ],
    }, '_id');
    const sellerProdIds = sellerProducts.map((p) => p._id);

    const orders = await Order.find({
      $or: [
        { 'items.seller': seller._id },
        { seller: seller._id },
        { 'items.product': { $in: sellerProdIds } },
      ],
    })
      .populate('items.product')
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 });

    // Auto-backfill items where seller ID was missing
    for (const ord of orders) {
      let changed = false;
      for (const it of ord.items) {
        const itProdId = it.product?._id ? it.product._id.toString() : (it.product ? it.product.toString() : '');
        const matchesSellerProd = sellerProdIds.some((pid) => pid.toString() === itProdId);

        if (!it.seller || it.seller.toString() !== sellerId) {
          if (matchesSellerProd || (ord.seller && ord.seller.toString() === sellerId)) {
            it.seller = seller._id;
            it.sellerName = seller.storeName || 'Verified Store';
            if (!it.costPrice && it.price) it.costPrice = Math.round(it.price * 0.8);
            changed = true;
          }
        }
      }
      if (!ord.seller && ord.items.some((it) => it.seller?.toString() === sellerId)) {
        ord.seller = seller._id;
        changed = true;
      }
      if (changed) {
        await ord.save().catch(() => {});
      }
    }

    // Filter items to show only this seller's items and item totals
    const formatted = orders
      .map((ord) => {
        const sellerItems = ord.items.filter((it) => {
          if (it.seller && it.seller.toString() === sellerId) return true;
          const itProdId = it.product?._id ? it.product._id.toString() : (it.product ? it.product.toString() : '');
          if (sellerProdIds.some((pid) => pid.toString() === itProdId)) return true;
          if (ord.seller && ord.seller.toString() === sellerId) return true;
          return false;
        });

        if (sellerItems.length === 0) return null;

        const sellerTotal = sellerItems.reduce((acc, it) => acc + (it.price || 0) * (it.qty || 1), 0);
        const sellerProfit = Number((sellerTotal * 0.20).toFixed(2));
        const sellerReturn = Number((sellerTotal * 1.20).toFixed(2));
        const isLocked = sellerItems.some((it) => it.processingLocked);
        const isSettled = sellerItems.every((it) => it.payoutSettled);

        return {
          ...ord.toObject(),
          sellerItems,
          sellerTotal,
          sellerProfit,
          sellerReturn,
          isLocked,
          isSettled,
        };
      })
      .filter(Boolean);

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/orders/:id/confirm (Dedicated 1-Click Order Confirm Action)
router.post('/orders/:id/confirm', authSellerOrAdmin, async (req, res) => {
  try {
    const seller = await getSellerFromReq(req);
    if (!seller) return res.status(404).json({ message: 'Seller not found. Please log in again.' });

    const sellerId = seller._id.toString();
    const order = await Order.findById(req.params.id).populate('items.product');
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const sellerProducts = await Product.find({
      $or: [
        { seller: seller._id },
        { sellerName: seller.storeName },
        { sellerSlug: seller.storeSlug },
      ],
    }, '_id');
    const sellerProdIds = sellerProducts.map((p) => p._id.toString());

    let updatedAny = false;
    order.items.forEach((it) => {
      const itProdId = it.product?._id ? it.product._id.toString() : (it.product ? it.product.toString() : '');
      const itSellerId = it.seller ? it.seller.toString() : '';
      const ordSellerId = order.seller ? order.seller.toString() : '';

      if (itSellerId === sellerId || sellerProdIds.includes(itProdId) || ordSellerId === sellerId || !it.seller) {
        it.seller = seller._id;
        it.sellerName = seller.storeName || 'Verified Store';
        it.itemStatus = 'confirmed';
        updatedAny = true;
      }
    });

    if (!updatedAny) {
      order.items.forEach((it) => {
        it.seller = seller._id;
        it.sellerName = seller.storeName || 'Verified Store';
        it.itemStatus = 'confirmed';
      });
      updatedAny = true;
    }

    // Lock processing funds into seller.wallet.processingFund
    const fundResult = await lockSellerOrderFund(req.app, seller._id, order);

    const allStatuses = order.items.map((it) => it.itemStatus || order.status);
    if (allStatuses.every((s) => s === 'confirmed')) {
      order.status = 'confirmed';
    }

    order.statusHistory.push({
      status: 'confirmed',
      note: `Confirmed by seller (${seller.storeName}) — Funds moved to Processing`,
      at: new Date(),
      by: seller.storeName,
    });

    await order.save();

    // Real-time synchronization to Admin and Seller sockets
    const io = req.app.get('io');
    if (io) {
      io.to('admins').emit('order:update', order);
      io.to(`seller:${sellerId}`).emit('order:update', order);
      io.to(`seller:${sellerId}`).emit('seller:status_update', { order });
    }

    // Notify Admins about seller confirmation
    notify(req.app, {
      recipientType: 'admin',
      type: 'order',
      title: `⚡ Order #${order.orderNumber} Confirmed by Merchant`,
      body: `${seller.storeName} confirmed order #${order.orderNumber}. Ready for admin fulfillment dispatch.`,
      link: `/admin/orders/${order._id}`,
    });

    res.json({ ok: true, order, lockedAmount: fundResult?.totalToLock || 0 });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT / PATCH / POST /api/sellers/orders/:id/status
export const handleStatusUpdate = async (req, res) => {
  try {
    const { status, trackingNumber, note } = req.body || {};
    const isSeller = Boolean(req.seller && !req.admin);

    // SECURITY RESTRICTION: Sellers can ONLY confirm pending orders; all other status changes belong to Admin
    if (isSeller) {
      if (status !== 'confirmed') {
        return res.status(403).json({
          message: 'Sellers are only permitted to confirm orders. Fulfillment and delivery statuses (Shipped, Delivered, Cancelled) are managed exclusively by Platform Operations.',
        });
      }
    }

    const seller = await getSellerFromReq(req);
    const storeName = req.admin ? (req.admin.name || 'Platform Admin') : (seller?.storeName || 'Merchant');
    const sellerId = seller ? seller._id.toString() : (req.seller?.id || req.seller?._id || '');

    const order = await Order.findById(req.params.id).populate('items.product');
    if (!order) return res.status(404).json({ message: 'Order not found' });

    let sellerProducts = [];
    if (seller) {
      sellerProducts = await Product.find({
        $or: [
          { seller: seller._id },
          { sellerName: seller.storeName },
          { sellerSlug: seller.storeSlug },
        ],
      }, '_id');
    }
    const sellerProdIds = sellerProducts.map((p) => p._id.toString());

    let updatedAny = false;
    order.items.forEach((it) => {
      const itProdId = it.product?._id ? it.product._id.toString() : (it.product ? it.product.toString() : '');
      const itSellerId = it.seller ? it.seller.toString() : '';
      const ordSellerId = order.seller ? order.seller.toString() : '';

      const isOwnedBySeller = itSellerId === sellerId || sellerProdIds.includes(itProdId) || ordSellerId === sellerId;
      const isAdmin = Boolean(req.admin);

      if (isOwnedBySeller || isAdmin) {
        if (seller && isOwnedBySeller) {
          it.seller = seller._id;
          it.sellerName = seller.storeName;
        }
        if (status) it.itemStatus = status;
        if (trackingNumber) it.trackingNumber = trackingNumber;
        updatedAny = true;
      }
    });

    if (!updatedAny && !req.admin) {
      return res.status(403).json({ message: 'Access denied: this order does not contain products from your store' });
    }

    // Financial settlement triggers
    const affectedSellerIds = [...new Set(order.items.map((i) => i.seller?.toString()).filter(Boolean))];
    if (seller && !affectedSellerIds.includes(seller._id.toString())) {
      affectedSellerIds.push(seller._id.toString());
    }

    for (const sId of affectedSellerIds) {
      if (status === 'confirmed' || status === 'processing') {
        await lockSellerOrderFund(req.app, sId, order);
      } else if (status === 'delivered') {
        await releaseSellerOrderDelivered(req.app, sId, order);
      } else if (status === 'cancelled') {
        await releaseSellerOrderCancelled(req.app, sId, order);
      }
    }

    // If all items share same status, update parent order status
    const allStatuses = order.items.map((it) => it.itemStatus || order.status);
    if (allStatuses.every((s) => s === status)) {
      order.status = status;
    }

    order.statusHistory.push({
      status: status || order.status,
      note: note || `Status updated to ${status} by ${storeName}`,
      at: new Date(),
      by: storeName,
    });

    await order.save();

    // Broadcast real-time socket events to Admin and all affected Sellers
    const io = req.app.get('io');
    if (io) {
      io.to('admins').emit('order:update', order);
      for (const sId of affectedSellerIds) {
        io.to(`seller:${sId}`).emit('order:update', order);
        io.to(`seller:${sId}`).emit('seller:status_update', { order });
      }
    }

    // Send notifications to sellers when admin changes status
    if (req.admin) {
      for (const sId of affectedSellerIds) {
        notify(req.app, {
          recipientType: 'seller',
          sellerId: sId,
          type: 'order',
          title: `📦 Order #${order.orderNumber} Status: ${status.replace(/_/g, ' ').toUpperCase()}`,
          body: `Order #${order.orderNumber} has been updated to "${status.replace(/_/g, ' ').toUpperCase()}" by Platform Operations.`,
          link: '/seller/orders',
        });
      }
    }

    res.json({ ok: true, order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

router.put('/orders/:id/status', authSellerOrAdmin, handleStatusUpdate);
router.patch('/orders/:id/status', authSellerOrAdmin, handleStatusUpdate);
router.post('/orders/:id/status', authSellerOrAdmin, handleStatusUpdate);
router.put('/orders/:id', authSellerOrAdmin, handleStatusUpdate);
router.patch('/orders/:id', authSellerOrAdmin, handleStatusUpdate);
router.post('/orders/:id', authSellerOrAdmin, handleStatusUpdate);

// POST /api/sellers/place-order (Admin manually places an order for a specific seller)
router.post('/place-order', authAdmin('orders'), async (req, res) => {
  try {
    const { sellerId, items, customer, shippingAddress, paymentMethod, adminNotes } = req.body;
    if (!sellerId) return res.status(400).json({ message: 'Seller ID is required' });
    if (!items || !items.length) return res.status(400).json({ message: 'At least one product item is required' });

    const seller = await Seller.findById(sellerId);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const orderNumber = `ORD-${await nextSeq('order')}`;

    let subtotal = 0;
    const lineItems = [];

    for (const item of items) {
      const prod = await Product.findById(item.productId);
      const price = item.price !== undefined ? Number(item.price) : prod ? prod.price : 0;
      const costPrice = prod?.costs?.purchase || 0;
      const qty = Number(item.qty) || 1;
      const itemSub = price * qty;
      subtotal += itemSub;

      lineItems.push({
        product: prod ? prod._id : null,
        seller: seller._id,
        sellerName: seller.storeName,
        name: item.name || prod?.name || 'Item',
        image: item.image || prod?.image || '',
        price,
        costPrice,
        qty,
        itemStatus: 'pending', // Starts as pending so seller confirms it normally
        trackingNumber: item.trackingNumber || '',
      });

      // Deduct stock if product exists
      if (prod && prod.stock >= qty) {
        prod.stock -= qty;
        prod.sold = (prod.sold || 0) + qty;
        await prod.save();
      }
    }

    const shippingCost = Number(req.body.shippingCost || 0);
    const total = subtotal + shippingCost;

    const order = new Order({
      orderNumber,
      seller: seller._id,
      placedBy: 'customer',
      items: lineItems,
      contact: {
        email: customer?.email || '',
        phone: customer?.phone || '',
      },
      shippingAddress: {
        fullName: customer?.name || shippingAddress?.fullName || 'Customer',
        street: shippingAddress?.street || '',
        apartment: shippingAddress?.apartment || '',
        city: shippingAddress?.city || 'New York',
        state: shippingAddress?.state || 'NY',
        postalCode: shippingAddress?.postalCode || '',
        country: shippingAddress?.country || 'United States',
      },
      shipping: {
        name: req.body.shippingMethodName || 'Standard Express Delivery',
        cost: shippingCost,
        eta: '2-4 business days',
      },
      subtotal,
      total,
      paymentMethod: paymentMethod || 'cod',
      paymentStatus: paymentMethod === 'cod' ? 'pending' : 'paid',
      status: 'pending', // Starts as pending so seller confirms to lock funds
      adminNotes: adminNotes || '',
      statusHistory: [
        {
          status: 'pending',
          note: 'Order placed by customer via store checkout (Awaiting Merchant Confirmation)',
          at: new Date(),
          by: 'Customer',
        },
      ],
    });

    await order.save();

    // Update seller stats
    seller.totalOrders = (seller.totalOrders || 0) + 1;
    seller.totalSales = (seller.totalSales || 0) + total;
    await seller.save();

    audit(req, 'create', 'order', order._id, `Order ${orderNumber} created for seller ${seller.storeName}`);

    // Send real-time notification to the seller
    const customerName = customer?.name || shippingAddress?.fullName || 'Customer';
    notify(req.app, {
      recipientType: 'seller',
      sellerId: seller._id,
      type: 'order',
      title: `📦 New Order #${orderNumber}`,
      body: `You received a new order for ${lineItems.length} item(s)! Customer: ${customerName} ($${total.toLocaleString('en-US')})`,
      link: '/seller/orders',
    });

    req.app.get('io')?.to(`seller:${seller._id}`).emit('order:new', {
      _id: order._id,
      orderNumber: order.orderNumber,
      total: order.total,
      itemsCount: lineItems.length,
      name: customerName,
    });

    // Admin notification
    notify(req.app, {
      recipientType: 'admin',
      type: 'order',
      title: `📦 Order #${orderNumber} Created`,
      body: `Order for ${seller.storeName} created for ${customerName} ($${total.toLocaleString('en-US')})`,
      link: `/admin/orders/${order._id}`,
    });

    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * Background Automated Penalty & Reminder Task
 * Runs periodically (every 5-10 minutes) to check for unconfirmed orders.
 * 24h unconfirmed: Sends warning notification & chat message.
 * 48h unconfirmed: Applies 25-point penalty to Account Health & freezes merchant account.
 */
export async function processOrderPenalties(app) {
  try {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // 1. Check for 24h Warning Candidates
    const warnOrders = await Order.find({
      status: 'pending',
      createdAt: { $lt: twentyFourHoursAgo },
      warning24hSent: { $ne: true },
    }).populate('seller');

    for (const ord of warnOrders) {
      ord.warning24hSent = true;
      await ord.save();

      const seller = ord.seller;
      if (seller) {
        notify(app, {
          recipientType: 'seller',
          sellerId: seller._id.toString(),
          type: 'compliance',
          title: `⚠️ 24-Hour Urgent Order Confirmation Warning: #${ord.orderNumber}`,
          body: `Order #${ord.orderNumber} has been unconfirmed for over 24 hours! Please confirm and process within 24 hours to avoid a 25-point account health penalty and store freeze.`,
          link: '/seller/orders',
        });

        try {
          let conv = await Conversation.findOne({ seller: seller._id });
          if (conv) {
            const warnMsg =
              `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `⚠️ URGENT 24-HOUR ORDER CONFIRMATION NOTICE\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `Order Number: #${ord.orderNumber}\n` +
              `Placed On: ${ord.createdAt.toLocaleString('en-US')}\n` +
              `Status: PENDING CONFIRMATION (>24 Hours)\n\n` +
              `Policy Reminder: All merchant orders must be confirmed within 48 hours. Failure to confirm will result in a 25-point Account Health penalty and immediate account freeze.\n` +
              `Please go to "Orders & Dispatch" and confirm this order now.\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━`;

            const msg = await Message.create({
              conversation: conv._id,
              seller: seller._id,
              sender: 'admin',
              senderName: 'Compliance Enforcement Bot',
              text: warnMsg,
            });

            conv.lastMessage = `⚠️ 24h Warning: Unconfirmed Order #${ord.orderNumber}`;
            conv.lastSender = 'admin';
            conv.lastAt = new Date();
            conv.unreadForSeller = (conv.unreadForSeller || 0) + 1;
            await conv.save();

            app?.get('io')?.to(`seller:${seller._id}`).emit('message:new', msg);
          }
        } catch (chatErr) {}
      }
    }

    // 2. Check for 48h Penalty & Freeze Candidates
    const penaltyOrders = await Order.find({
      status: 'pending',
      createdAt: { $lt: fortyEightHoursAgo },
      penalty48hApplied: { $ne: true },
    }).populate('seller');

    for (const ord of penaltyOrders) {
      ord.penalty48hApplied = true;
      await ord.save();

      const seller = await Seller.findById(ord.seller?._id || ord.seller);
      if (seller) {
        const prevScore = seller.accountHealth?.score ?? 100;
        const newScore = Math.max(0, prevScore - 25);

        seller.accountHealth = seller.accountHealth || {};
        seller.accountHealth.score = newScore;
        seller.accountHealth.status = 'frozen';
        seller.status = 'frozen';
        seller.freezeReason = `Automatic Freeze: Order #${ord.orderNumber} remained unconfirmed for over 48 hours.`;

        seller.accountHealth.history = seller.accountHealth.history || [];
        seller.accountHealth.history.unshift({
          previousScore: prevScore,
          newScore,
          delta: -25,
          reason: `Automatic penalty for unconfirmed order #${ord.orderNumber} (>48 hours)`,
          changedBy: 'System Enforcement',
          createdAt: new Date(),
        });

        seller.markModified('accountHealth');
        await seller.save();

        notify(app, {
          recipientType: 'seller',
          sellerId: seller._id.toString(),
          type: 'freeze',
          title: `🚫 Account Frozen: 48h Unconfirmed Order #${ord.orderNumber}`,
          body: `Your merchant account has been frozen and penalized -25 points due to failure to confirm order #${ord.orderNumber} within 48 hours. Please contact support.`,
          link: '/seller/support',
        });

        try {
          let conv = await Conversation.findOne({ seller: seller._id });
          if (conv) {
            const freezeMsg =
              `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `🚫 COMPLIANCE PENALTY & ACCOUNT FROZEN\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `Order Number: #${ord.orderNumber}\n` +
              `Reason: Exceeded 48-Hour Confirmation Deadline\n` +
              `Health Score Penalty: -25 Points (New Score: ${newScore}/100)\n` +
              `Account Status: FROZEN\n\n` +
              `Your seller store has been temporarily frozen. Please contact platform support immediately to request unfreezing.\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━`;

            const msg = await Message.create({
              conversation: conv._id,
              seller: seller._id,
              sender: 'admin',
              senderName: 'Compliance Enforcement Bot',
              text: freezeMsg,
            });

            conv.lastMessage = `🚫 Account Frozen: Order #${ord.orderNumber} (>48h)`;
            conv.lastSender = 'admin';
            conv.lastAt = new Date();
            conv.unreadForSeller = (conv.unreadForSeller || 0) + 1;
            await conv.save();

            app?.get('io')?.to(`seller:${seller._id}`).emit('message:new', msg);
            app?.get('io')?.to(`seller:${seller._id}`).emit('seller:health_update', {
              accountHealth: seller.accountHealth,
              status: seller.status,
            });
            app?.get('io')?.to(`seller:${seller._id}`).emit('seller:status_update', { seller: seller.toObject() });
          }
        } catch (chatErr) {}
      }
    }
  } catch (err) {
    console.error('Error in processOrderPenalties:', err.message);
  }
}

export default router;

