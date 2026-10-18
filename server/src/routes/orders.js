import { Router } from 'express';
import { blockWhenFrozen } from './sellers/helpers.js';
import Order, { STATUSES, PAYMENT_STATUSES } from '../models/Order.js';
import Seller from '../models/Seller.js';
import Product from '../models/Product.js';
import TreasuryProduct from '../models/TreasuryProduct.js';
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
import { handleStatusUpdate, undoTargetProgressForOrder } from './sellers/orders.routes.js';
import { adjustTreasuryStock } from '../utils/stockSync.js';
import { scheduleNextOrderStep } from '../services/orderProgressionService.js';
import { restockOrder, settleDeliveredStock, reinstateOrderStock, checkStockForReinstate } from '../utils/orderStock.js';
import { limit } from '../utils/rateLimit.js';
import { asText } from '../middleware/sanitize.js';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { publicOrder } from '../utils/publicOrder.js';
import { adminRoom } from '../utils/permissions.js';
import { announceToAdmins, toSellers } from '../utils/realtime.js';
import { sellerOrderPing, maskName } from '../utils/orderPrivacy.js';

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

      // A Central Treasury product: every seller's listing shows the SAME master stock, so the
      // master is the real limit. Taken in one step too: two customers buying the last piece
      // through two different sellers can no longer both get it.
      if (taken.treasuryProduct) {
        const master = await adjustTreasuryStock(taken.treasuryProduct, -l.qty, {
          kind: 'reserve',
          reason: 'order_placement',
          note: `Checkout via seller "${taken.sellerName || ''}"`,
          by: taken.sellerName || 'Customer Checkout',
        });
        if (!master) {
          await releaseReserved(reserved);
          const left = await TreasuryProduct.findById(taken.treasuryProduct).select('stock').lean();
          return res.status(400).json({ message: `"${l.product.name}" ka sirf ${Math.max(0, left?.stock || 0)} stock reh gaya hai` });
        }
        reserved[reserved.length - 1].treasury = taken.treasuryProduct;
      }
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

    // stock history (the stock itself, Central Treasury included, was already taken above)
    for (const { product: p, qty } of held) {
      if (p) {
        await StockHistory.create({ product: p._id, productName: p.name, change: -qty, stockAfter: p.stock, reason: 'order', note: order.orderNumber });
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
    req.app.get('io')?.to(adminRoom('orders')).emit('order:new', { _id: order._id, orderNumber: order.orderNumber, total: order.total, name: addr.fullName, city: addr.city });

    // Notify individual sellers who own items in this order
    const sellerIds = [...new Set(order.items.map((i) => i.seller?.toString()).filter(Boolean))];
    for (const sId of sellerIds) {
      const sItems = order.items.filter((i) => i.seller?.toString() === sId);
      notify(req.app, {
        recipientType: 'seller',
        sellerId: sId,
        type: 'order',
        title: `📦 New Order #${order.orderNumber}`,
        body: `You received an order for ${sItems.length} item(s)! Customer: ${maskName(addr.fullName)}`,
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
  for (const { product, qty, treasury } of reserved.splice(0)) {
    try {
      await Product.updateOne({ _id: product._id }, { $inc: { stock: qty, reservedStock: -qty } });
      if (treasury) await adjustTreasuryStock(treasury, qty, { kind: 'release', reason: 'checkout_failed', note: 'Order could not be placed' });
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
    // The tracking page needs the delivery address, not the customer's email: it is left out, as
    // only a phone number (which others may know) is asked for here.
    const out = publicOrder(order);
    if (out.contact) out.contact = { ...out.contact, email: undefined };
    return res.json(out);
  }

  // phone-only: orders linked to this phone. Looked up by the number itself (any spacing or
  // dashes between the digits), not by scanning the latest 500 orders of the whole store.
  const loose = digits.slice(-7).split('').join('\\D*');
  const candidates = await Order.find({ 'contact.phone': { $regex: loose } })
    .select('orderNumber createdAt status total items.qty items.name contact.phone')
    .sort({ createdAt: -1 })
    .limit(300)
    .maxTimeMS(5000);
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
router.post('/:id/refund-request', authUser, announceToAdmins('refunds', 'refunds:changed', (req) => ({ orderId: req.params?.id || '' })), async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order || String(order.user) !== String(req.user.id)) return res.status(404).json({ message: 'Order not found' });
  if (order.refundId) return res.status(400).json({ message: 'Is order ki refund request pehle se mojood hai' });
  // nothing to refund on an order that was cancelled or already refunded
  if (['cancelled', 'refunded'].includes(order.status)) return res.status(400).json({ message: 'This order is already closed, so a refund cannot be requested.' });
  // the store(s) of the order: the refund used to be saved without one, so the store never saw it
  const refundStores = [...new Set([order.seller, ...order.items.map((i) => i.seller)].filter(Boolean).map(String))];
  const refund = await Refund.create({
    order: order._id,
    orderNumber: order.orderNumber,
    seller: refundStores.length === 1 ? refundStores[0] : order.seller || null,
    customer: { name: order.shippingAddress?.fullName, email: order.contact?.email, phone: order.contact?.phone },
    amount: order.total,
    reason: (req.body?.reason || '').slice(0, 500),
    status: 'requested',
    requestedBy: 'customer',
    timeline: [{ status: 'requested', note: req.body?.reason || '', by: 'customer' }],
  });
  order.refundId = refund._id;
  await order.save();
  notify(req.app, { type: 'refund', title: 'Refund requested', body: `${order.orderNumber} — $${order.total}`, link: '/admin/refunds' });
  for (const sId of refundStores) {
    notify(req.app, { recipientType: 'seller', sellerId: sId, type: 'refund', title: 'New return request', body: `Order ${order.orderNumber} — please review it`, link: '/seller/refunds' });
  }
  toSellers(refundStores, 'refunds:changed', { refundId: String(refund._id) });
  res.status(201).json(refund);
});

// ---------- admin ----------
const escapeRx = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/', authAdmin('orders'), async (req, res) => {
  try {
    const { status, sellerId } = req.query;
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
    const filter = {};
    if (status && STATUSES.includes(status)) filter.status = status;
    if (sellerId) {
      // an unknown id matches nothing (it used to crash the request and the screen waited 30 s)
      if (!mongoose.Types.ObjectId.isValid(String(sellerId))) return res.json([]);
      filter.$or = [{ seller: sellerId }, { 'items.seller': sellerId }];
    }
    if (q) {
      // typed text is matched literally: "(" or "+" in a search no longer breaks the request
      const rx = { $regex: escapeRx(q), $options: 'i' };
      const qFilters = [{ orderNumber: rx }, { 'contact.phone': rx }, { 'contact.email': rx }, { 'shippingAddress.fullName': rx }, { 'items.sellerName': rx }];
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
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/orders/analytics/overview?days=30&sellerId=&scope=all|client
// Charts on top of the admin Orders page: order and GMV trend, status mix, payment mix,
// a per-seller leaderboard (orders, value, delivered / cancelled rate, open orders), top
// products, top cities and when in the day orders come in. Values are per seller share of
// each order (items.price × qty), so a multi-seller order is split fairly.
const OPEN_EXCLUDE = ['delivered', 'cancelled', 'refunded'];
const FULFILLMENT = ['confirmed', 'processing', 'packed', 'out_from_warehouse', 'delivery_warehouse', 'shipped', 'out_for_delivery'];

router.get('/analytics/overview', authAdmin('orders'), async (req, res) => {
  try {
    const days = Math.min(365, Math.max(7, parseInt(req.query.days, 10) || 30));
    const sellerId = req.query.sellerId && mongoose.Types.ObjectId.isValid(String(req.query.sellerId)) ? String(req.query.sellerId) : '';
    const scope = req.query.scope === 'client' ? 'client' : 'all';
    // the browser's Date#getTimezoneOffset(), so "busiest hours" are in the admin's own time
    const tzMin = Math.max(-840, Math.min(840, parseInt(req.query.tz, 10) || 0));
    const now = new Date();
    const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));
    const prevSince = new Date(since.getTime() - days * 86400000);

    const sellerQuery = scope === 'client' ? { isTestAccount: { $ne: true }, isPreviousStoreSeller: { $ne: true } } : {};
    const sellers = await Seller.find(sellerQuery).select('storeName ownerName status isTestAccount').lean();
    const sellerMap = new Map(sellers.map((s) => [String(s._id), s]));

    const match = { createdAt: { $gte: prevSince } };
    if (sellerId) match.$or = [{ seller: sellerId }, { 'items.seller': sellerId }];
    const [orders, statusAgg, openNow] = await Promise.all([
      Order.find(match)
        .select('status total paymentMethod placedBy createdAt seller shippingAddress.city shippingAddress.state items.seller items.sellerName items.name items.product items.price items.qty items.image')
        .lean(),
      Order.aggregate([
        { $match: sellerId ? { $or: [{ seller: new mongoose.Types.ObjectId(sellerId) }, { 'items.seller': new mongoose.Types.ObjectId(sellerId) }] } : {} },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),
      Order.find({ status: { $nin: OPEN_EXCLUDE }, ...(sellerId ? { $or: [{ seller: sellerId }, { 'items.seller': sellerId }] } : {}) })
        .select('createdAt status')
        .lean(),
    ]);

    const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
    const dayList = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since.getTime() + i * 86400000);
      dayList.push({ key: dayKey(d), label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) });
    }
    const byDay = new Map(dayList.map((d) => [d.key, { label: d.label, orders: 0, gmv: 0, delivered: 0, cancelled: 0 }]));

    const totals = { orders: 0, gmv: 0, items: 0, delivered: 0, cancelled: 0, open: 0, deliveredValue: 0, adminPlaced: 0 };
    const prev = { orders: 0, gmv: 0, delivered: 0, cancelled: 0 };
    const windowStatus = new Map();
    const payment = new Map();
    const perSeller = new Map();
    const products = new Map();
    const cities = new Map();
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, label: `${String(h).padStart(2, '0')}:00`, orders: 0 }));
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => ({ label, orders: 0, gmv: 0 }));

    const sellerRow = (sid, fallbackName) => {
      let r = perSeller.get(sid);
      if (!r) {
        const s = sellerMap.get(sid);
        r = { _id: sid, storeName: s?.storeName || (sid ? fallbackName || 'Store' : 'Bazario Direct'), ownerName: s?.ownerName || '', isTestAccount: Boolean(s?.isTestAccount), orders: 0, gmv: 0, delivered: 0, cancelled: 0, open: 0, items: 0 };
        perSeller.set(sid, r);
      }
      return r;
    };

    orders.forEach((o) => {
      const st = (o.status || 'pending').toLowerCase();
      const created = new Date(o.createdAt);
      const inWindow = created >= since;
      const dead = st === 'cancelled' || st === 'refunded';
      const ordSeller = o.seller ? String(o.seller) : '';

      // each seller's share of this order
      const shares = new Map();
      (o.items || []).forEach((it) => {
        const sid = it.seller ? String(it.seller) : ordSeller;
        if (sellerId && sid !== sellerId) return;
        if (scope === 'client' && !sellerMap.has(sid)) return;
        const sh = shares.get(sid) || { value: 0, qty: 0, name: it.sellerName };
        sh.value += (Number(it.price) || 0) * (Number(it.qty) || 1);
        sh.qty += Number(it.qty) || 1;
        shares.set(sid, sh);
      });
      if (!shares.size) return;
      let value = 0;
      let qty = 0;
      shares.forEach((sh) => {
        value += sh.value;
        qty += sh.qty;
      });

      if (!inWindow) {
        prev.orders += 1;
        if (!dead) prev.gmv += value;
        if (st === 'delivered') prev.delivered += 1;
        if (dead) prev.cancelled += 1;
        return;
      }

      totals.orders += 1;
      totals.items += qty;
      if (!dead) totals.gmv += value;
      if (st === 'delivered') {
        totals.delivered += 1;
        totals.deliveredValue += value;
      }
      if (dead) totals.cancelled += 1;
      if (!OPEN_EXCLUDE.includes(st)) totals.open += 1;
      if (o.placedBy === 'admin' || o.placedBy === 'staff') totals.adminPlaced += 1;
      windowStatus.set(st, (windowStatus.get(st) || 0) + 1);

      const day = byDay.get(dayKey(created));
      if (day) {
        day.orders += 1;
        if (!dead) day.gmv += value;
        if (st === 'delivered') day.delivered += 1;
        if (dead) day.cancelled += 1;
      }
      const local = new Date(created.getTime() - tzMin * 60000);
      hours[local.getUTCHours()].orders += 1;
      const wd = weekdays[local.getUTCDay()];
      wd.orders += 1;
      if (!dead) wd.gmv += value;

      const pm = o.paymentMethod || 'cod';
      const p = payment.get(pm) || { method: pm, orders: 0, gmv: 0 };
      p.orders += 1;
      if (!dead) p.gmv += value;
      payment.set(pm, p);

      const city = (o.shippingAddress?.city || '').trim();
      if (city) {
        const key = city.toLowerCase();
        const c = cities.get(key) || { city, state: o.shippingAddress?.state || '', orders: 0, gmv: 0 };
        c.orders += 1;
        if (!dead) c.gmv += value;
        cities.set(key, c);
      }

      shares.forEach((sh, sid) => {
        const r = sellerRow(sid, sh.name);
        r.orders += 1;
        r.items += sh.qty;
        if (!dead) r.gmv += sh.value;
        if (st === 'delivered') r.delivered += 1;
        if (dead) r.cancelled += 1;
        if (!OPEN_EXCLUDE.includes(st)) r.open += 1;
      });

      if (!dead) {
        (o.items || []).forEach((it) => {
          const sid = it.seller ? String(it.seller) : ordSeller;
          if (!shares.has(sid)) return;
          const key = String(it.product || it.name || '');
          if (!key) return;
          const pr = products.get(key) || { name: it.name || 'Product', image: it.image || '', storeName: it.sellerName || '', qty: 0, gmv: 0 };
          pr.qty += Number(it.qty) || 1;
          pr.gmv += (Number(it.price) || 0) * (Number(it.qty) || 1);
          products.set(key, pr);
        });
      }
    });

    // open orders by age (all open orders, not only this window): what is stuck
    const aging = [
      { label: '< 24h', maxH: 24, count: 0 },
      { label: '1–2 days', maxH: 48, count: 0 },
      { label: '2–7 days', maxH: 168, count: 0 },
      { label: '7+ days', maxH: Infinity, count: 0 },
    ];
    openNow.forEach((o) => {
      const ageH = (now - new Date(o.createdAt)) / 3600000;
      aging.find((b) => ageH < b.maxH).count += 1;
    });

    const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
    const leaderboard = [...perSeller.values()]
      .map((r) => ({
        ...r,
        gmv: round(r.gmv),
        aov: r.orders - r.cancelled > 0 ? round(r.gmv / (r.orders - r.cancelled)) : 0,
        deliveryRate: pct(r.delivered, r.orders),
        cancelRate: pct(r.cancelled, r.orders),
      }))
      .sort((a, b) => b.gmv - a.gmv || b.orders - a.orders);

    const liveOrders = totals.orders - totals.cancelled;
    res.json({
      days,
      scope,
      sellerId,
      totals: {
        ...totals,
        gmv: round(totals.gmv),
        deliveredValue: round(totals.deliveredValue),
        aov: liveOrders > 0 ? round(totals.gmv / liveOrders) : 0,
        deliveryRate: pct(totals.delivered, totals.orders),
        cancelRate: pct(totals.cancelled, totals.orders),
        activeSellers: leaderboard.length,
      },
      previous: { ...prev, gmv: round(prev.gmv) },
      statusCounts: Object.fromEntries(statusAgg.map((x) => [x._id || 'pending', x.n])),
      windowStatus: Object.fromEntries(windowStatus),
      trend: [...byDay.values()].map((d) => ({ ...d, gmv: round(d.gmv) })),
      payment: [...payment.values()].map((p) => ({ ...p, gmv: round(p.gmv) })).sort((a, b) => b.orders - a.orders),
      leaderboard: leaderboard.slice(0, 50),
      topProducts: [...products.values()].map((p) => ({ ...p, gmv: round(p.gmv) })).sort((a, b) => b.gmv - a.gmv).slice(0, 8),
      topCities: [...cities.values()].map((c) => ({ ...c, gmv: round(c.gmv) })).sort((a, b) => b.orders - a.orders).slice(0, 8),
      hours: hours.map(({ label, orders: n }) => ({ label, orders: n })),
      weekdays: weekdays.map((w) => ({ ...w, gmv: round(w.gmv) })),
      aging: aging.map(({ label, count }) => ({ label, count })),
      openTotal: openNow.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id', authAdmin('orders'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) return res.status(404).json({ message: 'Order not found' });
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
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
  const by = req.admin?.name || 'Admin';

  // A delivered order was already paid out to the seller and counted as sold. Cancelling it put
  // the items back on the shelf while the seller kept the payout; a delivered order goes back
  // only through a refund.
  if (prev === 'delivered' && status === 'cancelled') {
    return res.status(400).json({ message: 'A delivered order cannot be cancelled. Use a refund instead.' });
  }

  // A cancelled / refunded order brought back: its items were put back on the shelf
  const CLOSED = ['cancelled', 'refunded'];
  const reviving = CLOSED.includes(prev) && !CLOSED.includes(status);
  const orderSellerIds = [...new Set(order.items.map((i) => i.seller?.toString()).filter(Boolean))];

  // Every step that moves money can refuse (for example the seller's wallet cannot cover the
  // order). It refuses BEFORE anything is saved, and the admin gets the reason instead of a
  // request that never answers.
  try {

  // 0. Bringing an order back needs its stock again: refuse now, before any money moves
  if (reviving) await checkStockForReinstate(order);

  // 1. Order Cancelled
  if (status === 'cancelled' && prev !== 'cancelled') {
    await restockOrder(order, 'order_cancelled', by);
    // Release locked processing funds back to each seller
    for (const sId of orderSellerIds) {
      await releaseSellerOrderCancelled(req.app, sId, order);
    }
  }

  // 1a. Order Refunded: the money locked for it returns to the seller (it used to stay locked
  //     for good) and the items go back on the shelf. A payout already made on delivery stays.
  if (status === 'refunded' && prev !== 'refunded') {
    for (const sId of orderSellerIds) {
      await releaseSellerOrderCancelled(req.app, sId, order, { reason: 'refunded' });
    }
    await restockOrder(order, 'refund_restock', by);
  }

  // 1b. Order moved BACK to "pending" by Admin: it is waiting again, so the money that was
  //     locked for it returns to the seller's available balance (it is locked again when the
  //     order is confirmed again). Also runs when the order is already pending, so an order
  //     that was moved back before this existed is put right by saving "Pending" once more.
  if (status === 'pending') {
    const sellerIds = [...new Set(order.items.map((i) => i.seller?.toString()).filter(Boolean))];
    for (const sId of sellerIds) {
      await releaseSellerOrderCancelled(req.app, sId, order, { reason: 'pending' });
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
    if (reviving) await reinstateOrderStock(order, by);
    await settleDeliveredStock(order);
    if (order.paymentMethod === 'cod' && order.paymentStatus !== 'paid') {
      order.paymentStatus = 'paid';
      order.payment = { ...(order.payment?.toObject?.() || order.payment || {}), status: 'paid', paidAt: new Date() };
      notify(req.app, { type: 'payment', title: 'Payment received (COD)', body: `${order.orderNumber} — $${order.total}`, link: `/admin/orders/${order._id}` });
    }
  }

  // 4. Brought back to any other step: take its items off the shelf again
  if (reviving && status !== 'delivered') await reinstateOrderStock(order, by);
  } catch (moneyErr) {
    return res.status(400).json({ message: `Order status was not changed. ${String(moneyErr.message || moneyErr).replace('you must deposit', 'the seller must deposit').replace('your merchant wallet', 'the merchant wallet')}` });
  }

  // Update itemStatus on all items to match parent status
  order.items.forEach((it) => {
    it.itemStatus = status;
  });

  // back to waiting: the seller gets a fresh warning / deadline from now (48h Basic, 72h Diamond)
  if (status === 'pending' && prev !== 'pending') {
    order.pendingSince = new Date();
    order.warning24hSent = false;
    order.penalty48hApplied = false;
    order.warnedSellers = [];
    order.penalizedSellers = [];
  }

  order.status = status;
  if (['pending', 'cancelled', 'refunded', 'delivered'].includes(status)) {
    order.nextStatus = null;
    order.nextStatusAt = null;
  } else if (['confirmed', 'processing', 'packed', 'out_from_warehouse', 'delivery_warehouse', 'shipped', 'out_for_delivery'].includes(status)) {
    scheduleNextOrderStep(order);
  }
  order.statusHistory.push({ status, note: note || '', by });
  await order.save();
  // a refunded (delivered) order no longer counts toward the seller's running targets
  if (status === 'refunded' && prev !== 'refunded') await undoTargetProgressForOrder(req.app, order);
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
    io.to(adminRoom('orders')).emit('order:update', order);
    io.to(adminRoom('orders')).emit('order:status_update', { orderId: order._id, orderNumber: order.orderNumber, status: order.status, order });
    for (const sId of sellerIds) {
      io.to(`seller:${sId}`).emit('order:update', sellerOrderPing(order));
      io.to(`seller:${sId}`).emit('seller:status_update', { order: sellerOrderPing(order) });
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

router.patch('/:id/status', authSellerOrAdmin, blockWhenFrozen('confirming or processing orders'), orderStatusHandler);
router.put('/:id/status', authSellerOrAdmin, blockWhenFrozen('confirming or processing orders'), orderStatusHandler);
router.post('/:id/status', authSellerOrAdmin, blockWhenFrozen('confirming or processing orders'), orderStatusHandler);

router.patch('/:id/payment', authAdmin('orders'), async (req, res) => {
  const { paymentStatus } = req.body || {};
  if (!PAYMENT_STATUSES.includes(paymentStatus)) return res.status(400).json({ message: 'Invalid payment status' });
  if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) return res.status(404).json({ message: 'Order not found' });
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  order.paymentStatus = paymentStatus;
  if (paymentStatus === 'paid') {
    order.payment = { ...(order.payment?.toObject?.() || order.payment || {}), status: 'paid', paidAt: new Date() };
    notify(req.app, { type: 'payment', title: 'Payment received', body: `${order.orderNumber} — $${order.total} (${order.paymentMethod})`, link: `/admin/orders/${order._id}` });
  }
  await order.save();
  await audit(req, 'payment_updated', 'order', order._id, { orderNumber: order.orderNumber, paymentStatus });
  res.json(order);
});

export { restockOrder };
export default router;
