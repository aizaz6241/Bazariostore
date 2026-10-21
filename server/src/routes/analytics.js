import { Router } from 'express';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import Seller from '../models/Seller.js';
import Withdrawal from '../models/Withdrawal.js';
import { authAdmin } from '../middleware/auth.js';
import { hasPermission } from '../utils/permissions.js';

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

// Every admin opens the dashboard, but each part of it is only sent to the roles that cover it:
//   sales / orders / customers / top stores -> Orders or Reports,  recent orders (names, cities) -> Orders,
//   products & stock -> Products or Inventory,  USDT wallet & open money requests -> Finance,
//   seller pipeline, store health & targets -> Sellers.
router.get('/dashboard', authAdmin(), async (req, res) => {
  try {
    const can = (p) => hasPermission(req.admin, p);
    const sections = {
      sales: can('orders') || can('reports'),
      recentOrders: can('orders'),
      stock: can('products') || can('inventory'),
      wallet: can('finance'),
      sellers: can('sellers'),
    };
    const out = { sections };
    const [sales, sellers, recent, stock, wallet] = await Promise.all([
      sections.sales ? salesSection() : null,
      sections.sellers ? sellersSection() : null,
      sections.recentOrders
        ? Order.find().sort({ createdAt: -1 }).limit(8).select('orderNumber createdAt shippingAddress total paymentMethod status items.sellerName seller').lean()
        : null,
      sections.stock ? stockSection() : null,
      sections.wallet ? walletSection() : null,
    ]);
    if (sales) Object.assign(out, sales);
    if (sellers) Object.assign(out, sellers);
    if (recent) out.recent = recent;
    if (stock) Object.assign(out, stock);
    if (wallet) Object.assign(out, wallet);
    res.json(out);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

const DAY = 86400000;
const NOT_LIVE = ['cancelled', 'refunded'];

async function salesSection() {
  const valid = { status: { $nin: NOT_LIVE } };
  const sumSince = async (since) => {
    const agg = await Order.aggregate([
      { $match: { ...valid, createdAt: { $gte: since } } },
      { $group: { _id: null, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
    ]);
    return { revenue: agg[0]?.revenue || 0, orders: agg[0]?.orders || 0 };
  };

  const now = new Date();
  // UTC day buckets, every day present (a day without orders is a 0, not a missing point)
  const since30 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29));
  const prev30 = new Date(since30.getTime() - 30 * DAY);
  const since12m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const isDead = { $in: ['$status', NOT_LIVE] };

  const [today, week, month, year, byStatusAgg, totalCustomers, newCustomers, returningAgg, daily, monthlyAgg, paymentSplit, compare, staleOpen, itemShares] =
    await Promise.all([
      sumSince(startOf.day()),
      sumSince(startOf.week()),
      sumSince(startOf.month()),
      sumSince(startOf.year()),
      Order.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: startOf.month() } }),
      Order.aggregate([
        { $match: { user: { $ne: null } } },
        { $group: { _id: '$user', n: { $sum: 1 } } },
        { $match: { n: { $gte: 2 } } },
        { $count: 'returning' },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: since30 } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            revenue: { $sum: { $cond: [isDead, 0, '$total'] } },
            orders: { $sum: 1 },
            delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
            cancelled: { $sum: { $cond: [isDead, 1, 0] } },
          },
        },
      ]),
      Order.aggregate([
        { $match: { ...valid, createdAt: { $gte: since12m } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: valid },
        { $group: { _id: '$paymentMethod', n: { $sum: 1 }, revenue: { $sum: '$total' } } },
        { $project: { _id: 0, label: '$_id', n: 1, revenue: 1 } },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: prev30 } } },
        {
          $group: {
            _id: { $cond: [{ $gte: ['$createdAt', since30] }, 'current', 'previous'] },
            orders: { $sum: 1 },
            revenue: { $sum: { $cond: [isDead, 0, '$total'] } },
            delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
            cancelled: { $sum: { $cond: [isDead, 1, 0] } },
          },
        },
      ]),
      Order.countDocuments({ status: { $nin: ['delivered', ...NOT_LIVE] }, createdAt: { $lt: new Date(Date.now() - 48 * 3600000) } }),
      Order.aggregate([
        { $match: { ...valid, createdAt: { $gte: since30 } } },
        { $unwind: '$items' },
        {
          $group: {
            _id: { $ifNull: ['$items.seller', '$seller'] },
            name: { $first: '$items.sellerName' },
            gmv: { $sum: { $multiply: [{ $ifNull: ['$items.price', 0] }, { $ifNull: ['$items.qty', 1] }] } },
            orders: { $addToSet: '$_id' },
          },
        },
        { $project: { name: 1, gmv: 1, orders: { $size: '$orders' } } },
        { $sort: { gmv: -1 } },
        { $limit: 6 },
      ]),
    ]);

  const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const dailyMap = new Map(daily.map((d) => [d._id, d]));
  const revenue30 = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(since30.getTime() + i * DAY);
    const key = d.toISOString().slice(0, 10);
    const row = dailyMap.get(key);
    revenue30.push({
      key,
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
      revenue: round(row?.revenue),
      orders: row?.orders || 0,
      delivered: row?.delivered || 0,
      cancelled: row?.cancelled || 0,
    });
  }

  const monthMap = new Map(monthlyAgg.map((m) => [m._id, m]));
  const monthly12 = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(since12m.getUTCFullYear(), since12m.getUTCMonth() + i, 1));
    const key = d.toISOString().slice(0, 7);
    const row = monthMap.get(key);
    monthly12.push({ key, label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }), revenue: round(row?.revenue), orders: row?.orders || 0 });
  }

  const cmp = Object.fromEntries(compare.map((c) => [c._id, c]));
  const pick = (c) => ({ orders: c?.orders || 0, revenue: round(c?.revenue), delivered: c?.delivered || 0, cancelled: c?.cancelled || 0 });
  const aov = (x) => (x.orders - x.cancelled > 0 ? round(x.revenue / (x.orders - x.cancelled)) : 0);
  const cur = pick(cmp.current);
  const prv = pick(cmp.previous);

  // store names for the top-stores list (only the few that made the list)
  const ids = itemShares.map((r) => r._id).filter(Boolean);
  const names = new Map((await Seller.find({ _id: { $in: ids } }).select('storeName').lean()).map((s) => [String(s._id), s.storeName]));

  return {
    sales: { today, week, month, year },
    period: { current: { ...cur, aov: aov(cur) }, previous: { ...prv, aov: aov(prv) } },
    ordersByStatus: Object.fromEntries(byStatusAgg.map((x) => [x._id, x.n])),
    staleOpenOrders: staleOpen,
    customers: { total: totalCustomers, newThisMonth: newCustomers, returning: returningAgg[0]?.returning || 0 },
    revenue30,
    monthly12,
    paymentSplit,
    topSellers: itemShares.map((r) => ({
      _id: r._id,
      storeName: (r._id && names.get(String(r._id))) || r.name || 'Bazario Direct',
      gmv: round(r.gmv),
      orders: r.orders,
    })),
  };
}

