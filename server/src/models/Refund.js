import mongoose from 'mongoose';

export const REFUND_STATUSES = ['requested', 'approved', 'rejected', 'refunded'];

const refundSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    orderNumber: String,
    customer: { name: String, email: String, phone: String },
    amount: { type: Number, default: 0 },
    reason: String,
    status: { type: String, enum: REFUND_STATUSES, default: 'requested' },
    paymentReturned: { type: Boolean, default: false },
    timeline: [{ status: String, note: String, at: { type: Date, default: Date.now }, by: String }],
    requestedBy: { type: String, default: 'customer' }, // customer | admin
    processedBy: String,
  },
  { timestamps: true }
);

export default mongoose.model('Refund', refundSchema);
