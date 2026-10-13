import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import Lead from '@/lib/models/Lead';
import Member from '@/lib/models/Member';
import { Seller, CLIENT_SELLER_FILTER } from '@/lib/models/SharedModels';
import { phoneKey } from '@/lib/utils/phone';
import { sid } from '@/lib/utils/routeHelpers';

export const STALE_DAYS = 14;
const HISTORY_KEEP = 80;

export const STATUS_LABEL = {
  new: 'New',
  contacted: 'Contacted',
  interested: 'Interested',
  converted: 'Converted to store',
  not_converted: 'Not converted',
};

/**
 * The phone index must skip leads without a number (handovers). A first version of this screen
 * made it without that option; if that one is in the database it is rebuilt once (only the index
 * is rebuilt, no lead is touched).
 */
export async function ensureLeadIndexes() {
  if (global.__leadIndexesOk) return;
  try {
    await connectDB();
    const col = mongoose.connection.db.collection('portalleads');
    const list = await col.indexes().catch(() => []);
    const idx = list.find((i) => i.key && i.key.phoneKey === 1 && Object.keys(i.key).length === 1);
    if (idx && !idx.sparse) {
      await col.dropIndex(idx.name);
      await col.createIndex({ phoneKey: 1 }, { unique: true, sparse: true });
    }
    global.__leadIndexesOk = true;
  } catch (e) {
    console.error('[leads] index check failed:', e.message);
  }
}

/** push one history line and keep the list short */
export const historyPush = (entry) => ({ $push: { history: { $each: [{ at: new Date(), ...entry }], $slice: -HISTORY_KEEP } } });

/**
 * Is there already a store with this phone number? (a seller who registered before anyone
 * added him as a lead belongs to whoever the store was assigned to, not to a new lead)
 */
export async function findStoreByPhone(key) {
  if (!key) return null;
  await connectDB();
  // the store's own phone is stored as typed: compare by the same last-10-digits key
  const re = new RegExp(`${key.split('').join('\\D*')}\\D*$`);
  const s = await Seller.findOne({ phone: re, ...CLIENT_SELLER_FILTER }).select('storeName ownerName status createdAt').lean();
  return s || null;
}

/** What the person who tried to add a number may see about the lead that already has it. */
export function duplicateNotice(lead, viewer) {
  const isAdmin = viewer.role === 'admin';
  const mine = lead.memberId && sid(lead.memberId) === sid(viewer._id);
  const since = lead.assignedAt || lead.createdAt;
  if (mine) {
    return { mine: true, leadId: sid(lead._id), status: lead.status, message: 'This number is already in your leads.' };
  }
  if (isAdmin) {
    return {
      mine: false,
      leadId: sid(lead._id),
      name: lead.name,
      status: lead.status,
      statusLabel: STATUS_LABEL[lead.status],
      memberId: lead.memberId ? sid(lead.memberId) : null,
      memberName: lead.memberName || '',
      assignedAt: since,
      storeName: lead.storeName || '',
      message: lead.memberId
        ? `Already assigned to ${lead.memberName || 'a member'} on ${new Date(since).toDateString()} · ${STATUS_LABEL[lead.status]}.`
        : `Already in the leads list (not given to anyone yet) · ${STATUS_LABEL[lead.status]}.`,
    };
  }
  // another member: no names or details (members never see each other's people)
  return {
    mine: false,
    taken: true,
    since,
    converted: lead.status === 'converted',
    message: lead.status === 'converted'
      ? 'This seller already has a store with another team member. Please do not contact them.'
      : 'This seller is already with another team member. Please do not message, call or contact them.',
  };
}

/** Write "X tried to add this number" on the lead (admins see it), once per person per day. */
export async function recordDuplicateAttempt(lead, viewer) {
  if (!lead || (lead.memberId && sid(lead.memberId) === sid(viewer._id))) return;
  const dayAgo = new Date(Date.now() - 86400000);
  const recent = (lead.history || []).some((h) => h.type === 'duplicate' && sid(h.by) === sid(viewer._id) && new Date(h.at) > dayAgo);
  const update = { $inc: { duplicateAttempts: 1 }, $set: { lastDuplicateAt: new Date() } };
  if (!recent) Object.assign(update, historyPush({ type: 'duplicate', by: viewer._id, byName: viewer.name, text: viewer.name.endsWith(")") ? viewer.name : `${viewer.name} tried to add this number` }));
  await Lead.updateOne({ _id: lead._id }, update).catch(() => {});
}

/**
 * Auto-conversion: a lead whose phone number matches a registered store is "converted to store".
 * The store owner (who it was assigned to on approval) is filled in when known.
 *
 * Runs on its own when the leads pages load (at most every 30 seconds per server), so nothing has
 * to be pressed. The number of stores is small (hundreds), the leads are looked up by their
 * indexed phone key, so this stays quick even with a very big leads list.
 */
