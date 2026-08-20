import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Seller from '../models/Seller.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import Refund from '../models/Refund.js';
import Category from '../models/Category.js';
import SellerCoupon from '../models/SellerCoupon.js';
import SellerShippingMethod from '../models/SellerShipping.js';
import Withdrawal from '../models/Withdrawal.js';
import { Conversation, Message } from '../models/Chat.js';
import { authAdmin, authSeller, authSellerOrAdmin } from '../middleware/auth.js';
import { nextSeq } from '../models/System.js';
import { notify } from '../utils/notify.js';
import { audit } from '../utils/audit.js';

const router = express.Router();

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
}

// ----------------------------------------------------
// 1. SELLER AUTHENTICATION
// ----------------------------------------------------

// POST /api/sellers/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

    const seller = await Seller.findOne({ email: email.toLowerCase().trim() });
    if (!seller) return res.status(401).json({ message: 'Invalid email or password' });

    if (seller.status === 'suspended') {
      return res.status(403).json({ message: 'Your seller account has been suspended. Please contact platform admin.' });
    }

    const match = await bcrypt.compare(password, seller.passwordHash);
    if (!match) return res.status(401).json({ message: 'Invalid email or password' });

    seller.lastLoginAt = new Date();
    await seller.save();

    const token = jwt.sign(
      {
        id: seller._id,
        t: 'seller',
        storeName: seller.storeName,
        email: seller.email,
        storeSlug: seller.storeSlug,
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    const safeSeller = seller.toObject();
    delete safeSeller.passwordHash;

    res.json({ token, seller: safeSeller });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sellers/me
router.get('/me', authSeller, async (req, res) => {
  try {
    const seller = await Seller.findById(req.seller.id).select('-passwordHash');
    if (!seller) return res.status(404).json({ message: 'Seller not found' });
    res.json(seller);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/sellers/me
router.put('/me', authSeller, async (req, res) => {
  try {
    const seller = await Seller.findById(req.seller.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const { storeName, ownerName, phone, description, address, bankDetails, logo, banner } = req.body;
    if (storeName) seller.storeName = storeName;
    if (ownerName) seller.ownerName = ownerName;
    if (phone !== undefined) seller.phone = phone;
    if (description !== undefined) seller.description = description;
    if (logo !== undefined) seller.logo = logo;
    if (banner !== undefined) seller.banner = banner;
    if (address) seller.address = { ...seller.address, ...address };
    if (bankDetails) seller.bankDetails = { ...seller.bankDetails, ...bankDetails };

    await seller.save();
    const safeSeller = seller.toObject();
    delete safeSeller.passwordHash;
    res.json(safeSeller);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/me/change-password (Seller updates their own password)
router.post('/me/change-password', authSeller, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters long' });
    }

    const seller = await Seller.findById(req.seller.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const match = await bcrypt.compare(currentPassword, seller.passwordHash);
    if (!match) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    seller.passwordHash = await bcrypt.hash(newPassword, 10);
    await seller.save();

    res.json({ ok: true, message: 'Password updated successfully! ✅' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ----------------------------------------------------
// 2. SELLER DASHBOARD & ANALYTICS
// ----------------------------------------------------

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

    res.json({
      seller: {
        _id: seller._id,
        storeName: seller.storeName,
        ownerName: seller.ownerName,
        email: seller.email,
        commissionRate: seller.commissionRate,
        rating: seller.rating,
        status: seller.status,
        wallet: seller.wallet || {},
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

// ----------------------------------------------------
// 3. SELLER PRODUCT MANAGEMENT
// ----------------------------------------------------

// GET /api/sellers/products
router.get('/products', authSeller, async (req, res) => {
  try {
    const products = await Product.find({ seller: req.seller.id })
      .populate('category', 'name slug')
      .sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/products
router.post('/products', authSeller, async (req, res) => {
  try {
    const seller = await Seller.findById(req.seller.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const data = req.body;
    let baseSlug = slugify(data.name || 'product');
    let slug = baseSlug;
    let counter = 1;
    while (await Product.findOne({ slug })) {
      slug = `${baseSlug}-${counter++}`;
    }

    const images = Array.isArray(data.images)
      ? data.images.map((img) => (typeof img === 'string' ? { url: img, key: null } : img))
      : data.image
      ? [{ url: data.image, key: null }]
      : [{ url: '/img/products/serum.svg', key: null }];

    const product = new Product({
      ...data,
      slug,
      seller: seller._id,
      sellerName: seller.storeName,
      sellerSlug: seller.storeSlug || slugify(seller.storeName),
      images,
      image: images[0]?.url || '',
      costs: {
        purchase: Number(data.costPrice || data.costs?.purchase || 0),
        delivery: Number(data.costs?.delivery || 0),
        packaging: Number(data.costs?.packaging || 0),
        tax: Number(data.costs?.tax || 0),
        other: Number(data.costs?.other || 0),
      },
    });

    await product.save();
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/sellers/products/:id
router.put('/products/:id', authSeller, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, seller: req.seller.id });
    if (!product) return res.status(404).json({ message: 'Product not found or access denied' });

    const data = req.body;
    Object.assign(product, data);

    if (data.costPrice !== undefined) {
      product.costs.purchase = Number(data.costPrice);
    }
    if (data.images && Array.isArray(data.images)) {
      product.images = data.images.map((img) => (typeof img === 'string' ? { url: img, key: null } : img));
      if (product.images.length) product.image = product.images[0].url;
    }

    await product.save();
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/sellers/products/:id
router.delete('/products/:id', authSeller, async (req, res) => {
  try {
    const product = await Product.findOneAndDelete({ _id: req.params.id, seller: req.seller.id });
    if (!product) return res.status(404).json({ message: 'Product not found or access denied' });
    res.json({ ok: true, message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ----------------------------------------------------
// 4. SELLER ORDER MANAGEMENT
// ----------------------------------------------------

// ----------------------------------------------------
// FINANCIAL SETTLEMENT HELPERS (PROCESSING FUND & 20% PROFIT)
// ----------------------------------------------------

/**
 * 1. Lock Order Processing Fund:
 * When seller or admin confirms an order, deducts item total amount from available balance
 * and moves it into seller.wallet.processingFund.
 */
export async function lockSellerOrderFund(app, sellerId, order) {
  const seller = await Seller.findById(sellerId);
  if (!seller) return { totalToLock: 0, itemsLocked: 0 };

  seller.wallet = seller.wallet || {};
  let totalToLock = 0;
  let itemsLocked = 0;

  order.items.forEach((it) => {
    if (it.seller && it.seller.toString() === sellerId.toString()) {
      if (!it.processingLocked && !it.payoutSettled) {
        const itemVal = (it.price || 0) * (it.qty || 1);
        it.processingLocked = true;
        it.lockedAmount = itemVal;
        it.profitRate = 20; // 20% profit margin
        it.profitAmount = Number((itemVal * 0.20).toFixed(2));
        totalToLock += itemVal;
        itemsLocked++;
      }
    }
  });

  if (totalToLock > 0) {
    // Deduct from available balance & add to processing fund
    seller.wallet.balance = (seller.wallet.balance || 0) - totalToLock;
    seller.wallet.processingFund = (seller.wallet.processingFund || 0) + totalToLock;
    await seller.save();

    // Create ledger transaction
    await Withdrawal.create({
      type: 'order_processing_lock',
      seller: seller._id,
      storeName: seller.storeName,
      amount: totalToLock,
      principalAmount: totalToLock,
      profitAmount: Number((totalToLock * 0.20).toFixed(2)),
      profitRate: 20,
      order: order._id,
      orderNumber: order.orderNumber,
      status: 'completed',
      balanceAfter: seller.wallet.balance,
      processingFundAfter: seller.wallet.processingFund,
      adminNote: `Order #${order.orderNumber} Confirmed — $${totalToLock.toFixed(2)} moved to Processing Fund (20% Profit on Delivery: +$${(totalToLock * 0.20).toFixed(2)})`,
      processedAt: new Date(),
    });

    if (app) {
      notify(app, {
        recipientType: 'seller',
        sellerId: seller._id.toString(),
        type: 'order',
        title: `⚡ Order #${order.orderNumber} Confirmed`,
        body: `$${totalToLock.toFixed(2)} moved to Processing Fund. You will earn +$${(totalToLock * 0.20).toFixed(2)} (20% profit) upon delivery! Total return: $${(totalToLock * 1.20).toFixed(2)}.`,
        link: '/seller/orders',
      });

      app.get('io')?.to(`seller:${seller._id}`).emit('wallet:update', {
        balance: seller.wallet.balance,
        processingFund: seller.wallet.processingFund,
      });
    }
  }

  return { totalToLock, itemsLocked };
}

/**
 * 2. Release Delivered Order Fund (Principal + 20% Profit):
 * When order is delivered, releases locked processing fund + 20% profit directly into available balance!
 */
export async function releaseSellerOrderDelivered(app, sellerId, order) {
  const seller = await Seller.findById(sellerId);
  if (!seller) return { totalPrincipal: 0, totalProfit: 0, totalPayout: 0, settledItems: 0 };

  seller.wallet = seller.wallet || {};
  let totalPrincipal = 0;
  let totalProfit = 0;
  let totalPayout = 0;
  let settledItems = 0;

  order.items.forEach((it) => {
    if (it.seller && it.seller.toString() === sellerId.toString()) {
      if (!it.payoutSettled) {
        const itemVal = it.lockedAmount || (it.price || 0) * (it.qty || 1);
        const itemProfit = it.profitAmount || Number((itemVal * 0.20).toFixed(2));
        const itemReturn = itemVal + itemProfit;

        it.payoutSettled = true;
        it.settledAt = new Date();
        it.lockedAmount = itemVal;
        it.profitAmount = itemProfit;

        totalPrincipal += itemVal;
        totalProfit += itemProfit;
        totalPayout += itemReturn;
        settledItems++;
      }
    }
  });

  if (totalPayout > 0) {
    // Release from processing fund
    seller.wallet.processingFund = Math.max(0, (seller.wallet.processingFund || 0) - totalPrincipal);
    // Credit full payout ($100 principal + $20 profit = $120) to available balance
    seller.wallet.balance = (seller.wallet.balance || 0) + totalPayout;
    seller.wallet.totalProfitEarned = (seller.wallet.totalProfitEarned || 0) + totalProfit;
    seller.wallet.totalEarned = (seller.wallet.totalEarned || 0) + totalPayout;
    await seller.save();

    // Create ledger transaction
    await Withdrawal.create({
      type: 'order_delivered_release',
      seller: seller._id,
      storeName: seller.storeName,
      amount: totalPayout,
      principalAmount: totalPrincipal,
      profitAmount: totalProfit,
      profitRate: 20,
      order: order._id,
      orderNumber: order.orderNumber,
      status: 'completed',
      balanceAfter: seller.wallet.balance,
      processingFundAfter: seller.wallet.processingFund,
      adminNote: `Order #${order.orderNumber} Delivered — $${totalPrincipal.toFixed(2)} Processing Fund released + $${totalProfit.toFixed(2)} Profit (20%) credited! Total: +$${totalPayout.toFixed(2)}`,
      processedAt: new Date(),
    });

    if (app) {
      notify(app, {
        recipientType: 'seller',
        sellerId: seller._id.toString(),
        type: 'order',
        title: `🎉 Order #${order.orderNumber} Delivered & Settled!`,
        body: `+$${totalPayout.toFixed(2)} credited to your wallet! ($${totalPrincipal.toFixed(2)} processing release + $${totalProfit.toFixed(2)} 20% profit).`,
        link: '/seller/wallet',
      });

      app.get('io')?.to(`seller:${seller._id}`).emit('wallet:update', {
        balance: seller.wallet.balance,
        processingFund: seller.wallet.processingFund,
        totalProfitEarned: seller.wallet.totalProfitEarned,
      });
    }
  }

  return { totalPrincipal, totalProfit, totalPayout, settledItems };
}

/**
 * 3. Release Cancelled Order Fund:
 * Returns locked processing fund back to available balance without profit/loss.
 */
export async function releaseSellerOrderCancelled(app, sellerId, order) {
  const seller = await Seller.findById(sellerId);
  if (!seller) return;

  seller.wallet = seller.wallet || {};
  let totalToRefund = 0;

  order.items.forEach((it) => {
    if (it.seller && it.seller.toString() === sellerId.toString()) {
      if (it.processingLocked && !it.payoutSettled) {
        totalToRefund += it.lockedAmount || (it.price || 0) * (it.qty || 1);
        it.processingLocked = false;
        it.lockedAmount = 0;
        it.profitAmount = 0;
      }
    }
  });

  if (totalToRefund > 0) {
    seller.wallet.processingFund = Math.max(0, (seller.wallet.processingFund || 0) - totalToRefund);
    seller.wallet.balance = (seller.wallet.balance || 0) + totalToRefund;
    await seller.save();

    await Withdrawal.create({
      type: 'order_cancelled_release',
      seller: seller._id,
      storeName: seller.storeName,
      amount: totalToRefund,
      principalAmount: totalToRefund,
      profitAmount: 0,
      order: order._id,
      orderNumber: order.orderNumber,
      status: 'completed',
      balanceAfter: seller.wallet.balance,
      processingFundAfter: seller.wallet.processingFund,
      adminNote: `Order #${order.orderNumber} Cancelled — $${totalToRefund.toFixed(2)} returned to Available Balance from Processing Fund`,
      processedAt: new Date(),
    });

    if (app) {
      app.get('io')?.to(`seller:${seller._id}`).emit('wallet:update', {
        balance: seller.wallet.balance,
        processingFund: seller.wallet.processingFund,
      });
    }
  }
}

// ----------------------------------------------------
// 4. SELLER ORDER MANAGEMENT
// ----------------------------------------------------

// GET /api/sellers/orders
router.get('/orders', authSeller, async (req, res) => {
  try {
    const orders = await Order.find({ 'items.seller': req.seller.id })
      .populate('items.product', 'name sku image')
      .sort({ createdAt: -1 });

    // Filter items to show only this seller's items and item totals
    const formatted = orders.map((ord) => {
      const sellerItems = ord.items.filter((it) => it.seller && it.seller.toString() === req.seller.id.toString());
      const sellerTotal = sellerItems.reduce((acc, it) => acc + (it.price || 0) * (it.qty || 1), 0);
      const sellerProfit = Number((sellerTotal * 0.20).toFixed(2));
      const sellerReturn = Number((sellerTotal * 1.20).toFixed(2));
      const isLocked = sellerItems.some((it) => it.processingLocked);
      const isSettled = sellerItems.every((it) => it.payoutSettled);

      return {
        ...ord.toObject(),
        sellerItems,
        sellerTotal,
        sellerProfit,
        sellerReturn,
        isLocked,
        isSettled,
      };
    });

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/orders/:id/confirm (Dedicated 1-Click Order Confirm Action)
router.post('/orders/:id/confirm', authSeller, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    let updatedAny = false;
    order.items.forEach((it) => {
      if (it.seller && it.seller.toString() === req.seller.id.toString()) {
        it.itemStatus = 'confirmed';
        updatedAny = true;
      }
    });

    if (!updatedAny) return res.status(403).json({ message: 'No items belonging to you found in this order' });

    // Lock processing funds
    await lockSellerOrderFund(req.app, req.seller.id, order);

    const allStatuses = order.items.map((it) => it.itemStatus || order.status);
    if (allStatuses.every((s) => s === 'confirmed')) {
      order.status = 'confirmed';
    }

    order.statusHistory.push({
      status: 'confirmed',
      note: `Confirmed by seller (${req.seller.storeName}) — Funds moved to Processing`,
      at: new Date(),
      by: req.seller.storeName,
    });

    await order.save();
    res.json({ ok: true, order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/sellers/orders/:id/status
router.put('/orders/:id/status', authSeller, async (req, res) => {
  try {
    const { status, trackingNumber, note } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    let updatedAny = false;
    order.items.forEach((it) => {
      if (it.seller && it.seller.toString() === req.seller.id.toString()) {
        if (status) it.itemStatus = status;
        if (trackingNumber) it.trackingNumber = trackingNumber;
        updatedAny = true;
      }
    });

    if (!updatedAny) return res.status(403).json({ message: 'No items belonging to you found in this order' });

    // Financial settlement triggers
    if (status === 'confirmed' || status === 'processing') {
      await lockSellerOrderFund(req.app, req.seller.id, order);
    } else if (status === 'delivered') {
      await releaseSellerOrderDelivered(req.app, req.seller.id, order);
    } else if (status === 'cancelled') {
      await releaseSellerOrderCancelled(req.app, req.seller.id, order);
    }

    // If all items share same status, update parent order status
    const allStatuses = order.items.map((it) => it.itemStatus || order.status);
    if (allStatuses.every((s) => s === status)) {
      order.status = status;
    }

    order.statusHistory.push({
      status: status || order.status,
      note: note || `Updated by seller (${req.seller.storeName})`,
      at: new Date(),
      by: req.seller.storeName,
    });

    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ----------------------------------------------------
// 5. SELLER REFUNDS MANAGEMENT
// ----------------------------------------------------

// GET /api/sellers/refunds
router.get('/refunds', authSeller, async (req, res) => {
  try {
    const refunds = await Refund.find({ seller: req.seller.id })
      .populate('order')
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 });
    res.json(refunds);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/refunds/:id/action
router.post('/refunds/:id/action', authSeller, async (req, res) => {
  try {
    const { action, reason } = req.body; // 'approve' | 'reject'
    const refund = await Refund.findOne({ _id: req.params.id, seller: req.seller.id });
    if (!refund) return res.status(404).json({ message: 'Refund not found' });

    if (action === 'approve') {
      refund.status = 'approved';
      refund.processedAt = new Date();
      refund.notes = (refund.notes ? refund.notes + '\n' : '') + `Approved by seller: ${reason || 'Approved'}`;
    } else {
      refund.status = 'rejected';
      refund.processedAt = new Date();
      refund.notes = (refund.notes ? refund.notes + '\n' : '') + `Rejected by seller: ${reason || 'Rejected'}`;
    }

    await refund.save();
    res.json(refund);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ----------------------------------------------------
// 6. ADMIN-SIDE SELLER MANAGEMENT & ONBOARDING
// ----------------------------------------------------

// GET /api/sellers (Admin list all sellers)
router.get('/', authAdmin('sellers'), async (req, res) => {
  try {
    const sellers = await Seller.find().select('-passwordHash').sort({ createdAt: -1 });

    // Attach product count and order count for each seller
    const enriched = await Promise.all(
      sellers.map(async (s) => {
        const productCount = await Product.countDocuments({ seller: s._id });
        const orders = await Order.find({ 'items.seller': s._id });
        let sales = 0;
        orders.forEach((ord) => {
          if (ord.status !== 'cancelled') {
            ord.items
              .filter((it) => it.seller && it.seller.toString() === s._id.toString())
              .forEach((it) => {
                sales += (it.price || 0) * (it.qty || 1);
              });
          }
        });
        return {
          ...s.toObject(),
          productCount,
          orderCount: orders.length,
          lifetimeSales: sales,
        };
      })
    );

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers (Admin creates a new seller credentials)
router.post('/', authAdmin('sellers'), async (req, res) => {
  try {
    const { storeName, ownerName, email, password, phone, commissionRate, city } = req.body;
    if (!storeName || !ownerName || !email || !password) {
      return res.status(400).json({ message: 'Store name, owner name, email, and password are required' });
    }

    const existing = await Seller.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(400).json({ message: 'A seller with this email already exists' });

    let baseSlug = slugify(storeName);
    let storeSlug = baseSlug;
    let counter = 1;
    while (await Seller.findOne({ storeSlug })) {
      storeSlug = `${baseSlug}-${counter++}`;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const seller = new Seller({
      storeName,
      ownerName,
      email: email.toLowerCase().trim(),
      passwordHash,
      phone: phone || '',
      storeSlug,
      commissionRate: commissionRate !== undefined ? Number(commissionRate) : 10,
      address: { city: city || 'New York' },
      status: 'active',
    });

    await seller.save();

    audit(req, 'create', 'seller', seller._id, `Created seller: ${storeName} (${email})`);

    const safeSeller = seller.toObject();
    delete safeSeller.passwordHash;
    res.status(201).json(safeSeller);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/place-order (Admin manually places an order for a specific seller)
router.post('/place-order', authAdmin('orders'), async (req, res) => {
  try {
    const { sellerId, items, customer, shippingAddress, paymentMethod, adminNotes } = req.body;
    if (!sellerId) return res.status(400).json({ message: 'Seller ID is required' });
    if (!items || !items.length) return res.status(400).json({ message: 'At least one product item is required' });

    const seller = await Seller.findById(sellerId);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const orderNumber = `ORD-${await nextSeq('order')}`;

    let subtotal = 0;
    const lineItems = [];

    for (const item of items) {
      const prod = await Product.findById(item.productId);
      const price = item.price !== undefined ? Number(item.price) : prod ? prod.price : 0;
      const costPrice = prod?.costs?.purchase || 0;
      const qty = Number(item.qty) || 1;
      const itemSub = price * qty;
      subtotal += itemSub;

      lineItems.push({
        product: prod ? prod._id : null,
        seller: seller._id,
        sellerName: seller.storeName,
        name: item.name || prod?.name || 'Item',
        image: item.image || prod?.image || '',
        price,
        costPrice,
        qty,
        itemStatus: 'processing',
        trackingNumber: item.trackingNumber || '',
      });

      // Deduct stock if product exists
      if (prod && prod.stock >= qty) {
        prod.stock -= qty;
        prod.sold = (prod.sold || 0) + qty;
        await prod.save();
      }
    }

    const shippingCost = Number(req.body.shippingCost || 0);
    const total = subtotal + shippingCost;

    const order = new Order({
      orderNumber,
      seller: seller._id,
      placedBy: 'customer',
      items: lineItems,
      contact: {
        email: customer?.email || '',
        phone: customer?.phone || '',
      },
      shippingAddress: {
        fullName: customer?.name || shippingAddress?.fullName || 'Customer',
        street: shippingAddress?.street || '',
        apartment: shippingAddress?.apartment || '',
        city: shippingAddress?.city || 'Delhi',
        state: shippingAddress?.state || 'Delhi',
        postalCode: shippingAddress?.postalCode || '',
        country: shippingAddress?.country || 'India',
      },
      shipping: {
        name: req.body.shippingMethodName || 'Standard Express Delivery',
        cost: shippingCost,
        eta: '2-4 business days',
      },
      subtotal,
      total,
      paymentMethod: paymentMethod || 'cod',
      paymentStatus: paymentMethod === 'cod' ? 'pending' : 'paid',
      status: 'processing',
      adminNotes: adminNotes || '',
      statusHistory: [
        {
          status: 'processing',
          note: 'Order placed by customer via store checkout',
          at: new Date(),
          by: 'Customer',
        },
      ],
    });

    await order.save();

    // Update seller stats
    seller.totalOrders = (seller.totalOrders || 0) + 1;
    seller.totalSales = (seller.totalSales || 0) + total;
    await seller.save();

    audit(req, 'create', 'order', order._id, `Order ${orderNumber} created for seller ${seller.storeName}`);

    // Send real-time notification to the seller (appears completely as a customer order)
    const customerName = customer?.name || shippingAddress?.fullName || 'Customer';
    notify(req.app, {
      recipientType: 'seller',
      sellerId: seller._id,
      type: 'order',
      title: `📦 New Order #${orderNumber}`,
      body: `You received a new order for ${lineItems.length} item(s)! Customer: ${customerName} (₹${total.toLocaleString('en-IN')})`,
      link: '/seller/orders',
    });

    req.app.get('io')?.to(`seller:${seller._id}`).emit('order:new', {
      _id: order._id,
      orderNumber: order.orderNumber,
      total: order.total,
      itemsCount: lineItems.length,
      name: customerName,
    });

    // Admin notification
    notify(req.app, {
      recipientType: 'admin',
      type: 'order',
      title: `📦 Order #${orderNumber} Created`,
      body: `Order for ${seller.storeName} created for ${customerName} (₹${total.toLocaleString('en-IN')})`,
      link: `/admin/orders/${order._id}`,
    });

    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// WALLET & WITHDRAWAL SYSTEM
// ─────────────────────────────────────────────────────────────

// Helper: auto-send system chat message to admin for wallet requests
async function sendWalletChatNotification(app, seller, reqDoc) {
  try {
    let conv = await Conversation.findOne({ seller: seller._id });
    if (!conv) {
      conv = await Conversation.create({
        seller: seller._id,
        storeName: seller.storeName,
        sellerName: seller.ownerName,
        sellerEmail: seller.email,
        subject: 'General Seller Support & Operations',
        status: 'open',
        lastAt: new Date(),
      });
    }

    const isDeposit = reqDoc.type === 'deposit';
    const emoji = isDeposit ? '💰' : '💸';
    const label = isDeposit ? 'DEPOSIT REQUEST' : 'WITHDRAWAL REQUEST';
    const amountStr = `₹${Number(reqDoc.amount).toLocaleString('en-IN')}`;

    let details = '';
    if (isDeposit) {
      if (reqDoc.depositRef) details += `\nPayment Ref / UTR: ${reqDoc.depositRef}`;
      if (reqDoc.depositNote) details += `\nNote: ${reqDoc.depositNote}`;
    } else {
      if (reqDoc.method === 'upi') details = `\nUPI ID: ${reqDoc.upiId}`;
      else details = `\nBank: ${reqDoc.bankName}\nAccount No: ${reqDoc.accountNumber}\nIFSC: ${reqDoc.ifscCode}\nHolder: ${reqDoc.accountTitle}`;
    }

    const msgText =
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `${emoji} ${label}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Store: ${seller.storeName}\n` +
      `Amount: ${amountStr}` +
      `${details}\n` +
      `Status: PENDING — awaiting admin approval\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━`;

    const msg = await Message.create({
      conversation: conv._id,
      seller: seller._id,
      sender: 'seller',
      senderName: seller.storeName,
      text: msgText,
    });

    conv.lastMessage = `${emoji} ${label} — ${amountStr}`;
    conv.lastSender = 'seller';
    conv.lastAt = new Date();
    conv.unreadForAdmin = (conv.unreadForAdmin || 0) + 1;
    await conv.save();

    const io = app.get('io');
    if (io) {
      io.to(`seller:${seller._id}`).emit('message:new', msg);
      io.to('admins').emit('message:new', msg);
      io.to('admins').emit('chat:notification', {
        conversationId: conv._id,
        storeName: seller.storeName,
        text: `${emoji} ${label} — ${amountStr}`,
      });
    }

    return msg._id;
  } catch (e) {
    console.error('Wallet chat notification error:', e.message);
    return null;
  }
}

// GET /api/sellers/wallet — seller's wallet info + all requests
router.get('/wallet', authSeller, async (req, res) => {
  try {
    const seller = await Seller.findById(req.seller.id).select('-passwordHash');
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const w = seller.wallet || {};
    const requests = await Withdrawal.find({ seller: seller._id }).sort({ createdAt: -1 }).limit(100);

    res.json({
      wallet: {
        balance: w.balance || 0,
        processingFund: w.processingFund || 0,
        totalProfitEarned: w.totalProfitEarned || 0,
        totalEarned: w.totalEarned || 0,
        totalDeposited: w.totalDeposited || 0,
        totalWithdrawn: w.totalWithdrawn || 0,
        pendingDeposit: w.pendingDeposit || 0,
        pendingWithdrawal: w.pendingWithdrawal || 0,
      },
      requests,
      seller: { storeName: seller.storeName, commissionRate: seller.commissionRate, payoutDetails: seller.payoutDetails },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/wallet/deposit — seller requests to add money to wallet
router.post('/wallet/deposit', authSeller, async (req, res) => {
  try {
    const seller = await Seller.findById(req.seller.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const { amount, depositRef, depositNote } = req.body;
    if (!amount || Number(amount) < 1) return res.status(400).json({ message: 'Minimum deposit amount is ₹1' });

    // Check if already pending deposit
    const hasPending = await Withdrawal.findOne({ seller: seller._id, type: 'deposit', status: 'pending' });
    if (hasPending) return res.status(400).json({ message: 'Aapki ek deposit request already pending hai. Pehle woh process ho jaye.' });

    const reqDoc = await Withdrawal.create({
      type: 'deposit',
      seller: seller._id,
      storeName: seller.storeName,
      amount: Number(amount),
      depositRef: depositRef || '',
      depositNote: depositNote || '',
    });

    // Lock pending deposit
    seller.wallet = seller.wallet || {};
    seller.wallet.pendingDeposit = (seller.wallet.pendingDeposit || 0) + Number(amount);
    await seller.save();

    // Auto-send chat notification
    const chatMsgId = await sendWalletChatNotification(req.app, seller, reqDoc);
    if (chatMsgId) {
      await Withdrawal.findByIdAndUpdate(reqDoc._id, { chatMessageId: chatMsgId });
    }

    notify(req.app, {
      recipientType: 'admin',
      type: 'deposit',
      title: '💰 Deposit Request',
      body: `${seller.storeName} wants to deposit ₹${Number(amount).toLocaleString('en-IN')} to wallet`,
      link: '/admin/withdrawals',
    });

    res.status(201).json({ message: 'Deposit request submitted! Admin will review and approve.', request: reqDoc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/wallet/withdraw — seller requests withdrawal from wallet
router.post('/wallet/withdraw', authSeller, async (req, res) => {
  try {
    const seller = await Seller.findById(req.seller.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const { amount, method, upiId, accountTitle, accountNumber, bankName, ifscCode } = req.body;
    const amt = Number(amount);

    if (!amt || amt < 1) return res.status(400).json({ message: 'Minimum withdrawal amount is ₹1' });
    if (!method || !['upi', 'bank'].includes(method)) return res.status(400).json({ message: 'Payment method required: upi or bank' });
    if (method === 'upi' && !upiId) return res.status(400).json({ message: 'UPI ID is required' });
    if (method === 'bank' && (!accountNumber || !bankName || !ifscCode)) {
      return res.status(400).json({ message: 'Bank details incomplete: account number, bank name, and IFSC are required' });
    }

    const balance = seller.wallet?.balance || 0;
    if (amt > balance) return res.status(400).json({ message: `Insufficient wallet balance. Available: ₹${balance.toFixed(2)}` });

    // Check pending withdrawal
    const hasPending = await Withdrawal.findOne({ seller: seller._id, type: 'withdrawal', status: 'pending' });
    if (hasPending) return res.status(400).json({ message: 'Aapki ek withdrawal request already pending hai.' });

    const reqDoc = await Withdrawal.create({
      type: 'withdrawal',
      seller: seller._id,
      storeName: seller.storeName,
      amount: amt,
      method,
      upiId: method === 'upi' ? upiId : '',
      accountTitle: method === 'bank' ? (accountTitle || '') : '',
      accountNumber: method === 'bank' ? accountNumber : '',
      bankName: method === 'bank' ? bankName : '',
      ifscCode: method === 'bank' ? ifscCode : '',
    });

    // Lock pending withdrawal (reduce available balance)
    seller.wallet = seller.wallet || {};
    seller.wallet.pendingWithdrawal = (seller.wallet.pendingWithdrawal || 0) + amt;
    seller.wallet.balance = Math.max(0, (seller.wallet.balance || 0) - amt);
    await seller.save();

    // Auto-send chat notification
    const chatMsgId = await sendWalletChatNotification(req.app, seller, reqDoc);
    if (chatMsgId) {
      await Withdrawal.findByIdAndUpdate(reqDoc._id, { chatMessageId: chatMsgId });
    }

    notify(req.app, {
      recipientType: 'admin',
      type: 'withdrawal',
      title: '💸 Withdrawal Request',
      body: `${seller.storeName} requested ₹${amt.toLocaleString('en-IN')} via ${method.toUpperCase()}`,
      link: '/admin/withdrawals',
    });

    res.status(201).json({ message: 'Withdrawal request submitted! Admin will process within 2-3 business days.', request: reqDoc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sellers/withdrawals/all — admin sees ALL requests (deposit + withdrawal)
router.get('/withdrawals/all', authAdmin('finance'), async (req, res) => {
  try {
    const { status, type } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (type && type !== 'all') filter.type = type;

    const requests = await Withdrawal.find(filter)
      .populate('seller', 'storeName ownerName email payoutDetails')
      .sort({ createdAt: -1 });

    const pending = requests.filter((r) => r.status === 'pending');
    const pendingDeposits = pending.filter((r) => r.type === 'deposit').reduce((s, r) => s + r.amount, 0);
    const pendingWithdrawals = pending.filter((r) => r.type === 'withdrawal').reduce((s, r) => s + r.amount, 0);

    res.json({
      requests,
      summary: {
        total: requests.length,
        pending: pending.length,
        pendingDeposits,
        pendingWithdrawals,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/sellers/withdrawals/:id — admin approves or rejects
router.put('/withdrawals/:id', authAdmin('finance'), async (req, res) => {
  try {
    const { status, adminNote, transactionRef, approvedAmount } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Use: approved or rejected' });
    }

    const reqDoc = await Withdrawal.findById(req.params.id).populate('seller');
    if (!reqDoc) return res.status(404).json({ message: 'Request not found' });
    if (reqDoc.status !== 'pending') return res.status(400).json({ message: 'Request is already processed' });

    // Determine final approved amount (useful if admin credits e.g. 50 instead of 100)
    let finalAmount = reqDoc.amount;
    if (approvedAmount !== undefined && approvedAmount !== null && approvedAmount !== '') {
      const parsed = Number(approvedAmount);
      if (!isNaN(parsed) && parsed >= 0) {
        finalAmount = parsed;
      }
    }

    reqDoc.status = status;
    reqDoc.approvedAmount = status === 'approved' ? finalAmount : 0;
    reqDoc.adminNote = adminNote || '';
    reqDoc.transactionRef = transactionRef || '';
    reqDoc.processedAt = new Date();
    reqDoc.processedBy = req.admin.name;
    await reqDoc.save();

    const seller = await Seller.findById(reqDoc.seller._id || reqDoc.seller);
    if (seller) {
      seller.wallet = seller.wallet || {};

      if (reqDoc.type === 'deposit') {
        // Release pending deposit (always the original requested amount)
        seller.wallet.pendingDeposit = Math.max(0, (seller.wallet.pendingDeposit || 0) - reqDoc.amount);
        if (status === 'approved') {
          // Add the actually approved/credited amount to balance
          seller.wallet.balance = (seller.wallet.balance || 0) + finalAmount;
          seller.wallet.totalDeposited = (seller.wallet.totalDeposited || 0) + finalAmount;
        }
      } else {
        // Withdrawal
        seller.wallet.pendingWithdrawal = Math.max(0, (seller.wallet.pendingWithdrawal || 0) - reqDoc.amount);
        if (status === 'approved') {
          seller.wallet.totalWithdrawn = (seller.wallet.totalWithdrawn || 0) + finalAmount;
          // Partial Payout: If admin approved less than requested (e.g. 30 out of 100), refund the remaining difference (70) back to balance!
          if (finalAmount < reqDoc.amount) {
            const refundRemainder = reqDoc.amount - finalAmount;
            seller.wallet.balance = (seller.wallet.balance || 0) + refundRemainder;
          }
        } else if (status === 'rejected') {
          // Refund full requested amount back to balance on rejection
          seller.wallet.balance = (seller.wallet.balance || 0) + reqDoc.amount;
        }
      }
      await seller.save();

      // Send chat notification about result
      try {
        const conv = await Conversation.findOne({ seller: seller._id });
        if (conv) {
          const resultEmoji = status === 'approved' ? '✅' : '❌';
          const typeLabel = reqDoc.type === 'deposit' ? 'Deposit' : 'Withdrawal';

          let amountInfo = `Amount: ₹${reqDoc.amount.toLocaleString('en-IN')}\n`;
          if (status === 'approved' && finalAmount !== reqDoc.amount) {
            if (reqDoc.type === 'deposit') {
              amountInfo =
                `Requested Deposit: ₹${reqDoc.amount.toLocaleString('en-IN')}\n` +
                `Credited Amount: ₹${finalAmount.toLocaleString('en-IN')}\n`;
            } else {
              const diff = reqDoc.amount - finalAmount;
              amountInfo =
                `Requested Payout: ₹${reqDoc.amount.toLocaleString('en-IN')}\n` +
                `Approved Payout: ₹${finalAmount.toLocaleString('en-IN')}\n` +
                `Refunded to Balance: ₹${diff.toLocaleString('en-IN')}\n`;
            }
          }

          const msgText =
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `${resultEmoji} ${typeLabel.toUpperCase()} REQUEST ${status.toUpperCase()}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            amountInfo +
            `New Available Balance: ₹${seller.wallet.balance.toLocaleString('en-IN')}\n` +
            `Status: ${status.toUpperCase()}\n` +
            (adminNote ? `Admin Note: ${adminNote}\n` : '') +
            (transactionRef ? `Ref / UTR: ${transactionRef}\n` : '') +
            `━━━━━━━━━━━━━━━━━━━━━━━━━`;

          const msg = await Message.create({
            conversation: conv._id,
            seller: seller._id,
            sender: 'admin',
            senderName: req.admin.name || 'Admin',
            text: msgText,
          });

          conv.lastMessage = `${resultEmoji} ${typeLabel} ${status} — ₹${finalAmount}`;
          conv.lastSender = 'admin';
          conv.lastAt = new Date();
          conv.unreadForSeller = (conv.unreadForSeller || 0) + 1;
          await conv.save();

          const io = req.app.get('io');
          if (io) {
            io.to(`seller:${seller._id}`).emit('message:new', msg);
            io.to('admins').emit('message:new', msg);
          }
        }
      } catch (chatErr) {
        console.error('Result chat notification error:', chatErr.message);
      }

      // Format notification body
      let notifyBody = '';
      if (status === 'approved') {
        if (reqDoc.type === 'deposit') {
          notifyBody = `₹${finalAmount.toLocaleString('en-IN')} has been credited to your wallet. Balance: ₹${seller.wallet.balance.toLocaleString('en-IN')}`;
        } else {
          const diff = reqDoc.amount - finalAmount;
          notifyBody = diff > 0
            ? `₹${finalAmount.toLocaleString('en-IN')} approved for payout. Remaining ₹${diff.toLocaleString('en-IN')} refunded to your wallet. Balance: ₹${seller.wallet.balance.toLocaleString('en-IN')}`
            : `₹${finalAmount.toLocaleString('en-IN')} withdrawal approved. Balance: ₹${seller.wallet.balance.toLocaleString('en-IN')}`;
        }
      } else {
        notifyBody = `Your ${reqDoc.type} request was rejected. Full amount refunded to balance. ${adminNote || ''}`;
      }

      // Send live notification to seller portal
      notify(req.app, {
        recipientType: 'seller',
        sellerId: seller._id,
        type: status === 'approved' ? 'approval' : 'system',
        title: `${status === 'approved' ? '✅' : '❌'} ${reqDoc.type === 'deposit' ? 'Deposit' : 'Withdrawal'} ${status.toUpperCase()}`,
        body: notifyBody,
        link: '/seller/wallet',
      });
    }

    audit(req, 'update', 'wallet_request', reqDoc._id, `${reqDoc.type} ${status} for ${reqDoc.storeName} — ₹${finalAmount}`);
    res.json({ message: `Request ${status} successfully`, request: reqDoc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/:id/wallet/adjust — Super Admin directly adds or deducts funds from seller wallet anytime
router.post('/:id/wallet/adjust', authAdmin('finance'), async (req, res) => {
  try {
    const { type, amount, reason, reference } = req.body; // type: 'credit' | 'debit'
    const amt = Number(amount);

    if (!amt || amt <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than 0' });
    }
    if (!['credit', 'debit'].includes(type)) {
      return res.status(400).json({ message: 'Type must be either credit or debit' });
    }

    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    seller.wallet = seller.wallet || {};

    if (type === 'credit') {
      seller.wallet.balance = (seller.wallet.balance || 0) + amt;
      seller.wallet.totalDeposited = (seller.wallet.totalDeposited || 0) + amt;
    } else {
      if (amt > (seller.wallet.balance || 0)) {
        return res.status(400).json({ message: `Insufficient balance to debit. Available: ₹${seller.wallet.balance || 0}` });
      }
      seller.wallet.balance = Math.max(0, (seller.wallet.balance || 0) - amt);
      seller.wallet.totalWithdrawn = (seller.wallet.totalWithdrawn || 0) + amt;
    }

    await seller.save();

    // Create a transaction / withdrawal history entry
    const rec = await Withdrawal.create({
      type: type === 'credit' ? 'deposit' : 'withdrawal',
      seller: seller._id,
      storeName: seller.storeName,
      amount: amt,
      approvedAmount: amt,
      isManualAdjustment: true,
      status: 'approved',
      adminNote: reason || (type === 'credit' ? 'Admin Direct Manual Credit' : 'Admin Direct Manual Debit'),
      transactionRef: reference || '',
      processedAt: new Date(),
      processedBy: req.admin.name || 'Super Admin',
    });

    // Auto send chat notification to seller
    try {
      let conv = await Conversation.findOne({ seller: seller._id });
      if (!conv) {
        conv = await Conversation.create({
          seller: seller._id,
          storeName: seller.storeName,
          sellerName: seller.ownerName,
          sellerEmail: seller.email,
          subject: 'General Seller Support & Operations',
          status: 'open',
          lastAt: new Date(),
        });
      }

      const isCredit = type === 'credit';
      const emoji = isCredit ? '💰' : '💸';
      const actionName = isCredit ? 'DIRECT WALLET CREDIT (+)' : 'DIRECT WALLET DEBIT (-)';

      const msgText =
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `${emoji} ${actionName}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Amount: ${isCredit ? '+' : '-'}₹${amt.toLocaleString('en-IN')}\n` +
        `New Available Balance: ₹${seller.wallet.balance.toLocaleString('en-IN')}\n` +
        (reason ? `Reason / Note: ${reason}\n` : '') +
        (reference ? `Ref / UTR: ${reference}\n` : '') +
        `Processed By: ${req.admin.name || 'Super Admin'}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━`;

      const msg = await Message.create({
        conversation: conv._id,
        seller: seller._id,
        sender: 'admin',
        senderName: req.admin.name || 'Super Admin',
        text: msgText,
      });

      conv.lastMessage = `${emoji} ${isCredit ? 'Credit' : 'Debit'}: ₹${amt}`;
      conv.lastSender = 'admin';
      conv.lastAt = new Date();
      conv.unreadForSeller = (conv.unreadForSeller || 0) + 1;
      await conv.save();

      const io = req.app.get('io');
      if (io) {
        io.to(`seller:${seller._id}`).emit('message:new', msg);
        io.to('admins').emit('message:new', msg);
      }
    } catch (chatErr) {
      console.error('Manual adjust chat notification error:', chatErr.message);
    }

    // Live notification to seller portal
    notify(req.app, {
      recipientType: 'seller',
      sellerId: seller._id,
      type: type === 'credit' ? 'deposit' : 'withdrawal',
      title: `💳 Wallet ${type === 'credit' ? 'Credited (+)' : 'Debited (-)'}`,
      body: `₹${amt.toLocaleString('en-IN')} has been ${type === 'credit' ? 'added to' : 'deducted from'} your wallet. Balance: ₹${seller.wallet.balance.toLocaleString('en-IN')}`,
      link: '/seller/wallet',
    });

    audit(req, 'create', 'wallet_adjustment', rec._id, `Direct wallet ${type} ₹${amt} for ${seller.storeName}`);

    res.json({
      message: `Successfully ${type === 'credit' ? 'credited' : 'debited'} ₹${amt} to ${seller.storeName}'s wallet`,
      wallet: seller.wallet,
      record: rec,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sellers/:id/wallet — admin inspects specific seller's wallet
router.get('/:id/wallet', authAdmin('finance'), async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.id).select('-passwordHash');
    if (!seller) return res.status(404).json({ message: 'Seller not found' });
    const w = seller.wallet || {};
    const requests = await Withdrawal.find({ seller: seller._id }).sort({ createdAt: -1 });
    res.json({
      wallet: {
        balance: w.balance || 0,
        totalDeposited: w.totalDeposited || 0,
        totalWithdrawn: w.totalWithdrawn || 0,
        pendingDeposit: w.pendingDeposit || 0,
        pendingWithdrawal: w.pendingWithdrawal || 0,
      },
      requests,
      seller,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// SELLER COUPONS
// ─────────────────────────────────────────────────────────────

// GET /api/sellers/coupons
router.get('/coupons', authSeller, async (req, res) => {
  try {
    const coupons = await SellerCoupon.find({ seller: req.seller.id }).sort({ createdAt: -1 });
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/coupons
router.post('/coupons', authSeller, async (req, res) => {
  try {
    const { code, type, value, minOrder, maxUses, expiresAt, active } = req.body;
    if (!code || !type || !value) return res.status(400).json({ message: 'Code, type and value are required' });

    const existing = await SellerCoupon.findOne({ seller: req.seller.id, code: code.toUpperCase().trim() });
    if (existing) return res.status(400).json({ message: 'A coupon with this code already exists' });

    const coupon = await SellerCoupon.create({
      seller: req.seller.id,
      code: code.toUpperCase().trim(),
      type,
      value: Number(value),
      minOrder: minOrder ? Number(minOrder) : 0,
      maxUses: maxUses ? Number(maxUses) : null,
      expiresAt: expiresAt || null,
      active: active !== false,
    });
    res.status(201).json(coupon);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/sellers/coupons/:id
router.put('/coupons/:id', authSeller, async (req, res) => {
  try {
    const coupon = await SellerCoupon.findOneAndUpdate(
      { _id: req.params.id, seller: req.seller.id },
      req.body,
      { new: true }
    );
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    res.json(coupon);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/sellers/coupons/:id
router.delete('/coupons/:id', authSeller, async (req, res) => {
  try {
    const coupon = await SellerCoupon.findOneAndDelete({ _id: req.params.id, seller: req.seller.id });
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    res.json({ message: 'Coupon deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// SELLER SHIPPING METHODS
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// SELLER ANALYTICS
// ─────────────────────────────────────────────────────────────

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

// GET /api/sellers/inventory (Seller views inventory analytics and stock summary)
router.get('/inventory', authSeller, async (req, res) => {
  try {
    const products = await Product.find({ seller: req.seller.id }).populate('category', 'name slug');
    const lowStock = products.filter((p) => (p.stock || 0) <= (p.lowStockThreshold || 5) && (p.stock || 0) > 0);
    const outOfStock = products.filter((p) => (p.stock || 0) === 0);
    const inStock = products.filter((p) => (p.stock || 0) > (p.lowStockThreshold || 5));
    const totalInventoryUnits = products.reduce((acc, p) => acc + (p.stock || 0), 0);
    const totalInventoryValue = products.reduce((acc, p) => acc + ((p.stock || 0) * (p.price || 0)), 0);

    res.json({
      products,
      summary: {
        totalProducts: products.length,
        inStockCount: inStock.length,
        lowStockCount: lowStock.length,
        outOfStockCount: outOfStock.length,
        totalInventoryUnits,
        totalInventoryValue,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// PARAMETERIZED SELLER ROUTES (Must be placed at the bottom)
// ─────────────────────────────────────────────────────────────

// GET /api/sellers/:id (Admin views single seller + full dashboard stats / Impersonation)
router.get('/:id', authAdmin('sellers'), async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.id).select('-passwordHash');
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const products = await Product.find({ seller: seller._id }).populate('category', 'name slug');
    const orders = await Order.find({ 'items.seller': seller._id }).sort({ createdAt: -1 });

    let grossRevenue = 0;
    let totalCost = 0;
    let totalItemsSold = 0;

    orders.forEach((ord) => {
      if (ord.status !== 'cancelled') {
        const sellerItems = ord.items.filter((it) => it.seller && it.seller.toString() === seller._id.toString());
        sellerItems.forEach((it) => {
          grossRevenue += (it.price || 0) * (it.qty || 1);
          totalCost += (it.costPrice || 0) * (it.qty || 1);
          totalItemsSold += it.qty || 1;
        });
      }
    });

    const commissionPercent = seller.commissionRate || 10;
    const platformCommission = (grossRevenue * commissionPercent) / 100;
    const netProfit = grossRevenue - totalCost - platformCommission;

    res.json({
      seller,
      stats: {
        grossRevenue,
        netProfit: Math.max(0, netProfit),
        platformCommission,
        totalCost,
        totalOrders: orders.length,
        totalItemsSold,
        totalProducts: products.length,
      },
      products,
      orders,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/sellers/:id (Admin updates seller: commission, status, password reset)
router.put('/:id', authAdmin('sellers'), async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const { storeName, ownerName, email, password, phone, commissionRate, status, address } = req.body;
    if (storeName) seller.storeName = storeName;
    if (ownerName) seller.ownerName = ownerName;
    if (email) seller.email = email.toLowerCase().trim();
    if (phone !== undefined) seller.phone = phone;
    if (commissionRate !== undefined) seller.commissionRate = Number(commissionRate);
    if (status) seller.status = status;
    if (address) seller.address = { ...seller.address, ...address };

    if (password) {
      seller.passwordHash = await bcrypt.hash(password, 10);
    }

    await seller.save();
    audit(req, 'update', 'seller', seller._id, `Updated seller: ${seller.storeName}`);

    const safeSeller = seller.toObject();
    delete safeSeller.passwordHash;
    res.json(safeSeller);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/:id/reset-password (Admin resets seller password)
router.post('/:id/reset-password', authAdmin('sellers'), async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters long' });
    }
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    seller.passwordHash = await bcrypt.hash(newPassword, 10);
    await seller.save();

    audit(req, 'reset_password', 'seller', seller._id, `Admin reset password for vendor: ${seller.storeName} (${seller.email})`);
    res.json({ ok: true, message: `Password reset successfully for ${seller.storeName}!` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/:id/freeze (Admin freezes/suspends or unfreezes seller account with reason)
router.post('/:id/freeze', authAdmin('sellers'), async (req, res) => {
  try {
    const { status = 'frozen', reason = '' } = req.body;
    if (!['active', 'frozen', 'suspended'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Use: active, frozen, or suspended' });
    }

    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    seller.status = status;
    if (status === 'active') {
      seller.freezeReason = '';
      seller.frozenAt = null;
      seller.frozenBy = '';
    } else {
      seller.freezeReason = reason || 'Account restricted by platform administrator due to policy compliance review.';
      seller.frozenAt = new Date();
      seller.frozenBy = req.admin.name || 'Super Admin';
    }

    await seller.save();

    const isRestricted = status !== 'active';
    const statusLabel = status === 'frozen' ? 'FROZEN' : status === 'suspended' ? 'SUSPENDED' : 'UNFROZEN / ACTIVE';

    // Auto-send official Chat notice to seller
    try {
      let conv = await Conversation.findOne({ seller: seller._id });
      if (!conv) {
        conv = await Conversation.create({
          seller: seller._id,
          storeName: seller.storeName,
          sellerName: seller.ownerName,
          sellerEmail: seller.email,
          subject: 'Account Compliance & Status Notice',
          status: 'open',
          lastAt: new Date(),
        });
      }

      const msgText = isRestricted
        ? `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `⛔ ACCOUNT RESTRICTION NOTICE\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Status: ACCOUNT ${statusLabel}\n` +
          `Reason: ${seller.freezeReason}\n` +
          `Action Taken By: ${req.admin.name || 'Platform Admin'}\n` +
          `Date: ${new Date().toLocaleString('en-IN')}\n\n` +
          `Please contact platform support to resolve this suspension.\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━`
        : `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `✅ ACCOUNT RESTRICTION LIFTED\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Status: ACCOUNT ACTIVE & FULL ACCESS RESTORED\n` +
          `Action Taken By: ${req.admin.name || 'Platform Admin'}\n` +
          `You can now add products and process withdrawals normally.\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━`;

      const msg = await Message.create({
        conversation: conv._id,
        seller: seller._id,
        sender: 'admin',
        senderName: req.admin.name || 'Platform Compliance',
        text: msgText,
      });

      conv.lastMessage = isRestricted ? `⛔ Account ${statusLabel}: ${seller.freezeReason}` : `✅ Account Active`;
      conv.lastSender = 'admin';
      conv.lastAt = new Date();
      conv.unreadForSeller = (conv.unreadForSeller || 0) + 1;
      await conv.save();

      const io = req.app.get('io');
      if (io) {
        io.to(`seller:${seller._id}`).emit('message:new', msg);
        io.to(`seller:${seller._id}`).emit('seller:status_update', { seller: seller.toObject() });
      }
    } catch (chatErr) {
      console.error('Chat freeze error:', chatErr.message);
    }

    // Live Notification
    notify(req.app, {
      recipientType: 'seller',
      sellerId: seller._id,
      type: isRestricted ? 'withdrawal' : 'approval',
      title: isRestricted ? `⛔ Account ${statusLabel}` : `✅ Account Restored to Active`,
      body: isRestricted ? `Reason: ${seller.freezeReason}` : `Your account restrictions have been cleared.`,
      link: '/seller',
    });

    audit(req, 'update', 'seller_status', seller._id, `Set status to ${status} for ${seller.storeName}. Reason: ${reason}`);

    res.json({
      message: `Seller account ${status === 'active' ? 'unfrozen & activated' : 'set to ' + status} successfully`,
      seller,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/:id/warn (Admin issues or clears an official warning announcement banner)
router.post('/:id/warn', authAdmin('sellers'), async (req, res) => {
  try {
    const { active = true, message = '', level = 'warning' } = req.body;

    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    seller.warning = {
      active: Boolean(active),
      message: active ? message.trim() : '',
      level: ['info', 'warning', 'critical'].includes(level) ? level : 'warning',
      issuedAt: active ? new Date() : null,
      issuedBy: active ? req.admin.name || 'Platform Compliance Desk' : '',
    };

    await seller.save();

    if (active && message.trim()) {
      // Auto-send chat warning message
      try {
        let conv = await Conversation.findOne({ seller: seller._id });
        if (!conv) {
          conv = await Conversation.create({
            seller: seller._id,
            storeName: seller.storeName,
            sellerName: seller.ownerName,
            sellerEmail: seller.email,
            subject: 'Official Compliance Warning',
            status: 'open',
            lastAt: new Date(),
          });
        }

        const msgText =
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `⚠️ OFFICIAL SELLER WARNING (${level.toUpperCase()})\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Notice: ${message.trim()}\n` +
          `Severity: ${level.toUpperCase()}\n` +
          `Issued By: ${req.admin.name || 'Platform Compliance Desk'}\n` +
          `Date: ${new Date().toLocaleString('en-IN')}\n\n` +
          `Note: This notice is displayed on your portal announcement bar. Please take immediate action to avoid account freeze.\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━`;

        const msg = await Message.create({
          conversation: conv._id,
          seller: seller._id,
          sender: 'admin',
          senderName: req.admin.name || 'Platform Compliance',
          text: msgText,
        });

        conv.lastMessage = `⚠️ Warning (${level}): ${message.trim()}`;
        conv.lastSender = 'admin';
        conv.lastAt = new Date();
        conv.unreadForSeller = (conv.unreadForSeller || 0) + 1;
        await conv.save();

        const io = req.app.get('io');
        if (io) {
          io.to(`seller:${seller._id}`).emit('message:new', msg);
          io.to(`seller:${seller._id}`).emit('seller:warning_update', { warning: seller.warning });
        }
      } catch (chatErr) {
        console.error('Chat warning error:', chatErr.message);
      }

      // Live toast notification
      notify(req.app, {
        recipientType: 'seller',
        sellerId: seller._id,
        type: 'withdrawal',
        title: `⚠️ Official Seller Warning (${level.toUpperCase()})`,
        body: message.trim(),
        link: '/seller',
      });
    }

    audit(req, 'update', 'seller_warning', seller._id, `${active ? 'Issued warning' : 'Cleared warning'} for ${seller.storeName}`);

    res.json({
      message: active ? 'Official warning issued to seller successfully' : 'Warning cleared successfully',
      seller,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/sellers/:id (Admin removes seller)
router.delete('/:id', authAdmin('sellers'), async (req, res) => {
  try {
    const seller = await Seller.findByIdAndDelete(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });
    audit(req, 'delete', 'seller', seller._id, `Deleted seller: ${seller.storeName}`);
    res.json({ ok: true, message: 'Seller deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
