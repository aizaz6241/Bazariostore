import { Router } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import AuditLog from '../models/AuditLog.js';
import { authAdmin, isFinancePartner, loadAdminAccount, forgetAuthCache } from '../middleware/auth.js';
import { jwtSecret } from '../utils/secrets.js';
import { failureLimiter } from '../utils/rateLimit.js';
import { asText } from '../middleware/sanitize.js';
import { permsFor } from '../utils/permissions.js';
import { audit } from '../utils/audit.js';
import { comparePassword, cleanEmail } from '../utils/password.js';

const router = Router();

/** What the admin panel is told about the signed-in admin. */
function adminInfo(admin, live) {
  const out = {
    id: admin._id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    permissions: live ? live.permissions : permsFor(admin),
    financePartner: live ? live.financePartner : isFinancePartner(admin),
  };
  // assigned-stores-only (team member): the panel shows only what this account can use
  if (live?.scope) {
    out.scoped = true;
    out.teamStaff = Boolean(live.teamMemberId);
    out.storeCount = live.scope.length;
  }
  return out;
}

// Wrong passwords: 8 tries per account from one address in 15 minutes, then a 15 minute wait
const loginGuard = failureLimiter({ name: 'admin-login', max: 8, windowMs: 15 * 60 * 1000 });

export function signAdmin(admin) {
  return jwt.sign(
    {
      t: 'admin',
      id: admin._id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      permissions: permsFor(admin),
    },
    jwtSecret(),
    // Long on purpose (no logging in again every few days). Safe because every request checks the
    // account again: a disabled admin, a changed role or a changed password takes effect at once.
    { expiresIn: '365d' }
  );
}

router.post('/login', async (req, res) => {
  try {
    const email = cleanEmail(asText(req.body?.email, 200));
    const password = asText(req.body?.password, 200);
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    const blocked = loginGuard.check(req, email);
    if (blocked.blocked) return res.status(429).json({ message: blocked.message });

    // failed attempts are logged (email + reason only, never the password) so
    // "kis wajah se login fail hua" Audit Logs / server logs mein nazar aaye
    const fail = async (reason) => {
      console.log(`[admin-login-failed] email="${email}" reason=${reason}`);
      try {
        await AuditLog.create({ admin: { id: '', name: '(login attempt)', email }, action: 'login_failed', entity: 'admin', details: { reason } });
      } catch {}
      loginGuard.fail(req, email);
      return res.status(401).json({ message: 'Invalid email or password' });
    };

    let admin = await Admin.findOne({
      $or: [{ email }, { email: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }],
    });
    // a team member logs in with his team portal username (or team email)
    if (!admin) admin = await Admin.findOne({ teamLogins: email.toLowerCase(), teamMemberId: { $exists: true, $ne: null } });
    if (!admin) return fail('email_not_found');
    if (!admin.active) return fail('account_disabled');
    // TEAM STAFF: the password is the one of his team portal account (always the current one)
    let hash = admin.passwordHash;
    if (admin.teamMemberId) {
      const member = await mongoose.connection
        .collection('portalmembers')
        .findOne({ _id: admin.teamMemberId }, { projection: { active: 1, deletedAt: 1, role: 1, passwordHash: 1 } });
      if (!member || member.active === false || member.deletedAt || member.role === 'admin') return fail('team_member_disabled');
      hash = member.passwordHash;
    }
    if (!(await comparePassword(password, hash))) return fail('wrong_password');
    loginGuard.ok(req, email);
    admin.lastLoginAt = new Date();
    await admin.save();
    // the live account (team password copy, assigned stores, permissions cut for assigned-stores staff)
    forgetAuthCache('admin', admin._id);
    const live = await loadAdminAccount(admin._id);
    if (!live || !live.active) return fail('account_disabled');
    req.admin = { id: admin._id, name: admin.name, email: admin.email };
    await audit(req, 'login', 'admin', admin._id, { role: admin.role, ...(live.scope ? { teamStaff: true, stores: live.scope.length } : {}) });
    res.json({
      token: signAdmin(admin),
      admin: adminInfo(admin, live),
    });
  } catch (err) {
    console.error('[admin-login-error]', err);
    res.status(500).json({ message: err.message || 'Login failed. Please try again.' });
  }
});

router.get('/me', authAdmin(), async (req, res) => {
  const admin = await Admin.findById(req.admin.id);
  if (!admin || !admin.active) return res.status(401).json({ message: 'Account disabled' });
  const live = await loadAdminAccount(admin._id);
  if (!live || !live.active) return res.status(401).json({ message: 'Account disabled' });
  res.json({ admin: adminInfo(admin, live) });
});

export default router;
