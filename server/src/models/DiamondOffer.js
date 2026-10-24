import mongoose from 'mongoose';

/**
 * A Diamond upgrade offer given to ONE store (utils/diamondOffers.js):
 *   earned    — reward for good health + orders on time (e.g. $500 off for 72 hours)
 *   milestone — reward for reaching N orders (once each)
 *   festival  — a festival offer the store was told about (price comes from the settings)
 * The record keeps the timer, whether the seller has seen the popup, the reminder and the claim.
 */
const diamondOfferSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    kind: { type: String, enum: ['earned', 'milestone', 'festival'], required: true },
    key: { type: String, required: true }, // unique per store, e.g. earned:2026-10-25, milestone:m50, festival:diwali:2026-11-08
    title: { type: String, default: '' },
    discountType: { type: String, enum: ['amount', 'percent'], default: 'amount' },
    discountValue: { type: Number, default: 0 },
    regular: { type: Number, default: 0 },
    price: { type: Number, default: 0 },
    startsAt: { type: Date, default: Date.now },
    endsAt: { type: Date, required: true },
    status: { type: String, enum: ['active', 'claimed', 'expired', 'skipped'], default: 'active' },
    seenAt: { type: Date, default: null },
    remindedAt: { type: Date, default: null },
    claimedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
diamondOfferSchema.index({ seller: 1, key: 1 }, { unique: true });
diamondOfferSchema.index({ status: 1, endsAt: 1 });
diamondOfferSchema.index({ seller: 1, kind: 1, createdAt: -1 });

export default mongoose.models.DiamondOffer || mongoose.model('DiamondOffer', diamondOfferSchema);
