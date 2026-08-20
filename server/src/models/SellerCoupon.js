import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    type: { type: String, enum: ['percentage', 'flat'], required: true },
    value: { type: Number, required: true, min: 1 },
    minOrder: { type: Number, default: 0 },
    maxUses: { type: Number, default: null },
    usedCount: { type: Number, default: 0 },
    expiresAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Unique per seller
couponSchema.index({ seller: 1, code: 1 }, { unique: true });

export default mongoose.model('SellerCoupon', couponSchema);
