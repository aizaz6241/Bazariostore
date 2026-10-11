import mongoose from 'mongoose';

/**
 * A member reported messages of another member to the partners. The selected messages are
 * copied in as they were at that moment, so the report still says what was written even if the
 * sender deletes them afterwards.
 */
const chatReportSchema = new mongoose.Schema(
  {
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'PortalMember', required: true, index: true },
    reporterName: { type: String, default: '' },
    reportedId: { type: mongoose.Schema.Types.ObjectId, ref: 'PortalMember', required: true },
    reportedName: { type: String, default: '' },
    conversationId: { type: String, required: true },
    note: { type: String, default: '', maxlength: 500 },
    messages: [
      {
        messageId: { type: mongoose.Schema.Types.ObjectId },
        senderId: { type: mongoose.Schema.Types.ObjectId },
        senderName: { type: String, default: '' },
        messageType: { type: String, default: 'text' },
        text: { type: String, default: '' },
        // a picture's link (when it is stored as a link); voice notes are listened to in the chat
        mediaLink: { type: String, default: '' },
        audioDuration: { type: Number, default: 0 },
        sentAt: { type: Date, default: null },
      },
    ],
    status: { type: String, enum: ['open', 'reviewed'], default: 'open', index: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'PortalMember', default: null },
    reviewedByName: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.PortalChatReport || mongoose.model('PortalChatReport', chatReportSchema);
