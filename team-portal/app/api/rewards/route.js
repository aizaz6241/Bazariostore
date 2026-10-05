import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import RewardClaim from '@/lib/models/RewardClaim';
import SellerAssignment from '@/lib/models/SellerAssignment';
import { Seller, Withdrawal } from '@/lib/models/SharedModels';
import { evaluateMemberMilestones } from '@/lib/utils/milestones';

export const dynamic = 'force-dynamic';

// GET /api/rewards — list rewards, pending claims, and sprint progress
export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    let filter = {};

    if (session.role === 'member') {
      filter.memberId = session._id;
      // Auto-evaluate any new milestones achieved
      await evaluateMemberMilestones(session._id);
    }

    const claims = await RewardClaim.find(filter)
      .populate('memberId', 'name username role avatar')
      .populate('sellerId', 'storeName ownerName')
      .sort({ createdAt: -1 });

    // Calculate Weekly Sprint Progress for the current user
    let weeklyProgress = null;
    if (session.role === 'member') {
      const assignments = await SellerAssignment.find({ memberId: session._id, status: 'active' });
      const sellerIds = assignments.map((a) => a.sellerId);

      const now = new Date();
      const weekStart = new Date(now);
      const day = weekStart.getDay();
      const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
      weekStart.setDate(diff);
      weekStart.setHours(0, 0, 0, 0);

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
      const currentTotalDepositedINR = weeklyDeposits[0]?.total || 0;

      const targetINR = 500000; // 5 Lakh INR
      const progressPercent = Math.min(100, Math.round((currentTotalDepositedINR / targetINR) * 100));

      weeklyProgress = {
        targetINR,
        currentINR: currentTotalDepositedINR,
        percentage: progressPercent,
        remainingINR: Math.max(0, targetINR - currentTotalDepositedINR),
        rewardPKR: 5000,
        isEligible: currentTotalDepositedINR >= targetINR,
      };
    }

    return NextResponse.json({
      claims,
      weeklyProgress,
    });
  } catch (err) {
    console.error('Fetch rewards error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
