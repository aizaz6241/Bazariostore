import { Router } from 'express';
import ShippingMethod from '../models/ShippingMethod.js';
import { authAdmin } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

const router = Router();

// public — active methods for checkout
router.get('/', async (req, res) => {
  const methods = await ShippingMethod.find({ active: true }).sort({ sortOrder: 1, cost: 1 });
  res.json(methods);
});

// admin
router.get('/admin/list', authAdmin('shipping'), async (req, res) => {
  res.json(await ShippingMethod.find().sort({ sortOrder: 1, cost: 1 }));
});

router.post('/', authAdmin('shipping'), async (req, res) => {
  const body = req.body || {};
  if (!body.name?.trim()) return res.status(400).json({ message: 'Method name required' });
  const method = await ShippingMethod.create(body);
  await audit(req, 'shipping_added', 'shipping', method._id, { name: method.name, cost: method.cost });
  res.status(201).json(method);
});

router.put('/:id', authAdmin('shipping'), async (req, res) => {
  const method = await ShippingMethod.findById(req.params.id);
  if (!method) return res.status(404).json({ message: 'Method not found' });
  const body = req.body || {};
  delete body._id;
  Object.assign(method, body);
  await method.save();
  await audit(req, 'shipping_updated', 'shipping', method._id, { name: method.name, cost: method.cost });
  res.json(method);
});

router.patch('/:id/active', authAdmin('shipping'), async (req, res) => {
  const method = await ShippingMethod.findById(req.params.id);
  if (!method) return res.status(404).json({ message: 'Method not found' });
  method.active = !method.active;
  await method.save();
  await audit(req, method.active ? 'shipping_enabled' : 'shipping_disabled', 'shipping', method._id, { name: method.name });
  res.json(method);
});

router.delete('/:id', authAdmin('shipping'), async (req, res) => {
  const method = await ShippingMethod.findByIdAndDelete(req.params.id);
  if (!method) return res.status(404).json({ message: 'Method not found' });
  await audit(req, 'shipping_deleted', 'shipping', req.params.id, { name: method.name });
  res.json({ ok: true });
});

export default router;
