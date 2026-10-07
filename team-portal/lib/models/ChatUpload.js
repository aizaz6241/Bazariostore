import mongoose from 'mongoose';

/**
 * ONE PIECE OF A LONG VOICE NOTE.
 *
 * The hosting accepts only a few MB per request, so a long recording is sent in pieces. Each
 * piece is one document here. When the message is sent the pieces either move to the file
 * storage (and are removed from here), or stay here and are played straight from here
 * (`messageId` set) by /api/chat/audio/[id].
 */
const chatUploadSchema = new mongoose.Schema(
  {
    uploadId: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    index: { type: Number, required: true },
    size: { type: Number, default: 0 },
    data: { type: Buffer, required: true },
    // the chat message these pieces belong to (null while the upload is still going on)
    messageId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  },
  { timestamps: true, collection: 'portalchatuploads' }
);

chatUploadSchema.index({ uploadId: 1, index: 1 }, { unique: true });

export default mongoose.models.PortalChatUpload || mongoose.model('PortalChatUpload', chatUploadSchema);
