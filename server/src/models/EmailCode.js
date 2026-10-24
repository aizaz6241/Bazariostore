import mongoose from 'mongoose';

/**
 * A 6-digit code sent to an email address BEFORE an account exists (seller registration).
 * Only a hash of the code is kept. The record removes itself one day after it was last used.
 */
const emailCodeSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    purpose: { type: String, required: true }, // 'seller_register'
    codeHash: { type: String, default: '' },
    expiresAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    sentAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    purgeAt: { type: Date, default: () => new Date(Date.now() + 86400000) },
  },
  { timestamps: true }
);
emailCodeSchema.index({ email: 1, purpose: 1 }, { unique: true });
emailCodeSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.EmailCode || mongoose.model('EmailCode', emailCodeSchema);
