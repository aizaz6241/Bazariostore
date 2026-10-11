import mongoose from 'mongoose';

/**
 * A member blocked another member: the blocked one can no longer send him a chat request, and
 * any open chat between them is closed. The partners are told (they see it in "Member chats").
 * Only the one who blocked can unblock.
 */
const chatBlockSchema = new mongoose.Schema(
  {
    blockerId: { type: mongoose.Schema.Types.ObjectId, ref: 'PortalMember', required: true },
    blockerName: { type: String, default: '' },
    blockedId: { type: mongoose.Schema.Types.ObjectId, ref: 'PortalMember', required: true },
    blockedName: { type: String, default: '' },
  },
  { timestamps: true }
);

chatBlockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });
chatBlockSchema.index({ blockedId: 1 });

export default mongoose.models.PortalChatBlock || mongoose.model('PortalChatBlock', chatBlockSchema);
