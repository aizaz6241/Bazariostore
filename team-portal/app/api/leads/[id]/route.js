import { getAuthSession } from '@/lib/auth';
import Lead, { LOST_REASONS } from '@/lib/models/Lead';
import Member from '@/lib/models/Member';
import WaNumber from '@/lib/models/WaNumber';
import { ok, fail, clean, sid, isOid } from '@/lib/utils/routeHelpers';
import { leadView, historyPush, STATUS_LABEL, duplicateNotice, recordDuplicateAttempt, findStoreByPhone, ensureLeadIndexes } from '@/lib/utils/leads';
import { phoneKey, phoneDisplay } from '@/lib/utils/phone';

export const dynamic = 'force-dynamic';

async function load(session, id) {
  if (!isOid(id)) return null;
  const lead = await Lead.findById(id).lean();
  if (!lead) return null;
  if (session.role !== 'admin' && sid(lead.memberId) !== sid(session._id)) return null; // not his: as if it did not exist
  return lead;
}

/** GET /api/leads/:id — one lead with its history. */
export async function GET(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session) return fail('Unauthorized', 401);
    const lead = await load(session, params.id);
    if (!lead) return fail('Lead not found', 404);
    return ok({ lead: leadView(lead, session, { withHistory: true }) });
  } catch (err) {
    return fail(err.message, 500);
  }
}

/**
 * PATCH /api/leads/:id  { action, ... }
 *   status   { status: contacted|interested|not_converted|new, lostReason? }  (member: own leads)
 *            admin may also set "converted" by hand (store registered with another number)
 *   note     { text }
 *   edit     { name, age, occupation, location, country, source, sourceDetail, phone }
 *            phone: a member can add it once (handover); only an admin can change it later
 *   number   { waNumberId }   the company WhatsApp number used for this lead
 *   assign   { memberId | null }   admins only; a converted lead stays with its store owner
 */
