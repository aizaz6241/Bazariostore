import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import AuditLog from '../models/AuditLog.js';
import { authAdmin } from '../middleware/auth.js';
import { permsFor } from '../utils/permissions.js';
import { audit } from '../utils/audit.js';
import { comparePassword, cleanEmail } from '../utils/password.js';

const router = Router();

function signAdmin(admin) {
  return jwt.sign(
    {
      t: 'admin',
      id: admin._id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      permissions: permsFor(admin),
    },
    process.env.JWT_SECRET,
    { expiresIn: '365d' }
  );
}

router.post('/login', async (req, res) => {
  const email = cleanEmail(req.body?.email);
  const password = String(req.body?.password || '');

  // failed attempts are logged (email + reason only, never the password) so
  // "kis wajah se login fail hua" Audit Logs / server logs mein nazar aaye
  const fail = async (reason) => {
    console.log(`[admin-login-failed] email="${email}" reason=${reason}`);
    try {
      await AuditLog.create({ admin: { id: '', name: '(login attempt)', email }, action: 'login_failed', entity: 'admin', details: { reason } });
    } catch {}
    return res.status(401).json({ message: 'Invalid email or password' });
  };

  const admin = await Admin.findOne({ email });
  if (!admin) return fail('email_not_found');
  if (!admin.active) return fail('account_disabled');
  // mobile keyboards spaces / invisible unicode daal dete hain — tolerant match
  if (!(await comparePassword(password, admin.passwordHash))) return fail('wrong_password');
  admin.lastLoginAt = new Date();
  await admin.save();
  req.admin = { id: admin._id, name: admin.name, email: admin.email };
  await audit(req, 'login', 'admin', admin._id, { role: admin.role });
  res.json({
    token: signAdmin(admin),
    admin: { id: admin._id, name: admin.name, email: admin.email, role: admin.role, permissions: permsFor(admin) },
  });
});

router.get('/me', authAdmin(), async (req, res) => {
  const admin = await Admin.findById(req.admin.id);
  if (!admin || !admin.active) return res.status(401).json({ message: 'Account disabled' });
  res.json({ admin: { id: admin._id, name: admin.name, email: admin.email, role: admin.role, permissions: permsFor(admin) } });
});

export default router;