// seller pipeline, store health and targets (KYC photos are never loaded here)
async function sellersSection() {
  const sellerDocs = await Seller.find().select('status warning accountHealth.score registrationRejectedAt createdAt targets isTestAccount').lean();
  const now = new Date();
  const monthStartTime = startOf.month().getTime();
  const sellers = { total: 0, active: 0, frozen: 0, suspended: 0, pending: 0, pendingApplications: 0, rejected: 0, warned: 0, atRisk: 0, newThisMonth: 0, test: 0 };
  const health = { healthy: 0, watch: 0, atRisk: 0, critical: 0 };
  const targets = { active: 0, completed: 0, expired: 0, bonusPaid: 0, bonusOpen: 0 };
  sellerDocs.forEach((sd) => {
    if (sd.status === 'pending_approval') {
      sellers.pendingApplications += 1;
      return;
    }
    if (sd.status === 'suspended' && sd.registrationRejectedAt) {
      sellers.rejected += 1;
      return;
    }
    sellers.total += 1;
    if (sd.isTestAccount) sellers.test += 1;
    if (sellers[sd.status] !== undefined) sellers[sd.status] += 1;
    if (sd.warning?.active) sellers.warned += 1;
    const score = sd.accountHealth?.score ?? 100;
    if (score <= 30) sellers.atRisk += 1;
    if (score >= 80) health.healthy += 1;
    else if (score >= 31) health.watch += 1;
    else if (score > 20) health.atRisk += 1;
    else health.critical += 1;
    if (new Date(sd.createdAt).getTime() >= monthStartTime) sellers.newThisMonth += 1;
    (sd.targets || []).forEach((t) => {
      const expired = t.status === 'expired' || (t.status === 'active' && t.expiresAt && new Date(t.expiresAt) < now);
      if (expired) targets.expired += 1;
      else if (t.status === 'active') {
        targets.active += 1;
        targets.bonusOpen += Number(t.bonusAmount) || 0;
      } else {
        targets.completed += 1;
        targets.bonusPaid += Number(t.bonusAmount) || 0;
      }
    });
  });
  sellers.pending = sellers.pendingApplications;
  const round = (n) => Math.round(n * 100) / 100;
  return { sellers, health, targets: { ...targets, bonusPaid: round(targets.bonusPaid), bonusOpen: round(targets.bonusOpen) } };
}