export async function PATCH(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session) return fail('Unauthorized', 401);
    const isAdmin = session.role === 'admin';
    const lead = await load(session, params.id);
    if (!lead) return fail('Lead not found', 404);
    await ensureLeadIndexes();

    const body = await req.json();
    const now = new Date();
    const by = { by: session._id, byName: session.name };
    let set = { lastActivityAt: now };
    let line = null;
    let message = 'Saved.';

    switch (body.action) {
      case 'status': {
        const next = String(body.status || '');
        const allowed = isAdmin ? ['new', 'contacted', 'interested', 'not_converted', 'converted'] : ['new', 'contacted', 'interested', 'not_converted'];
        if (!allowed.includes(next)) return fail(next === 'converted' ? 'A lead becomes “converted” by itself when the seller registers a store.' : 'Unknown status.');
        if (lead.status === 'converted' && lead.sellerId) return fail('This lead already registered a store; its status cannot be changed.');
        if (lead.status === 'converted' && !isAdmin) return fail('Only an admin can change a converted lead.');
        if (!lead.memberId && !isAdmin) return fail('Lead not found', 404);
        if (next === lead.status && next !== 'not_converted') break;

        set.status = next;
        set.statusAt = now;
        if (next !== 'new') set.everContacted = true;
        if (next === 'interested' || next === 'converted') set.everInterested = true;
        set.lostReason = next === 'not_converted' ? (LOST_REASONS.includes(body.lostReason) ? body.lostReason : 'other') : '';
        if (next === 'converted') {
          set.convertedAt = now;
          set.convertedBy = session.name;
          if (body.storeName) set.storeName = clean(body.storeName, 120);
        } else if (lead.status === 'converted') {
          set.convertedAt = null;
          set.convertedBy = '';
        }
        line = { type: 'status', text: `${STATUS_LABEL[lead.status]} → ${STATUS_LABEL[next]}${next === 'not_converted' ? ` (${set.lostReason.replace('_', ' ')})` : ''}` };
        message = `Marked ${STATUS_LABEL[next].toLowerCase()}.`;
        break;
      }

      case 'note': {
        const text = clean(body.text, 600);
        if (!text) return fail('Write the note first.');
        set.notes = text;
        line = { type: 'note', text };
        message = 'Note saved.';
        break;
      }

      case 'edit': {
        const changed = [];
        const put = (field, value, label) => {
          if (value === undefined) return;
          if (String(lead[field] || '') === value) return;
          set[field] = value;
          changed.push(label);
        };
        put('name', body.name !== undefined ? clean(body.name, 120) : undefined, 'name');
        put('age', body.age !== undefined ? clean(body.age, 20) : undefined, 'age');
        put('occupation', body.occupation !== undefined ? clean(body.occupation, 80) : undefined, 'profession');
        put('location', body.location !== undefined ? clean(body.location, 120) : undefined, 'location');
        put('country', body.country !== undefined ? clean(body.country, 30).toUpperCase() : undefined, 'country');
        put('source', body.source !== undefined ? clean(body.source, 30).toLowerCase() : undefined, 'source');
        put('sourceDetail', body.sourceDetail !== undefined ? clean(body.sourceDetail, 160) : undefined, 'group / page');

        // The phone: a member adds it once (a handover waiting for it); after that only an admin
        // can correct it, so nobody can move a lead onto another seller's number.
        let unsetPhone = false;
        if (body.phone !== undefined && phoneKey(body.phone) !== (lead.phoneKey || '')) {
          const key = phoneKey(body.phone);
          if (lead.phoneKey && !isAdmin) return fail('The phone number is already set. Ask an admin if it is wrong.', 403);
          if (lead.sellerId) return fail('This lead is linked to a registered store; its phone cannot be changed.');
          if (!key) {
            // only an admin may empty the phone again, and only on a handover (a wrong number typed)
            if (!(isAdmin && lead.handover && !String(body.phone).trim())) return fail('Type a valid phone number (at least 7 digits).');
            unsetPhone = true;
          } else {
            const other = await Lead.findOne({ phoneKey: key, _id: { $ne: lead._id } }).lean();
            if (other) {
              await recordDuplicateAttempt(other, session);
              return fail(
                isAdmin
                  ? `This number is already another lead${other.memberName ? ` (with ${other.memberName})` : ''}. Open that lead instead.`
                  : 'This number is already with another team member. Please do not continue with this seller and tell an admin.',
                409,
                { duplicate: duplicateNotice(other, session) }
              );
            }
            const store = await findStoreByPhone(key);
            if (store && !isAdmin) return fail('This number already has a store on Bazario. Please tell an admin.', 409);
            set.phone = phoneDisplay(body.phone);
            set.phoneKey = key;
          }
          changed.push(unsetPhone ? 'phone removed' : lead.phoneKey ? `phone → ${set.phone}` : `phone added (${set.phone})`);
        }
        if (!changed.length) break;
        if (unsetPhone) {
          const saved = await Lead.findByIdAndUpdate(
            lead._id,
            { $set: { ...set, phone: '' }, $unset: { phoneKey: 1 }, ...historyPush({ ...by, type: 'edited', text: `Changed ${changed.join(', ')}` }) },
            { new: true }
          ).lean();
          return ok({ message: 'Saved.', lead: leadView(saved, session, { withHistory: true }) });
        }
        line = { type: 'edited', text: lead.handover && !lead.phoneKey && set.phoneKey ? `${session.name} completed the seller's profile: ${changed.join(', ')}` : `Changed ${changed.join(', ')}` };
        message = set.phoneKey && !lead.phoneKey ? 'Number added. This seller is now reserved for this lead.' : 'Details saved.';
        if (set.phoneKey && !lead.phoneKey && lead.handover && !isAdmin) {
          import('@/lib/utils/push')
            .then(({ sendPushToRole }) =>
              sendPushToRole('admin', {
                title: '✅ Handover completed',
                body: `${session.name} added the number of ${set.name || lead.name || 'the seller'} you sent to him.`,
                url: '/leads',
                type: 'leads',
              })
            )
            .catch(() => {});
        }
        break;
      }

      case 'number': {
        if (!body.waNumberId) {
          set.waNumberId = null;
          line = { type: 'number', text: 'WhatsApp number cleared' };
          break;
        }
        if (!isOid(body.waNumberId)) return fail('Choose a number.');
        if (!lead.memberId) return fail('Give this lead to a member first, then choose one of his numbers.');
        // only a number the lead's member really holds
        const n = await WaNumber.findOne({ _id: body.waNumberId, status: 'active', 'holders.memberId': lead.memberId })
          .select('number label')
          .lean();
        if (!n) return fail(isAdmin ? `That WhatsApp number is not linked to ${lead.memberName || 'this member'}.` : 'You can only choose a number that is linked to you.');
        set.waNumberId = n._id;
        line = { type: 'number', text: `Talking from ${n.label ? `${n.label} (${n.number})` : n.number}` };
        break;
      }

      case 'assign': {
        if (!isAdmin) return fail('Only an admin can give a lead to someone.', 403);
        if (lead.status === 'converted') return fail('A converted lead stays with the store’s owner. Change the owner on the Sellers page if needed.');
        if (!body.memberId) {
          if (!lead.memberId) break;
          Object.assign(set, { memberId: null, memberName: '', assignedAt: null, assignedBy: null, waNumberId: null });
          line = { type: 'unassigned', text: `Taken back from ${lead.memberName || 'member'}` };
          message = 'Lead taken back (not given to anyone now).';
          break;
        }
        if (!isOid(body.memberId)) return fail('Choose a member.');
        if (sid(body.memberId) === sid(lead.memberId)) break;
        const m = await Member.findById(body.memberId).select('name active').lean();
        if (!m || !m.active) return fail('Member not found.');
        Object.assign(set, { memberId: m._id, memberName: m.name, assignedAt: now, assignedBy: session._id, waNumberId: null });
        if (lead.status !== 'new') Object.assign(set, { status: 'new', statusAt: now, lostReason: '' }); // fresh start with the new member
        line = { type: 'assigned', text: lead.memberId ? `Moved from ${lead.memberName || 'member'} to ${m.name}` : `Given to ${m.name}` };
        message = `Lead given to ${m.name}.`;
        import('@/lib/utils/push')
          .then(({ sendPushToUser }) => sendPushToUser(m._id, { title: '🎯 New lead for you', body: `${lead.name || lead.phone} has been given to you.`, url: '/leads', type: 'leads' }))
          .catch(() => {});
        break;
      }

      default:
        return fail('Unknown action.');
    }

    const update = { $set: set };
    if (line) Object.assign(update, historyPush({ ...by, ...line }));
    const saved = await Lead.findByIdAndUpdate(lead._id, update, { new: true }).lean();
    return ok({ message, lead: leadView(saved, session, { withHistory: true }) });
  } catch (err) {
    console.error('Lead update error:', err);
    return fail(err.message, 500);
  }
}

/** DELETE /api/leads/:id — admins only, for a lead added by mistake (never a converted one). */
export async function DELETE(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session || session.role !== 'admin') return fail('Forbidden. Admin access required.', 403);
    const lead = await load(session, params.id);
    if (!lead) return fail('Lead not found', 404);
    if (lead.status === 'converted') return fail('A converted lead is kept for the record and cannot be deleted.');
    await Lead.deleteOne({ _id: lead._id });
    return ok({ message: 'Lead deleted.' });
  } catch (err) {
    return fail(err.message, 500);
  }
}
