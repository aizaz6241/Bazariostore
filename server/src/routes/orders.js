import { Router } from 'express';
import Order, { STATUSES } from '../models/Order.js';
import Product from '../models/Product.js';
import Discount from '../models/Discount.js';
import Refund from '../models/Refund.js';
import { Conversation } from '../models/Chat.js';
import { StockHistory } from '../models/StockHistory.js';
import { authAdmin, authUser, softUser } from '../middleware/auth.js';
import { quoteCart } from '../services/discounts.js';
import { initiatePayment, getPaymentConfig } from '../services/payments.js';
import { audit } from '../utils/audit.js';
import { notify } from '../utils/notify.js';

const router = Router();

function makeOrderNumber() {
  const d = new Date();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `NG-${d.getFullYear().toString().slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${rand}`;
}

async function stockAlerts(app, product) {
  if (product.stock <= 0) {
    notify(app, { type: 'stock', title: 'Out of stock', body: `${product.name} is now OUT OF STOCK`, link: '/admin/inventory' });
  } else if (product.stock <= (product.lowStockThreshold || 5)) {
    notify(app, { type: 'stock', title: 'Low stock alert', body: `${product.name} — only ${product.stock} left`, link: '/admin/inventory' });
  }
}

// POST /api/orders/quote — live totals for checkout (discounts auto-apply here)
router.post('/quote', async (req, res) => {
  try {
    const { items, couponCode, shippingMethodId } = req.body || {};
    if (!items?.length) return res.status(400).json({ message: 'Cart is empty' });
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
router.post('/', softUser, async (req, res) => {
  try {
    const { items, contact, shippingAddress, shippingMethodId, couponCode, paymentMethod, walletNumber, guestId } = req.body || {};
    if (!items?.length) return res.status(400).json({ message: 'Cart is empty' });
    if (!contact?.email || !contact?.phone) return res.status(400).json({ message: 'Email and phone are required' });
    const addr = shippingAddress || {};
    for (const f of ['fullName', 'street', 'city', 'state', 'postalCode']) {
      if (!addr[f]?.trim()) return res.status(400).json({ message: 'Please fill all required shipping fields' });
    }

    const payCfg = await getPaymentConfig();
    const method = paymentMethod || 'cod';
    if (!payCfg[method]?.enabled) return res.status(400).json({ message: 'Selected payment method is not available' });

    const q = await quoteCart({ items, couponCode, shippingMethodId });
    if (couponCode && q.couponError) return res.status(400).json({ message: q.couponError });

    // stock check
    for (const l of q.lines) {
      if (l.product.stock < l.qty) return res.status(400).json({ message: `"${l.product.name}" ka sirf ${Math.max(0, l.product.stock)} stock reh gaya hai` });
    }

    const order = await Order.create({
      orderNumber: makeOrderNumber(),
      user: req.user?.id || null,
      guestId: guestId || '',
      items: q.lines.map((l) => ({
        product: l.product._id,
        name: l.product.name,
        image: l.product.image,
        size: l.size,
        variant: l.variant,
        price: l.price,
        qty: l.qty,
      })),
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

    // payment initiation (structure ready; live APIs plug into services/payments.js)
    const pay = await initiatePayment(method, order, { walletNumber });
    order.payment = { provider: pay.provider, reference: pay.reference, status: pay.status, message: pay.message, walletNumber: pay.walletNumber || '' };
    if (pay.status === 'awaiting_payment') order.paymentStatus = 'awaiting_payment';
    await order.save();

    // stock: reserve + decrement
    for (const l of q.lines) {
      const p = await Product.findById(l.product._id);
      p.stock -= l.qty;
      p.reservedStock += l.qty;
      await p.save();
      await StockHistory.create({ product: p._id, productName: p.name, change: -l.qty, stockAfter: p.stock, reason: 'order', note: order.orderNumber });
      await stockAlerts(req.app, p);
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

    notify(req.app, { type: 'order', title: 'New order received', body: `${order.orderNumber} — ${addr.fullName} (${addr.city}) — Rs.${order.total}`, link: `/admin/orders/${order._id}` });
    req.app.get('io')?.to('admins').emit('order:new', { _id: order._id, orderNumber: order.orderNumber, total: order.total, name: addr.fullName, city: addr.city });

    res.status(201).json(order);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/orders/track?phone= | ?orderNumber=&phone=
router.get('/track', async (req, res) => {
  const { orderNumber, phone } = req.query;
  if (!phone) return res.status(400).json({ message: 'Phone number is required' });
  const digits = String(phone).replace(/\D/g, '').slice(-10);
  if (digits.length < 9) return res.status(400).json({ message: 'Enter a valid phone number' });

  if (orderNumber) {
    const order = await Order.findOne({ orderNumber: orderNumber.trim().toUpperCase() });
    if (!order || String(order.contact?.phone || '').replace(/\D/g, '').slice(-10) !== digits) {
      return res.status(404).json({ message: 'No order found with that order number and phone' });
    }
    return res.json(order);
  }

  // phone-only: list all orders linked to this phone
  const all = await Order.find().sort({ createdAt: -1 }).limit(500);
  const mine = all.filter((o) => String(o.contact?.phone || '').replace(/\D/g, '').slice(-10) === digits).slice(0, 25);
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
  const { status, q } = req.query;
  const filter = {};
  if (status && STATUSES.includes(status)) filter.status = status;
  if (q?.trim()) {
    const rx = { $regex: q.trim(), $options: 'i' };
    filter.$or = [{ orderNumber: rx }, { 'contact.phone': rx }, { 'contact.email': rx }, { 'shippingAddress.fullName': rx }];
  }
  const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(300);
  res.json(orders);
});

router.get('/:id', authAdmin('orders'), async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  res.json(order);
});

async function restockOrder(order, reason, by) {
  if (order.stockRestored) return;
  for (const it of order.items) {
    const p = await Product.findById(it.product);
    if (!p) continue;
    p.stock += it.qty;
    p.reservedStock = Math.max(0, p.reservedStock - it.qty);
    await p.save();
    await StockHistory.create({ product: p._id, productName: p.name, change: it.qty, stockAfter: p.stock, reason, note: order.orderNumber, by });
  }
  order.stockRestored = true;
}

router.patch('/:id/status', authAdmin('orders'), async (req, res) => {
  const { status, note } = req.body || {};
  if (!STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status' });
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  const prev = order.status;

  if (status === 'cancelled' && prev !== 'cancelled') {
    await restockOrder(order, 'order_cancelled', req.admin.name);
  }
  if (status === 'delivered' && prev !== 'delivered') {
    for (const it of order.items) {
      await Product.updateOne({ _id: it.product }, { $inc: { reservedStock: -it.qty, sold: it.qty } });
    }
    if (order.paymentMethod === 'cod' && order.paymentStatus !== 'paid') {
      order.paymentStatus = 'paid';
      order.payment = { ...(order.payment?.toObject?.() || order.payment || {}), status: 'paid', paidAt: new Date() };
      notify(req.app, { type: 'payment', title: 'Payment received (COD)', body: `${order.orderNumber} — Rs.${order.total}`, link: `/admin/orders/${order._id}` });
    }
  }

  order.status = status;
  order.statusHistory.push({ status, note: note || '', by: req.admin.name });
  await order.save();
  await audit(req, 'order_updated', 'order', order._id, { orderNumber: order.orderNumber, from: prev, to: status, note: note || '' });
  res.json(order);
});

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
