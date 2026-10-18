import express from 'express';
import mongoose from 'mongoose';
import { blockWhenFrozen } from './helpers.js';
import Refund from '../../models/Refund.js';
import Order from '../../models/Order.js';
import Seller from '../../models/Seller.js';
import { authSeller } from '../../middleware/auth.js';
import { maskName } from '../../utils/orderPrivacy.js';
import { notify } from '../../utils/notify.js';
import { toAdmins } from '../../utils/realtime.js';

const router = express.Router();

const itemValue = (it) => (Number(it.price) || 0) * (Number(it.qty) || 1);
const ownedBy = (it, sellerId) => !!it.seller && String(it.seller._id || it.seller) === String(sellerId);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Which refunds belong to a store.
 * Refunds made from the shop (customer request) or by an admin were saved WITHOUT a `seller`,
 * so a store only ever saw the few that had it — real requests never showed up here. A refund
 * belongs to the store when it carries the store's id OR its order has the store's items.
 */
export async function refundFilterFor(sellerId) {
  const id = mongoose.Types.ObjectId.isValid(String(sellerId)) ? new mongoose.Types.ObjectId(String(sellerId)) : sellerId;
  const orderIds = await Order.find({ refundId: { $ne: null }, $or: [{ 'items.seller': id }, { seller: id }] }).distinct('_id');
  return { $or: [{ seller: id }, { order: { $in: orderIds } }] };
}

// the store's own lines of an order, and what they are worth to the store
function ownShare(order, sellerId) {
  if (!order || !Array.isArray(order.items)) return null;
  let mine = order.items.filter((it) => ownedBy(it, sellerId));
  // a single-store order whose lines carry no store id yet: the order's own seller decides
  if (!mine.length && order.seller && String(order.seller) === String(sellerId)) mine = order.items;
  const value = mine.reduce((s, it) => s + itemValue(it), 0);
  const profit = mine.reduce((s, it) => s + (itemValue(it) * (Number(it.profitRate) || 20)) / 100, 0);
  const others = order.items.some((it) => it.seller && !ownedBy(it, sellerId));
  return {
    items: mine.map((it) => ({
      name: it.name,
      image: it.image,
      size: it.size || '',
      variant: it.variant || '',
      price: Number(it.price) || 0,
      qty: Number(it.qty) || 1,
      itemStatus: it.itemStatus || '',
    })),
    value: round2(value),
    profit: round2(profit),
    paidOut: mine.length > 0 && mine.every((it) => it.payoutSettled),
    locked: mine.some((it) => it.processingLocked && !it.payoutSettled),
    shared: others, // another store has items in the same order
  };
}

// the latest decision a store took on this refund (from the timeline)
function storeDecision(r) {
  const t = [...(r.timeline || [])].reverse().find((x) => String(x.by || '').startsWith('Store'));
  return t ? { status: t.status, note: t.note || '', at: t.at } : null;
}

// GET /api/sellers/refunds
router.get('/refunds', authSeller, async (req, res) => {
  try {
    const sellerId = String(req.seller.id);
    const refunds = await Refund.find(await refundFilterFor(sellerId))
      .populate('order', 'orderNumber status createdAt items seller paymentMethod shippingAddress.city shippingAddress.country')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    // only what the store needs. The customer's name is masked; phone, email and address never
    // leave the server for a store (the raw `customer` block used to be sent in full).
    res.json(
      refunds.map((r) => {
        const o = r.order && typeof r.order === 'object' ? r.order : null;
        const share = ownShare(o, sellerId);
        return {
          _id: r._id,
          orderNumber: r.orderNumber || o?.orderNumber || '',
          orderId: o?._id || r.order,
          orderStatus: o?.status || '',
          orderDate: o?.createdAt || null,
          paymentMethod: o?.paymentMethod || '',
          city: [o?.shippingAddress?.city, o?.shippingAddress?.country].filter(Boolean).join(', '),
          customerName: maskName(r.customer?.name),
          reason: r.reason || '',
          status: r.status,
          requestedBy: r.requestedBy || 'customer',
          paymentReturned: !!r.paymentReturned,
          refundAmount: round2(r.amount),
          share,
          decision: storeDecision(r),
          timeline: (r.timeline || []).map((t) => ({
            status: t.status,
            note: t.note || '',
            at: t.at,
            // admin names stay with the admins
            by: String(t.by || '').startsWith('Store') ? 'You' : String(t.by || '').toLowerCase() === 'customer' ? 'Customer' : 'Bazario team',
          })),
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        };
      })
    );
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/refunds/:id/action { action: 'approve' | 'reject', reason }
router.post('/refunds/:id/action', authSeller, blockWhenFrozen('deciding refunds'), async (req, res) => {
  try {
    const sellerId = String(req.seller.id);
    const { action } = req.body || {};
    const reason = String(req.body?.reason || '').trim().slice(0, 500);
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ message: 'Choose Approve or Reject.' });
    if (action === 'reject' && reason.length < 5) return res.status(400).json({ message: 'Please tell the customer why the return is rejected (at least 5 characters).' });
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Refund not found' });

    const refund = await Refund.findOne({ $and: [{ _id: req.params.id }, await refundFilterFor(sellerId)] });
    if (!refund) return res.status(404).json({ message: 'Refund not found' });

    // a decided / paid refund can no longer be changed by the store (an already refunded one
    // used to flip back to "rejected" or "approved" with one click)
    if (refund.status !== 'requested') {
      return res.status(409).json({ message: `This request is already ${refund.status}. Only the Bazario team can change it now.` });
    }

    if (refund.requestedBy === 'admin') {
      return res.status(409).json({ message: 'The Bazario team opened this refund, so they decide it. You can follow its progress here.' });
    }

    const order = await Order.findById(refund.order).select('items seller').lean();
    const share = ownShare(order, sellerId);
    if (share?.shared) {
      return res.status(409).json({ message: 'This order has items from other stores too, so the Bazario team decides this return.' });
    }

    const seller = await Seller.findById(sellerId).select('storeName').lean();
    const storeName = seller?.storeName || 'Store';
    const status = action === 'approve' ? 'approved' : 'rejected';
    const note = reason || (action === 'approve' ? 'Return accepted by the store' : '');

    // atomic: two clicks (or two tabs) cannot decide the same request twice
    const updated = await Refund.findOneAndUpdate(
      { _id: refund._id, status: 'requested' },
      {
        $set: { status, processedBy: `Store: ${storeName}`, notes: (refund.notes ? refund.notes + '\n' : '') + `${status === 'approved' ? 'Approved' : 'Rejected'} by store: ${note}` },
        $push: { timeline: { status, note, by: `Store: ${storeName}`, at: new Date() } },
      },
      { new: true }
    );
    if (!updated) return res.status(409).json({ message: 'This request was just updated. Refresh to see its latest status.' });

    // the admins handle the payment, so they must know the store's answer
    notify(req.app, {
      type: 'refund',
      title: `Return ${status} by store`,
      body: `${updated.orderNumber} — ${storeName}${note ? `: ${note.slice(0, 120)}` : ''}`,
      link: '/admin/refunds',
    });
    toAdmins('refunds', 'refunds:changed', { refundId: String(updated._id) });

    res.json({ ok: true, _id: updated._id, status: updated.status });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
