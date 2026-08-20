import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', index: true },
    storeName: { type: String, default: '' },
    sellerName: { type: String, default: '' },
    sellerEmail: { type: String, default: '' },
    sellerPhone: { type: String, default: '' },
    subject: { type: String, default: 'General Support & Inquiry' },
    status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open' },
    priority: { type: String, enum: ['normal', 'urgent', 'high'], default: 'normal' },
    lastMessage: { type: String, default: '' },
    lastSender: { type: String, enum: ['seller', 'admin', 'staff'], default: 'seller' },
    lastAt: { type: Date, default: Date.now },
    unreadForAdmin: { type: Number, default: 0 },
    unreadForSeller: { type: Number, default: 0 },
    assignedStaff: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    assignedStaffName: { type: String, default: '' },
  },
  { timestamps: true }
);

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', index: true, required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller' },
    sender: { type: String, enum: ['seller', 'admin', 'staff'], required: true },
    senderName: { type: String, default: '' },
    text: { type: String, default: '' },
    attachment: { type: String, default: null },
    attachmentType: { type: String, enum: ['image', 'pdf', 'file', null], default: null },
    attachmentName: { type: String, default: '' },
    attachmentSize: { type: Number, default: 0 },
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

export const Conversation = mongoose.model('Conversation', conversationSchema);
export const Message = mongoose.model('Message', messageSchema);
