import { Router } from 'express';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Expense, { EXPENSE_TYPES } from '../models/Expense.js';
import Refund from '../models/Refund.js';
import { authAdmin } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

const router = Router();

function rangeFilter(req, field = 'createdAt') {
  const { from, to } = req.query;
  const f = {};
  if (from) f.$gte = new Date(from);
  if (to) f.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
  return Object.keys(f).length ? { [field]: f } : {};
}

async function orderCostBreakdown(orders) {
  const ids = [...new Set(orders.flatMap((o) => o.items.map((i) => String(i.product))))];
  const products = await Product.find({ _id: { $in: ids } }).select('costs');
  const costMap = Object.fromEntries(products.map((p) => [String(p._id), p.costs || {}]));
  let cogs = 0, delivery = 0, packaging = 0, tax = 0, other = 0;
  for (const o of orders) {
    for (const it of o.items) {
      const c = costMap[String(it.product)] || {};
      cogs += (c.purchase || 0) * it.qty;
      delivery += (c.delivery || 0) * it.qty;
      packaging += (c.packaging || 0) * it.qty;
      tax += (c.tax || 0) * it.qty;
      other += (c.other || 0) * it.qty;
    }
  }
  return { cogs, delivery, packaging, tax, other };
}

// GET /api/finance/summary?from=&to=
router.get('/summary', authAdmin('finance'), async (req, res) => {
  const orders = await Order.find({ status: { $nin: ['cancelled', 'refunded'] }, ...rangeFilter(req) });
  const revenue = orders.reduce((s, o) => s + o.total, 0);
  const costs = await orderCostBreakdown(orders);
  const expenses = await Expense.find(rangeFilter(req, 'date'));
  const expenseByType = {};
  for (const t of EXPENSE_TYPES) expenseByType[t] = 0;
  for (const e of expenses) expenseByType[e.type] += e.amount;
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const refunds = await Refund.find({ status: 'refunded', ...rangeFilter(req, 'updatedAt') });
  const refundedAmount = refunds.reduce((s, r) => s + r.amount, 0);

  const grossProfit = revenue - costs.cogs;
  const netProfit = grossProfit - costs.delivery - costs.packaging - costs.tax - costs.other - totalExpenses;

  // monthly series (last 12 months, all-time regardless of range)
  const monthly = await Order.aggregate([
    { $match: { status: { $nin: ['cancelled', 'refunded'] }, createdAt: { $gte: new Date(Date.now() - 365 * 24 * 3600 * 1000) } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  res.json({
    revenue,
    orderCount: orders.length,
    costs,
    expenseByType,
    totalExpenses,
    refundedAmount,
    grossProfit,
    netProfit,
    monthly,
  });
});

// GET /api/finance/product-profit — per-product cost & profit management
router.get('/product-profit', authAdmin('finance'), async (req, res) => {
  const products = await Product.find().select('name sku price costs sold stock');
  res.json(
    products.map((p) => {
      const c = p.costs || {};
      const unitCost = (c.purchase || 0) + (c.delivery || 0) + (c.packaging || 0) + (c.tax || 0) + (c.other || 0);
      const grossProfitUnit = p.price - (c.purchase || 0);
      const netProfitUnit = p.price - unitCost;
      return {
        _id: p._id,
        name: p.name,
        sku: p.sku,
        price: p.price,
        purchase: c.purchase || 0,
        unitCost,
        grossProfitUnit,
        netProfitUnit,
        margin: p.price ? Math.round((netProfitUnit / p.price) * 100) : 0,
        sold: p.sold,
        revenue: p.sold * p.price,
        grossProfit: p.sold * grossProfitUnit,
        netProfit: p.sold * netProfitUnit,
        stock: p.stock,
      };
    })
  );
});

// expenses CRUD
router.get('/expenses', authAdmin('finance'), async (req, res) => {
  res.json(await Expense.find(rangeFilter(req, 'date')).sort({ date: -1 }).limit(300));
});

router.post('/expenses', authAdmin('finance'), async (req, res) => {
  const { type, amount, note, date } = req.body || {};
  if (!(Number(amount) > 0)) return res.status(400).json({ message: 'Amount required' });
  const expense = await Expense.create({ type, amount: Number(amount), note: note || '', date: date || new Date(), createdBy: req.admin.name });
  await audit(req, 'expense_added', 'expense', expense._id, { type, amount: Number(amount) });
  res.status(201).json(expense);
});

router.delete('/expenses/:id', authAdmin('finance'), async (req, res) => {
  const expense = await Expense.findByIdAndDelete(req.params.id);
  if (expense) await audit(req, 'expense_deleted', 'expense', req.params.id, { type: expense.type, amount: expense.amount });
  res.json({ ok: true });
});

export default router;
