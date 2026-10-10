import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import Member from '@/lib/models/Member';
import SellerAssignment from '@/lib/models/SellerAssignment';
import { buildLedger } from '@/lib/utils/finance';

export const dynamic = 'force-dynamic';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sid = (v) => (v ? String(v) : '');
const IST = 330 * 60000;
const monthKey = (d) => new Date(new Date(d).getTime() + IST).toISOString().slice(0, 7);

// GET /api/referrals — the members a person brought, with totals and his commission.
// A member sees only his own; an admin sees every referrer. Never shown: the referred member's
// wallet, payouts, seller names or payment proofs.
export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const isAdmin = session.role === 'admin';

    const referred = await Member.find(isAdmin ? { referredBy: { $ne: null } } : { referredBy: session._id })
      .select('name username referredBy referralPct referralSetAt createdAt active')
      .sort({ createdAt: -1 })
      .lean();
    if (!referred.length) return NextResponse.json({ groups: [] });

    const referrerIds = [...new Set(referred.map((m) => sid(m.referredBy)))];
    const [referrers, assigns, ledger] = await Promise.all([
      Member.find({ _id: { $in: referrerIds } }).select('name username active').lean(),
      SellerAssignment.find({ memberId: { $in: referred.map((m) => m._id) }, status: 'active' }).select('memberId').lean(),
      buildLedger(),
    ]);
    const sellersOf = new Map();
    for (const a of assigns) sellersOf.set(sid(a.memberId), (sellersOf.get(sid(a.memberId)) || 0) + 1);

    const thisMonth = monthKey(new Date());
    const rows = new Map(
      referred.map((m) => [
        sid(m._id),
        {
          memberId: sid(m._id),
          name: m.name,
          username: m.username,
          active: m.active !== false,
          referrerId: sid(m.referredBy),
          pct: m.referralPct || 0,
          since: m.referralSetAt || m.createdAt,
          sellers: sellersOf.get(sid(m._id)) || 0,
          deposits: 0,
          depositINR: 0,
          depositUSDT: 0,
          withdrawals: 0,
          withdrawINR: 0,
          withdrawUSDT: 0,
          earnedUSDT: 0, // commission from this member's deposits
          paidUSDT: 0, // part of this member's seller withdrawals the referrer paid
          monthEarnedUSDT: 0,
          lastDepositAt: null,
        },
      ])
    );

    for (const e of ledger.entries || []) {
      if (e.kind !== 'deposit' && e.kind !== 'seller_withdrawal') continue;
      const ownerId = sid(e.owner?.id);
      const row = rows.get(ownerId);
      if (!row) continue;
      if (e.kind === 'deposit') {
        row.deposits += 1;
        row.depositINR += Number(e.inr || 0);
        row.depositUSDT += Number(e.usdt || 0);
        if (!row.lastDepositAt || new Date(e.date) > new Date(row.lastDepositAt)) row.lastDepositAt = e.date;
      } else {
        row.withdrawals += 1;
        row.withdrawINR += Number(e.inr || 0);
        row.withdrawUSDT += Number(e.usdt || 0);
      }
      for (const s of e.shares || []) {
        if (sid(s.referralOf) !== ownerId || sid(s.userId) !== row.referrerId) continue;
        if (e.kind === 'deposit') {
          row.earnedUSDT += s.amountUSDT;
          if (monthKey(e.date) === thisMonth) row.monthEarnedUSDT += s.amountUSDT;
        } else {
          row.paidUSDT += s.amountUSDT;
        }
      }
    }

    const groups = referrers
      .map((r) => {
        const list = [...rows.values()]
          .filter((x) => x.referrerId === sid(r._id))
          .map((x) => ({
            ...x,
            depositINR: r2(x.depositINR),
            depositUSDT: r2(x.depositUSDT),
            withdrawINR: r2(x.withdrawINR),
            withdrawUSDT: r2(x.withdrawUSDT),
            earnedUSDT: r2(x.earnedUSDT),
            paidUSDT: r2(x.paidUSDT),
            netUSDT: r2(x.earnedUSDT - x.paidUSDT),
            monthEarnedUSDT: r2(x.monthEarnedUSDT),
          }));
        const sum = (k) => r2(list.reduce((t, x) => t + x[k], 0));
        return {
          referrerId: sid(r._id),
          referrerName: r.name,
          referrerActive: r.active !== false,
          members: list,
          totals: {
            members: list.length,
            deposits: list.reduce((t, x) => t + x.deposits, 0),
            depositINR: sum('depositINR'),
            depositUSDT: sum('depositUSDT'),
            earnedUSDT: sum('earnedUSDT'),
            paidUSDT: sum('paidUSDT'),
            netUSDT: sum('netUSDT'),
            monthEarnedUSDT: sum('monthEarnedUSDT'),
          },
        };
      })
      .sort((a, b) => b.totals.earnedUSDT - a.totals.earnedUSDT);

    return NextResponse.json({ groups });
  } catch (err) {
    console.error('Referrals error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
