import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import { authAdmin } from '../middleware/auth.js';
import { permsFor } from '../utils/permissions.js';
import { audit } from '../utils/audit.js';

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
    { expiresIn: '7d' }
  );
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const admin = await Admin.findOne({ email: (email || '').toLowerCase().trim() });
  if (!admin || !admin.active || !(await bcrypt.compare(password || '', admin.passwordHash))) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  admin.lastLoginAt = new Date();
  await admin.save();
  req.admin = { id: admin._id, name: admin.name, email: admin.email };
  await audit(req, 'login', 'admin', admin._id, { role: admin.role });
  res.json({
    token: signAdmin(admin),
    admin: { name: admin.name, email: admin.email, role: admin.role, permissions: permsFor(admin) },
  });
});

router.get('/me', authAdmin(), async (req, res) => {
  const admin = await Admin.findById(req.admin.id);
  if (!admin || !admin.active) return res.status(401).json({ message: 'Account disabled' });
  res.json({ admin: { name: admin.name, email: admin.email, role: admin.role, permissions: permsFor(admin) } });
});

export default router;
