import { Router } from 'express';
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
    await Conversation.updateOne({ seller: req.seller.id, type: { $ne: 'internal' } }, { $set: { unreadForSeller: 0 } });
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

    // Broadcast edit to relevant rooms
    const io = req.app.get('io');
    if (io) {
      if (msg.seller) io.to(`seller:${msg.seller}`).emit('message:edit', msg);
      if (msg.guestId) io.to(`guest:${msg.guestId}`).emit('message:edit', msg);
      io.to('admins').emit('message:edit', msg);
    }

    res.json({ message: 'Message updated successfully', msg });
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
    msg.text = '🚫 This message was deleted by administrator.';
    msg.attachment = null;
    msg.attachmentName = '';
    await msg.save();

    // Broadcast deletion to relevant rooms
    const io = req.app.get('io');
    if (io) {
      if (msg.seller) io.to(`seller:${msg.seller}`).emit('message:delete', { _id: msg._id, conversation: msg.conversation });
      if (msg.guestId) io.to(`guest:${msg.guestId}`).emit('message:delete', { _id: msg._id, conversation: msg.conversation });
      io.to('admins').emit('message:delete', { _id: msg._id, conversation: msg.conversation });
    }

    res.json({ message: 'Message deleted successfully', msg });
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
