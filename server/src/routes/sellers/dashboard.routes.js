import express from 'express';
import Seller from '../../models/Seller.js';
import Product from '../../models/Product.js';
import Order from '../../models/Order.js';
import Refund from '../../models/Refund.js';
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

// GET /api/sellers/analytics?days=30
router.get('/analytics', authSeller, async (req, res) => {
  try {
    const seller = await Seller.findById(req.seller.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const days = parseInt(req.query.days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const orders = await Order.find({
      'items.seller': seller._id,
      createdAt: { $gte: since },
    }).sort({ createdAt: -1 });

    let totalRevenue = 0;
    let totalItems = 0;
    const productMap = {};
    let deliveredCount = 0;

    for (const order of orders) {
      if (order.status === 'delivered') deliveredCount++;
      for (const item of order.items) {
        if (item.seller?.toString() === seller._id.toString()) {
          const gross = item.price * item.qty;
          const commission = (gross * (seller.commissionRate || 10)) / 100;
          const net = gross - commission;
          totalRevenue += net;
          totalItems += item.qty;

          const pid = item.product?.toString() || item._id?.toString();
          if (!productMap[pid]) productMap[pid] = { name: item.name, sold: 0, revenue: 0 };
          productMap[pid].sold += item.qty;
          productMap[pid].revenue += net;
        }
      }
    }

    const refunds = await Refund.find({ seller: seller._id, createdAt: { $gte: since } });
    const refundAmount = refunds.reduce((s, r) => s + (r.amount || 0), 0);

    const topProducts = Object.entries(productMap)
      .map(([id, v]) => ({ _id: id, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const avgOrderValue = orders.length ? totalRevenue / orders.length : 0;
    const fulfilmentRate = orders.length ? Math.round((deliveredCount / orders.length) * 100) : 0;

    res.json({
      totalRevenue,
      totalOrders: orders.length,
      totalItems,
      avgOrderValue,
      fulfilmentRate,
      totalRefunds: refunds.length,
      refundAmount,
      commissionRate: seller.commissionRate || 10,
      topProducts,
      orders: orders.slice(0, 20),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
