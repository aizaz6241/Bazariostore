import mongoose from 'mongoose';

/**
 * TWO-PERSON APPROVAL — a sensitive finance action asked for by one person and waiting for
 * another one to approve it. Nothing changes in the ledger until it is approved.
 *
 * Created by this portal and by the store admin panel (collection `portalfinanceapprovals`).
 * The action is carried out by this portal when it is approved (see lib/utils/approvals.js).
 */
const personSchema = new mongoose.Schema(
  {
    memberId: { type: String, default: '' },
    adminId: { type: String, default: '' },
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    role: { type: String, default: '' },
  },
  { _id: false }
);

const financeApprovalSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    // what the action is about (transaction id, seller id, ...): one pending request per action + target
    targetId: { type: String, default: '' },
    summary: { type: String, default: '' },
    details: { type: [String], default: [] },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    // payout only: the person the money is paid to (may confirm it themselves)
    payeeId: { type: String, default: '' },
    source: { type: String, enum: ['portal', 'admin-panel'], default: 'portal' },
    requestedBy: { type: personSchema, default: () => ({}) },
    status: { type: String, enum: ['pending', 'processing', 'approved', 'rejected', 'cancelled'], default: 'pending' },
    decidedBy: { type: personSchema, default: null },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, default: '' },
    lastError: { type: String, default: '' },
  },
  { timestamps: true, collection: 'portalfinanceapprovals', minimize: false }
);

financeApprovalSchema.index({ status: 1, createdAt: -1 });
financeApprovalSchema.index({ action: 1, targetId: 1, status: 1 });

export default mongoose.models.PortalFinanceApproval || mongoose.model('PortalFinanceApproval', financeApprovalSchema);
