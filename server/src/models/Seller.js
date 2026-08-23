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
    isEmailVerified: { type: Boolean, default: false },
    emailOtp: {
      code: String,
      expiresAt: Date,
      attempts: { type: Number, default: 0 },
    },
    resetOtp: {
      code: String,
      expiresAt: Date,
      attempts: { type: Number, default: 0 },
    },
    resetToken: String,
    resetExpires: Date,
    lastLoginAt: Date,
    // Wallet system
    wallet: {
      balance: { type: Number, default: 0 },           // available to withdraw (current balance)
      processingFund: { type: Number, default: 0 },    // in-flight locked processing funds for confirmed orders
      totalProfitEarned: { type: Number, default: 0 }, // 20% cumulative profits earned
      totalEarned: { type: Number, default: 0 },       // lifetime earnings released
      totalDeposited: { type: Number, default: 0 },    // total deposited/credited
      pendingDeposit: { type: Number, default: 0 },    // pending deposit requests
      pendingWithdrawal: { type: Number, default: 0 }, // pending withdrawal requests
      totalWithdrawn: { type: Number, default: 0 },    // total paid out
      securityDeposit: { type: Number, default: 0 },   // security deposit amount recorded
    },
    // KYC Verification / Identity Documents uploaded during self-registration
    kycDocuments: {
      idDocumentUrl: { type: String, default: '' },
      idDocumentType: { type: String, default: 'Passport / ID' },
      uploadedAt: { type: Date, default: null },
    },
    // Security Deposit & Referral information (set on Admin approval)
    securityDeposit: {
      paid: { type: Boolean, default: false },
      amount: { type: Number, default: 0 },
      paidAt: { type: Date, default: null },
      referralCode: { type: String, default: '' },
      note: { type: String, default: '' },
    },
    // Performance Target Milestones & Bonus Rewards
    targets: [
      {
        title: { type: String, required: true },
        targetOrders: { type: Number, required: true },
        currentOrders: { type: Number, default: 0 },
        bonusAmount: { type: Number, required: true },
        status: { type: String, enum: ['active', 'completed', 'claimed'], default: 'active' },
        createdAt: { type: Date, default: Date.now },
        completedAt: { type: Date, default: null },
        expiresAt: { type: Date, default: null },
        adminNote: { type: String, default: '' },
      },
    ],
    // Account Health & Compliance Rating (0 to 100)
    accountHealth: {
      score: { type: Number, default: 100, min: 0, max: 100 },
      status: {
        type: String,
        enum: ['healthy', 'at_risk', 'critical_risk', 'frozen', 'suspended'],
        default: 'healthy',
      },
      history: [
        {
          previousScore: Number,
          newScore: Number,
          delta: Number,
          reason: { type: String, default: '' },
          changedBy: { type: String, default: 'Admin' },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      lateShipmentRate: { type: Number, default: 0 },
      orderDefectRate: { type: Number, default: 0 },
      policyViolations: { type: Number, default: 0 },
      lastEvaluatedAt: { type: Date, default: Date.now },
    },
    // Tiered Withdrawal Limit & Upgrade System (Banking Model)
    withdrawalLimit: {
      maxAmount: { type: Number, default: 500 }, // Maximum single withdrawal amount (USD)
      minAmount: { type: Number, default: 10 },  // Minimum single withdrawal amount (USD)
      requiredWithdrawalsForIncrease: { type: Number, default: 10 }, // Required successful withdrawals to unlock upgrade
      successfulWithdrawalCount: { type: Number, default: 0 }, // Counter of approved withdrawals at current tier
      upgradeFee: { type: Number, default: 50 }, // Upgrade processing fee charged to seller
      currentTierName: { type: String, default: 'Tier 1 - Standard ($500 Max)' },
      pendingIncreaseRequest: {
        requestedLimit: { type: Number, default: null },
        reason: { type: String, default: '' },
        status: {
          type: String,
          enum: ['none', 'pending', 'offered', 'accepted_by_seller', 'approved', 'rejected', 'declined_by_seller'],
          default: 'none',
        },
        offeredLimit: { type: Number, default: null },
        offeredFee: { type: Number, default: null },
        offeredNextCount: { type: Number, default: null },
        offeredTierName: { type: String, default: '' },
        upgradeFeeCharged: { type: Number, default: 0 },
        offeredAt: { type: Date, default: null },
        sellerAcceptedAt: { type: Date, default: null },
        createdAt: { type: Date, default: null },
        adminNote: { type: String, default: '' },
      },
    },
  },
  { timestamps: true }
);

export default mongoose.model('Seller', sellerSchema);
