import express from 'express';
import mongoose from 'mongoose';
import Seller from '../../models/Seller.js';
import Order from '../../models/Order.js';
import Withdrawal from '../../models/Withdrawal.js';
import { Conversation, Message } from '../../models/Chat.js';
import { authSeller, authAdmin, authSellerOrAdmin } from '../../middleware/auth.js';
import { notify } from '../../utils/notify.js';
import { audit } from '../../utils/audit.js';

const router = express.Router();

// Helper: securely find seller from authenticated token payload or verified admin request
async function getSellerFromReq(req) {
  // If caller is an Admin, allow targeting specific seller via params / body / query
  if (req.admin) {
    const sId = req.params?.id || req.body?.sellerId || req.query?.sellerId || req.seller?.id || req.seller?._id;
    if (sId && mongoose.Types.ObjectId.isValid(sId)) {
      const s = await Seller.findById(sId);
      if (s) return s;
    }
  }

  // If caller is a Seller, strictly use authenticated seller token payload
  if (req.seller) {
    const sId = req.seller.id || req.seller._id;
    if (sId && mongoose.Types.ObjectId.isValid(sId)) {
      const s = await Seller.findById(sId);
      if (s) return s;
    }
    if (req.seller.email) {
      const s = await Seller.findOne({ email: req.seller.email.toLowerCase() });
      if (s) return s;
    }
    if (req.seller.storeSlug) {
      const s = await Seller.findOne({ storeSlug: req.seller.storeSlug });
      if (s) return s;
    }
  }

  return null;
}

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
    const amountStr = `$${Number(reqDoc.amount).toLocaleString('en-US')}`;

    let details = '';
    if (isDeposit) {
      if (reqDoc.depositRef) details += `\nPayment Ref / UTR: ${reqDoc.depositRef}`;
      if (reqDoc.depositNote) details += `\nNote: ${reqDoc.depositNote}`;
    } else {
      if (reqDoc.method === 'upi') details = `\nUPI ID: ${reqDoc.upiId}\nRegistered Name: ${reqDoc.accountTitle || 'N/A'}`;
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
router.get('/wallet', authSellerOrAdmin, async (req, res) => {
  try {
    const seller = await getSellerFromReq(req);
    if (!seller) return res.status(404).json({ message: 'Seller not found. Please log in again.' });

    const w = seller.wallet || {};
    const requests = await Withdrawal.find({ seller: seller._id }).sort({ createdAt: -1 }).limit(100);

    const defaultLimit = {
      maxAmount: 500,
      minAmount: 10,
      requiredWithdrawalsForIncrease: 10,
      successfulWithdrawalCount: 0,
      upgradeFee: 50,
      currentTierName: 'Tier 1 - Standard ($500 Max)',
      pendingIncreaseRequest: { status: 'none' },
    };

    // Check pending unconfirmed orders count
    const pendingOrdersCount = await Order.countDocuments({
      $or: [
        { 'items.seller': seller._id, 'items.itemStatus': 'pending' },
        { seller: seller._id, status: 'pending' },
      ],
    });

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
        securityDeposit: seller.securityDeposit?.amount || w.securityDeposit || 0,
        securityDepositPaid: Boolean(seller.securityDeposit?.paid),
      },
      withdrawalLimit: seller.withdrawalLimit || defaultLimit,
      withdrawalMethods: seller.withdrawalMethods || {},
      pendingOrdersCount,
      requests,
      targets: seller.targets || [],
      seller: {
        storeName: seller.storeName,
        commissionRate: seller.commissionRate,
        payoutDetails: seller.payoutDetails,
        withdrawalMethods: seller.withdrawalMethods || {},
        securityDeposit: seller.securityDeposit || {},
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/wallet/deposit
router.post('/wallet/deposit', authSellerOrAdmin, async (req, res) => {
  try {
    const seller = await getSellerFromReq(req);
    if (!seller) return res.status(404).json({ message: 'Seller not found. Please log in again.' });

    const { amount, depositRef, depositNote, method, depositedFrom } = req.body;
    if (!amount || Number(amount) < 1) return res.status(400).json({ message: 'Minimum deposit amount is $1' });

    // Check if already pending deposit
    const hasPending = await Withdrawal.findOne({ seller: seller._id, type: 'deposit', status: 'pending' });
    if (hasPending) return res.status(400).json({ message: 'Aapki ek deposit request already pending hai. Admin approval ka wait karein.' });

    const fullNote = [depositNote, depositedFrom ? `Sender: ${depositedFrom}` : ''].filter(Boolean).join(' | ');

    const reqDoc = await Withdrawal.create({
      type: 'deposit',
      seller: seller._id,
      storeName: seller.storeName,
      amount: Number(amount),
      depositRef: depositRef || '',
      depositNote: fullNote || '',
      method: method || 'bank',
      status: 'pending',
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
      body: `${seller.storeName} requested to add $${Number(amount).toLocaleString('en-US')}`,
      link: '/admin/withdrawals',
    });

    notify(req.app, {
      recipientType: 'seller',
      sellerId: seller._id,
      type: 'deposit',
      title: '💰 Deposit Request Submitted',
      body: `Your deposit request for $${Number(amount).toLocaleString('en-US')} has been submitted for admin verification.`,
      link: '/seller/wallet',
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`seller:${seller._id}`).emit('wallet:update', {
        pendingDeposit: seller.wallet.pendingDeposit,
      });
      io.to('admins').emit('withdrawal:new', reqDoc);
    }

    res.status(201).json({ message: 'Deposit request submitted! Admin will verify and approve.', request: reqDoc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/wallet/withdraw — seller requests withdrawal from wallet
router.post('/wallet/withdraw', authSellerOrAdmin, async (req, res) => {
  try {
    const seller = await getSellerFromReq(req);
    if (!seller) return res.status(404).json({ message: 'Seller not found. Please log in again.' });

    // ─── UNCONFIRMED ORDERS WITHDRAWAL BLOCKER ───
    const unconfirmedOrders = await Order.find({
      $or: [
        { 'items.seller': seller._id, 'items.itemStatus': 'pending' },
        { seller: seller._id, status: 'pending' },
      ],
    });

    if (unconfirmedOrders.length > 0) {
      return res.status(400).json({
        message: `Withdrawal Blocked! You have ${unconfirmedOrders.length} unconfirmed pending order(s). Please confirm and process all incoming orders in "Orders & Dispatch" before requesting a payout transfer.`,
        unconfirmedOrdersCount: unconfirmedOrders.length,
      });
    }

    const { amount, method, upiId, accountTitle, accountNumber, bankName, ifscCode, branchName, accountType, phone, upiPhone, walletAddress, network } = req.body;
    const amt = Number(amount);

    const maxLimit = seller.withdrawalLimit?.maxAmount !== undefined ? seller.withdrawalLimit.maxAmount : 500;
    const minLimit = seller.withdrawalLimit?.minAmount !== undefined ? seller.withdrawalLimit.minAmount : 10;

    if (!amt || amt < minLimit) return res.status(400).json({ message: `Minimum withdrawal amount is $${minLimit.toFixed(2)}` });
    if (amt > maxLimit) {
      return res.status(400).json({
        message: `Withdrawal amount ($${amt.toFixed(2)}) exceeds your current tier limit of $${maxLimit.toFixed(2)}. Complete required store withdrawals to apply for a limit increase.`,
      });
    }

    const validMethods = ['upi', 'bank', 'paytm', 'gpay', 'phonepe', 'usdt', 'other'];
    if (!method || !validMethods.includes(method)) {
      return res.status(400).json({ message: 'Valid payment method required (bank, upi, paytm, gpay, phonepe, or usdt)' });
    }

    if (method === 'upi' && !upiId) return res.status(400).json({ message: 'UPI ID / VPA address is required' });
    if (method === 'bank' && (!accountNumber || !bankName)) {
      return res.status(400).json({ message: 'Bank details incomplete: account number and bank name are required' });
    }
    if ((method === 'paytm' || method === 'gpay' || method === 'phonepe') && !phone && !upiPhone && !upiId) {
      return res.status(400).json({ message: `${method.toUpperCase()} registered mobile number or UPI ID is required` });
    }
    if (method === 'usdt' && !walletAddress) {
      return res.status(400).json({ message: 'USDT TRC-20 / BEP-20 wallet address is required' });
    }

    const balance = seller.wallet?.balance || 0;
    if (amt > balance) return res.status(400).json({ message: `Insufficient wallet balance. Available: $${balance.toFixed(2)}` });

    // Check pending withdrawal
    const hasPending = await Withdrawal.findOne({ seller: seller._id, type: 'withdrawal', status: 'pending' });
    if (hasPending) return res.status(400).json({ message: 'Aapki ek withdrawal request already pending hai.' });

    const reqDoc = await Withdrawal.create({
      type: 'withdrawal',
      seller: seller._id,
      storeName: seller.storeName,
      amount: amt,
      method,
      upiId: (upiId || '').trim(),
      phone: (phone || upiPhone || '').trim(),
      walletAddress: (walletAddress || '').trim(),
      network: (network || 'TRC-20').trim(),
      accountTitle: (accountTitle || '').trim(),
      accountNumber: (accountNumber || '').trim(),
      bankName: (bankName || '').trim(),
      ifscCode: (ifscCode || '').trim().toUpperCase(),
      branchName: (branchName || '').trim(),
      accountType: (accountType || '').trim(),
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
      body: `${seller.storeName} requested $${amt.toLocaleString('en-US')} via ${method.toUpperCase()}`,
      link: '/admin/withdrawals',
    });

    notify(req.app, {
      recipientType: 'seller',
      sellerId: seller._id,
      type: 'withdrawal',
      title: '💸 Payout Request Submitted',
      body: `Your payout transfer request for $${amt.toLocaleString('en-US')} has been submitted.`,
      link: '/seller/wallet',
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`seller:${seller._id}`).emit('wallet:update', {
        balance: seller.wallet.balance,
        pendingWithdrawal: seller.wallet.pendingWithdrawal,
      });
      io.to('admins').emit('withdrawal:new', reqDoc);
    }

    res.status(201).json({ message: 'Withdrawal request submitted! Admin will process within 2-3 business days.', request: reqDoc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/wallet/limit-increase-request (Seller applies for a higher withdrawal tier)
router.post('/wallet/limit-increase-request', authSellerOrAdmin, async (req, res) => {
  try {
    const seller = await getSellerFromReq(req);
    if (!seller) return res.status(404).json({ message: 'Seller not found. Please log in again.' });

    const { requestedLimit, reason } = req.body;
    const reqLimit = Number(requestedLimit);

    if (!reqLimit || reqLimit <= 0) {
      return res.status(400).json({ message: 'Please specify a valid requested limit greater than $0' });
    }

    const currentMax = seller.withdrawalLimit?.maxAmount !== undefined ? seller.withdrawalLimit.maxAmount : 500;
    if (reqLimit <= currentMax) {
      return res.status(400).json({ message: `Requested limit ($${reqLimit}) must be greater than your current limit ($${currentMax})` });
    }

    if (seller.withdrawalLimit?.pendingIncreaseRequest?.status === 'pending') {
      return res.status(400).json({ message: 'A limit increase application is already pending admin review.' });
    }

    if (!seller.withdrawalLimit) {
      seller.withdrawalLimit = {
        maxAmount: 500,
        minAmount: 10,
        requiredWithdrawalsForIncrease: 10,
        successfulWithdrawalCount: 0,
        upgradeFee: 50,
        currentTierName: 'Tier 1 - Standard ($500 Max)',
      };
    }

    const completedCount = seller.withdrawalLimit.successfulWithdrawalCount || 0;
    const requiredCount = seller.withdrawalLimit.requiredWithdrawalsForIncrease || 10;

    // Enforce requirement check: Seller must complete required successful withdrawals at current tier
    if (completedCount < requiredCount) {
      return res.status(400).json({
        message: `You have completed ${completedCount}/${requiredCount} approved withdrawals for your current tier. You must fulfill ${requiredCount - completedCount} more approved withdrawals before applying for a limit increase.`,
      });
    }

    const upgradeFee = seller.withdrawalLimit.upgradeFee !== undefined ? seller.withdrawalLimit.upgradeFee : 50;

    seller.withdrawalLimit.pendingIncreaseRequest = {
      requestedLimit: reqLimit,
      reason: (reason || '').trim(),
      status: 'pending',
      upgradeFeeCharged: upgradeFee,
      createdAt: new Date(),
    };

    seller.markModified('withdrawalLimit');
    await seller.save();

    // Send Official System Chat Message to Seller-Admin Support Room
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

      const msgText =
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🚀 WITHDRAWAL LIMIT INCREASE APPLICATION\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Store: ${seller.storeName}\n` +
        `Current Limit: $${currentMax.toLocaleString('en-US')}\n` +
        `Requested New Limit: $${reqLimit.toLocaleString('en-US')}\n` +
        `Tier Progress: ${completedCount} / ${requiredCount} Completed Withdrawals\n` +
        `Upgrade Processing Fee: $${upgradeFee.toLocaleString('en-US')}\n` +
        (reason ? `Reason: ${reason.trim()}\n` : '') +
        `Status: PENDING — Awaiting Admin Review & Approval\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━`;

      const msg = await Message.create({
        conversation: conv._id,
        seller: seller._id,
        sender: 'seller',
        senderName: seller.storeName,
        text: msgText,
      });

      conv.lastMessage = `🚀 Limit Increase Request: $${reqLimit}`;
      conv.lastSender = 'seller';
      conv.lastAt = new Date();
      conv.unreadForAdmin = (conv.unreadForAdmin || 0) + 1;
      await conv.save();

      const io = req.app.get('io');
      if (io) {
        io.to(`seller:${seller._id}`).emit('message:new', msg);
        io.to('admins').emit('message:new', msg);
        io.to('admins').emit('chat:notification', {
          conversationId: conv._id,
          storeName: seller.storeName,
          text: `🚀 Limit Increase Request — $${reqLimit}`,
        });
      }
    } catch (chatErr) {
      console.error('Limit request chat notification error:', chatErr.message);
    }

    // Live Admin Toast Notification
    notify(req.app, {
      recipientType: 'admin',
      type: 'withdrawal',
      title: '🚀 Withdrawal Limit Increase Request',
      body: `${seller.storeName} applied to increase withdrawal limit from $${currentMax} to $${reqLimit}`,
      link: '/admin/withdrawals',
    });

    res.json({
      message: 'Withdrawal limit increase application submitted successfully! Admin will review shortly.',
      withdrawalLimit: seller.withdrawalLimit,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/wallet/limit-offer-response (Seller accepts or declines Admin's upgrade terms quote)
router.post('/wallet/limit-offer-response', authSellerOrAdmin, async (req, res) => {
  try {
    const { action } = req.body || {}; // 'accept' | 'decline'
    if (!['accept', 'decline'].includes(action)) {
      return res.status(400).json({ message: 'Action must be "accept" or "decline"' });
    }

    const seller = await getSellerFromReq(req);
    if (!seller) return res.status(404).json({ message: 'Seller not found. Please log in again.' });

    if (!seller.withdrawalLimit) {
      seller.withdrawalLimit = {};
    }
    if (!seller.withdrawalLimit.pendingIncreaseRequest) {
      seller.withdrawalLimit.pendingIncreaseRequest = {};
    }

    const pending = seller.withdrawalLimit.pendingIncreaseRequest;
    if (!pending || (!['offered', 'pending', 'accepted_by_seller'].includes(pending.status) && action === 'accept')) {
      if (pending && pending.status === 'accepted_by_seller') {
        return res.json({
          message: 'Terms already accepted! Waiting for admin to activate your new limit.',
          withdrawalLimit: seller.withdrawalLimit,
        });
      }
      return res.status(400).json({ message: 'No active limit upgrade offer found awaiting your response' });
    }

    if (action === 'accept') {
      seller.withdrawalLimit.pendingIncreaseRequest.status = 'accepted_by_seller';
      seller.withdrawalLimit.pendingIncreaseRequest.sellerAcceptedAt = new Date();
      seller.markModified('withdrawalLimit');
      await seller.save();

      // Send chat notification to Admin
      try {
        const conv = await Conversation.findOne({ seller: seller._id });
        if (conv) {
          const msgText =
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🤝 SELLER ACCEPTED LIMIT UPGRADE OFFER TERMS\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Store: ${seller.storeName}\n` +
            `Agreed New Limit: $${(pending.offeredLimit || 0).toLocaleString('en-US')}\n` +
            `Agreed Upgrade Fee: $${(pending.offeredFee || 0).toLocaleString('en-US')}\n` +
            `Target Required Withdrawals: ${pending.offeredNextCount || 15} Orders\n` +
            `Status: ACCEPTED BY SELLER — Ready for Admin Final Activation\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━`;

          const msg = await Message.create({
            conversation: conv._id,
            seller: seller._id,
            sender: 'seller',
            senderName: seller.storeName,
            text: msgText,
          });

          conv.lastMessage = `🤝 Limit Offer Accepted: $${pending.offeredLimit}`;
          conv.lastSender = 'seller';
          conv.lastAt = new Date();
          conv.unreadForAdmin = (conv.unreadForAdmin || 0) + 1;
          await conv.save();

          const io = req.app.get('io');
          if (io) {
            io.to(`seller:${seller._id}`).emit('message:new', msg);
            io.to(`seller:${seller._id}`).emit('seller:limit_update', { withdrawalLimit: seller.withdrawalLimit });
            io.to('admins').emit('message:new', msg);
            io.to('admins').emit('chat:notification', {
              conversationId: conv._id,
              storeName: seller.storeName,
              text: `🤝 Offer Accepted — $${pending.offeredLimit} limit ready to activate`,
            });
          }
        }
      } catch (chatErr) {
        console.error('Chat error:', chatErr.message);
      }

      notify(req.app, {
        recipientType: 'admin',
        type: 'withdrawal',
        title: '🤝 Limit Upgrade Offer Accepted by Seller',
        body: `${seller.storeName} accepted $${pending.offeredLimit} limit offer. Awaiting your final activation button.`,
        link: '/admin/withdrawals',
      });

      return res.json({
        message: 'Terms accepted! Request forwarded to Admin for final limit activation.',
        withdrawalLimit: seller.withdrawalLimit,
      });
    } else {
      // Decline
      seller.withdrawalLimit.pendingIncreaseRequest.status = 'declined_by_seller';
      seller.markModified('withdrawalLimit');
      await seller.save();

      try {
        const conv = await Conversation.findOne({ seller: seller._id });
        if (conv) {
          const msgText =
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `ℹ️ SELLER DECLINED LIMIT UPGRADE OFFER\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Store: ${seller.storeName}\n` +
            `Seller decided to keep their existing limit of $${(seller.withdrawalLimit?.maxAmount || 500).toLocaleString('en-US')}.\n` +
            `No upgrade fees were deducted.\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━`;

          const msg = await Message.create({
            conversation: conv._id,
            seller: seller._id,
            sender: 'seller',
            senderName: seller.storeName,
            text: msgText,
          });

          conv.lastMessage = `ℹ️ Limit Offer Declined`;
          conv.lastSender = 'seller';
          conv.lastAt = new Date();
          conv.unreadForAdmin = (conv.unreadForAdmin || 0) + 1;
          await conv.save();

          const io = req.app.get('io');
          if (io) {
            io.to(`seller:${seller._id}`).emit('message:new', msg);
            io.to(`seller:${seller._id}`).emit('seller:limit_update', { withdrawalLimit: seller.withdrawalLimit });
            io.to('admins').emit('message:new', msg);
          }
        }
      } catch (chatErr) {
        console.error('Chat error:', chatErr.message);
      }

      return res.json({
        message: 'Offer declined. Your current withdrawal limit remains active with $0 fees charged.',
        withdrawalLimit: seller.withdrawalLimit,
      });
    }
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

    const seller = await Seller.findById(reqDoc.seller._id || reqDoc.seller);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const sellerMaxLimit = seller.withdrawalLimit?.maxAmount !== undefined ? seller.withdrawalLimit.maxAmount : 500;

    // Determine final approved amount
    let finalAmount = reqDoc.amount;
    if (approvedAmount !== undefined && approvedAmount !== null && approvedAmount !== '') {
      const parsed = Number(approvedAmount);
      if (!isNaN(parsed) && parsed >= 0) {
        finalAmount = parsed;
      }
    }

    // Validation: Admin cannot approve more than requested or seller's tier limit
    if (status === 'approved') {
      if (reqDoc.type === 'withdrawal') {
        if (finalAmount > reqDoc.amount) {
          return res.status(400).json({ message: `Approved amount ($${finalAmount}) cannot exceed requested withdrawal amount ($${reqDoc.amount})` });
        }
        if (finalAmount > sellerMaxLimit) {
          return res.status(400).json({ message: `Approved amount ($${finalAmount}) cannot exceed seller's single withdrawal limit ($${sellerMaxLimit})` });
        }
      }
    }

    reqDoc.status = status;
    reqDoc.approvedAmount = status === 'approved' ? finalAmount : 0;
    reqDoc.adminNote = adminNote || '';
    reqDoc.transactionRef = transactionRef || '';
    reqDoc.processedAt = new Date();
    reqDoc.processedBy = req.admin.name || 'Admin';

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

        // Increment successful withdrawal count towards tier upgrade
        if (!seller.withdrawalLimit) {
          seller.withdrawalLimit = {
            maxAmount: 500,
            minAmount: 10,
            requiredWithdrawalsForIncrease: 10,
            successfulWithdrawalCount: 0,
            upgradeFee: 50,
            currentTierName: 'Tier 1 - Standard ($500 Max)',
          };
        }
        seller.withdrawalLimit.successfulWithdrawalCount = (seller.withdrawalLimit.successfulWithdrawalCount || 0) + 1;

        // Partial Payout: If admin approved less than requested (e.g. $300 out of $500), refund remainder ($200) to balance
        if (finalAmount < reqDoc.amount) {
          const refundRemainder = reqDoc.amount - finalAmount;
          seller.wallet.balance = (seller.wallet.balance || 0) + refundRemainder;
        }
      } else if (status === 'rejected') {
        // Refund full requested amount back to balance on rejection
        seller.wallet.balance = (seller.wallet.balance || 0) + reqDoc.amount;
      }
    }

    reqDoc.balanceAfter = seller.wallet.balance;
    await reqDoc.save();
    seller.markModified('wallet');
    seller.markModified('withdrawalLimit');
    await seller.save();

    // Send chat notification about result
    try {
      const conv = await Conversation.findOne({ seller: seller._id });
      if (conv) {
        const resultEmoji = status === 'approved' ? '✅' : '❌';
        const typeLabel = reqDoc.type === 'deposit' ? 'Deposit' : 'Withdrawal';

        let amountInfo = `Amount: $${reqDoc.amount.toLocaleString('en-US')}\n`;
        if (status === 'approved' && finalAmount !== reqDoc.amount) {
          if (reqDoc.type === 'deposit') {
            amountInfo =
              `Requested Deposit: $${reqDoc.amount.toLocaleString('en-US')}\n` +
              `Credited Amount: $${finalAmount.toLocaleString('en-US')}\n`;
          } else {
            const diff = reqDoc.amount - finalAmount;
            amountInfo =
              `Requested Payout: $${reqDoc.amount.toLocaleString('en-US')}\n` +
              `Approved Payout: $${finalAmount.toLocaleString('en-US')}\n` +
              `Refunded to Balance: $${diff.toLocaleString('en-US')}\n`;
          }
        }

        const msgText =
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `${resultEmoji} ${typeLabel.toUpperCase()} REQUEST ${status.toUpperCase()}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          amountInfo +
          `New Available Balance: $${(seller.wallet.balance || 0).toLocaleString('en-US')}\n` +
          (reqDoc.type === 'withdrawal' && status === 'approved' ? `Tier Upgrade Progress: ${seller.withdrawalLimit?.successfulWithdrawalCount || 1}/${seller.withdrawalLimit?.requiredWithdrawalsForIncrease || 10} completed\n` : '') +
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

        conv.lastMessage = `${resultEmoji} ${typeLabel} ${status} — $${finalAmount}`;
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
        notifyBody = `$${finalAmount.toLocaleString('en-US')} has been credited to your wallet. Balance: $${seller.wallet.balance.toLocaleString('en-US')}`;
      } else {
        const diff = reqDoc.amount - finalAmount;
        notifyBody = diff > 0
          ? `$${finalAmount.toLocaleString('en-US')} approved for payout. Remaining $${diff.toLocaleString('en-US')} refunded to your wallet. Balance: $${seller.wallet.balance.toLocaleString('en-US')}`
          : `$${finalAmount.toLocaleString('en-US')} withdrawal approved. Balance: $${seller.wallet.balance.toLocaleString('en-US')}`;
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

    const io = req.app.get('io');
    if (io) {
      io.to(`seller:${seller._id}`).emit('wallet:update', {
        balance: seller.wallet.balance,
        totalWithdrawn: seller.wallet.totalWithdrawn,
        totalDeposited: seller.wallet.totalDeposited,
        totalEarned: seller.wallet.totalEarned,
        pendingWithdrawal: seller.wallet.pendingWithdrawal,
        pendingDeposit: seller.wallet.pendingDeposit,
      });
      io.to(`seller:${seller._id}`).emit('withdrawal:update', reqDoc);
      io.to('admins').emit('withdrawal:update', reqDoc);
    }

    audit(req, 'update', 'wallet_request', reqDoc._id, `${reqDoc.type} ${status} for ${reqDoc.storeName} — $${finalAmount}`);
    res.json({ message: `Request ${status} successfully`, request: reqDoc, wallet: seller.wallet });
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
        return res.status(400).json({ message: `Insufficient balance to debit. Available: $${seller.wallet.balance || 0}` });
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
      balanceAfter: seller.wallet.balance,
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
        `Amount: ${isCredit ? '+' : '-'}$${amt.toLocaleString('en-US')}\n` +
        `New Available Balance: $${seller.wallet.balance.toLocaleString('en-US')}\n` +
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

      conv.lastMessage = `${emoji} ${isCredit ? 'Credit' : 'Debit'}: $${amt}`;
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
      body: `$${amt.toLocaleString('en-US')} has been ${type === 'credit' ? 'added to' : 'deducted from'} your wallet. Balance: $${seller.wallet.balance.toLocaleString('en-US')}`,
      link: '/seller/wallet',
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`seller:${seller._id}`).emit('wallet:update', {
        balance: seller.wallet.balance,
        totalDeposited: seller.wallet.totalDeposited,
        totalWithdrawn: seller.wallet.totalWithdrawn,
      });
      io.to('admins').emit('withdrawal:new', rec);
    }

    audit(req, 'create', 'wallet_adjustment', rec._id, `Direct wallet ${type} $${amt} for ${seller.storeName}`);

    res.json({
      message: `Successfully ${type === 'credit' ? 'credited' : 'debited'} $${amt} to ${seller.storeName}'s wallet`,
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

// GET /api/sellers/limit-requests/all (Admin lists all pending/offered/accepted/past limit upgrade requests)
router.get('/limit-requests/all', authAdmin('finance'), async (req, res) => {
  try {
    const sellers = await Seller.find({
      'withdrawalLimit.pendingIncreaseRequest.status': {
        $in: ['pending', 'offered', 'accepted_by_seller', 'approved', 'rejected', 'declined_by_seller'],
      },
    }).select('storeName ownerName email wallet withdrawalLimit');

    const requests = sellers
      .map((s) => ({
        sellerId: s._id,
        storeName: s.storeName,
        ownerName: s.ownerName,
        email: s.email,
        walletBalance: s.wallet?.balance || 0,
        currentMaxAmount: s.withdrawalLimit?.maxAmount !== undefined ? s.withdrawalLimit.maxAmount : 500,
        currentTierName: s.withdrawalLimit?.currentTierName || 'Tier 1 - Standard ($500 Max)',
        successfulWithdrawalCount: s.withdrawalLimit?.successfulWithdrawalCount || 0,
        requiredWithdrawalsForIncrease: s.withdrawalLimit?.requiredWithdrawalsForIncrease || 10,
        upgradeFee: s.withdrawalLimit?.upgradeFee !== undefined ? s.withdrawalLimit.upgradeFee : 50,
        pendingRequest: s.withdrawalLimit?.pendingIncreaseRequest || {},
      }))
      .sort((a, b) => new Date(b.pendingRequest.createdAt || 0) - new Date(a.pendingRequest.createdAt || 0));

    res.json({ requests });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/:id/limit-offer (Step 1: Admin quotes proposed terms to seller - $0 deducted)
router.post('/:id/limit-offer', authAdmin('finance'), async (req, res) => {
  try {
    const { offeredLimit, offeredNextCount, offeredFee, offeredTierName, adminNote } = req.body;
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    if (!seller.withdrawalLimit) {
      seller.withdrawalLimit = {
        maxAmount: 500,
        minAmount: 10,
        requiredWithdrawalsForIncrease: 10,
        successfulWithdrawalCount: 0,
        upgradeFee: 50,
        currentTierName: 'Tier 1 - Standard ($500 Max)',
      };
    }

    const proposedLimit = Number(offeredLimit) || 2000;
    const nextTarget = Number(offeredNextCount) || 15;
    const fee = offeredFee !== undefined ? Number(offeredFee) : 50;
    const tierName = offeredTierName || `Tier Upgraded ($${proposedLimit} Max)`;

    seller.withdrawalLimit.pendingIncreaseRequest = {
      requestedLimit: seller.withdrawalLimit.pendingIncreaseRequest?.requestedLimit || proposedLimit,
      reason: seller.withdrawalLimit.pendingIncreaseRequest?.reason || '',
      status: 'offered',
      offeredLimit: proposedLimit,
      offeredFee: fee,
      offeredNextCount: nextTarget,
      offeredTierName: tierName,
      adminNote: (adminNote || '').trim(),
      offeredAt: new Date(),
      createdAt: seller.withdrawalLimit.pendingIncreaseRequest?.createdAt || new Date(),
    };

    seller.markModified('withdrawalLimit');
    await seller.save();

    // Send Offer Notice to Support Chat
    try {
      const conv = await Conversation.findOne({ seller: seller._id });
      if (conv) {
        const msgText =
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `📋 OFFICIAL LIMIT UPGRADE OFFER / QUOTE\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Store: ${seller.storeName}\n` +
          `Proposed New Limit: $${proposedLimit.toLocaleString('en-US')}\n` +
          `Tier: ${tierName}\n` +
          `Upgrade Processing Fee: $${fee.toLocaleString('en-US')} (Only charged upon final activation)\n` +
          `Target Required Withdrawals: ${nextTarget} Completed Orders\n` +
          (adminNote ? `Admin Note: ${adminNote.trim()}\n` : '') +
          `Action: Please review the offer slip in your Merchant Wallet and click "Accept Terms" to proceed.\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━`;

        const msg = await Message.create({
          conversation: conv._id,
          seller: seller._id,
          sender: 'admin',
          senderName: req.admin.name || 'Platform Finance',
          text: msgText,
        });

        conv.lastMessage = `📋 Limit Offer: $${proposedLimit} (Fee: $${fee})`;
        conv.lastSender = 'admin';
        conv.lastAt = new Date();
        conv.unreadForSeller = (conv.unreadForSeller || 0) + 1;
        await conv.save();

        const io = req.app.get('io');
        if (io) {
          io.to(`seller:${seller._id}`).emit('message:new', msg);
          io.to(`seller:${seller._id}`).emit('seller:limit_update', { withdrawalLimit: seller.withdrawalLimit });
          io.to('admins').emit('message:new', msg);
        }
      }
    } catch (chatErr) {
      console.error('Chat error:', chatErr.message);
    }

    notify(req.app, {
      recipientType: 'seller',
      sellerId: seller._id,
      type: 'approval',
      title: `📋 Limit Upgrade Offer: $${proposedLimit}`,
      body: `Admin quoted $${proposedLimit} single withdrawal limit for $${fee} fee. Open Wallet to review and accept terms.`,
      link: '/seller/wallet?tab=withdraw',
    });

    audit(req, 'update', 'seller_limit', seller._id, `Quoted limit upgrade offer of $${proposedLimit} (Fee: $${fee}) for ${seller.storeName}`);

    res.json({
      message: `Offer sent to ${seller.storeName}! Waiting for seller to review and accept terms.`,
      withdrawalLimit: seller.withdrawalLimit,
      seller,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/:id/limit-finalize (Step 3: Admin clicks "Finalize & Activate Limit Increase" - Fee Deducted & Limit Activated)
router.post('/:id/limit-finalize', authAdmin('finance'), async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const pending = seller.withdrawalLimit?.pendingIncreaseRequest;
    if (!pending || !['offered', 'accepted_by_seller', 'pending'].includes(pending.status)) {
      return res.status(400).json({ message: 'No valid limit upgrade request found to finalize' });
    }

    const prevLimit = seller.withdrawalLimit?.maxAmount || 500;
    const newLimit = pending.offeredLimit || pending.requestedLimit || 2000;
    const nextTarget = pending.offeredNextCount || 15;
    const feeToCharge = pending.offeredFee !== undefined ? pending.offeredFee : (seller.withdrawalLimit?.upgradeFee || 50);
    const tierName = pending.offeredTierName || `Tier Upgraded ($${newLimit} Max)`;

    // Check seller wallet balance before deducting
    seller.wallet = seller.wallet || {};
    const currentBal = seller.wallet.balance || 0;

    // Deduct Upgrade Fee from Seller Wallet (if fee > 0)
    if (feeToCharge > 0) {
      seller.wallet.balance = currentBal - feeToCharge;

      // Record in ledger as an adjustment
      await Withdrawal.create({
        type: 'adjustment',
        seller: seller._id,
        storeName: seller.storeName,
        amount: -feeToCharge,
        balanceAfter: seller.wallet.balance,
        isManualAdjustment: true,
        status: 'completed',
        adminNote: `Withdrawal Limit Upgrade Fee: Upgraded from $${prevLimit} to $${newLimit}`,
        processedAt: new Date(),
        processedBy: req.admin.name || 'Admin',
      });
    }

    // Activate New Tier Limits
    seller.withdrawalLimit.maxAmount = newLimit;
    seller.withdrawalLimit.requiredWithdrawalsForIncrease = nextTarget;
    seller.withdrawalLimit.successfulWithdrawalCount = 0; // Reset progress for the new tier
    seller.withdrawalLimit.currentTierName = tierName;
    seller.withdrawalLimit.pendingIncreaseRequest = {
      status: 'approved',
      requestedLimit: newLimit,
      offeredLimit: newLimit,
      upgradeFeeCharged: feeToCharge,
      adminNote: pending.adminNote || 'Finalized and activated by Administrator',
      createdAt: new Date(),
    };

    seller.markModified('withdrawalLimit');
    seller.markModified('wallet');
    await seller.save();

    // Official Celebratory Chat Announcement
    try {
      const conv = await Conversation.findOne({ seller: seller._id });
      if (conv) {
        const msgText =
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🎉 WITHDRAWAL LIMIT INCREASE FINALIZED & ACTIVATED!\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Store: ${seller.storeName}\n` +
          `New Single Withdrawal Limit: $${newLimit.toLocaleString('en-US')}\n` +
          `Tier: ${tierName}\n` +
          `Next Upgrade Requirement: ${nextTarget} Completed Withdrawals\n` +
          (feeToCharge > 0 ? `Upgrade Fee Deducted: $${feeToCharge.toLocaleString('en-US')}\n` : '') +
          `New Available Balance: $${(seller.wallet?.balance || 0).toLocaleString('en-US')}\n` +
          `Status: ACTIVE & VERIFIED\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━`;

        const msg = await Message.create({
          conversation: conv._id,
          seller: seller._id,
          sender: 'admin',
          senderName: req.admin.name || 'Platform Finance',
          text: msgText,
        });

        conv.lastMessage = `🎉 Limit Activated: $${newLimit}`;
        conv.lastSender = 'admin';
        conv.lastAt = new Date();
        conv.unreadForSeller = (conv.unreadForSeller || 0) + 1;
        await conv.save();

        const io = req.app.get('io');
        if (io) {
          io.to(`seller:${seller._id}`).emit('message:new', msg);
          io.to(`seller:${seller._id}`).emit('seller:limit_update', { withdrawalLimit: seller.withdrawalLimit });
          io.to('admins').emit('message:new', msg);
        }
      }
    } catch (chatErr) {
      console.error('Chat error:', chatErr.message);
    }

    notify(req.app, {
      recipientType: 'seller',
      sellerId: seller._id,
      type: 'approval',
      title: `🚀 Limit Upgraded to $${newLimit}!`,
      body: `Your new single withdrawal limit of $${newLimit} is now active. Upgrade fee: $${feeToCharge}.`,
      link: '/seller/wallet?tab=withdraw',
    });

    audit(req, 'update', 'seller_limit', seller._id, `Finalized and activated limit increase of $${newLimit} (Fee: $${feeToCharge}) for ${seller.storeName}`);

    res.json({
      message: `Limit upgrade finalized & activated! New limit is $${newLimit}`,
      withdrawalLimit: seller.withdrawalLimit,
      seller,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/:id/limit-increase-decision (Admin direct reject/decline)
router.post('/:id/limit-increase-decision', authAdmin('finance'), async (req, res) => {
  try {
    const { action = 'reject', adminNote } = req.body;
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    seller.withdrawalLimit.pendingIncreaseRequest = {
      status: 'rejected',
      adminNote: (adminNote || '').trim(),
      createdAt: new Date(),
    };
    seller.markModified('withdrawalLimit');
    await seller.save();

    try {
      const conv = await Conversation.findOne({ seller: seller._id });
      if (conv) {
        const msgText =
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `❌ WITHDRAWAL LIMIT INCREASE DECLINED\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Your application to increase withdrawal limit has been declined.\n` +
          (adminNote ? `Reason: ${adminNote.trim()}\n` : '') +
          `You can re-apply after completing additional verified store orders.\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━`;

        const msg = await Message.create({
          conversation: conv._id,
          seller: seller._id,
          sender: 'admin',
          senderName: req.admin.name || 'Platform Finance',
          text: msgText,
        });

        conv.lastMessage = `❌ Limit Increase Declined`;
        conv.lastSender = 'admin';
        conv.lastAt = new Date();
        conv.unreadForSeller = (conv.unreadForSeller || 0) + 1;
        await conv.save();

        const io = req.app.get('io');
        if (io) {
          io.to(`seller:${seller._id}`).emit('message:new', msg);
          io.to(`seller:${seller._id}`).emit('seller:limit_update', { withdrawalLimit: seller.withdrawalLimit });
          io.to('admins').emit('message:new', msg);
        }
      }
    } catch (chatErr) {
      console.error('Chat error:', chatErr.message);
    }

    notify(req.app, {
      recipientType: 'seller',
      sellerId: seller._id,
      type: 'withdrawal',
      title: `Withdrawal Limit Application Declined`,
      body: `Your limit increase request was declined. ${adminNote || ''}`,
      link: '/seller/wallet?tab=withdraw',
    });

    audit(req, 'update', 'seller_limit', seller._id, `Declined limit increase for ${seller.storeName}`);

    res.json({
      message: 'Limit increase request declined',
      seller,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/:id/withdrawal-limit (Admin directly updates withdrawal limit settings)
router.post('/:id/withdrawal-limit', authAdmin(), async (req, res) => {
  try {
    const { maxAmount, minAmount, requiredWithdrawalsForIncrease, successfulWithdrawalCount, upgradeFee, currentTierName } = req.body;
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    if (!seller.withdrawalLimit) {
      seller.withdrawalLimit = {};
    }

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
      body: `Your store withdrawal limit has been updated to $${(seller.withdrawalLimit.maxAmount || 500).toLocaleString('en-US')} by Platform Administration.`,
      link: '/seller/wallet?tab=withdraw',
    });

    audit(req, 'update', 'seller_limit', seller._id, `Directly updated withdrawal limit settings for ${seller.storeName}`);

    res.json({
      message: 'Withdrawal limit settings updated successfully',
      withdrawalLimit: seller.withdrawalLimit,
      seller,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
