import mongoose from 'mongoose';

const shippingMethodSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: String,
    cost: { type: Number, default: 0 },
    etaText: { type: String, default: '3-5 business days' },
    zones: { type: [String], default: [] }, // empty = nationwide
    freeAbove: { type: Number, default: null }, // free shipping rule: order subtotal >= freeAbove
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('ShippingMethod', shippingMethodSchema);
