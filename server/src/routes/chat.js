import { Router } from 'express';
import { Conversation, Message } from '../models/Chat.js';
import Seller from '../models/Seller.js';
import { authAdmin, authSeller } from '../middleware/auth.js';
import { notify } from '../utils/notify.js';

const router = Router();

// ----------------------------------------------------
// 1. SELLER SUPPORT CHAT ENDPOINTS
// ----------------------------------------------------

// GET /api/chat/seller/thread (Get or create conversation for current seller)
router.get('/seller/thread', authSeller, async (req, res) => {
  try {
    const sellerId = req.seller.id;
    const seller = await Seller.findById(sellerId);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    let conv = await Conversation.findOne({ seller: sellerId }).sort({ lastAt: -1 });
    if (!conv) {
      conv = new Conversation({
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

    let conv = await Conversation.findOne({ seller: sellerId });
    if (!conv) {
      conv = new Conversation({
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
      replyTo: replyTo && replyTo.text || replyTo?.attachmentName ? {
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

    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/chat/seller/read (Seller marks messages as read)
router.post('/seller/read', authSeller, async (req, res) => {
  try {
    await Conversation.updateOne({ seller: req.seller.id }, { $set: { unreadForSeller: 0 } });
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
    const allConvos = await Conversation.find()
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

export default router;
