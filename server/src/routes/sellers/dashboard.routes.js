import express from 'express';
import Seller from '../../models/Seller.js';
import Product from '../../models/Product.js';
import Order from '../../models/Order.js';
import Refund from '../../models/Refund.js';
import Withdrawal from '../../models/Withdrawal.js';
import { authSeller } from '../../middleware/auth.js';

const router = express.Router();

// GET /api/sellers/dashboard
router.get('/dashboard', authSeller, async (req, res) => {
  try {
    const sellerId = req.seller.id;
    const seller = await Seller.findById(sellerId);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    // Products by this seller
    const products = await Product.find({ seller: sellerId });
    const totalProducts = products.length;
    const lowStockProducts = products.filter((p) => (p.stock || 0) <= (p.lowStockThreshold || 5));

    // Orders containing items from this seller
    const orders = await Order.find({ 'items.seller': sellerId }).sort({ createdAt: -1 });

    let grossRevenue = 0;
    let totalCost = 0;
    let totalItemsSold = 0;
    let pendingOrdersCount = 0;

    const productSalesMap = {};

    orders.forEach((ord) => {
      const sellerItems = ord.items.filter((it) => it.seller && it.seller.toString() === sellerId.toString());
      sellerItems.forEach((item) => {
        const itemTotal = (item.price || 0) * (item.qty || 1);
        const itemCost = (item.costPrice || 0) * (item.qty || 1);

        if (ord.status !== 'cancelled' && ord.status !== 'refunded') {
          grossRevenue += itemTotal;
          totalCost += itemCost;
          totalItemsSold += item.qty || 1;

          const prodId = item.product?.toString() || item.name;
          if (!productSalesMap[prodId]) {
            productSalesMap[prodId] = { id: prodId, name: item.name, image: item.image, qty: 0, revenue: 0 };
          }
          productSalesMap[prodId].qty += item.qty || 1;
          productSalesMap[prodId].revenue += itemTotal;
        }

        if (['pending', 'confirmed', 'processing', 'packed'].includes(item.itemStatus || ord.status)) {
          pendingOrdersCount++;
        }
      });
    });

    // Commission deducted
    const commissionPercent = seller.commissionRate || 10;
    const platformCommission = (grossRevenue * commissionPercent) / 100;
    const netProfit = grossRevenue - totalCost - platformCommission;

    // Refunds for this seller
    const refunds = await Refund.find({ seller: sellerId });
    const refundCount = refunds.length;

    // Top selling products
    const topProducts = Object.values(productSalesMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Daily sales breakdown (last 14 days)
    const salesByDay = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const displayDate = d.toLocaleDateString('en-PK', { month: 'short', day: 'numeric' });

      let dayRevenue = 0;
      let dayOrders = 0;

      orders.forEach((ord) => {
        const ordDate = ord.createdAt ? new Date(ord.createdAt).toISOString().split('T')[0] : '';
        if (ordDate === dateStr && ord.status !== 'cancelled') {
          const sellerItems = ord.items.filter((it) => it.seller && it.seller.toString() === sellerId.toString());
          if (sellerItems.length) {
            dayOrders++;
            sellerItems.forEach((it) => {
              dayRevenue += (it.price || 0) * (it.qty || 1);
            });
          }
        }
      });

      salesByDay.push({ date: displayDate, rawDate: dateStr, revenue: dayRevenue, orders: dayOrders });
    }

    const securityDepositAmt = seller.securityDeposit?.amount || seller.wallet?.securityDeposit || 0;
    const isSecurityPaid = Boolean(seller.securityDeposit?.paid || securityDepositAmt > 0);

    res.json({
      seller: {
        _id: seller._id,
        storeName: seller.storeName,
        ownerName: seller.ownerName,
        email: seller.email,
        phone: seller.phone,
        commissionRate: seller.commissionRate,
        rating: seller.rating,
        status: seller.status,
        wallet: {
          ...(seller.wallet ? (seller.wallet.toObject ? seller.wallet.toObject() : seller.wallet) : {}),
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
      },
      stats: {
        grossRevenue,
        netProfit: Math.max(0, netProfit),
        platformCommission,
        totalCost,
        totalOrders: orders.length,
        totalItemsSold,
        pendingOrders: pendingOrdersCount,
        totalProducts,
        lowStockCount: lowStockProducts.length,
        refundCount,
        availableBalance: seller.wallet?.balance || 0,
        processingFund: seller.wallet?.processingFund || 0,
        totalProfitEarned: seller.wallet?.totalProfitEarned || 0,
        totalEarned: seller.wallet?.totalEarned || 0,
        securityDeposit: securityDepositAmt,
        securityDepositPaid: isSecurityPaid,
        securityDepositDate: seller.securityDeposit?.paidAt || null,
        referralCode: seller.securityDeposit?.referralCode || '',
      },
      salesByDay,
      topProducts,
      recentOrders: orders.slice(0, 6),
      lowStockProducts: lowStockProducts.slice(0, 5),
    });
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
      since = new Date(0);
      numDays = 3650;
    } else {
      numDays = parseInt(daysParam, 10) || 30;
      since = new Date(Date.now() - numDays * 24 * 60 * 60 * 1000);
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
      Withdrawal.find({ seller: seller._id, type: 'withdrawal', status: 'approved' }),
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
    cur.setHours(0, 0, 0, 0);
    const end = new Date(until);
    end.setHours(23, 59, 59, 999);

    if (numDays <= 90) {
      // Daily buckets
      while (cur <= end) {
        const key = cur.toISOString().split('T')[0];
        const label = cur.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
        buckets[key] = { date: key, label, sales: 0, profit: 0, orders: 0, items: 0 };
        cur.setDate(cur.getDate() + 1);
      }
    } else if (numDays <= 730) {
      // Monthly buckets (for 1 year - 2 years)
      while (cur <= end) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
        const label = cur.toLocaleDateString('en-PK', { month: 'short', year: '2-digit' });
        if (!buckets[key]) {
          buckets[key] = { date: key, label, sales: 0, profit: 0, orders: 0, items: 0 };
        }
        cur.setMonth(cur.getMonth() + 1);
      }
    } else {
      // Multi-year buckets (for 5y, 10y, all-time)
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
      else if (['processing', 'packed', 'shipped', 'out_for_delivery', 'confirmed'].includes(order.status)) {
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
        } else if (numDays <= 730) {
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
            ? oDate.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })
            : numDays <= 730
              ? oDate.toLocaleDateString('en-PK', { month: 'short', year: '2-digit' })
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
        customer: o.contact?.email || o.shippingAddress?.fullName || 'Guest',
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
