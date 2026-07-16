import { Router } from 'express';
import Product from '../models/Product.js';
import { StockHistory, IncomingStock } from '../models/StockHistory.js';
import { authAdmin } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { notify } from '../utils/notify.js';

const router = Router();

// GET /api/inventory/overview
router.get('/overview', authAdmin('inventory'), async (req, res) => {
  const products = await Product.find()
    .select('name sku image stock reservedStock lowStockThreshold active sold')
    .sort({ stock: 1 });
  const low = products.filter((p) => p.stock > 0 && p.stock <= (p.lowStockThreshold || 5));
  const out = products.filter((p) => p.stock <= 0);
  const incoming = await IncomingStock.find({ status: 'pending' }).sort({ expectedAt: 1 });
  res.json({
    products,
    lowCount: low.length,
    outCount: out.length,
    totalStock: products.reduce((s, p) => s + Math.max(0, p.stock), 0),
    totalReserved: products.reduce((s, p) => s + p.reservedStock, 0),
    incoming,
  });
});

// POST /api/inventory/adjust { productId, change, note }
router.post('/adjust', authAdmin('inventory'), async (req, res) => {
  const { productId, change, note } = req.body || {};
  const delta = Number(change);
  if (!delta) return res.status(400).json({ message: 'Change amount required (e.g. +50 or -3)' });
  const p = await Product.findById(productId);
  if (!p) return res.status(404).json({ message: 'Product not found' });
  p.stock += delta;
  await p.save();
  await StockHistory.create({ product: p._id, productName: p.name, change: delta, stockAfter: p.stock, reason: 'adjustment', note: note || '', by: req.admin.name });
  if (p.stock <= 0) notify(req.app, { type: 'stock', title: 'Out of stock', body: `${p.name} is now OUT OF STOCK`, link: '/admin/inventory' });
  await audit(req, 'stock_adjusted', 'product', p._id, { name: p.name, change: delta, stockAfter: p.stock, note: note || '' });
  res.json(p);
});

// GET /api/inventory/history?productId=
router.get('/history', authAdmin('inventory'), async (req, res) => {
  const filter = req.query.productId ? { product: req.query.productId } : {};
  res.json(await StockHistory.find(filter).sort({ createdAt: -1 }).limit(200));
});

// incoming inventory
router.post('/incoming', authAdmin('inventory'), async (req, res) => {
  const { productId, qty, expectedAt, note } = req.body || {};
  const p = await Product.findById(productId);
  if (!p || !(Number(qty) > 0)) return res.status(400).json({ message: 'Product and quantity required' });
  const inc = await IncomingStock.create({ product: p._id, productName: p.name, qty: Number(qty), expectedAt: expectedAt || null, note: note || '' });
  await audit(req, 'incoming_added', 'product', p._id, { name: p.name, qty: Number(qty) });
  res.status(201).json(inc);
});

router.patch('/incoming/:id/receive', authAdmin('inventory'), async (req, res) => {
  const inc = await IncomingStock.findById(req.params.id);
  if (!inc || inc.status === 'received') return res.status(400).json({ message: 'Already received or not found' });
  const p = await Product.findById(inc.product);
  if (p) {
    p.stock += inc.qty;
    await p.save();
    await StockHistory.create({ product: p._id, productName: p.name, change: inc.qty, stockAfter: p.stock, reason: 'incoming', note: inc.note, by: req.admin.name });
  }
  inc.status = 'received';
  inc.receivedAt = new Date();
  await inc.save();
  await audit(req, 'incoming_received', 'product', inc.product, { name: inc.productName, qty: inc.qty });
  res.json(inc);
});

router.delete('/incoming/:id', authAdmin('inventory'), async (req, res) => {
  await IncomingStock.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

export default router;
