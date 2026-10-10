import express from 'express';
import mongoose from 'mongoose';
import Seller from '../../models/Seller.js';
import Order from '../../models/Order.js';
import Withdrawal from '../../models/Withdrawal.js';
import { Conversation, Message } from '../../models/Chat.js';
import { authSeller, authAdmin, authSellerOrAdmin } from '../../middleware/auth.js';
import { notify } from '../../utils/notify.js';
import { audit } from '../../utils/audit.js';
import { finLog, requestApproval, isLedgerCounted } from '../../utils/financeLog.js';
import { walletApply, walletNow } from '../../utils/wallet.js';
import { applyDecisionToWallet, requestFieldsFor, finishStuckWalletRequests } from '../../utils/walletRequests.js';
import { asText } from '../../middleware/sanitize.js';

const router = express.Router();

// Helper: securely find seller from authenticated token payload or verified admin request
async function getSellerFromReq(req) {
  // If caller is an Admin, allow targeting specific seller via params / body / query
  if (req.admin) {
    const sId = req.params?.id || req.body?.sellerId || req.query?.sellerId || req.seller?.id || req.seller?._id;
    if (sId && mongoose.Types.ObjectId.isValid(sId)) {
      const s = await Seller.findById(sId).select('-kycDocuments');
      if (s) return s;
    }
  }

  // If caller is a Seller, strictly use authenticated seller token payload
  if (req.seller) {
    const sId = req.seller.id || req.seller._id;
    if (sId && mongoose.Types.ObjectId.isValid(sId)) {
      const s = await Seller.findById(sId).select('-kycDocuments');
      if (s) return s;
    }
    if (req.seller.email) {
      const s = await Seller.findOne({ email: req.seller.email.toLowerCase() }).select('-kycDocuments');
      if (s) return s;
    }
    if (req.seller.storeSlug) {
      const s = await Seller.findOne({ storeSlug: req.seller.storeSlug }).select('-kycDocuments');
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

    // Sanitize requests: helpingAmount, binanceRate, inrAmount, and usdtAmount are strictly admin internal fields and hidden from seller
    const sanitizedRequests = requests.map((r) => {
      const obj = r.toObject();
      if (!req.admin) {
        delete obj.helpingAmount;
        delete obj.binanceRate;
        delete obj.inrAmount;
        delete obj.usdtAmount;
      }
      return obj;
    });

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
      requests: sanitizedRequests,
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

    const amount = Number(req.body?.amount);
    const depositRef = asText(req.body?.depositRef, 200);
    const depositNote = asText(req.body?.depositNote, 500);
    const method = asText(req.body?.method, 20);
    const depositedFrom = asText(req.body?.depositedFrom, 200);
    if (!Number.isFinite(amount) || amount < 1) return res.status(400).json({ message: 'Minimum deposit amount is $1' });
    if (amount > 10000000) return res.status(400).json({ message: 'Deposit amount is too large' });

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

    // Lock pending deposit (one database step, see utils/wallet.js)
    const afterRequest = await walletApply(seller._id, { pendingDeposit: Number(amount) });
    seller.wallet = seller.wallet || {};
    if (afterRequest) seller.wallet.pendingDeposit = afterRequest.wallet.pendingDeposit; // for the messages below; not saved

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

    // A store whose registration is not approved yet cannot withdraw
    if (seller.status === 'pending_approval' || seller.registrationRejectedAt) {
      return res.status(403).json({ message: 'Your store registration is not approved yet, so withdrawals are not available.' });
    }

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

    // Atomically lock and deduct balance only if balance is strictly >= amt
    const updatedSeller = await Seller.findOneAndUpdate(
      {
        _id: seller._id,
        'wallet.balance': { $gte: amt },
      },
      {
        $inc: {
          'wallet.balance': -amt,
          'wallet.pendingWithdrawal': amt,
        },
      },
      { new: true }
    );

    if (!updatedSeller) {
      return res.status(400).json({ message: 'Insufficient available wallet balance or transaction conflict. Please refresh.' });
    }

    let reqDoc;
    try {
      reqDoc = await Withdrawal.create({
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
    } catch (createErr) {
      // Rollback atomic deduction if doc creation fails
      await Seller.findByIdAndUpdate(seller._id, {
        $inc: { 'wallet.balance': amt, 'wallet.pendingWithdrawal': -amt },
      }).catch(() => {});
      throw createErr;
    }

    // Auto-send chat notification
    const chatMsgId = await sendWalletChatNotification(req.app, updatedSeller, reqDoc);
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
        balance: updatedSeller.wallet.balance,
        pendingWithdrawal: updatedSeller.wallet.pendingWithdrawal,
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
    // a decision interrupted by a server restart is completed before the list is shown
    await finishStuckWalletRequests();
    const { status, type, excludeTest, accountType } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (type && type !== 'all') filter.type = type;

    let requests = await Withdrawal.find(filter)
      .populate('seller', 'storeName ownerName email payoutDetails isTestAccount accountType isPreviousStoreSeller')
      .sort({ createdAt: -1 });

    // Exclude test/demo accounts and deleted/missing sellers when excludeTest=true or accountType=client
    if (excludeTest === 'true' || accountType === 'client') {
      requests = requests.filter((r) => {
        // Discard orphan records where seller was deleted
        if (!r.seller) return false;
        // Discard marked test accounts
        if (r.seller.isTestAccount || r.seller.accountType === 'test') return false;
        if (r.seller.isPreviousStoreSeller) return false;
        // Discard test or demo stores, owners, or emails
        const sName = (r.storeName || '').toLowerCase().trim();
        const oName = (r.seller.ownerName || '').toLowerCase().trim();
        const email = (r.seller.email || '').toLowerCase().trim();
        if (sName.includes('test') || sName.includes('demo')) return false;
        if (oName.includes('test') || oName.includes('demo')) return false;
        if (email.includes('test') || email.includes('demo')) return false;
        return true;
      });
    }

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
  // true once the wallet step is done: from then on the request is never handed back as "pending"
  let moneyMoved = false;
  try {
    const { status, approvedAmount, helpingAmount, binanceRate, inrAmount, usdtAmount } = req.body;
    const adminNote = asText(req.body?.adminNote, 1000);
    const transactionRef = asText(req.body?.transactionRef, 200);
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Use: approved or rejected' });
    }
    if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) return res.status(404).json({ message: 'Request not found' });

    // A request interrupted earlier (server stopped half-way) is completed first
    await finishStuckWalletRequests();

    // Atomically transition status from 'pending' to 'processing' to prevent race conditions & double-approvals
    const reqDoc = await Withdrawal.findOneAndUpdate(
      { _id: req.params.id, status: 'pending' },
      { $set: { status: 'processing', processingAt: new Date(), pendingDecision: null } },
      { new: true }
    ).populate('seller');

    if (!reqDoc) {
      return res.status(400).json({ message: 'Request is already processed or currently being processed by another action.' });
    }

    if (!reqDoc.seller) {
      await Withdrawal.updateOne({ _id: req.params.id, status: 'processing' }, { $set: { status: 'pending' } }).catch(() => {});
      return res.status(404).json({ message: 'Seller not found' });
    }
    let seller = await Seller.findById(reqDoc.seller._id || reqDoc.seller);
    if (!seller) {
      await Withdrawal.updateOne({ _id: req.params.id, status: 'processing' }, { $set: { status: 'pending' } }).catch(() => {});
      return res.status(404).json({ message: 'Seller not found' });
    }

    const sellerMaxLimit = seller.withdrawalLimit?.maxAmount !== undefined ? seller.withdrawalLimit.maxAmount : 500;

    // Determine final approved amount
    let finalAmount = reqDoc.amount;
    if (approvedAmount !== undefined && approvedAmount !== null && approvedAmount !== '') {
      const parsed = Number(approvedAmount);
      if (!isNaN(parsed) && parsed >= 0) {
        finalAmount = parsed;
      }
    }

    // Determine admin helping amount (for deposits)
    if (helpingAmount !== undefined && helpingAmount !== null && helpingAmount !== '') {
      const parsedHelping = Number(helpingAmount);
      if (!isNaN(parsedHelping) && parsedHelping >= 0) {
        reqDoc.helpingAmount = parsedHelping;
      }
    }

    // Determine Binance rate & USDT conversion (for withdrawals & deposits)
    if (status === 'approved') {
      if (binanceRate !== undefined && binanceRate !== null && binanceRate !== '') {
        const parsedBRate = Number(binanceRate);
        if (!isNaN(parsedBRate) && parsedBRate > 0) {
          reqDoc.binanceRate = parsedBRate;
        }
      }
      if (inrAmount !== undefined && inrAmount !== null && inrAmount !== '') {
        const parsedInr = Number(inrAmount);
        if (!isNaN(parsedInr) && parsedInr >= 0) {
          reqDoc.inrAmount = parsedInr;
        }
      }
      if (usdtAmount !== undefined && usdtAmount !== null && usdtAmount !== '') {
        const parsedUsdt = Number(usdtAmount);
        if (!isNaN(parsedUsdt) && parsedUsdt >= 0) {
          reqDoc.usdtAmount = parsedUsdt;
        }
      } else if (reqDoc.binanceRate > 0 && reqDoc.inrAmount > 0) {
        reqDoc.usdtAmount = Number((reqDoc.inrAmount / reqDoc.binanceRate).toFixed(2));
      }
    }

    // Validation: Admin cannot approve more than requested or seller's tier limit
    if (status === 'approved') {
      if (reqDoc.type === 'withdrawal') {
        // The request is locked as 'processing' above, so release it back to 'pending' before refusing,
        // otherwise it would stay stuck and could never be approved or rejected again.
        if (finalAmount > reqDoc.amount) {
          await Withdrawal.updateOne({ _id: req.params.id, status: 'processing' }, { $set: { status: 'pending' } }).catch(() => {});
          return res.status(400).json({ message: `Approved amount ($${finalAmount}) cannot exceed requested withdrawal amount ($${reqDoc.amount})` });
        }
        if (finalAmount > sellerMaxLimit) {
          await Withdrawal.updateOne({ _id: req.params.id, status: 'processing' }, { $set: { status: 'pending' } }).catch(() => {});
          return res.status(400).json({ message: `Approved amount ($${finalAmount}) cannot exceed seller's single withdrawal limit ($${sellerMaxLimit})` });
        }
      }
    }

    const balanceBefore = seller.wallet?.balance || 0;

    // 1. Write the decision on the request, so that it is finished exactly like this even if the
    //    server stops before the last step.
    const decision = {
      status,
      finalAmount,
      helpingAmount: reqDoc.helpingAmount || 0,
      binanceRate: reqDoc.binanceRate || 0,
      inrAmount: reqDoc.inrAmount || 0,
      usdtAmount: reqDoc.usdtAmount || 0,
      adminNote,
      transactionRef,
      by: req.admin.name || 'Admin',
      byId: req.admin.id ? String(req.admin.id) : '',
      at: new Date().toISOString(),
    };
    await Withdrawal.updateOne({ _id: reqDoc._id, status: 'processing' }, { $set: { pendingDecision: decision } });

    // 2. The wallet, in one database step named after this request (it can never be applied twice)
    const moved = await applyDecisionToWallet(reqDoc, decision);
    if (!moved) {
      await Withdrawal.updateOne({ _id: reqDoc._id, status: 'processing' }, { $set: { status: 'pending', pendingDecision: null } }).catch(() => {});
      return res.status(404).json({ message: 'Seller not found' });
    }
    moneyMoved = true;

    // 3. The request itself
    reqDoc.set(requestFieldsFor(decision, moved.wallet.balance));
    await reqDoc.save();

    // The wallet as it is now, for the messages below (a plain copy: nothing here is saved again)
    const limitNow = await Seller.findById(seller._id).select('withdrawalLimit').lean();
    seller = { _id: seller._id, storeName: seller.storeName, wallet: moved.wallet, withdrawalLimit: limitNow?.withdrawalLimit || {} };

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
      // a rejected WITHDRAWAL returns the money to the balance; a rejected DEPOSIT never added any
      notifyBody =
        reqDoc.type === 'deposit'
          ? `Your deposit request was rejected. Nothing was added to your wallet. ${adminNote || ''}`
          : `Your withdrawal request was rejected. The full amount is back in your balance. ${adminNote || ''}`;
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
      const sellerDoc = reqDoc.toObject ? reqDoc.toObject() : { ...reqDoc };
      delete sellerDoc.helpingAmount;
      delete sellerDoc.binanceRate;
      delete sellerDoc.inrAmount;
      delete sellerDoc.usdtAmount;
      io.to(`seller:${seller._id}`).emit('withdrawal:update', sellerDoc);
      io.to('admins').emit('withdrawal:update', reqDoc);
    }

    audit(req, 'update', 'wallet_request', reqDoc._id, `${reqDoc.type} ${status} for ${reqDoc.storeName} — $${finalAmount}`);
    {
      const isDep = reqDoc.type === 'deposit';
      const bits = [];
      if (status === 'approved') {
        if (finalAmount !== reqDoc.amount) bits.push(`asked $${reqDoc.amount}`);
        if (isDep && reqDoc.helpingAmount > 0) bits.push(`helping $${reqDoc.helpingAmount}`);
        bits.push(reqDoc.usdtAmount > 0 ? `real USDT ₮${reqDoc.usdtAmount}` : 'no USDT entered');
        if (reqDoc.inrAmount > 0) bits.push(`INR ₹${reqDoc.inrAmount}`);
        if (reqDoc.transactionRef) bits.push(`ref ${reqDoc.transactionRef}`);
      }
      await finLog(req, {
        action: `wallet.${isDep ? 'deposit' : 'withdrawal'}_${status}`,
        summary: `${status === 'approved' ? 'Approved' : 'Rejected'} a seller ${isDep ? 'deposit' : 'withdrawal'} of $${status === 'approved' ? finalAmount : reqDoc.amount} for ${reqDoc.storeName}${bits.length ? ` (${bits.join(', ')})` : ''}`,
        entity: 'wallet_request',
        entityId: reqDoc._id,
        sellerId: seller._id,
        storeName: reqDoc.storeName,
        before: { status: 'pending', requested: reqDoc.amount, walletBalance: balanceBefore },
        after: {
          status,
          approved: reqDoc.approvedAmount,
          helping: reqDoc.helpingAmount || 0,
          usdt: reqDoc.usdtAmount || 0,
          inr: reqDoc.inrAmount || 0,
          rate: reqDoc.binanceRate || 0,
          ref: reqDoc.transactionRef || reqDoc.depositRef || '',
          note: reqDoc.adminNote || '',
          walletBalance: seller.wallet.balance || 0,
        },
      });
    }
    res.json({ message: `Request ${status} successfully`, request: reqDoc, wallet: seller.wallet });
  } catch (err) {
    // If an error occurred while status was locked in 'processing', safely restore to 'pending'.
    // Not when the wallet step is already done: then the request keeps its recorded decision and
    // is completed the same way on the next sweep (see utils/walletRequests.js).
    if (!moneyMoved) {
      await Withdrawal.updateOne({ _id: req.params.id, status: 'processing' }, { $set: { status: 'pending', pendingDecision: null } }).catch(() => {});
    } else {
      finishStuckWalletRequests({ force: true }).catch(() => {});
    }
    if (res.headersSent) return;
    res.status(500).json({ message: moneyMoved ? 'The decision was saved and the wallet was updated, but a follow-up step failed. Refresh the list.' : err.message });
  }
});

