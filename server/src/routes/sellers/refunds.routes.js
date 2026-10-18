import express from 'express';
import { blockWhenFrozen } from './helpers.js';
import Refund from '../../models/Refund.js';
import { authSeller } from '../../middleware/auth.js';
import { sellerSafeOrder, maskName, maskPhone, maskEmail } from '../../utils/orderPrivacy.js';

const router = express.Router();

// GET /api/sellers/refunds
router.get('/refunds', authSeller, async (req, res) => {
  try {
    const refunds = await Refund.find({ seller: req.seller.id })
      .populate('order')
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 });
    // the customer's contact details stay with the admins
    res.json(
      refunds.map((r) => {
        const o = r.toObject();
        if (o.order && typeof o.order === 'object') o.order = sellerSafeOrder(o.order, (o.order.items || []).filter((it) => String(it.seller) === String(req.seller.id)));
        if (o.user && typeof o.user === 'object') o.user = { _id: o.user._id, name: maskName(o.user.name), phone: maskPhone(o.user.phone), email: maskEmail(o.user.email) };
        return o;
      })
    );
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/refunds/:id/action
router.post('/refunds/:id/action', authSeller, blockWhenFrozen('deciding refunds'), async (req, res) => {
  try {
    const { action, reason } = req.body; // 'approve' | 'reject'
    const refund = await Refund.findOne({ _id: req.params.id, seller: req.seller.id });
    if (!refund) return res.status(404).json({ message: 'Refund not found' });

    if (action === 'approve') {
      refund.status = 'approved';
      refund.processedAt = new Date();
      refund.notes = (refund.notes ? refund.notes + '\n' : '') + `Approved by seller: ${reason || 'Approved'}`;
    } else {
      refund.status = 'rejected';
      refund.processedAt = new Date();
      refund.notes = (refund.notes ? refund.notes + '\n' : '') + `Rejected by seller: ${reason || 'Rejected'}`;
    }

    await refund.save();
    res.json(refund);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
