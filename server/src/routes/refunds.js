import { Router } from 'express';
import Refund, { REFUND_STATUSES } from '../models/Refund.js';
import Order from '../models/Order.js';
import Expense from '../models/Expense.js';
import { restockOrder } from './orders.js';
import { authAdmin } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { notify } from '../utils/notify.js';

const router = Router();

// GET /api/refunds?status= — with summary counts
router.get('/', authAdmin('refunds'), async (req, res) => {
  const filter = {};
  if (req.query.status && REFUND_STATUSES.includes(req.query.status)) filter.status = req.query.status;
  const [refunds, byStatus, refundedAgg] = await Promise.all([
    Refund.find(filter).sort({ createdAt: -1 }).limit(200),
    Refund.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Refund.aggregate([{ $match: { status: 'refunded' } }, { $group: { _id: null, amount: { $sum: '$amount' } } }]),
  ]);
  const counts = Object.fromEntries(byStatus.map((s) => [s._id, s.n]));
  res.json({
    refunds,
    summary: {
      requested: counts.requested || 0,
      approved: counts.approved || 0,
      rejected: counts.rejected || 0,
      refunded: counts.refunded || 0,
      refundedAmount: refundedAgg[0]?.amount || 0,
      pendingPayments: counts.approved || 0, // approved but payment not yet returned
    },
  });
});

router.get('/:id', authAdmin('refunds'), async (req, res) => {
  const refund = await Refund.findById(req.params.id);
  if (!refund) return res.status(404).json({ message: 'Refund not found' });
  res.json(refund);
});

// POST /api/refunds — admin creates a refund for an order
router.post('/', authAdmin('refunds'), async (req, res) => {
  const { orderId, amount, reason } = req.body || {};
  const order = await Order.findById(orderId);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  if (order.refundId) return res.status(400).json({ message: 'Is order ki refund entry pehle se mojood hai' });
  const refund = await Refund.create({
    order: order._id,
    orderNumber: order.orderNumber,
    customer: { name: order.shippingAddress?.fullName, email: order.contact?.email, phone: order.contact?.phone },
    amount: Number(amount) || order.total,
    reason: reason || '',
    status: 'requested',
    requestedBy: 'admin',
    timeline: [{ status: 'requested', note: reason || '', by: req.admin.name }],
  });
  order.refundId = refund._id;
  await order.save();
  await audit(req, 'refund_created', 'refund', refund._id, { orderNumber: order.orderNumber, amount: refund.amount });
  res.status(201).json(refund);
});

// PATCH /api/refunds/:id/status { status: approved|rejected|refunded, note }
router.patch('/:id/status', authAdmin('refunds'), async (req, res) => {
  const { status, note } = req.body || {};
  if (!['approved', 'rejected', 'refunded'].includes(status)) return res.status(400).json({ message: 'Invalid status' });
  const refund = await Refund.findById(req.params.id);
  if (!refund) return res.status(404).json({ message: 'Refund not found' });

  refund.status = status;
  refund.timeline.push({ status, note: note || '', by: req.admin.name });

  const order = await Order.findById(refund.order);
  if (status === 'refunded') {
    refund.paymentReturned = true;
    if (order) {
      order.status = 'refunded';
      order.paymentStatus = 'refunded';
      order.statusHistory.push({ status: 'refunded', note: 'Refund payment returned', by: req.admin.name });
      await restockOrder(order, 'refund_restock', req.admin.name);
      await order.save();
    }
    await Expense.create({ type: 'refund', amount: refund.amount, note: `Refund ${refund.orderNumber}`, createdBy: req.admin.name });
    notify(req.app, { type: 'refund', title: 'Refund payment returned', body: `${refund.orderNumber} — Rs.${refund.amount}`, link: '/admin/refunds' });
  }
  await refund.save();
  await audit(req, status === 'approved' ? 'refund_approved' : status === 'rejected' ? 'refund_rejected' : 'refund_paid', 'refund', refund._id, {
    orderNumber: refund.orderNumber,
    amount: refund.amount,
    note: note || '',
  });
  res.json(refund);
});

export default router;
