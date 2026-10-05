import { Router } from 'express';
import Order, { STATUSES } from '../models/Order.js';
import Product from '../models/Product.js';
import Discount from '../models/Discount.js';
import Refund from '../models/Refund.js';
import { Conversation } from '../models/Chat.js';
import { StockHistory } from '../models/StockHistory.js';
import { authAdmin, authUser, softUser, authSellerOrAdmin } from '../middleware/auth.js';
import { quoteCart } from '../services/discounts.js';
import { initiatePayment, getPaymentConfig, paymentMethodUsable } from '../services/payments.js';
import { audit } from '../utils/audit.js';
import { notify } from '../utils/notify.js';
import { lockSellerOrderFund, releaseSellerOrderDelivered, releaseSellerOrderCancelled } from './sellers.js';
import { handleStatusUpdate } from './sellers/orders.routes.js';
import { adjustTreasuryStock } from '../utils/stockSync.js';
import { scheduleNextOrderStep } from '../services/orderProgressionService.js';
import { restockOrder, settleDeliveredStock } from '../utils/orderStock.js';
import { limit } from '../utils/rateLimit.js';
import { asText } from '../middleware/sanitize.js';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { publicOrder } from '../utils/publicOrder.js';

const router = Router();

function makeOrderNumber(digits = 4) {
  const d = new Date();
  const low = 10 ** (digits - 1);
  const rand = crypto.randomInt(low, low * 10);
  return `NG-${d.getFullYear().toString().slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${rand}`;
}

/**
 * Save a new order under a free order number. The number is the date plus random digits, so two
 * orders on the same day can pick the same one: instead of failing the customer's checkout, a new
 * number is tried (4 digits first, then longer ones).
 */
async function createOrderWithNumber(data) {
  let lastErr = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await Order.create({ ...data, orderNumber: makeOrderNumber(attempt < 3 ? 4 : attempt < 6 ? 6 : 8) });
    } catch (e) {
      const duplicateNumber = e?.code === 11000 && /orderNumber/.test(`${e.message} ${JSON.stringify(e.keyPattern || {})}`);
      if (!duplicateNumber) throw e;
      lastErr = e;
    }
  }
  throw lastErr || new Error('Could not create the order. Please try again.');
}

const placeOrderLimit = limit({ name: 'place-order', max: 20, windowMs: 10 * 60 * 1000, message: 'Too many orders from this network. Please wait a few minutes and try again.' });
const trackLimit = limit({ name: 'track-order', max: 30, windowMs: 10 * 60 * 1000 });

async function stockAlerts(app, product) {
  if (product.stock <= 0) {
    notify(app, { type: 'stock', title: 'Out of stock', body: `${product.name} is now OUT OF STOCK`, link: '/admin/inventory' });
  } else if (product.stock <= (product.lowStockThreshold || 5)) {
    notify(app, { type: 'stock', title: 'Low stock alert', body: `${product.name} — only ${product.stock} left`, link: '/admin/inventory' });
  }
}

// Every cart line must name a product by a real id (plain text), nothing else
const cartLooksValid = (items) =>
  items.length <= 100 && items.every((it) => it && typeof it === 'object' && typeof it.id === 'string' && mongoose.Types.ObjectId.isValid(it.id));

