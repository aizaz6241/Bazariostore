import crypto from 'crypto';

/**
 * The copy of a seller's password that an admin can look up (to tell a seller who forgot it).
 *
 * Before: the password was saved as plain text on the seller record and sent to the browser with
 * every seller list. Now:
 *   - it is never part of any normal response (see the transform in models/Seller.js);
 *   - an admin reads it one seller at a time through GET /api/sellers/:id/password, and every
 *     look is written to the audit log and the finance activity log;
 *   - when SELLER_PASSWORD_KEY is set on the server, the copy is stored ENCRYPTED (AES-256-GCM)
 *     and the old plain text is removed, so the database alone no longer reveals any password.
 *
 * Logging in never depends on this copy (that uses the bcrypt hash). If the key is ever lost,
 * only "show password" stops working for old copies; sellers can still log in, and resetting a
 * password stores a new copy.
 */

function key() {
  const raw = (process.env.SELLER_PASSWORD_KEY || '').trim();
  if (raw.length < 16) return null;
  return crypto.createHash('sha256').update(`bazario-seller-password:${raw}`).digest();
}

export function encryptionOn() {
  return key() !== null;
}

const keyId = (k) => crypto.createHash('sha256').update(k).digest('hex').slice(0, 8);

export function encryptPassword(plain) {
  const k = key();
  if (!k || !plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', keyId(k), iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

/** @returns {{ok:true,password:string}|{ok:false,reason:string}} */
export function decryptPassword(stored) {
  if (!stored) return { ok: false, reason: 'none' };
  const parts = String(stored).split(':');
  if (parts.length !== 5 || parts[0] !== 'v1') return { ok: false, reason: 'format' };
  const k = key();
  if (!k) return { ok: false, reason: 'no_key' };
  if (parts[1] !== keyId(k)) return { ok: false, reason: 'other_key' };
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(parts[2], 'base64'));
    decipher.setAuthTag(Buffer.from(parts[3], 'base64'));
    const pt = Buffer.concat([decipher.update(Buffer.from(parts[4], 'base64')), decipher.final()]);
    return { ok: true, password: pt.toString('utf8') };
  } catch {
    return { ok: false, reason: 'damaged' };
  }
}

/**
 * Keep the look-up copy on a seller document (call whenever the real password is known:
 * registration, login, change, reset). Encrypted when a key is set; otherwise stored as before.
 */
export function rememberPassword(seller, plain) {
  if (!seller || !plain) return;
  const enc = encryptPassword(plain);
  if (enc) {
    seller.passwordEnc = enc;
    seller.plainPassword = '';
  } else if (seller.plainPassword !== plain) {
    seller.plainPassword = plain;
  }
}

/** Read the copy from a raw seller record ({ plainPassword, passwordEnc }). */
export function readPassword(record) {
  if (!record) return { password: '', note: 'none' };
  if (record.passwordEnc) {
    const out = decryptPassword(record.passwordEnc);
    if (out.ok) return { password: out.password, note: 'ok' };
    if (!record.plainPassword) return { password: '', note: out.reason };
  }
  if (record.plainPassword) return { password: String(record.plainPassword), note: 'ok' };
  return { password: '', note: 'none' };
}

/**
 * One-time tidy-up at server start, only when SELLER_PASSWORD_KEY is set: every password still
 * saved as plain text is encrypted and the plain text is removed. Nothing is lost (the encrypted
 * copy is checked before the plain one is cleared) and it can run any number of times.
 */
export async function encryptStoredPasswords(db) {
  if (!encryptionOn() || !db) return { changed: 0 };
  const col = db.collection('sellers');
  const cursor = col.find({ plainPassword: { $type: 'string', $ne: '' } }, { projection: { plainPassword: 1 } });
  let changed = 0;
  for await (const s of cursor) {
    const enc = encryptPassword(s.plainPassword);
    const back = decryptPassword(enc);
    if (!back.ok || back.password !== s.plainPassword) continue; // never clear what cannot be read back
    await col.updateOne({ _id: s._id, plainPassword: s.plainPassword }, { $set: { passwordEnc: enc, plainPassword: '' } });
    changed += 1;
  }
  return { changed };
}
