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
    // Wallet tracking in PKR
    wallet: {
      balancePKR: { type: Number, default: 0 },
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