async function stockSection() {
  const [bestSelling, lowStock, outOfStock] = await Promise.all([
    Product.find({ active: true }).sort({ sold: -1 }).limit(5).select('name sold stock image price').lean(),
    Product.find({ stock: { $gt: 0 }, $expr: { $lte: ['$stock', '$lowStockThreshold'] } }).limit(10).select('name stock lowStockThreshold image').lean(),
    Product.find({ stock: { $lte: 0 } }).limit(10).select('name stock image').lean(),
  ]);
  return { bestSelling, lowStock, outOfStock };
}

// ─── USDT WALLET (REAL CLIENT SELLERS ONLY - EXCLUDES TEST ACCOUNTS & PREVIOUS STORE SELLERS) ───
// plus the deposit / withdrawal requests still waiting for a decision
async function walletSection() {
  const clientSellers = await Seller.find({
    isTestAccount: { $ne: true },
    accountType: { $ne: 'test' },
    isPreviousStoreSeller: { $ne: true },
  })
    .select('_id')
    .lean();

  const [clientDeposits, openRequests] = await Promise.all([
    Withdrawal.find({ seller: { $in: clientSellers.map((s) => s._id) }, type: 'deposit', status: 'approved' })
      .select('storeName amount approvedAmount helpingAmount processedAt createdAt depositRef transactionRef')
      .sort({ createdAt: -1 })
      .lean(),
    Withdrawal.find({ type: { $in: ['deposit', 'withdrawal'] }, status: { $in: ['pending', 'processing'] } }).select('type amount').lean(),
  ]);

  const grossOf = (r) => (r.approvedAmount !== null && r.approvedAmount !== undefined ? r.approvedAmount : r.amount) || 0;
  const netOf = (r) => Math.max(0, grossOf(r) - (r.helpingAmount || 0));

  const dayStart = startOf.day();
  const weekStart = startOf.week();
  const monthStart = startOf.month();
  const yearStart = startOf.year();
  const now = new Date();
  const since30 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29));
  const trendDays = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(since30.getTime() + i * DAY);
    trendDays.push({ key: d.toISOString().slice(0, 10), label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) });
  }
  const byDay = new Map(trendDays.map((t) => [t.key, 0]));

  const w = { total: 0, today: 0, week: 0, month: 0, year: 0, grossDeposits: 0, helpingAmount: 0 };
  clientDeposits.forEach((dep) => {
    const net = netOf(dep);
    const when = new Date(dep.processedAt || dep.createdAt);
    w.total += net;
    w.grossDeposits += grossOf(dep);
    w.helpingAmount += dep.helpingAmount || 0;
    if (when >= dayStart) w.today += net;
    if (when >= weekStart) w.week += net;
    if (when >= monthStart) w.month += net;
    if (when >= yearStart) w.year += net;
    const k = when.toISOString().slice(0, 10);
    if (byDay.has(k)) byDay.set(k, byDay.get(k) + net);
  });

  const requests = { deposits: { count: 0, amount: 0 }, withdrawals: { count: 0, amount: 0 } };
  openRequests.forEach((r) => {
    const slot = r.type === 'deposit' ? requests.deposits : requests.withdrawals;
    slot.count += 1;
    slot.amount += Number(r.amount) || 0;
  });

  return {
    requests,
    usdtWallet: {
      ...w,
      depositCount: clientDeposits.length,
      clientSellersCount: clientSellers.length,
      trend: trendDays.map((t) => ({ label: t.label, amount: Math.round((byDay.get(t.key) || 0) * 100) / 100 })),
      recentPayments: clientDeposits.slice(0, 5).map((dep) => ({
        _id: dep._id,
        storeName: dep.storeName,
        netUsdt: netOf(dep),
        grossAmount: grossOf(dep),
        helpingAmount: dep.helpingAmount || 0,
        createdAt: dep.processedAt || dep.createdAt,
        transactionRef: dep.depositRef || dep.transactionRef,
      })),
    },
  };
}

