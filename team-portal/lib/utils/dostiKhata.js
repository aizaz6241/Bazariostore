import WalletTransaction from '@/lib/models/WalletTransaction';
import { monthLabel, isMonthKey } from '@/lib/utils/payoutMonths';

/**
 * DOSTI KHATA SYNC — the owner's own payouts go into his personal expense tracker.
 *
 * Only ONE wallet is ever sent: the portal member whose id is DOSTI_KHATA_OWNER_ID (a fixed
 * database id, never a name). Payouts of the other partner or of any member are never sent.
 *
 *   payout recorded (after approval)  -> POST /api/hook/payout          { id: bz_payout_<tx id>, ... }
 *   payout reversed (after approval)  -> POST /api/hook/payout/reverse  { id: same }
 *
 * Nothing here can stop or slow down a payout: the payout is saved first, then this is tried once
 * with a short wait. If Dosti Khata is asleep / down, the row stays "pending" (dkSync on the
 * payout row) and the portal's live check (app/api/live) sends it again later, with growing gaps.
 * Dosti Khata is idempotent (same id twice = "duplicate"), so sending again is always safe.
 *
 * Settings (Vercel, team portal): DOSTI_KHATA_KEY, DOSTI_KHATA_OWNER_ID, optional DOSTI_KHATA_URL.
 * If the key or the owner id is missing, this does nothing at all.
 */

const DEFAULT_URL = 'https://dosti-khata.onrender.com';
const NOW_WAIT_MS = 6000; // right after the payout: short, so the approval reply is not held up
const RETRY_WAIT_MS = 25000; // later retries: long enough for a sleeping Render server to wake
const RETRY_EVERY_MS = 60 * 1000; // live check: look for pending rows at most once a minute
const MAX_GAP_MS = 6 * 60 * 60 * 1000;

function config() {
  const key = String(process.env.DOSTI_KHATA_KEY || '').trim();
  const ownerId = String(process.env.DOSTI_KHATA_OWNER_ID || '').trim();
  let url = String(process.env.DOSTI_KHATA_URL || DEFAULT_URL).trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(url)) url = ''; // never send the key over plain http
  if (!key || !url || !/^[a-f0-9]{24}$/i.test(ownerId)) return null;
  return { key, ownerId, url };
}

/** Is this wallet the owner's own wallet? (the only one that is ever sent) */
export function isDostiKhataOwner(userId) {
  const c = config();
  return Boolean(c && userId && String(userId) === c.ownerId);
}

const hookId = (tx) => `bz_payout_${String(tx._id)}`;

/** Pakistan time with its offset, e.g. 2026-12-01T14:20:00+05:00 */
function pkTime(d) {
  const t = new Date(d || Date.now());
  if (Number.isNaN(t.getTime())) return undefined;
  return new Date(t.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 19) + '+05:00';
}

function createBody(tx) {
  const amount = Math.round((Number(tx.amountUSDT) || Number(tx.amount) || 0) * 100) / 100;
  const forMonth = isMonthKey(tx.forMonth) ? tx.forMonth : '';
  return {
    id: hookId(tx),
    amount,
    currency: 'USDT',
    date: pkTime(tx.date || tx.createdAt),
    ...(forMonth ? { forMonth } : {}),
    note: forMonth ? `Bazario payout — ${monthLabel(forMonth)}` : 'Bazario payout',
    source: 'bazario',
  };
}

function reverseBody(tx) {
  return {
    id: hookId(tx),
    reason: String(tx.reverseReason || 'Payout reversed').slice(0, 200),
    date: pkTime(tx.reversedAt || Date.now()),
  };
}

