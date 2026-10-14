import { getAuthSession } from '@/lib/auth';
import Lead, { LEAD_STATUSES } from '@/lib/models/Lead';
import Member from '@/lib/models/Member';
import WaNumber from '@/lib/models/WaNumber';
import { ok, fail, clean, sid, isOid, oid } from '@/lib/utils/routeHelpers';
import { phoneKey, phoneDisplay } from '@/lib/utils/phone';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  reconcileLeadConversions,
  leadView,
  duplicateNotice,
  recordDuplicateAttempt,
  findStoreByPhone,
  historyPush,
  ensureLeadIndexes,
  STALE_DAYS,
} from '@/lib/utils/leads';

export const dynamic = 'force-dynamic';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * GET /api/leads?status=&memberId=&q=&origin=&page=&limit=
 *   status: all | unassigned | stale | incomplete | new | contacted | interested | converted | not_converted
 *   (incomplete = a handover still waiting for the seller's number)
 *   A member only ever gets his own leads; the admins get everybody's.
 */
export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return fail('Unauthorized', 401);
    const isAdmin = session.role === 'admin';

    await ensureLeadIndexes();
    await reconcileLeadConversions();

    const sp = new URL(req.url).searchParams;
    const status = sp.get('status') || 'all';
    const page = Math.max(1, parseInt(sp.get('page'), 10) || 1);
    const limit = Math.min(100, Math.max(10, parseInt(sp.get('limit'), 10) || 30));
    const q = clean(sp.get('q'), 80);

    // scope: whose leads
    const scope = {};
    if (!isAdmin) scope.memberId = session._id;
    else if (sp.get('memberId') === 'none') scope.memberId = null;
    else if (isOid(sp.get('memberId'))) scope.memberId = oid(sp.get('memberId'));
    if (['admin', 'member'].includes(sp.get('origin'))) scope.origin = sp.get('origin');

    const filter = { ...scope };
    if (q) {
      const digits = q.replace(/\D+/g, '');
      const or = [
        { name: { $regex: escapeRe(q), $options: 'i' } },
        { storeName: { $regex: escapeRe(q), $options: 'i' } },
        { location: { $regex: escapeRe(q), $options: 'i' } },
        { occupation: { $regex: escapeRe(q), $options: 'i' } },
      ];
      if (digits.length >= 7) or.unshift({ phoneKey: phoneKey(digits) });
      else if (digits.length >= 3) or.push({ phoneKey: { $regex: escapeRe(digits) } });
      filter.$or = or;
    }
    const staleBefore = new Date(Date.now() - STALE_DAYS * 86400000);
    if (LEAD_STATUSES.includes(status)) filter.status = status;
    else if (status === 'unassigned' && isAdmin) filter.memberId = null;
    else if (status === 'incomplete') filter.phoneKey = { $exists: false };
    else if (status === 'stale') {
      filter.status = { $in: ['new', 'contacted', 'interested'] };
      filter.lastActivityAt = { $lt: staleBefore };
      if (!filter.memberId) filter.memberId = { $ne: null };
    }

    const [rows, total, statusCounts, staleCount, unassignedCount, incompleteCount] = await Promise.all([
      Lead.find(filter)
        .select('-history')
        .sort({ lastActivityAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Lead.countDocuments(filter),
      Lead.aggregate([{ $match: scope }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      Lead.countDocuments({ ...scope, memberId: scope.memberId === undefined ? { $ne: null } : scope.memberId, status: { $in: ['new', 'contacted', 'interested'] }, lastActivityAt: { $lt: staleBefore } }),
      isAdmin && scope.memberId === undefined ? Lead.countDocuments({ ...scope, memberId: null }) : Promise.resolve(0),
      Lead.countDocuments({ ...scope, phoneKey: { $exists: false } }),
    ]);

    const counts = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0]));
    statusCounts.forEach((c) => (counts[c._id] = c.n));
    counts.all = Object.values(counts).reduce((s, x) => s + x, 0);
    counts.stale = staleCount;
    counts.unassigned = unassignedCount;
    counts.incomplete = incompleteCount;

    let members = [];
    let numbers = [];
    if (isAdmin) {
      const [ms, ns] = await Promise.all([
        Member.find({ active: true }).select('name role').sort({ role: 1, name: 1 }).lean(),
        WaNumber.find({ status: 'active' }).select('number label country holders.memberId').sort({ country: 1, label: 1 }).lean(),
      ]);
      members = ms.map((m) => ({ _id: sid(m._id), name: m.name, role: m.role }));
      // who holds each number: a lead can only use a number its member really has
      numbers = ns.map((n) => ({ _id: sid(n._id), number: n.number, label: n.label, country: n.country, holders: (n.holders || []).map((h) => sid(h.memberId)) }));
    } else {
      const ns = await WaNumber.find({ 'holders.memberId': session._id, status: 'active' }).select('number label country').lean();
      numbers = ns.map((n) => ({ _id: sid(n._id), number: n.number, label: n.label, country: n.country }));
    }

    return ok({
      leads: rows.map((l) => leadView(l, session)),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      counts,
      members,
      numbers,
    });
  } catch (err) {
    console.error('Leads list error:', err);
    return fail(err.message, 500);
  }
}

/**
 * POST /api/leads — add one lead.
 *   member → the lead is his own (he found it himself)
 *   admin  → given to the chosen member, or left in the pool (not given yet)
 * A number that is already a lead, or already has a store, is refused with who/what has it.
 */
