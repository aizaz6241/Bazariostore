import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import Member from '@/lib/models/Member';
import SellerAssignment from '@/lib/models/SellerAssignment';
import { Seller, Order } from '@/lib/models/SharedModels';
import RewardClaim from '@/lib/models/RewardClaim';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    if (session.role === 'admin') {
      const [
        totalMembers,
        totalSellers,
        sellersWithWallet,
        pendingClaimsCount,
        pendingOrdersCount,
      ] = await Promise.all([
        Member.countDocuments({ role: 'member', active: true }),
        Seller.countDocuments(),
        Seller.find().select('wallet'),
        RewardClaim.countDocuments({ status: 'pending' }),
        Order.countDocuments({ status: { $in: ['pending', 'processing', 'unfulfilled'] } }),
      ]);

      let totalDepositsINR = 0;
      let totalWithdrawalsINR = 0;

      sellersWithWallet.forEach((s) => {
        totalDepositsINR += Number(s.wallet?.totalDeposited || 0);
        totalWithdrawalsINR += Number(s.wallet?.totalWithdrawn || 0);
      });

      const netFundsINR = totalDepositsINR - totalWithdrawalsINR;

      return NextResponse.json({
        totalMembers,
        totalSellers,
        totalDepositsINR,
        totalWithdrawalsINR,
        netFundsINR,
        pendingClaimsCount,
        pendingOrdersCount,
      });
    } else {
      // Member specific dashboard stats
      const myAssignments = await SellerAssignment.find({ memberId: session._id, status: 'active' });
      const sellerIds = myAssignments.map((a) => a.sellerId);
      const mySellers = await Seller.find({ _id: { $in: sellerIds } });

      let totalDepositsINR = 0;
      let totalWithdrawalsINR = 0;

      mySellers.forEach((s) => {
        totalDepositsINR += Number(s.wallet?.totalDeposited || 0);
        totalWithdrawalsINR += Number(s.wallet?.totalWithdrawn || 0);
      });

      const pendingOrdersCount = await Order.countDocuments({
        seller: { $in: sellerIds },
        status: { $in: ['pending', 'processing', 'unfulfilled'] },
      });

      const bonusAgg = await RewardClaim.aggregate([
        { $match: { memberId: session._id, status: 'approved' } },
        { $group: { _id: null, total: { $sum: '$amountPKR' } } },
      ]);
      const totalBonusesPKR = bonusAgg[0]?.total || 0;

      const pendingClaimsCount = await RewardClaim.countDocuments({
        memberId: session._id,
        status: 'pending',
      });

      const walletBalancePKR = totalDepositsINR - totalWithdrawalsINR + totalBonusesPKR;

      return NextResponse.json({
        totalAssignedSellers: mySellers.length,
        totalDepositsINR,
        totalWithdrawalsINR,
        walletBalancePKR: Math.max(0, walletBalancePKR),
        totalBonusesPKR,
        pendingOrdersCount,
        pendingClaimsCount,
      });
    }
  } catch (err) {
    console.error('Fetch stats error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
