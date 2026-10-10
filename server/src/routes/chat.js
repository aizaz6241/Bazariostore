import { Router } from 'express';
import mongoose from 'mongoose';
import { Conversation, Message, ChatSettings } from '../models/Chat.js';
import Seller from '../models/Seller.js';
import Admin from '../models/Admin.js';
import { authAdmin, authSeller, authSellerOrAdmin } from '../middleware/auth.js';
import { notify } from '../utils/notify.js';
import { sendPush } from '../utils/push.js';
import { audit } from '../utils/audit.js';
import { deleteAttachmentFiles, attachmentLocation } from '../services/uploads.js';
import { asText } from '../middleware/sanitize.js';
import { limit } from '../utils/rateLimit.js';

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
    const settings = await ChatSettings.findOne();
    if (!settings) return;

    // Check if auto-reply is enabled or away mode is on
    const isAutoReplyOn = Boolean(settings.autoReplyEnabled || settings.awayMode);
    if (!isAutoReplyOn) return;

    // Prevent spam: Check if auto-reply already sent recently to this conversation (within last 3 minutes)
    const recentAutoReply = await Message.findOne({
      conversation: conv._id,
      sender: 'admin',
      isAutoReply: true,
      createdAt: { $gt: new Date(Date.now() - 3 * 60 * 1000) },
    });
    if (recentAutoReply) return;

    const autoReplyText =
      settings.autoReplyMessage ||
      'Assalam o Alaikum! 👋 Thanks for reaching out. We are currently away from the desk, but we have received your inquiry and our support team will respond to you shortly.';

    // Fast, realistic response (400ms)
    setTimeout(async () => {
      try {
        const sId = conv.seller?._id ? conv.seller._id.toString() : (conv.seller ? conv.seller.toString() : null);
        const gId = conv.guestId || '';

        const replyMsg = new Message({
          conversation: conv._id,
          seller: sId,
          guestId: gId,
          sender: 'admin',
          senderName: '🤖 Bazario Support Assistant (Auto-Reply)',
          text: autoReplyText,
          isAutoReply: true,
        });
        await replyMsg.save();

        conv.lastMessage = `🤖 ${autoReplyText.slice(0, 50)}...`;
        conv.lastSender = 'admin';
        conv.lastAt = new Date();
        if (conv.type === 'seller') {
          conv.unreadForSeller = (conv.unreadForSeller || 0) + 1;
        } else {
          conv.unreadForCustomer = (conv.unreadForCustomer || 0) + 1;
        }
        await conv.save();

        const io = app.get('io');
        if (io) {
          if (sId) {
            io.to(`seller:${sId}`).emit('message:new', replyMsg);
          }
          if (gId) {
            io.to(`guest:${gId}`).emit('message:new', replyMsg);
            io.to(`customer:${gId}`).emit('message:new', replyMsg);
          }
          io.to('admins').emit('message:new', replyMsg);
          io.to('admins').emit('chat:notification', {
            conversationId: conv._id,
            storeName: conv.storeName || conv.name || 'Merchant/Guest',
            text: `🤖 Auto-Reply: ${autoReplyText.slice(0, 50)}`,
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
    const seller = await Seller.findById(sellerId).select('-kycDocuments');
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

    // Mark admin messages as seen by seller
    const now = new Date();
    const seenRes = await Message.updateMany(
      {
        $or: [{ conversation: conv._id }, { seller: seller._id }],
        sender: { $in: ['admin', 'staff'] },
        isSeen: { $ne: true },
      },
      { $set: { isSeen: true, seenAt: now, seenBy: 'seller' } }
    );

    if (conv.unreadForSeller > 0 || seenRes.modifiedCount > 0) {
      conv.unreadForSeller = 0;
      await conv.save();
      const io = req.app.get('io');
      if (io) {
        io.to('admins').emit('messages:seen', {
          conversationId: conv._id,
          sellerId: seller._id,
          seenAt: now,
        });
      }
    }

    const { limit, before } = req.query;
    const { messages, hasMore } = await fetchConversationMessages(
      { $or: [{ conversation: conv._id }, { seller: seller._id }] },
      { limit, before }
    );

    res.json({ conversation: conv, messages, hasMore });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/chat/seller/send (Seller sends message to admin)
router.post('/seller/send', authSeller, async (req, res) => {
  try {
    const sellerId = req.seller.id;
    const { text, attachment, attachmentType, attachmentName, attachmentSize, replyTo } = req.body;
    const cleanText = (text || '').trim();
    if (!cleanText && !attachment) return res.status(400).json({ message: 'Message or attachment is required' });

    const seller = await Seller.findById(sellerId).select('-kycDocuments');
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    let conv = await Conversation.findOne({ seller: sellerId, type: { $ne: 'internal' } });
    if (!conv) {
      conv = new Conversation({
        type: 'seller',
        seller: seller._id,
        storeName: seller.storeName,
        sellerName: seller.ownerName,
        sellerEmail: seller.email,
        sellerPhone: seller.phone || '',
        subject: 'General Seller Support & Operations',
      });
    }

    const previewMsg = cleanText || (attachmentType === 'pdf' ? `📄 ${attachmentName || 'PDF Document'}` : '📷 Image Attachment');
    conv.lastMessage = previewMsg;
    conv.lastSender = 'seller';
    conv.lastAt = new Date();
    conv.unreadForAdmin = (conv.unreadForAdmin || 0) + 1;
    conv.status = 'open';
    await conv.save();

    const message = new Message({
      conversation: conv._id,
      seller: seller._id,
      sender: 'seller',
      senderName: seller.storeName || seller.ownerName,
      text: cleanText,
      attachment: attachment || null,
      attachmentType: attachmentType || (attachment?.toLowerCase().endsWith('.pdf') ? 'pdf' : attachment ? 'image' : null),
      attachmentName: attachmentName || '',
      attachmentSize: attachmentSize || 0,
      replyTo: replyTo && (replyTo.text || replyTo?.attachmentName) ? {
        messageId: replyTo.messageId || replyTo._id || null,
        sender: replyTo.sender || '',
        senderName: replyTo.senderName || '',
        text: replyTo.text || '',
        attachmentType: replyTo.attachmentType || null,
        attachmentName: replyTo.attachmentName || '',
      } : null,
    });
    await message.save();

    // Phone push to the admins: new seller support message
    sendPush({
      to: 'admin',
      title: `💬 ${seller.storeName || seller.ownerName || 'Seller'} (Seller Support)`,
      body: cleanText ? cleanText.slice(0, 140) : (attachment ? '📎 Sent an attachment' : 'New message'),
      url: `/admin/chat?c=${conv._id}`,
      tag: `chat-${conv._id}`,
    });

    // Broadcast via socket.io
    const io = req.app.get('io');
    if (io) {
      io.to(`seller:${sellerId}`).emit('message:new', message);
      io.to('admins').emit('message:new', message);
      io.to('admins').emit('chat:notification', {
        conversationId: conv._id,
        storeName: seller.storeName,
        text: previewMsg,
      });
    }

    notify(req.app, {
      type: 'chat',
      title: `Message from ${seller.storeName}`,
      body: previewMsg.slice(0, 70),
      link: '/admin/chat',
    });

    // Handle Auto-Reply if enabled
    handleAutoReply(req.app, conv);

    res.status(201).json(message);
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
        io.to('admins').emit('messages:seen', {
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
    const allConvos = await Conversation.find({ type: { $ne: 'internal' } })
      .populate('seller', 'storeName ownerName email phone rating')
      .populate('assignedStaff', 'name email title')
      .sort({ lastAt: -1 });

    // Group by seller id to merge duplicate conversation records in DB
    const sellerMap = new Map();
    const cleanList = [];

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

    const { messages, hasMore } = await fetchConversationMessages(query, { limit, before });

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
    const cleanText = (text || '').trim();
    if (!cleanText && !attachment) return res.status(400).json({ message: 'Message or attachment is required' });

    const conv = await Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });

    const previewMsg = cleanText || (attachmentType === 'pdf' ? `📄 ${attachmentName || 'PDF Document'}` : '📷 Image Attachment');
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
    });
    await message.save();

    // Phone push to the seller: reply from support
    if (conv.seller) {
      sendPush({
        to: 'seller',
        sellerId: conv.seller,
        title: '💬 Bazario Support',
        body: cleanText ? cleanText.slice(0, 140) : (message.attachment ? '📎 Sent an attachment' : 'New message'),
        url: '/seller/support',
        tag: `chat-${conv._id}`,
      });
    }

    // Broadcast via socket.io
    const io = req.app.get('io');
    if (io) {
      if (conv.seller) {
        io.to(`seller:${conv.seller}`).emit('message:new', message);
      }
      if (conv.guestId) {
        io.to(`guest:${conv.guestId}`).emit('message:new', message);
        io.to(`customer:${conv.guestId}`).emit('message:new', message);
      }
      io.to(`conversation:${conv._id}`).emit('message:new', message);
      io.to('admins').emit('message:new', message);
    }

    res.status(201).json(message);
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
      io.to('admins').emit('chat:cleared', payload);
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

// GET /api/chat/settings/auto-reply (Admin gets auto-reply configuration)
router.get('/settings/auto-reply', authAdmin('chat'), async (req, res) => {
  try {
    let settings = await ChatSettings.findOne();
    if (!settings) {
      settings = await ChatSettings.create({
        autoReplyEnabled: false,
        autoReplyMessage:
          'Assalam o Alaikum! 👋 Thanks for reaching out. We are currently away from the desk, but we have received your inquiry and our support team will respond to you shortly.',
        awayMode: false,
      });
    }
    const data = settings.toObject();
    // Return backward-compatible field names
    res.json({
      ...data,
      enabled: Boolean(data.autoReplyEnabled),
      message: data.autoReplyMessage,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/chat/settings/auto-reply (Admin updates auto-reply settings)
router.post('/settings/auto-reply', authAdmin('chat'), async (req, res) => {
  try {
    const { autoReplyEnabled, autoReplyMessage, awayMode, enabled, message } = req.body || {};
    let settings = await ChatSettings.findOne();
    if (!settings) {
      settings = new ChatSettings();
    }

    const targetEnabled = autoReplyEnabled !== undefined ? autoReplyEnabled : enabled;
    const targetMessage = autoReplyMessage !== undefined ? autoReplyMessage : message;

    if (targetEnabled !== undefined) settings.autoReplyEnabled = Boolean(targetEnabled);
    if (targetMessage !== undefined) settings.autoReplyMessage = String(targetMessage).trim();
    if (awayMode !== undefined) settings.awayMode = Boolean(awayMode);

    await settings.save();

    const data = settings.toObject();
    const payload = {
      ...data,
      enabled: Boolean(data.autoReplyEnabled),
      message: data.autoReplyMessage,
    };

    req.app.get('io')?.to('admins').emit('chat:settings_update', payload);
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

    // If conversation lastMessage was this, update it
    if (msg.conversation) {
      await Conversation.findByIdAndUpdate(msg.conversation, { lastMessage: msg.text.slice(0, 70) });
    }

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
      io.to('admins').emit('message:edit', editPayload);
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

    // If conversation lastMessage was this, update it to previous non-deleted message
    if (msg.conversation) {
      const conv = await Conversation.findById(msg.conversation);
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
      if (msg.seller) io.to(`seller:${msg.seller}`).emit('message:delete', deletePayload);
      if (msg.guestId) io.to(`guest:${msg.guestId}`).emit('message:delete', deletePayload);
      if (msg.guestId) io.to(`customer:${msg.guestId}`).emit('message:delete', deletePayload);
      io.to('admins').emit('message:delete', deletePayload);
      // (no broadcast to everyone: only the people in this conversation and the admins are told)
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
    const attachment = asText(req.body?.attachment, 2000) || null;
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
      io.to('admins').emit('message:new', message);
      io.to('admins').emit('chat:notification', {
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
        io.to('admins').emit('messages:seen', {
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
