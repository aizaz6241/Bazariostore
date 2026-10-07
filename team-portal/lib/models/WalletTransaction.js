import mongoose from 'mongoose';

const walletTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PortalMember',
      required: true,
      index: true,
    },
    userRole: {
      type: String,
      enum: ['admin', 'member'],
      required: true,
    },
    type: {
      type: String,
      enum: ['credit', 'debit', 'activity'], // credit = inflow, debit = payout, activity = store event
      required: true,
    },
    category: {
      type: String,
      enum: [
        'commission_inr_50',      // 50% INR commission to member
        'commission_pkr_1to1',    // 1:1 INR to PKR commission to member
        'admin_personal_handler', // Admin 50% direct managing handler share
        'admin_pool_share',       // Admin 25% platform pool split
        'admin_share_inr_50',     // Admin share from 50% INR split
        'admin_share_pkr_1to1',   // Admin share from 1:1 PKR store deposit
        'client_withdrawal',      // Store client withdrawal activity
        'bonus_reward',           // Milestone/weekly bonus approved
        'payout_withdrawal',      // Member/Admin payout withdrawal
        'adjustment',             // Manual balance adjustment
      ],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    amountUSDT: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      enum: ['INR', 'PKR', 'USDT'],
      required: true,
      default: 'PKR',
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller',
      default: null,
    },
    storeName: {
      type: String,
      default: '',
    },
    sourceRef: {
      type: String,
      default: '', // Deposit UTR, Claim ID, or Payout Receipt
    },
    description: {
      type: String,
      required: true,
    },
    note: {
      type: String,
      default: '',
    },
    processedBy: {
      type: String,
      default: '',
    },
    date: {
      type: Date,
      default: Date.now,
      index: true,
    },
    // A payout that was recorded by mistake and taken back. The row is kept (nothing is ever
    // deleted) but it is no longer counted: the wallet and the Binance total get the amount back.
    reversed: { type: Boolean, default: false },
    reversedAt: { type: Date, default: null },
    reversedBy: { type: String, default: '' },
    reverseReason: { type: String, default: '' },
  },
  { timestamps: true }
);

walletTransactionSchema.index({ userId: 1, date: -1 });

export default mongoose.models.PortalWalletTransaction ||
  mongoose.model('PortalWalletTransaction', walletTransactionSchema);
