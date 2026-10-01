import mongoose from 'mongoose';

const memberSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    email: {
      type: String,
      default: '',
      lowercase: true,
      trim: true,
    },
    ecommerceAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    plainPassword: {
      type: String,
      default: '',
    },
    role: {
      type: String,
      enum: ['admin', 'member'],
      default: 'member',
    },
    phone: {
      type: String,
      default: '',
    },
    avatar: {
      type: String,
      default: '',
    },
    active: {
      type: Boolean,
      default: true,
    },
    // Dual-currency wallet tracking (For Members & Admins: INR & PKR)
    wallet: {
      balancePKR: { type: Number, default: 0 },
      balanceINR: { type: Number, default: 0 },
      totalEarnedPKR: { type: Number, default: 0 },
      totalEarnedINR: { type: Number, default: 0 },
      totalWithdrawnPKR: { type: Number, default: 0 },
      totalWithdrawnINR: { type: Number, default: 0 },
      totalDepositsPKR: { type: Number, default: 0 },
      totalWithdrawalsPKR: { type: Number, default: 0 },
      totalBonusesPKR: { type: Number, default: 0 },
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.models.PortalMember || mongoose.model('PortalMember', memberSchema);
