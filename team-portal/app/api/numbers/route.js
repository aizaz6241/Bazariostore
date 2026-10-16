import { getAuthSession } from '@/lib/auth';
import WaNumber from '@/lib/models/WaNumber';
import Member from '@/lib/models/Member';
import Lead from '@/lib/models/Lead';
import { ok, fail, clean, money, dateOrNull, byOf, sid, isOid } from '@/lib/utils/routeHelpers';
import { phoneKey, phoneDisplay } from '@/lib/utils/phone';

export const dynamic = 'force-dynamic';

const APP_TYPES = ['', 'business', 'normal'];

/** memberId → the mobile names already written for that member's numbers */
function deviceSuggestions(numbers) {
  const out = {};
  for (const n of numbers) {
    for (const h of n.holders || []) {
      const d = (h.device || '').trim();
      if (!d) continue;
      const k = sid(h.memberId);
      (out[k] = out[k] || new Set()).add(d);
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort((a, b) => a.localeCompare(b))]));
}

/**
 * GET /api/numbers
 *   admin  → every company WhatsApp number, who holds it, its leads / conversions, + the people
 *            it can be linked to
 *   member → only the numbers linked to him (to pick one on a lead)
 */
export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return fail('Unauthorized', 401);

    if (session.role !== 'admin') {
      const mine = await WaNumber.find({ 'holders.memberId': session._id, status: 'active' })
        .select('number country label status')
        .sort({ country: 1, label: 1 })
        .lean();
      return ok({ numbers: mine.map((n) => ({ _id: sid(n._id), number: n.number, country: n.country, label: n.label, status: n.status })) });
    }

    const [numbers, members, leadStats] = await Promise.all([
      WaNumber.find({}).sort({ status: 1, country: 1, createdAt: -1 }).lean(),
      Member.find({ active: true }).select('name role').sort({ role: 1, name: 1 }).lean(),
      Lead.aggregate([
        { $match: { waNumberId: { $ne: null } } },
        { $group: { _id: '$waNumberId', leads: { $sum: 1 }, converted: { $sum: { $cond: [{ $eq: ['$status', 'converted'] }, 1, 0] } } } },
      ]),
    ]);
    const statsOf = new Map(leadStats.map((s) => [sid(s._id), s]));

    return ok({
      numbers: numbers.map((n) => ({
        ...n,
        _id: sid(n._id),
        history: (n.history || []).slice(-40).reverse(),
        renewals: (n.renewals || []).slice(-24).reverse(),
        leads: statsOf.get(sid(n._id))?.leads || 0,
        converted: statsOf.get(sid(n._id))?.converted || 0,
      })),
      members: members.map((m) => ({ _id: sid(m._id), name: m.name, role: m.role })),
      // names already used, offered as suggestions so the same phone / platform is not typed two ways
      devices: deviceSuggestions(numbers),
      platforms: [...new Set(numbers.map((n) => (n.provider || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    });
  } catch (err) {
    console.error('Numbers list error:', err);
    return fail(err.message, 500);
  }
}

/** POST /api/numbers — add a company WhatsApp number (admins only). */
export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session || session.role !== 'admin') return fail('Forbidden. Admin access required.', 403);

    const body = await req.json();
    const number = phoneDisplay(body.number);
    const numberKey = phoneKey(body.number);
    if (!numberKey) return fail('Please type a valid WhatsApp number (with country code).');

    const existing = await WaNumber.findOne({ numberKey }).select('number status label').lean();
    if (existing) return fail(`This number is already in the list${existing.label ? ` as "${existing.label}"` : ''} (${existing.status}).`, 409);

    const who = byOf(session);
    let purchasedBy = { memberId: null, name: '' };
    if (body.purchasedById) {
      const buyer = isOid(body.purchasedById) ? await Member.findById(body.purchasedById).select('name').lean() : null;
      if (!buyer) return fail('Choose who bought the number.');
      purchasedBy = { memberId: buyer._id, name: buyer.name };
    }
    const appType = APP_TYPES.includes(body.appType) ? body.appType : '';
    const doc = await WaNumber.create({
      number,
      numberKey,
      country: clean(body.country, 30).toUpperCase(),
      label: clean(body.label, 60),
      provider: clean(body.provider, 80),
      purchasedBy,
      appType,
      monthlyCost: money(body.monthlyCost),
      currency: clean(body.currency || 'USD', 8).toUpperCase(),
      nextRenewalAt: dateOrNull(body.nextRenewalAt),
      notes: clean(body.notes, 1000),
      createdBy: session._id,
      history: [{ type: 'created', ...who, text: `Number added${body.monthlyCost ? ` (${money(body.monthlyCost)} ${clean(body.currency || 'USD', 8).toUpperCase()}/month)` : ''}` }],
    });
    return ok({ message: 'Number added.', number: doc }, 201);
  } catch (err) {
    if (err?.code === 11000) return fail('This number is already in the list.', 409);
    console.error('Number create error:', err);
    return fail(err.message, 500);
  }
}
