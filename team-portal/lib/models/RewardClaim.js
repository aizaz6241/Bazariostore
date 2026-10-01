import mongoose from 'mongoose';

const rewardClaimSchema = new mongoose.Schema(
  {
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PortalMember',
      required: true,
      index: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller',
      default: null,
    },
    rewardType: {
      type: String,
      enum: [
        'milestone_1lakh',      // 100,000 INR -> 1,000 PKR
        'milestone_2lakh',      // 200,000 INR -> 2,000 PKR
        'milestone_3lakh',      // 300,000 INR -> 3,000 PKR
        'weekly_5lakh_sprint',  // All sellers reach 500,000 INR in 1 week -> 5,000 PKR
        'first_seller_5orders', // First seller completes 5 orders -> 5,000 PKR
        'custom_bonus',         // Admin direct bonus
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    amountPKR: {
      type: Number,
      required: true,
      min: 1,
    },
    description: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    adminNote: {
      type: String,
      default: '',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PortalMember',
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    // Deduplication key to prevent creating duplicate claims for the same milestone
    claimKey: {
      type: String,
      unique: true,
      sparse: true,
    },
  },
  { timestamps: true }
);

export default mongoose.models.PortalRewardClaim || mongoose.model('PortalRewardClaim', rewardClaimSchema);
