import RewardClaim from '../models/RewardClaim.js';
import { Seller, Order, Withdrawal } from '../models/SharedModels.js';
import SellerAssignment from '../models/SellerAssignment.js';

/**
 * Evaluates pending milestones for a member and generates pending reward claims.
 * Claims are created with status: 'pending' and must be approved by Admin.
 */
export async function evaluateMemberMilestones(memberId) {
  const assignments = await SellerAssignment.find({ memberId, status: 'active' });
  if (!assignments.length) return [];

  const sellerIds = assignments.map((a) => a.sellerId);
  const sellers = await Seller.find({ _id: { $in: sellerIds } });

  const generatedClaims = [];

  // ─── 1. Check Individual Seller Deposit Milestones ───
  for (const seller of sellers) {
    const totalDepositedINR = Number(seller.wallet?.totalDeposited || 0);

    // Milestone 1: 1 Lakh INR (100,000) -> 1,000 PKR
    if (totalDepositedINR >= 100000) {
      const claimKey = `milestone_1lakh_${memberId}_${seller._id}`;
      const existing = await RewardClaim.findOne({ claimKey });
      if (!existing) {
        const claim = await RewardClaim.create({
          memberId,
          sellerId: seller._id,
          rewardType: 'milestone_1lakh',
          title: `Milestone Achieved: ₹1 Lakh Deposit (${seller.storeName})`,
          amountPKR: 1000,
          description: `Seller ${seller.storeName} completed ₹100,000+ INR total deposits. Eligible for 1,000 PKR Reward.`,
          status: 'pending',
          claimKey,
        });
        generatedClaims.push(claim);
      }
    }

    // Milestone 2: 2 Lakh INR (200,000) -> 2,000 PKR
    if (totalDepositedINR >= 200000) {
      const claimKey = `milestone_2lakh_${memberId}_${seller._id}`;
      const existing = await RewardClaim.findOne({ claimKey });
      if (!existing) {
        const claim = await RewardClaim.create({
          memberId,
          sellerId: seller._id,
          rewardType: 'milestone_2lakh',
          title: `Milestone Achieved: ₹2 Lakh Deposit (${seller.storeName})`,
          amountPKR: 2000,
          description: `Seller ${seller.storeName} completed ₹200,000+ INR total deposits. Eligible for 2,000 PKR Reward.`,
          status: 'pending',
          claimKey,
        });
        generatedClaims.push(claim);
      }
    }

    // Milestone 3: 3 Lakh INR (300,000) -> 3,000 PKR
    if (totalDepositedINR >= 300000) {
      const claimKey = `milestone_3lakh_${memberId}_${seller._id}`;
      const existing = await RewardClaim.findOne({ claimKey });
      if (!existing) {
        const claim = await RewardClaim.create({
          memberId,
          sellerId: seller._id,
          rewardType: 'milestone_3lakh',
          title: `Milestone Achieved: ₹3 Lakh Deposit (${seller.storeName})`,
          amountPKR: 3000,
          description: `Seller ${seller.storeName} completed ₹300,000+ INR total deposits. Eligible for 3,000 PKR Reward.`,
          status: 'pending',
          claimKey,
        });
        generatedClaims.push(claim);
      }
    }
  }

  // ─── 2. Check Weekly 5 Lakh Sprint Target (500,000 INR in current week) ───
  const now = new Date();
  const weekStart = new Date(now);
  const day = weekStart.getDay();
  const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1); // Monday
  weekStart.setDate(diff);
  weekStart.setHours(0, 0, 0, 0);

  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(((now - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
  const weekKey = `${weekStart.getFullYear()}_W${weekNumber}`;

  // Fetch approved deposits for assigned sellers during the current week
  const weeklyDeposits = await Withdrawal.aggregate([
    {
      $match: {
        seller: { $in: sellerIds },
        type: 'deposit',
        status: { $in: ['approved', 'completed'] },
        createdAt: { $gte: weekStart },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' },
      },
    },
  ]);
  const currentWeekDepositsINR = weeklyDeposits[0]?.total || 0;

  if (currentWeekDepositsINR >= 500000) {
    const claimKey = `weekly_5lakh_${memberId}_${weekKey}`;
    const existing = await RewardClaim.findOne({ claimKey });
    if (!existing) {
      const claim = await RewardClaim.create({
        memberId,
        rewardType: 'weekly_5lakh_sprint',
        title: `🏆 Weekly Sprint Achieved: ₹5 Lakh Combined Volume`,
        amountPKR: 5000,
        description: `Member's assigned sellers accumulated ₹500,000+ INR volume this week. Eligible for 5,000 PKR Weekend Award.`,
        status: 'pending',
        claimKey,
      });
      generatedClaims.push(claim);
    }
  }

  // ─── 3. Check First Seller - 5 Orders Milestone ───
  if (assignments.length > 0) {
    // Sort by earliest assigned seller
    const firstAssignment = assignments.sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    )[0];

    const firstSellerOrdersCount = await Order.countDocuments({
      seller: firstAssignment.sellerId,
      status: { $in: ['confirmed', 'delivered', 'completed', 'shipped', 'processing'] },
    });

    if (firstSellerOrdersCount >= 5) {
      const claimKey = `first_seller_5orders_${memberId}_${firstAssignment.sellerId}`;
      const existing = await RewardClaim.findOne({ claimKey });
      if (!existing) {
        const claim = await RewardClaim.create({
          memberId,
          sellerId: firstAssignment.sellerId,
          rewardType: 'first_seller_5orders',
          title: `🚀 First Seller Completed 5 Orders Milestone`,
          amountPKR: 5000,
          description: `First assigned client successfully completed 5 orders. Eligible for 5,000 PKR Starter Reward.`,
          status: 'pending',
          claimKey,
        });
        generatedClaims.push(claim);
      }
    }
  }

  return generatedClaims;
}
