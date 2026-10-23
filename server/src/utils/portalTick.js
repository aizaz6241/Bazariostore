import crypto from 'crypto';
import mongoose from 'mongoose';

/**
 * TEAM PORTAL — "WAKE UP AND CHECK" CALL
 *
 * The team portal (Vercel) has no process of its own that keeps running: its checks for new
 * money events (the "🧾 Payment proof needed" card + push for a new deposit, and the alerts for
 * finance actions done here on the admin panel) ran only inside the requests of an OPEN portal
 * page. With every portal closed, nothing ran, so the notification arrived only when someone
 * opened the portal ("I got the notification and the sound only when I opened the team portal").
 *
 * This server is always running. When a deposit / withdrawal line or a finance log line changes
 * here, it calls the portal's `/api/live/tick` (a few seconds later, once for a burst of changes),
 * which runs the same checks right away and sends the pushes. A light check every 2 minutes
 * catches anything written by another way.
 *
 * Address of the portal: TEAM_PORTAL_URL, or else the address the portal itself records in the
 * shared database (`portalruntime`) whenever a portal page is open.
 * Access: a one-time ticket — this server stores only its hash (`portalticktokens`, removed by the
 * database after 2 minutes), the portal accepts the call only if the hash is there and deletes it.
 * No secret has to be shared between the two apps.
 */

const DEBOUNCE_MS = 4000;
const SAFETY_EVERY_MS = 2 * 60 * 1000;
const TICKET_LIFE_MS = 2 * 60 * 1000;
const CALL_TIMEOUT_MS = 25000;
const URL_CACHE_MS = 5 * 60 * 1000;

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const db = () => (mongoose.connection.readyState === 1 ? mongoose.connection.db : null);

let timer = null;
let running = false;
let again = false;
let urlCache = { url: '', at: 0 };
let indexReady = false;
let lastFailLog = 0;
let lastSeenWithdrawalAt = 0;

async function portalUrl() {
  const env = String(process.env.TEAM_PORTAL_URL || '').trim().replace(/\/+$/, '');
  if (env) return env;
  if (urlCache.url && Date.now() - urlCache.at < URL_CACHE_MS) return urlCache.url;
  const d = db();
  if (!d) return '';
  const doc = await d.collection('portalruntime').findOne({ _id: 'portal' });
  const url = /^https?:\/\/[^\s/]+$/i.test(String(doc?.url || '')) ? String(doc.url) : '';
  urlCache = { url, at: Date.now() };
  return url;
}

async function newTicket() {
  const d = db();
  if (!d) return '';
  const col = d.collection('portalticktokens');
  if (!indexReady) {
    await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {});
    indexReady = true;
  }
  const token = crypto.randomBytes(24).toString('hex');
  await col.insertOne({ hash: sha256(token), expiresAt: new Date(Date.now() + TICKET_LIFE_MS), createdAt: new Date() });
  return token;
}

async function callPortal(reason) {
  if (typeof fetch !== 'function') return;
  const url = await portalUrl();
  if (!url) return; // the portal has not been opened since this feature went live
  const token = await newTicket();
  if (!token) return;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/api/live/tick`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-portal-tick': token },
      body: JSON.stringify({ reason: String(reason || '').slice(0, 60) }),
      signal: ctrl.signal,
    });
    if (!res.ok && Date.now() - lastFailLog > 10 * 60 * 1000) {
      lastFailLog = Date.now();
      console.error(`[portal-tick] ${url} answered ${res.status}`);
    }
  } catch (e) {
    if (Date.now() - lastFailLog > 10 * 60 * 1000) {
      lastFailLog = Date.now();
      console.error('[portal-tick] call failed:', e.message);
    }
  } finally {
    clearTimeout(t);
  }
}

/** Something about money changed: ask the portal to check (once for a burst of changes). */
export function pokePortal(reason = '') {
  if (process.env.PORTAL_TICK_DISABLED === '1') return;
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      await callPortal(reason);
    } catch (e) {
      console.error('[portal-tick]', e.message);
    } finally {
      running = false;
      if (again) {
        again = false;
        pokePortal('again');
      }
    }
  }, DEBOUNCE_MS);
  timer.unref?.();
}

/** Safety net: a finance line not announced yet, or a deposit / withdrawal line written another way. */
async function safetyCheck() {
  const d = db();
  if (!d) return;
  try {
    const waiting = await d.collection('portalfinancelogs').findOne({ pushed: false }, { projection: { _id: 1 } });
    const newest = await d.collection('withdrawals').find({}, { projection: { createdAt: 1 } }).sort({ createdAt: -1 }).limit(1).next();
    const at = newest?.createdAt ? new Date(newest.createdAt).getTime() : 0;
    const fresh = lastSeenWithdrawalAt && at > lastSeenWithdrawalAt;
    if (!lastSeenWithdrawalAt || at > lastSeenWithdrawalAt) lastSeenWithdrawalAt = at;
    if (waiting || fresh) pokePortal('safety');
  } catch (e) {
    console.error('[portal-tick] safety check:', e.message);
  }
}

export function startPortalTicker() {
  const t = setInterval(safetyCheck, SAFETY_EVERY_MS);
  t.unref?.();
  setTimeout(safetyCheck, 30000).unref?.();
}
