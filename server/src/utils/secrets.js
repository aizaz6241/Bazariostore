import crypto from 'crypto';

/**
 * Secrets come only from the environment. Nothing secret is written in the code.
 *
 *   MONGO_URI            database address (required)
 *   JWT_SECRET           signs login tokens. If it is not set, a private one is worked out from
 *                        MONGO_URI, so logins keep working and the secret is never a public value.
 *   SELLER_PASSWORD_KEY  encrypts the copy of a seller's password that admins can look up
 *                        (see utils/sellerPassword.js). Optional.
 */

export function mongoUri() {
  const uri = (process.env.MONGO_URI || process.env.MONGODB_URI || '').trim();
  if (!uri || uri.includes('<db_username>') || uri.includes('<db_password>') || uri.includes('<user>') || uri.includes('<password>')) return '';
  return uri;
}

let warned = false;

// The values that used to be written in the code (and so are public). Kept only as fingerprints.
// If JWT_SECRET still holds one of them, it is not used: anyone could sign a login with it.
const PUBLIC_BEFORE = ['b928e7744831d150b714dccc839c92461e6b20d93d0828b87548594da402e3c5'];
const wasPublic = (value) => PUBLIC_BEFORE.includes(crypto.createHash('sha256').update(value).digest('hex'));

/** Makes sure process.env.JWT_SECRET holds a private value. Call once at startup. */
export function ensureJwtSecret() {
  const set = (process.env.JWT_SECRET || '').trim();
  if (set && !wasPublic(set)) return set;
  const uri = mongoUri();
  if (!uri) {
    throw new Error('JWT_SECRET is not set and there is no MONGO_URI to derive one from. Set both in the environment.');
  }
  process.env.JWT_SECRET = crypto.createHash('sha256').update(`bazario-jwt-secret:${uri}`).digest('hex');
  if (!warned) {
    warned = true;
    console.warn('⚠️  JWT_SECRET is not set: using a private one derived from MONGO_URI. Set JWT_SECRET so logins survive a database password change.');
  }
  return process.env.JWT_SECRET;
}

export function jwtSecret() {
  const set = process.env.JWT_SECRET;
  return set && !wasPublic(set) ? set : ensureJwtSecret();
}
