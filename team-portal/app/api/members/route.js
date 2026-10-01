import { NextResponse } from 'next/server';
import { getAuthSession, hashPassword } from '@/lib/auth';
import Member from '@/lib/models/Member';
import SellerAssignment from '@/lib/models/SellerAssignment';
import { Seller, Order } from '@/lib/models/SharedModels';
import RewardClaim from '@/lib/models/RewardClaim';
import { syncEcommerceAdmins } from '@/lib/adminSync';

export const dynamic = 'force-dynamic';

// GET /api/members — list all members with detailed performance metrics (Admin only)
export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden. Admin access required.' }, { status: 403 });
    }

    // Keep all ecommerce admins synchronized
    await syncEcommerceAdmins();

    const members = await Member.find().select('-passwordHash').sort({ role: 1, createdAt: -1 });

    // Aggregate statistics and live multi-currency wallet for each member
    const { getWalletData } = await import('@/lib/utils/wallet');

    const memberStats = await Promise.all(
      members.map(async (m) => {
        const assignments = await SellerAssignment.find({ memberId: m._id, status: 'active' });
        const sellerIds = assignments.map((a) => a.sellerId);

        const sellers = await Seller.find({ _id: { $in: sellerIds } });

        let totalDepositsINR = 0;
        let totalWithdrawalsINR = 0;

        for (const s of sellers) {
          totalDepositsINR += Number(s.wallet?.totalDeposited || 0);
          totalWithdrawalsINR += Number(s.wallet?.totalWithdrawn || 0);
        }

        // Pending orders for assigned sellers
        const pendingOrdersCount = await Order.countDocuments({
          seller: { $in: sellerIds },
          status: { $in: ['pending', 'processing', 'unfulfilled'] },
        });

        // Total approved bonuses in PKR
        const bonusAgg = await RewardClaim.aggregate([
          { $match: { memberId: m._id, status: 'approved' } },
          { $group: { _id: null, total: { $sum: '$amountPKR' } } },
        ]);
        const totalBonusesPKR = bonusAgg[0]?.total || 0;

        // Get exact calculated wallet (INR + PKR) including 50% split rules and payouts
        let walletBalances = {
          balanceINR: 0,
          balancePKR: 0,
          totalEarnedINR: 0,
          totalEarnedPKR: 0,
          totalWithdrawnINR: 0,
          totalWithdrawnPKR: 0,
        };

        try {
          const wData = await getWalletData({ userId: m._id });
          walletBalances = wData.balances;
        } catch (wErr) {
          console.error(`Error computing wallet for member ${m._id}:`, wErr);
        }

        return {
          ...m.toObject(),
          totalClients: sellers.length,
          totalDepositsINR,
          totalWithdrawalsINR,
          totalBonusesPKR,
          netBalancePKR: walletBalances.balancePKR,
          wallet: walletBalances,
          pendingOrdersCount,
        };
      })
    );

    return NextResponse.json({ members: memberStats });
  } catch (err) {
    console.error('Fetch members error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}

// POST /api/members — Admin creates a new team member
export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden. Admin access required.' }, { status: 403 });
    }

    const { name, username, password, phone, role, commissionLabel } = await req.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ message: 'Member name is required' }, { status: 400 });
    }

    // Auto-generate username and password if not provided
    const cleanName = name.trim();
    const cleanUsername = (username || cleanName.toLowerCase().replace(/[^a-z0-9]/g, '') + Math.floor(100 + Math.random() * 900)).trim();
    const cleanPassword = password || 'member123';
    const cleanCommissionLabel = ['inr_50', 'pkr_1to1'].includes(commissionLabel) ? commissionLabel : 'pkr_1to1';

    const existing = await Member.findOne({ username: cleanUsername });
    if (existing) {
      return NextResponse.json({ message: `Username "${cleanUsername}" is already taken` }, { status: 400 });
    }

    const passwordHash = await hashPassword(cleanPassword);

    const newMember = await Member.create({
      name: cleanName,
      username: cleanUsername,
      passwordHash,
      plainPassword: cleanPassword,
      phone: phone || '',
      role: role || 'member',
      commissionLabel: cleanCommissionLabel,
      wallet: {
        balancePKR: 0,
        totalDepositsPKR: 0,
        totalWithdrawalsPKR: 0,
        totalBonusesPKR: 0,
      },
    });

    const safeMember = newMember.toObject();
    delete safeMember.passwordHash;

    return NextResponse.json({
      message: 'Member created successfully',
      member: safeMember,
    }, { status: 201 });
  } catch (err) {
    console.error('Create member error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
