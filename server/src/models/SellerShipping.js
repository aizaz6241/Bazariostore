import mongoose from 'mongoose';

const sellerShippingSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    cost: { type: Number, required: true, min: 0 },
    freeAbove: { type: Number, default: null }, // free shipping if order >= this amount
    eta: { type: String, default: '' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('SellerShipping', sellerShippingSchema);
