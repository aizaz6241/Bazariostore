import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    recipientType: { type: String, enum: ['admin', 'seller'], default: 'admin' },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', default: null },
    type: { type: String, default: 'system' }, // order | payment | deposit | withdrawal | refund | customer | stock | chat | system
    title: String,
    body: String,
    link: String,
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// perf: read-path indexes (non-unique, additive — no data is changed)
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ read: 1 });
notificationSchema.index({ recipientType: 1, seller: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);
