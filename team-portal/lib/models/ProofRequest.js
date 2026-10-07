import mongoose from 'mongoose';

/**
 * "A PAYMENT WAS MADE, BUT ITS PROOF IS MISSING" — a request from a member (or a partner, for
 * his own sellers) to the partners. Raised from the person's own Payment Proofs group; the
 * partners see it at the top of theirs. It closes by itself when a proof of that seller is
 * completed, or when a partner answers it.
 */
const personSchema = new mongoose.Schema({ id: { type: String, default: '' }, name: { type: String, default: '' } }, { _id: false });

const proofRequestSchema = new mongoose.Schema(
  {
    requesterId: { type: String, required: true, index: true },
    requesterName: { type: String, default: '' },
    requesterRole: { type: String, default: '' }, // 'partner' | 'member'
    sellerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    storeName: { type: String, default: '' },
    amount: { type: String, default: '' }, // as the person wrote it, e.g. "₹5,000"
    paidOn: { type: Date, default: null }, // the day the seller paid, if given
    note: { type: String, default: '' },

    status: { type: String, enum: ['open', 'done', 'declined'], default: 'open', index: true },
    reply: { type: String, default: '' },
    closedBy: { type: personSchema, default: () => ({}) },
    closedAt: { type: Date, default: null },
    proofId: { type: mongoose.Schema.Types.ObjectId, default: null }, // the proof that answered it
    seenByRequester: { type: Boolean, default: true }, // false = an answer the person has not looked at yet
  },
  { timestamps: true, collection: 'portalproofrequests' }
);

export default mongoose.models.PortalProofRequest || mongoose.model('PortalProofRequest', proofRequestSchema);
