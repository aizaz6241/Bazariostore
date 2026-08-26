import { Router } from 'express';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import Seller from '../models/Seller.js';
import Withdrawal from '../models/Withdrawal.js';
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

// GET /api/analytics/reports — Super Admin Analytics & Visual Reports
router.get('/reports', authAdmin(), async (req, res) => {
  try {
    let since = null;
    let until = new Date();
    const daysParam = req.query.days || '30';
    let numDays = 30;

    if (req.query.from && req.query.to) {
      since = new Date(req.query.from);
      until = new Date(new Date(req.query.to).setHours(23, 59, 59, 999));
      numDays = Math.max(1, Math.round((until - since) / (1000 * 60 * 60 * 24)));
    } else if (daysParam === 'all') {
      since = new Date(0);
      numDays = 3650;
    } else {
      numDays = parseInt(daysParam, 10) || 30;
      since = new Date(Date.now() - numDays * 24 * 60 * 60 * 1000);
    }

    // Orders in timeframe
    const orders = await Order.find({ createdAt: { $gte: since, $lte: until } }).sort({ createdAt: 1 });

    // Payouts & processing fund platform-wide
    const [approvedWds, pendingWds, sellers] = await Promise.all([
      Withdrawal.find({ type: 'withdrawal', status: 'approved' }),
      Withdrawal.find({ type: 'withdrawal', status: 'pending' }),
      Seller.find().select('storeName wallet totalSales rating status'),
    ]);

    const totalWithdrawn = approvedWds.reduce((s, w) => s + (w.amount || 0), 0);
    const pendingWithdrawals = pendingWds.reduce((s, w) => s + (w.amount || 0), 0);
    const processingFund = sellers.reduce((s, sel) => s + (sel.wallet?.processingFund || 0), 0);

    // Time-series buckets pre-population
    const buckets = {};
    const cur = new Date(since);
    cur.setHours(0, 0, 0, 0);
    const end = new Date(until);
    end.setHours(23, 59, 59, 999);

    if (numDays <= 90) {
      while (cur <= end) {
        const key = cur.toISOString().split('T')[0];
        const label = cur.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
        buckets[key] = { date: key, label, sales: 0, profit: 0, orders: 0, items: 0 };
        cur.setDate(cur.getDate() + 1);
      }
    } else if (numDays <= 730) {
      while (cur <= end) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
        const label = cur.toLocaleDateString('en-PK', { month: 'short', year: '2-digit' });
        if (!buckets[key]) {
          buckets[key] = { date: key, label, sales: 0, profit: 0, orders: 0, items: 0 };
        }
        cur.setMonth(cur.getMonth() + 1);
      }
    } else {
      while (cur <= end) {
        const q = Math.floor(cur.getMonth() / 3) + 1;
        const key = `${cur.getFullYear()}-Q${q}`;
        const label = `Q${q} '${String(cur.getFullYear()).slice(-2)}`;
        if (!buckets[key]) {
          buckets[key] = { date: key, label, sales: 0, profit: 0, orders: 0, items: 0 };
        }
        cur.setMonth(cur.getMonth() + 3);
      }
    }

    let grossRevenue = 0;
    let totalSaleProfit = 0;
    let totalItems = 0;
    let deliveredOrdersCount = 0;

    const statusCounts = { delivered: 0, processing: 0, pending: 0, cancelled: 0, refunded: 0 };
    const paymentMap = {};
    const productMap = {};

    for (const order of orders) {
      const isDelivered = order.status === 'delivered';
      const isCancelled = order.status === 'cancelled';
      const isRefunded = order.status === 'refunded';

      if (isDelivered) deliveredOrdersCount++;
      if (isDelivered) statusCounts.delivered++;
      else if (isCancelled) statusCounts.cancelled++;
      else if (isRefunded) statusCounts.refunded++;
      else if (['processing', 'packed', 'shipped', 'out_for_delivery', 'confirmed'].includes(order.status)) {
        statusCounts.processing++;
      } else {
        statusCounts.pending++;
      }

      const rawPay = (order.paymentMethod || 'cash_on_delivery').toLowerCase();
      let payName = 'Cash On Delivery';
      if (rawPay.includes('upi')) payName = 'UPI Transfer';
      else if (rawPay.includes('bank')) payName = 'Bank Transfer';
      else if (rawPay.includes('wallet')) payName = 'Wallet Balance';
      else if (rawPay.includes('usdt') || rawPay.includes('crypto')) payName = 'USDT / Crypto';
      else if (rawPay.includes('paytm') || rawPay.includes('gpay') || rawPay.includes('phonepe')) payName = 'UPI / Wallets';
      else if (rawPay.includes('card') || rawPay.includes('stripe')) payName = 'Card Payment';
      paymentMap[payName] = (paymentMap[payName] || 0) + 1;

      if (!isCancelled) {
        const orderRev = order.total || 0;
        grossRevenue += orderRev;

        let orderProfit = 0;
        let orderItemCount = 0;

        (order.items || []).forEach((item) => {
          const qty = item.qty || 1;
          orderItemCount += qty;
          const pid = item.product?.toString() || item._id?.toString() || item.name;
          const itemTotal = (item.price || 0) * qty;

          // Standard platform commission estimate (10%)
          const comm = (itemTotal * 10) / 100;
          orderProfit += comm;

          if (!productMap[pid]) {
            productMap[pid] = { _id: pid, name: item.name, image: item.image, sold: 0, revenue: 0 };
          }
          productMap[pid].sold += qty;
          productMap[pid].revenue += Math.round(itemTotal);
        });

        totalSaleProfit += orderProfit;
        totalItems += orderItemCount;

        const oDate = order.createdAt ? new Date(order.createdAt) : new Date();
        let bucketKey = '';
        if (numDays <= 90) bucketKey = oDate.toISOString().split('T')[0];
        else if (numDays <= 730) bucketKey = `${oDate.getFullYear()}-${String(oDate.getMonth() + 1).padStart(2, '0')}`;
        else bucketKey = `${oDate.getFullYear()}-Q${Math.floor(oDate.getMonth() / 3) + 1}`;

        if (buckets[bucketKey]) {
          buckets[bucketKey].sales += Math.round(orderRev);
          buckets[bucketKey].profit += Math.round(orderProfit);
          buckets[bucketKey].orders += 1;
          buckets[bucketKey].items += orderItemCount;
        }
      }
    }

    const salesOverTime = Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date));
    const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const topSellers = sellers.map((s) => ({
      _id: s._id,
      name: s.storeName,
      sales: s.totalSales || 0,
      balance: s.wallet?.balance || 0,
      processingFund: s.wallet?.processingFund || 0,
      totalWithdrawn: s.wallet?.totalWithdrawn || 0,
      rating: s.rating,
      status: s.status,
    })).sort((a, b) => b.sales - a.sales).slice(0, 10);

    const statusBreakdown = [
      { name: 'Delivered', value: statusCounts.delivered, color: '#16a34a' },
      { name: 'In Processing', value: statusCounts.processing, color: '#2563eb' },
      { name: 'Pending Review', value: statusCounts.pending, color: '#f59e0b' },
      { name: 'Cancelled', value: statusCounts.cancelled, color: '#64748b' },
      { name: 'Refunded', value: statusCounts.refunded, color: '#dc2626' },
    ].filter((s) => s.value > 0);

    const paymentBreakdown = Object.entries(paymentMap).map(([name, value]) => ({ name, value }));

    const nonCancelledOrders = orders.filter((o) => o.status !== 'cancelled').length;
    const avgOrderValue = nonCancelledOrders ? Math.round(grossRevenue / nonCancelledOrders) : 0;
    const fulfilmentRate = orders.length ? Math.round((deliveredOrdersCount / orders.length) * 100) : 0;

    res.json({
      period: daysParam,
      totalRevenue: Math.round(grossRevenue),
      totalSaleProfit: Math.round(totalSaleProfit),
      netProfit: Math.round(totalSaleProfit),
      profitMargin: grossRevenue > 0 ? Math.round((totalSaleProfit / grossRevenue) * 100) : 15,
      totalWithdrawn: Math.round(totalWithdrawn),
      processingFund: Math.round(processingFund),
      pendingWithdrawals: Math.round(pendingWithdrawals),
      pendingWithdrawalsCount: pendingWds.length,
      totalOrders: orders.length,
      totalItems,
      avgOrderValue,
      fulfilmentRate,
      salesOverTime,
      statusBreakdown: statusBreakdown.length ? statusBreakdown : [{ name: 'No Orders', value: 1, color: '#cbd5e1' }],
      paymentBreakdown: paymentBreakdown.length ? paymentBreakdown : [{ name: 'No Data', value: 1 }],
      topProducts,
      topSellers,
      recentOrders: orders.slice(-20).reverse().map((o) => ({
        _id: o._id,
        orderNumber: o.orderNumber,
        customer: o.contact?.email || o.shippingAddress?.fullName || 'Guest',
        total: o.total,
        status: o.status,
        paymentMethod: o.paymentMethod || 'Cash On Delivery',
        createdAt: o.createdAt,
        itemsCount: (o.items || []).length,
      })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
