import { Router } from 'express';
import mongoose from 'mongoose';
import { Conversation, Message, ChatSettings, ChatQuickReply, ChatBroadcast, ADMIN_VISIBLE_CHAT } from '../models/Chat.js';
import Seller from '../models/Seller.js';
import Admin from '../models/Admin.js';
import { authAdmin, authSeller, authSellerOrAdmin } from '../middleware/auth.js';
import { notify } from '../utils/notify.js';
import { sendPush } from '../utils/push.js';
import { audit } from '../utils/audit.js';
import { deleteAttachmentFiles, attachmentLocation, isStoredUpload } from '../services/uploads.js';
import { asText } from '../middleware/sanitize.js';
import { limit } from '../utils/rateLimit.js';
import { adminRoom } from '../utils/permissions.js';
import { sellerSafeMessage, sellerSafeConversation } from '../utils/sellerChatPrivacy.js';
import { clearAdminTyping } from '../realtime/adminTyping.js';
import { SHORTCUT_PAGES, resolveShortcut, searchShortcutTargets, pageAction } from '../utils/chatShortcuts.js';
import { sellerFacts, fillPlaceholders, PLACEHOLDERS } from '../utils/chatPlaceholders.js';
import { chatNamesOf } from '../utils/sellerNameSync.js';
import { autoReplyConfig, autoReplyNow, autoReplyText, autoReplyFields, AUTO_REPLY_DEFAULTS } from '../utils/autoReply.js';
import Order from '../models/Order.js';
import Withdrawal from '../models/Withdrawal.js';

// A guest chat is opened with the random id the storefront keeps in the browser (36 characters).
// Knowing that id is what gives access to that one chat, so it must be real text of a sensible
// length. An object such as {"$ne": ""} sent in its place used to match OTHER people's chats.
const goodGuestId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(v);
const guestSendLimit = limit({ name: 'guest-chat-send', max: 40, windowMs: 60 * 1000, message: 'You are sending messages too fast. Please wait a moment.' });
const guestReadLimit = limit({ name: 'guest-chat-read', max: 240, windowMs: 60 * 1000 });

const router = Router();

// Helper: Auto-reply handler when admin away/auto-reply is enabled
export async function handleAutoReply(app, conv) {
  try {
    if (!conv) return;
    const settings = await ChatSettings.findOne().lean();
    if (!settings) return;

    // Off / On / Away, the night schedule and a holiday decide what (if anything) is sent now
    const cfg = autoReplyConfig(settings);
    const { state } = autoReplyNow(cfg);
    if (state === 'off') return;

    // Only when nobody from support is talking to this seller / guest: a real reply in the last
    // 30 minutes means support is here (the bot used to cut in every 3 minutes in a live chat).
    const QUIET_MS = 30 * 60 * 1000;
    const since = new Date(Date.now() - QUIET_MS);
    const humanReply = await Message.exists({
      conversation: conv._id,
      sender: { $in: ['admin', 'staff'] },
      isAutoReply: { $ne: true },
      createdAt: { $gt: since },
    });
    if (humanReply) return;

    // At most one auto-reply per 30 minutes, claimed in one database step: two messages sent a
    // moment apart both used to pass the check and got two auto-replies.
    const claimed = await Conversation.updateOne(
      { _id: conv._id, $or: [{ lastAutoReplyAt: null }, { lastAutoReplyAt: { $lt: since } }] },
      { $set: { lastAutoReplyAt: new Date() } }
    );
    if (!claimed.modifiedCount) return;

    // Fast, realistic response (400ms)
    setTimeout(async () => {
      try {
        const sId = conv.seller?._id ? conv.seller._id.toString() : (conv.seller ? conv.seller.toString() : null);
        const gId = conv.guestId || '';

        // stores and guests get their own message, with the owner's / guest's name in it
        let name = '';
        if (sId) {
          const sel = await Seller.findById(sId).select('ownerName storeName').lean().catch(() => null);
          name = sel?.ownerName || sel?.storeName || conv.sellerName || '';
        } else {
          // a guest who gave no name is saved as "Guest User": then no name is used
          name = /^guest( user)?$/i.test(String(conv.name || '').trim()) ? '' : conv.name || '';
        }
        const replyText = autoReplyText(cfg, state, sId ? 'seller' : 'guest', name);

        const replyMsg = new Message({
          conversation: conv._id,
          seller: sId,
          guestId: gId,
          sender: 'admin',
          senderName: '🤖 Bazario Support Assistant (Auto-Reply)',
          text: replyText,
          isAutoReply: true,
        });
        await replyMsg.save();

        // The inbox keeps showing what the seller / guest wrote (the preview used to become the
        // bot's text, hiding every question). Only their unread count goes up.
        await Conversation.updateOne(
          { _id: conv._id },
          { $inc: conv.type === 'seller' || sId ? { unreadForSeller: 1 } : { unreadForCustomer: 1 } }
        );

        const io = app.get('io');
        if (io) {
          if (sId) {
            io.to(`seller:${sId}`).emit('message:new', sellerSafeMessage(replyMsg));
          }
          if (gId) {
            io.to(`guest:${gId}`).emit('message:new', replyMsg);
            io.to(`customer:${gId}`).emit('message:new', replyMsg);
          }
          io.to(adminRoom('chat')).emit('message:new', replyMsg);
          io.to(adminRoom('chat')).emit('chat:notification', {
            conversationId: conv._id,
            storeName: conv.storeName || conv.name || 'Merchant/Guest',
            text: `🤖 Auto-Reply: ${replyText.slice(0, 50)}`,
          });
        }
      } catch (e) {
        console.error('Auto-reply inner send error:', e.message);
      }
    }, 400);
  } catch (err) {
    console.error('handleAutoReply error:', err.message);
  }
}

// Helper: Fetch messages with cursor-based pagination (latest-first query, returned chronologically)
export async function fetchConversationMessages(query, { limit = 100, before = null } = {}) {
  const filter = { ...query };
  if (filter.isDeleted === undefined) {
    filter.isDeleted = { $ne: true };
  }
  if (before) {
    const beforeDate = new Date(before);
    if (!isNaN(beforeDate.getTime())) {
      filter.createdAt = { $lt: beforeDate };
    }
  }

  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);

  // Sort descending to get the latest messages up to this point
  const docs = await Message.find(filter)
    .sort({ createdAt: -1 })
    .limit(parsedLimit + 1);

  const hasMore = docs.length > parsedLimit;
  const resultDocs = hasMore ? docs.slice(0, parsedLimit) : docs;

  // Return in chronological order (oldest -> newest)
  const messages = resultDocs.reverse();

  return { messages, hasMore };
}

// ----------------------------------------------------
// 1. SELLER SUPPORT CHAT ENDPOINTS
// ----------------------------------------------------

