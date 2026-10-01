import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import Member from '@/lib/models/Member';
import SellerAssignment from '@/lib/models/SellerAssignment';
import { Seller, Order } from '@/lib/models/SharedModels';
import RewardClaim from '@/lib/models/RewardClaim';
import { syncEcommerceAdmins } from '@/lib/adminSync';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    if (session.role === 'admin') {
      await syncEcommerceAdmins();

      const [
        totalMembers,
        totalSellers,
        sellersWithWallet,
        pendingClaimsCount,
        pendingOrdersCount,
        allMembers,
      ] = await Promise.all([
        Member.countDocuments({ role: 'member', active: true }),
        Seller.countDocuments(),
        Seller.find().select('wallet'),
        RewardClaim.countDocuments({ status: 'pending' }),
        Order.countDocuments({ status: { $in: ['pending', 'processing', 'unfulfilled'] } }),
        Member.find({ role: 'member', active: true }).select('-passwordHash'),
      ]);

      let totalDepositsINR = 0;
      let totalWithdrawalsINR = 0;

      sellersWithWallet.forEach((s) => {
        totalDepositsINR += Number(s.wallet?.totalDeposited || 0);
        totalWithdrawalsINR += Number(s.wallet?.totalWithdrawn || 0);
      });

      const netFundsINR = totalDepositsINR - totalWithdrawalsINR;

      // ─── Calculate Comprehensive Staff Analytics for Admin ───
      const staffList = await Promise.all(
        allMembers.map(async (m) => {
          const assignments = await SellerAssignment.find({ memberId: m._id, status: 'active' });
          const sellerIds = assignments.map((a) => a.sellerId);
          const assignedSellers = await Seller.find({ _id: { $in: sellerIds } });

          let memberDepositsINR = 0;
          let memberWithdrawalsINR = 0;

          for (const s of assignedSellers) {
            memberDepositsINR += Number(s.wallet?.totalDeposited || 0);
            memberWithdrawalsINR += Number(s.wallet?.totalWithdrawn || 0);
          }

          const bonusAgg = await RewardClaim.aggregate([
            { $match: { memberId: m._id, status: 'approved' } },
            { $group: { _id: null, total: { $sum: '$amountPKR' } } },
          ]);
          const totalBonusesPKR = bonusAgg[0]?.total || 0;

          const pendingOrders = await Order.countDocuments({
            seller: { $in: sellerIds },
            status: { $in: ['pending', 'processing', 'unfulfilled'] },
          });

          // Compute exact dual-currency balances using wallet engine
          let mWallet = {
            balanceINR: 0,
            balancePKR: Math.max(0, memberDepositsINR - memberWithdrawalsINR + totalBonusesPKR),
            totalEarnedINR: 0,
            totalEarnedPKR: Math.max(0, memberDepositsINR + totalBonusesPKR),
          };

          try {
            const { getWalletData } = await import('@/lib/utils/wallet');
            const wData = await getWalletData({ userId: m._id });
            mWallet = wData.balances;
          } catch (wErr) {
            // fallback to default
          }

          return {
            _id: m._id,
            name: m.name,
            username: m.username,
            phone: m.phone,
            avatar: m.avatar,
            assignedSellersCount: assignedSellers.length,
            totalDepositsINR: memberDepositsINR,
            totalWithdrawalsINR: memberWithdrawalsINR,
            netVolumeINR: memberDepositsINR - memberWithdrawalsINR,
            totalBonusesPKR,
            walletBalancePKR: mWallet.balancePKR,
            walletBalanceINR: mWallet.balanceINR,
            wallet: mWallet,
            pendingOrdersCount: pendingOrders,
          };
        })
      );

      // Find top performers across categories
      let topDepositor = null;
      let topWithdrawer = null;
      let topEarner = null;
      let topSellerManager = null;
      let totalStaffEarningsPKR = 0;
      let totalStaffEarningsINR = 0;
      let totalStaffBonusesPKR = 0;

      if (staffList.length > 0) {
        topDepositor = [...staffList].sort((a, b) => b.totalDepositsINR - a.totalDepositsINR)[0];
        topWithdrawer = [...staffList].sort((a, b) => b.totalWithdrawalsINR - a.totalWithdrawalsINR)[0];
        topEarner = [...staffList].sort((a, b) => (b.walletBalancePKR + b.walletBalanceINR) - (a.walletBalancePKR + a.walletBalanceINR))[0];
        topSellerManager = [...staffList].sort((a, b) => b.assignedSellersCount - a.assignedSellersCount)[0];

        staffList.forEach((s) => {
          totalStaffEarningsPKR += s.walletBalancePKR;
          totalStaffEarningsINR += (s.walletBalanceINR || 0);
          totalStaffBonusesPKR += s.totalBonusesPKR;
        });
      }

      // Fetch live admin wallet share
      let adminWallet = null;
      try {
        const { getWalletData } = await import('@/lib/utils/wallet');
        const wData = await getWalletData({ userId: session._id });
        adminWallet = wData.balances;
      } catch (wErr) {
        console.error('Error fetching admin wallet:', wErr);
      }

      return NextResponse.json({
        totalMembers,
        totalSellers,
        totalDepositsINR,
        totalWithdrawalsINR,
        netFundsINR,
        pendingClaimsCount,
        pendingOrdersCount,
        adminWallet,
        staffAnalytics: {
          staffList: staffList.sort((a, b) => b.totalDepositsINR - a.totalDepositsINR),
          topDepositor,
          topWithdrawer,
          topEarner,
          topSellerManager,
          totalStaffEarningsPKR,
          totalStaffEarningsINR,
          totalStaffBonusesPKR,
        },
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

      let memberWallet = null;
      try {
        const { getWalletData } = await import('@/lib/utils/wallet');
        const wData = await getWalletData({ userId: session._id });
        memberWallet = wData.balances;
      } catch (wErr) {
        console.error('Error fetching member wallet in stats:', wErr);
      }

      const walletBalancePKR = memberWallet?.balancePKR ?? Math.max(0, totalDepositsINR - totalWithdrawalsINR + totalBonusesPKR);
      const walletBalanceINR = memberWallet?.balanceINR ?? 0;

      return NextResponse.json({
        totalAssignedSellers: mySellers.length,
        totalDepositsINR,
        totalWithdrawalsINR,
        walletBalancePKR,
        walletBalanceINR,
        memberWallet,
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
