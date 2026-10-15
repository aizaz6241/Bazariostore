import mongoose from 'mongoose';
import express from 'express';
import Seller from '../../models/Seller.js';
import { Conversation, Message } from '../../models/Chat.js';
import { authSeller, authAdmin } from '../../middleware/auth.js';
import { notify } from '../../utils/notify.js';
import { sendPush } from '../../utils/push.js';
import { audit } from '../../utils/audit.js';
import { finLog } from '../../utils/financeLog.js';
import { adminRoom } from '../../utils/permissions.js';
import { announceToAdmins } from '../../utils/realtime.js';
import { asText } from '../../middleware/sanitize.js';
import { TIERS, DIAMOND_UPGRADE_FEE_USD, isDiamond, tierInfo } from '../../utils/sellerTier.js';

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
    conv.lastMessage = '💎 Diamond upgrade request';
    conv.lastSender = 'seller';
    conv.lastAt = new Date();
    conv.unreadForAdmin = (conv.unreadForAdmin || 0) + 1;
    conv.status = 'open';
    await conv.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`seller:${seller._id}`).emit('message:new', msg);
      io.to(adminRoom('chat')).emit('message:new', msg);
      io.to(adminRoom('chat')).emit('chat:notification', { conversationId: conv._id, storeName: seller.storeName, text: conv.lastMessage });
    }
    sendPush({
      to: 'admin',
      title: `💎 ${seller.storeName} wants Diamond`,
      body: `Diamond upgrade request (one-time fee ${usd(DIAMOND_UPGRADE_FEE_USD)}). Reply in chat.`,
      url: `/admin/chat?c=${conv._id}`,
      tag: `chat-${conv._id}`,
    });
    notify(req.app, {
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

// POST /api/sellers/:id/tier  { tier: 'diamond', note } | { action: 'clear-request' }
router.post('/:id/tier', authAdmin('sellers'), announceToAdmins('sellers', 'sellers:changed'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return next();
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });
    const by = req.admin?.name || req.admin?.email || 'Admin';
    const io = req.app.get('io');

    if (req.body?.action === 'clear-request') {
      seller.tierRequest = { status: 'none', requestedAt: null };
      await seller.save();
      audit(req, 'update', 'seller', seller._id, `Cleared the Diamond upgrade request of ${seller.storeName}`);
      const safe = lightSeller(seller);
      io?.to(adminRoom('sellers')).emit('seller:status_update', { seller: safe });
      io?.to(`seller:${seller._id}`).emit('seller:status_update', { seller: safe });
      return res.json({ ok: true, message: `Diamond request of "${seller.storeName}" cleared.`, seller: safe });
    }

    // Only Basic → Diamond for now (going back to Basic is decided later)
    if (req.body?.tier !== 'diamond') return res.status(400).json({ message: 'Only an upgrade to Diamond is possible right now.' });
    if (isDiamond(seller)) return res.status(400).json({ message: `"${seller.storeName}" is already Diamond.` });
    if (seller.status === 'pending_approval') return res.status(400).json({ message: 'Approve the store registration first.' });

    const note = asText(req.body?.note, 300).trim();
    const now = new Date();
    seller.tierHistory = seller.tierHistory || [];
    seller.tierHistory.push({ from: seller.tier || 'basic', to: 'diamond', at: now, by, note });
    seller.tier = 'diamond';
    seller.tierSince = now;
    seller.tierRequest = { status: 'none', requestedAt: null };
    await seller.save();

    audit(req, 'update', 'seller', seller._id, `Upgraded ${seller.storeName} to 💎 Diamond${note ? ` — ${note}` : ''}`);
    await finLog(req, {
      action: 'seller.tier_set',
      summary: `Upgraded seller “${seller.storeName}” from Basic to 💎 Diamond (35% profit on new orders, 72h to confirm)${note ? ` — ${note}` : ''}`,
      entity: 'seller',
      entityId: seller._id,
      sellerId: seller._id,
      storeName: seller.storeName,
      before: { tier: 'basic' },
      after: { tier: 'diamond', tierSince: now },
    });

    const d = TIERS.diamond;
    try {
      const conv = await supportConversation(seller);
      const text =
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `💎 WELCOME TO DIAMOND!\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Your store "${seller.storeName}" has been upgraded to 💎 Diamond.\n\n` +
        `Your Diamond benefits (from now on):\n` +
        `• ${d.profitRate}% profit on every new order (instead of 20%)\n` +
        `• ${d.confirmHours} hours (3 days) to confirm & process orders (instead of 48 hours)\n` +
        `• Remove products from My Store anytime\n` +
        `• Fast delivery: ${d.deliveryDays} days\n\n` +
        `Thank you for growing with Bazario!\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━`;
      const msg = await Message.create({ conversation: conv._id, seller: seller._id, sender: 'admin', senderName: by, text });
      conv.lastMessage = '💎 Your store is now Diamond!';
      conv.lastSender = 'admin';
      conv.lastAt = new Date();
      conv.unreadForSeller = (conv.unreadForSeller || 0) + 1;
      await conv.save();
      io?.to(`seller:${seller._id}`).emit('message:new', msg);
      io?.to(adminRoom('chat')).emit('message:new', msg);
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

    const safe = lightSeller(seller);
    io?.to(adminRoom('sellers')).emit('seller:status_update', { seller: safe });
    io?.to(`seller:${seller._id}`).emit('seller:status_update', { seller: safe });

    res.json({ ok: true, message: `"${seller.storeName}" is now 💎 Diamond.`, seller: safe });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
