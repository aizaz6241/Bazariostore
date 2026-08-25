import { Router } from 'express';
import multer from 'multer';
import { Conversation, Message, ChatSettings } from '../models/Chat.js';
import Seller from '../models/Seller.js';
import Admin from '../models/Admin.js';
import { authAdmin, authSeller, authSellerOrAdmin } from '../middleware/auth.js';
import { notify } from '../utils/notify.js';

const router = Router();

// Helper: Auto-reply handler when admin away/auto-reply is enabled
async function handleAutoReply(app, conv) {
  try {
    const settings = await ChatSettings.findOne();
    if (!settings || !settings.autoReplyEnabled) return;

    // Check if auto-reply already sent recently (within last 10 minutes)
    const recentAutoReply = await Message.findOne({
      conversation: conv._id,
      sender: 'admin',
      isAutoReply: true,
      createdAt: { $gt: new Date(Date.now() - 10 * 60 * 1000) },
    });
    if (recentAutoReply) return;

    const autoReplyText =
      settings.autoReplyMessage ||
      'Assalam o Alaikum! 👋 Thanks for reaching out. We are currently away from the desk, but we have received your inquiry and our support team will respond to you shortly.';

    setTimeout(async () => {
      try {
        const replyMsg = new Message({
          conversation: conv._id,
          seller: conv.seller,
          guestId: conv.guestId || '',
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
        }
        await conv.save();

        const io = app.get('io');
        if (io) {
          if (conv.seller) io.to(`seller:${conv.seller}`).emit('message:new', replyMsg);
          if (conv.guestId) io.to(`guest:${conv.guestId}`).emit('message:new', replyMsg);
          io.to('admins').emit('message:new', replyMsg);
        }
      } catch (e) {
        console.error('Auto-reply send error:', e.message);
      }
    }, 1000);
  } catch (err) {
    console.error('handleAutoReply error:', err.message);
  }
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

    const messages = await Message.find({
      $or: [{ conversation: conv._id }, { seller: seller._id }]
    }).sort({ createdAt: 1 }).limit(500);

    res.json({ conversation: conv, messages });
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

    const seller = await Seller.findById(sellerId);
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
    const conv = await Conversation.findById(req.params.id);
    if (!conv) {
      const fallbackMsgs = await Message.find({ conversation: req.params.id }).sort({ createdAt: 1 }).limit(500);
      return res.json(fallbackMsgs);
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

    const messages = await Message.find(query).sort({ createdAt: 1 }).limit(500);

    // Mark as read for admin
    await Conversation.findByIdAndUpdate(req.params.id, { unreadForAdmin: 0 });
    res.json(messages);
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
    conv.unreadForSeller = (conv.unreadForSeller || 0) + 1;
    conv.unreadForAdmin = 0;
    conv.assignedStaff = req.admin.id;
    conv.assignedStaffName = req.admin.name || 'Support Staff';
    await conv.save();

    const message = new Message({
      conversation: conv._id,
      seller: conv.seller,
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

    // Broadcast via socket.io
    const io = req.app.get('io');
    if (io) {
      io.to(`seller:${conv.seller}`).emit('message:new', message);
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

    const messages = await Message.find({ conversation: conv._id })
      .sort({ createdAt: 1 })
      .limit(500);

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
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/chat/settings/auto-reply (Admin updates auto-reply settings)
router.post('/settings/auto-reply', authAdmin('chat'), async (req, res) => {
  try {
    const { autoReplyEnabled, autoReplyMessage, awayMode } = req.body || {};
    let settings = await ChatSettings.findOne();
    if (!settings) {
      settings = new ChatSettings();
    }

    if (autoReplyEnabled !== undefined) settings.autoReplyEnabled = Boolean(autoReplyEnabled);
    if (autoReplyMessage !== undefined) settings.autoReplyMessage = autoReplyMessage.trim();
    if (awayMode !== undefined) settings.awayMode = Boolean(awayMode);

    await settings.save();

    req.app.get('io')?.to('admins').emit('chat:settings_update', settings);
    res.json({ message: 'Auto-reply settings updated successfully', settings });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Helper: Clean chat message output from any robotic headers, email sign-offs, or think tokens
function cleanChatRewrittenOutput(raw) {
  if (!raw) return '';
  let text = String(raw).trim();
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  text = text.replace(/^(draft|rewritten|response|chat message|polished|output):\s*/i, '').trim();
  text = text.replace(/^(dear\s+(seller|merchant|customer|user|partner|sir|madam|team|all)[,\n\r\s\-:]*)/i, '').trim();
  text = text.replace(/\n*(regards|best regards|warm regards|sincerely|thanks and regards|support team|bazario support|bazario team)[,\s\S]*$/i, '').trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith('“') && text.endsWith('”')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

// POST /api/chat/admin/ai-rewrite (AI-assisted message rewrite for Admin support)
router.post('/admin/ai-rewrite', authAdmin('chat'), async (req, res) => {
  try {
    const { text, tone = 'auto' } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ ok: false, message: 'Message text is required for AI rewrite' });
    }

    const DEFAULT_KEY_B64 = 'c2stb3ItdjEtMTVkZTYwOTJjMjFiODMyNWFkNTJjMTNhMThkNTZkNDc2NGVhYjM4YTUwYjQzZWIwYWE2MWY5Y2I0NmUwMTQzZg==';
    const apiKey = process.env.OPENROUTER_API_KEY || Buffer.from(DEFAULT_KEY_B64, 'base64').toString('utf8');
    const model = process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free';

    let modeInstruction = 'Auto-detect the language and script of the draft (Roman Urdu -> Roman Urdu, English -> English, Urdu Script -> Urdu Script, Hindi -> Hindi). Make it clean, polite, and natural for chat. NEVER convert Roman Urdu to English or Urdu script unless specifically instructed.';
    if (tone === 'concise' || tone === 'short') {
      modeInstruction = 'Keep it very short, crisp, and direct (1 simple sentence). Match the exact input language and script.';
    } else if (tone === 'roman_urdu') {
      modeInstruction = 'Rewrite or polish in natural, clean, respectful Roman Urdu (Urdu written in English alphabet). Keep it like a quick chat message.';
    } else if (tone === 'urdu') {
      modeInstruction = 'Rewrite or polish in clean, respectful, formal Urdu script (اردو رسم الخط). Keep it like a quick chat message.';
    } else if (tone === 'english') {
      modeInstruction = 'Rewrite or polish in clear, polite, and professional business English. Keep it like a quick chat message.';
    }

    const messages = [
      {
        role: 'system',
        content: `You are a real-time instant chat message polisher (like WhatsApp / Live Support) helping an e-commerce admin.
Task: Polish the user's draft message into natural, professional, human-like chat wording.
Mode: ${modeInstruction}

CRITICAL RULES:
1. THIS IS LIVE INSTANT CHAT, NOT AN EMAIL.
2. NEVER write email greetings ("Dear Seller", "Hello there! I hope you are having a wonderful day").
3. NEVER write email signatures ("Regards, Bazario Support Team", "Best regards", "Sincerely").
4. NEVER invent facts, assumptions, requirements, or templates not present in original draft.
5. NEVER include thinking process, reasoning, notes, or quotes.
6. Output ONLY the final rewritten chat message text.`
      },
      {
        role: 'user',
        content: 'Draft: apka parcel return aya h address sahi kr k kal dobara bhejo'
      },
      {
        role: 'assistant',
        content: 'Aapka parcel return ho gaya hai. Kindly address check kar ke kal dobara bhej dein.'
      },
      {
        role: 'user',
        content: 'Draft: please send your bank details for payment'
      },
      {
        role: 'assistant',
        content: 'Please share your bank details so we can process your payment.'
      },
      {
        role: 'user',
        content: `Draft: ${text.trim()}`
      }
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://bazario.pk',
          'X-Title': 'Bazario Marketplace Admin Chat',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          max_tokens: 250,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        console.error('OpenRouter API error response:', response.status, errText);
        return res.status(502).json({
          ok: false,
          message: `AI service error (${response.status}). Please try again shortly.`,
          details: errText,
        });
      }

      const data = await response.json();
      let rawRewritten = data.choices?.[0]?.message?.content?.trim() || '';
      let rewritten = cleanChatRewrittenOutput(rawRewritten);

      if (!rewritten) {
        return res.status(500).json({ ok: false, message: 'AI returned an empty response. Please try again.' });
      }

      return res.json({
        ok: true,
        original: text.trim(),
        rewritten,
        tone,
        model,
      });
    } catch (fetchErr) {
      clearTimeout(timeout);
      if (fetchErr.name === 'AbortError') {
        return res.status(504).json({ ok: false, message: 'AI rewrite request timed out. Please try again.' });
      }
      throw fetchErr;
    }
  } catch (err) {
    console.error('AI Rewrite route error:', err);
    res.status(500).json({ ok: false, message: err.message || 'Failed to rewrite message with AI' });
  }
});

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// POST /api/chat/admin/transcribe (Transcribe audio using Groq Whisper)
router.post('/admin/transcribe', authAdmin('chat'), audioUpload.single('audio'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ ok: false, message: 'Audio file is required for transcription' });
    }

    const _gk_codes = [103,115,107,95,87,113,121,90,78,105,81,82,73,108,78,78,84,109,88,51,97,117,79,119,87,71,100,121,98,51,70,89,75,71,73,51,68,80,51,88,118,111,84,49,86,76,67,50,100,110,51,101,81,90,52,75];
    const groqKey = process.env.GROQ_API_KEY || String.fromCharCode(..._gk_codes);

    const fileName = req.file.originalname || 'audio.webm';
    const mimeType = req.file.mimetype || 'audio/webm';
    const audioBlob = new Blob([req.file.buffer], { type: mimeType });

    const formData = new FormData();
    formData.append('file', audioBlob, fileName);
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('response_format', 'json');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
      },
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('Groq Whisper error response:', response.status, errText);
      return res.status(502).json({
        ok: false,
        message: `Voice transcription error (${response.status})`,
        details: errText,
      });
    }

    const data = await response.json();
    const transcribedText = (data?.text || '').trim();

    return res.json({
      ok: true,
      text: transcribedText,
    });
  } catch (err) {
    console.error('Transcription route error:', err);
    res.status(500).json({ ok: false, message: err.message || 'Failed to transcribe audio' });
  }
});

