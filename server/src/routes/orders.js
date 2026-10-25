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
import { confirmHoursFor, warnHoursFor, tierOf } from '../utils/sellerTier.js';

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

// Status groups used by the Orders page (the seller-wise table): one click shows that group
const STATUS_GROUPS = {
  warehouse: ['processing', 'packed', 'out_from_warehouse', 'delivery_warehouse', 'shipped'],
  problem: ['delivery_failed', 'returned_to_warehouse'],
};
const CLOSED_STATUSES = ['delivered', 'cancelled', 'refunded'];
const LATE_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // not delivered 7 days after the order was placed
const STUCK_AFTER_MS = 60 * 60 * 1000; // the next automatic step is more than an hour overdue

/**
 * Test / demo stores (Test account or Previous-store account), the same group the
 * "Orders by store" board treats as test. Cached 30 s (the flags change rarely).
 */
let testIdsCache = { at: 0, ids: [] };
async function testSellerIds() {
  if (Date.now() - testIdsCache.at < 30000) return testIdsCache.ids;
  const ids = await Seller.find({ $or: [{ isTestAccount: true }, { isPreviousStoreSeller: true }] }).distinct('_id');
  testIdsCache = { at: Date.now(), ids };
  return ids;
}
/** accounts=real → real client stores only · accounts=test → test stores only · else all. */
async function accountsFilter(accounts) {
  if (accounts !== 'real' && accounts !== 'test') return null;
  const ids = await testSellerIds();
  if (accounts === 'real') return ids.length ? { seller: { $nin: ids }, 'items.seller': { $nin: ids } } : null;
  return ids.length ? { $or: [{ seller: { $in: ids } }, { 'items.seller': { $in: ids } }] } : { _id: null };
}

/**
 * For every store that still has to confirm items of this order: since when it waits, when the
 * warning goes (Basic 24h / Diamond 48h) and when the deadline / freeze is (Basic 48h / Diamond 72h).
 * Same rules as the penalty job (routes/sellers/orders.routes.js + utils/sellerTier.js).
 */
function confirmWindowsFor(order, sellersById) {
  if (CLOSED_STATUSES.includes(order.status)) return [];
  const waiting = new Set();
  for (const it of order.items || []) {
    if (it.itemStatus && it.itemStatus !== 'pending') continue;
    const sid = String(it.seller?._id || it.seller || order.seller?._id || order.seller || '');
    if (sid) waiting.add(sid);
  }
  if (!waiting.size) return [];
  const since = new Date(order.pendingSince || order.createdAt);
  const warned = new Set((order.warnedSellers || []).map(String));
  const penalized = new Set((order.penalizedSellers || []).map(String));
  return [...waiting].map((sid) => {
    const s = sellersById.get(sid);
    const confirmH = confirmHoursFor(s);
    const warnH = warnHoursFor(s);
    return {
      seller: sid,
      storeName: s?.storeName || 'Store',
      tier: tierOf(s).key,
      suspended: s?.status === 'suspended',
      since,
      warnAt: new Date(since.getTime() + warnH * 3600000),
      deadlineAt: new Date(since.getTime() + confirmH * 3600000),
      warned: warned.has(sid) || Boolean(order.warning24hSent),
      penalized: penalized.has(sid) || Boolean(order.penalty48hApplied),
    };
  });
}

