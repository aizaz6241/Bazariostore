import { Router } from 'express';
import Discount from '../models/Discount.js';
import { authAdmin } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

const router = Router();

router.get('/', authAdmin('discounts'), async (req, res) => {
  const discounts = await Discount.find().populate('categories', 'name').populate('products', 'name').sort({ createdAt: -1 });
  res.json(discounts);
});

router.post('/', authAdmin('discounts'), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name?.trim()) return res.status(400).json({ message: 'Discount name required' });
    if (body.code) {
      body.code = body.code.trim().toUpperCase();
      if (await Discount.findOne({ code: body.code })) return res.status(400).json({ message: 'Yeh coupon code pehle se mojood hai' });
    }
    const discount = await Discount.create(body);
    await audit(req, 'discount_added', 'discount', discount._id, { name: discount.name, code: discount.code, type: discount.type });
    res.status(201).json(discount);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.put('/:id', authAdmin('discounts'), async (req, res) => {
  const discount = await Discount.findById(req.params.id);
  if (!discount) return res.status(404).json({ message: 'Discount not found' });
  const body = req.body || {};
  delete body._id;
  if (body.code) body.code = body.code.trim().toUpperCase();
  Object.assign(discount, body);
  await discount.save();
  await audit(req, 'discount_updated', 'discount', discount._id, { name: discount.name });
  res.json(discount);
});

router.patch('/:id/active', authAdmin('discounts'), async (req, res) => {
  const discount = await Discount.findById(req.params.id);
  if (!discount) return res.status(404).json({ message: 'Discount not found' });
  discount.active = !discount.active;
  await discount.save();
  await audit(req, discount.active ? 'discount_activated' : 'discount_deactivated', 'discount', discount._id, { name: discount.name });
  res.json(discount);
});

router.delete('/:id', authAdmin('discounts'), async (req, res) => {
  const discount = await Discount.findByIdAndDelete(req.params.id);
  if (!discount) return res.status(404).json({ message: 'Discount not found' });
  await audit(req, 'discount_deleted', 'discount', req.params.id, { name: discount.name });
  res.json({ ok: true });
});

export default router;
