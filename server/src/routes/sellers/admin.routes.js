import express from 'express';
import bcrypt from 'bcryptjs';
import Seller from '../../models/Seller.js';
import Product from '../../models/Product.js';
import Order from '../../models/Order.js';
import Withdrawal from '../../models/Withdrawal.js';
import { Conversation, Message } from '../../models/Chat.js';
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

// PUT /api/sellers/:id (Admin updates seller: commission, status, security deposit, password reset)
router.put('/:id', authAdmin('sellers'), async (req, res) => {
  try {
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
    } = req.body;

    if (storeName) seller.storeName = storeName;
    if (ownerName) seller.ownerName = ownerName;
    if (email) seller.email = email.toLowerCase().trim();
    if (phone !== undefined) seller.phone = phone;
    if (commissionRate !== undefined) seller.commissionRate = Number(commissionRate);
    if (status) seller.status = status;
    if (address) seller.address = { ...seller.address, ...address };

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

    if (password) {
      seller.passwordHash = await bcrypt.hash(password, 10);
    }

    await seller.save();
    audit(req, 'update', 'seller', seller._id, `Updated seller: ${seller.storeName}`);

    const safeSeller = seller.toObject();
    delete safeSeller.passwordHash;

    const io = req.app.get('io');
    if (io) {
      io.to(`seller:${seller._id}`).emit('seller:status_update', { seller: safeSeller });
      io.to(`seller:${seller._id}`).emit('wallet:update', { wallet: seller.wallet, sellerId: seller._id });
      io.to('sellers').emit('seller:status_update', { seller: safeSeller });
    }

    res.json(safeSeller);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

import { getSetting, setSetting } from '../../models/System.js';

// GET /api/sellers/master-referral (Get platform master referral code)
router.get('/master-referral', authAdmin('sellers'), async (req, res) => {
  try {
    const code = await getSetting('master_referral_code', 'REF-BAZARIO-2026');
    res.json({ masterReferralCode: code });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/master-referral (Update platform master referral code)
router.post('/master-referral', authAdmin('sellers'), async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code || !code.trim()) return res.status(400).json({ message: 'Referral code cannot be empty' });
    const cleanCode = code.trim().toUpperCase();
    await setSetting('master_referral_code', cleanCode);
    audit(req, 'update', 'system_setting', null, `Updated master referral code to ${cleanCode}`);
    res.json({ message: 'Master referral code updated successfully', masterReferralCode: cleanCode });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/:id/approve (Admin approves a pending seller registration)
router.post('/:id/approve', authAdmin('sellers'), async (req, res) => {
  try {
    const { securityDepositPaid, securityDepositAmount, referralCode, assignedReferralCode, commissionRate, note } = req.body || {};
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const isPaid = Boolean(securityDepositPaid);
    const depAmt = isPaid ? Math.max(0, Number(securityDepositAmount) || 0) : 0;
    const finalReferral = (assignedReferralCode || referralCode || seller.securityDeposit?.referralCode || '').trim();

    seller.status = 'active';
    seller.verified = true;
    if (commissionRate !== undefined) seller.commissionRate = Number(commissionRate);

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
    const { reason } = req.body || {};
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    seller.status = 'suspended';
    seller.freezeReason = reason || 'KYC verification or document review rejected by platform administrator.';
    await seller.save();

    audit(req, 'reject', 'seller_registration', seller._id, `Rejected registration for ${seller.storeName}. Reason: ${reason}`);

    res.json({ message: `Registration for ${seller.storeName} rejected.`, seller });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/:id/targets (Admin assigns a target & bonus to a seller)
router.post('/:id/targets', authAdmin('sellers'), async (req, res) => {
  try {
    const { title, targetOrders, bonusAmount, durationDays, adminNote } = req.body || {};
    if (!title || !targetOrders || !bonusAmount) {
      return res.status(400).json({ message: 'Target title, target orders count, and bonus amount are required' });
    }

    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    seller.targets = seller.targets || [];
    const expiresAt = durationDays && Number(durationDays) > 0
      ? new Date(Date.now() + Number(durationDays) * 24 * 60 * 60 * 1000)
      : null;

    const newTarget = {
      title: title.trim(),
      targetOrders: Number(targetOrders),
      currentOrders: 0,
      bonusAmount: Number(bonusAmount),
      status: 'active',
      createdAt: new Date(),
      expiresAt,
      adminNote: (adminNote || '').trim(),
    };

    seller.targets.unshift(newTarget);
    seller.markModified('targets');
    await seller.save();

    // Auto-send chat notice
    try {
      let conv = await Conversation.findOne({ seller: seller._id });
      if (conv) {
        const msgText =
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🎯 NEW PERFORMANCE TARGET & BONUS UNLOCKED!\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Target: ${newTarget.title}\n` +
          `Goal: Process & Deliver ${newTarget.targetOrders} Orders\n` +
          `Bonus Reward: $${newTarget.bonusAmount.toLocaleString('en-US')} Cash Bonus\n` +
          (expiresAt ? `Valid Until: ${expiresAt.toLocaleDateString('en-IN')}\n` : 'Duration: No Expiry\n') +
          (adminNote ? `Note: ${adminNote.trim()}\n` : '') +
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
      }
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

    audit(req, 'create', 'seller_target', seller._id, `Assigned target "${title}" (${targetOrders} orders -> $${bonusAmount} bonus) for ${seller.storeName}`);

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
          targetId: t._id,
          sellerId: s._id,
          storeName: s.storeName,
          ownerName: s.ownerName,
          email: s.email,
          title: t.title,
          targetOrders: t.targetOrders,
          currentOrders: t.currentOrders || 0,
          bonusAmount: t.bonusAmount,
          status: t.status,
          createdAt: t.createdAt,
          expiresAt: t.expiresAt,
          completedAt: t.completedAt,
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

export default router;

