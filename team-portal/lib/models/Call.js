import mongoose from 'mongoose';

/**
 * A team meeting (video or audio call) in the team portal.
 * Only admins start one; every active member and admin may join while it is live.
 * The audio / video itself runs on LiveKit (lib/utils/livekit.js); this record only says which
 * meeting exists, who started it, who joined and when it ended.
 */
const callSchema = new mongoose.Schema(
  {
    roomName: { type: String, required: true, unique: true }, // random, never guessable
    kind: { type: String, enum: ['video', 'audio'], default: 'video' },
    title: { type: String, default: 'Team meeting', trim: true },
    status: { type: String, enum: ['live', 'ended'], default: 'live', index: true },
    startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'PortalMember', required: true },
    startedByName: { type: String, default: '' },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    endedByName: { type: String, default: '' },
    endReason: { type: String, default: '' }, // ended by admin | everyone left
    chatMessageId: { type: mongoose.Schema.Types.ObjectId, default: null }, // the "meeting started" card in the team chat
    lastSeenAt: { type: Date, default: null }, // last time somebody was in the room
    removed: { type: [mongoose.Schema.Types.ObjectId], default: [] }, // taken out by an admin: cannot join again
    // who joined (first join time), for the record
    joined: {
      type: [
        new mongoose.Schema(
          {
            memberId: { type: mongoose.Schema.Types.ObjectId, required: true },
            name: { type: String, default: '' },
            at: { type: Date, default: Date.now },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
);

callSchema.index({ status: 1, startedAt: -1 });

export default mongoose.models.PortalCall || mongoose.model('PortalCall', callSchema, 'portalcalls');
