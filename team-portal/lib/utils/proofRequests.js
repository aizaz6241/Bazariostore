import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import Member from '@/lib/models/Member';
import { Seller } from '@/lib/models/SharedModels';
import SellerAssignment from '@/lib/models/SellerAssignment';
import ProofRequest from '@/lib/models/ProofRequest';

/**
 * PROOF REQUESTS (see lib/models/ProofRequest.js). Nothing here touches money: a request is a
 * note to the partners, tied to one of the person's own sellers.
 */

export const MY_PROOFS_URL = '/chat?chatType=myproofs';
const PROOFS_URL = '/chat?chatType=proofs';
const sid = (v) => (v ? String(v) : '');
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function shape(r) {
  return {
    _id: sid(r._id),
    requesterId: r.requesterId,
    requesterName: r.requesterName,
    requesterRole: r.requesterRole,
    sellerId: sid(r.sellerId),
    storeName: r.storeName,
    amount: r.amount || '',
    paidOn: r.paidOn,
    note: r.note || '',
    status: r.status,
    reply: r.reply || '',
    closedBy: r.closedBy?.name || '',
    closedAt: r.closedAt,
    byProof: !!r.proofId,
    createdAt: r.createdAt,
  };
}

/** The sellers that belong to this person (real stores only): [{ _id, storeName }] */
export async function mySellers(userId) {
  await connectDB();
  const links = await SellerAssignment.find({ memberId: userId, status: 'active' }).select('sellerId').lean();
  if (links.length === 0) return [];
  const sellers = await Seller.find({ _id: { $in: links.map((l) => l.sellerId) } })
    .select('storeName isTestAccount accountType')
    .lean();
  return sellers
    .filter((s) => s.isTestAccount !== true && s.accountType !== 'test')
    .map((s) => ({ _id: sid(s._id), storeName: s.storeName || 'Store' }))
    .sort((a, b) => a.storeName.localeCompare(b.storeName));
}

async function tellPartners(exceptId, payload) {
  try {
    const { sendPushToUser } = await import('@/lib/utils/push');
    const partners = await Member.find({ role: 'admin', active: true }).select('_id').lean();
    await Promise.allSettled(partners.filter((p) => sid(p._id) !== sid(exceptId)).map((p) => sendPushToUser(p._id, payload)));
  } catch (e) {
    console.error('[proof-requests] alert failed:', e.message);
  }
}

async function tellPerson(userId, payload) {
  try {
    const { sendPushToUser } = await import('@/lib/utils/push');
    await sendPushToUser(userId, payload);
  } catch (e) {
    console.error('[proof-requests] alert failed:', e.message);
  }
}

/** A person says: my seller paid, but there is no proof yet. */
export async function createProofRequest({ session, sellerId, amount, paidOn, note }) {
  await connectDB();
  if (!sellerId || !mongoose.Types.ObjectId.isValid(String(sellerId))) throw new Error('Choose the seller');
  const sellers = await mySellers(session._id);
  const seller = sellers.find((s) => s._id === String(sellerId));
  if (!seller) throw new Error('You can only ask about your own sellers');

  const me = sid(session._id);
  const already = await ProofRequest.findOne({ requesterId: me, sellerId, status: 'open' }).select('_id').lean();
  if (already) throw new Error(`You already have an open request for ${seller.storeName}. The partners have been told.`);

  let day = null;
  if (paidOn) {
    const d = new Date(paidOn);
    if (Number.isNaN(d.getTime())) throw new Error('The date is not valid');
    if (d.getTime() > Date.now() + 36 * 3600 * 1000) throw new Error('The date cannot be in the future');
    day = d;
  }

  const doc = await ProofRequest.create({
    requesterId: me,
    requesterName: session.name || session.username || '',
    requesterRole: session.role === 'admin' ? 'partner' : 'member',
    sellerId,
    storeName: seller.storeName,
    amount: clean(amount, 40),
    paidOn: day,
    note: clean(note, 300),
  });

  await tellPartners(me, {
    title: `🙋 Proof missing: ${seller.storeName}`,
    body: `${doc.requesterName} says a payment was made${doc.amount ? ` (${doc.amount})` : ''} but its proof is not there yet.`,
    url: PROOFS_URL,
    type: 'finance',
    tag: `proofreq-${sid(doc._id)}`,
  });
  return shape(doc.toObject());
}

