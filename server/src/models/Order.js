import mongoose from 'mongoose';

export const STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'refunded',
];
export const PAYMENT_STATUSES = ['pending', 'awaiting_payment', 'paid', 'failed', 'refunded'];

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    guestId: String,
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', default: null }, // for single-seller orders or primary seller
    placedBy: { type: String, enum: ['customer', 'admin', 'staff'], default: 'customer' },
    placedByAdminName: { type: String, default: '' },
    items: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller' },
        sellerName: { type: String, default: 'Seller Store' },
        name: String,
        image: String,
        size: String,
        variant: String,
        price: Number,
        costPrice: { type: Number, default: 0 },
        qty: Number,
        itemStatus: { type: String, enum: STATUSES, default: 'pending' },
        trackingNumber: { type: String, default: '' },
      },
    ],
    contact: { email: String, phone: String, newsletter: { type: Boolean, default: false } },
    shippingAddress: {
      fullName: String,
      street: String,
      apartment: String,
      city: String,
      state: String,
      postalCode: String,
      country: { type: String, default: 'Pakistan' },
    },
    shipping: {
      methodId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShippingMethod' },
      name: String,
      cost: { type: Number, default: 0 },
      eta: String,
    },
    subtotal: Number,
    discounts: [{ label: String, code: String, amount: Number }],
    discount: { type: Number, default: 0 },
    couponCode: String,
    total: Number,
    paymentMethod: { type: String, default: 'cod' }, // cod | easypaisa | jazzcash | credit_card | debit_card
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'pending' },
    payment: {
      provider: String,
      reference: String,
      status: String,
      message: String,
      walletNumber: String,
      paidAt: Date,
    },
    status: { type: String, enum: STATUSES, default: 'pending' },
    statusHistory: [{ status: String, note: String, at: { type: Date, default: Date.now }, by: String }],
    refundId: { type: mongoose.Schema.Types.ObjectId, ref: 'Refund', default: null },
    stockRestored: { type: Boolean, default: false },
    adminNotes: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('Order', orderSchema);
