import express from 'express';
import SellerShippingMethod from '../../models/SellerShipping.js';
import { authSeller } from '../../middleware/auth.js';

const router = express.Router();

// GET /api/sellers/shipping
router.get('/shipping', authSeller, async (req, res) => {
  try {
    const methods = await SellerShippingMethod.find({ seller: req.seller.id }).sort({ createdAt: -1 });
    res.json(methods);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/shipping
router.post('/shipping', authSeller, async (req, res) => {
  try {
    const { name, description, cost, freeAbove, eta, active } = req.body;
    if (!name || cost === undefined) return res.status(400).json({ message: 'Name and cost are required' });

    const method = await SellerShippingMethod.create({
      seller: req.seller.id,
      name,
      description: description || '',
      cost: Number(cost),
      freeAbove: freeAbove ? Number(freeAbove) : null,
      eta: eta || '',
      active: active !== false,
    });
    res.status(201).json(method);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/sellers/shipping/:id
router.put('/shipping/:id', authSeller, async (req, res) => {
  try {
    const method = await SellerShippingMethod.findOneAndUpdate(
      { _id: req.params.id, seller: req.seller.id },
      req.body,
      { new: true }
    );
    if (!method) return res.status(404).json({ message: 'Shipping method not found' });
    res.json(method);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/sellers/shipping/:id
router.delete('/shipping/:id', authSeller, async (req, res) => {
  try {
    const method = await SellerShippingMethod.findOneAndDelete({ _id: req.params.id, seller: req.seller.id });
    if (!method) return res.status(404).json({ message: 'Shipping method not found' });
    res.json({ message: 'Shipping method deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
