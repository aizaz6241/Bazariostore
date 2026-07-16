import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    type: { type: String, default: 'system' }, // order | payment | refund | customer | stock | chat | system
    title: String,
    body: String,
    link: String,
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model('Notification', notificationSchema);