// PATCH & PUT /api/sellers/withdrawals/:id/split-helping — Admin splits/edits helping amount on any deposit transaction
const handleSplitHelping = async (req, res) => {
  try {
    const { helpingAmount, adminNote, binanceRate, inrAmount, usdtAmount } = req.body;
    const reqDoc = await Withdrawal.findById(req.params.id).populate('seller');
    if (!reqDoc) return res.status(404).json({ message: 'Deposit transaction not found' });
    if (reqDoc.type !== 'deposit') {
      return res.status(400).json({ message: 'Helping amount can only be split on deposit transactions' });
    }

    const parsedHelping = Number(helpingAmount !== undefined && helpingAmount !== null && helpingAmount !== '' ? helpingAmount : 0);
    if (isNaN(parsedHelping) || parsedHelping < 0) {
      return res.status(400).json({ message: 'Invalid helping amount. Must be 0 or greater.' });
    }

    const gross = reqDoc.approvedAmount !== null && reqDoc.approvedAmount !== undefined ? reqDoc.approvedAmount : reqDoc.amount;
    if (parsedHelping > gross) {
      return res.status(400).json({ message: `Helping amount ($${parsedHelping}) cannot exceed total gross deposit ($${gross}).` });
    }

    const oldHelping = reqDoc.helpingAmount || 0;
    const oldMoney = { usdt: reqDoc.usdtAmount || 0, inr: reqDoc.inrAmount || 0, rate: reqDoc.binanceRate || 0 };

    // What the amounts would become (same rules as before), worked out without touching the record yet
    let nextRate = oldMoney.rate;
    let nextInr = oldMoney.inr;
    let nextUsdt = oldMoney.usdt;
    if (binanceRate !== undefined && binanceRate !== null && binanceRate !== '') {
      const parsedBRate = Number(binanceRate);
      if (!isNaN(parsedBRate) && parsedBRate > 0) nextRate = parsedBRate;
    }
    if (inrAmount !== undefined && inrAmount !== null && inrAmount !== '') {
      const parsedInr = Number(inrAmount);
      if (!isNaN(parsedInr) && parsedInr >= 0) nextInr = parsedInr;
    }
    if (usdtAmount !== undefined && usdtAmount !== null && usdtAmount !== '') {
      const parsedUsdt = Number(usdtAmount);
      if (!isNaN(parsedUsdt) && parsedUsdt >= 0) nextUsdt = parsedUsdt;
    } else if (nextRate > 0 && nextInr > 0) {
      nextUsdt = Number((nextInr / nextRate).toFixed(2));
    }

    // A deposit that is already counted in the finance ledger: its real USDT / INR cannot be
    // rewritten by one person. The change is sent to the other partner; everything else is saved.
    const moneyChanged = Math.abs(nextUsdt - oldMoney.usdt) > 0.005 || Math.abs(nextInr - oldMoney.inr) > 0.005;
    const counted = isLedgerCounted(reqDoc);
    let approvalNote = '';
    if (counted && moneyChanged) {
      if (!(nextUsdt > 0)) {
        return res.status(400).json({
          message: 'This deposit is counted in the finance ledger. To take its USDT out, use “No real money” on the team portal Finance screen (the other partner approves it).',
        });
      }
      const asked = await requestApproval(req, {
        action: 'edit_usdt',
        targetId: reqDoc._id,
        summary: `Change the real amount of a deposit (${reqDoc.storeName}): USDT ₮${oldMoney.usdt} → ₮${nextUsdt}${Math.abs(nextInr - oldMoney.inr) > 0.005 ? `, INR ₹${oldMoney.inr} → ₹${nextInr}` : ''}`,
        details: [`Deposit — ${reqDoc.storeName} • store wallet $${gross}${parsedHelping > 0 ? ` • helping $${parsedHelping}` : ''}`],
        payload: { id: String(reqDoc._id), kind: 'deposit', usdtAmount: nextUsdt, inrAmount: nextInr },
        sellerId: reqDoc.seller?._id || reqDoc.seller,
        storeName: reqDoc.storeName,
      });
      approvalNote = asked.message;
    } else if (!counted) {
      reqDoc.binanceRate = nextRate;
      reqDoc.inrAmount = nextInr;
      reqDoc.usdtAmount = nextUsdt;
    }
    // counted and unchanged: the stored amounts stay exactly as they are

    reqDoc.helpingAmount = parsedHelping;
    if (adminNote !== undefined) reqDoc.adminNote = adminNote;

    await reqDoc.save();

    // Adjust seller.wallet.totalHelpingAmount if seller exists (one database step)
    if (reqDoc.seller && parsedHelping !== oldHelping) {
      await walletApply(reqDoc.seller._id || reqDoc.seller, { totalHelpingAmount: parsedHelping - oldHelping });
    }

    const netDeposit = Math.max(0, gross - parsedHelping);

    // Broadcast socket event to all admins
    const io = req.app.get('io');
    if (io) {
      io.to('admins').emit('withdrawal:update', reqDoc);
      io.to('admins').emit('wallet:update', { transactionId: reqDoc._id });
    }

    audit(req, 'update', 'deposit_split', reqDoc._id, `Split deposit for ${reqDoc.storeName}: Gross $${gross}, Helping $${parsedHelping}, Real Deposit $${netDeposit}`);
    await finLog(req, {
      action: 'wallet.deposit_edited',
      summary: `Edited a deposit of ${reqDoc.storeName}: helping $${oldHelping} → $${parsedHelping}, real USDT ₮${oldMoney.usdt} → ₮${reqDoc.usdtAmount || 0}${approvalNote ? ` (USDT change to ₮${nextUsdt} waits for approval)` : ''}`,
      entity: 'wallet_request',
      entityId: reqDoc._id,
      sellerId: reqDoc.seller?._id || reqDoc.seller,
      storeName: reqDoc.storeName,
      before: { helping: oldHelping, usdt: oldMoney.usdt, inr: oldMoney.inr, rate: oldMoney.rate },
      after: { helping: parsedHelping, usdt: reqDoc.usdtAmount || 0, inr: reqDoc.inrAmount || 0, rate: reqDoc.binanceRate || 0, walletAmount: gross, note: reqDoc.adminNote || '' },
    });

    res.json({
      message: approvalNote
        ? `Helping amount saved. The USDT / INR change was not applied yet. ${approvalNote}`
        : `Deposit split updated successfully! Real deposit: $${netDeposit.toLocaleString('en-US')}, Helping amount: $${parsedHelping.toLocaleString('en-US')}`,
      pendingApproval: Boolean(approvalNote),
      request: reqDoc,
      transaction: reqDoc,
      split: {
        grossAmount: gross,
        helpingAmount: parsedHelping,
        netSellerDeposit: netDeposit,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

router.patch('/withdrawals/:id/split-helping', authAdmin('finance'), handleSplitHelping);
router.put('/withdrawals/:id/split-helping', authAdmin('finance'), handleSplitHelping);

// POST /api/sellers/:id/wallet/adjust — Super Admin directly adds or deducts funds from seller wallet anytime
router.post('/:id/wallet/adjust', authAdmin('finance'), async (req, res) => {
  try {
    const { type, amount, reason, reference, helpingAmount, binanceRate, inrAmount, usdtAmount } = req.body; // type: 'credit' | 'debit'
    const amt = Number(amount);

    if (!amt || amt <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than 0' });
    }
    if (!['credit', 'debit'].includes(type)) {
      return res.status(400).json({ message: 'Type must be either credit or debit' });
    }

    if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) return res.status(404).json({ message: 'Seller not found' });
    let seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    // A store whose registration is not approved (still waiting, or rejected) gets no wallet money
    // (A debit stays allowed so money added by mistake can still be taken back.)
    if (type === 'credit' && (seller.status === 'pending_approval' || seller.registrationRejectedAt)) {
      return res.status(400).json({
        message: `${seller.storeName || 'This store'} is not a registered seller yet (registration ${seller.registrationRejectedAt ? 'rejected' : 'waiting for approval'}). Approve the registration first; funds cannot be added to its wallet.`,
      });
    }

    seller.wallet = seller.wallet || {};
    const balanceBeforeAdjust = seller.wallet.balance || 0;

    let parsedHelping = 0;
    if (type === 'credit' && helpingAmount !== undefined && helpingAmount !== null && helpingAmount !== '') {
      const numHelping = Number(helpingAmount);
      if (!isNaN(numHelping) && numHelping >= 0) {
        parsedHelping = numHelping;
      }
    }

    let parsedBRate = 0;
    if (binanceRate !== undefined && binanceRate !== null && binanceRate !== '') {
      const numBRate = Number(binanceRate);
      if (!isNaN(numBRate) && numBRate > 0) {
        parsedBRate = numBRate;
      }
    }

    let parsedInr = 0;
    if (inrAmount !== undefined && inrAmount !== null && inrAmount !== '') {
      const numInr = Number(inrAmount);
      if (!isNaN(numInr) && numInr >= 0) {
        parsedInr = numInr;
      }
    }

    let parsedUsdt = 0;
    if (usdtAmount !== undefined && usdtAmount !== null && usdtAmount !== '') {
      const numUsdt = Number(usdtAmount);
      if (!isNaN(numUsdt) && numUsdt >= 0) {
        parsedUsdt = numUsdt;
      }
    } else if (parsedBRate > 0 && parsedInr > 0) {
      parsedUsdt = Number((parsedInr / parsedBRate).toFixed(2));
    }

    // One database step (see utils/wallet.js): nothing else happening to this wallet at the same
    // moment can be overwritten, and a debit only goes through while the balance covers it.
    let moved;
    if (type === 'credit') {
      moved = await walletApply(seller._id, { balance: amt, totalDeposited: amt, ...(parsedHelping > 0 ? { totalHelpingAmount: parsedHelping } : {}) });
    } else {
      moved = await walletApply(seller._id, { balance: -amt, totalWithdrawn: amt }, { requireBalance: amt });
      if (!moved) {
        const now = await walletNow(seller._id);
        return res.status(400).json({ message: `Insufficient balance to debit. Available: $${now?.wallet?.balance || 0}` });
      }
    }
    if (!moved) return res.status(404).json({ message: 'Seller not found' });
    // a plain copy for the messages below (nothing here is saved again)
    seller = { _id: seller._id, storeName: seller.storeName, ownerName: seller.ownerName, email: seller.email, wallet: moved.wallet };

    // Create a transaction / withdrawal history entry
    const rec = await Withdrawal.create({
      type: type === 'credit' ? 'deposit' : 'withdrawal',
      seller: seller._id,
      storeName: seller.storeName,
      amount: amt,
      approvedAmount: amt,
      helpingAmount: (type === 'credit' && parsedHelping > 0) ? parsedHelping : 0,
      binanceRate: parsedBRate,
      inrAmount: parsedInr,
      usdtAmount: parsedUsdt,
      balanceAfter: seller.wallet.balance,
      isManualAdjustment: true,
      status: 'approved',
      adminNote: reason || (type === 'credit' ? 'Admin Direct Manual Credit' : 'Admin Direct Manual Debit'),
      transactionRef: reference || '',
      processedAt: new Date(),
      processedBy: req.admin.name || 'Super Admin',
      processedById: req.admin.id ? String(req.admin.id) : '',
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
    {
      const bits = [];
      if (type === 'credit' && parsedHelping > 0) bits.push(`helping $${parsedHelping}`);
      bits.push(parsedUsdt > 0 ? `real USDT ₮${parsedUsdt}` : 'no USDT entered');
      if (parsedInr > 0) bits.push(`INR ₹${parsedInr}`);
      if (reference) bits.push(`ref ${reference}`);
      if (reason) bits.push(`reason: ${reason}`);
      await finLog(req, {
        action: type === 'credit' ? 'wallet.direct_credit' : 'wallet.direct_debit',
        summary: `Direct ${type === 'credit' ? 'add funds' : 'debit'} of $${amt} ${type === 'credit' ? 'to' : 'from'} the store wallet of ${seller.storeName} (${bits.join(', ')})`,
        entity: 'wallet_request',
        entityId: rec._id,
        sellerId: seller._id,
        storeName: seller.storeName,
        before: { walletBalance: balanceBeforeAdjust },
        after: {
          type,
          amount: amt,
          helping: type === 'credit' ? parsedHelping : 0,
          usdt: parsedUsdt,
          inr: parsedInr,
          rate: parsedBRate,
          ref: reference || '',
          reason: reason || '',
          walletBalance: seller.wallet.balance || 0,
        },
      });
    }

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

    // Deduct Upgrade Fee from Seller Wallet (if fee > 0), in one database step (utils/wallet.js)
    let balanceAfterFee = seller.wallet?.balance || 0;
    if (feeToCharge > 0) {
      const charged = await walletApply(seller._id, { balance: -feeToCharge });
      if (charged) balanceAfterFee = charged.wallet.balance || 0;

      // Record in ledger as an adjustment
      await Withdrawal.create({
        type: 'adjustment',
        seller: seller._id,
        storeName: seller.storeName,
        amount: -feeToCharge,
        balanceAfter: balanceAfterFee,
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
    await seller.save(); // only the limit settings; the wallet was changed above and is not rewritten

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
          `New Available Balance: $${Number(balanceAfterFee || 0).toLocaleString('en-US')}\n` +
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
router.post('/:id/withdrawal-limit', authAdmin('finance'), async (req, res) => {
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
      // only this seller and the admins are told (it used to go to every connected visitor)
      io.to(`seller:${seller._id}`).emit('limit:update', { sellerId: seller._id, withdrawalLimit: seller.withdrawalLimit });
      io.to('admins').emit('seller:limit_update', { sellerId: seller._id, withdrawalLimit: seller.withdrawalLimit });
      io.to('admins').emit('wallet:update', { sellerId: seller._id, withdrawalLimit: seller.withdrawalLimit });
      io.to('admins').emit('limit:update', { sellerId: seller._id, withdrawalLimit: seller.withdrawalLimit });
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
