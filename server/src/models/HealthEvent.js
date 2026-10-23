import mongoose from 'mongoose';

/**
 * ACCOUNT HEALTH LEDGER — one line per thing that moved a store's health score (utils/healthEngine.js).
 *
 * The score is 100 + the points of the lines still active (not expired, not waived), kept
 * between 0 and 100. Every line ends by itself after its days (14–21), so a store that keeps its
 * orders on time climbs back on its own. Lines are never deleted: an expired or waived line stays
 * as history.
 *
 * Stores see every line as "Bazario Account Monitoring". Who really added it (the system or an
 * admin, with the admin's note) is kept here for the admin panel only.
 */
const healthEventSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true, index: true },
    code: { type: String, required: true }, // rule (deadline_miss, late_confirm, streak_bonus, manual …)
    points: { type: Number, required: true }, // −40 … +10
    title: { type: String, default: '' }, // shown to the store
    detail: { type: String, default: '' }, // shown to the store
    orderNumbers: { type: [String], default: undefined },
    orderId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // one line per real event: the same key is never added twice
    key: { type: String, default: undefined },
    // internal (admin panel only)
    source: { type: String, enum: ['system', 'admin'], default: 'system' },
    adminId: { type: String, default: '' },
    adminName: { type: String, default: '' },
    note: { type: String, default: '' },
    expiresAt: { type: Date, required: true, index: true },
    // perfect-week run the store had before this penalty dropped its level (given back if the
    // entry is removed after review)
    weeksBefore: { type: Number, default: undefined },
    waived: {
      at: { type: Date, default: null },
      by: { type: String, default: '' },
      byId: { type: String, default: '' },
      reason: { type: String, default: '' },
    },
  },
  { timestamps: true, collection: 'sellerhealthevents' }
);

healthEventSchema.index({ key: 1 }, { unique: true, partialFilterExpression: { key: { $type: 'string' } } });
healthEventSchema.index({ seller: 1, createdAt: -1 });

export default mongoose.model('HealthEvent', healthEventSchema);
