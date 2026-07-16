import mongoose from 'mongoose';

export const DISCOUNT_TYPES = ['percentage', 'fixed', 'bxgy', 'free_shipping'];

const discountSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    // empty code => automatic discount, applies whenever conditions are met
    code: { type: String, default: '', uppercase: true, trim: true },
    type: { type: String, enum: DISCOUNT_TYPES, default: 'percentage' },
    value: { type: Number, default: 0 }, // percent or fixed Rs
    buyQty: { type: Number, default: 0 }, // for bxgy
    getQty: { type: Number, default: 0 },
    scope: { type: String, enum: ['all', 'category', 'product'], default: 'all' },
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    minPurchase: { type: Number, default: 0 },
    startsAt: Date,
    endsAt: Date,
    usageLimit: { type: Number, default: 0 }, // 0 = unlimited
    usedCount: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('Discount', discountSchema);
