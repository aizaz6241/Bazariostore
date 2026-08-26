import mongoose from 'mongoose';

export const REFUND_STATUSES = ['requested', 'approved', 'rejected', 'refunded'];

const refundSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    orderNumber: String,
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    customer: { name: String, email: String, phone: String },
    amount: { type: Number, default: 0 },
    reason: String,
    status: { type: String, enum: REFUND_STATUSES, default: 'requested' },
    paymentReturned: { type: Boolean, default: false },
    timeline: [{ status: String, note: String, at: { type: Date, default: Date.now }, by: String }],
    requestedBy: { type: String, default: 'customer' }, // customer | admin
    processedBy: String,
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('Refund', refundSchema);
