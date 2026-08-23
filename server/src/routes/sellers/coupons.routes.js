import express from 'express';
import SellerCoupon from '../../models/SellerCoupon.js';
import { authSeller } from '../../middleware/auth.js';

const router = express.Router();

// GET /api/sellers/coupons
router.get('/coupons', authSeller, async (req, res) => {
  try {
    const coupons = await SellerCoupon.find({ seller: req.seller.id }).sort({ createdAt: -1 });
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/coupons
router.post('/coupons', authSeller, async (req, res) => {
  try {
    const { code, type, value, minOrder, maxUses, expiresAt, active } = req.body;
    if (!code || !type || !value) return res.status(400).json({ message: 'Code, type and value are required' });

    const existing = await SellerCoupon.findOne({ seller: req.seller.id, code: code.toUpperCase().trim() });
    if (existing) return res.status(400).json({ message: 'A coupon with this code already exists' });

    const coupon = await SellerCoupon.create({
      seller: req.seller.id,
      code: code.toUpperCase().trim(),
      type,
      value: Number(value),
      minOrder: minOrder ? Number(minOrder) : 0,
      maxUses: maxUses ? Number(maxUses) : null,
      expiresAt: expiresAt || null,
      active: active !== false,
    });
    res.status(201).json(coupon);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/sellers/coupons/:id
router.put('/coupons/:id', authSeller, async (req, res) => {
  try {
    const coupon = await SellerCoupon.findOneAndUpdate(
      { _id: req.params.id, seller: req.seller.id },
      req.body,
      { new: true }
    );
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    res.json(coupon);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/sellers/coupons/:id
router.delete('/coupons/:id', authSeller, async (req, res) => {
  try {
    const coupon = await SellerCoupon.findOneAndDelete({ _id: req.params.id, seller: req.seller.id });
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    res.json({ message: 'Coupon deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
