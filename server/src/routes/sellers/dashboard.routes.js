import express from 'express';
import Seller from '../../models/Seller.js';
import Product from '../../models/Product.js';
import Order from '../../models/Order.js';
import Refund from '../../models/Refund.js';
import Withdrawal from '../../models/Withdrawal.js';
import { authSeller } from '../../middleware/auth.js';
import { profitRateFor } from '../../utils/sellerTier.js';
import { maskName } from '../../utils/orderPrivacy.js';
import { refundFilterFor } from './refunds.routes.js';

const router = express.Router();

// What one order means for this store (only the store's own items count)
const ACTIVE_STATUSES = ['pending', 'confirmed', 'processing', 'packed'];
const sameId = (a, b) => Boolean(a) && Boolean(b) && a.toString() === b.toString();
// `rate`: the % a not-yet-locked item will earn (the store's tier); locked / paid items keep theirs
function storeSideOf(ord, sellerId, rate) {
  const items = (ord.items || []).filter((it) => sameId(it.seller, sellerId));
  let total = 0;
  let profit = 0;
  let qty = 0;
  for (const it of items) {
    const q = it.qty || 1;
    const line = (it.price || 0) * q;
    total += line;
    qty += q;
    if (it.profitAmount > 0) profit += it.profitAmount;
    else if (rate && !it.processingLocked && !it.payoutSettled) profit += (line * rate) / 100;
    else profit += (line * (it.profitRate || 20)) / 100;
  }
  const status = items[0]?.itemStatus || ord.status || 'pending';
  return { items, total, profit, qty, status };
}

// the order fields the dashboard needs (full orders carry a lot more)
const ORDER_FIELDS = 'orderNumber status createdAt items.seller items.product items.name items.image items.price items.qty items.costPrice items.itemStatus items.profitAmount items.profitRate shippingAddress.fullName shippingAddress.city';

