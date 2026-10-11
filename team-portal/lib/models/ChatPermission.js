import mongoose from 'mongoose';

/**
 * Permission for two MEMBERS to chat 1-on-1.
 *
 * Admin <-> anyone is always open and never needs one of these. A member <-> member chat is
 * locked until a request goes through:
 *
 *   pending_admin   the member asked; one of the two partners has to approve (with a time limit)
 *   pending_member  approved (or sent by the member's own referrer): the other member decides
 *   open            both said yes: messages can be sent until `expiresAt` (null = until closed)
 *   rejected        a partner said no
 *   declined        the other member said no
 *   cancelled       the requester took it back before it was answered
 *   closed          a partner closed it, or one of the two blocked the other
 *   expired         the time limit ran out
 *
 * The old messages stay readable after a chat closes; only sending is stopped. Talking again
 * needs a new request.
 */
const chatPermissionSchema = new mongoose.Schema(
  {
    // "personal_<idA>_<idB>" with the two ids sorted: the same id the chat messages use
    conversationId: { type: String, required: true, index: true },
    requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'PortalMember', required: true, index: true },
    requesterName: { type: String, default: '' },
    targetId: { type: mongoose.Schema.Types.ObjectId, ref: 'PortalMember', required: true, index: true },
    targetName: { type: String, default: '' },
    reason: { type: String, required: true, trim: true, maxlength: 300 },
    status: {
      type: String,
      enum: ['pending_admin', 'pending_member', 'open', 'rejected', 'declined', 'cancelled', 'closed', 'expired'],
      default: 'pending_admin',
      index: true,
    },
    // the requester is the target's referrer: the request went straight to the member
    viaReferral: { type: Boolean, default: false },
    // the partner who approved / rejected
    adminBy: { type: mongoose.Schema.Types.ObjectId, ref: 'PortalMember', default: null },
    adminName: { type: String, default: '' },
    adminAt: { type: Date, default: null },
    adminNote: { type: String, default: '' },
    // chosen by the approving partner: 1, 3 or 7 days, 0 = until a partner closes it
    durationDays: { type: Number, default: 0 },
    memberAt: { type: Date, default: null }, // when the other member accepted / declined
    openedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'PortalMember', default: null },
    closedByName: { type: String, default: '' },
    closeReason: { type: String, default: '' }, // 'admin' | 'blocked' | 'expired'
  },
  { timestamps: true }
);

chatPermissionSchema.index({ conversationId: 1, createdAt: -1 });
chatPermissionSchema.index({ status: 1, createdAt: -1 });

export default mongoose.models.PortalChatPermission || mongoose.model('PortalChatPermission', chatPermissionSchema);