// GET /api/chat/seller/thread (Get or create conversation for current seller)
router.get('/seller/thread', authSeller, async (req, res) => {
  try {
    const sellerId = req.seller.id;
    const seller = await Seller.findById(sellerId);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    let conv = await Conversation.findOne({ seller: sellerId, type: { $ne: 'internal' } }).sort({ lastAt: -1 });
    if (!conv) {
      conv = new Conversation({
        type: 'seller',
        seller: seller._id,
        storeName: seller.storeName,
        sellerName: seller.ownerName,
        sellerEmail: seller.email,
        sellerPhone: seller.phone || '',
        subject: 'General Seller Support & Operations',
        status: 'open',
        lastMessage: 'Conversation started',
        lastAt: new Date(),
      });
      await conv.save();
    }

    // Sync any orphan messages
    await Message.updateMany(
      { seller: seller._id, conversation: { $ne: conv._id } },
      { $set: { conversation: conv._id } }
    );

    // Loading the thread does NOT mark anything as seen: the chat widget loads it in the background
    // on every page (closed), which used to give the admin a blue "seen" tick for pictures the seller
    // never looked at — and cleared the seller's unread badge. Seen is set only by /seller/read and
    // the 'seller:read' socket event, which the app sends while the chat is really open on screen.

    const { limit, before } = req.query;
    const { messages, hasMore } = await fetchConversationMessages(
      { $or: [{ conversation: conv._id }, { seller: seller._id }] },
      { limit, before }
    );

    // the store never sees which admin wrote (every team message shows as Bazario Support)
    res.json({ conversation: sellerSafeConversation(conv), messages: messages.map(sellerSafeMessage), hasMore });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/chat/seller/send (Seller sends message to admin)
// A seller writes at most 40 messages a minute (like guests): every message pushes a phone
// notification to every admin, so a flood (or a misused account) used to have no limit.
const sellerSendLimit = limit({
  name: 'seller-chat-send',
  max: 40,
  windowMs: 60 * 1000,
  key: (req) => String(req.seller?.id || req.seller?._id || ''),
  message: 'You are sending messages too fast. Please wait a moment.',
});
const ATTACHMENT_TYPES = ['image', 'pdf', 'file'];

router.post('/seller/send', authSeller, sellerSendLimit, async (req, res) => {
  try {
    const sellerId = req.seller.id;
    const { attachmentType, attachmentName, attachmentSize, replyTo } = req.body;
    const text = asText(req.body?.text, 20000);
    // a seller's attachment must be a file uploaded here (an admin acting here is trusted as before)
    const sentAttachment = asText(req.body?.attachment, 2000) || null;
    const attachment = req.admin || isStoredUpload(sentAttachment) ? sentAttachment : null;
    const cleanText = (text || '').trim();
    if (!cleanText && !attachment) return res.status(400).json({ message: 'Message or attachment is required' });

    const seller = await Seller.findById(sellerId);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    // the seller's support chat, created in one step when it does not exist yet (two first
    // messages sent at once used to open two separate chats)
    let conv = await Conversation.findOne({ seller: sellerId, type: { $ne: 'internal' } }).sort({ lastAt: -1 });
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

    // The quoted message is read from the database: the quote used to be taken as sent, so a
    // seller could show a "reply" to a support message that was never written (e.g. a fake
    // "withdrawal approved"). Only a real, not deleted message of this seller's own chat is quoted.
    let quoted = null;
    const quoteId = replyTo && (replyTo.messageId || replyTo._id);
    if (quoteId && mongoose.Types.ObjectId.isValid(String(quoteId))) {
      const q = await Message.findOne({ _id: quoteId, seller: seller._id, isDeleted: { $ne: true } })
        .select('sender senderName text attachmentType attachmentName').lean();
      if (q) {
        quoted = {
          messageId: q._id,
          sender: q.sender || '',
          senderName: q.sender === 'seller' ? (seller.storeName || 'Seller') : ['admin', 'staff'].includes(q.sender) ? 'Bazario Support' : q.senderName || 'Support',
          text: String(q.text || (q.attachmentType === 'pdf' ? `📄 ${q.attachmentName || 'PDF Document'}` : q.attachmentType ? '📷 Image Attachment' : '')).slice(0, 300),
          attachmentType: q.attachmentType || null,
          attachmentName: q.attachmentName || '',
        };
      }
    }

    const previewMsg = cleanText || (attachmentType === 'pdf' ? `📄 ${attachmentName || 'PDF Document'}` : '📷 Image Attachment');
    conv.lastMessage = previewMsg;
    conv.lastSender = 'seller';
    conv.lastAt = new Date();
    conv.unreadForAdmin = (conv.unreadForAdmin || 0) + 1;
    conv.status = 'open';
    // A seller who writes in the chat has seen everything support sent before (like WhatsApp:
    // a reply turns the earlier ticks blue). "Seen" used to be set only while the chat window was
    // open and on screen at the right moment, so a reply often arrived while the support
    // message above it still showed as not seen.
    conv.unreadForSeller = 0;
    await conv.save();
    const seenNow = new Date();
    const seenUpd = await Message.updateMany(
      { $or: [{ conversation: conv._id }, { seller: seller._id }], sender: { $in: ['admin', 'staff'] }, isSeen: { $ne: true } },
      { $set: { isSeen: true, seenAt: seenNow, seenBy: 'seller' } }
    );
    if (seenUpd.modifiedCount) {
      req.app.get('io')?.to(adminRoom('chat')).emit('messages:seen', { conversationId: conv._id, sellerId: seller._id, seenAt: seenNow, seenBy: 'seller' });
    }

    const message = new Message({
      conversation: conv._id,
      seller: seller._id,
      sender: 'seller',
      senderName: seller.storeName || seller.ownerName,
      text: cleanText,
      attachment: attachment || null,
      // only a known type is kept (anything else used to end in a 500); no attachment, no type
      attachmentType: !attachment ? null : ATTACHMENT_TYPES.includes(attachmentType) ? attachmentType : attachment.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image',
      attachmentName: attachment ? asText(attachmentName, 200) : '',
      attachmentSize: attachment ? Math.max(0, Number(attachmentSize) || 0) : 0,
      replyTo: quoted,
    });
    await message.save();

    // Phone push to the admins: new seller support message
    sendPush({
      to: 'admin',
      title: `💬 ${seller.storeName || seller.ownerName || 'Seller'} (Seller Support)`,
      body: cleanText ? cleanText.slice(0, 140) : (attachment ? '📎 Sent an attachment' : 'New message'),
      url: `/admin/chat?c=${conv._id}`,
      tag: `chat-${conv._id}`,
      skipActiveAdmins: true,
    });

    // Broadcast via socket.io
    const io = req.app.get('io');
    if (io) {
      io.to(`seller:${sellerId}`).emit('message:new', sellerSafeMessage(message));
      io.to(adminRoom('chat')).emit('message:new', message);
      io.to(adminRoom('chat')).emit('chat:notification', {
        conversationId: conv._id,
        storeName: seller.storeName,
        text: previewMsg,
      });
    }

    // the bell only: the push for this message was sent above (it used to arrive twice on phones)
    notify(req.app, {
      type: 'chat',
      title: `Message from ${seller.storeName}`,
      body: previewMsg.slice(0, 70),
      link: '/admin/chat',
      push: false,
    });

    // Handle Auto-Reply if enabled
    handleAutoReply(req.app, conv);

    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/chat/seller/action-opened  { messageId } — the seller tapped a support shortcut button;
// the first tap is recorded and shown to support ("✓ Opened")
router.post('/seller/action-opened', authSeller, async (req, res) => {
  try {
    const id = String(req.body?.messageId || '');
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Message not found' });
    const at = new Date();
    const msg = await Message.findOneAndUpdate(
      { _id: id, seller: req.seller.id, 'action.label': { $exists: true }, $or: [{ 'action.openedAt': null }, { 'action.openedAt': { $exists: false } }] },
      { $set: { 'action.openedAt': at } },
      { new: true, projection: { conversation: 1, action: 1 } }
    ).lean();
    if (msg) {
      req.app.get('io')?.to(adminRoom('chat')).emit('message:action_opened', { messageId: String(msg._id), conversation: String(msg.conversation), openedAt: at });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/chat/seller/read (Seller marks messages as read)
router.post('/seller/read', authSeller, async (req, res) => {
  try {
    const sellerId = req.seller.id;
    const now = new Date();

    const conv = await Conversation.findOne({ seller: sellerId, type: { $ne: 'internal' } });
    if (conv) {
      conv.unreadForSeller = 0;
      await conv.save();

      await Message.updateMany(
        {
          $or: [{ conversation: conv._id }, { seller: sellerId }],
          sender: { $in: ['admin', 'staff'] },
          isSeen: { $ne: true },
        },
        { $set: { isSeen: true, seenAt: now, seenBy: 'seller' } }
      );

      const io = req.app.get('io');
      if (io) {
        io.to(adminRoom('chat')).emit('messages:seen', {
          conversationId: conv._id,
          sellerId,
          seenAt: now,
        });
      }
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ----------------------------------------------------
// 2. ADMIN & STAFF SUPPORT DESK ENDPOINTS
// ----------------------------------------------------

// GET /api/chat/admin/conversations (Admin gets list of all seller chats)
router.get('/admin/conversations', authAdmin('chat'), async (req, res) => {
  try {
    // chats an admin deleted stay out until the store / guest writes again (ADMIN_VISIBLE_CHAT)
    const allConvos = await Conversation.find({ type: { $ne: 'internal' }, ...ADMIN_VISIBLE_CHAT })
      .populate('seller', 'storeName ownerName email phone rating')
      .populate('assignedStaff', 'name email title')
      .sort({ lastAt: -1 });

    // Group by seller id to merge duplicate conversation records in DB
    const sellerMap = new Map();
    const cleanList = [];

    // The store's CURRENT name / owner / email / phone (the copy on the chat was written when the
    // chat was opened; a renamed store used to keep showing its old name here). An out-of-date
    // copy is also corrected in the database, so search and the Today page show the new name too.
    const fixes = [];
    for (const c of allConvos) {
      if (c.seller && typeof c.seller === 'object' && c.seller.storeName !== undefined) {
        const live = chatNamesOf(c.seller);
        if (Object.entries(live).some(([k, v]) => (c[k] || '') !== v)) {
          Object.assign(c, live);
          fixes.push({ updateOne: { filter: { _id: c._id }, update: { $set: live } } });
        }
      }
    }
    if (fixes.length) Conversation.bulkWrite(fixes, { ordered: false }).catch((e) => console.error('[chat names] fix failed:', e.message));

    for (const c of allConvos) {
      const sId = c.seller?._id?.toString() || c.seller?.toString();
      if (sId) {
        if (!sellerMap.has(sId)) {
          sellerMap.set(sId, c);
          cleanList.push(c);
        } else {
          // Merge messages of duplicate conversation into primary conversation
          const primaryConv = sellerMap.get(sId);
          await Message.updateMany(
            { conversation: c._id },
            { $set: { conversation: primaryConv._id, seller: primaryConv.seller?._id || primaryConv.seller } }
          );
          // Delete duplicate conversation record
          await Conversation.findByIdAndDelete(c._id);
        }
      } else {
        cleanList.push(c);
      }
    }

    res.json(cleanList);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/chat/admin/conversations/:id/messages (Admin gets conversation messages)
router.get('/admin/conversations/:id/messages', authAdmin('chat'), async (req, res) => {
  try {
    const { limit, before } = req.query;
    const conv = await Conversation.findById(req.params.id);
    if (!conv) {
      const fallback = await fetchConversationMessages({ conversation: req.params.id }, { limit, before });
      return res.json(fallback);
    }

    const sellerId = conv.seller?._id || conv.seller;
    const query = sellerId
      ? { $or: [{ conversation: conv._id }, { seller: sellerId }] }
      : { conversation: conv._id };

    // Sync any messages pointing to seller but different conv id
    if (sellerId) {
      await Message.updateMany(
        { seller: sellerId, conversation: { $ne: conv._id } },
        { $set: { conversation: conv._id } }
      );
    }

    const fetched = await fetchConversationMessages(query, { limit, before });
    const { hasMore } = fetched;
    let messages = fetched.messages;

    // the store's messages carry the name it had when each was sent: show its current name
    if (sellerId) {
      const live = await Seller.findById(sellerId).select('storeName ownerName').lean();
      const name = live?.storeName || live?.ownerName || '';
      if (name) {
        messages = messages.map((m) => {
          const o = typeof m.toObject === 'function' ? m.toObject() : { ...m };
          if (o.sender === 'seller') o.senderName = name;
          if (o.replyTo && o.replyTo.sender === 'seller') o.replyTo = { ...o.replyTo, senderName: name };
          return o;
        });
      }
    }

    // Mark as read for admin
    await Conversation.findByIdAndUpdate(req.params.id, { unreadForAdmin: 0 });
    res.json({ messages, hasMore });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/chat/admin/conversations/:id/reply (Admin replies to seller)
router.post('/admin/conversations/:id/reply', authAdmin('chat'), async (req, res) => {
  try {
    const { text, attachment, attachmentType, attachmentName, attachmentSize, replyTo } = req.body;
    let cleanText = (text || '').trim();
    if (!cleanText && !attachment && !req.body?.action) return res.status(400).json({ message: 'Message or attachment is required' });

    const conv = await Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });

    // a shortcut button (page / order / product of this store), checked before anything is saved
    let action = null;
    if (req.body?.action) {
      try {
        action = await resolveShortcut(req.body.action, conv);
      } catch (e) {
        return res.status(e.status || 400).json({ message: e.message });
      }
    }
    // {storeName}, {balance}, {pendingOrders}… → this store's values
    if (conv.seller && cleanText.includes('{')) cleanText = fillPlaceholders(cleanText, await sellerFacts(conv.seller));

    const previewMsg = cleanText || (action ? `🔗 ${action.label}` : attachmentType === 'pdf' ? `📄 ${attachmentName || 'PDF Document'}` : '📷 Image Attachment');
    conv.lastMessage = previewMsg;
    conv.lastSender = 'admin';
    conv.lastAt = new Date();
    if (conv.type === 'guest' || conv.isGuest) {
      conv.unreadForCustomer = (conv.unreadForCustomer || 0) + 1;
    } else {
      conv.unreadForSeller = (conv.unreadForSeller || 0) + 1;
    }
    conv.unreadForAdmin = 0;
    conv.assignedStaff = req.admin.id;
    conv.assignedStaffName = req.admin.name || 'Support Staff';
    await conv.save();

    const message = new Message({
      conversation: conv._id,
      seller: conv.seller || null,
      guestId: conv.guestId || null,
      sender: 'admin',
      senderName: req.admin.name || 'Official Support Admin',
      text: cleanText,
      attachment: attachment || null,
      attachmentType: attachmentType || (attachment?.toLowerCase().endsWith('.pdf') ? 'pdf' : attachment ? 'image' : null),
      attachmentName: attachmentName || '',
      attachmentSize: attachmentSize || 0,
      replyTo: replyTo && (replyTo.text || replyTo.attachmentName) ? {
        messageId: replyTo.messageId || replyTo._id || null,
        sender: replyTo.sender || '',
        senderName: replyTo.senderName || '',
        text: replyTo.text || '',
        attachmentType: replyTo.attachmentType || null,
        attachmentName: replyTo.attachmentName || '',
      } : null,
      ...(action ? { action } : {}),
    });
    await message.save();

    // Phone push to the seller: reply from support
    if (conv.seller) {
      sendPush({
        to: 'seller',
        sellerId: conv.seller,
        title: '💬 Bazario Support',
        body: cleanText ? cleanText.slice(0, 140) : action ? `🔗 ${action.label}` : (message.attachment ? '📎 Sent an attachment' : 'New message'),
        url: '/seller/support',
        tag: `chat-${conv._id}`,
      });
    }

    // Broadcast via socket.io
    const io = req.app.get('io');
    if (io) {
      if (conv.seller) {
        io.to(`seller:${conv.seller}`).emit('message:new', sellerSafeMessage(message));
      }
      if (conv.guestId) {
        io.to(`guest:${conv.guestId}`).emit('message:new', message);
        io.to(`customer:${conv.guestId}`).emit('message:new', message);
      }
      io.to(`conversation:${conv._id}`).emit('message:new', message);
      io.to(adminRoom('chat')).emit('message:new', message);
    }
    // the reply is sent: this admin is no longer "typing" in this chat (on any device)
    clearAdminTyping(req.admin.id, conv._id);

    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Saved replies (shared by the support team) ───
const DEFAULT_QUICK_REPLIES = [
  {
    title: 'Upgrade to Diamond',
    text: 'To upgrade your store to 💎 Diamond (35% profit on every order and 72 hours to confirm orders), tap the button below and send the upgrade request. Our team will then guide you on the one-time fee.',
    actionKey: 'diamond',
  },
  {
    title: 'How to deposit',
    text: 'To add funds to your wallet, tap the button below, enter the amount and upload your payment proof. The amount is added to your balance as soon as our team verifies it.',
    actionKey: 'deposit',
  },
  {
    title: 'How to withdraw',
    text: 'To withdraw, tap the button below, choose your saved payout method and enter the amount. Our team processes it after review.',
    actionKey: 'withdraw',
  },
  {
    title: 'Confirm your pending orders',
    text: 'You have orders waiting for your confirmation. Please confirm them on time to avoid a penalty — tap the button below to open your orders.',
    actionKey: 'orders',
  },
  {
    title: 'Add products from Treasury',
    text: 'You can add ready products to your store in one tap from the Product Treasury. Tap the button below to open it.',
    actionKey: 'treasury',
  },
  {
    title: 'Update payout details',
    text: 'Please add or update your bank / UPI payout details in Store Settings. Tap the button below to open it.',
    actionKey: 'settings',
  },
];
const cleanQuickReply = (body) => {
  const title = asText(body?.title, 80).trim();
  const text = asText(body?.text, 2000).trim();
  const key = String(body?.actionKey || '');
  const actionKey = key && Object.prototype.hasOwnProperty.call(SHORTCUT_PAGES, key) ? key : '';
  return { title, text, actionKey, showToSellers: body?.showToSellers === true };
};

// GET /api/chat/admin/quick-replies (the first time: a few ready ones are added)
/** The default saved replies, added once; the ones Bazario added are shown to sellers as Quick Help once. */
async function seedQuickReplies() {
  const settings = await ChatSettings.findOne().select('quickRepliesSeeded quickHelpSeeded').lean();
  if (!settings?.quickRepliesSeeded && !(await ChatQuickReply.exists({}))) {
    await ChatQuickReply.insertMany(DEFAULT_QUICK_REPLIES.map((r, i) => ({ ...r, order: i, createdBy: 'Bazario', showToSellers: true })));
    await ChatSettings.updateOne({}, { $set: { quickRepliesSeeded: true, quickHelpSeeded: true } }, { upsert: true });
    return;
  }
  if (!settings?.quickHelpSeeded) {
    await ChatQuickReply.updateMany({ createdBy: 'Bazario', showToSellers: { $exists: false } }, { $set: { showToSellers: true } });
    await ChatSettings.updateOne({}, { $set: { quickRepliesSeeded: true, quickHelpSeeded: true } }, { upsert: true });
  }
}

router.get('/admin/quick-replies', authAdmin('chat'), async (req, res) => {
  try {
    await seedQuickReplies();
    const list = await ChatQuickReply.find().sort({ order: 1, createdAt: 1 }).lean();
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/chat/admin/quick-replies  { title, text, actionKey }
router.post('/admin/quick-replies', authAdmin('chat'), async (req, res) => {
  try {
    const r = cleanQuickReply(req.body);
    if (!r.title) return res.status(400).json({ message: 'Give the saved reply a short title.' });
    if (!r.text && !r.actionKey) return res.status(400).json({ message: 'Write the reply text or choose a button.' });
    const last = await ChatQuickReply.findOne().sort({ order: -1 }).select('order').lean();
    const doc = await ChatQuickReply.create({ ...r, order: (last?.order ?? -1) + 1, createdBy: req.admin?.name || '' });
    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/chat/admin/quick-replies/:id
router.put('/admin/quick-replies/:id', authAdmin('chat'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) return res.status(404).json({ message: 'Saved reply not found' });
    const r = cleanQuickReply(req.body);
    if (!r.title) return res.status(400).json({ message: 'Give the saved reply a short title.' });
    if (!r.text && !r.actionKey) return res.status(400).json({ message: 'Write the reply text or choose a button.' });
    const doc = await ChatQuickReply.findByIdAndUpdate(req.params.id, { $set: { ...r, updatedBy: req.admin?.name || '' } }, { new: true });
    if (!doc) return res.status(404).json({ message: 'Saved reply not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/chat/admin/quick-replies/:id
router.delete('/admin/quick-replies/:id', authAdmin('chat'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) return res.status(404).json({ message: 'Saved reply not found' });
    await ChatQuickReply.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/chat/admin/placeholders — the {names} that can be used in messages
router.get('/admin/placeholders', authAdmin('chat'), (req, res) => {
  res.json(Object.entries(PLACEHOLDERS).map(([key, label]) => ({ key, label })));
});

// GET /api/chat/admin/conversations/:id/seller-info — the store behind a chat, for the side panel
router.get('/admin/conversations/:id/seller-info', authAdmin('chat'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) return res.status(404).json({ message: 'Conversation not found' });
    const conv = await Conversation.findById(req.params.id).select('seller').lean();
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });
    if (!conv.seller) return res.json({ guest: true });
    const facts = await sellerFacts(conv.seller, { withOrders: true });
    if (!facts) return res.status(404).json({ message: 'This store no longer exists' });
    res.json(facts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Broadcast: one message (+ button) to a group of stores ───
const SEGMENTS = {
  all: 'All active stores',
  basic: 'Basic stores (not Diamond)',
  diamond: 'Diamond stores',
  pending: 'Stores with orders waiting to be confirmed',
  no_deposit_7d: 'No deposit in the last 7 days',
  frozen: 'Frozen stores',
};

async function segmentSellers(segment) {
  const base = { status: { $in: ['active', 'frozen'] }, isTestAccount: { $ne: true }, accountType: { $ne: 'test' }, registrationRejectedAt: null };
  const pick = 'storeName ownerName email phone';
  if (segment === 'basic') return Seller.find({ ...base, tier: { $ne: 'diamond' } }).select(pick).lean();
  if (segment === 'diamond') return Seller.find({ ...base, tier: 'diamond' }).select(pick).lean();
  if (segment === 'frozen') return Seller.find({ ...base, status: 'frozen' }).select(pick).lean();
  if (segment === 'pending') {
    const orders = await Order.find({ status: 'pending' }).select('seller items.seller items.itemStatus').lean();
    const ids = new Set();
    for (const o of orders) {
      for (const it of o.items || []) {
        if (!it.itemStatus || it.itemStatus === 'pending') {
          const sid = it.seller || o.seller;
          if (sid) ids.add(String(sid));
        }
      }
    }
    return Seller.find({ ...base, _id: { $in: [...ids] } }).select(pick).lean();
  }
  if (segment === 'no_deposit_7d') {
    const recent = await Withdrawal.distinct('seller', { type: 'deposit', status: { $in: ['approved', 'completed', 'pending'] }, createdAt: { $gte: new Date(Date.now() - 7 * 86400000) } });
    return Seller.find({ ...base, _id: { $nin: recent } }).select(pick).lean();
  }
  return Seller.find(base).select(pick).lean();
}

// GET /api/chat/admin/broadcasts/preview?segment= — how many stores it would reach
router.get('/admin/broadcasts/preview', authAdmin('chat'), async (req, res) => {
  try {
    const segment = Object.prototype.hasOwnProperty.call(SEGMENTS, req.query.segment) ? req.query.segment : 'all';
    const list = await segmentSellers(segment);
    res.json({ segment, label: SEGMENTS[segment], count: list.length, sample: list.slice(0, 8).map((s) => s.storeName) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/chat/admin/broadcasts — segments + past broadcasts with their results
router.get('/admin/broadcasts', authAdmin('chat'), async (req, res) => {
  try {
    const list = await ChatBroadcast.find().sort({ createdAt: -1 }).limit(30).lean();
    const stats = list.length
      ? await Message.aggregate([
          { $match: { broadcastId: { $in: list.map((b) => b._id) } } },
          {
            $group: {
              _id: '$broadcastId',
              sent: { $sum: 1 },
              seen: { $sum: { $cond: ['$isSeen', 1, 0] } },
              opened: { $sum: { $cond: [{ $ifNull: ['$action.openedAt', false] }, 1, 0] } },
              done: { $sum: { $cond: [{ $ifNull: ['$action.doneAt', false] }, 1, 0] } },
            },
          },
        ])
      : [];
    const byId = new Map(stats.map((x) => [String(x._id), x]));
    res.json({
      segments: Object.entries(SEGMENTS).map(([key, label]) => ({ key, label })),
      broadcasts: list.map((b) => ({ ...b, stats: byId.get(String(b._id)) || { sent: 0, seen: 0, opened: 0, done: 0 } })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/chat/admin/broadcasts  { segment, text, actionKey?, amount? } — sent in the background
router.post('/admin/broadcasts', authAdmin('chat'), async (req, res) => {
  try {
    const segment = Object.prototype.hasOwnProperty.call(SEGMENTS, req.body?.segment) ? req.body.segment : '';
    if (!segment) return res.status(400).json({ message: 'Choose who gets the message.' });
    const text = asText(req.body?.text, 2000).trim();
    const key = String(req.body?.actionKey || '');
    const action = key ? pageAction(key, { amount: req.body?.amount }) : null;
    if (key && !action) return res.status(400).json({ message: 'Unknown button.' });
    if (!text && !action) return res.status(400).json({ message: 'Write a message or choose a button.' });

    const sellers = await segmentSellers(segment);
    if (!sellers.length) return res.status(400).json({ message: 'No store is in this group right now.' });
    if (sellers.length > 3000) return res.status(400).json({ message: 'This group is too large to send at once.' });

    const by = req.admin?.name || 'Support';
    const bc = await ChatBroadcast.create({ segment, segmentLabel: SEGMENTS[segment], text, action, sentTo: sellers.length, sentBy: by, status: 'sending' });
    audit(req, 'create', 'chat_broadcast', bc._id, `Broadcast to ${SEGMENTS[segment]} (${sellers.length} stores)${action ? ` with button ${action.label}` : ''}`);
    res.status(201).json({ ok: true, id: String(bc._id), sentTo: sellers.length, message: `Sending to ${sellers.length} stores…` });

    // the sending itself happens after the answer (it can take a while for many stores)
    const io = req.app.get('io');
    const needsFacts = text.includes('{');
    (async () => {
      for (const s of sellers) {
        try {
          let conv = await Conversation.findOne({ seller: s._id, type: { $ne: 'internal' } }).sort({ lastAt: -1 });
          if (!conv) {
            conv = await Conversation.findOneAndUpdate(
              { seller: s._id, type: 'seller' },
              { $setOnInsert: { type: 'seller', seller: s._id, storeName: s.storeName, sellerName: s.ownerName, sellerEmail: s.email, sellerPhone: s.phone || '', subject: 'General Seller Support & Operations' } },
              { upsert: true, new: true }
            );
          }
          const body = needsFacts ? fillPlaceholders(text, await sellerFacts(s._id)) : text;
          const msg = await Message.create({
            conversation: conv._id,
            seller: s._id,
            sender: 'admin',
            senderName: by,
            text: body,
            broadcastId: bc._id,
            ...(action ? { action } : {}),
          });
          await Conversation.updateOne(
            { _id: conv._id },
            { $set: { lastMessage: (body || `🔗 ${action?.label || ''}`).slice(0, 140), lastSender: 'admin', lastAt: new Date() }, $inc: { unreadForSeller: 1 } }
          );
          io?.to(`seller:${s._id}`).emit('message:new', sellerSafeMessage(msg));
          sendPush({ to: 'seller', sellerId: s._id, title: '💬 Bazario Support', body: (body || `🔗 ${action?.label || ''}`).slice(0, 140), url: '/seller/support', tag: `bc-${bc._id}` });
        } catch (e) {
          console.error('[broadcast] store', String(s._id), e.message);
        }
      }
      await ChatBroadcast.updateOne({ _id: bc._id }, { $set: { status: 'done' } });
      io?.to(adminRoom('chat')).emit('chat:broadcast_done', { id: String(bc._id) });
    })().catch((e) => console.error('[broadcast] failed:', e.message));
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ message: err.message });
  }
});

// GET /api/chat/seller/quick-help — answers support marked for sellers, filled in for this store
router.get('/seller/quick-help', authSeller, async (req, res) => {
  try {
    await seedQuickReplies();
    const list = await ChatQuickReply.find({ showToSellers: true }).sort({ order: 1, createdAt: 1 }).limit(12).lean();
    const facts = list.some((r) => (r.text || '').includes('{')) ? await sellerFacts(req.seller.id) : null;
    res.json(
      list.map((r) => ({
        id: String(r._id),
        title: r.title,
        text: facts ? fillPlaceholders(r.text || '', facts) : r.text || '',
        action: r.actionKey ? pageAction(r.actionKey) : null,
      }))
    );
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/chat/admin/shortcut-pages — the pages support can send as a button
router.get('/admin/shortcut-pages', authAdmin('chat'), (req, res) => {
  res.json(Object.entries(SHORTCUT_PAGES).map(([key, p]) => ({ key, ...p })));
});

// GET /api/chat/admin/conversations/:id/shortcuts?kind=order|product&q=  — this store's orders /
// products for the shortcut picker (only the store of this chat)
router.get('/admin/conversations/:id/shortcuts', authAdmin('chat'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) return res.status(404).json({ message: 'Conversation not found' });
    const conv = await Conversation.findById(req.params.id).select('seller').lean();
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });
    if (!conv.seller) return res.json([]);
    const kind = req.query.kind === 'product' ? 'product' : 'order';
    res.json(await searchShortcutTargets(conv, kind, asText(req.query.q, 60)));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/chat/admin/conversations/:id/status (Change status: open/resolved)
router.post('/admin/conversations/:id/status', authAdmin('chat'), async (req, res) => {
  try {
    const { status, priority } = req.body;
    const conv = await Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });

    if (status) conv.status = status;
    if (priority) conv.priority = priority;
    await conv.save();

    res.json(conv);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/chat/admin/conversations/:id/read (Admin marks read)
router.post('/admin/conversations/:id/read', authAdmin('chat'), async (req, res) => {
  try {
    await Conversation.updateOne({ _id: req.params.id }, { $set: { unreadForAdmin: 0 } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ----------------------------------------------------
// 3. INTERNAL TEAM & SUPER ADMIN CHAT ENDPOINTS
// ----------------------------------------------------

// GET /api/chat/admin/team (List of team members with direct chat status & unread counts)
router.get('/admin/team', authAdmin('chat'), async (req, res) => {
  try {
    const myId = req.admin.id;
    // Fetch all active admins/staff
    const allAdmins = await Admin.find({ active: true })
      .select('name email role title phone lastLoginAt')
      .sort({ name: 1 });

    const peers = allAdmins.filter((a) => a._id.toString() !== myId);

    // Fetch all internal conversations involving current admin
    const myConvos = await Conversation.find({
      type: 'internal',
      $or: [{ adminA: myId }, { adminB: myId }],
    });

    const convoMap = new Map();
    for (const c of myConvos) {
      const peerId = c.adminA.toString() === myId ? c.adminB.toString() : c.adminA.toString();
      convoMap.set(peerId, c);
    }

    const result = peers.map((p) => {
      const pId = p._id.toString();
      const conv = convoMap.get(pId);
      const isA = conv ? conv.adminA?.toString() === myId : false;
      const unreadCount = conv ? (isA ? (conv.unreadForAdminA || 0) : (conv.unreadForAdminB || 0)) : 0;

      return {
        _id: p._id,
        name: p.name,
        email: p.email,
        role: p.role,
        title: p.title || 'Administrator',
        phone: p.phone || '',
        lastLoginAt: p.lastLoginAt,
        conversationId: conv?._id || null,
        lastMessage: conv?.lastMessage || '',
        lastAt: conv?.lastAt || null,
        lastSender: conv?.lastSender || '',
        lastSenderId: conv?.lastSenderId || null,
        unreadCount,
      };
    });

    // Sort: unread first, then latest message time, then alphabetical
    result.sort((a, b) => {
      if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
      if (a.lastAt && b.lastAt) return new Date(b.lastAt) - new Date(a.lastAt);
      if (a.lastAt) return -1;
      if (b.lastAt) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/chat/admin/team/:targetAdminId/messages (Get or create 1-on-1 thread & messages)
router.get('/admin/team/:targetAdminId/messages', authAdmin('chat'), async (req, res) => {
  try {
    const myId = req.admin.id;
    const targetAdminId = req.params.targetAdminId;

    if (myId === targetAdminId) {
      return res.status(400).json({ message: 'Cannot chat with yourself' });
    }

    const [myAdmin, targetAdmin] = await Promise.all([
      Admin.findById(myId),
      Admin.findById(targetAdminId),
    ]);

    if (!targetAdmin) return res.status(404).json({ message: 'Target team member not found' });

    let conv = await Conversation.findOne({
      type: 'internal',
      $or: [
        { adminA: myId, adminB: targetAdminId },
        { adminA: targetAdminId, adminB: myId },
      ],
    });

    if (!conv) {
      conv = new Conversation({
        type: 'internal',
        adminA: myId,
        adminB: targetAdminId,
        adminAName: myAdmin?.name || 'Admin',
        adminBName: targetAdmin.name,
        adminAEmail: myAdmin?.email || '',
        adminBEmail: targetAdmin.email,
        adminARole: myAdmin?.role || 'admin',
        adminBRole: targetAdmin.role || 'admin',
        subject: 'Internal Discussion',
        lastMessage: 'Conversation started',
        lastAt: new Date(),
        unreadForAdminA: 0,
        unreadForAdminB: 0,
      });
      await conv.save();
    } else {
      // Mark as read for current admin
      if (conv.adminA.toString() === myId) {
        conv.unreadForAdminA = 0;
      } else {
        conv.unreadForAdminB = 0;
      }
      await conv.save();
    }

    const { limit, before } = req.query;
    const { messages, hasMore } = await fetchConversationMessages({ conversation: conv._id }, { limit, before });

    res.json({
      conversation: conv,
      targetAdmin: {
        _id: targetAdmin._id,
        name: targetAdmin.name,
        email: targetAdmin.email,
        role: targetAdmin.role,
        title: targetAdmin.title,
        phone: targetAdmin.phone,
      },
      messages,
      hasMore,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/chat/admin/team/:targetAdminId/send (Send internal direct message)
router.post('/admin/team/:targetAdminId/send', authAdmin('chat'), async (req, res) => {
  try {
    const myId = req.admin.id;
    const targetAdminId = req.params.targetAdminId;
    const { text, attachment, attachmentType, attachmentName, attachmentSize, replyTo } = req.body;
    const cleanText = (text || '').trim();

    if (!cleanText && !attachment) {
      return res.status(400).json({ message: 'Message or attachment is required' });
    }

    const [myAdmin, targetAdmin] = await Promise.all([
      Admin.findById(myId),
      Admin.findById(targetAdminId),
    ]);

    if (!targetAdmin) return res.status(404).json({ message: 'Target team member not found' });

    let conv = await Conversation.findOne({
      type: 'internal',
      $or: [
        { adminA: myId, adminB: targetAdminId },
        { adminA: targetAdminId, adminB: myId },
      ],
    });

    if (!conv) {
      conv = new Conversation({
        type: 'internal',
        adminA: myId,
        adminB: targetAdminId,
        adminAName: myAdmin?.name || 'Admin',
        adminBName: targetAdmin.name,
        adminAEmail: myAdmin?.email || '',
        adminBEmail: targetAdmin.email,
        adminARole: myAdmin?.role || 'admin',
        adminBRole: targetAdmin.role || 'admin',
        subject: 'Internal Discussion',
      });
    }

    const previewMsg = cleanText || (attachmentType === 'pdf' ? `📄 ${attachmentName || 'PDF Document'}` : '📷 Image Attachment');
    conv.lastMessage = previewMsg;
    conv.lastSender = 'admin';
    conv.lastSenderId = myId;
    conv.lastAt = new Date();

    if (conv.adminA.toString() === myId) {
      conv.unreadForAdminB = (conv.unreadForAdminB || 0) + 1;
      conv.unreadForAdminA = 0;
    } else {
      conv.unreadForAdminA = (conv.unreadForAdminA || 0) + 1;
      conv.unreadForAdminB = 0;
    }
    await conv.save();

    const message = new Message({
      conversation: conv._id,
      sender: 'admin',
      senderAdmin: myId,
      senderName: myAdmin?.name || 'Admin',
      senderRole: myAdmin?.role || 'admin',
      text: cleanText,
      attachment: attachment || null,
      attachmentType: attachmentType || (attachment?.toLowerCase().endsWith('.pdf') ? 'pdf' : attachment ? 'image' : null),
      attachmentName: attachmentName || '',
      attachmentSize: attachmentSize || 0,
      replyTo: replyTo && (replyTo.text || replyTo.attachmentName) ? {
        messageId: replyTo.messageId || replyTo._id || null,
        sender: replyTo.sender || '',
        senderName: replyTo.senderName || '',
        text: replyTo.text || '',
        attachmentType: replyTo.attachmentType || null,
        attachmentName: replyTo.attachmentName || '',
      } : null,
    });
    await message.save();

    // Real-time socket broadcast
    const io = req.app.get('io');
    if (io) {
      io.to(`admin:${targetAdminId}`).emit('admin:message:new', message);
      io.to(`admin:${myId}`).emit('admin:message:new', message);
      io.to(`admin:${targetAdminId}`).emit('chat:notification', {
        conversationId: conv._id,
        storeName: `Team: ${myAdmin?.name || 'Admin'}`,
        text: previewMsg,
      });
    }

    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ----------------------------------------------------
// CLEARING CHATS (and freeing the storage used by their pictures / PDFs)
// ----------------------------------------------------

// Every message that belongs to a conversation (same rule the message list uses)
function conversationScope(conv) {
  const sellerId = conv.seller?._id || conv.seller;
  if (conv.type !== 'internal' && sellerId) return { $or: [{ conversation: conv._id }, { seller: sellerId }] };
  if (conv.type !== 'internal' && conv.guestId) return { $or: [{ conversation: conv._id }, { guestId: conv.guestId }] };
  return { conversation: conv._id };
}

// A file is removed from storage only when no remaining message still points to it
async function deleteUnreferencedAttachments(urls) {
  const unique = [...new Set((urls || []).filter(Boolean))];
  if (!unique.length) return { requested: 0, deleted: 0, failed: 0, error: '' };
  const stillUsed = new Set(await Message.distinct('attachment', { attachment: { $in: unique } }));
  return deleteAttachmentFiles(unique.filter((u) => !stillUsed.has(u)));
}

function parseClearRange(body) {
  const mode = ['all', 'before', 'range'].includes(body?.mode) ? body.mode : null;
  if (!mode) return { error: 'Choose what to clear: all, before a date, or a date range' };
  const asDate = (v) => {
    const d = v ? new Date(v) : null;
    return d && !isNaN(d.getTime()) ? d : null;
  };
  if (mode === 'all') return { mode, createdAt: null, from: null, to: null };
  if (mode === 'before') {
    const before = asDate(body.before);
    if (!before) return { error: 'A valid date is required' };
    return { mode, createdAt: { $lt: before }, from: null, to: before };
  }
  const from = asDate(body.from);
  const to = asDate(body.to);
  if (!from || !to) return { error: 'Both dates are required' };
  if (from > to) return { error: 'The first date must be before the second date' };
  return { mode, createdAt: { $gte: from, $lte: to }, from, to };
}

/**
 * Permanently removes the messages of one conversation (all of them, or only a date range)
 * together with their uploaded pictures / PDFs. With `dryRun` it only counts.
 */
async function clearConversation(req, conv, body) {
  const range = parseClearRange(body);
  if (range.error) return { status: 400, json: { message: range.error } };

  const scope = conversationScope(conv);
  const filter = range.createdAt ? { $and: [scope, { createdAt: range.createdAt }] } : scope;

  const docs = await Message.find(filter).select('_id attachment').lean();
  const ids = docs.map((d) => d._id);
  const urls = [...new Set(docs.map((d) => d.attachment).filter(Boolean))];
  const fileCount = urls.filter((u) => attachmentLocation(u)).length;

  if (body?.dryRun) {
    return { status: 200, json: { ok: true, dryRun: true, messages: ids.length, files: fileCount } };
  }
  if (!ids.length) {
    return { status: 200, json: { ok: true, deleted: 0, files: { requested: 0, deleted: 0, failed: 0, error: '' }, message: 'There were no messages to clear' } };
  }

  await Message.deleteMany({ _id: { $in: ids } });
  const files = await deleteUnreferencedAttachments(urls);

  // Conversation preview: latest message that is still there, or an empty chat
  const latest = await Message.findOne({ ...scope, isDeleted: { $ne: true } }).sort({ createdAt: -1 }).lean();
  if (latest) {
    conv.lastMessage = (latest.text || (latest.attachmentType === 'pdf' ? `📄 ${latest.attachmentName || 'PDF Document'}` : '📷 Image Attachment')).slice(0, 70);
    conv.lastSender = latest.sender;
    conv.lastAt = latest.createdAt;
  } else {
    conv.lastMessage = '🧹 Chat cleared';
    conv.unreadForAdmin = 0;
    conv.unreadForSeller = 0;
    conv.unreadForCustomer = 0;
    conv.unreadForAdminA = 0;
    conv.unreadForAdminB = 0;
  }
  await conv.save();

  // Tell the people who have this chat open, so the messages disappear without a reload
  const sellerId = conv.seller?._id ? conv.seller._id.toString() : conv.seller ? conv.seller.toString() : null;
  const payload = {
    conversationId: conv._id,
    sellerId,
    guestId: conv.guestId || null,
    internal: conv.type === 'internal',
    mode: range.mode,
    from: range.from,
    to: range.to,
    lastMessage: conv.lastMessage,
  };
  const io = req.app.get('io');
  if (io) {
    if (conv.type === 'internal') {
      if (conv.adminA) io.to(`admin:${conv.adminA}`).emit('chat:cleared', payload);
      if (conv.adminB) io.to(`admin:${conv.adminB}`).emit('chat:cleared', payload);
    } else {
      io.to(adminRoom('chat')).emit('chat:cleared', payload);
      if (sellerId) io.to(`seller:${sellerId}`).emit('chat:cleared', payload);
      if (conv.guestId) {
        io.to(`guest:${conv.guestId}`).emit('chat:cleared', payload);
        io.to(`customer:${conv.guestId}`).emit('chat:cleared', payload);
      }
    }
  }

  await audit(req, 'chat_cleared', 'conversation', conv._id, {
    with: conv.storeName || conv.name || conv.adminBName || '',
    mode: range.mode,
    from: range.from,
    to: range.to,
    messages: ids.length,
    filesDeleted: files.deleted,
    filesFailed: files.failed,
  });

  return {
    status: 200,
    json: {
      ok: true,
      deleted: ids.length,
      files,
      message:
        files.failed > 0
          ? `${ids.length} messages cleared, but ${files.failed} file(s) could not be removed from storage: ${files.error}`
          : `${ids.length} messages and ${files.deleted} file(s) deleted`,
    },
  };
}

// POST /api/chat/admin/conversations/:id/clear (Admin clears a seller / guest chat: all of it, or a date range)
router.post('/admin/conversations/:id/clear', authAdmin('chat'), async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });
    if (conv.type === 'internal') return res.status(400).json({ message: 'Use the team chat to clear a team conversation' });
    const out = await clearConversation(req, conv, req.body || {});
    res.status(out.status).json(out.json);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/chat/admin/conversations/delete  { ids: [...], dryRun }
// Delete one or many seller / guest chats from the Support Desk: every message and its pictures /
// PDFs are removed for good (same as "Clear → Whole chat"), and the chat leaves the list. If the
// store or guest writes again later, the chat comes back with only the new messages.
// dryRun only counts (chats, messages, files) so the admin sees what will go before confirming.
const MAX_DELETE_AT_ONCE = 200;
router.post('/admin/conversations/delete', authAdmin('chat'), async (req, res) => {
  try {
    const raw = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const ids = [...new Set(raw.map(String))].filter((x) => mongoose.Types.ObjectId.isValid(x));
    if (!ids.length) return res.status(400).json({ message: 'Choose at least one chat to delete' });
    if (ids.length > MAX_DELETE_AT_ONCE) return res.status(400).json({ message: `At most ${MAX_DELETE_AT_ONCE} chats can be deleted at once` });
    const dryRun = Boolean(req.body?.dryRun);

    const convs = await Conversation.find({ _id: { $in: ids }, type: { $ne: 'internal' } });
    if (!convs.length) return res.status(404).json({ message: 'Those chats were not found (maybe already deleted)' });

    const total = { chats: 0, messages: 0, files: 0, filesDeleted: 0, filesFailed: 0 };
    const failed = [];
    const deletedIds = [];
    for (const conv of convs) {
      const name = conv.storeName || conv.name || (conv.guestId ? 'Guest' : 'Chat');
      try {
        if (dryRun) {
          const out = await clearConversation(req, conv, { mode: 'all', dryRun: true });
          total.chats += 1;
          total.messages += out.json?.messages || 0;
          total.files += out.json?.files || 0;
          continue;
        }
        // the moment of deletion is taken BEFORE clearing: a message the store sends while this
        // runs is newer, so its chat shows up again instead of being hidden
        const at = new Date();
        const out = await clearConversation(req, conv, { mode: 'all' });
        if (out.status !== 200) throw new Error(out.json?.message || 'Could not clear');
        await Conversation.updateOne(
          { _id: conv._id },
          { $set: { adminDeletedAt: at, unreadForAdmin: 0 } }
        );
        total.chats += 1;
        total.messages += out.json?.deleted || 0;
        total.filesDeleted += out.json?.files?.deleted || 0;
        total.filesFailed += out.json?.files?.failed || 0;
        deletedIds.push(String(conv._id));
        await audit(req, 'chat_deleted', 'conversation', conv._id, { with: name, messages: out.json?.deleted || 0, filesDeleted: out.json?.files?.deleted || 0 });
      } catch (e) {
        failed.push({ id: String(conv._id), name, error: e.message });
      }
    }

    if (dryRun) return res.json({ ok: true, dryRun: true, ...total });

    const io = req.app.get('io');
    if (io && deletedIds.length) io.to(adminRoom('chat')).emit('chat:deleted', { conversationIds: deletedIds });

    res.json({
      ok: failed.length === 0,
      deleted: total.chats,
      messages: total.messages,
      files: { deleted: total.filesDeleted, failed: total.filesFailed },
      deletedIds,
      failed,
      message:
        `${total.chats} chat${total.chats === 1 ? '' : 's'} deleted (${total.messages} messages, ${total.filesDeleted} files)` +
        (failed.length ? ` · ${failed.length} could not be deleted: ${failed.map((f) => f.name).join(', ')}` : '') +
        (total.filesFailed ? ` · ${total.filesFailed} file(s) could not be removed from storage` : ''),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/chat/admin/team/:targetAdminId/clear (Admin clears their own 1-on-1 chat with a team member)
router.post('/admin/team/:targetAdminId/clear', authAdmin('chat'), async (req, res) => {
  try {
    const myId = req.admin.id;
    const targetAdminId = req.params.targetAdminId;
    const conv = await Conversation.findOne({
      type: 'internal',
      $or: [
        { adminA: myId, adminB: targetAdminId },
        { adminA: targetAdminId, adminB: myId },
      ],
    });
    if (!conv) return res.json({ ok: true, deleted: 0, messages: 0, files: req.body?.dryRun ? 0 : { requested: 0, deleted: 0, failed: 0, error: '' }, dryRun: Boolean(req.body?.dryRun) });
    const out = await clearConversation(req, conv, req.body || {});
    res.status(out.status).json(out.json);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ----------------------------------------------------
// 4. CHAT SETTINGS & AUTO-REPLY ENDPOINTS
// ----------------------------------------------------

// What the admin screen gets: the clean settings, what happens right now, the default texts,
// plus the old field names (enabled / message / awayMode) for anything that still reads them.
const autoReplyPayload = (doc) => {
  const config = autoReplyConfig(doc);
  return {
    config,
    now: autoReplyNow(config),
    defaults: AUTO_REPLY_DEFAULTS,
    autoReplyEnabled: config.mode === 'on',
    awayMode: config.mode === 'away',
    enabled: config.mode === 'on',
    autoReplyMessage: config.messages.sellerOn,
    message: config.messages.sellerOn,
  };
};

// GET /api/chat/settings/auto-reply (Admin gets auto-reply configuration)
router.get('/settings/auto-reply', authAdmin('chat'), async (req, res) => {
  try {
    const settings = await ChatSettings.findOne().lean();
    res.json(autoReplyPayload(settings || {}));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/chat/settings/auto-reply (Admin updates auto-reply settings)
// Body: { mode: 'off'|'on'|'away', messages: { sellerOn, sellerAway, guestOn, guestAway },
//         schedule: { enabled, from, to }, holiday: { enabled, name, start, end, message } }
// Older screens may still send autoReplyEnabled / awayMode / enabled / message.
router.post('/settings/auto-reply', authAdmin('chat'), async (req, res) => {
  try {
    const b = req.body || {};
    const body = { ...b };
    if (body.mode === undefined && (b.autoReplyEnabled !== undefined || b.enabled !== undefined || b.awayMode !== undefined)) {
      body.mode = b.awayMode ? 'away' : (b.autoReplyEnabled ?? b.enabled) ? 'on' : 'off';
    }
    if (!body.messages && (b.autoReplyMessage !== undefined || b.message !== undefined)) {
      body.messages = { sellerOn: b.autoReplyMessage ?? b.message };
    }
    const { fields, error } = autoReplyFields(body);
    if (error) return res.status(400).json({ message: error });

    const settings = await ChatSettings.findOneAndUpdate({}, { $set: fields }, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
    const payload = autoReplyPayload(settings);
    req.app.get('io')?.to(adminRoom('chat')).emit('chat:settings_update', payload);
    res.json({ message: 'Auto-reply settings updated successfully', settings: payload });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// The AI helpers that used to live here (message rewrite through OpenRouter, voice-to-text through
// Groq) were removed together with their API keys. Nothing in this app calls an AI service now.

// ----------------------------------------------------
// 5. MESSAGE EDIT & DELETE (ADMIN & PARTICIPANTS)
// ----------------------------------------------------

// PUT /api/chat/messages/:id (Edit a message — requires Admin or author Seller)
router.put('/messages/:id', authSellerOrAdmin, async (req, res) => {
  try {
    const text = asText(req.body?.text, 4000);
    if (!text || !text.trim()) return res.status(400).json({ message: 'Text is required to edit message' });
    if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) return res.status(404).json({ message: 'Message not found' });

    const msg = await Message.findById(req.params.id);
    if (!msg) return res.status(404).json({ message: 'Message not found' });

    // Authorization check: Admin can edit, or seller if they are the original sender
    const isAdmin = Boolean(req.admin);
    const isAuthorSeller = req.seller && msg.seller && String(msg.seller) === String(req.seller.id) && msg.sender === 'seller';
    if (!isAdmin && !isAuthorSeller) {
      return res.status(403).json({ message: 'You do not have permission to edit this message' });
    }

    msg.text = text.trim();
    msg.isEdited = true;
    msg.editedAt = new Date();
    await msg.save();

    // The inbox preview shows the latest message: only change it when this IS the latest one
    // (editing an old message must not put its text on the inbox card)
    if (msg.conversation) {
      const latest = await Message.findOne({ conversation: msg.conversation, isDeleted: { $ne: true } })
        .sort({ createdAt: -1 }).select('_id').lean();
      if (latest && String(latest._id) === String(msg._id)) {
        await Conversation.findByIdAndUpdate(msg.conversation, { lastMessage: msg.text.slice(0, 70) });
      }
    }

    // Replies quote a copy of this message's text: keep those quotes in step with the edit
    await Message.updateMany({ 'replyTo.messageId': msg._id }, { $set: { 'replyTo.text': msg.text } });

    const editPayload = {
      _id: msg._id,
      messageId: msg._id,
      conversation: msg.conversation,
      text: msg.text,
      isEdited: true,
      editedAt: msg.editedAt,
    };

    // Broadcast edit to relevant rooms
    const io = req.app.get('io');
    if (io) {
      if (msg.seller) io.to(`seller:${msg.seller}`).emit('message:edit', editPayload);
      if (msg.guestId) io.to(`guest:${msg.guestId}`).emit('message:edit', editPayload);
      if (msg.guestId) io.to(`customer:${msg.guestId}`).emit('message:edit', editPayload);
      io.to(adminRoom('chat')).emit('message:edit', editPayload);
      // (no broadcast to everyone: only the people in this conversation and the admins are told)
    }

    res.json({ message: 'Message updated successfully', msg, text: msg.text, isEdited: true, editedAt: msg.editedAt });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/chat/messages/:id (Delete a message — requires Admin or author Seller)
router.delete('/messages/:id', authSellerOrAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) return res.status(404).json({ message: 'Message not found' });
    const msg = await Message.findById(req.params.id);
    if (!msg) return res.status(404).json({ message: 'Message not found' });

    // Authorization check: Admin can delete, or seller if they are the original sender
    const isAdmin = Boolean(req.admin);
    const isAuthorSeller = req.seller && msg.seller && String(msg.seller) === String(req.seller.id) && msg.sender === 'seller';
    if (!isAdmin && !isAuthorSeller) {
      return res.status(403).json({ message: 'You do not have permission to delete this message' });
    }

    const attachmentUrl = msg.attachment;
    const wasUnseenFromSupport = (msg.sender === 'admin' || msg.sender === 'staff') && !msg.isSeen;
    const fromSellerOrGuest = ['seller', 'guest', 'customer'].includes(msg.sender);

    msg.isDeleted = true;
    msg.deletedAt = new Date();
    msg.text = '';
    msg.attachment = null;
    msg.attachmentName = '';
    msg.attachmentType = null;
    await msg.save();

    // Remove the picture / PDF from storage too (not only its link), unless another message still uses it
    if (attachmentUrl) {
      await deleteUnreferencedAttachments([attachmentUrl]);
    }

    // Replies quote a copy of this message: a deleted message's text must not live on inside them.
    // A message deleted by SUPPORT leaves no trace at all (the quote is removed from the replies);
    // a seller's / customer's own deleted message still shows "deleted" in the quote.
    if (msg.sender === 'admin' || msg.sender === 'staff') {
      await Message.updateMany({ 'replyTo.messageId': msg._id }, { $set: { replyTo: null } });
    } else {
      await Message.updateMany(
        { 'replyTo.messageId': msg._id },
        { $set: { 'replyTo.text': '🚫 This message was deleted', 'replyTo.attachmentType': null, 'replyTo.attachmentName': '' } }
      );
    }

    // If conversation lastMessage was this, update it to previous non-deleted message
    let unreadForSellerNow;
    if (msg.conversation) {
      // a deleted message that nobody had read yet no longer counts as unread (the seller's badge
      // used to stay at "1" with nothing new to read)
      if (wasUnseenFromSupport) {
        await Conversation.updateOne({ _id: msg.conversation, unreadForSeller: { $gt: 0 } }, { $inc: { unreadForSeller: -1 } });
        await Conversation.updateOne({ _id: msg.conversation, unreadForCustomer: { $gt: 0 } }, { $inc: { unreadForCustomer: -1 } });
      } else if (fromSellerOrGuest) {
        await Conversation.updateOne({ _id: msg.conversation, unreadForAdmin: { $gt: 0 } }, { $inc: { unreadForAdmin: -1 } });
      }
      const conv = await Conversation.findById(msg.conversation);
      if (conv) unreadForSellerNow = conv.unreadForSeller || 0;
      if (conv) {
        const latest = await Message.findOne({
          conversation: msg.conversation,
          isDeleted: { $ne: true },
          _id: { $ne: msg._id },
        }).sort({ createdAt: -1 }).lean();

        if (latest) {
          conv.lastMessage = (latest.text || (latest.attachmentType === 'pdf' ? `📄 ${latest.attachmentName || 'PDF Document'}` : '📷 Image Attachment')).slice(0, 70);
          conv.lastSender = latest.sender;
          conv.lastAt = latest.createdAt;
        } else {
          conv.lastMessage = '';
        }
        await conv.save();
      }
    }

    const deletePayload = {
      _id: msg._id,
      messageId: msg._id,
      conversation: msg.conversation,
      isDeleted: true,
      deletedAt: msg.deletedAt,
      text: '',
      attachment: null,
      attachmentName: '',
      attachmentType: null,
    };

    // Broadcast deletion to relevant rooms
    const io = req.app.get('io');
    if (io) {
      if (msg.seller) io.to(`seller:${msg.seller}`).emit('message:delete', { ...deletePayload, unreadForSeller: unreadForSellerNow });
      if (msg.guestId) io.to(`guest:${msg.guestId}`).emit('message:delete', deletePayload);
      if (msg.guestId) io.to(`customer:${msg.guestId}`).emit('message:delete', deletePayload);
      io.to(adminRoom('chat')).emit('message:delete', deletePayload);
      // (no broadcast to everyone: only the people in this conversation and the admins are told)
    }

    // Admin log: which admin deleted which message, and when (not the text: a deleted message stays deleted)
    if (req.admin) {
      await audit(req, 'chat_message_deleted', 'message', msg._id, {
        conversation: msg.conversation ? String(msg.conversation) : '',
        sender: msg.sender,
        sentAt: msg.createdAt,
        hadAttachment: Boolean(attachmentUrl),
      });
    }

    res.json({ message: 'Message deleted successfully', msg, isDeleted: true, deletedAt: msg.deletedAt });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ----------------------------------------------------
// 6. GUEST & PRE-LOGIN LIVE CHAT SUPPORT
// ----------------------------------------------------

// POST /api/chat/guest/thread (Guest / Pre-login gets or creates inquiry thread)
router.post('/guest/thread', guestReadLimit, async (req, res) => {
  try {
    const guestId = req.body?.guestId;
    const name = asText(req.body?.name, 80).trim();
    const email = asText(req.body?.email, 120).trim();
    const phone = asText(req.body?.phone, 40).trim();
    const subject = asText(req.body?.subject, 150).trim();
    if (!goodGuestId(guestId)) return res.status(400).json({ message: 'Guest ID is required' });

    let conv = await Conversation.findOne({ guestId, type: 'guest' });
    if (!conv) {
      conv = new Conversation({
        type: 'guest',
        isGuest: true,
        guestId,
        sellerName: name || 'Prospective Merchant / Guest',
        name: name || 'Guest User',
        email: email || '',
        phone: phone || '',
        subject: subject || 'Pre-Registration & General Inquiry',
        status: 'open',
        lastMessage: 'Live guest conversation started',
        lastAt: new Date(),
      });
      await conv.save();
    }

    const { limit, before } = req.query;
    const { messages, hasMore } = await fetchConversationMessages({ conversation: conv._id }, { limit, before });
    res.json({ conversation: conv, messages, hasMore });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/chat/guest/send (Guest sends message to admin)
router.post('/guest/send', guestSendLimit, async (req, res) => {
  try {
    const guestId = req.body?.guestId;
    const name = asText(req.body?.name, 80).trim();
    const email = asText(req.body?.email, 120).trim();
    const phone = asText(req.body?.phone, 40).trim();
    const rawAttachment = asText(req.body?.attachment, 2000);
    const attachment = isStoredUpload(rawAttachment) ? rawAttachment : null;
    const attachmentType = ['image', 'pdf'].includes(req.body?.attachmentType) ? req.body.attachmentType : null;
    const attachmentName = asText(req.body?.attachmentName, 200);
    const attachmentSize = Number(req.body?.attachmentSize) > 0 ? Number(req.body.attachmentSize) : 0;
    const cleanText = asText(req.body?.text, 4000).trim().slice(0, 2000);
    if (!cleanText && !attachment) return res.status(400).json({ message: 'Message is required' });
    if (!goodGuestId(guestId)) return res.status(400).json({ message: 'Guest ID is required' });

    let conv = await Conversation.findOne({ guestId, type: 'guest' });
    if (!conv) {
      conv = new Conversation({
        type: 'guest',
        isGuest: true,
        guestId,
        sellerName: name || 'Guest User',
        name: name || 'Guest User',
        email: email || '',
        phone: phone || '',
        subject: 'Pre-Registration & General Inquiry',
      });
    }

    if (name) conv.name = name;
    if (email) conv.email = email;
    if (phone) conv.phone = phone;

    const previewMsg = cleanText || (attachmentType === 'pdf' ? `📄 ${attachmentName || 'PDF Document'}` : '📷 Image Attachment');
    conv.lastMessage = previewMsg;
    conv.lastSender = 'guest';
    conv.lastAt = new Date();
    conv.unreadForAdmin = (conv.unreadForAdmin || 0) + 1;
    conv.status = 'open';
    await conv.save();

    const message = new Message({
      conversation: conv._id,
      guestId,
      sender: 'guest',
      senderName: name || 'Guest User',
      text: cleanText,
      attachment: attachment || null,
      attachmentType: attachmentType || (attachment?.toLowerCase().endsWith('.pdf') ? 'pdf' : attachment ? 'image' : null),
      attachmentName: attachmentName || '',
      attachmentSize: attachmentSize || 0,
    });
    await message.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`guest:${guestId}`).emit('message:new', message);
      io.to(adminRoom('chat')).emit('message:new', message);
      io.to(adminRoom('chat')).emit('chat:notification', {
        conversationId: conv._id,
        storeName: `Guest: ${name || 'Inquirer'}`,
        text: previewMsg,
      });
    }

    notify(req.app, {
      type: 'chat',
      title: `Guest Inquiry from ${name || 'Prospective Seller'}`,
      body: previewMsg.slice(0, 70),
      link: '/admin/chat',
    });

    handleAutoReply(req.app, conv);

    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/chat/guest/:guestId (Get conversation & messages for guest or customer)
router.get('/guest/:guestId', guestReadLimit, async (req, res) => {
  try {
    const { guestId } = req.params;
    if (!goodGuestId(guestId)) return res.status(400).json({ message: 'Guest ID is required' });

    let conv = await Conversation.findOne({ guestId });
    if (!conv) {
      return res.json({ conversation: null, messages: [] });
    }

    const { limit, before } = req.query;
    const { messages, hasMore } = await fetchConversationMessages({
      $or: [{ conversation: conv._id }, { guestId }],
    }, { limit, before });

    res.json({ conversation: conv, messages, hasMore });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/chat/messages/:guestId (Storefront widget messages fetch)
router.get('/messages/:guestId', guestReadLimit, async (req, res) => {
  try {
    const { guestId } = req.params;
    if (!goodGuestId(guestId)) return res.json([]);

    const { limit, before } = req.query;
    const { messages } = await fetchConversationMessages({ guestId }, { limit, before });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/chat/read/:guestId (Mark messages as read for guest)
router.post('/read/:guestId', guestReadLimit, async (req, res) => {
  try {
    const { guestId } = req.params;
    if (goodGuestId(guestId)) {
      const conv = await Conversation.findOne({ guestId });
      const now = new Date();
      if (conv) {
        conv.unreadForCustomer = 0;
        await conv.save();
      }

      await Message.updateMany(
        {
          $or: [
            { guestId },
            ...(conv ? [{ conversation: conv._id }] : []),
          ],
          sender: { $in: ['admin', 'staff'] },
          isSeen: { $ne: true },
        },
        { $set: { isSeen: true, seenAt: now, seenBy: 'guest' } }
      );

      const io = req.app.get('io');
      if (io) {
        io.to(adminRoom('chat')).emit('messages:seen', {
          conversationId: conv?._id,
          guestId,
          seenAt: now,
          seenBy: 'guest',
        });
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