export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return fail('Unauthorized', 401);
    const isAdmin = session.role === 'admin';

    await ensureLeadIndexes();
    const rl = checkRateLimit(`lead-add:${sid(session._id)}`, isAdmin ? 600 : 120, 60 * 60 * 1000);
    if (!rl.allowed) return fail('Too many leads added in the last hour. Please wait a little.', 429);

    const body = await req.json();
    const key = phoneKey(body.phone);
    // Handover (admins only): the seller was given a member's number, so his own number is not
    // known yet. The lead is made with what is known; the member fills in the phone later.
    const handover = isAdmin && !key && Boolean(body.handover);
    if (!key && !handover) {
      return fail(
        isAdmin
          ? 'Type the seller’s WhatsApp / phone number, or tick “I gave him a member’s number” if you do not have it.'
          : 'Type the seller’s WhatsApp / phone number (at least 7 digits).'
      );
    }
    if (handover && !isOid(body.memberId)) return fail('Choose the member whose number you gave to the seller.');
    if (handover && !clean(body.name, 120) && !clean(body.notes, 1000) && !clean(body.sourceDetail, 160)) {
      return fail('Write at least the seller’s name or a note, so the member knows who will message him.');
    }

    const existing = key ? await Lead.findOne({ phoneKey: key }).lean() : null;
    if (existing) {
      await recordDuplicateAttempt(existing, session);
      return fail('This number is already a lead.', 409, { duplicate: duplicateNotice(existing, session) });
    }
    const store = key ? await findStoreByPhone(key) : null;
    if (store) {
      return fail('This seller already has a store on Bazario.', 409, {
        duplicate: {
          taken: true,
          store: true,
          message: isAdmin
            ? `Already a registered store: “${store.storeName}” (${store.status}). Its owner is set on the Sellers page.`
            : 'This seller already has a store on Bazario. Please do not contact them.',
        },
      });
    }

    let member = null;
    if (!isAdmin) member = session;
    else if (isOid(body.memberId)) {
      member = await Member.findById(body.memberId).select('name active').lean();
      if (!member || !member.active) return fail('Choose an active member (or leave it unassigned).');
    }

    // the company number must be one the lead's member really holds
    let waNumberId = null;
    if (isOid(body.waNumberId) && member) {
      const n = await WaNumber.findOne({ _id: body.waNumberId, status: 'active', 'holders.memberId': member._id }).select('_id').lean();
      if (!n) return fail(isAdmin ? `That WhatsApp number is not linked to ${member.name}. Choose one of his numbers.` : 'You can only choose a number that is linked to you.');
      waNumberId = n._id;
    }

    const now = new Date();
    const status = !isAdmin && ['contacted', 'interested'].includes(body.status) ? body.status : 'new';
    const lines = [
      {
        at: now,
        type: 'created',
        by: session._id,
        byName: session.name,
        text: handover
          ? `Handover: ${session.name} gave this seller ${member?.name || 'a member'}’s number`
          : isAdmin
          ? 'Lead added by admin'
          : `${session.name} added this lead (found it himself)`,
      },
    ];
    if (member && isAdmin) lines.push({ at: now, type: 'assigned', by: session._id, byName: session.name, text: `Given to ${member.name}` });

    try {
      const lead = await Lead.create({
        name: clean(body.name, 120),
        phone: key ? phoneDisplay(body.phone) : '',
        ...(key ? { phoneKey: key } : {}),
        age: clean(body.age, 20),
        occupation: clean(body.occupation, 80),
        location: clean(body.location, 120),
        handover,
        country: clean(body.country, 30).toUpperCase(),
        source: clean(body.source || (isAdmin ? 'other' : 'self'), 30).toLowerCase(),
        sourceDetail: clean(body.sourceDetail, 160),
        notes: clean(body.notes, 1000),
        memberId: member ? member._id : null,
        memberName: member ? member.name : '',
        assignedAt: member ? now : null,
        assignedBy: member ? session._id : null,
        origin: isAdmin ? 'admin' : 'member',
        addedBy: session._id,
        addedByName: session.name,
        status,
        statusAt: now,
        everContacted: status !== 'new',
        everInterested: status === 'interested',
        lastActivityAt: now,
        waNumberId,
        history: lines,
      });

      if (member && isAdmin) {
        import('@/lib/utils/push')
          .then(({ sendPushToUser }) =>
            sendPushToUser(
              member._id,
              handover
                ? {
                    title: '📲 A seller will message you',
                    body: `${session.name} gave your number to ${lead.name || 'a seller'}. When he messages you, add his number and details in Leads.`,
                    url: '/leads',
                    type: 'leads',
                  }
                : { title: '🎯 New lead for you', body: `${lead.name || lead.phone} has been given to you.`, url: '/leads', type: 'leads' }
            )
          )
          .catch(() => {});
      }
      return ok({ message: handover ? `Handover saved. ${member.name} will be asked to add the seller’s number and details.` : member && isAdmin ? `Lead added and given to ${member.name}.` : 'Lead added.', lead: leadView(lead.toObject(), session) }, 201);
    } catch (e) {
      if (e?.code === 11000) {
        // two people added the same number at the same moment: the first one keeps it
        const other = await Lead.findOne({ phoneKey: key }).lean();
        if (other) await Lead.updateOne({ _id: other._id }, historyPush({ type: 'duplicate', by: session._id, byName: session.name, text: `${session.name} tried to add this number` }));
        return fail('This number is already a lead.', 409, { duplicate: other ? duplicateNotice(other, session) : null });
      }
      throw e;
    }
  } catch (err) {
    console.error('Lead create error:', err);
    return fail(err.message, 500);
  }
}
