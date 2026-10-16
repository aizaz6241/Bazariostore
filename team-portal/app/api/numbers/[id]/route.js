import { getAuthSession } from '@/lib/auth';
import WaNumber from '@/lib/models/WaNumber';
import Member from '@/lib/models/Member';
import { ok, fail, clean, money, dateOrNull, byOf, sid, isOid, addMonth } from '@/lib/utils/routeHelpers';
import { phoneKey, phoneDisplay } from '@/lib/utils/phone';

export const dynamic = 'force-dynamic';

const HISTORY_KEEP = 200;
const RENEWALS_KEEP = 120;

function notify(memberIds, payload) {
  import('@/lib/utils/push')
    .then(({ sendPushToUser }) => memberIds.forEach((id) => sendPushToUser(id, { url: '/leads', type: 'numbers', ...payload }).catch(() => {})))
    .catch(() => {});
}

const nameOf = (n) => `${n.label ? `${n.label} · ` : ''}${n.number}`;

/**
 * PATCH /api/numbers/:id  { action, ... }   (admins only)
 *
 *   edit     number details / cost / renewal date / notes
 *   link     { memberId, primary?, device? }  give the number to one more member
 *   device   { memberId, device }    which mobile this member has the number logged in on
 *   unlink   { memberId }            take it back from a member
 *   primary  { memberId }            mark whose phone the number is on
 *   status   { status: banned|active|inactive, reason? }
 *   replace  { number, label?, country? }  banned / changed: a new number takes its place and
 *            every holder moves to it
 *   renew    { amount?, currency?, paidAt? }  subscription paid → next renewal one month later
 *   note     { text }
 */
