import mongoose from 'mongoose';

const withdrawalSchema = new mongoose.Schema(
  {
    // 'deposit' = seller chahta hai wallet mein paise add hon
    // 'withdrawal' = seller chahta hai wallet se paise nikalen
    type: { type: String, enum: ['deposit', 'withdrawal'], required: true, default: 'withdrawal' },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    storeName: { type: String },
    amount: { type: Number, required: true, min: 1 },
    // Actual amount credited/debited by admin (if different from requested amount)
    approvedAmount: { type: Number, default: null },
    isManualAdjustment: { type: Boolean, default: false },
    // Payment method (for withdrawal)
    method: { type: String, enum: ['upi', 'bank', 'other', ''], default: '' },
    // UPI details
    upiId: { type: String, default: '' },
    // Bank details
    accountTitle: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    bankName: { type: String, default: '' },
    ifscCode: { type: String, default: '' },
    // For deposit: seller provides reference (e.g. UTR of payment they made)
    depositRef: { type: String, default: '' },
    depositNote: { type: String, default: '' },
    // Status
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
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
