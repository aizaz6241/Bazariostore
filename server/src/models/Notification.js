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

export default mongoose.model('Notification', notificationSchema);
