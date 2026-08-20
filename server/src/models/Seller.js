import mongoose from 'mongoose';

const sellerSchema = new mongoose.Schema(
  {
    storeName: { type: String, required: true, trim: true },
    ownerName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    phone: { type: String, default: '' },
    storeSlug: { type: String, unique: true, index: true },
    logo: { type: String, default: '' },
    banner: { type: String, default: '' },
    description: { type: String, default: '' },
    address: {
      street: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      postalCode: { type: String, default: '' },
      country: { type: String, default: '' },
    },
    // Indian UPI & Bank payout details
    payoutDetails: {
      upiId: { type: String, default: '' },
      accountTitle: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      bankName: { type: String, default: '' },
      ifscCode: { type: String, default: '' },
      preferredMethod: { type: String, enum: ['upi', 'bank', ''], default: '' },
    },
    // Legacy field
    bankDetails: {
      accountTitle: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      bankName: { type: String, default: '' },
      iban: { type: String, default: '' },
    },
    commissionRate: { type: Number, default: 10 },
    status: { type: String, enum: ['active', 'suspended', 'frozen', 'pending_approval'], default: 'active' },
    freezeReason: { type: String, default: '' },
    frozenAt: Date,
    frozenBy: String,
    // Official Seller Warnings (shown in top announcement bar)
    warning: {
      active: { type: Boolean, default: false },
      message: { type: String, default: '' },
      level: { type: String, enum: ['info', 'warning', 'critical'], default: 'warning' },
      issuedAt: Date,
      issuedBy: String,
    },
    totalSales: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 },
    rating: { type: Number, default: null },
    numReviews: { type: Number, default: 0 },
    verified: { type: Boolean, default: false },
    lastLoginAt: Date,
    // Wallet system
    wallet: {
      balance: { type: Number, default: 0 },           // available to withdraw
      totalEarned: { type: Number, default: 0 },       // lifetime earnings
      totalDeposited: { type: Number, default: 0 },    // total deposited/credited
      pendingDeposit: { type: Number, default: 0 },    // pending deposit requests
      pendingWithdrawal: { type: Number, default: 0 }, // pending withdrawal requests
      totalWithdrawn: { type: Number, default: 0 },    // total paid out
    },
  },
  { timestamps: true }
);

export default mongoose.model('Seller', sellerSchema);