// POST /api/orders/quote — live totals for checkout (discounts auto-apply here)
router.post('/quote', async (req, res) => {
  try {
    const { items, couponCode, shippingMethodId } = req.body || {};
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ message: 'Cart is empty' });
    if (!cartLooksValid(items)) return res.status(400).json({ message: 'A product in your cart is no longer available' });
    const q = await quoteCart({ items, couponCode, shippingMethodId });
    res.json({
      subtotal: q.subtotal,
      shipping: q.shipping,
      applied: q.applied,
      discountTotal: q.discountTotal,
      total: q.total,
      couponError: q.couponError,
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// POST /api/orders — place order (guest or logged-in)
router.post('/', placeOrderLimit, softUser, async (req, res) => {
  // stock taken off the shelf for this order; put back if the order cannot be completed
  const reserved = [];
  try {
    const { items, contact, shippingAddress, shippingMethodId, couponCode, walletNumber } = req.body || {};
    const paymentMethod = asText(req.body?.paymentMethod, 40);
    const guestId = asText(req.body?.guestId, 64);
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ message: 'Cart is empty' });
    if (!cartLooksValid(items)) return res.status(400).json({ message: 'A product in your cart is no longer available' });
    if (typeof contact?.email !== 'string' || typeof contact?.phone !== 'string' || !contact.email || !contact.phone) return res.status(400).json({ message: 'Email and phone are required' });
    const addr = shippingAddress || {};
    for (const f of ['fullName', 'street', 'city', 'state', 'postalCode']) {
      if (typeof addr[f] !== 'string' || !addr[f].trim()) return res.status(400).json({ message: 'Please fill all required shipping fields' });
    }

    const payCfg = await getPaymentConfig();
    const method = paymentMethod || 'cod';
    // checked BEFORE the order is saved (a method without a working gateway used to leave a
    // saved order behind and then show an error)
    if (!paymentMethodUsable(method, payCfg)) return res.status(400).json({ message: 'Selected payment method is not available' });

    const q = await quoteCart({ items, couponCode, shippingMethodId });
    if (couponCode && q.couponError) return res.status(400).json({ message: q.couponError });

    // stock check
    for (const l of q.lines) {
      if (l.product.stock < l.qty) return res.status(400).json({ message: `"${l.product.name}" ka sirf ${Math.max(0, l.product.stock)} stock reh gaya hai` });
    }

    // Idempotency: Prevent duplicate orders placed within 5 seconds due to rapid clicks or network retransmission
    const fiveSecondsAgo = new Date(Date.now() - 5000);
    const dupFilter = {
      createdAt: { $gte: fiveSecondsAgo },
      'contact.email': contact.email.trim(),
      'contact.phone': contact.phone.trim(),
    };
    if (req.user?.id) dupFilter.user = req.user.id;
    else if (guestId) dupFilter.guestId = guestId;

    const recentOrder = await Order.findOne(dupFilter).sort({ createdAt: -1 });
    if (recentOrder) {
      const recentKeys = (recentOrder.items || []).map((i) => `${i.product?.toString() || i.product}-${i.qty}`).sort().join('|');
      const incomingKeys = (items || []).map((i) => `${i.id}-${i.qty}`).sort().join('|');
      if (recentKeys === incomingKeys) {
        return res.status(200).json(publicOrder(recentOrder));
      }
    }

    // Take the stock FIRST, each line in one database step that only succeeds while enough is
    // left. Two customers buying the last piece at the same moment: one gets it, the other is told.
    for (const l of q.lines) {
      const taken = await Product.findOneAndUpdate(
        { _id: l.product._id, stock: { $gte: l.qty } },
        { $inc: { stock: -l.qty, reservedStock: l.qty } },
        { new: true }
      );
      if (!taken) {
        await releaseReserved(reserved);
        const left = await Product.findById(l.product._id).select('stock name').lean();
        return res.status(400).json({ message: `"${l.product.name}" ka sirf ${Math.max(0, left?.stock || 0)} stock reh gaya hai` });
      }
      reserved.push({ product: taken, qty: l.qty });
    }

    const order = await createOrderWithNumber({
      user: req.user?.id || null,
      guestId: guestId || '',
      seller: q.lines[0]?.product?.seller?._id || q.lines[0]?.product?.seller || null,
      items: q.lines.map((l) => {
        const sId = l.product.seller?._id || l.product.seller || null;
        const sName = l.product.seller?.storeName || l.product.sellerName || 'Verified Store';
        return {
          product: l.product._id,
          seller: sId,
          sellerName: sName,
          name: l.product.name,
          image: l.product.image,
          size: l.size,
          variant: l.variant,
          price: l.price,
          costPrice: l.product.costPrice || (l.product.price ? Math.round(l.product.price * 0.8) : 0),
          qty: l.qty,
          itemStatus: 'pending',
        };
      }),
      contact,
      shippingAddress: addr,
      shipping: { methodId: q.shipping.methodId, name: q.shipping.name, cost: q.shipping.cost, eta: q.shipping.eta },
      subtotal: q.subtotal,
      discounts: q.applied,
      discount: q.discountTotal,
      couponCode: q.applied.find((a) => a.code)?.code || '',
      total: q.total,
      paymentMethod: method,
      paymentStatus: 'pending',
      status: 'pending',
      statusHistory: [{ status: 'pending', note: `Order placed — ${method === 'cod' ? 'Cash on Delivery' : method}` }],
    });

    // the order exists now: the reserved stock belongs to it (it is no longer given back on an error)
    const held = reserved.splice(0);

    // payment initiation (structure ready; live APIs plug into services/payments.js)
    const pay = await initiatePayment(method, order, { walletNumber });
    order.payment = { provider: pay.provider, reference: pay.reference, status: pay.status, message: pay.message, walletNumber: pay.walletNumber || '' };
    if (pay.status === 'awaiting_payment') order.paymentStatus = 'awaiting_payment';
    await order.save();

    // stock history + treasury sync (the stock itself was already taken above)
    for (const { product: p, qty } of held) {
      const l = { qty };
      if (p) {
        await StockHistory.create({ product: p._id, productName: p.name, change: -l.qty, stockAfter: p.stock, reason: 'order', note: order.orderNumber });

        // If product is linked to Central Treasury, synchronize master and all sellers
        if (p.treasuryProduct) {
          await adjustTreasuryStock(p.treasuryProduct, -l.qty, {
            reason: 'order_placement',
            note: `Order #${order.orderNumber} via seller "${p.sellerName}"`,
            by: p.sellerName || 'Customer Checkout',
          });
        }

        await stockAlerts(req.app, p);
      }
    }

    // coupon usage
    const usedCoupon = q.applied.find((a) => a.code);
    if (usedCoupon) await Discount.updateOne({ code: usedCoupon.code }, { $inc: { usedCount: 1 } });

    // link chat conversation to this customer/order
    if (guestId) {
      await Conversation.updateOne(
        { guestId },
        { $set: { name: addr.fullName, email: contact.email, phone: contact.phone, orderNumber: order.orderNumber, user: req.user?.id || null } }
      );
    }

    notify(req.app, { type: 'order', title: 'New order received', body: `${order.orderNumber} — ${addr.fullName} (${addr.city}) — ₹${order.total}`, link: `/admin/orders/${order._id}` });
    req.app.get('io')?.to('admins').emit('order:new', { _id: order._id, orderNumber: order.orderNumber, total: order.total, name: addr.fullName, city: addr.city });

    // Notify individual sellers who own items in this order
    const sellerIds = [...new Set(order.items.map((i) => i.seller?.toString()).filter(Boolean))];
    for (const sId of sellerIds) {
      const sItems = order.items.filter((i) => i.seller?.toString() === sId);
      notify(req.app, {
        recipientType: 'seller',
        sellerId: sId,
        type: 'order',
        title: `📦 New Order #${order.orderNumber}`,
        body: `You received an order for ${sItems.length} item(s)! Customer: ${addr.fullName}`,
        link: '/seller/orders',
      });
      req.app.get('io')?.to(`seller:${sId}`).emit('order:new', { _id: order._id, orderNumber: order.orderNumber, total: order.total, itemsCount: sItems.length });
    }

    res.status(201).json(publicOrder(order));
  } catch (e) {
    await releaseReserved(reserved);
    console.error('[place-order-error]', e);
    res.status(500).json({ message: 'Could not place the order. Please try again.' });
  }
});

/** Put back stock that was taken for an order which then could not be created. */
async function releaseReserved(reserved) {
  for (const { product, qty } of reserved.splice(0)) {
    try {
      await Product.updateOne({ _id: product._id }, { $inc: { stock: qty, reservedStock: -qty } });
    } catch (e) {
      console.error('[place-order] could not release reserved stock:', e.message);
    }
  }
}

// GET /api/orders/track?phone= | ?orderNumber=&phone=
router.get('/track', trackLimit, async (req, res) => {
  const orderNumber = asText(req.query.orderNumber, 40);
  const phone = asText(req.query.phone, 30);
  if (!phone) return res.status(400).json({ message: 'Phone number is required' });
  const digits = String(phone).replace(/\D/g, '').slice(-10);
  if (digits.length < 9) return res.status(400).json({ message: 'Enter a valid phone number' });
  const samePhone = (o) => String(o.contact?.phone || '').replace(/\D/g, '').slice(-10) === digits;

  if (orderNumber) {
    const order = await Order.findOne({ orderNumber: orderNumber.trim().toUpperCase() });
    if (!order || !samePhone(order)) {
      return res.status(404).json({ message: 'No order found with that order number and phone' });
    }
    return res.json(publicOrder(order));
  }

  // phone-only: orders linked to this phone. Looked up by the number itself (any spacing or
  // dashes between the digits), not by scanning the latest 500 orders of the whole store.
  const loose = digits.slice(-7).split('').join('\\D*');
  const candidates = await Order.find({ 'contact.phone': { $regex: loose } })
    .select('orderNumber createdAt status total items.qty items.name contact.phone')
    .sort({ createdAt: -1 })
    .limit(300);
  const mine = candidates.filter(samePhone).slice(0, 25);
  res.json({
    orders: mine.map((o) => ({
      orderNumber: o.orderNumber,
      createdAt: o.createdAt,
      status: o.status,
      total: o.total,
      itemCount: o.items.reduce((s, i) => s + i.qty, 0),
      firstItem: o.items[0]?.name || '',
    })),
  });
});

// POST /api/orders/:id/refund-request — logged-in customer requests refund
router.post('/:id/refund-request', authUser, async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order || String(order.user) !== String(req.user.id)) return res.status(404).json({ message: 'Order not found' });
  if (order.refundId) return res.status(400).json({ message: 'Is order ki refund request pehle se mojood hai' });
  const refund = await Refund.create({
    order: order._id,
    orderNumber: order.orderNumber,
    customer: { name: order.shippingAddress?.fullName, email: order.contact?.email, phone: order.contact?.phone },
    amount: order.total,
    reason: (req.body?.reason || '').slice(0, 500),
    status: 'requested',
    requestedBy: 'customer',
    timeline: [{ status: 'requested', note: req.body?.reason || '', by: 'customer' }],
  });
  order.refundId = refund._id;
  await order.save();
  notify(req.app, { type: 'refund', title: 'Refund requested', body: `${order.orderNumber} — Rs.${order.total}`, link: '/admin/refunds' });
  res.status(201).json(refund);
});

