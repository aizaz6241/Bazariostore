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
    // Commission deal agreed between Admin and Member:
    // 'inr_50' (50% INR directly to Member) or 'pkr_1to1' (1:1 PKR fixed rate)
    commissionLabel: {
      type: String,
      enum: ['pkr_1to1', 'inr_50'],
      default: 'pkr_1to1',
    },
    // Multi-currency wallet tracking (USDT as hero/base, INR & PKR native)
    wallet: {
      balanceUSDT: { type: Number, default: 0 },
      balancePKR: { type: Number, default: 0 },
      balanceINR: { type: Number, default: 0 },
      totalEarnedUSDT: { type: Number, default: 0 },
      totalEarnedPKR: { type: Number, default: 0 },
      totalEarnedINR: { type: Number, default: 0 },
      totalWithdrawnUSDT: { type: Number, default: 0 },
      totalWithdrawnPKR: { type: Number, default: 0 },
      totalWithdrawnINR: { type: Number, default: 0 },
      totalDepositsPKR: { type: Number, default: 0 },
      totalWithdrawalsPKR: { type: Number, default: 0 },
      totalBonusesPKR: { type: Number, default: 0 },
    },
    // ── Referral (1:1 PKR members only), set once when the member is created, never changed ──
    // The 1:1 member who brought this member; he gets referralPct % OF THIS MEMBER'S share of
    // every deposit (and bears the same % of this member's part of every seller withdrawal).
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'PortalMember', default: null, index: true },
    referralPct: { type: Number, default: 0 },
    referralSetAt: { type: Date, default: null },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.models.PortalMember || mongoose.model('PortalMember', memberSchema);
