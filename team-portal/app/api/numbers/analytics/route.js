import { getAuthSession } from '@/lib/auth';
import WaNumber from '@/lib/models/WaNumber';
import Lead from '@/lib/models/Lead';
import { ok, fail, sid } from '@/lib/utils/routeHelpers';

export const dynamic = 'force-dynamic';

const DAY = 86400000;
const monthKey = (d) => new Date(d).toISOString().slice(0, 7);

/**
 * GET /api/numbers/analytics  (admins only)
 * Costs, renewals, bans and how much each number is used for leads. Tracking only: none of
 * these amounts touch the finance ledger.
 */
export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session || session.role !== 'admin') return fail('Forbidden. Admin access required.', 403);

    const [numbers, leadUse] = await Promise.all([
      WaNumber.find({}).select('number label country status monthlyCost currency nextRenewalAt holders renewals bannedAt createdAt').lean(),
      Lead.aggregate([
        { $match: { waNumberId: { $ne: null } } },
        {
          $group: {
            _id: '$waNumberId',
            leads: { $sum: 1 },
            converted: { $sum: { $cond: [{ $eq: ['$status', 'converted'] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const now = Date.now();
    const byStatus = { active: 0, banned: 0, replaced: 0, inactive: 0 };
    const countries = new Map();
    const monthlyByCurrency = new Map();
    const holdersPerMember = new Map();
    let dueSoon = 0;
    let overdue = 0;
    const upcoming = [];
    const lifetimes = [];

    // last 6 calendar months, oldest first
    const months = [];
    const base = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1));
      months.push({ key: monthKey(d), short: d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }), full: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) });
    }
    const spendByMonth = new Map(); // currency -> Map(month -> amount)
    const bansByMonth = new Map(months.map((m) => [m.key, 0]));
    const addedByMonth = new Map(months.map((m) => [m.key, 0]));

    for (const n of numbers) {
      byStatus[n.status] = (byStatus[n.status] || 0) + 1;
      if (addedByMonth.has(monthKey(n.createdAt))) addedByMonth.set(monthKey(n.createdAt), addedByMonth.get(monthKey(n.createdAt)) + 1);
      if (n.bannedAt && bansByMonth.has(monthKey(n.bannedAt))) bansByMonth.set(monthKey(n.bannedAt), bansByMonth.get(monthKey(n.bannedAt)) + 1);
      if (n.bannedAt) lifetimes.push((new Date(n.bannedAt) - new Date(n.createdAt)) / DAY);

      for (const r of n.renewals || []) {
        const k = monthKey(r.at);
        const cur = r.currency || 'USD';
        if (!spendByMonth.has(cur)) spendByMonth.set(cur, new Map());
        const m = spendByMonth.get(cur);
        m.set(k, (m.get(k) || 0) + (Number(r.amount) || 0));
      }

      if (n.status !== 'active') continue;
      const c = n.country || '—';
      countries.set(c, (countries.get(c) || 0) + 1);
      const cur = n.currency || 'USD';
      monthlyByCurrency.set(cur, (monthlyByCurrency.get(cur) || 0) + (Number(n.monthlyCost) || 0));
      for (const h of n.holders || []) {
        const k = sid(h.memberId);
        const e = holdersPerMember.get(k) || { id: k, name: h.name || 'Member', value: 0 };
        e.value += 1;
        holdersPerMember.set(k, e);
      }
      if (n.nextRenewalAt) {
        const left = (new Date(n.nextRenewalAt).getTime() - now) / DAY;
        if (left < 0) overdue += 1;
        else if (left <= 7) dueSoon += 1;
        if (left <= 14) {
          upcoming.push({ _id: sid(n._id), number: n.number, label: n.label, country: n.country, nextRenewalAt: n.nextRenewalAt, monthlyCost: n.monthlyCost, currency: cur, daysLeft: Math.ceil(left) });
        }
      }
    }

    const useOf = new Map(leadUse.map((u) => [sid(u._id), u]));
    const usage = numbers
      .map((n) => {
        const u = useOf.get(sid(n._id));
        return { id: sid(n._id), name: n.label ? `${n.label} (${n.number})` : n.number, status: n.status, leads: u?.leads || 0, converted: u?.converted || 0 };
      })
      .filter((x) => x.leads > 0)
      .sort((a, b) => b.leads - a.leads)
      .slice(0, 12);

    return ok({
      total: numbers.length,
      byStatus,
      countries: [...countries.entries()].map(([name, value]) => ({ id: name, name, value })).sort((a, b) => b.value - a.value),
      monthly: [...monthlyByCurrency.entries()].map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 })).sort((a, b) => b.amount - a.amount),
      dueSoon,
      overdue,
      upcoming: upcoming.sort((a, b) => a.daysLeft - b.daysLeft),
      holders: [...holdersPerMember.values()].sort((a, b) => b.value - a.value),
      avgDaysBeforeBan: lifetimes.length ? Math.round(lifetimes.reduce((s, x) => s + x, 0) / lifetimes.length) : null,
      months,
      spend: [...spendByMonth.entries()].map(([currency, m]) => ({ currency, values: months.map((x) => Math.round((m.get(x.key) || 0) * 100) / 100) })),
      bans: months.map((x) => bansByMonth.get(x.key) || 0),
      added: months.map((x) => addedByMonth.get(x.key) || 0),
      usage,
    });
  } catch (err) {
    console.error('Numbers analytics error:', err);
    return fail(err.message, 500);
  }
}
