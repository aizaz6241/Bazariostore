import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema({
  label: { type: String, default: 'Home' },
  fullName: String,
  phone: String,
  street: String,
  apartment: String,
  city: String,
  state: String,
  postalCode: String,
  country: { type: String, default: 'United States' },
  isDefault: { type: Boolean, default: false },
});

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: String,
    passwordHash: { type: String, required: true },
    addresses: [addressSchema],
    isEmailVerified: { type: Boolean, default: false },
    emailOtp: {
      code: String,
      expiresAt: Date,
      attempts: { type: Number, default: 0 },
    },
    resetOtp: {
      code: String,
      expiresAt: Date,
      attempts: { type: Number, default: 0 },
    },
    resetToken: String,
    resetExpires: Date,
    // Details from a repeated registration of a not-yet-verified email: applied only when the code
    // from the mailbox is entered.
    pendingSignup: {
      passwordHash: String,
      name: String,
      phone: String,
    },
    // When the password was last changed: logins made before this moment stop working.
    pwdAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
