import mongoose from 'mongoose';

const pushSubscriptionSchema = new mongoose.Schema(
  {
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PortalMember',
      required: true,
      index: true,
    },
    endpoint: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

export default mongoose.models.PortalPushSubscription ||
  mongoose.model('PortalPushSubscription', pushSubscriptionSchema);
