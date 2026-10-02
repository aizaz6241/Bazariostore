import mongoose from 'mongoose';
import express from 'express';
import bcrypt from 'bcryptjs';
import Seller from '../../models/Seller.js';
import Product from '../../models/Product.js';
import Order from '../../models/Order.js';
import Withdrawal from '../../models/Withdrawal.js';
import ReferralCode from '../../models/ReferralCode.js';
import { Conversation, Message } from '../../models/Chat.js';
import { getSetting, setSetting } from '../../models/System.js';
import { authAdmin } from '../../middleware/auth.js';
import { notify } from '../../utils/notify.js';
import { audit } from '../../utils/audit.js';
import { slugify, calculateHealthStatus } from './helpers.js';

const router = express.Router();

// GET /api/sellers (Admin list all sellers)
router.get('/', authAdmin('sellers'), async (req, res) => {
  try {
    const sellers = await Seller.find().select('-passwordHash').sort({ createdAt: -1 });

    // Attach product count and order count for each seller
    const enriched = await Promise.all(
      sellers.map(async (s) => {
        const productCount = await Product.countDocuments({ seller: s._id });
        const orders = await Order.find({
          $or: [{ 'items.seller': s._id }, { seller: s._id }],
        });
        let sales = 0;
        let pendingOrders = 0;
        orders.forEach((ord) => {
          const st = (ord.status || '').toLowerCase();
          if (!['delivered', 'cancelled', 'refunded'].includes(st)) {
            pendingOrders += 1;
          }
          if (ord.status !== 'cancelled') {
            ord.items
              .filter((it) => (it.seller && it.seller.toString() === s._id.toString()) || (!it.seller && ord.seller && ord.seller.toString() === s._id.toString()))
              .forEach((it) => {
                sales += (it.price || 0) * (it.qty || 1);
              });
          }
        });
        return {
          ...s.toObject(),
          plainPassword: s.plainPassword || '',
          productCount,
          orderCount: orders.length,
          pendingOrders,
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
    const { storeName, ownerName, email, password, phone, commissionRate, city, isTestAccount, accountType, isPreviousStoreSeller } = req.body;
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

    const isTest = Boolean(isTestAccount || accountType === 'test');
    const isPrev = Boolean(isPreviousStoreSeller);
    const passwordHash = await bcrypt.hash(password, 10);
    const seller = new Seller({
      storeName,
      ownerName,
      email: email.toLowerCase().trim(),
      passwordHash,
      plainPassword: password,
      phone: phone || '',
      storeSlug,
      commissionRate: commissionRate !== undefined ? Number(commissionRate) : 10,
      address: { city: city || 'New York' },
      isTestAccount: isTest,
      accountType: isTest ? 'test' : 'client',
      isPreviousStoreSeller: isPrev,
      status: 'active',
      verified: true,
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
    seller.plainPassword = newPassword;
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
      seller.verified = true;
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

// POST /api/sellers/:id/health (Admin adjusts Seller Account Health score 0-100)
router.post('/:id/health', authAdmin('sellers'), async (req, res) => {
  try {
    const { score, reason = 'Manual score adjustment by Administrator', notifySeller = true } = req.body;
    const numScore = Math.max(0, Math.min(100, Math.round(Number(score))));
    if (isNaN(numScore)) {
      return res.status(400).json({ message: 'Valid health score between 0 and 100 is required' });
    }

    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    if (!seller.accountHealth) {
      seller.accountHealth = {
        score: 100,
        status: 'healthy',
        history: [],
      };
    }

    const previousScore = seller.accountHealth.score !== undefined ? seller.accountHealth.score : 100;
    const delta = numScore - previousScore;
    const newStatus = calculateHealthStatus(numScore);

    seller.accountHealth.score = numScore;
    seller.accountHealth.status = newStatus;
    seller.accountHealth.lastEvaluatedAt = new Date();

    if (!Array.isArray(seller.accountHealth.history)) {
      seller.accountHealth.history = [];
    }

    seller.accountHealth.history.unshift({
      previousScore,
      newScore: numScore,
      delta,
      reason: reason.trim() || 'Health score evaluated by Platform Compliance',
      changedBy: req.admin.name || 'Platform Administrator',
      createdAt: new Date(),
    });

    // Keep history trimmed to last 50 entries
    if (seller.accountHealth.history.length > 50) {
      seller.accountHealth.history = seller.accountHealth.history.slice(0, 50);
    }

    await seller.save();

    // Broadcast live health update
    const io = req.app.get('io');
    if (io) {
      io.to(`seller:${seller._id}`).emit('seller:health_update', { accountHealth: seller.accountHealth });
      io.to('admins').emit('seller:health_update', { sellerId: seller._id, accountHealth: seller.accountHealth });
    }

    if (notifySeller) {
      const tierLabel = numScore >= 80 ? 'Healthy (Good Standing)' : numScore >= 31 ? 'At Risk (Action Needed)' : numScore > 20 ? 'Critical (Freeze Alert)' : 'Critical (Suspension Alert)';
      notify(req.app, {
        recipientType: 'seller',
        sellerId: seller._id,
        type: numScore < 80 ? 'withdrawal' : 'approval',
        title: `🛡️ Account Health Updated: ${numScore}/100`,
        body: `Rating: ${tierLabel}. Reason: ${reason.trim() || 'Score adjusted by Platform Compliance'}`,
        link: '/seller',
      });
    }

    audit(req, 'update', 'seller_health', seller._id, `Updated account health for ${seller.storeName} from ${previousScore} to ${numScore}. Reason: ${reason}`);

    res.json({
      message: `Account health updated to ${numScore}/100 successfully`,
      seller,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// AFFILIATE / REFERRAL CODES MANAGEMENT ROUTES
// ─────────────────────────────────────────────────────────────

// GET /api/sellers/master-affiliate or /api/sellers/master-referral (Get platform master affiliate code)
router.get(['/master-affiliate', '/master-referral'], authAdmin('sellers'), async (req, res) => {
  try {
    const code = (await getSetting('master_affiliate_code')) || (await getSetting('master_referral_code', 'REF-BAZARIO-2026'));
    res.json({ masterReferralCode: code, masterAffiliateCode: code });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/master-affiliate or /api/sellers/master-referral (Update platform master affiliate code)
router.post(['/master-affiliate', '/master-referral'], authAdmin('sellers'), async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code || !code.trim()) return res.status(400).json({ message: 'Affiliate code cannot be empty' });
    const cleanCode = code.trim().toUpperCase();
    await setSetting('master_affiliate_code', cleanCode);
    await setSetting('master_referral_code', cleanCode);
    audit(req, 'update', 'system_setting', null, `Updated master affiliate code to ${cleanCode}`);
    res.json({
      message: 'Master affiliate code updated successfully',
      masterReferralCode: cleanCode,
      masterAffiliateCode: cleanCode,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sellers/affiliates or /api/sellers/referrals (Admin lists all affiliate codes with live usage counts)
router.get(['/affiliates', '/referrals'], authAdmin('sellers'), async (req, res) => {
  try {
    const masterCode = (await getSetting('master_affiliate_code')) || (await getSetting('master_referral_code', 'REF-BAZARIO-2026'));
    const customCodes = await ReferralCode.find().sort({ createdAt: -1 });

    // Aggregate seller count for master code
    const masterCount = await Seller.countDocuments({
      $or: [
        { 'securityDeposit.referralCode': masterCode },
        { referralCode: masterCode },
      ],
    });

    // Aggregate seller count for each custom code
    const enrichedCodes = await Promise.all(
      customCodes.map(async (rc) => {
        const usageCount = await Seller.countDocuments({
          $or: [
            { 'securityDeposit.referralCode': rc.code },
            { referralCode: rc.code },
          ],
        });
        return {
          ...rc.toObject(),
          usageCount,
        };
      })
    );

    res.json({
      masterReferralCode: masterCode,
      masterAffiliateCode: masterCode,
      masterUsageCount: masterCount,
      referralCodes: enrichedCodes,
      affiliateCodes: enrichedCodes,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/affiliates or /api/sellers/referrals (Admin creates a new custom affiliate code)
router.post(['/affiliates', '/referrals'], authAdmin('sellers'), async (req, res) => {
  try {
    const { code, description, commissionRate, bonusAmount, status } = req.body || {};
    if (!code || !code.trim()) {
      return res.status(400).json({ message: 'Affiliate code is required' });
    }

    const cleanCode = code.trim().toUpperCase();
    const existing = await ReferralCode.findOne({ code: cleanCode });
    if (existing) {
      return res.status(400).json({ message: `Affiliate code "${cleanCode}" already exists` });
    }

    const newCode = new ReferralCode({
      code: cleanCode,
      description: (description || '').trim(),
      commissionRate: commissionRate !== undefined && commissionRate !== '' ? Number(commissionRate) : null,
      bonusAmount: bonusAmount !== undefined && bonusAmount !== '' ? Number(bonusAmount) : 0,
      status: status === 'inactive' ? 'inactive' : 'active',
      createdBy: req.admin?.name || 'Admin',
    });

    await newCode.save();

    audit(req, 'create', 'referral_code', newCode._id, `Created affiliate code: ${cleanCode}`);

    res.status(201).json({
      message: `Affiliate code "${cleanCode}" created successfully! 🎉`,
      referralCode: newCode,
      affiliateCode: newCode,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/sellers/affiliates/:id or /api/sellers/referrals/:id (Admin deletes an affiliate code)
router.delete(['/affiliates/:id', '/referrals/:id'], authAdmin('sellers'), async (req, res) => {
  try {
    const rc = await ReferralCode.findById(req.params.id);
    if (!rc) return res.status(404).json({ message: 'Affiliate code not found' });

    await ReferralCode.findByIdAndDelete(req.params.id);
    audit(req, 'delete', 'referral_code', req.params.id, `Deleted affiliate code: ${rc.code}`);

    res.json({ ok: true, message: `Affiliate code "${rc.code}" deleted successfully.` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/sellers/affiliates/:id/toggle or /api/sellers/referrals/:id/toggle (Admin toggles active / inactive)
router.patch(['/affiliates/:id/toggle', '/referrals/:id/toggle'], authAdmin('sellers'), async (req, res) => {
  try {
    const rc = await ReferralCode.findById(req.params.id);
    if (!rc) return res.status(404).json({ message: 'Affiliate code not found' });

    rc.status = rc.status === 'active' ? 'inactive' : 'active';
    await rc.save();

    audit(req, 'update', 'referral_code', rc._id, `Set status to ${rc.status} for ${rc.code}`);

    res.json({
      ok: true,
      message: `Affiliate code "${rc.code}" is now ${rc.status.toUpperCase()}.`,
      referralCode: rc,
      affiliateCode: rc,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sellers/:id (Admin views single seller + full dashboard stats / Impersonation)
router.get('/:id', authAdmin('sellers'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return next();
    }
    const seller = await Seller.findById(req.params.id).select('-passwordHash');
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const products = await Product.find({ seller: seller._id }).populate('category', 'name slug');
    const orders = await Order.find({
      $or: [{ 'items.seller': seller._id }, { seller: seller._id }],
    }).sort({ createdAt: -1 });

    let grossRevenue = 0;
    let totalCost = 0;
    let totalItemsSold = 0;

    let pendingOrders = 0;
    let deliveredOrders = 0;
    let cancelledOrders = 0;

    orders.forEach((ord) => {
      const st = (ord.status || '').toLowerCase();
      if (!['delivered', 'cancelled', 'refunded'].includes(st)) {
        pendingOrders += 1;
      } else if (st === 'delivered') {
        deliveredOrders += 1;
      } else if (st === 'cancelled') {
        cancelledOrders += 1;
      }
      if (ord.status !== 'cancelled') {
        const sellerItems = ord.items.filter(
          (it) => (it.seller && it.seller.toString() === seller._id.toString()) || (!it.seller && ord.seller && ord.seller.toString() === seller._id.toString())
        );
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

    const safeSeller = seller.toObject();
    if (!safeSeller.plainPassword) {
      safeSeller.plainPassword = '';
    }

    res.json({
      seller: safeSeller,
      stats: {
        grossRevenue,
        netProfit: Math.max(0, netProfit),
        platformCommission,
        totalCost,
        totalOrders: orders.length,
        pendingOrders,
        deliveredOrders,
        cancelledOrders,
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

// PUT /api/sellers/:id (Admin updates seller: commission, status, security deposit, password reset)
router.put('/:id', authAdmin('sellers'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return next();
    }
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const {
      storeName,
      ownerName,
      email,
      password,
      phone,
      commissionRate,
      status,
      address,
      securityDepositAmount,
      securityDepositPaid,
      referralCode,
      note,
      isTestAccount,
      accountType,
      isPreviousStoreSeller,
    } = req.body;

    if (storeName) seller.storeName = storeName;
    if (ownerName) seller.ownerName = ownerName;
    if (email) seller.email = email.toLowerCase().trim();
    if (phone !== undefined) seller.phone = phone;
    if (commissionRate !== undefined) seller.commissionRate = Number(commissionRate);
    if (status) seller.status = status;
    if (address) seller.address = { ...seller.address, ...address };

    if (isTestAccount !== undefined) {
      seller.isTestAccount = Boolean(isTestAccount);
      seller.accountType = seller.isTestAccount ? 'test' : 'client';
    } else if (accountType !== undefined) {
      seller.accountType = accountType === 'test' ? 'test' : 'client';
      seller.isTestAccount = seller.accountType === 'test';
    }

    if (isPreviousStoreSeller !== undefined) {
      seller.isPreviousStoreSeller = Boolean(isPreviousStoreSeller);
    }

    if (securityDepositAmount !== undefined || securityDepositPaid !== undefined || referralCode !== undefined) {
      const isPaid = securityDepositPaid !== undefined ? Boolean(securityDepositPaid) : Boolean(seller.securityDeposit?.paid);
      const depAmt = securityDepositAmount !== undefined ? Number(securityDepositAmount) : (seller.securityDeposit?.amount || 0);
      const cleanAmt = isPaid ? Math.max(0, depAmt) : 0;

      seller.securityDeposit = {
        paid: isPaid,
        amount: cleanAmt,
        paidAt: isPaid ? (seller.securityDeposit?.paidAt || new Date()) : null,
        referralCode: referralCode !== undefined ? (referralCode || '').trim() : (seller.securityDeposit?.referralCode || ''),
        note: note !== undefined ? (note || '').trim() : (seller.securityDeposit?.note || ''),
      };

      seller.wallet = seller.wallet || {};
      seller.wallet.securityDeposit = cleanAmt;
    }

    if (req.body.withdrawalLimit) {
      const wl = req.body.withdrawalLimit;
      seller.withdrawalLimit = seller.withdrawalLimit || {};
      if (wl.maxAmount !== undefined) seller.withdrawalLimit.maxAmount = Math.max(1, Number(wl.maxAmount));
      if (wl.minAmount !== undefined) seller.withdrawalLimit.minAmount = Math.max(1, Number(wl.minAmount));
      if (wl.requiredWithdrawalsForIncrease !== undefined) seller.withdrawalLimit.requiredWithdrawalsForIncrease = Math.max(1, Number(wl.requiredWithdrawalsForIncrease));
      if (wl.successfulWithdrawalCount !== undefined) seller.withdrawalLimit.successfulWithdrawalCount = Math.max(0, Number(wl.successfulWithdrawalCount));
      if (wl.upgradeFee !== undefined) seller.withdrawalLimit.upgradeFee = Math.max(0, Number(wl.upgradeFee));
      if (wl.currentTierName) seller.withdrawalLimit.currentTierName = wl.currentTierName.trim();
      seller.markModified('withdrawalLimit');
    }

    if (password) {
      seller.passwordHash = await bcrypt.hash(password, 10);
      seller.plainPassword = password;
    }

    await seller.save();
    audit(req, 'update', 'seller', seller._id, `Updated seller: ${seller.storeName}`);

    const safeSeller = seller.toObject();
    delete safeSeller.passwordHash;

    const io = req.app.get('io');
    if (io) {
      io.to(`seller:${seller._id}`).emit('seller:status_update', { seller: safeSeller });
      io.to(`seller:${seller._id}`).emit('wallet:update', { wallet: seller.wallet, sellerId: seller._id, withdrawalLimit: seller.withdrawalLimit });
      io.to(`seller:${seller._id}`).emit('seller:limit_update', { sellerId: seller._id, withdrawalLimit: seller.withdrawalLimit });
      io.to('sellers').emit('seller:status_update', { seller: safeSeller });
    }

    res.json(safeSeller);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/:id/withdrawal-limit (Admin updates withdrawal limits and banking tier)
router.post('/:id/withdrawal-limit', authAdmin(), async (req, res) => {
  try {
    const { maxAmount, minAmount, requiredWithdrawalsForIncrease, successfulWithdrawalCount, upgradeFee, currentTierName } = req.body || {};
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    seller.withdrawalLimit = seller.withdrawalLimit || {};

    if (maxAmount !== undefined) seller.withdrawalLimit.maxAmount = Math.max(1, Number(maxAmount));
    if (minAmount !== undefined) seller.withdrawalLimit.minAmount = Math.max(1, Number(minAmount));
    if (requiredWithdrawalsForIncrease !== undefined) seller.withdrawalLimit.requiredWithdrawalsForIncrease = Math.max(1, Number(requiredWithdrawalsForIncrease));
    if (successfulWithdrawalCount !== undefined) seller.withdrawalLimit.successfulWithdrawalCount = Math.max(0, Number(successfulWithdrawalCount));
    if (upgradeFee !== undefined) seller.withdrawalLimit.upgradeFee = Math.max(0, Number(upgradeFee));
    if (currentTierName) seller.withdrawalLimit.currentTierName = currentTierName.trim();

    seller.markModified('withdrawalLimit');
    await seller.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`seller:${seller._id}`).emit('seller:limit_update', { sellerId: seller._id, withdrawalLimit: seller.withdrawalLimit });
      io.to(`seller:${seller._id}`).emit('wallet:update', { sellerId: seller._id, withdrawalLimit: seller.withdrawalLimit });
      io.emit('seller:limit_update', { sellerId: seller._id, withdrawalLimit: seller.withdrawalLimit });
      io.emit('wallet:update', { sellerId: seller._id, withdrawalLimit: seller.withdrawalLimit });
      io.emit('limit:update', { sellerId: seller._id, withdrawalLimit: seller.withdrawalLimit });
    }

    notify(req.app, {
      recipientType: 'seller',
      sellerId: seller._id,
      type: 'approval',
      title: '💼 Withdrawal Limit Updated',
      body: `Your store withdrawal limit has been updated to $${(seller.withdrawalLimit.maxAmount || 500).toLocaleString('en-US')} (${seller.withdrawalLimit.currentTierName || 'Standard Tier'}) by Platform Administration.`,
      link: '/seller/wallet?tab=withdraw',
    });

    audit(req, 'update', 'seller_limit', seller._id, `Updated withdrawal limits for ${seller.storeName}: Max $${seller.withdrawalLimit.maxAmount}, Req ${seller.withdrawalLimit.requiredWithdrawalsForIncrease}, Completed ${seller.withdrawalLimit.successfulWithdrawalCount}, Tier: ${seller.withdrawalLimit.currentTierName}`);

    res.json({
      message: 'Withdrawal limit settings updated successfully',
      withdrawalLimit: seller.withdrawalLimit,
      seller: seller.toObject(),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// POST /api/sellers/:id/approve (Admin approves a pending seller registration)
router.post('/:id/approve', authAdmin('sellers'), async (req, res) => {
  try {
    const { securityDepositPaid, securityDepositAmount, referralCode, assignedReferralCode, commissionRate, note, isTestAccount, accountType, isPreviousStoreSeller } = req.body || {};
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const isPaid = Boolean(securityDepositPaid);
    const depAmt = isPaid ? Math.max(0, Number(securityDepositAmount) || 0) : 0;
    const finalReferral = (assignedReferralCode || referralCode || seller.securityDeposit?.referralCode || '').trim();

    seller.status = 'active';
    seller.verified = true;
    if (commissionRate !== undefined) seller.commissionRate = Number(commissionRate);

    if (isTestAccount !== undefined) {
      seller.isTestAccount = Boolean(isTestAccount);
      seller.accountType = seller.isTestAccount ? 'test' : 'client';
    } else if (accountType !== undefined) {
      seller.accountType = accountType === 'test' ? 'test' : 'client';
      seller.isTestAccount = seller.accountType === 'test';
    }

    if (isPreviousStoreSeller !== undefined) {
      seller.isPreviousStoreSeller = Boolean(isPreviousStoreSeller);
    }

    seller.securityDeposit = {
      paid: isPaid,
      amount: depAmt,
      paidAt: isPaid ? new Date() : null,
      referralCode: finalReferral,
      note: (note || '').trim(),
    };

    seller.wallet = seller.wallet || {};
    seller.wallet.securityDeposit = depAmt;

    await seller.save();

    // Create Initial Security Deposit Ledger Record in Wallet History
    if (isPaid && depAmt > 0) {
      try {
        const existingLedger = await Withdrawal.findOne({
          seller: seller._id,
          depositRef: 'INITIAL_SECURITY_DEPOSIT',
        });
        if (!existingLedger) {
          await Withdrawal.create({
            seller: seller._id,
            storeName: seller.storeName,
            type: 'adjustment',
            amount: depAmt,
            approvedAmount: depAmt,
            status: 'approved',
            depositRef: 'INITIAL_SECURITY_DEPOSIT',
            depositNote: `🛡️ Verified Registration Security Deposit (${finalReferral ? `Referral: ${finalReferral}` : 'Merchant Guarantee Collateral'})`,
            isManualAdjustment: true,
            balanceAfter: seller.wallet.balance || 0,
            processedAt: new Date(),
            processedBy: req.admin.name || 'Platform Administrator',
          });
        }
      } catch (ledgerErr) {
        console.error('Security deposit ledger creation error:', ledgerErr.message);
      }
    }

    // Auto-send welcome chat announcement
    try {
      let conv = await Conversation.findOne({ seller: seller._id });
      if (!conv) {
        conv = await Conversation.create({
          seller: seller._id,
          storeName: seller.storeName,
          sellerName: seller.ownerName,
          sellerEmail: seller.email,
          subject: 'Merchant Account Verified & Approved',
          status: 'open',
          lastAt: new Date(),
        });
      }

      const welcomeMsg =
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🎉 MERCHANT ACCOUNT APPROVED & ACTIVATED!\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Store: ${seller.storeName}\n` +
        `Owner: ${seller.ownerName}\n` +
        (isPaid ? `Security Deposit: $${depAmt.toLocaleString('en-US')} (Verified & Active in Wallet)\n` : `Onboarding: Referral Approved (${finalReferral || 'Master Referral'})\n`) +
        `Commission Rate: ${seller.commissionRate}%\n` +
        `Status: ACTIVE & FULLY VERIFIED\n\n` +
        `Welcome to Bazario Merchant Central! You can now add products and fulfill customer orders.\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━`;

      const msg = await Message.create({
        conversation: conv._id,
        seller: seller._id,
        sender: 'admin',
        senderName: req.admin.name || 'Platform Verification Team',
        text: welcomeMsg,
      });

      conv.lastMessage = `🎉 Account Approved & Activated!`;
      conv.lastSender = 'admin';
      conv.lastAt = new Date();
      conv.unreadForSeller = 1;
      await conv.save();

      const io = req.app.get('io');
      if (io) {
        io.to(`seller:${seller._id}`).emit('message:new', msg);
        io.to(`seller:${seller._id}`).emit('seller:status_update', { seller: seller.toObject() });
        io.to(`seller:${seller._id}`).emit('wallet:update', { wallet: seller.wallet, sellerId: seller._id });
        io.to('sellers').emit('seller:status_update', { seller: seller.toObject() });
      }
    } catch (chatErr) {
      console.error('Approval chat error:', chatErr.message);
    }

    notify(req.app, {
      recipientType: 'seller',
      sellerId: seller._id,
      type: 'approval',
      title: '🎉 Merchant Account Approved!',
      body: `Your store ${seller.storeName} is now active. You can start listing products and fulfilling orders.`,
      link: '/seller',
    });

    audit(req, 'approve', 'seller_registration', seller._id, `Approved seller ${seller.storeName} (Security Deposit: $${depAmt}, Referral: ${finalReferral || 'None'})`);

    const safe = seller.toObject();
    delete safe.passwordHash;
    res.json({ message: `Seller ${seller.storeName} approved and activated successfully! ✅`, seller: safe });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/:id/reject (Admin rejects a pending seller registration)
router.post('/:id/reject', authAdmin('sellers'), async (req, res) => {
  try {
    const { reason, isTestAccount, accountType } = req.body || {};
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    seller.status = 'suspended';
    seller.freezeReason = reason || 'KYC verification or document review rejected by platform administrator.';

    if (isTestAccount !== undefined) {
      seller.isTestAccount = Boolean(isTestAccount);
      seller.accountType = seller.isTestAccount ? 'test' : 'client';
    } else if (accountType !== undefined) {
      seller.accountType = accountType === 'test' ? 'test' : 'client';
      seller.isTestAccount = seller.accountType === 'test';
    }

    await seller.save();

    audit(req, 'reject', 'seller_registration', seller._id, `Rejected registration for ${seller.storeName}. Reason: ${reason}`);

    res.json({ message: `Registration for ${seller.storeName} rejected.`, seller });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/sellers/:id/toggle-test (Quick toggle Test Account vs Client Account)
router.patch('/:id/toggle-test', authAdmin('sellers'), async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    seller.isTestAccount = !seller.isTestAccount;
    seller.accountType = seller.isTestAccount ? 'test' : 'client';
    await seller.save();

    audit(req, 'update', 'seller', seller._id, `Toggled account type to ${seller.accountType} (${seller.isTestAccount ? 'Test' : 'Client'}) for ${seller.storeName}`);

    const safe = seller.toObject();
    delete safe.passwordHash;

    const io = req.app.get('io');
    if (io) {
      io.to('admins').emit('seller:status_update', { seller: safe });
    }

    res.json({
      ok: true,
      message: `Store "${seller.storeName}" is now set to ${seller.isTestAccount ? '🧪 TEST ACCOUNT' : '👤 CLIENT ACCOUNT'}.`,
      seller: safe,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/sellers/:id/toggle-previous-store (Quick toggle Previous Store Seller)
router.patch('/:id/toggle-previous-store', authAdmin('sellers'), async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    seller.isPreviousStoreSeller = !seller.isPreviousStoreSeller;
    await seller.save();

    audit(req, 'update', 'seller', seller._id, `Toggled previous store seller status to ${seller.isPreviousStoreSeller} for ${seller.storeName}`);

    const safe = seller.toObject();
    delete safe.passwordHash;

    const io = req.app.get('io');
    if (io) {
      io.to('admins').emit('seller:status_update', { seller: safe });
    }

    res.json({
      ok: true,
      message: `Store "${seller.storeName}" is now ${seller.isPreviousStoreSeller ? 'labeled as 🏛️ PREVIOUS STORE SELLER' : 'set to ✨ CURRENT STORE SELLER'}.`,
      seller: safe,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/:id/targets (Admin assigns a target & bonus to a seller)
router.post('/:id/targets', authAdmin('sellers'), async (req, res) => {
  try {
    const { title, targetOrders, targetOrderCount, bonusAmount, durationDays, adminNote, description } = req.body || {};
    const finalOrderCount = Number(targetOrders || targetOrderCount || 0);
    const finalBonus = Number(bonusAmount || 0);

    if (!title || !finalOrderCount || !finalBonus) {
      return res.status(400).json({ message: 'Target milestone title, target orders count, and bonus amount are required' });
    }

    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    seller.targets = seller.targets || [];
    const expiresAt = durationDays && Number(durationDays) > 0
      ? new Date(Date.now() + Number(durationDays) * 24 * 60 * 60 * 1000)
      : null;

    const newTarget = {
      title: title.trim(),
      targetOrders: finalOrderCount,
      targetOrderCount: finalOrderCount,
      currentOrders: 0,
      currentOrderCount: 0,
      bonusAmount: finalBonus,
      status: 'active',
      createdAt: new Date(),
      expiresAt,
      adminNote: (adminNote || description || '').trim(),
      description: (description || adminNote || '').trim(),
    };

    seller.targets.unshift(newTarget);
    seller.markModified('targets');
    await seller.save();

    // Auto-send chat notice
    try {
      let conv = await Conversation.findOne({ seller: seller._id });
      if (!conv) {
        conv = await Conversation.create({
          seller: seller._id,
          storeName: seller.storeName,
          sellerName: seller.ownerName,
          sellerEmail: seller.email,
          subject: 'Store Milestone & Bonus Target',
          status: 'open',
          lastAt: new Date(),
        });
      }

      const msgText =
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🎯 NEW PERFORMANCE TARGET & BONUS UNLOCKED!\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Target: ${newTarget.title}\n` +
        `Goal: Process & Deliver ${newTarget.targetOrders} Orders\n` +
        `Bonus Reward: $${newTarget.bonusAmount.toLocaleString('en-US')} Cash Bonus\n` +
        (expiresAt ? `Valid Until: ${expiresAt.toLocaleDateString('en-IN')}\n` : 'Duration: No Expiry\n') +
        (newTarget.adminNote ? `Note: ${newTarget.adminNote}\n` : '') +
        `Complete the target orders to receive an instant cash bonus credited directly to your wallet!\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━`;

      const msg = await Message.create({
        conversation: conv._id,
        seller: seller._id,
        sender: 'admin',
        senderName: req.admin.name || 'Platform Growth Desk',
        text: msgText,
      });

      conv.lastMessage = `🎯 New Target: Process ${newTarget.targetOrders} Orders for $${newTarget.bonusAmount} Bonus`;
      conv.lastSender = 'admin';
      conv.lastAt = new Date();
      conv.unreadForSeller = (conv.unreadForSeller || 0) + 1;
      await conv.save();

      req.app.get('io')?.to(`seller:${seller._id}`).emit('message:new', msg);
      req.app.get('io')?.to(`seller:${seller._id}`).emit('seller:targets_update', { targets: seller.targets });
    } catch (chatErr) {
      console.error('Target chat error:', chatErr.message);
    }

    notify(req.app, {
      recipientType: 'seller',
      sellerId: seller._id,
      type: 'approval',
      title: `🎯 New Sales Target: Earn $${newTarget.bonusAmount} Bonus!`,
      body: `Deliver ${newTarget.targetOrders} orders to unlock $${newTarget.bonusAmount} in bonus wallet credits.`,
      link: '/seller',
    });

    audit(req, 'create', 'seller_target', seller._id, `Assigned target "${title}" (${finalOrderCount} orders -> $${finalBonus} bonus) for ${seller.storeName}`);

    res.status(201).json({ message: `Target assigned to ${seller.storeName} successfully! 🎯`, targets: seller.targets });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sellers/targets/all (Admin lists all active targets across sellers)
router.get('/targets/all', authAdmin('sellers'), async (req, res) => {
  try {
    const sellers = await Seller.find({ 'targets.0': { $exists: true } })
      .select('storeName ownerName email targets')
      .sort({ updatedAt: -1 });

    const allTargets = [];
    sellers.forEach((s) => {
      (s.targets || []).forEach((t) => {
        allTargets.push({
          _id: t._id,
          targetId: t._id,
          sellerId: s._id,
          storeName: s.storeName,
          ownerName: s.ownerName,
          email: s.email,
          title: t.title,
          targetOrders: t.targetOrders || t.targetOrderCount || 0,
          targetOrderCount: t.targetOrders || t.targetOrderCount || 0,
          currentOrders: t.currentOrders || t.currentOrderCount || 0,
          currentOrderCount: t.currentOrders || t.currentOrderCount || 0,
          bonusAmount: t.bonusAmount || 0,
          status: t.status || 'active',
          createdAt: t.createdAt,
          expiresAt: t.expiresAt,
          completedAt: t.completedAt,
          adminNote: t.adminNote || t.description || '',
          description: t.description || t.adminNote || '',
        });
      });
    });

    res.json({ targets: allTargets });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/sellers/:id/targets/:targetId (Admin removes a target)
router.delete('/:id/targets/:targetId', authAdmin('sellers'), async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    seller.targets = (seller.targets || []).filter((t) => t._id?.toString() !== req.params.targetId);
    seller.markModified('targets');
    await seller.save();

    req.app.get('io')?.to(`seller:${seller._id}`).emit('seller:targets_update', { targets: seller.targets });
    res.json({ message: 'Target removed successfully', targets: seller.targets });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/sellers/:id (Admin deletes a seller)
router.delete('/:id', authAdmin('sellers'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return next();
    }
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const storeName = seller.storeName;
    const email = seller.email;

    await Seller.findByIdAndDelete(req.params.id);

    // Also remove or clean up products associated with seller
    await Product.deleteMany({ seller: req.params.id }).catch(() => {});

    audit(req, 'delete', 'seller', req.params.id, `Deleted seller: ${storeName} (${email})`);

    const io = req.app.get('io');
    if (io) {
      io.to('admins').emit('seller:deleted', { sellerId: req.params.id, storeName });
    }

    res.json({ ok: true, message: `Seller "${storeName}" deleted successfully.` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;


