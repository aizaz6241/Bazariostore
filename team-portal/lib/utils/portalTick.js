import crypto from 'crypto';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';

/**
 * "Wake up and check" calls from the store server (server/src/utils/portalTick.js).
 *
 * The portal's checks for new money events (payment-proof drafts + their push, finance alerts)
 * used to run only inside the requests of an open portal page, so with every page closed a push
 * waited until someone opened the portal. The store server is always running: when money
 * changes it calls POST /api/live/tick, which runs the same checks at once.
 *
 * - The server finds this portal by the address recorded here (`portalruntime`) whenever a portal
 *   page is open (or by its own TEAM_PORTAL_URL setting).
 * - A call is accepted only with a one-time ticket whose hash the server put in the shared
 *   database a moment before (`portalticktokens`); the ticket is used up here. No shared secret.
 */

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const RECORD_EVERY_MS = 10 * 60 * 1000;
const LOCAL = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|\[?::1)/i;

function state() {
  if (!globalThis.__portalTickState) globalThis.__portalTickState = { recordedAt: 0, url: '' };
  return globalThis.__portalTickState;
}

/** Remember this portal's own address (from an open page's request), at most every 10 minutes. */
export async function rememberPortalUrl(req) {
  try {
    const host = String(req.headers.get('x-forwarded-host') || req.headers.get('host') || '').split(',')[0].trim();
    if (!host || LOCAL.test(host) || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return;
    // Vercel preview / branch addresses are not the portal people use
    if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') return;
    const proto = String(req.headers.get('x-forwarded-proto') || 'https').split(',')[0].trim() === 'http' ? 'http' : 'https';
    const url = `${proto}://${host}`;
    const st = state();
    if (st.url === url && Date.now() - st.recordedAt < RECORD_EVERY_MS) return;
    st.url = url;
    st.recordedAt = Date.now();
    await connectDB();
    await mongoose.connection.db.collection('portalruntime').updateOne({ _id: 'portal' }, { $set: { url, at: new Date() } }, { upsert: true });
  } catch (e) {
    console.error('[portal-tick] could not record address:', e.message);
  }
}

/** Is this call from the store server? (one-time ticket; used up here) */
export async function takeTicket(token) {
  if (!token || typeof token !== 'string' || token.length < 32 || token.length > 128) return false;
  await connectDB();
  const res = await mongoose.connection.db
    .collection('portalticktokens')
    .findOneAndDelete({ hash: sha256(token), expiresAt: { $gt: new Date() } });
  const doc = res && res.value !== undefined ? res.value : res;
  return Boolean(doc && doc._id);
}
