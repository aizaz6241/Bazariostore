import crypto from 'crypto';

/**
 * EMAIL GUARD — protects the mailbox of whoever's address is typed in, and the daily email quota
 * (Resend free plan: about 100 a day). Every "send me a code" request is counted per email address:
 *   - one email per address every 60 seconds
 *   - at most 5 per address per hour
 * (Per network limits stay on the routes as before.) In memory: one server process.
 */
const GAP_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MAX_PER_HOUR = 5;
const seen = new Map(); // key -> { last, hourStart, count }

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of seen) if (now - v.hourStart > HOUR_MS && now - v.last > GAP_MS) seen.delete(k);
}, 10 * 60 * 1000).unref?.();

/**
 * Asks to send one more email of `kind` to `email`. Returns { ok: true } (and counts it) or
 * { ok: false, waitSec } when it is too soon / too many.
 */
export function allowEmailSend(email, kind = 'code') {
  const key = `${kind}:${String(email || '').toLowerCase().trim()}`;
  const now = Date.now();
  let s = seen.get(key);
  if (!s || now - s.hourStart > HOUR_MS) s = { last: 0, hourStart: now, count: 0 };
  if (now - s.last < GAP_MS) return { ok: false, waitSec: Math.ceil((GAP_MS - (now - s.last)) / 1000) };
  if (s.count >= MAX_PER_HOUR) return { ok: false, waitSec: Math.ceil((HOUR_MS - (now - s.hourStart)) / 1000) };
  s.last = now;
  s.count += 1;
  seen.set(key, s);
  return { ok: true };
}

/** Codes and reset links are kept in the database only as a hash (a copied database is useless). */
export const hashSecret = (v) => crypto.createHash('sha256').update(String(v ?? '')).digest('hex');

/** Compares a typed code with a stored hash in constant time. */
export function secretMatches(typed, storedHash) {
  if (!typed || !storedHash) return false;
  const a = Buffer.from(hashSecret(typed), 'hex');
  const b = Buffer.from(String(storedHash), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const waitMessage = (sec) =>
  sec > 90 ? `Too many codes were sent to this email. Please try again in ${Math.ceil(sec / 60)} minutes.` : `Please wait ${sec} seconds before asking for a new code.`;