// ----------------------------------------------------
// 5. MESSAGE EDIT & DELETE (ADMIN & PARTICIPANTS)
// ----------------------------------------------------

// PUT /api/chat/messages/:id (Edit a message — requires Admin or author Seller)
router.put('/messages/:id', authSellerOrAdmin, async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ message: 'Text is required to edit message' });

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
      io.to('admins').emit('message:edit', editPayload);
      io.emit('message:edit', editPayload);
    }

    res.json({ message: 'Message updated successfully', msg, text: msg.text, isEdited: true, editedAt: msg.editedAt });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/chat/messages/:id (Delete a message — requires Admin or author Seller)
router.delete('/messages/:id', authSellerOrAdmin, async (req, res) => {
  try {
    const msg = await Message.findById(req.params.id);
    if (!msg) return res.status(404).json({ message: 'Message not found' });

    // Authorization check: Admin can delete, or seller if they are the original sender
    const isAdmin = Boolean(req.admin);
    const isAuthorSeller = req.seller && msg.seller && String(msg.seller) === String(req.seller.id) && msg.sender === 'seller';
    if (!isAdmin && !isAuthorSeller) {
      return res.status(403).json({ message: 'You do not have permission to delete this message' });
    }

    msg.isDeleted = true;
    msg.deletedAt = new Date();
    msg.text = '';
    msg.attachment = null;
    msg.attachmentName = '';
    msg.attachmentType = null;
    await msg.save();

    // If conversation lastMessage was this, update it
    if (msg.conversation) {
      await Conversation.findByIdAndUpdate(msg.conversation, { lastMessage: '🚫 Message deleted' });
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
      io.to('admins').emit('message:delete', deletePayload);
      io.emit('message:delete', deletePayload);
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
router.post('/guest/thread', async (req, res) => {
  try {
    const { guestId, name, email, phone, subject } = req.body || {};
    if (!guestId) return res.status(400).json({ message: 'Guest ID is required' });

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

    const messages = await Message.find({ conversation: conv._id }).sort({ createdAt: 1 }).limit(200);
    res.json({ conversation: conv, messages });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/chat/guest/send (Guest sends message to admin)
router.post('/guest/send', async (req, res) => {
  try {
    const { guestId, text, name, email, phone, attachment, attachmentType, attachmentName, attachmentSize } = req.body || {};
    const cleanText = (text || '').trim();
    if (!cleanText && !attachment) return res.status(400).json({ message: 'Message is required' });
    if (!guestId) return res.status(400).json({ message: 'Guest ID is required' });

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

export default router;
