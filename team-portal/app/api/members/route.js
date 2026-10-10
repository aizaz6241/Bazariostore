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
import { submitAction } from '@/lib/utils/approvals';
import { checkReferral } from '@/lib/utils/referralRules';

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

// POST /api/members — Admin asks to create a new team member. The member is created only when
// the OTHER partner approves (two-person rule). The referral (1:1 members only) is set here, once,
// and can never be changed later.
export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden. Admin access required.' }, { status: 403 });
    }

    const { name, username, password, phone, commissionLabel, referredBy, referralPct } = await req.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ message: 'Member name is required' }, { status: 400 });
    }

    const cleanName = name.trim();
    const cleanUsername = (username || cleanName.toLowerCase().replace(/[^a-z0-9]/g, '') + Math.floor(100 + Math.random() * 900)).trim().toLowerCase();
    // No shared default password: when none is typed, a random one is made and shown once.
    const typedPassword = typeof password === 'string' ? password.trim() : '';
    if (typedPassword && typedPassword.length < 6) {
      return NextResponse.json({ message: 'Password must be at least 6 characters long' }, { status: 400 });
    }
    const generatedPassword = typedPassword ? '' : crypto.randomBytes(9).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 10);
    const cleanPassword = typedPassword || generatedPassword;
    const cleanCommissionLabel = ['inr_50', 'pkr_1to1'].includes(commissionLabel) ? commissionLabel : 'pkr_1to1';

    if (await Member.findOne({ username: cleanUsername }).lean()) {
      return NextResponse.json({ message: `Username "${cleanUsername}" is already taken` }, { status: 400 });
    }

    // Referral: checked now and checked again when the other partner approves
    const hasRef = !!referredBy;
    if (hasRef) {
      const referrer = await Member.findById(referredBy).select('name role active commissionLabel').lean().catch(() => null);
      if (!referrer) return NextResponse.json({ message: 'Referrer not found' }, { status: 400 });
      const chk = checkReferral({ deal: cleanCommissionLabel, referrer, pct: referralPct });
      if (!chk.ok) return NextResponse.json({ message: chk.reason }, { status: 400 });
    }

    const passwordHash = await hashPassword(cleanPassword);
    const out = await submitAction({
      session,
      action: 'member_create',
      payload: {
        name: cleanName,
        username: cleanUsername,
        passwordHash,
        phone: phone || '',
        commissionLabel: cleanCommissionLabel,
        referredBy: hasRef ? String(referredBy) : '',
        referralPct: hasRef ? Number(referralPct) : 0,
      },
      gated: true,
    });

    return NextResponse.json(
      {
        message: `${out.message}${generatedPassword ? ` Username: ${cleanUsername} — Password: ${generatedPassword} (shown only once, note it down now).` : ''}`,
        pending: out.pending,
        username: cleanUsername,
        generatedPassword,
      },
      { status: 202 }
    );
  } catch (err) {
    console.error('Create member error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
