import mongoose from 'mongoose';

const referralCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    commissionRate: {
      type: Number,
      default: null,
    },
    bonusAmount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    isMaster: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: String,
      default: 'Admin',
    },
  },
  { timestamps: true }
);

export default mongoose.model('ReferralCode', referralCodeSchema);