// GET /api/orders?status=&sellerId=&q=&late=1&stuck=1
// status: one status, a group (warehouse / problem) or a comma list
// paged=1&page=N&limit=50 → { orders, page, limit, total, pages, hasMore } (the admin Orders list).
// Without paged=1 the old answer (array of the newest 300) is kept for any other caller.
router.get('/', authAdmin('orders'), async (req, res) => {
  const paged = req.query.paged === '1';
  const pageSize = Math.min(100, Math.max(10, parseInt(req.query.limit, 10) || 50));
  const page = Math.min(100000, Math.max(1, parseInt(req.query.page, 10) || 1));
  const emptyPage = { orders: [], page: 1, limit: pageSize, total: 0, pages: 1, hasMore: false };
  try {
    const { sellerId } = req.query;
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
    const late = req.query.late === '1';
    const stuck = req.query.stuck === '1';
    const rawStatus = typeof req.query.status === 'string' ? req.query.status : '';
    const statuses = (STATUS_GROUPS[rawStatus] || rawStatus.split(',')).map((x) => x.trim()).filter((x) => STATUSES.includes(x));
    const and = [];
    if (statuses.length === 1) and.push({ status: statuses[0] });
    else if (statuses.length > 1) and.push({ status: { $in: statuses } });
    if (sellerId) {
      // an unknown id matches nothing (it used to crash the request and the screen waited 30 s)
      if (!mongoose.Types.ObjectId.isValid(String(sellerId))) return res.json(paged ? emptyPage : []);
      and.push({ $or: [{ seller: sellerId }, { 'items.seller': sellerId }] });
    }
    if (late || stuck) and.push({ status: { $nin: CLOSED_STATUSES } });
    // Real clients / Test accounts / All (a chosen store is shown whatever this says)
    if (!sellerId) {
      const acc = await accountsFilter(req.query.accounts);
      if (acc) and.push(acc);
    }
    if (req.query.clients === '1') {
      // real client stores only (the "Orders by store" totals): no test / previous-store / inactive accounts
      const testIds = (await Seller.find({ $or: [{ isTestAccount: true }, { isPreviousStoreSeller: true }, { isInactive: true }] }).select('_id').lean()).map((x) => x._id);
      if (testIds.length) and.push({ seller: { $nin: testIds }, 'items.seller': { $nin: testIds } });
    }
    if (late) and.push({ createdAt: { $lt: new Date(Date.now() - LATE_AFTER_MS) } });
    if (stuck) and.push({ $or: [{ nextStatusAt: { $ne: null, $lt: new Date(Date.now() - STUCK_AFTER_MS) } }, { 'autoIssue.reason': { $exists: true } }] });
    if (q) {
      const num = q.replace(/^#/, '').toUpperCase();
      if (/^NG-\d/.test(num)) {
        // an order number: a "starts with" match uses the orderNumber index (fast with millions)
        and.push({ orderNumber: { $regex: '^' + escapeRx(num) } });
      } else {
        // typed text is matched literally: "(" or "+" in a search no longer breaks the request
        const rx = { $regex: escapeRx(q), $options: 'i' };
        and.push({ $or: [{ orderNumber: rx }, { 'contact.phone': rx }, { 'contact.email': rx }, { 'shippingAddress.fullName': rx }, { 'items.sellerName': rx }] });
      }
    }
    const filter = and.length ? { $and: and } : {};
    // late / stuck / waiting for confirmation: the oldest first (closest to / past their deadline)
    const pendingOnly = statuses.length === 1 && statuses[0] === 'pending';
    const sort = { createdAt: late || stuck || pendingOnly ? 1 : -1 };

    if (!paged) {
      const orders = await Order.find(filter)
        .populate('seller', 'storeName ownerName email phone')
        .populate('items.product', 'name price image')
        .sort(sort)
        .limit(300);
      return res.json(orders);
    }

    const [docs, total] = await Promise.all([
      Order.find(filter)
        .populate('seller', 'storeName ownerName email phone')
        .populate('items.product', 'name price image')
        .sort(sort)
        .skip((page - 1) * pageSize)
        .limit(pageSize + 1)
        .lean(),
      // the exact total; with millions of orders and a slow filter it may give up (then: null)
      (and.length ? Order.countDocuments(filter).maxTimeMS(4000) : Order.estimatedDocumentCount()).catch(() => null),
    ]);
    const hasMore = docs.length > pageSize;
    const orders = hasMore ? docs.slice(0, pageSize) : docs;

    // confirmation countdown for orders still waiting for a store
    const waitingIds = new Set();
    for (const o of orders) {
      if (CLOSED_STATUSES.includes(o.status)) continue;
      for (const it of o.items || []) {
        if (it.itemStatus && it.itemStatus !== 'pending') continue;
        const sid = String(it.seller?._id || it.seller || o.seller?._id || o.seller || '');
        if (mongoose.Types.ObjectId.isValid(sid)) waitingIds.add(sid);
      }
    }
    const sellersById = new Map();
    if (waitingIds.size) {
      const list = await Seller.find({ _id: { $in: [...waitingIds] } }).select('storeName tier status').lean();
      list.forEach((s) => sellersById.set(String(s._id), s));
    }
    for (const o of orders) {
      const w = confirmWindowsFor(o, sellersById);
      if (w.length) o.confirmWindow = w;
    }

    const pages = total != null ? Math.max(1, Math.ceil(total / pageSize)) : null;
    res.json({ orders, page, limit: pageSize, total, pages, hasMore, sort: sort.createdAt === 1 ? 'oldest' : 'newest' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/orders/counts?sellerId=
// Order count per status, split into real client stores and test stores, in ONE pass over the
// orders (status index). For the status tabs and the Real clients / Test accounts switch.
// An order with any test-store item counts as test (same rule as the list filter). Cached 10 s.
const countsCache = new Map();
router.get('/counts', authAdmin('orders'), async (req, res) => {
  try {
    const sellerId = req.query.sellerId && mongoose.Types.ObjectId.isValid(String(req.query.sellerId)) ? String(req.query.sellerId) : '';
    const key = sellerId || '-';
    const hit = countsCache.get(key);
    if (hit && Date.now() - hit.at < 10000) return res.json(hit.data);
    const testIds = await testSellerIds();
    const match = sellerId ? { $or: [{ seller: new mongoose.Types.ObjectId(sellerId) }, { 'items.seller': new mongoose.Types.ObjectId(sellerId) }] } : {};
    const rows = await Order.aggregate([
      { $match: match },
      {
        $project: {
          status: 1,
          t: {
            $or: [
              { $in: [{ $ifNull: ['$seller', null] }, testIds] },
              { $gt: [{ $size: { $setIntersection: [{ $ifNull: ['$items.seller', []] }, testIds] } }, 0] },
            ],
          },
        },
      },
      { $group: { _id: { s: '$status', t: '$t' }, n: { $sum: 1 } } },
    ]);
    const data = { real: {}, test: {}, all: {}, totals: { real: 0, test: 0, all: 0 } };
    for (const r of rows) {
      const st = r._id.s || 'pending';
      const side = r._id.t ? 'test' : 'real';
      data[side][st] = (data[side][st] || 0) + r.n;
      data.all[st] = (data.all[st] || 0) + r.n;
      data.totals[side] += r.n;
      data.totals.all += r.n;
    }
    countsCache.set(key, { at: Date.now(), data });
    if (countsCache.size > 200) countsCache.delete(countsCache.keys().next().value);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/orders/analytics/stores?days=30
// Per store, right now: orders pending / confirmed / in the warehouse / out for delivery /
// delivery problem, delivered (placed in the last `days` days), late (not delivered 7 days after
// the order) and stuck (the automatic step is overdue or could not run). Multi-store orders
// count for each store. Test / previous-store accounts are marked (left out of the totals).
router.get('/analytics/stores', authAdmin('orders'), async (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
    const now = Date.now();
    const open = STATUSES.filter((x) => !CLOSED_STATUSES.includes(x));
    const lateBefore = new Date(now - LATE_AFTER_MS);
    const stuckBefore = new Date(now - STUCK_AFTER_MS);
    const notDelivered = { $ne: ['$status', 'delivered'] };
    const sellers = await Seller.find({ status: { $ne: 'pending_approval' } }).select('storeName ownerName tier status isTestAccount isPreviousStoreSeller isInactive').lean();
    // inactive client stores (Sellers page → Active / Inactive) are left out like test accounts
    const clientIds = sellers.filter((x) => !x.isTestAccount && !x.isPreviousStoreSeller && !x.isInactive).map((x) => x._id);
    const late = { $sum: { $cond: [{ $and: [notDelivered, { $lt: ['$createdAt', lateBefore] }] }, 1, 0] } };
    const stuck = {
      $sum: {
        $cond: [
          { $and: [notDelivered, { $or: [{ $and: [{ $ne: ['$nextStatusAt', null] }, { $lt: ['$nextStatusAt', stuckBefore] }] }, { $ne: ['$issue', null] }] }] },
          1,
          0,
        ],
      },
    };
    const [facet] = await Order.aggregate([
        { $match: { $or: [{ status: { $in: open } }, { status: 'delivered', createdAt: { $gte: new Date(now - days * 86400000) } }] } },
        {
          $project: {
            status: 1,
            createdAt: 1,
            nextStatusAt: 1,
            issue: { $ifNull: ['$autoIssue.reason', null] },
            sellers: { $setUnion: [{ $map: { input: { $ifNull: ['$items', []] }, as: 'i', in: { $ifNull: ['$$i.seller', '$seller'] } } }, []] },
          },
        },
        {
          $facet: {
            // per store (an order with two stores counts for both)
            perStore: [
              { $unwind: '$sellers' },
              { $match: { sellers: { $ne: null } } },
              { $group: { _id: { s: '$sellers', st: '$status' }, n: { $sum: 1 }, late, stuck, oldest: { $min: { $cond: [notDelivered, '$createdAt', null] } } } },
            ],
            // the totals: each order once, real client stores only
            totals: [
              { $match: { sellers: { $in: clientIds } } },
              { $group: { _id: '$status', n: { $sum: 1 }, late, stuck, lateSellers: { $addToSet: { $cond: [{ $and: [notDelivered, { $lt: ['$createdAt', lateBefore] }] }, '$sellers', null] } } } },
            ],
          },
        },
      ]);
    const rows = facet?.perStore || [];

    const info = new Map(sellers.map((x) => [String(x._id), x]));
    const group = (st) => (st === 'pending' ? 'pending' : st === 'confirmed' ? 'confirmed' : STATUS_GROUPS.warehouse.includes(st) ? 'warehouse' : st === 'out_for_delivery' ? 'ofd' : STATUS_GROUPS.problem.includes(st) ? 'problem' : st === 'delivered' ? 'delivered' : 'other');
    const blank = () => ({ pending: 0, confirmed: 0, warehouse: 0, ofd: 0, problem: 0, delivered: 0, late: 0, stuck: 0, open: 0 });
    const stores = new Map();
    for (const r of rows) {
      const sid = String(r._id.s);
      const s = info.get(sid);
      let row = stores.get(sid);
      if (!row) {
        row = { _id: sid, storeName: s?.storeName || 'Removed store', ownerName: s?.ownerName || '', tier: s?.tier || 'basic', storeStatus: s?.status || '', isTest: Boolean(s?.isTestAccount || s?.isPreviousStoreSeller || !s), isInactive: Boolean(s?.isInactive), oldestOpenAt: null, ...blank() };
        stores.set(sid, row);
      }
      const g = group(r._id.st);
      if (g !== 'other') row[g] += r.n;
      if (r._id.st !== 'delivered') row.open += r.n;
      row.late += r.late;
      row.stuck += r.stuck;
      if (r.oldest && (!row.oldestOpenAt || r.oldest < row.oldestOpenAt)) row.oldestOpenAt = r.oldest;
    }
    const list = [...stores.values()].sort((a, b) => b.late - a.late || b.stuck - a.stuck || b.open - a.open || b.delivered - a.delivered);
    const totals = blank();
    const clientSet = new Set(clientIds.map(String));
    const lateStoreIds = new Set();
    for (const r of facet?.totals || []) {
      const g = group(r._id);
      if (g !== 'other') totals[g] += r.n;
      if (r._id !== 'delivered') totals.open += r.n;
      totals.late += r.late;
      totals.stuck += r.stuck;
      (r.lateSellers || []).flat().forEach((sid) => sid && clientSet.has(String(sid)) && lateStoreIds.add(String(sid)));
    }
    // what the board leaves out because the store is marked inactive (so an order there isn't missed)
    const hidden = { stores: 0, open: 0, late: 0 };
    for (const r of list) {
      if (r.isTest || !r.isInactive) continue;
      hidden.stores += 1;
      hidden.open += r.open;
      hidden.late += r.late;
    }
    res.json({ days, lateDays: 7, totals: { ...totals, lateStores: lateStoreIds.size }, hiddenInactive: hidden, stores: list });
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
const FULFILLMENT = ['confirmed', 'processing', 'packed', 'out_from_warehouse', 'delivery_warehouse', 'shipped', 'out_for_delivery', 'delivery_failed', 'returned_to_warehouse'];

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
    const sellers = await Seller.find(sellerQuery).select('storeName ownerName status isTestAccount isPreviousStoreSeller isInactive').lean();
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
    // the leaderboard lists real client stores only: no test / previous-store / inactive accounts
    // (whatever the "All stores / Real clients" switch says — that one is for the charts)
    const onBoard = (r) => {
      if (!r._id) return true; // Bazario Direct (orders without a store)
      const s = sellerMap.get(r._id);
      return Boolean(s && !s.isTestAccount && !s.isPreviousStoreSeller && !s.isInactive);
    };
    const leaderboard = [...perSeller.values()]
      .filter(onBoard)
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
        activeSellers: perSeller.size,
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
  const FORWARD = ['confirmed', 'processing', 'packed', 'out_from_warehouse', 'delivery_warehouse', 'shipped', 'out_for_delivery', 'delivery_failed', 'returned_to_warehouse'];
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
  // the automatic lifecycle continues from the status set here (India time, see
  // services/orderProgressionService.js): a failed delivery goes back to the warehouse that
  // evening and out for delivery again the next morning. Pending / delivered / cancelled /
  // refunded never move by themselves.
  if (['pending', 'cancelled', 'refunded', 'delivered'].includes(status)) {
    order.nextStatus = null;
    order.nextStatusAt = null;
  } else if (['confirmed', 'processing', 'packed', 'out_from_warehouse', 'delivery_warehouse', 'shipped', 'out_for_delivery', 'delivery_failed', 'returned_to_warehouse'].includes(status)) {
    scheduleNextOrderStep(order);
  }
  // a person moved it: any earlier "could not move" note is old news
  order.autoIssue = undefined;
  order.autoRetryAt = undefined;
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
    const NICE = { delivery_failed: 'NO RESPONSE FROM CUSTOMER', returned_to_warehouse: 'RETURNED TO WAREHOUSE' };
    const nice = (st) => NICE[st] || String(st).replace(/_/g, ' ').toUpperCase();
    for (const sId of sellerIds) {
      notify(req.app, {
        recipientType: 'seller',
        sellerId: sId,
        type: 'order',
        title: `📦 Order #${order.orderNumber} Status: ${nice(status)}`,
        body: `Order #${order.orderNumber} status changed from "${nice(prev)}" to "${nice(status)}".`,
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
