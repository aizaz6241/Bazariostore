import mongoose from 'mongoose';

/**
 * RESERVE POOL — money the two partners move into the reserve, or take back out of it.
 * Always half one partner's and half the other's. Every move is asked for by one partner and
 * approved by the other (see lib/utils/approvals.js). Rows are never edited or deleted.
 *
 * What the reserve PAYS (when someone is short on a seller withdrawal) is not stored here: it is
 * worked out from the ledger every time (see lib/utils/reserveSim.js).
 */
const reserveMoveSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['add', 'take'], required: true },
    // add: 'wallets' = taken from the two partners' wallets, 'pocket' = new money they brought in
    source: { type: String, enum: ['wallets', 'pocket', ''], default: '' },
    amountUSDT: { type: Number, required: true, min: 0 },
    date: { type: Date, default: Date.now, index: true },
    note: { type: String, default: '' },
    requestedBy: { type: String, default: '' },
    approvedBy: { type: String, default: '' },
  },
  { timestamps: true, collection: 'portalreservemoves' }
);

export default mongoose.models.PortalReserveMove || mongoose.model('PortalReserveMove', reserveMoveSchema);
