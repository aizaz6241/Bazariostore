import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { permsFor } from '../utils/permissions.js';
import { jwtSecret } from '../utils/secrets.js';

/**
 * LOGIN CHECKS
 *
 * A login stays valid for a long time (so nobody is thrown out every few days), but the token
 * alone is not trusted any more: on every request the account is looked up again, so
 *   - a disabled / deleted admin or a suspended seller is refused at once,
 *   - an admin's role and permissions are the ones saved NOW, not the ones at login time,
 *   - changing a password ends every older login of that account.
 * The lookup is remembered for a few seconds per account, so it costs almost nothing.
 */

const CACHE_MS = 15 * 1000;
const cache = new Map(); // "admin:<id>" | "seller:<id>" -> { at, value }

export function forgetAuthCache(kind, id) {
  if (!kind) return cache.clear();
  cache.delete(`${kind}:${String(id)}`);
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cache) if (now - v.at > CACHE_MS * 4) cache.delete(k);
}, 60 * 1000).unref?.();

const isId = (v) => !!v && mongoose.Types.ObjectId.isValid(String(v));
const oid = (v) => new mongoose.Types.ObjectId(String(v));

async function cached(kind, id, load) {
  const key = `${kind}:${String(id)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Was this token made before the account's password was last changed? */
function olderThanPassword(payload, pwdAt) {
  if (!pwdAt || !payload?.iat) return false;
  return payload.iat * 1000 < new Date(pwdAt).getTime() - 5000;
}

/**
 * A finance partner shares the Binance money and approves the other partner's sensitive actions.
 * Accounts made before this setting existed count as partners when they are a full admin
 * (super_admin / admin), which is exactly how it worked until now.
 */
export function isFinancePartner(admin) {
  if (!admin) return false;
  if (admin.financePartner === true) return true;
  if (admin.financePartner === false) return false;
  return ['super_admin', 'admin'].includes(admin.role);
}

/** Current state of an admin account (null when it does not exist). */
export async function loadAdminAccount(id) {
  if (!isId(id)) return null;
  return cached('admin', id, async () => {
    const a = await mongoose.connection
      .collection('admins')
      .findOne({ _id: oid(id) }, { projection: { name: 1, email: 1, role: 1, permissions: 1, active: 1, pwdAt: 1, financePartner: 1 } });
    if (!a) return null;
    return {
      id: String(a._id),
      name: a.name || 'Admin',
      email: a.email || '',
      role: a.role || 'admin',
      permissions: permsFor({ role: a.role, permissions: a.permissions || [] }),
      active: a.active !== false,
      pwdAt: a.pwdAt || null,
      financePartner: isFinancePartner(a),
    };
  });
}

async function loadSellerAccount(id) {
  if (!isId(id)) return null;
  return cached('seller', id, async () => {
    const s = await mongoose.connection.collection('sellers').findOne({ _id: oid(id) }, { projection: { status: 1, pwdAt: 1, registrationRejectedAt: 1 } });
    if (!s) return null;
    return { id: String(s._id), status: s.status || 'active', pwdAt: s.pwdAt || null, rejected: Boolean(s.registrationRejectedAt) };
  });
}

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

function readToken(req) {
  const token = bearer(req);
  if (!token) return null;
  try {
    return jwt.verify(token, jwtSecret());
  } catch {
    return null;
  }
}

/** Token -> live admin account. Returns { admin } or { status, message }. */
export async function resolveAdmin(payload) {
  if (!payload || payload.t !== 'admin') return { status: 401, message: 'Not authorized' };
  const account = await loadAdminAccount(payload.id);
  if (!account || !account.active) return { status: 401, message: 'This admin account is disabled or no longer exists. Please login again.' };
  if (olderThanPassword(payload, account.pwdAt)) return { status: 401, message: 'Session expired, please login again' };
  // `t` kept so code that passes req.admin on as a "seller" identity still sees an admin
  return { admin: { t: 'admin', id: account.id, name: account.name, email: account.email, role: account.role, permissions: account.permissions, financePartner: account.financePartner } };
}

/** Token -> live seller account. Returns { seller } or { status, message }. */
export async function resolveSeller(payload) {
  if (!payload || payload.t !== 'seller') return { status: 401, message: 'Seller access required' };
  const account = await loadSellerAccount(payload.id);
  if (!account) return { status: 401, message: 'Session expired, please login again' };
  // 401 (not 403) so the seller app signs the session out instead of showing a half-working screen.
  // A rejected registration is still refused. A SUSPENDED store may log in, but only to talk to
  // support (see SUSPENDED_ALLOWED below): everything else is closed.
  if (account.status === 'suspended' && account.rejected) return { status: 401, message: 'Your store registration was not approved. Please contact platform support.' };
  if (account.status === 'pending_approval') return { status: 401, message: 'Your merchant application is pending admin approval.' };
  if (olderThanPassword(payload, account.pwdAt)) return { status: 401, message: 'Session expired, please login again' };
  return { seller: payload, status: account.status };
}

/**
 * A suspended store can only: load its own profile (to see the banner), use the support chat
 * (thread, send, read, edit/delete its own messages, chat attachments) and keep phone alerts on.
 * Every other seller request is refused with { suspended: true }.
 */
const SUSPENDED_ALLOWED = [
  (m, u) => m === 'GET' && u === '/sellers/me',
  (m, u) => u.startsWith('/chat/seller/'),
  (m, u) => u.startsWith('/chat/messages/'),
  (m, u) => u === '/uploads' || u.startsWith('/uploads/'),
  (m, u) => u.startsWith('/push/seller/'),
];
function suspendedMayUse(req) {
  // routes are mounted both with and without the /api prefix
  const url = (`${req.baseUrl || ''}${req.path || ''}`.toLowerCase().replace(/\/+$/, '') || '/').replace(/^\/api(?=\/)/, '');
  return SUSPENDED_ALLOWED.some((ok) => ok(req.method, url));
}

const hasPerm = (admin, permission) => !permission || admin.role === 'super_admin' || (admin.permissions || []).includes(permission);

const unavailable = (res, err) => {
  console.error('[auth] account lookup failed:', err?.message || err);
  return res.status(503).json({ message: 'Could not check your login right now. Please try again.' });
};

// Admin auth; supports both authAdmin('perm') and authAdmin directly as middleware
export function authAdmin(permission = null) {
  if (permission && typeof permission === 'object' && permission.headers) {
    // Used directly as middleware: authAdmin(req, res, next)
    const req = permission;
    const res = arguments[1];
    const next = arguments[2];
    return verifyAdminToken(null, req, res, next);
  }
  return (req, res, next) => verifyAdminToken(permission, req, res, next);
}

async function verifyAdminToken(permission, req, res, next) {
  const hadToken = !!bearer(req);
  if (!hadToken) return res.status(401).json({ message: 'Not authorized' });
  const payload = readToken(req);
  if (!payload) return res.status(401).json({ message: 'Session expired, please login again' });
  try {
    const out = await resolveAdmin(payload);
    if (!out.admin) return res.status(out.status).json({ message: out.message });
    req.admin = out.admin;
    if (!hasPerm(out.admin, permission)) {
      return res.status(403).json({ message: 'You do not have permission for this action' });
    }
    next();
  } catch (err) {
    return unavailable(res, err);
  }
}

/**
 * When an ADMIN uses a seller-side route (to look at or act for a seller), which permission is
 * needed. Before, any admin account of any role could use all of them.
 */
function permissionForSellerRoute(req) {
  const url = `${req.baseUrl || ''}${req.path || ''}`.toLowerCase();
  if (url.includes('/chat')) return 'chat';
  if (url.includes('/uploads')) return null;
  if (url.includes('/wallet') || url.includes('/withdraw') || url.includes('/limit')) return 'finance';
  if (url.includes('/orders')) return 'orders';
  if (url.includes('/refunds')) return 'refunds';
  if (url.includes('/products') || url.includes('/inventory') || url.includes('/treasury')) return 'products';
  return 'sellers';
}

async function sellerOrAdmin(req, res, next, messages) {
  if (!bearer(req)) return res.status(401).json({ message: messages.missing });
  const payload = readToken(req);
  if (!payload) return res.status(401).json({ message: 'Session expired, please login again' });
  try {
    if (payload.t === 'seller') {
      const out = await resolveSeller(payload);
      if (!out.seller) return res.status(out.status).json({ message: out.message });
      if (out.status === 'suspended' && !suspendedMayUse(req)) {
        return res.status(403).json({
          suspended: true,
          message: 'Your seller account is suspended. Everything is closed except the support chat — please contact support to resolve it.',
        });
      }
      req.seller = out.seller;
      req.sellerStatus = out.status;
      return next();
    }
    if (payload.t === 'admin') {
      const out = await resolveAdmin(payload);
      if (!out.admin) return res.status(out.status).json({ message: out.message });
      if (!hasPerm(out.admin, permissionForSellerRoute(req))) {
        return res.status(403).json({ message: 'You do not have permission for this action' });
      }
      req.admin = out.admin;
      req.seller = out.admin;
      return next();
    }
    return res.status(401).json({ message: messages.wrongType });
  } catch (err) {
    return unavailable(res, err);
  }
}

// Seller auth (required for vendor portal, allows admin override)
export function authSeller(req, res, next) {
  return sellerOrAdmin(req, res, next, { missing: 'Seller authorization required', wrongType: 'Seller access required' });
}

// Seller OR Admin auth (allows Admin to inspect/perform actions on behalf of sellers)
export function authSellerOrAdmin(req, res, next) {
  return sellerOrAdmin(req, res, next, { missing: 'Authorization required', wrongType: 'Unauthorized' });
}

async function loadUserAccount(id) {
  if (!isId(id)) return null;
  return cached('user', id, async () => {
    const u = await mongoose.connection.collection('users').findOne({ _id: oid(id) }, { projection: { active: 1, pwdAt: 1 } });
    if (!u) return null;
    return { id: String(u._id), active: u.active !== false, pwdAt: u.pwdAt || null };
  });
}

/**
 * Is this customer login still good? A deleted or switched-off account, or a login made before
 * the password was changed, is not. If the database cannot be asked right now the token alone
 * decides (exactly as before), so a short database hiccup never signs customers out.
 */
async function customerLoginOk(payload) {
  try {
    const account = await loadUserAccount(payload.id);
    if (!account || !account.active) return false;
    return !olderThanPassword(payload, account.pwdAt);
  } catch {
    return true;
  }
}

// Customer auth (required)
export async function authUser(req, res, next) {
  const token = bearer(req);
  if (!token) return res.status(401).json({ message: 'Please login first' });
  let payload;
  try {
    payload = jwt.verify(token, jwtSecret());
  } catch {
    return res.status(401).json({ message: 'Session expired, please login again' });
  }
  if (payload.t !== 'user') return res.status(401).json({ message: 'Please login first' });
  if (!(await customerLoginOk(payload))) return res.status(401).json({ message: 'Session expired, please login again' });
  req.user = payload;
  next();
}

// Customer auth (optional — attaches req.user if a valid token is present)
export async function softUser(req, res, next) {
  const token = bearer(req);
  if (token) {
    try {
      const payload = jwt.verify(token, jwtSecret());
      if (payload.t === 'user' && (await customerLoginOk(payload))) req.user = payload;
    } catch {
      /* ignore */
    }
  }
  next();
}

/** For sockets: a token that belongs to a live admin / seller account, or null. */
export async function verifySocketToken(token) {
  if (!token || typeof token !== 'string') return null;
  let payload;
  try {
    payload = jwt.verify(token, jwtSecret());
  } catch {
    return null;
  }
  try {
    if (payload.t === 'admin') {
      const out = await resolveAdmin(payload);
      return out.admin ? { t: 'admin', ...out.admin } : null;
    }
    if (payload.t === 'seller') {
      const out = await resolveSeller(payload);
      return out.seller ? { t: 'seller', id: String(payload.id) } : null;
    }
    if (payload.t === 'user') return { t: 'user', id: String(payload.id) };
  } catch {
    return null;
  }
  return null;
}

// legacy default export (admin, no specific permission)
export default authAdmin();
