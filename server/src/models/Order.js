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
        // Processing Fund & 20% Profit Settlement tracking
        processingLocked: { type: Boolean, default: false },
        lockedAmount: { type: Number, default: 0 },
        profitRate: { type: Number, default: 20 }, // 20% profit margin
        profitAmount: { type: Number, default: 0 },
        payoutSettled: { type: Boolean, default: false },
        settledAt: { type: Date, default: null },
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
      country: { type: String, default: 'United States' },
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
    warning24hSent: { type: Boolean, default: false },
    penalty48hApplied: { type: Boolean, default: false },
  },
  { timestamps: true }
);

orderSchema.pre('save', async function (next) {
  try {
    if (this.items && this.items.length > 0) {
      for (const it of this.items) {
        if (!it.seller && it.product) {
          const prod = await mongoose.model('Product').findById(it.product).populate('seller');
          if (prod) {
            it.seller = prod.seller?._id || prod.seller || null;
            it.sellerName = prod.seller?.storeName || prod.sellerName || 'Verified Store';
            if (!it.costPrice && it.price) it.costPrice = Math.round(it.price * 0.8);
          }
        }
      }
      if (!this.seller && this.items[0]?.seller) {
        this.seller = this.items[0].seller;
      }
    }
  } catch (err) {
    console.error('order pre-save seller auto-resolve error:', err.message);
  }
  next();
});

export default mongoose.model('Order', orderSchema);
