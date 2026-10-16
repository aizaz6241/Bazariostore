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
        // ── reward system of 10 Oct 2026 ──
        'wallet_300',           // seller's real deposits reach $300 -> 5,000 PKR (once per seller)
        'daily_target',         // ₹1L–5L+ real INR in one day -> 1,000–5,000 PKR
        'weekly_target',        // ₹5L+ real INR in one week -> 5,000 PKR
        // ── device gifts (16 Oct 2026) ──
        'device_gift',          // net 10,000 USDT -> iPhone, net 20,000 USDT -> laptop (amount = real purchase cost)
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
      // reversed = it was approved, then taken back (kept for the record, never counted)
      enum: ['pending', 'approved', 'rejected', 'reversed'],
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
    // Day / week / date the reward is for (new reward system)
    periodKey: { type: String, default: '' },
    // Extra amount for a day whose total went up after the first reward was approved
    topupOf: { type: String, default: '' },
    // Set by the reward check when an approved reward is no longer due (shown to the admins)
    warning: { type: String, default: '' },
    // Closed by the reward check (no longer due) — reopened by it if it becomes due again
    closedBySystem: { type: Boolean, default: false },
    // Created by the reward check (not typed in by an admin)
    autoCreated: { type: Boolean, default: false },
    // Taken back after approval
    reversedAt: { type: Date, default: null },
    reversedBy: { type: String, default: '' },
    reverseReason: { type: String, default: '' },
    // Every correction (member changed, amount changed, reversed, moved): who, when, what
    history: [
      {
        at: { type: Date, default: Date.now },
        by: { type: String, default: '' },
        action: { type: String, default: '' },
        note: { type: String, default: '' },
        from: { type: mongoose.Schema.Types.Mixed, default: null },
        to: { type: mongoose.Schema.Types.Mixed, default: null },
      },
    ],
    // Device gift (rewardType 'device_gift'): amountPKR is the real purchase cost, entered by an
    // admin after buying (approve is blocked until then). Counted like a bonus (partners 50 / 50)
    // AND as a payout to the person (he got the device, not money), so his wallet does not change.
    gift: {
      item: { type: String, default: '' }, // iphone | laptop
      label: { type: String, default: '' },
      thresholdUSDT: { type: Number, default: 0 },
      netAtCross: { type: Number, default: 0 },
      crossedAt: { type: Date, default: null },
      costEntered: { type: Boolean, default: false },
      status: { type: String, default: '' }, // due | purchased | delivered
      purchasedAt: { type: Date, default: null },
      deliveredAt: { type: Date, default: null },
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
