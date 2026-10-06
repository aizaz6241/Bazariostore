import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { connectDB } from './db.js';
import Member from './models/Member.js';

import crypto from 'crypto';

// The signing secret comes only from the environment. If JWT_SECRET is not set, a private one is
// worked out from MONGO_URI (which this app cannot run without), so logins keep working and the
// secret is never a value that is written in the code.
function resolveJwtSecret() {
  const set = (process.env.JWT_SECRET || '').trim();
  // values that used to be written in the code are public: never used (kept as fingerprints only)
  const publicBefore = ['b928e7744831d150b714dccc839c92461e6b20d93d0828b87548594da402e3c5'];
  if (set && !publicBefore.includes(crypto.createHash('sha256').update(set).digest('hex'))) return set;
  const uri = (process.env.MONGO_URI || '').trim();
  if (!uri) return crypto.randomBytes(32).toString('hex'); // nothing configured: no token can be valid
  return crypto.createHash('sha256').update(`bazario-portal-jwt:${uri}`).digest('hex');
}
const JWT_SECRET = resolveJwtSecret();

export async function hashPassword(plain) {
  return await bcrypt.hash(plain, 10);
}

export async function comparePassword(plain, hashed) {
  return await bcrypt.compare(plain, hashed);
}

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// The signed-in account of a token is remembered for a few seconds per server instance, so the
// many small requests of one open page (chat, live numbers, wallet) do not each look the account
// up again. A removed or switched-off account therefore stops working within this time.
const SESSION_CACHE_MS = 15 * 1000;
const SESSION_CACHE_MAX = 500;
function sessionCache() {
  if (!global.__portalSessions) global.__portalSessions = new Map();
  return global.__portalSessions;
}

/** Call after an account was changed, switched off or removed. */
export function forgetSessions(memberId) {
  const cache = sessionCache();
  if (!memberId) return cache.clear();
  const id = String(memberId);
  for (const [key, entry] of cache) {
    if (String(entry.member?._id) === id) cache.delete(key);
  }
}

export async function getAuthSession(req) {
  await connectDB();

  let token = null;

  // 1. Check Authorization header
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // 2. Check Cookie
  if (!token) {
    const cookieHeader = req.headers.get('cookie') || '';
    const match = cookieHeader.match(/portal_token=([^;]+)/);
    if (match) {
      token = match[1];
    }
  }

  if (!token) return null;

  const decoded = verifyToken(token);
  if (!decoded || !decoded.id) return null;
  // Only logins made by this portal. A store token (admin panel / seller / customer) carries a
  // type field `t`; it must never open a portal session, even when the email matches a member.
  if (decoded.t) return null;

  const cache = sessionCache();
  const cacheKey = crypto.createHash('sha256').update(token).digest('hex');
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < SESSION_CACHE_MS) return hit.member;

  let member = await Member.findById(decoded.id).select('-passwordHash -plainPassword');

  // Robust fallback: if token had an older ID, lookup by ecommerceAdminId or email
  if (!member && decoded.ecommerceAdminId) {
    member = await Member.findOne({ ecommerceAdminId: decoded.ecommerceAdminId }).select('-passwordHash -plainPassword');
  }
  if (!member && decoded.email) {
    member = await Member.findOne({ email: decoded.email.toLowerCase() }).select('-passwordHash -plainPassword');
  }

  if (!member || !member.active) {
    cache.delete(cacheKey);
    return null;
  }

  if (cache.size >= SESSION_CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(cacheKey, { member, at: Date.now() });
  return member;
}
