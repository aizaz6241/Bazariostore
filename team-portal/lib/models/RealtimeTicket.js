import mongoose from 'mongoose';

/**
 * A short-lived pass for the realtime channel (the socket server that pushes chat messages and
 * live numbers to open pages). The portal hands one to its signed-in user; the socket server
 * looks it up in this collection. Only a hash of the pass is stored, and the database removes
 * the row by itself once it has expired.
 */
const realtimeTicketSchema = new mongoose.Schema(
  {
    _id: { type: String }, // sha256 of the pass
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'PortalMember', required: true },
    role: { type: String, default: 'member' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'portalrealtimetickets', versionKey: false }
);

realtimeTicketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.PortalRealtimeTicket || mongoose.model('PortalRealtimeTicket', realtimeTicketSchema);