// GET /api/sellers/dashboard
router.get('/dashboard', authSeller, async (req, res) => {
  try {
    const sellerId = req.seller.id;
    // perf: the independent reads run in parallel, as plain objects, with only the fields used
    // (the KYC pictures are never selected by default, see models/Seller.js)
    const [seller, products, orders, refundCount] = await Promise.all([
      Seller.findById(sellerId).lean(),
      Product.find({ seller: sellerId }).select('name image stock lowStockThreshold').lean(),
      Order.find({ 'items.seller': sellerId }).select(ORDER_FIELDS).sort({ createdAt: -1 }).lean(),
      refundFilterFor(sellerId).then((f) => Refund.countDocuments(f)),
    ]);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const totalProducts = products.length;
    const lowStockProducts = products.filter((p) => (p.stock || 0) <= (p.lowStockThreshold ?? 5));

    let grossRevenue = 0;
    let totalCost = 0;
    let totalItemsSold = 0;
    let pendingOrdersCount = 0; // orders (not item lines) still waiting to be fulfilled
    let awaitingConfirmation = 0; // orders the store has not confirmed yet
    const statusCounts = { delivered: 0, inTransit: 0, preparing: 0, pending: 0, cancelled: 0, refunded: 0 };
    const productSalesMap = {};

    for (const ord of orders) {
      const side = storeSideOf(ord, sellerId);
      if (!side.items.length) continue;
      const st = side.status;
      const closed = st === 'cancelled' || st === 'refunded' || ord.status === 'cancelled' || ord.status === 'refunded';

      if (!closed) {
        for (const item of side.items) {
          const q = item.qty || 1;
          const line = (item.price || 0) * q;
          grossRevenue += line;
          totalCost += (item.costPrice || 0) * q;
          totalItemsSold += q;
          const prodId = item.product?.toString() || item.name;
          if (!productSalesMap[prodId]) productSalesMap[prodId] = { id: prodId, name: item.name, image: item.image, qty: 0, revenue: 0 };
          productSalesMap[prodId].qty += q;
          productSalesMap[prodId].revenue += line;
        }
      }

      if (ACTIVE_STATUSES.includes(st)) pendingOrdersCount++;
      if (st === 'pending') awaitingConfirmation++;

      if (st === 'delivered') statusCounts.delivered++;
      else if (st === 'cancelled') statusCounts.cancelled++;
      else if (st === 'refunded') statusCounts.refunded++;
      else if (st === 'pending') statusCounts.pending++;
      else if (['confirmed', 'processing', 'packed'].includes(st)) statusCounts.preparing++;
      else statusCounts.inTransit++;
    }

    const commissionPercent = seller.commissionRate || 10;
    const platformCommission = (grossRevenue * commissionPercent) / 100;
    const netProfit = grossRevenue - totalCost - platformCommission;

    const topProducts = Object.values(productSalesMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Daily sales, last 14 days (kept for older app builds; the web dashboard draws its charts
    // from /dashboard/activity in the store's own time zone)
    const since14 = new Date();
    since14.setUTCHours(0, 0, 0, 0);
    since14.setUTCDate(since14.getUTCDate() - 13);
    const dayMap = {};
    for (let i = 0; i < 14; i++) {
      const d = new Date(since14);
      d.setUTCDate(d.getUTCDate() + i);
      const key = d.toISOString().split('T')[0];
      dayMap[key] = { date: d.toLocaleDateString('en-PK', { timeZone: 'UTC', month: 'short', day: 'numeric' }), rawDate: key, revenue: 0, orders: 0 };
    }
    for (const ord of orders) {
      if (!ord.createdAt || new Date(ord.createdAt) < since14) continue;
      const side = storeSideOf(ord, sellerId);
      // same rule as the totals above: cancelled AND refunded orders are not sales
      if (!side.items.length || ['cancelled', 'refunded'].includes(side.status) || ['cancelled', 'refunded'].includes(ord.status)) continue;
      const key = new Date(ord.createdAt).toISOString().split('T')[0];
      if (!dayMap[key]) continue;
      dayMap[key].orders++;
      dayMap[key].revenue += side.total;
    }
    const salesByDay = Object.values(dayMap);

    const securityDepositAmt = seller.securityDeposit?.amount || seller.wallet?.securityDeposit || 0;
    const isSecurityPaid = Boolean(seller.securityDeposit?.paid || securityDepositAmt > 0);
    const wallet = seller.wallet || {};

    res.json({
      seller: {
        _id: seller._id,
        storeName: seller.storeName,
        ownerName: seller.ownerName,
        email: seller.email,
        phone: seller.phone,
        commissionRate: seller.commissionRate,
        rating: seller.rating ?? null,
        status: seller.status,
        tier: seller.tier || 'basic',
        createdAt: seller.createdAt,
        verified: Boolean(seller.verified || seller.status === 'active'),
        wallet: {
          balance: wallet.balance || 0,
          processingFund: wallet.processingFund || 0,
          frozenFund: wallet.frozenFund || 0,
          totalProfitEarned: wallet.totalProfitEarned || 0,
          totalEarned: wallet.totalEarned || 0,
          totalDeposited: wallet.totalDeposited || 0,
          totalWithdrawn: wallet.totalWithdrawn || 0,
          pendingDeposit: wallet.pendingDeposit || 0,
          pendingWithdrawal: wallet.pendingWithdrawal || 0,
          securityDeposit: securityDepositAmt,
        },
        securityDeposit: {
          paid: isSecurityPaid,
          amount: securityDepositAmt,
          paidAt: seller.securityDeposit?.paidAt || null,
          referralCode: seller.securityDeposit?.referralCode || '',
          note: seller.securityDeposit?.note || '',
        },
        accountHealth: seller.accountHealth || { score: 100, status: 'healthy', history: [] },
        // the targets card on the dashboard reads these (they were never sent before)
        targets: seller.targets || [],
      },
      stats: {
        grossRevenue,
        netProfit: Math.max(0, netProfit),
        platformCommission,
        totalCost,
        totalOrders: orders.length,
        totalItemsSold,
        pendingOrders: pendingOrdersCount,
        awaitingConfirmation,
        totalProducts,
        lowStockCount: lowStockProducts.length,
        refundCount,
        availableBalance: wallet.balance || 0,
        processingFund: wallet.processingFund || 0,
        frozenFund: wallet.frozenFund || 0,
        pendingWithdrawal: wallet.pendingWithdrawal || 0,
        pendingDeposit: wallet.pendingDeposit || 0,
        totalProfitEarned: wallet.totalProfitEarned || 0,
        totalEarned: wallet.totalEarned || 0,
        totalWithdrawn: wallet.totalWithdrawn || 0,
        securityDeposit: securityDepositAmt,
        securityDepositPaid: isSecurityPaid,
        securityDepositDate: seller.securityDeposit?.paidAt || null,
        referralCode: seller.securityDeposit?.referralCode || '',
      },
      statusCounts,
      salesByDay,
      topProducts,
      recentOrders: orders.slice(0, 6).map((o) => ({ ...o, shippingAddress: { fullName: maskName(o.shippingAddress?.fullName), city: o.shippingAddress?.city || '' } })),
      lowStockProducts: lowStockProducts.slice(0, 5),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sellers/dashboard/activity?from=ISO&to=ISO
// Everything that happened to the store in a time window, one compact line per event, for the
// dashboard charts and calendar. The browser groups the lines into days in the store's own time
// zone, so a day on the calendar is the seller's day (not a UTC day).
router.get('/dashboard/activity', authSeller, async (req, res) => {
  try {
    const sellerId = req.seller.id;
    const to = req.query.to ? new Date(req.query.to) : new Date();
    const from = req.query.from ? new Date(req.query.from) : new Date(to.getTime() - 90 * 86400000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      return res.status(400).json({ message: 'Invalid date range' });
    }
    if (to - from > 400 * 86400000) return res.status(400).json({ message: 'Date range is too long (max 400 days)' });

    const [tierDoc, orders, moves] = await Promise.all([
      Seller.findById(sellerId).select('tier tierSince').lean(),
      Order.find({ 'items.seller': sellerId, createdAt: { $gte: from, $lte: to } })
        .select('orderNumber status createdAt items.seller items.name items.price items.qty items.itemStatus items.profitAmount items.profitRate items.processingLocked items.payoutSettled shippingAddress.city')
        .sort({ createdAt: 1 })
        .lean(),
      // money that really moved: approved deposits / payouts and the order payouts (with profit)
      Withdrawal.find({
        seller: sellerId,
        $or: [
          { type: { $in: ['deposit', 'withdrawal'] }, status: { $in: ['approved', 'completed'] }, purpose: { $nin: ['diamond_fee'] } },
          { type: 'order_delivered_release' },
        ],
        $and: [{ $or: [{ processedAt: { $gte: from, $lte: to } }, { processedAt: null, createdAt: { $gte: from, $lte: to } }, { processedAt: { $exists: false }, createdAt: { $gte: from, $lte: to } }] }],
      })
        .select('type amount approvedAmount profitAmount orderNumber status createdAt processedAt')
        .lean(),
    ]);

    const orderLines = [];
    for (const ord of orders) {
      // Diamond 35% only for orders placed after the upgrade (same rule as the order screens)
      const side = storeSideOf(ord, sellerId, profitRateFor(tierDoc, ord));
      if (!side.items.length) continue;
      orderLines.push({
        id: ord._id,
        n: ord.orderNumber || '',
        t: ord.createdAt,
        total: side.total,
        profit: side.profit,
        qty: side.qty,
        status: side.status === 'pending' && ord.status === 'cancelled' ? 'cancelled' : side.status,
        city: ord.shippingAddress?.city || '',
        items: side.items.slice(0, 3).map((it) => `${it.qty || 1}× ${it.name || 'Item'}`),
      });
    }

    const moneyLines = moves
      .map((m) => {
        const t = m.type === 'order_delivered_release' ? m.createdAt : m.processedAt || m.createdAt;
        const amount = m.approvedAmount != null && m.type !== 'order_delivered_release' ? m.approvedAmount : m.amount;
        return { id: m._id, type: m.type, t, amount: Number(amount) || 0, profit: Number(m.profitAmount) || 0, n: m.orderNumber || '' };
      })
      .filter((m) => m.t && new Date(m.t) >= from && new Date(m.t) <= to)
      .sort((a, b) => new Date(a.t) - new Date(b.t));

    res.json({ from, to, orders: orderLines, money: moneyLines });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sellers/analytics?days=30&from=&to=
router.get('/analytics', authSeller, async (req, res) => {
  try {
    const seller = await Seller.findById(req.seller.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    let since = null;
    let until = new Date();
    const daysParam = req.query.days || '30';
    let numDays = 30;

    if (req.query.from && req.query.to) {
      since = new Date(req.query.from);
      until = new Date(new Date(req.query.to).setHours(23, 59, 59, 999));
      numDays = Math.max(1, Math.round((until - since) / (1000 * 60 * 60 * 24)));
    } else if (daysParam === 'all') {
      since = seller.createdAt ? new Date(seller.createdAt) : new Date('2024-01-01');
      since.setUTCHours(0, 0, 0, 0);
      numDays = Math.max(1, Math.round((until - since) / (1000 * 60 * 60 * 24)));
    } else {
      numDays = parseInt(daysParam, 10) || 30;
      since = new Date(Date.now() - numDays * 24 * 60 * 60 * 1000);
      since.setUTCHours(0, 0, 0, 0);
    }

    // Orders in selected timeframe
    const orders = await Order.find({
      'items.seller': seller._id,
      createdAt: { $gte: since, $lte: until },
    }).sort({ createdAt: 1 });

    // Refunds in selected timeframe
    const refunds = await Refund.find({ seller: seller._id, createdAt: { $gte: since, $lte: until } });
    const refundAmount = refunds.reduce((s, r) => s + (r.amount || 0), 0);

    // Fetch withdrawals info for seller
    const [approvedWds, pendingWds] = await Promise.all([
      Withdrawal.find({ seller: seller._id, type: 'withdrawal', status: { $in: ['approved', 'completed'] } }),
      Withdrawal.find({ seller: seller._id, type: 'withdrawal', status: 'pending' }),
    ]);

    const totalWithdrawnFromReqs = approvedWds.reduce((s, w) => s + (w.amount || 0), 0);
    const totalWithdrawn = Math.max(seller.wallet?.totalWithdrawn || 0, totalWithdrawnFromReqs);

    const pendingWithdrawalsAmount = pendingWds.reduce((s, w) => s + (w.amount || 0), 0);
    const pendingWithdrawals = Math.max(seller.wallet?.pendingWithdrawal || 0, pendingWithdrawalsAmount);

    // Active Processing fund
    const processingFund = seller.wallet?.processingFund || 0;

    // Time-series buckets pre-population
    const buckets = {};
    const cur = new Date(since);
    cur.setUTCHours(0, 0, 0, 0);
    const end = new Date(until);
    end.setUTCHours(23, 59, 59, 999);

    if (numDays <= 90) {
      // Daily buckets
      while (cur <= end) {
        const key = cur.toISOString().split('T')[0];
        const label = cur.toLocaleDateString('en-US', { timeZone: 'UTC', day: 'numeric', month: 'short' });
        buckets[key] = { date: key, label, sales: 0, profit: 0, orders: 0, items: 0 };
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    } else if (numDays <= 1825) {
      // Monthly buckets (for up to 5 years, e.g. 2024 to 2026 All-Time)
      while (cur <= end) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
        const label = cur.toLocaleDateString('en-PK', { month: 'short', year: '2-digit' });
        if (!buckets[key]) {
          buckets[key] = { date: key, label, sales: 0, profit: 0, orders: 0, items: 0 };
        }
        cur.setMonth(cur.getMonth() + 1);
      }
    } else {
      // Multi-year buckets (for 10y)
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
    let netRevenue = 0;
    let totalSaleProfit = 0;
    let totalItems = 0;
    let deliveredOrdersCount = 0;

    const productMap = {};
    const statusCounts = {
      delivered: 0,
      processing: 0,
      pending: 0,
      cancelled: 0,
      refunded: 0,
    };
    const paymentMap = {};

    for (const order of orders) {
      const isDelivered = order.status === 'delivered';
      const isCancelled = order.status === 'cancelled';
      const isRefunded = order.status === 'refunded';

      if (isDelivered) deliveredOrdersCount++;

      // Status classification for pie chart
      if (isDelivered) statusCounts.delivered++;
      else if (isCancelled) statusCounts.cancelled++;
      else if (isRefunded) statusCounts.refunded++;
      else if (['processing', 'packed', 'out_from_warehouse', 'delivery_warehouse', 'shipped', 'out_for_delivery', 'confirmed'].includes(order.status)) {
        statusCounts.processing++;
      } else {
        statusCounts.pending++;
      }

      // Payment method tally
      const rawPay = (order.paymentMethod || 'cash_on_delivery').toLowerCase();
      let payName = 'Cash On Delivery';
      if (rawPay.includes('upi')) payName = 'UPI Transfer';
      else if (rawPay.includes('bank')) payName = 'Bank Transfer';
      else if (rawPay.includes('wallet')) payName = 'Wallet Balance';
      else if (rawPay.includes('usdt') || rawPay.includes('crypto')) payName = 'USDT / Crypto';
      else if (rawPay.includes('paytm') || rawPay.includes('gpay') || rawPay.includes('phonepe')) payName = 'UPI / Wallets';
      else if (rawPay.includes('card') || rawPay.includes('stripe')) payName = 'Card Payment';
      paymentMap[payName] = (paymentMap[payName] || 0) + 1;

      // Extract seller items
      const sellerItems = (order.items || []).filter((it) => it.seller && it.seller.toString() === seller._id.toString());
      if (!sellerItems.length) continue;

      let orderSellerGross = 0;
      let orderSellerNet = 0;
      let orderSellerProfit = 0;
      let orderSellerItems = 0;

      sellerItems.forEach((item) => {
        const qty = item.qty || 1;
        const price = item.price || 0;
        const costPrice = item.costPrice || 0;
        const itemGross = price * qty;
        const commRate = seller.commissionRate || 10;
        const commission = (itemGross * commRate) / 100;
        const itemNet = itemGross - commission;

        // Profit determination
        let itemProfit = 0;
        if (item.profitAmount && item.profitAmount > 0) {
          itemProfit = item.profitAmount;
        } else if (costPrice > 0) {
          itemProfit = Math.max(0, itemGross - (costPrice * qty) - commission);
        } else {
          // Standard 20% seller profit rate
          const profitRate = item.profitRate || 20;
          itemProfit = (itemGross * profitRate) / 100;
        }

        if (!isCancelled) {
          orderSellerGross += itemGross;
          orderSellerNet += itemNet;
          orderSellerProfit += itemProfit;
          orderSellerItems += qty;

          // Top Products tracking
          const pid = item.product?.toString() || item._id?.toString() || item.name;
          if (!productMap[pid]) {
            productMap[pid] = { _id: pid, name: item.name, image: item.image, sold: 0, revenue: 0, profit: 0 };
          }
          productMap[pid].sold += qty;
          productMap[pid].revenue += Math.round(itemNet);
          productMap[pid].profit += Math.round(itemProfit);
        }
      });

      if (!isCancelled) {
        grossRevenue += orderSellerGross;
        netRevenue += orderSellerNet;
        totalSaleProfit += orderSellerProfit;
        totalItems += orderSellerItems;

        // Map to time series bucket
        const oDate = order.createdAt ? new Date(order.createdAt) : new Date();
        let bucketKey = '';
        if (numDays <= 90) {
          bucketKey = oDate.toISOString().split('T')[0];
        } else if (numDays <= 1825) {
          bucketKey = `${oDate.getFullYear()}-${String(oDate.getMonth() + 1).padStart(2, '0')}`;
        } else {
          const q = Math.floor(oDate.getMonth() / 3) + 1;
          bucketKey = `${oDate.getFullYear()}-Q${q}`;
        }

        if (buckets[bucketKey]) {
          buckets[bucketKey].sales += Math.round(orderSellerNet);
          buckets[bucketKey].profit += Math.round(orderSellerProfit);
          buckets[bucketKey].orders += 1;
          buckets[bucketKey].items += orderSellerItems;
        } else {
          // Fallback if slightly out of precomputed keys
          const label = numDays <= 90
            ? oDate.toLocaleDateString('en-US', { timeZone: 'UTC', day: 'numeric', month: 'short' })
            : numDays <= 1825
              ? oDate.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', year: '2-digit' })
              : `Q${Math.floor(oDate.getMonth() / 3) + 1} '${String(oDate.getFullYear()).slice(-2)}`;
          buckets[bucketKey] = {
            date: bucketKey,
            label,
            sales: Math.round(orderSellerNet),
            profit: Math.round(orderSellerProfit),
            orders: 1,
            items: orderSellerItems,
          };
        }
      }
    }

    const salesOverTime = Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date));

    // Top Products list
    const topProducts = Object.values(productMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Status breakdown for Pie Chart
    const statusBreakdown = [
      { name: 'Delivered', value: statusCounts.delivered, color: '#16a34a' },
      { name: 'In Processing', value: statusCounts.processing, color: '#2563eb' },
      { name: 'Pending Review', value: statusCounts.pending, color: '#f59e0b' },
      { name: 'Cancelled', value: statusCounts.cancelled, color: '#64748b' },
      { name: 'Refunded', value: statusCounts.refunded, color: '#dc2626' },
    ].filter((s) => s.value > 0);

    // Payment breakdown for Pie Chart
    const paymentBreakdown = Object.entries(paymentMap).map(([name, value]) => ({
      name,
      value,
    }));

    // Calculate averages & rates
    const nonCancelledOrders = orders.filter((o) => o.status !== 'cancelled').length;
    const avgOrderValue = nonCancelledOrders ? Math.round(netRevenue / nonCancelledOrders) : 0;
    const fulfilmentRate = orders.length ? Math.round((deliveredOrdersCount / orders.length) * 100) : 0;
    const profitMargin = netRevenue > 0 ? Math.round((totalSaleProfit / netRevenue) * 100) : 20;

    res.json({
      period: daysParam,
      totalRevenue: Math.round(netRevenue),
      grossRevenue: Math.round(grossRevenue),
      totalSaleProfit: Math.round(totalSaleProfit),
      netProfit: Math.round(totalSaleProfit),
      profitMargin,
      totalWithdrawn: Math.round(totalWithdrawn),
      processingFund: Math.round(processingFund),
      pendingWithdrawals: Math.round(pendingWithdrawals),
      pendingWithdrawalsCount: pendingWds.length,
      availableBalance: Math.round(seller.wallet?.balance || 0),
      totalProfitEarned: Math.round(seller.wallet?.totalProfitEarned || totalSaleProfit),
      totalOrders: orders.length,
      totalItems,
      avgOrderValue,
      fulfilmentRate,
      totalRefunds: refunds.length,
      refundAmount: Math.round(refundAmount),
      commissionRate: seller.commissionRate || 10,
      salesOverTime,
      statusBreakdown: statusBreakdown.length ? statusBreakdown : [{ name: 'No Orders', value: 1, color: '#cbd5e1' }],
      paymentBreakdown: paymentBreakdown.length ? paymentBreakdown : [{ name: 'No Data', value: 1 }],
      topProducts,
      orders: orders.slice(-20).reverse().map((o) => ({
        _id: o._id,
        orderNumber: o.orderNumber,
        customer: o.shippingAddress?.fullName ? maskName(o.shippingAddress.fullName) : 'Customer',
        total: o.total,
        status: o.status,
        paymentMethod: o.paymentMethod || 'Cash On Delivery',
        createdAt: o.createdAt,
        itemsCount: (o.items || []).filter((it) => it.seller?.toString() === seller._id.toString()).length,
      })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
