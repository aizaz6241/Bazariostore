import mongoose from 'mongoose';

/**
 * FINANCE ACTIVITY LOG — one line for every action that touches money or who it belongs to.
 *
 * Written by this portal and by the store admin panel (same database, collection
 * `portalfinancelogs`). It is append-only: there is no screen, route or function that edits or
 * removes a line, and the model itself refuses updates and deletes.
 *
 * `before` / `after` hold the values that changed, so an edited amount can always be traced back.
 */
const financeLogSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    source: { type: String, enum: ['portal', 'admin-panel'], default: 'portal' },
    actor: {
      memberId: { type: String, default: '' }, // team portal member id
      adminId: { type: String, default: '' }, // store admin panel id
      name: { type: String, default: '' },
      email: { type: String, default: '' },
      role: { type: String, default: '' },
    },
    action: { type: String, required: true },
    summary: { type: String, default: '' },
    entity: { type: String, default: '' },
    entityId: { type: String, default: '' },
    sellerId: { type: String, default: '' },
    storeName: { type: String, default: '' },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
    // false until the alert (push / Telegram) for this line has been sent
    pushed: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'portalfinancelogs', minimize: false }
);

financeLogSchema.index({ at: -1 });
financeLogSchema.index({ pushed: 1, at: 1 });

// Append-only: any attempt to change or remove a line through the model fails.
const refuse = function (next) {
  next(new Error('The finance log is append-only'));
};
['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) => {
  financeLogSchema.pre(op, refuse);
});
financeLogSchema.pre('deleteOne', { document: true, query: false }, refuse);
financeLogSchema.pre('save', function (next) {
  if (!this.isNew) return next(new Error('The finance log is append-only'));
  next();
});

export default mongoose.models.PortalFinanceLog || mongoose.model('PortalFinanceLog', financeLogSchema);