async function post(c, path, body, waitMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), waitMs);
  try {
    const res = await fetch(`${c.url}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: 'no-store',
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data };
  } catch (e) {
    return { status: 0, error: e?.name === 'AbortError' ? 'timeout' : String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

// 2xx = done. 408 / 429 / 5xx / no answer = try again later. Any other 4xx = a real problem
// (wrong key, bad data, same id with another amount): stop and tell the owner.
const outcome = (status) => (status >= 200 && status < 300 ? 'done' : status === 0 || status === 408 || status === 429 || status >= 500 ? 'retry' : 'failed');

async function alertOwner(c, tx, what, status, msg) {
  try {
    const { sendPushToUser } = await import('@/lib/utils/push');
    await sendPushToUser(c.ownerId, {
      title: '⚠️ Dosti Khata: payout not added',
      body: `${what} of ₮${(Number(tx.amountUSDT) || Number(tx.amount) || 0).toFixed(2)} was not accepted by Dosti Khata (${status}${msg ? `: ${msg}` : ''}). Add it there by hand.`,
      url: '/wallet',
      type: 'finance',
    });
  } catch (e) {
    console.error('[dosti-khata] alert push error:', e?.message || e);
  }
}

/** Send whatever is still pending for one payout row (create first, then reverse). */
async function syncRow(c, tx, waitMs) {
  const s = tx.dkSync || {};
  const set = {};
  let retry = false;
  let lastError = '';

  if (s.create === 'pending') {
    const r = await post(c, '/api/hook/payout', createBody(tx), waitMs);
    const o = outcome(r.status);
    if (o === 'done') set['dkSync.create'] = 'done';
    else if (o === 'retry') { retry = true; lastError = `create: ${r.status || r.error}`; }
    else {
      set['dkSync.create'] = 'failed';
      lastError = `create: ${r.status} ${r.data?.message || r.data?.error || ''}`.trim();
      await alertOwner(c, tx, 'Payout', r.status, r.data?.message || r.data?.error || '');
    }
  }

  // a reverse is sent even if the create is still waiting: Dosti Khata remembers it (tombstone)
  if (s.reverse === 'pending') {
    const r = await post(c, '/api/hook/payout/reverse', reverseBody(tx), waitMs);
    const o = outcome(r.status);
    if (o === 'done') set['dkSync.reverse'] = 'done';
    else if (o === 'retry') { retry = true; lastError = lastError || `reverse: ${r.status || r.error}`; }
    else {
      set['dkSync.reverse'] = 'failed';
      lastError = `reverse: ${r.status} ${r.data?.message || r.data?.error || ''}`.trim();
      await alertOwner(c, tx, 'Payout reverse', r.status, r.data?.message || r.data?.error || '');
    }
  }

  const attempts = (Number(s.attempts) || 0) + 1;
  set['dkSync.attempts'] = attempts;
  set['dkSync.lastAt'] = new Date();
  set['dkSync.lastError'] = lastError.slice(0, 200);
  if (retry) set['dkSync.nextAt'] = new Date(Date.now() + Math.min(30000 * 2 ** Math.min(attempts, 12), MAX_GAP_MS));
  await WalletTransaction.updateOne({ _id: tx._id }, { $set: set });
}

/** Called right after the owner's payout is recorded. Never throws. */
export async function dostiKhataPayoutRecorded(txId) {
  try {
    const c = config();
    if (!c) return;
    const tx = await WalletTransaction.findOneAndUpdate(
      { _id: txId, userId: c.ownerId, category: 'payout_withdrawal', type: 'debit' },
      { $set: { 'dkSync.create': 'pending', 'dkSync.nextAt': new Date() } },
      { new: true }
    ).lean();
    if (tx) await syncRow(c, tx, NOW_WAIT_MS);
  } catch (e) {
    console.error('[dosti-khata] payout sync error:', e?.message || e);
  }
}

/** Called right after the owner's payout is reversed. Never throws. */
export async function dostiKhataPayoutReversed(txId) {
  try {
    const c = config();
    if (!c) return;
    // only a payout that was ever sent (or is waiting to be sent) needs a reverse
    const tx = await WalletTransaction.findOneAndUpdate(
      { _id: txId, userId: c.ownerId, category: 'payout_withdrawal', reversed: true, 'dkSync.create': { $in: ['pending', 'done', 'failed'] } },
      { $set: { 'dkSync.reverse': 'pending', 'dkSync.nextAt': new Date() } },
      { new: true }
    ).lean();
    if (tx) await syncRow(c, tx, NOW_WAIT_MS);
  } catch (e) {
    console.error('[dosti-khata] reverse sync error:', e?.message || e);
  }
}

/** Live check: send again what is still pending (at most once a minute, a few rows). */
export async function retryDostiKhata() {
  try {
    const c = config();
    if (!c) return;
    const st = (globalThis.__dkRetry ||= { at: 0 });
    if (Date.now() - st.at < RETRY_EVERY_MS) return;
    st.at = Date.now();
    const rows = await WalletTransaction.find({
      userId: c.ownerId,
      category: 'payout_withdrawal',
      'dkSync.nextAt': { $lte: new Date() },
      $or: [{ 'dkSync.create': 'pending' }, { 'dkSync.reverse': 'pending' }],
    })
      .sort({ 'dkSync.nextAt': 1 })
      .limit(5)
      .lean();
    for (const tx of rows) await syncRow(c, tx, RETRY_WAIT_MS);
  } catch (e) {
    console.error('[dosti-khata] retry error:', e?.message || e);
  }
}
