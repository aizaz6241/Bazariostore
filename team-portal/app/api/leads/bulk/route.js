import { getAuthSession } from '@/lib/auth';
import Lead from '@/lib/models/Lead';
import Member from '@/lib/models/Member';
import { Seller, CLIENT_SELLER_FILTER } from '@/lib/models/SharedModels';
import { ok, fail, clean, sid, isOid } from '@/lib/utils/routeHelpers';
import { phoneKey, phoneDisplay } from '@/lib/utils/phone';
import { historyPush } from '@/lib/utils/leads';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const MAX_IMPORT_ADMIN = 2000;
const MAX_IMPORT_MEMBER = 200;
const MAX_ASSIGN = 1000;

/**
 * POST /api/leads/bulk
 *   { action: 'import', rows: [{ name, phone, country, source, sourceDetail, notes }], memberId?, source? }
 *       many leads at once (a pasted list / CSV). Numbers that are already leads or stores are
 *       skipped and listed back. A member's import is always his own.
 *   { action: 'assign', ids: [...], memberId | null }   admins only: give / take back many leads
 */
export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return fail('Unauthorized', 401);
    const isAdmin = session.role === 'admin';
    const body = await req.json();

    if (body.action === 'import') {
      const rl = checkRateLimit(`lead-import:${sid(session._id)}`, isAdmin ? 30 : 10, 60 * 60 * 1000);
      if (!rl.allowed) return fail('Too many imports in the last hour. Please wait a little.', 429);

      const rows = Array.isArray(body.rows) ? body.rows : [];
      const max = isAdmin ? MAX_IMPORT_ADMIN : MAX_IMPORT_MEMBER;
      if (!rows.length) return fail('Nothing to import.');
      if (rows.length > max) return fail(`At most ${max} leads per import. Split the list.`);

      let member = null;
      if (!isAdmin) member = session;
      else if (isOid(body.memberId)) {
        member = await Member.findById(body.memberId).select('name active').lean();
        if (!member || !member.active) return fail('Choose an active member (or leave unassigned).');
      }

      // clean + drop repeats inside the list itself
      const invalid = [];
      const seen = new Set();
      const repeated = [];
      const candidates = [];
      rows.forEach((r, i) => {
        const key = phoneKey(r?.phone);
        if (!key) return invalid.push({ row: i + 1, phone: clean(r?.phone, 40), name: clean(r?.name, 60) });
        if (seen.has(key)) return repeated.push({ row: i + 1, phone: phoneDisplay(r.phone) });
        seen.add(key);
        candidates.push({ key, r });
      });

      const keys = candidates.map((c) => c.key);
      const existing = await Lead.find({ phoneKey: { $in: keys } }).select('phoneKey memberId memberName status name').lean();
      const takenBy = new Map(existing.map((l) => [l.phoneKey, l]));

      // registered stores with one of these numbers
      const stores = await Seller.find({ phone: { $nin: [null, ''] }, ...CLIENT_SELLER_FILTER }).select('phone storeName').lean();
      const storeBy = new Map();
      stores.forEach((s) => {
        const k = phoneKey(s.phone);
        if (k) storeBy.set(k, s.storeName);
      });

      const now = new Date();
      const docs = [];
      const skipped = [];
      for (const { key, r } of candidates) {
        const t = takenBy.get(key);
        if (t) {
          skipped.push({
            phone: phoneDisplay(r.phone),
            name: clean(r.name, 60),
            reason: isAdmin
              ? t.memberId
                ? `already with ${t.memberName || 'a member'} (${t.status.replace('_', ' ')})`
                : 'already in the list (not given yet)'
              : sid(t.memberId) === sid(session._id)
              ? 'already your lead'
              : 'already with another team member — do not contact',
          });
          continue;
        }
        if (storeBy.has(key)) {
          skipped.push({ phone: phoneDisplay(r.phone), name: clean(r.name, 60), reason: isAdmin ? `already a store (${storeBy.get(key)})` : 'already has a store' });
          continue;
        }
        const history = [{ at: now, type: 'created', by: session._id, byName: session.name, text: isAdmin ? 'Imported by admin' : `${session.name} imported this lead (found it himself)` }];
        if (member && isAdmin) history.push({ at: now, type: 'assigned', by: session._id, byName: session.name, text: `Given to ${member.name}` });
        docs.push({
          name: clean(r.name, 120),
          phone: phoneDisplay(r.phone),
          phoneKey: key,
          country: clean(r.country, 30).toUpperCase(),
          source: clean(r.source || body.source || (isAdmin ? 'other' : 'self'), 30).toLowerCase(),
          sourceDetail: clean(r.sourceDetail || body.sourceDetail, 160),
          notes: clean(r.notes, 1000),
          memberId: member ? member._id : null,
          memberName: member ? member.name : '',
          assignedAt: member ? now : null,
          assignedBy: member ? session._id : null,
          origin: isAdmin ? 'admin' : 'member',
          addedBy: session._id,
          addedByName: session.name,
          status: 'new',
          statusAt: now,
          lastActivityAt: now,
          history,
        });
      }

      let added = 0;
      if (docs.length) {
        try {
          const res = await Lead.insertMany(docs, { ordered: false });
          added = res.length;
        } catch (e) {
          // somebody added one of them at the same moment: the rest are still saved
          added = e?.insertedDocs?.length ?? e?.result?.insertedCount ?? 0;
          if (e?.code !== 11000 && !e?.writeErrors) throw e;
        }
      }

      if (added && member && isAdmin) {
        import('@/lib/utils/push')
          .then(({ sendPushToUser }) => sendPushToUser(member._id, { title: '🎯 New leads for you', body: `${added} new lead${added === 1 ? '' : 's'} have been given to you.`, url: '/leads', type: 'leads' }))
          .catch(() => {});
      }

      return ok({
        message: `${added} lead${added === 1 ? '' : 's'} added${skipped.length ? `, ${skipped.length} skipped (already taken)` : ''}${invalid.length ? `, ${invalid.length} without a valid number` : ''}.`,
        added,
        skipped,
        invalid,
        repeated,
      });
    }

    if (body.action === 'assign') {
      if (!isAdmin) return fail('Only an admin can give leads to someone.', 403);
      const ids = (Array.isArray(body.ids) ? body.ids : []).filter(isOid).slice(0, MAX_ASSIGN);
      if (!ids.length) return fail('Select the leads first.');

      let member = null;
      if (body.memberId) {
        if (!isOid(body.memberId)) return fail('Choose a member.');
        member = await Member.findById(body.memberId).select('name active').lean();
        if (!member || !member.active) return fail('Member not found.');
      }

      const now = new Date();
      const filter = { _id: { $in: ids }, status: { $ne: 'converted' }, ...(member ? { memberId: { $ne: member._id } } : { memberId: { $ne: null } }) };
      const set = member
        ? { memberId: member._id, memberName: member.name, assignedAt: now, assignedBy: session._id, waNumberId: null, status: 'new', statusAt: now, lostReason: '', lastActivityAt: now }
        : { memberId: null, memberName: '', assignedAt: null, assignedBy: null, waNumberId: null, lastActivityAt: now };
      const res = await Lead.updateMany(filter, {
        $set: set,
        ...historyPush({ by: session._id, byName: session.name, type: member ? 'assigned' : 'unassigned', text: member ? `Given to ${member.name} (bulk)` : 'Taken back (bulk)' }),
      });
      const n = res.modifiedCount || 0;
      if (n && member) {
        import('@/lib/utils/push')
          .then(({ sendPushToUser }) => sendPushToUser(member._id, { title: '🎯 New leads for you', body: `${n} lead${n === 1 ? '' : 's'} have been given to you.`, url: '/leads', type: 'leads' }))
          .catch(() => {});
      }
      const skipped = ids.length - n;
      return ok({
        message: member
          ? `${n} lead${n === 1 ? '' : 's'} given to ${member.name}${skipped ? ` (${skipped} skipped: converted or already his)` : ''}.`
          : `${n} lead${n === 1 ? '' : 's'} taken back.`,
        changed: n,
      });
    }

    return fail('Unknown action.');
  } catch (err) {
    console.error('Leads bulk error:', err);
    return fail(err.message, 500);
  }
}
