import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema(
  {
    chatType: {
      type: String,
      enum: ['group', 'personal'],
      required: true,
      default: 'group',
      index: true,
    },
    // For personal chat: deterministic conversation ID (e.g. "personal_MEMBERID_ADMINID")
    conversationId: {
      type: String,
      required: true,
      index: true,
      default: 'main_group',
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PortalMember',
      required: true,
    },
    senderName: {
      type: String,
      required: true,
    },
    senderRole: {
      type: String,
      enum: ['admin', 'member'],
      required: true,
    },
    // Target member (for personal chat)
    targetMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PortalMember',
      default: null,
    },
    messageType: {
      type: String,
      enum: ['text', 'voice', 'image', 'system_bonus', 'system_alert'],
      default: 'text',
    },
    text: {
      type: String,
      default: '',
    },
    // Media attachment (voice note audio URL / base64, image URL)
    mediaUrl: {
      type: String,
      default: '',
    },
    // Duration in seconds for voice notes
    audioDuration: {
      type: Number,
      default: 0,
    },
    // System bonus metadata
    bonusMetadata: {
      amountPKR: { type: Number, default: 0 },
      reason: { type: String, default: '' },
      recipientMemberName: { type: String, default: '' },
      recipientMemberId: { type: mongoose.Schema.Types.ObjectId, ref: 'PortalMember', default: null },
    },
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PortalMember',
      },
    ],
  },
  { timestamps: true }
);

chatMessageSchema.index({ conversationId: 1, createdAt: -1 });

export default mongoose.models.PortalChatMessage || mongoose.model('PortalChatMessage', chatMessageSchema);
