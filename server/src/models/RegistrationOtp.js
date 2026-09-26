import mongoose from 'mongoose';

const registrationOtpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    otp: { type: String, required: true },
    name: { type: String, default: '' },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    attempts: { type: Number, default: 0 },
    verified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.models.RegistrationOtp || mongoose.model('RegistrationOtp', registrationOtpSchema);
