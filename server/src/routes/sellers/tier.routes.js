import mongoose from 'mongoose';
import express from 'express';
import Seller from '../../models/Seller.js';
import { Conversation, Message } from '../../models/Chat.js';
import { authSeller, authAdmin } from '../../middleware/auth.js';
import { notify } from '../../utils/notify.js';
import { sendPush } from '../../utils/push.js';
import { audit } from '../../utils/audit.js';
import { requestApproval } from '../../utils/financeLog.js';
import { adminRoom } from '../../utils/permissions.js';
import { announceToAdmins } from '../../utils/realtime.js';
import { asText } from '../../middleware/sanitize.js';
import { TIERS, DIAMOND_UPGRADE_FEE_USD, isDiamond, tierInfo } from '../../utils/sellerTier.js';
import { sellerSafeMessage } from '../../utils/sellerChatPrivacy.js';
import { pageAction, markShortcutDone } from '../../utils/chatShortcuts.js';

/**
 * Seller account tiers — Basic / 💎 Diamond (rules in utils/sellerTier.js).
 *
 *   GET  /api/sellers/tier                  seller: own plan, benefits, request status
 *   POST /api/sellers/tier/request-upgrade  seller: asks for Diamond; the request arrives in the
 *                                           admins' support chat as a message from the seller
 *   POST /api/sellers/:id/tier              admin: upgrades the store to Diamond once the one-time
 *                                           fee is paid, or clears a request (action: 'clear-request')
 */
const router = express.Router();

const usd = (n) => `$${Number(n).toLocaleString('en-US')}`;

/** The seller's support chat (the one the admins' Chat page shows), created if missing. */
async function supportConversation(seller) {
  let conv = await Conversation.findOne({ seller: seller._id, type: { $ne: 'internal' } }).sort({ lastAt: -1 });
  if (!conv) {
    conv = await Conversation.findOneAndUpdate(
      { seller: seller._id, type: 'seller' },
      {
        $setOnInsert: {
          type: 'seller',
          seller: seller._id,
          storeName: seller.storeName,
          sellerName: seller.ownerName,
          sellerEmail: seller.email,
          sellerPhone: seller.phone || '',
          subject: 'General Seller Support & Operations',
        },
      },
      { upsert: true, new: true }
    );
  }
  return conv;
}

const lightSeller = (doc) => {
  const o = doc && typeof doc.toObject === 'function' ? doc.toObject() : { ...(doc || {}) };
  delete o.passwordHash;
  delete o.kycDocuments;
  return o;
};