// GET /api/analytics/usdt-wallet-history — Detailed USDT Wallet transactions breakdown
router.get('/usdt-wallet-history', authAdmin('finance'), async (req, res) => {
  try {
    const { period = 'all', search = '' } = req.query;

    const clientSellers = await Seller.find({
      isTestAccount: { $ne: true },
      accountType: { $ne: 'test' },
      isPreviousStoreSeller: { $ne: true },
    }).select('_id storeName ownerName email phone');

    const sellerMap = new Map();
    clientSellers.forEach((s) => sellerMap.set(String(s._id), s));
    const clientSellerIds = clientSellers.map((s) => s._id);

    const clientDeposits = await Withdrawal.find({
      seller: { $in: clientSellerIds },
      type: 'deposit',
      status: 'approved',
    }).sort({ createdAt: -1 });

    const getNetSellerDeposit = (r) => {
      const gross = r.approvedAmount !== null && r.approvedAmount !== undefined ? r.approvedAmount : r.amount;
      const helping = r.helpingAmount || 0;
      return Math.max(0, gross - helping);
    };

    const dayStart = startOf.day();
    const weekStart = startOf.week();
    const monthStart = startOf.month();
    const yearStart = startOf.year();

    let allTotalNet = 0;
    let allTodayNet = 0;
    let allWeekNet = 0;
    let allMonthNet = 0;
    let allGross = 0;
    let allHelping = 0;

    const allTransactions = clientDeposits.map((d) => {
      const seller = sellerMap.get(String(d.seller));
      const net = getNetSellerDeposit(d);
      const gross = d.approvedAmount !== null && d.approvedAmount !== undefined ? d.approvedAmount : d.amount;
      const helping = d.helpingAmount || 0;
      const date = d.processedAt || d.createdAt;
      const dTime = new Date(date);

      allTotalNet += net;
      allGross += gross;
      allHelping += helping;
      if (dTime >= dayStart) allTodayNet += net;
      if (dTime >= weekStart) allWeekNet += net;
      if (dTime >= monthStart) allMonthNet += net;

      return {
        _id: d._id,
        sellerId: d.seller,
        storeName: d.storeName || seller?.storeName || 'Store',
        ownerName: seller?.ownerName || '',
        email: seller?.email || '',
        phone: seller?.phone || '',
        netUsdt: net,
        grossAmount: gross,
        requestedAmount: d.amount,
        helpingAmount: helping,
        method: d.method || 'bank',
        network: d.network || '',
        walletAddress: d.walletAddress || '',
        depositRef: d.depositRef || '',
        depositNote: d.depositNote || '',
        adminNote: d.adminNote || '',
        transactionRef: d.depositRef || d.transactionRef || '',
        status: d.status,
        processedBy: d.processedBy || '',
        processedAt: d.processedAt,
        createdAt: d.createdAt,
        date,
        isToday: dTime >= dayStart,
        isWeek: dTime >= weekStart,
        isMonth: dTime >= monthStart,
        isYear: dTime >= yearStart,
      };
    });

    let filtered = allTransactions;
    if (period === 'today') {
      filtered = filtered.filter((t) => t.isToday);
    } else if (period === 'week') {
      filtered = filtered.filter((t) => t.isWeek);
    } else if (period === 'month') {
      filtered = filtered.filter((t) => t.isMonth);
    } else if (period === 'year') {
      filtered = filtered.filter((t) => t.isYear);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter((t) =>
        (t.storeName && t.storeName.toLowerCase().includes(q)) ||
        (t.ownerName && t.ownerName.toLowerCase().includes(q)) ||
        (t.email && t.email.toLowerCase().includes(q)) ||
        (t.depositRef && t.depositRef.toLowerCase().includes(q)) ||
        (t.transactionRef && t.transactionRef.toLowerCase().includes(q)) ||
        (t.method && t.method.toLowerCase().includes(q)) ||
        (t.depositNote && t.depositNote.toLowerCase().includes(q))
      );
    }

    const filteredTotalNet = filtered.reduce((acc, t) => acc + t.netUsdt, 0);
    const filteredGross = filtered.reduce((acc, t) => acc + t.grossAmount, 0);
    const filteredHelping = filtered.reduce((acc, t) => acc + t.helpingAmount, 0);
    const uniqueSellersCount = new Set(filtered.map((t) => String(t.sellerId))).size;

    res.json({
      transactions: filtered,
      summary: {
        totalNet: filteredTotalNet,
        grossAmount: filteredGross,
        helpingAmount: filteredHelping,
        count: filtered.length,
        uniqueSellers: uniqueSellersCount,
      },
      counts: {
        all: allTransactions.length,
        today: allTransactions.filter((t) => t.isToday).length,
        week: allTransactions.filter((t) => t.isWeek).length,
        month: allTransactions.filter((t) => t.isMonth).length,
      },
      globalTotals: {
        total: allTotalNet,
        today: allTodayNet,
        week: allWeekNet,
        month: allMonthNet,
        grossDeposits: allGross,
        helpingAmount: allHelping,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/analytics/reports — Super Admin Analytics & Visual Reports
router.get('/reports', authAdmin('reports'), async (req, res) => {
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
      since = new Date('2024-01-01T00:00:00.000Z');
      numDays = Math.max(1, Math.round((until - since) / (1000 * 60 * 60 * 24)));
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
    } else if (numDays <= 1825) {
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
      else if (['processing', 'packed', 'out_from_warehouse', 'delivery_warehouse', 'shipped', 'out_for_delivery', 'delivery_failed', 'returned_to_warehouse', 'confirmed'].includes(order.status)) {
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
        else if (numDays <= 1825) bucketKey = `${oDate.getFullYear()}-${String(oDate.getMonth() + 1).padStart(2, '0')}`;
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
