import mongoose from 'mongoose';

/**
 * Locked split of one real Binance movement (a seller deposit or a seller withdrawal).
 * One document per source transaction in the shared `withdrawals` collection.
 * Once written, the shares stay as they are even if the seller is later moved to
 * another member, so old history never changes by itself.
 */
const shareSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'PortalMember', required: true },
    name: { type: String, default: '' },
    role: { type: String, enum: ['partner', 'member'], required: true },
    label: { type: String, default: '' },
    pct: { type: Number, default: 0 },
    amountUSDT: { type: Number, required: true },
  },
  { _id: false }
);

const financeSplitSchema = new mongoose.Schema(
  {
    sourceId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    kind: { type: String, enum: ['deposit', 'seller_withdrawal', 'bonus'], required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    storeName: { type: String, default: '' },
    date: { type: Date, required: true },
    usdt: { type: Number, required: true },
    inr: { type: Number, default: 0 },
    pkrRate: { type: Number, default: 0 },
    previousStore: { type: Boolean, default: false },
    ownerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    ownerName: { type: String, default: '' },
    ownerRole: { type: String, default: '' },
    ownerDeal: { type: String, default: '' },
    shares: { type: [shareSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.PortalFinanceSplit ||
  mongoose.model('PortalFinanceSplit', financeSplitSchema);