/** Partners: every request that is still open, oldest first. */
export async function openProofRequests() {
  await connectDB();
  const rows = await ProofRequest.find({ status: 'open' }).sort({ createdAt: 1 }).limit(100).lean();
  return rows.map(shape);
}

export async function openProofRequestCount() {
  await connectDB();
  return ProofRequest.countDocuments({ status: 'open' });
}

/** A person's own requests: the open ones and the latest answered ones. Looking marks answers as seen. */
export async function myProofRequests(userId, { markSeen = true } = {}) {
  await connectDB();
  const me = sid(userId);
  const rows = await ProofRequest.find({ requesterId: me }).sort({ createdAt: -1 }).limit(20).lean();
  if (markSeen && rows.some((r) => r.seenByRequester === false)) {
    await ProofRequest.updateMany({ requesterId: me, seenByRequester: false }, { $set: { seenByRequester: true } });
  }
  return rows.map(shape);
}

export async function myProofRequestCounts(userId) {
  await connectDB();
  const me = sid(userId);
  const [open, answered] = await Promise.all([
    ProofRequest.countDocuments({ requesterId: me, status: 'open' }),
    ProofRequest.countDocuments({ requesterId: me, seenByRequester: false }),
  ]);
  return { open, answered };
}

/** A partner answers a request: "done" or "not received", with a short reply. */
export async function closeProofRequest({ session, id, action, reply }) {
  await connectDB();
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) throw new Error('Request not found');
  if (!['done', 'declined'].includes(action)) throw new Error('Choose what to answer');
  const text = clean(reply, 300);
  if (action === 'declined' && !text) throw new Error('Write a short reason, so the person knows why');

  const by = { id: sid(session._id), name: session.name || session.username || '' };
  // only an open request can be answered (two partners tapping together: one wins)
  const res = await ProofRequest.updateOne(
    { _id: id, status: 'open' },
    { $set: { status: action, reply: text, closedBy: by, closedAt: new Date(), seenByRequester: false } }
  );
  if (!(res.modifiedCount > 0)) throw new Error('This request was already answered');
  const doc = await ProofRequest.findById(id).lean();

  if (doc && doc.requesterId !== by.id) {
    await tellPerson(doc.requesterId, {
      title: action === 'done' ? `✅ ${doc.storeName}: request answered` : `ℹ️ ${doc.storeName}: payment not received`,
      body: text || (action === 'done' ? `${by.name} marked your request as done.` : `${by.name} answered your request.`),
      url: MY_PROOFS_URL,
      type: 'finance',
      tag: `proofreq-${sid(doc._id)}`,
    });
  }
  return shape(doc);
}

/**
 * A proof of this seller was completed: the open requests about it are answered by that.
 * Only requests the proof can really be about: the deposit is not older than the payment asked for.
 */
export async function closeRequestsForProof({ proof, by }) {
  try {
    if (!proof?.sellerId) return;
    const open = await ProofRequest.find({ sellerId: proof.sellerId, status: 'open' }).lean();
    const depositAt = new Date(proof.depositAt).getTime();
    for (const r of open) {
      const from = r.paidOn ? new Date(r.paidOn).getTime() - 24 * 3600 * 1000 : new Date(r.createdAt).getTime() - 48 * 3600 * 1000;
      if (depositAt < from) continue;
      await ProofRequest.updateOne(
        { _id: r._id, status: 'open' },
        { $set: { status: 'done', reply: '', closedBy: by, closedAt: new Date(), proofId: proof._id, seenByRequester: false } }
      );
    }
  } catch (e) {
    console.error('[proof-requests] could not close requests:', e.message);
  }
}
