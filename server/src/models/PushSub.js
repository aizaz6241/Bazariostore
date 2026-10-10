import mongoose from 'mongoose';

// A phone / browser that asked for push notifications from the store app (admin panel or seller panel)
const pushSubSchema = new mongoose.Schema(
  {
    endpoint: { type: String, required: true, unique: true },
    keys: { p256dh: String, auth: String },
    kind: { type: String, enum: ['admin', 'seller'], required: true, index: true },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', default: null, index: true },
    userAgent: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('PushSub', pushSubSchema, 'ecompushsubs');
