import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import Member from '@/lib/models/Member';
import SellerAssignment from '@/lib/models/SellerAssignment';
import { Seller, Order, CLIENT_SELLER_FILTER } from '@/lib/models/SharedModels';
import RewardClaim from '@/lib/models/RewardClaim';
import { syncEcommerceAdmins } from '@/lib/adminSync';
import { loadTeamStats, OPEN_ORDER_STATUSES } from '@/lib/utils/teamStats';
import { getWalletBalancesMap, EMPTY_WALLET } from '@/lib/utils/wallet';
import { getLedgerStats, dashboardFinance } from '@/lib/utils/ledgerStats';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    if (session.role === 'admin') {
      await syncEcommerceAdmins();

      const [totalSellers, ledgerStats, pendingClaimsCount, pendingOrdersCount, allMembers] = await Promise.all([
        Seller.countDocuments(CLIENT_SELLER_FILTER),
        getLedgerStats(),
        RewardClaim.countDocuments({ status: 'pending' }),
        Order.countDocuments({ status: { $in: OPEN_ORDER_STATUSES } }),
        Member.find({ role: 'member', active: true }).select('name username phone avatar').lean(),
      ]);

      // All money on this screen is REAL BINANCE USDT from the finance ledger. (The fields keep
      // their old "...INR" names so every screen that reads them keeps working.)
      const finance = dashboardFinance(ledgerStats);
      const totalDepositsINR = finance.inUSDT;
      const totalWithdrawalsINR = finance.outUSDT;
      const netFundsINR = finance.balanceUSDT;

      // One batch for the whole team (was several queries per member)
      const [team, wallets] = await Promise.all([loadTeamStats(allMembers), getWalletBalancesMap().catch(() => new Map())]);

      const staffList = allMembers.map((m) => {
        const t = team.get(String(m._id));
        const mWallet = t.wallet;
        return {
          _id: m._id,
          name: m.name,
          username: m.username,
          phone: m.phone,
          avatar: m.avatar,
          assignedSellersCount: t.sellers.length,
          totalDepositsINR: t.totalDeposits,
          totalWithdrawalsINR: t.totalWithdrawals,
          netVolumeINR: t.totalDeposits - t.totalWithdrawals,
          depositsCount: t.depositsCount || 0,
          earnedUSDT: mWallet.totalEarnedUSDT || 0,
          totalBonusesPKR: t.totalBonusesPKR,
          walletBalanceUSDT: mWallet.balanceUSDT || 0,
          walletBalancePKR: mWallet.balancePKR,
          walletBalanceINR: mWallet.balanceINR,
          wallet: mWallet,
          pendingOrdersCount: t.pendingOrdersCount,
        };
      });

      let topDepositor = null;
      let topWithdrawer = null;
      let topEarner = null;
      let topSellerManager = null;
      let totalStaffEarningsPKR = 0;
      let totalStaffEarningsINR = 0;
      let totalStaffBonusesPKR = 0;
      let totalStaffEarningsUSDT = 0;

      if (staffList.length > 0) {
        topDepositor = [...staffList].sort((a, b) => b.totalDepositsINR - a.totalDepositsINR)[0];
        topWithdrawer = [...staffList].sort((a, b) => b.totalWithdrawalsINR - a.totalWithdrawalsINR)[0];
        topEarner = [...staffList].sort((a, b) => b.earnedUSDT - a.earnedUSDT || b.walletBalanceUSDT - a.walletBalanceUSDT)[0];
        topSellerManager = [...staffList].sort((a, b) => b.assignedSellersCount - a.assignedSellersCount)[0];

        staffList.forEach((s) => {
          totalStaffEarningsPKR += s.walletBalancePKR || 0;
          totalStaffEarningsINR += s.walletBalanceINR || 0;
          totalStaffBonusesPKR += s.totalBonusesPKR;
          totalStaffEarningsUSDT += s.walletBalanceUSDT || 0;
        });
      }

      const adminWallet = wallets.get(String(session._id)) || { ...EMPTY_WALLET };

      return NextResponse.json({
        totalMembers: allMembers.length,
        totalSellers,
        totalDepositsINR,
        totalWithdrawalsINR,
        netFundsINR,
        pendingClaimsCount,
        pendingOrdersCount,
        adminWallet,
        finance,
        staffAnalytics: {
          staffList: staffList.sort((a, b) => b.totalDepositsINR - a.totalDepositsINR),
          topDepositor,
          topWithdrawer,
          topEarner,
          topSellerManager,
          totalStaffEarningsPKR,
          totalStaffEarningsINR,
          totalStaffEarningsUSDT,
          totalStaffBonusesPKR,
        },
      });
    }

    // ─── Member dashboard ───
    const me = { _id: session._id };
    const [team, ledgerStats, pendingClaimsCount] = await Promise.all([
      loadTeamStats([me]),
      getLedgerStats(),
      RewardClaim.countDocuments({ memberId: session._id, status: 'pending' }),
    ]);
    const mine = team.get(String(session._id));
    const memberWallet = mine.wallet;

    return NextResponse.json({
      totalAssignedSellers: mine.sellers.length,
      totalDepositsINR: mine.totalDeposits,
      totalWithdrawalsINR: mine.totalWithdrawals,
      walletBalanceUSDT: memberWallet.balanceUSDT ?? 0,
      walletBalancePKR: memberWallet.balancePKR ?? 0,
      walletBalanceINR: memberWallet.balanceINR ?? 0,
      memberWallet,
      finance: dashboardFinance(ledgerStats, { ownerId: String(session._id) }),
      totalBonusesPKR: mine.totalBonusesPKR,
      pendingOrdersCount: mine.pendingOrdersCount,
      pendingClaimsCount,
    });
  } catch (err) {
    console.error('Fetch stats error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