export async function PATCH(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session || session.role !== 'admin') return fail('Forbidden. Admin access required.', 403);
    if (!isOid(params.id)) return fail('Number not found', 404);

    const doc = await WaNumber.findById(params.id);
    if (!doc) return fail('Number not found', 404);

    const body = await req.json();
    const who = byOf(session);
    const log = (type, text, memberId = null) => doc.history.push({ type, ...who, memberId, text });
    let message = 'Saved.';

    switch (body.action) {
      case 'edit': {
        const changes = [];
        if (body.number !== undefined) {
          const key = phoneKey(body.number);
          if (!key) return fail('Please type a valid WhatsApp number (with country code).');
          if (key !== doc.numberKey) {
            const taken = await WaNumber.exists({ numberKey: key, _id: { $ne: doc._id } });
            if (taken) return fail('Another entry already has this number.', 409);
            changes.push(`number ${doc.number} → ${phoneDisplay(body.number)}`);
            doc.number = phoneDisplay(body.number);
            doc.numberKey = key;
          }
        }
        const set = (field, value, label) => {
          if (value === undefined) return;
          const before = doc[field];
          const same = before instanceof Date || value instanceof Date ? String(before?.getTime?.() ?? '') === String(value?.getTime?.() ?? '') : String(before ?? '') === String(value ?? '');
          if (same) return;
          doc[field] = value;
          changes.push(label);
        };
        set('country', body.country !== undefined ? clean(body.country, 30).toUpperCase() : undefined, 'country');
        set('label', body.label !== undefined ? clean(body.label, 60) : undefined, 'name');
        set('provider', body.provider !== undefined ? clean(body.provider, 80) : undefined, 'bought from');
        if (body.appType !== undefined) {
          const t = ['', 'business', 'normal'].includes(body.appType) ? body.appType : '';
          if (t !== (doc.appType || '')) {
            doc.appType = t;
            changes.push(`app ${t ? (t === 'business' ? 'WhatsApp Business' : 'normal WhatsApp') : 'not set'}`);
          }
        }
        if (body.purchasedById !== undefined) {
          let next = { memberId: null, name: '' };
          if (body.purchasedById) {
            const buyer = isOid(body.purchasedById) ? await Member.findById(body.purchasedById).select('name').lean() : null;
            if (!buyer) return fail('Choose who bought the number.');
            next = { memberId: buyer._id, name: buyer.name };
          }
          if (sid(next.memberId) !== sid(doc.purchasedBy?.memberId)) {
            doc.purchasedBy = next;
            changes.push(`bought by ${next.name || 'not set'}`);
          }
        }
        set('monthlyCost', body.monthlyCost !== undefined ? money(body.monthlyCost) : undefined, `monthly cost ${money(body.monthlyCost)}`);
        set('currency', body.currency !== undefined ? clean(body.currency, 8).toUpperCase() : undefined, 'currency');
        set('nextRenewalAt', body.nextRenewalAt !== undefined ? dateOrNull(body.nextRenewalAt) : undefined, 'renewal date');
        set('notes', body.notes !== undefined ? clean(body.notes, 1000) : undefined, 'notes');
        if (changes.length) log('edited', `Changed: ${changes.join(', ')}`);
        break;
      }

      case 'link': {
        if (doc.status !== 'active') return fail('Only an active number can be given to a member.');
        if (!isOid(body.memberId)) return fail('Choose a member.');
        const m = await Member.findById(body.memberId).select('name active').lean();
        if (!m || !m.active) return fail('Member not found.');
        if (doc.holders.some((h) => sid(h.memberId) === sid(m._id))) return fail(`${m.name} already has this number.`);
        const primary = Boolean(body.primary) || doc.holders.length === 0;
        if (primary) doc.holders.forEach((h) => (h.primary = false));
        const device = clean(body.device, 60);
        doc.holders.push({ memberId: m._id, name: m.name, primary, device, since: new Date() });
        log('linked', `Linked to ${m.name}${primary ? ' (main phone)' : ''}${device ? ` on ${device}` : ''}`, m._id);
        notify([m._id], { title: '📱 WhatsApp number linked to you', body: `${nameOf(doc)} is now linked to you. Use it for your leads.` });
        message = `Linked to ${m.name}.`;
        break;
      }

      case 'unlink': {
        const h = doc.holders.find((x) => sid(x.memberId) === sid(body.memberId));
        if (!h) return fail('This member does not have this number.');
        doc.holders = doc.holders.filter((x) => sid(x.memberId) !== sid(body.memberId));
        if (h.primary && doc.holders.length) doc.holders[0].primary = true;
        log('unlinked', `Removed from ${h.name}`, h.memberId);
        notify([h.memberId], { title: '📱 WhatsApp number removed', body: `${nameOf(doc)} is no longer linked to you. Please log it out of your phone.` });
        message = `Removed from ${h.name}.`;
        break;
      }

      case 'device': {
        const h = doc.holders.find((x) => sid(x.memberId) === sid(body.memberId));
        if (!h) return fail('This member does not have this number.');
        const device = clean(body.device, 60);
        if ((h.device || '') === device) break;
        log('edited', `${h.name}'s mobile: ${h.device || 'not set'} → ${device || 'not set'}`, h.memberId);
        h.device = device;
        doc.markModified('holders');
        message = 'Mobile saved.';
        break;
      }

      case 'primary': {
        const h = doc.holders.find((x) => sid(x.memberId) === sid(body.memberId));
        if (!h) return fail('This member does not have this number.');
        doc.holders.forEach((x) => (x.primary = sid(x.memberId) === sid(body.memberId)));
        log('primary', `Main phone is now ${h.name}`, h.memberId);
        break;
      }

      case 'status': {
        const next = String(body.status || '');
        if (!['banned', 'active', 'inactive'].includes(next)) return fail('Unknown status.');
        if (doc.status === 'replaced' && next === 'active') return fail('This number was replaced by a new one; add it again as a new number if it is back.');
        if (next === doc.status) break;
        const reason = clean(body.reason, 300);
        if (next === 'banned') {
          doc.bannedAt = new Date();
          doc.banReason = reason;
          notify(doc.holders.map((h) => h.memberId), {
            title: '⛔ WhatsApp number banned',
            body: `${nameOf(doc)} has been banned. Stop using it; the admins will give you a new one.`,
          });
        }
        if (next === 'active') {
          doc.bannedAt = null;
          doc.banReason = '';
        }
        log(next, `Marked ${next}${reason ? `: ${reason}` : ''}`);
        doc.status = next;
        message = `Marked ${next}.`;
        break;
      }

      case 'replace': {
        const key = phoneKey(body.number);
        if (!key) return fail('Type the new WhatsApp number (with country code).');
        if (key === doc.numberKey) return fail('That is the same number.');
        const taken = await WaNumber.findOne({ numberKey: key }).select('_id').lean();
        if (taken) return fail('The new number is already in the list. Link the members to it instead.', 409);

        const holders = doc.holders.map((h) => ({ memberId: h.memberId, name: h.name, primary: h.primary, device: h.device || '', since: new Date() }));
        const fresh = await WaNumber.create({
          number: phoneDisplay(body.number),
          numberKey: key,
          country: clean(body.country ?? doc.country, 30).toUpperCase(),
          label: clean(body.label ?? doc.label, 60),
          provider: doc.provider,
          appType: doc.appType || '',
          purchasedBy: doc.purchasedBy?.memberId ? doc.purchasedBy : { memberId: null, name: '' },
          monthlyCost: body.monthlyCost !== undefined ? money(body.monthlyCost) : doc.monthlyCost,
          currency: doc.currency,
          nextRenewalAt: dateOrNull(body.nextRenewalAt) || null,
          replacesId: doc._id,
          holders,
          createdBy: session._id,
          history: [{ type: 'created', ...who, text: `Added as the replacement of ${doc.number}${holders.length ? `; moved ${holders.map((h) => h.name).join(', ')}` : ''}` }],
        });
        doc.status = 'replaced';
        doc.replacedById = fresh._id;
        log('replaced', `Replaced by ${fresh.number}${holders.length ? `; ${holders.length} member(s) moved to it` : ''}`);
        doc.holders = [];
        notify(holders.map((h) => h.memberId), {
          title: '🔁 New WhatsApp number',
          body: `${doc.number} was replaced by ${fresh.number}. Please link the new number on your phone.`,
        });
        message = `Replaced by ${fresh.number}. ${holders.length} member(s) moved.`;
        break;
      }

      case 'renew': {
        const paidAt = dateOrNull(body.paidAt) || new Date();
        const amount = body.amount !== undefined && body.amount !== '' ? money(body.amount) : doc.monthlyCost;
        const currency = clean(body.currency || doc.currency || 'USD', 8).toUpperCase();
        // the new period starts where the paid one ended (paying early does not lose days)
        const from = doc.nextRenewalAt && doc.nextRenewalAt > paidAt ? doc.nextRenewalAt : paidAt;
        const periodEnd = addMonth(from);
        doc.renewals.push({ at: paidAt, amount, currency, periodEnd, ...who });
        if (doc.renewals.length > RENEWALS_KEEP) doc.renewals = doc.renewals.slice(-RENEWALS_KEEP);
        doc.nextRenewalAt = periodEnd;
        log('renewed', `Subscription renewed: ${amount} ${currency}, next renewal ${periodEnd.toISOString().slice(0, 10)}`);
        message = `Renewed until ${periodEnd.toISOString().slice(0, 10)}.`;
        break;
      }

      case 'note': {
        const text = clean(body.text, 600);
        if (!text) return fail('Write the note first.');
        log('note', text);
        break;
      }

      default:
        return fail('Unknown action.');
    }

    if (doc.history.length > HISTORY_KEEP) doc.history = doc.history.slice(-HISTORY_KEEP);
    await doc.save();
    return ok({ message, number: doc });
  } catch (err) {
    if (err?.code === 11000) return fail('Another entry already has this number.', 409);
    console.error('Number update error:', err);
    return fail(err.message, 500);
  }
}
