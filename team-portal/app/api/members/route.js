import { NextResponse } from 'next/server';
import { getAuthSession, hashPassword } from '@/lib/auth';
import Member from '@/lib/models/Member';
import SellerAssignment from '@/lib/models/SellerAssignment';
import { Seller, Order, CLIENT_SELLER_FILTER } from '@/lib/models/SharedModels';
import RewardClaim from '@/lib/models/RewardClaim';
import { syncEcommerceAdmins } from '@/lib/adminSync';
import { loadTeamStats } from '@/lib/utils/teamStats';

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

    const members = await Member.find().select('-passwordHash -plainPassword').sort({ role: 1, createdAt: -1 }).lean();

    // One batch for the whole team (was several queries per member)
    const team = await loadTeamStats(members);

    const memberStats = members.map((m) => {
      const t = team.get(String(m._id));
      return {
        ...m,
        totalClients: t.sellers.length,
        totalDepositsINR: t.totalDeposits,
        totalWithdrawalsINR: t.totalWithdrawals,
        totalBonusesPKR: t.totalBonusesPKR,
        netBalancePKR: t.wallet.balancePKR,
        wallet: t.wallet,
        pendingOrdersCount: t.pendingOrdersCount,
      };
    });

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
