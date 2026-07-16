import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    guestId: { type: String, required: true, unique: true },
    guestNumber: { type: Number, default: null }, // sequential: Guest #1001, #1002...
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    name: { type: String, default: '' }, // real name when known (login/order)
    email: String,
    phone: String,
    orderNumber: String, // last order linked to this visitor
    lastMessage: String,
    lastAt: Date,
    unreadForAdmin: { type: Number, default: 0 },
    unreadForCustomer: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', index: true },
    guestId: { type: String, index: true },
    sender: { type: String, enum: ['customer', 'admin'], required: true },
    text: { type: String, required: true },
  },
  { timestamps: true }
);

export const Conversation = mongoose.model('Conversation', conversationSchema);
export const Message = mongoose.model('Message', messageSchema);