// GET /api/sellers/tier
router.get('/tier', authSeller, async (req, res) => {
  try {
    const seller = await Seller.findById(req.seller.id).select('tier tierSince tierRequest').lean();
    if (!seller) return res.status(404).json({ message: 'Seller not found' });
    res.json(tierInfo(seller));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/tier/request-upgrade
router.post('/tier/request-upgrade', authSeller, announceToAdmins('sellers', 'sellers:changed', (req) => ({ sellerId: String(req.seller?.id || '') })), async (req, res) => {
  try {
    const seller = await Seller.findById(req.seller.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });
    if (isDiamond(seller)) return res.status(400).json({ message: 'Your store is already 💎 Diamond.' });
    if (seller.status === 'pending_approval') {
      return res.status(400).json({ message: 'Your store registration is still under review. You can request Diamond once it is approved.' });
    }

    // the upgrade is already being approved (fee received, admin asked for approval): a new
    // request must not reset it back to 'pending'
    if (seller.tierRequest?.status === 'awaiting_approval') {
      return res.json({ ok: true, already: true, message: 'Your Diamond upgrade is being approved now. Your store will switch to Diamond shortly.', tier: tierInfo(seller) });
    }

    // one request a day: a second click only repeats the answer (no flood of chat messages)
    const last = seller.tierRequest?.requestedAt ? new Date(seller.tierRequest.requestedAt).getTime() : 0;
    if (seller.tierRequest?.status === 'pending' && Date.now() - last < 24 * 3600000) {
      return res.json({ ok: true, already: true, message: 'Your Diamond upgrade request is already with our support team. They will contact you in chat.', tier: tierInfo(seller) });
    }

    const note = asText(req.body?.note, 500).trim();
    seller.tierRequest = { status: 'pending', requestedAt: new Date() };
    await seller.save();

    const conv = await supportConversation(seller);
    const text =
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💎 DIAMOND UPGRADE REQUEST\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Store: ${seller.storeName}\n` +
      `Owner: ${seller.ownerName}\n` +
      `Current plan: Basic\n` +
      `Requested plan: 💎 Diamond (one-time fee ${usd(DIAMOND_UPGRADE_FEE_USD)})\n\n` +
      `I would like to upgrade my store to Diamond. Please guide me on paying the one-time upgrade fee.` +
      (note ? `\n\nMy note: ${note}` : '') +
      `\n━━━━━━━━━━━━━━━━━━━━━━━━━`;

    const msg = await Message.create({
      conversation: conv._id,
      seller: seller._id,
      sender: 'seller',
      senderName: seller.storeName || seller.ownerName,
      text,
    });
    markShortcutDone(seller._id, { key: 'diamond' }, 'Diamond upgrade requested');
    conv.lastMessage = '💎 Diamond upgrade request';
    conv.lastSender = 'seller';
    conv.lastAt = new Date();
    conv.unreadForAdmin = (conv.unreadForAdmin || 0) + 1;
    conv.status = 'open';
    await conv.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`seller:${seller._id}`).emit('message:new', sellerSafeMessage(msg));
      io.to(adminRoom('chat')).emit('message:new', msg);
      io.to(adminRoom('chat')).emit('chat:notification', { conversationId: conv._id, storeName: seller.storeName, text: conv.lastMessage });
    }
    sendPush({
      to: 'admin',
      title: `💎 ${seller.storeName} wants Diamond`,
      body: `Diamond upgrade request (one-time fee ${usd(DIAMOND_UPGRADE_FEE_USD)}). Reply in chat.`,
      url: `/admin/chat?c=${conv._id}`,
      tag: `chat-${conv._id}`,
      skipActiveAdmins: true,
    });
    notify(req.app, {
      push: false, // pushed just above
      type: 'chat',
      title: `💎 Diamond request: ${seller.storeName}`,
      body: `${seller.storeName} asked to upgrade to Diamond (${usd(DIAMOND_UPGRADE_FEE_USD)} one-time).`,
      link: '/admin/chat',
    });

    res.json({
      ok: true,
      message: 'Request sent! Our support team will contact you in chat with the payment details for the one-time Diamond fee.',
      tier: tierInfo(seller),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/:id/tier
//   { tier: 'diamond', usdtAmount, inrAmount, helpingAmount, pkrRate, note }
//       client store → a request for the other partner (team portal → Finance). When approved, the
//       fee is recorded as a deposit that is divided like any other deposit (it never goes into the
//       store wallet) and the store becomes Diamond — for life.
//       test store   → upgraded at once (test accounts are outside the finance count)
//   { action: 'clear-request' }  the store stays Basic, the seller's request is closed
router.post('/:id/tier', authAdmin('sellers'), announceToAdmins('sellers', 'sellers:changed'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return next();
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });
    const by = req.admin?.name || req.admin?.email || 'Admin';
    const io = req.app.get('io');
    const pushOut = () => {
      const safe = lightSeller(seller);
      io?.to(adminRoom('sellers')).emit('seller:status_update', { seller: safe });
      io?.to(`seller:${seller._id}`).emit('seller:status_update', { seller: safe });
      return safe;
    };

    if (req.body?.action === 'clear-request') {
      if (seller.tierRequest?.status === 'awaiting_approval') {
        return res.status(400).json({ message: 'The fee is waiting for the other partner’s approval. Cancel or reject it on the team portal (Finance) instead.' });
      }
      seller.tierRequest = { status: 'none', requestedAt: null };
      await seller.save();
      audit(req, 'update', 'seller', seller._id, `Cleared the Diamond upgrade request of ${seller.storeName}`);
      return res.json({ ok: true, message: `Diamond request of "${seller.storeName}" cleared.`, seller: pushOut() });
    }

    if (req.body?.tier !== 'diamond') return res.status(400).json({ message: 'Only an upgrade to Diamond is possible (Diamond is for life).' });
    if (isDiamond(seller)) return res.status(400).json({ message: `"${seller.storeName}" is already Diamond.` });
    if (seller.status === 'pending_approval' || seller.registrationRejectedAt) return res.status(400).json({ message: 'Approve the store registration first.' });

    const note = asText(req.body?.note, 300).trim();
    const isTest = seller.isTestAccount === true || seller.accountType === 'test';

    if (isTest) {
      await makeDiamond(req, seller, { by, note: note || 'Test account (no fee in finance)' });
      return res.json({ ok: true, message: `"${seller.storeName}" (test account) is now 💎 Diamond.`, seller: pushOut() });
    }

    // ── the fee: what really came in ──
    const numOf = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : NaN;
    };
    const fee = DIAMOND_UPGRADE_FEE_USD;
    const helping = req.body?.helpingAmount === '' || req.body?.helpingAmount === undefined ? 0 : numOf(req.body.helpingAmount);
    const usdt = req.body?.usdtAmount === '' || req.body?.usdtAmount === undefined ? 0 : numOf(req.body.usdtAmount);
    const inr = req.body?.inrAmount === '' || req.body?.inrAmount === undefined ? 0 : numOf(req.body.inrAmount);
    const pkrRate = req.body?.pkrRate === '' || req.body?.pkrRate === undefined ? 0 : numOf(req.body.pkrRate);
    if (![helping, usdt, inr, pkrRate].every((n) => Number.isFinite(n) && n >= 0)) return res.status(400).json({ message: 'Please enter valid numbers (0 or more).' });
    if (helping > fee) return res.status(400).json({ message: `The helping amount cannot be more than the fee ($${fee}).` });
    const realPart = Math.round((fee - helping) * 100) / 100;
    if (realPart > 0 && !(usdt > 0)) return res.status(400).json({ message: `$${realPart} of the fee is real money: enter the real USDT received on Binance (or the helping amount if the admins paid it).` });
    if (realPart > 0 && !(inr > 0)) return res.status(400).json({ message: 'Enter the INR the seller paid for the fee (it counts for rewards, like a deposit).' });
    if (realPart <= 0 && usdt > 0) return res.status(400).json({ message: 'The whole fee is helping amount, so no USDT can have come in. Lower the helping amount or set USDT to 0.' });

    // the fee is divided like a deposit, so the store needs an owner (and a 1:1 PKR member needs the day's rate)
    if (usdt > 0) {
      const db = mongoose.connection.db;
      const asg = await db.collection('portalsellerassignments').findOne({ sellerId: seller._id, status: 'active' });
      if (!asg) return res.status(400).json({ message: 'This store has no owner yet (member or partner). Assign it first so the fee can be divided.' });
      const owner = await db.collection('portalmembers').findOne({ _id: asg.memberId }, { projection: { name: 1, role: 1, commissionLabel: 1 } });
      const isPkr = owner && owner.role === 'member' && (owner.commissionLabel || 'pkr_1to1') !== 'inr_50';
      if (isPkr && !(pkrRate > 0)) return res.status(400).json({ message: `The owner (${owner.name}) is a 1:1 PKR member: enter today's PKR rate (PKR per 1 USDT).` });
    }

    const money2 = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
    const asked = await requestApproval(req, {
      action: 'diamond_upgrade',
      targetId: String(seller._id),
      summary: `Upgrade “${seller.storeName}” to 💎 Diamond — fee $${fee}: ${usdt > 0 ? `₮${money2(usdt)} real (₹${money2(inr)})` : 'no real money'}${helping > 0 ? `, $${money2(helping)} helping` : ''}`,
      details: [
        usdt > 0 ? 'The real USDT is divided like a normal deposit of this store (owner, referral, partners) and counts for rewards.' : 'No real money came in: nothing is divided.',
        'The fee is NOT added to the store wallet. The store becomes Diamond for life: 35% profit on new orders, 72h to confirm.',
        ...(note ? [`Note: ${note}`] : []),
      ],
      payload: {
        sellerId: String(seller._id),
        storeName: seller.storeName,
        fee,
        helpingAmount: helping,
        usdtAmount: usdt,
        inrAmount: inr,
        pkrRate,
        note,
        askedBy: by,
      },
      sellerId: seller._id,
      storeName: seller.storeName,
    });

    if (!asked.already) {
      seller.tierRequest = { status: 'awaiting_approval', requestedAt: seller.tierRequest?.requestedAt || new Date() };
      await seller.save();
      audit(req, 'update', 'seller', seller._id, `Asked to upgrade ${seller.storeName} to Diamond (fee $${fee}${usdt > 0 ? `, ₮${usdt}` : ''}${helping > 0 ? `, helping $${helping}` : ''})`);
    }
    return res.json({ ok: true, pendingApproval: true, message: asked.message, seller: pushOut() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** Make a store Diamond at once (only used for test accounts: no fee in finance). */
async function makeDiamond(req, seller, { by, note }) {
  const now = new Date();
  seller.tierHistory = seller.tierHistory || [];
  seller.tierHistory.push({ from: seller.tier || 'basic', to: 'diamond', at: now, by, note });
  seller.tier = 'diamond';
  seller.tierSince = now;
  seller.tierRequest = { status: 'none', requestedAt: null };
  await seller.save();
  audit(req, 'update', 'seller', seller._id, `Upgraded ${seller.storeName} to 💎 Diamond${note ? ` — ${note}` : ''}`);

  const d = TIERS.diamond;
  try {
    const conv = await supportConversation(seller);
    const msg = await Message.create({ conversation: conv._id, seller: seller._id, sender: 'admin', senderName: by, text: diamondWelcomeText(seller.storeName), action: pageAction('diamond', { label: '💎 See my Diamond plan' }) });
    conv.lastMessage = '💎 Your store is now Diamond!';
    conv.lastSender = 'admin';
    conv.lastAt = new Date();
    conv.unreadForSeller = (conv.unreadForSeller || 0) + 1;
    await conv.save();
    req.app.get('io')?.to(`seller:${seller._id}`).emit('message:new', sellerSafeMessage(msg));
  } catch (chatErr) {
    console.error('[tier] welcome message:', chatErr.message);
  }
  notify(req.app, {
    recipientType: 'seller',
    sellerId: String(seller._id),
    type: 'system',
    title: '💎 Your store is now Diamond!',
    body: `You now earn ${d.profitRate}% profit on new orders, have ${d.confirmHours} hours to confirm orders and can remove products from My Store.`,
    link: '/seller/diamond',
  });
}

/** The chat message a store gets when it becomes Diamond (the team portal sends the same text). */
export function diamondWelcomeText(storeName) {
  const d = TIERS.diamond;
  return (
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💎 WELCOME TO DIAMOND!\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Your store "${storeName}" has been upgraded to 💎 Diamond — for life.\n\n` +
    `Your Diamond benefits (from now on):\n` +
    `• ${d.profitRate}% profit on every new order (instead of 20%)\n` +
    `• ${d.confirmHours} hours (3 days) to confirm & process orders (instead of 48 hours)\n` +
    `• Remove products from My Store anytime\n` +
    `• Fast delivery: ${d.deliveryDays} days\n\n` +
    `Thank you for growing with Bazario!\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━`
  );
}

export default router;