export async function reconcileLeadConversions({ force = false } = {}) {
  const g = global;
  if (!force && g.__leadReconcileAt && Date.now() - g.__leadReconcileAt < 30000) return { skipped: true };
  if (g.__leadReconcileRunning) return { skipped: true };
  g.__leadReconcileAt = Date.now();
  g.__leadReconcileRunning = true;
  try {
    await connectDB();
    const db = mongoose.connection.db;

    const sellers = await Seller.find({ phone: { $nin: [null, ''] }, ...CLIENT_SELLER_FILTER })
      .select('storeName phone status createdAt')
      .lean();
    const byKey = new Map();
    for (const s of sellers) {
      const k = phoneKey(s.phone);
      if (k && !byKey.has(k)) byKey.set(k, s);
    }

    let converted = 0;
    if (byKey.size) {
      const open = await Lead.find({ phoneKey: { $in: [...byKey.keys()] }, sellerId: null })
        .select('phoneKey memberId name')
        .lean();
      for (const lead of open) {
        const s = byKey.get(lead.phoneKey);
        if (!s) continue;
        const at = s.createdAt || new Date();
        const res = await Lead.updateOne(
          { _id: lead._id, sellerId: null },
          {
            $set: {
              sellerId: s._id,
              storeName: s.storeName || '',
              status: 'converted',
              statusAt: new Date(),
              convertedAt: at,
              convertedBy: 'auto',
              everContacted: true,
              everInterested: true,
              lostReason: '',
              lastActivityAt: new Date(),
            },
            ...historyPush({ type: 'converted', byName: 'System', text: `Registered store “${s.storeName || 'store'}” (phone matched)` }),
          }
        );
        if (res.modifiedCount) {
          converted += 1;
          if (lead.memberId) {
            import('@/lib/utils/push')
              .then(({ sendPushToUser }) =>
                sendPushToUser(lead.memberId, {
                  title: '🎉 Your lead registered a store',
                  body: `${lead.name || 'Your lead'} registered “${s.storeName || 'a store'}”. It will be assigned to you on approval.`,
                  url: '/leads',
                  type: 'leads',
                })
              )
              .catch(() => {});
          }
        }
      }
    }

    // who the converted stores were finally given to (filled once the store is approved)
    const noOwner = await Lead.find({ sellerId: { $ne: null }, ownerId: null }).select('sellerId').limit(1000).lean();
    if (noOwner.length) {
      const assignments = await db
        .collection('portalsellerassignments')
        .find({ sellerId: { $in: noOwner.map((l) => l.sellerId) }, status: 'active' })
        .project({ sellerId: 1, memberId: 1 })
        .toArray();
      if (assignments.length) {
        const owners = await Member.find({ _id: { $in: assignments.map((a) => a.memberId) } }).select('name').lean();
        const nameOf = new Map(owners.map((m) => [sid(m._id), m.name]));
        const ownerOf = new Map(assignments.map((a) => [sid(a.sellerId), a.memberId]));
        for (const l of noOwner) {
          const owner = ownerOf.get(sid(l.sellerId));
          if (!owner) continue;
          await Lead.updateOne(
            { _id: l._id, ownerId: null },
            { $set: { ownerId: owner, ownerName: nameOf.get(sid(owner)) || '' }, ...historyPush({ type: 'owner', byName: 'System', text: `Store assigned to ${nameOf.get(sid(owner)) || 'a member'}` }) }
          );
        }
      }
    }

    return { converted };
  } catch (e) {
    console.error('[leads] reconcile failed:', e.message);
    return { error: e.message };
  } finally {
    g.__leadReconcileRunning = false;
  }
}

/** One lead as the viewer may see it. */
export function leadView(l, viewer, { withHistory = false } = {}) {
  const isAdmin = viewer.role === 'admin';
  const staleAt = Date.now() - STALE_DAYS * 86400000;
  const out = {
    _id: sid(l._id),
    name: l.name,
    phone: l.phone || '',
    age: l.age || '',
    occupation: l.occupation || '',
    location: l.location || '',
    handover: !!l.handover,
    needsDetails: !l.phoneKey, // a handover still waiting for the seller's number
    profileFilled: [l.name, l.phoneKey, l.age, l.occupation, l.location].filter(Boolean).length, // out of 5
    country: l.country,
    source: l.source,
    sourceDetail: l.sourceDetail,
    notes: l.notes,
    memberId: l.memberId ? sid(l.memberId) : null,
    memberName: l.memberName,
    assignedAt: l.assignedAt,
    origin: l.origin,
    status: l.status,
    statusAt: l.statusAt,
    lostReason: l.lostReason,
    lastActivityAt: l.lastActivityAt,
    waNumberId: l.waNumberId ? sid(l.waNumberId) : null,
    sellerId: l.sellerId ? sid(l.sellerId) : null,
    storeName: l.storeName,
    convertedAt: l.convertedAt,
    ownerName: l.ownerName,
    ownerMismatch: !!(l.ownerId && l.memberId && sid(l.ownerId) !== sid(l.memberId)),
    stale: !!(l.memberId && ['new', 'contacted', 'interested'].includes(l.status) && new Date(l.lastActivityAt) < staleAt),
    createdAt: l.createdAt,
  };
  if (isAdmin) {
    out.addedByName = l.addedByName;
    out.duplicateAttempts = l.duplicateAttempts || 0;
  }
  if (withHistory) {
    const h = (l.history || []).slice().reverse();
    // members do not see who else tried to add their lead
    out.history = isAdmin ? h : h.filter((x) => x.type !== 'duplicate').map((x) => ({ at: x.at, type: x.type, byName: x.byName, text: x.text }));
  }
  return out;
}
