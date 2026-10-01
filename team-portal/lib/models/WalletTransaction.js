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
      enum: ['credit', 'debit'], // credit = incoming commission/bonus, debit = withdrawal/payout
      required: true,
    },
    category: {
      type: String,
      enum: [
        'commission_inr_50',   // 50% INR commission
        'commission_pkr_1to1', // 1:1 INR to PKR commission
        'admin_share_inr_50',  // Admin's share from 50% INR split
        'admin_share_pkr_1to1',// Admin's share from 1:1 PKR store deposit
        'bonus_reward',        // Milestone/weekly bonus approved
        'payout_withdrawal',   // Member/Admin payout withdrawal
        'adjustment',          // Manual balance adjustment
      ],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      enum: ['INR', 'PKR'],
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
  },
  { timestamps: true }
);

walletTransactionSchema.index({ userId: 1, date: -1 });

export default mongoose.models.PortalWalletTransaction ||
  mongoose.model('PortalWalletTransaction', walletTransactionSchema);
