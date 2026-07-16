import { Router } from 'express';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import { authAdmin } from '../middleware/auth.js';

const router = Router();

const startOf = {
  day: () => new Date(new Date().setHours(0, 0, 0, 0)),
  week: () => {
    const d = new Date(new Date().setHours(0, 0, 0, 0));
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  },
  month: () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  year: () => new Date(new Date().getFullYear(), 0, 1),
};

router.get('/dashboard', authAdmin(), async (req, res) => {
  const valid = { status: { $nin: ['cancelled', 'refunded'] } };
  const sumSince = async (since) => {
    const agg = await Order.aggregate([
      { $match: { ...valid, createdAt: { $gte: since } } },
      { $group: { _id: null, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
    ]);
    return { revenue: agg[0]?.revenue || 0, orders: agg[0]?.orders || 0 };
  };

  const [today, week, month, year] = await Promise.all([
    sumSince(startOf.day()),
    sumSince(startOf.week()),
    sumSince(startOf.month()),
    sumSince(startOf.year()),
  ]);

  const byStatusAgg = await Order.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
  const ordersByStatus = Object.fromEntries(byStatusAgg.map((s) => [s._id, s.n]));

  const [totalCustomers, newCustomers] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: startOf.month() } }),
  ]);
  const returningAgg = await Order.aggregate([
    { $match: { user: { $ne: null } } },
    { $group: { _id: '$user', n: { $sum: 1 } } },
    { $match: { n: { $gte: 2 } } },
    { $count: 'returning' },
  ]);

  const [bestSelling, lowStock, outOfStock] = await Promise.all([
    Product.find({ active: true }).sort({ sold: -1 }).limit(5).select('name sold stock image price'),
    Product.find({ stock: { $gt: 0 }, $expr: { $lte: ['$stock', '$lowStockThreshold'] } }).limit(10).select('name stock lowStockThreshold image'),
    Product.find({ stock: { $lte: 0 } }).limit(10).select('name stock image'),
  ]);

  // last 30 days daily revenue (line chart)
  const revenue30 = await Order.aggregate([
    { $match: { ...valid, createdAt: { $gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) } } },
    { $group: { _id: { $dateToString: { format: '%d %b', date: '$createdAt' } }, day: { $min: '$createdAt' }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
    { $sort: { day: 1 } },
    { $project: { _id: 0, label: '$_id', revenue: 1, orders: 1 } },
  ]);

  // last 12 months revenue (bar chart)
  const monthly12 = await Order.aggregate([
    { $match: { ...valid, createdAt: { $gte: new Date(Date.now() - 365 * 24 * 3600 * 1000) } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, label: '$_id', revenue: 1, orders: 1 } },
  ]);

  // payment method split (pie chart)
  const paymentSplit = await Order.aggregate([
    { $match: valid },
    { $group: { _id: '$paymentMethod', n: { $sum: 1 }, revenue: { $sum: '$total' } } },
    { $project: { _id: 0, label: '$_id', n: 1, revenue: 1 } },
  ]);

  const recent = await Order.find().sort({ createdAt: -1 }).limit(8);

  res.json({
    sales: { today, week, month, year },
    ordersByStatus,
    customers: { total: totalCustomers, newThisMonth: newCustomers, returning: returningAgg[0]?.returning || 0 },
    bestSelling,
    lowStock,
    outOfStock,
    revenue30,
    monthly12,
    paymentSplit,
    recent,
  });
});

export default router;
