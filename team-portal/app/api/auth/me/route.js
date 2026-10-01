import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import Member from '@/lib/models/Member';
import SellerAssignment from '@/lib/models/SellerAssignment';
import { Seller } from '@/lib/models/SharedModels';
import RewardClaim from '@/lib/models/RewardClaim';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const member = await Member.findById(session._id).select('-passwordHash');
    if (!member) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    // Recalculate live financial balances based on assigned sellers
    if (member.role === 'member') {
      const assignments = await SellerAssignment.find({ memberId: member._id, status: 'active' });
      const sellerIds = assignments.map((a) => a.sellerId);

      const sellers = await Seller.find({ _id: { $in: sellerIds } });

      let totalDepositsPKR = 0;
      let totalWithdrawalsPKR = 0;

      for (const s of sellers) {
        // 1 INR deposit = 1 PKR credited
        totalDepositsPKR += Number(s.wallet?.totalDeposited || 0);
        // 1 INR withdraw = 1 PKR deducted
        totalWithdrawalsPKR += Number(s.wallet?.totalWithdrawn || 0);
      }

      // Sum approved bonuses
      const approvedBonuses = await RewardClaim.aggregate([
        { $match: { memberId: member._id, status: 'approved' } },
        { $group: { _id: null, total: { $sum: '$amountPKR' } } },
      ]);
      const totalBonusesPKR = approvedBonuses[0]?.total || 0;

      const netBalancePKR = totalDepositsPKR - totalWithdrawalsPKR + totalBonusesPKR;

      member.wallet = {
        balancePKR: Math.max(0, netBalancePKR),
        totalDepositsPKR,
        totalWithdrawalsPKR,
        totalBonusesPKR,
      };
      await member.save();
    }

    return NextResponse.json({ member });
  } catch (err) {
    console.error('Auth me error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