// ---------- admin ----------
router.get('/', authAdmin('orders'), async (req, res) => {
  const { status, q, sellerId } = req.query;
  const filter = {};
  if (status && STATUSES.includes(status)) filter.status = status;
  if (sellerId) {
    filter.$or = [{ seller: sellerId }, { 'items.seller': sellerId }];
  }
  if (q?.trim()) {
    const rx = { $regex: q.trim(), $options: 'i' };
    const qFilters = [{ orderNumber: rx }, { 'contact.phone': rx }, { 'contact.email': rx }, { 'shippingAddress.fullName': rx }];
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: qFilters }];
      delete filter.$or;
    } else {
      filter.$or = qFilters;
    }
  }
  const orders = await Order.find(filter)
    .populate('seller', 'storeName ownerName email phone')
    .populate('items.product', 'name price image')
    .sort({ createdAt: -1 })
    .limit(300);
  res.json(orders);
});

router.get('/:id', authAdmin('orders'), async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  res.json(order);
});

const orderStatusHandler = async (req, res) => {
  if (req.seller && !req.admin) {
    return handleStatusUpdate(req, res);
  }
  const status = asText(req.body?.status, 40);
  const note = asText(req.body?.note, 500);
  if (!STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status' });
  if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) return res.status(404).json({ message: 'Order not found' });
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  const prev = order.status;

  // Every step that moves money can refuse (for example the seller's wallet cannot cover the
  // order). It refuses BEFORE anything is saved, and the admin gets the reason instead of a
  // request that never answers.
  try {

  // 1. Order Cancelled
  if (status === 'cancelled' && prev !== 'cancelled') {
    await restockOrder(order, 'order_cancelled', req.admin?.name || 'Admin');
    // Release locked processing funds back to each seller
    const sellerIds = [...new Set(order.items.map((i) => i.seller?.toString()).filter(Boolean))];
    for (const sId of sellerIds) {
      await releaseSellerOrderCancelled(req.app, sId, order);
    }
  }

  // 2. Order moved forward by Admin: the seller's funds are locked first.
  //    (Also when a waiting order jumps straight to packed / shipped / ..., otherwise it would
  //    later be "delivered" and paid out without the funds ever having been locked.)
  const FORWARD = ['confirmed', 'processing', 'packed', 'out_from_warehouse', 'delivery_warehouse', 'shipped', 'out_for_delivery'];
  if (FORWARD.includes(status)) {
    const sellerIds = [...new Set(order.items.map((i) => i.seller?.toString()).filter(Boolean))];
    for (const sId of sellerIds) {
      await lockSellerOrderFund(req.app, sId, order); // does nothing for items already locked
    }
  }

  // 3. Order Delivered by Admin
  if (status === 'delivered' && prev !== 'delivered') {
    // Release locked processing fund + 20% profit payout to each seller
    // (first, so that nothing else is changed if a seller's wallet cannot cover an unlocked order)
    const payoutSellerIds = [...new Set(order.items.map((i) => i.seller?.toString()).filter(Boolean))];
    for (const sId of payoutSellerIds) {
      await releaseSellerOrderDelivered(req.app, sId, order);
    }
    await settleDeliveredStock(order);
    if (order.paymentMethod === 'cod' && order.paymentStatus !== 'paid') {
      order.paymentStatus = 'paid';
      order.payment = { ...(order.payment?.toObject?.() || order.payment || {}), status: 'paid', paidAt: new Date() };
      notify(req.app, { type: 'payment', title: 'Payment received (COD)', body: `${order.orderNumber} — $${order.total}`, link: `/admin/orders/${order._id}` });
    }
  }
  } catch (moneyErr) {
    return res.status(400).json({ message: `Order status was not changed. ${String(moneyErr.message || moneyErr).replace('you must deposit', 'the seller must deposit').replace('your merchant wallet', 'the merchant wallet')}` });
  }

  // Update itemStatus on all items to match parent status
  order.items.forEach((it) => {
    it.itemStatus = status;
  });

  order.status = status;
  if (['cancelled', 'refunded', 'delivered'].includes(status)) {
    order.nextStatus = null;
    order.nextStatusAt = null;
  } else if (['confirmed', 'processing', 'packed', 'out_from_warehouse', 'delivery_warehouse', 'shipped', 'out_for_delivery'].includes(status)) {
    scheduleNextOrderStep(order);
  }
  order.statusHistory.push({ status, note: note || '', by: req.admin?.name || 'Admin' });
  await order.save();
  await audit(req, 'order_updated', 'order', order._id, { orderNumber: order.orderNumber, from: prev, to: status, note: note || '' });

  // Re-populate order before broadcasting
  await order.populate([
    { path: 'seller', select: 'storeName ownerName email phone' },
    { path: 'items.product', select: 'name price image' },
  ]);

  // Broadcast real-time socket updates to Admin and relevant Sellers
  const sellerIds = [...new Set(order.items.map((i) => i.seller?.toString()).filter(Boolean))];
  const io = req.app.get('io');
  if (io) {
    io.to('admins').emit('order:update', order);
    io.to('admins').emit('order:status_update', { orderId: order._id, orderNumber: order.orderNumber, status: order.status, order });
    for (const sId of sellerIds) {
      io.to(`seller:${sId}`).emit('order:update', order);
      io.to(`seller:${sId}`).emit('seller:status_update', { order });
    }
  }

  // Notify sellers about the status transition
  if (req.admin && prev !== status) {
    for (const sId of sellerIds) {
      notify(req.app, {
        recipientType: 'seller',
        sellerId: sId,
        type: 'order',
        title: `📦 Order #${order.orderNumber} Status: ${status.replace(/_/g, ' ').toUpperCase()}`,
        body: `Order #${order.orderNumber} status changed from "${prev}" to "${status.replace(/_/g, ' ').toUpperCase()}".`,
        link: '/seller/orders',
      });
    }
  }

  res.json(order);
};

router.patch('/:id/status', authSellerOrAdmin, orderStatusHandler);
router.put('/:id/status', authSellerOrAdmin, orderStatusHandler);
router.post('/:id/status', authSellerOrAdmin, orderStatusHandler);

router.patch('/:id/payment', authAdmin('orders'), async (req, res) => {
  const { paymentStatus } = req.body || {};
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  order.paymentStatus = paymentStatus;
  if (paymentStatus === 'paid') {
    order.payment = { ...(order.payment?.toObject?.() || order.payment || {}), status: 'paid', paidAt: new Date() };
    notify(req.app, { type: 'payment', title: 'Payment received', body: `${order.orderNumber} — Rs.${order.total} (${order.paymentMethod})`, link: `/admin/orders/${order._id}` });
  }
  await order.save();
  await audit(req, 'payment_updated', 'order', order._id, { orderNumber: order.orderNumber, paymentStatus });
  res.json(order);
});

export { restockOrder };
export default router;
