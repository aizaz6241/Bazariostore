import { Router } from 'express';
import bcrypt from 'bcryptjs';
import Admin, { ROLES } from '../models/Admin.js';
import { authAdmin } from '../middleware/auth.js';
import { PERMISSIONS, ROLE_DEFAULTS, ROLE_LABELS, permsFor } from '../utils/permissions.js';
import { audit } from '../utils/audit.js';

const router = Router();

router.get('/meta', authAdmin('staff'), (req, res) => {
  res.json({ roles: ROLES, roleLabels: ROLE_LABELS, permissions: PERMISSIONS, roleDefaults: ROLE_DEFAULTS });
});

router.get('/', authAdmin('staff'), async (req, res) => {
  const admins = await Admin.find().select('-passwordHash').sort({ createdAt: 1 });
  res.json(admins.map((a) => ({ ...a.toObject(), effectivePermissions: permsFor(a) })));
});

router.post('/', authAdmin('staff'), async (req, res) => {
  try {
    const { name, email, password, role, permissions } = req.body || {};
    if (!name?.trim() || !/^\S+@\S+\.\S+$/.test(email || '')) return res.status(400).json({ message: 'Valid name and email required' });
    if ((password || '').length < 6) return res.status(400).json({ message: 'Password kam az kam 6 characters' });
    if (await Admin.findOne({ email: email.toLowerCase().trim() })) return res.status(400).json({ message: 'Is email ka admin pehle se mojood hai' });

    let targetRole = ROLES.includes(role) ? role : 'admin';
    // Only existing super_admin can create another super_admin
    if (targetRole === 'super_admin' && req.admin.role !== 'super_admin') {
      targetRole = 'admin';
    }

    const admin = await Admin.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash: await bcrypt.hash(password, 10),
      role: targetRole,
      permissions: Array.isArray(permissions) ? permissions.filter((p) => PERMISSIONS.includes(p)) : [],
    });
    await audit(req, 'admin_created', 'admin', admin._id, { name: admin.name, email: admin.email, role: admin.role });
    res.status(201).json({ ...admin.toObject(), passwordHash: undefined });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.put('/:id', authAdmin('staff'), async (req, res) => {
  const admin = await Admin.findById(req.params.id);
  if (!admin) return res.status(404).json({ message: 'Admin not found' });
  const { name, role, permissions, active, password } = req.body || {};

  // Protection: only super_admin can modify another super_admin or promote someone to super_admin
  const isCallerSuperAdmin = req.admin.role === 'super_admin';
  if ((admin.role === 'super_admin' || role === 'super_admin') && !isCallerSuperAdmin) {
    return res.status(403).json({ message: 'Sirf Super Admin hi Super Admin roles ya accounts ko tabdeel kar sakta hai' });
  }

  // never let the last active super admin be demoted/disabled
  if (admin.role === 'super_admin' && (role !== 'super_admin' || active === false)) {
    const supers = await Admin.countDocuments({ role: 'super_admin', active: true });
    if (supers <= 1) return res.status(400).json({ message: 'Aakhri Super Admin ko demote/disable nahi kiya ja sakta' });
  }

  if (name?.trim()) admin.name = name.trim();
  if (ROLES.includes(role)) {
    if (role === 'super_admin' && !isCallerSuperAdmin) {
      // ignore unauthorized elevation
    } else {
      admin.role = role;
    }
  }
  if (Array.isArray(permissions)) admin.permissions = permissions.filter((p) => PERMISSIONS.includes(p));
  if (typeof active === 'boolean' && String(admin._id) !== String(req.admin.id)) admin.active = active;
  if (password) {
    if (password.length < 6) return res.status(400).json({ message: 'Password kam az kam 6 characters' });
    admin.passwordHash = await bcrypt.hash(password, 10);
  }
  await admin.save();
  await audit(req, 'admin_updated', 'admin', admin._id, { name: admin.name, role: admin.role, active: admin.active });
  res.json({ ...admin.toObject(), passwordHash: undefined });
});

router.delete('/:id', authAdmin('staff'), async (req, res) => {
  if (String(req.params.id) === String(req.admin.id)) return res.status(400).json({ message: 'Apna account delete nahi kar sakte' });
  const admin = await Admin.findById(req.params.id);
  if (!admin) return res.status(404).json({ message: 'Admin not found' });
  if (admin.role === 'super_admin') {
    if (req.admin.role !== 'super_admin') {
      return res.status(403).json({ message: 'Super Admin ko delete karne ke liye Super Admin hona zaroori hai' });
    }
    const supers = await Admin.countDocuments({ role: 'super_admin', active: true });
    if (supers <= 1) return res.status(400).json({ message: 'Aakhri Super Admin delete nahi ho sakta' });
  }
  await admin.deleteOne();
  await audit(req, 'admin_deleted', 'admin', req.params.id, { name: admin.name, email: admin.email });
  res.json({ ok: true });
});

export default router;
