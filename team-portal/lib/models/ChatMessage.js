import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema(
  {
    chatType: {
      type: String,
      enum: ['group', 'personal', 'materials'],
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
    // A picture saved on the file storage (UploadThing): its link, and the key needed to delete
    // it there. When this is set, `mediaUrl` is empty.
    mediaLink: {
      type: String,
      default: '',
    },
    mediaKey: {
      type: String,
      default: '',
    },
    // A long voice note (sent in pieces): what it is and how large. Its `mediaLink` is either a
    // file-storage link, or /api/chat/audio/<id> when the recording is kept in the database.
    mediaMime: {
      type: String,
      default: '',
    },
    mediaSize: {
      type: Number,
      default: 0,
    },
    // Duration in seconds for voice notes
    audioDuration: {
      type: Number,
      default: 0,
    },
    // Edit & Delete Tracking (WhatsApp Style)
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PortalMember',
      default: null,
    },
    // System bonus metadata
    bonusMetadata: {
      amountPKR: { type: Number, default: 0 },
      reason: { type: String, default: '' },
      recipientMemberName: { type: String, default: '' },
      recipientMemberId: { type: mongoose.Schema.Types.ObjectId, ref: 'PortalMember', default: null },
    },
    // Seen / Read By list (populated with member info for Messenger-style floating bubbles)
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
chatMessageSchema.index({ conversationId: 1, updatedAt: -1 }); // fast "did anything change?" check for chat polling
chatMessageSchema.index({ updatedAt: -1 }); // "what changed just now, in any chat" (realtime channel on the store server)

export default mongoose.models.PortalChatMessage || mongoose.model('PortalChatMessage', chatMessageSchema);
