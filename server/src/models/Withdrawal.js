import mongoose from 'mongoose';

const withdrawalSchema = new mongoose.Schema(
  {
    // Transaction types:
    // 'deposit' = seller requests funds added
    // 'withdrawal' = seller requests payout
    // 'order_processing_lock' = funds locked from available balance to processing fund on order confirmation
    // 'order_delivered_release' = locked funds + 20% profit credited to available balance on delivery
    // 'order_cancelled_release' = locked funds returned to available balance on order cancellation
    // 'adjustment' = admin manual credit/debit
    type: {
      type: String,
      enum: [
        'deposit',
        'withdrawal',
        'order_processing_lock',
        'order_delivered_release',
        'order_cancelled_release',
        'adjustment',
      ],
      required: true,
      default: 'withdrawal',
    },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    storeName: { type: String },
    amount: { type: Number, required: true },
    // Order Reference (if linked to an order)
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    orderNumber: { type: String, default: '' },
    principalAmount: { type: Number, default: 0 },
    profitAmount: { type: Number, default: 0 },
    profitRate: { type: Number, default: 20 },
    balanceAfter: { type: Number, default: null },
    processingFundAfter: { type: Number, default: null },
    // Actual amount credited/debited by admin (if different from requested amount)
    approvedAmount: { type: Number, default: null },
    isManualAdjustment: { type: Boolean, default: false },
    // Payment method (for withdrawal)
    method: { type: String, enum: ['upi', 'bank', 'paytm', 'gpay', 'phonepe', 'usdt', 'other', ''], default: '' },
    // UPI & Mobile Wallet details
    upiId: { type: String, default: '' },
    phone: { type: String, default: '' },
    walletAddress: { type: String, default: '' },
    network: { type: String, default: '' },
    // Bank details
    accountTitle: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    bankName: { type: String, default: '' },
    ifscCode: { type: String, default: '' },
    branchName: { type: String, default: '' },
    accountType: { type: String, default: '' },
    // For deposit: seller provides reference (e.g. UTR of payment they made)
    depositRef: { type: String, default: '' },
    depositNote: { type: String, default: '' },
    // Status
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'completed'], default: 'pending' },
    adminNote: { type: String, default: '' },
    processedAt: { type: Date },
    processedBy: { type: String },
    // Reference for payment confirmation (UTR for withdrawal payout)
    transactionRef: { type: String, default: '' },
    // Chat message that was auto-sent
    chatMessageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  },
  { timestamps: true }
);

export default mongoose.model('Withdrawal', withdrawalSchema);

