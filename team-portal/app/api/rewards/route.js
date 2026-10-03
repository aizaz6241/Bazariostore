import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import RewardClaim from '@/lib/models/RewardClaim';
import SellerAssignment from '@/lib/models/SellerAssignment';
import { Seller } from '@/lib/models/SharedModels';
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
      const sellers = await Seller.find({ _id: { $in: sellerIds } }).select('-kycDocuments');

      const currentTotalDepositedINR = sellers.reduce(
        (sum, s) => sum + Number(s.wallet?.totalDeposited || 0),
        0
      );

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
