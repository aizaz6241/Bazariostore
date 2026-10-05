import { NextResponse } from 'next/server';
import { getAuthSession, hashPassword } from '@/lib/auth';
import Member from '@/lib/models/Member';
import SellerAssignment from '@/lib/models/SellerAssignment';
import { Seller, Order, CLIENT_SELLER_FILTER } from '@/lib/models/SharedModels';
import RewardClaim from '@/lib/models/RewardClaim';
import { syncEcommerceAdmins } from '@/lib/adminSync';
import { loadTeamStats } from '@/lib/utils/teamStats';
import { logFinance, flushFinanceAlertsSoon } from '@/lib/utils/financeLog';
import crypto from 'crypto';

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
    // No shared default password any more: when none is typed, a random one is made and shown once.
    const typedPassword = typeof password === 'string' ? password.trim() : '';
    if (typedPassword && typedPassword.length < 6) {
      return NextResponse.json({ message: 'Password must be at least 6 characters long' }, { status: 400 });
    }
    const generatedPassword = typedPassword ? '' : crypto.randomBytes(9).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 10);
    const cleanPassword = typedPassword || generatedPassword;
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
      // Partners (admins) come only from the store admin panel's Staff list. Anyone created here
      // is a team member: an extra admin would pause every finance split.
      role: 'member',
      commissionLabel: cleanCommissionLabel,
      wallet: {
        balancePKR: 0,
        totalDepositsPKR: 0,
        totalWithdrawalsPKR: 0,
        totalBonusesPKR: 0,
      },
    });

    await logFinance({
      session,
      action: 'member.created',
      summary: `Created member “${cleanName}” (${cleanCommissionLabel === 'inr_50' ? '50% member' : '1:1 PKR member'})`,
      entity: 'member',
      entityId: newMember._id,
      after: { name: cleanName, username: cleanUsername, deal: cleanCommissionLabel },
    });
    await flushFinanceAlertsSoon();

    const safeMember = newMember.toObject();
    delete safeMember.passwordHash;

    return NextResponse.json({
      message: generatedPassword
        ? `Member created. Username: ${cleanUsername} — Password: ${generatedPassword} (shown only once, note it down now).`
        : 'Member created successfully',
      member: safeMember,
      generatedPassword,
    }, { status: 201 });
  } catch (err) {
    console.error('Create member error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
