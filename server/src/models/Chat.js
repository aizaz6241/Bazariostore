import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['seller', 'guest', 'customer', 'internal'], default: 'seller', index: true },
    isGuest: { type: Boolean, default: false },
    guestId: { type: String, default: '', index: true },

    // 1. Seller / Guest / Customer Support Fields
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    storeName: { type: String, default: '' },
    sellerName: { type: String, default: '' },
    sellerEmail: { type: String, default: '' },
    sellerPhone: { type: String, default: '' },
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    subject: { type: String, default: 'General Support & Inquiry' },
    status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open' },
    priority: { type: String, enum: ['normal', 'urgent', 'high'], default: 'normal' },
    unreadForAdmin: { type: Number, default: 0 },
    unreadForSeller: { type: Number, default: 0 },
    unreadForCustomer: { type: Number, default: 0 },
    assignedStaff: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    assignedStaffName: { type: String, default: '' },

    // 2. Internal Admin-to-Admin / Staff Team Fields
    adminA: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', index: true },
    adminB: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', index: true },
    adminAName: { type: String, default: '' },
    adminBName: { type: String, default: '' },
    adminAEmail: { type: String, default: '' },
    adminBEmail: { type: String, default: '' },
    adminARole: { type: String, default: '' },
    adminBRole: { type: String, default: '' },
    unreadForAdminA: { type: Number, default: 0 },
    unreadForAdminB: { type: Number, default: 0 },

    // Shared Metadata
    lastMessage: { type: String, default: '' },
    lastSender: { type: String, enum: ['seller', 'admin', 'staff', 'guest', 'customer'], default: 'seller' },
    lastSenderId: { type: mongoose.Schema.Types.ObjectId, default: null },
    lastAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', index: true, required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller' },
    guestId: { type: String, default: '' },
    sender: { type: String, enum: ['seller', 'admin', 'staff', 'guest', 'customer'], required: true },
    senderAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', index: true },
    senderName: { type: String, default: '' },
    senderRole: { type: String, default: '' },
    text: { type: String, default: '' },
    attachment: { type: String, default: null },
    attachmentType: { type: String, enum: ['image', 'pdf', 'file', null], default: null },
    attachmentName: { type: String, default: '' },
    attachmentSize: { type: Number, default: 0 },
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    isAutoReply: { type: Boolean, default: false },
    // Read receipts / Seen indicator
    isSeen: { type: Boolean, default: false },
    seenAt: { type: Date, default: null },
    seenBy: { type: String, default: '' },
    replyTo: {
      messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
      sender: { type: String, default: '' },
      senderName: { type: String, default: '' },
      text: { type: String, default: '' },
      attachmentType: { type: String, default: null },
      attachmentName: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

const chatSettingsSchema = new mongoose.Schema(
  {
    autoReplyEnabled: { type: Boolean, default: false },
    autoReplyMessage: {
      type: String,
      default: 'Assalam o Alaikum! 👋 Thanks for reaching out. We are currently away from the desk, but we have received your inquiry and our support team will respond to you shortly.',
    },
    awayMode: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Conversation = mongoose.model('Conversation', conversationSchema);
export const Message = mongoose.model('Message', messageSchema);
export const ChatSettings = mongoose.model('ChatSettings', chatSettingsSchema);

