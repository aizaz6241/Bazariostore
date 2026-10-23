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
    // when the auto-reply last answered here (one claim per 30 minutes, so two quick messages
    // never get two auto-replies)
    lastAutoReplyAt: { type: Date, default: null },
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
    // set on the messages of one broadcast (ChatBroadcast), for its report
    broadcastId: { type: mongoose.Schema.Types.ObjectId, default: undefined, index: { sparse: true } },
    // A shortcut button sent by support (utils/chatShortcuts.js): opens a page of the seller panel,
    // one of the store's orders or one of its products. Only admins send it; the server checks it.
    action: {
      type: new mongoose.Schema(
        {
          kind: { type: String, enum: ['page', 'order', 'product'] },
          key: { type: String, default: '' }, // page key (kind 'page')
          refId: { type: String, default: '' }, // order / product id
          label: { type: String, default: '' }, // button text
          sub: { type: String, default: '' }, // small line under it
          openedAt: { type: Date, default: null }, // first time the seller tapped it (shown to support)
          amount: { type: Number, default: undefined }, // deposit card: the amount to deposit
          doneAt: { type: Date, default: null }, // the seller did what it asked (request sent, order confirmed…)
          doneText: { type: String, default: '' },
        },
        { _id: false }
      ),
      default: undefined,
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
    // the ready saved replies were added once (deleting them all later does not bring them back)
    quickRepliesSeeded: { type: Boolean, default: false },
    // the default saved replies were shown to sellers as Quick Help once (admins can change it after)
    quickHelpSeeded: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// perf: read-path indexes (non-unique, additive — no data is changed)
conversationSchema.index({ lastAt: -1 });
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ seller: 1, createdAt: -1 });
messageSchema.index({ guestId: 1, createdAt: -1 });

export const Conversation = mongoose.model('Conversation', conversationSchema);
export const Message = mongoose.model('Message', messageSchema);
export const ChatSettings = mongoose.model('ChatSettings', chatSettingsSchema);

// Saved replies of the support team (shared by all admins): a ready text, optionally with a page
// shortcut button (utils/chatShortcuts.js → SHORTCUT_PAGES).
const quickReplySchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    text: { type: String, default: '' },
    actionKey: { type: String, default: '' }, // page key, '' = no button
    // shown to sellers as a "Quick help" answer in their support chat (placeholders filled for them)
    showToSellers: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    createdBy: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true }
);
export const ChatQuickReply = mongoose.model('ChatQuickReply', quickReplySchema);

// One message (+ optional button) sent to a whole group of stores at once
const broadcastSchema = new mongoose.Schema(
  {
    segment: { type: String, default: 'all' },
    segmentLabel: { type: String, default: '' },
    text: { type: String, default: '' },
    action: { type: mongoose.Schema.Types.Mixed, default: null },
    sentTo: { type: Number, default: 0 },
    sentBy: { type: String, default: '' },
    status: { type: String, enum: ['sending', 'done'], default: 'sending' },
  },
  { timestamps: true }
);
export const ChatBroadcast = mongoose.model('ChatBroadcast', broadcastSchema);

