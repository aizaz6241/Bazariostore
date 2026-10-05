import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import RewardClaim from '@/lib/models/RewardClaim';
import SellerAssignment from '@/lib/models/SellerAssignment';
import { Seller, Withdrawal } from '@/lib/models/SharedModels';
import { evaluateMemberMilestones, getRealInrDeposits } from '@/lib/utils/milestones';

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

      // Real INR from the finance ledger (the store wallet is in dollars)
      const { weekTotal: currentTotalDepositedINR } = await getRealInrDeposits(sellerIds);

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
