import express from 'express';
import mongoose from 'mongoose';
import SellerCoupon from '../../models/SellerCoupon.js';
import { authSeller } from '../../middleware/auth.js';
import { blockWhenFrozen } from './helpers.js';

const router = express.Router();

const CODE_RX = /^[A-Z0-9]{3,20}$/;

/**
 * Checks and cleans what a store sends for a coupon. Only these fields can ever be written —
 * the old edit route saved the whole request body, so a store could set its own `usedCount`,
 * or even `seller` (moving the coupon to another store).
 * `current` is the coupon being edited (for "limit cannot go below uses so far").
 */
function cleanCoupon(body, current = null) {
  const b = body || {};
  const out = {};
  const has = (k) => b[k] !== undefined;

  if (!current || has('code')) {
    const code = String(b.code || '').toUpperCase().replace(/\s+/g, '');
    if (!CODE_RX.test(code)) return { error: 'Coupon code must be 3–20 letters or numbers (no spaces or symbols).' };
    out.code = code;
  }
  const type = has('type') ? b.type : current?.type;
  if (!current || has('type')) {
    if (!['percentage', 'flat'].includes(type)) return { error: 'Choose a discount type.' };
    out.type = type;
  }
  if (!current || has('value') || has('type')) {
    const value = Number(has('value') ? b.value : current?.value);
    if (!Number.isFinite(value) || value <= 0) return { error: 'Enter a discount value above 0.' };
    if (type === 'percentage' && (value < 1 || value > 90)) return { error: 'A percentage discount must be between 1% and 90%.' };
    if (type === 'flat' && value > 100000) return { error: 'This discount amount is too large.' };
    out.value = Math.round(value * 100) / 100;
  }
  if (!current || has('minOrder')) {
    const min = b.minOrder === '' || b.minOrder == null ? 0 : Number(b.minOrder);
    if (!Number.isFinite(min) || min < 0) return { error: 'Minimum order must be 0 or more.' };
    out.minOrder = Math.round(min * 100) / 100;
  }
  const flatValue = out.value ?? current?.value;
  const minOrder = out.minOrder ?? current?.minOrder ?? 0;
  if (type === 'flat' && minOrder > 0 && flatValue >= minOrder) {
    return { error: 'A fixed discount must be smaller than the minimum order amount.' };
  }
  if (!current || has('maxUses')) {
    if (b.maxUses === '' || b.maxUses == null) out.maxUses = null;
    else {
      const max = Number(b.maxUses);
      if (!Number.isInteger(max) || max < 1) return { error: 'Usage limit must be a whole number (1 or more), or empty for no limit.' };
      if (current && max < (current.usedCount || 0)) return { error: `This coupon was already used ${current.usedCount} times — the limit cannot be lower than that.` };
      out.maxUses = max;
    }
  }
  if (!current || has('expiresAt')) {
    if (!b.expiresAt) out.expiresAt = null;
    else {
      const d = new Date(b.expiresAt);
      if (Number.isNaN(d.getTime())) return { error: 'Enter a valid expiry date.' };
      // a date picked in the form means "valid through that whole day"
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(b.expiresAt))) d.setUTCHours(23, 59, 59, 999);
      if (d.getTime() < Date.now()) return { error: 'The expiry date is already in the past.' };
      out.expiresAt = d;
    }
  }
  if (has('active')) out.active = Boolean(b.active);
  else if (!current) out.active = true;
  return { data: out };
}

// GET /api/sellers/coupons
router.get('/coupons', authSeller, async (req, res) => {
  try {
    const coupons = await SellerCoupon.find({ seller: req.seller.id }).sort({ createdAt: -1 }).lean();
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/coupons
router.post('/coupons', authSeller, blockWhenFrozen('creating coupons'), async (req, res) => {
  try {
    const { data, error } = cleanCoupon(req.body);
    if (error) return res.status(400).json({ message: error });

    const existing = await SellerCoupon.findOne({ seller: req.seller.id, code: data.code }).select('_id').lean();
    if (existing) return res.status(400).json({ message: 'You already have a coupon with this code.' });

    const coupon = await SellerCoupon.create({ ...data, seller: req.seller.id, usedCount: 0 });
    res.status(201).json(coupon);
  } catch (err) {
    if (err?.code === 11000) return res.status(400).json({ message: 'You already have a coupon with this code.' });
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/sellers/coupons/:id
router.put('/coupons/:id', authSeller, blockWhenFrozen('editing coupons'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Coupon not found' });
    const current = await SellerCoupon.findOne({ _id: req.params.id, seller: req.seller.id }).lean();
    if (!current) return res.status(404).json({ message: 'Coupon not found' });

    const { data, error } = cleanCoupon(req.body, current);
    if (error) return res.status(400).json({ message: error });
    if (data.code && data.code !== current.code) {
      const clash = await SellerCoupon.findOne({ seller: req.seller.id, code: data.code, _id: { $ne: current._id } }).select('_id').lean();
      if (clash) return res.status(400).json({ message: 'You already have a coupon with this code.' });
    }

    const coupon = await SellerCoupon.findOneAndUpdate({ _id: current._id, seller: req.seller.id }, { $set: data }, { new: true, runValidators: true });
    res.json(coupon);
  } catch (err) {
    if (err?.code === 11000) return res.status(400).json({ message: 'You already have a coupon with this code.' });
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/sellers/coupons/:id
router.delete('/coupons/:id', authSeller, blockWhenFrozen('deleting coupons'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Coupon not found' });
    const coupon = await SellerCoupon.findOneAndDelete({ _id: req.params.id, seller: req.seller.id });
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    res.json({ message: 'Coupon deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
