import mongoose from 'mongoose';

// Existing marketplace Seller schema reference
const sellerSchema = new mongoose.Schema(
  {
    storeName: { type: String, required: true },
    ownerName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, default: '' },
    storeSlug: { type: String },
    status: { type: String, default: 'active' },
    wallet: {
      balance: { type: Number, default: 0 },
      totalDeposited: { type: Number, default: 0 },
      totalWithdrawn: { type: Number, default: 0 },
      pendingDeposit: { type: Number, default: 0 },
      pendingWithdrawal: { type: Number, default: 0 },
    },
    accountHealth: {
      score: { type: Number, default: 100 },
      status: { type: String, default: 'healthy' },
    },
    totalSales: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 },
    verified: { type: Boolean, default: false },
    // Commission model label: 'inr_50' (50% INR Split) or 'pkr_1to1' (1:1 PKR Earning)
    commissionLabel: { type: String, enum: ['inr_50', 'pkr_1to1'], default: 'pkr_1to1' },
  },
  { timestamps: true, strict: false }
);

// Existing marketplace Order schema reference
const orderSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller' },
    orderNumber: { type: String },
    status: { type: String, default: 'pending' },
    fulfillmentStatus: { type: String, default: 'unfulfilled' },
    total: { type: Number, default: 0 },
    items: { type: Array, default: [] },
  },
  { timestamps: true, strict: false }
);

// Existing marketplace Withdrawal/Deposit schema reference
const withdrawalSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller' },
    storeName: { type: String },
    type: { type: String, enum: ['deposit', 'withdrawal'], default: 'withdrawal' },
    amount: { type: Number, required: true },
    status: { type: String, default: 'pending' },
    depositRef: { type: String, default: '' },
    depositNote: { type: String, default: '' },
    processedAt: { type: Date },
  },
  { timestamps: true, strict: false }
);

export const Seller = mongoose.models.Seller || mongoose.model('Seller', sellerSchema, 'sellers');
export const Order = mongoose.models.Order || mongoose.model('Order', orderSchema, 'orders');
export const Withdrawal = mongoose.models.Withdrawal || mongoose.model('Withdrawal', withdrawalSchema, 'withdrawals');
