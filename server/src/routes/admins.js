import { Router } from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import Admin, { ROLES } from '../models/Admin.js';
import { authAdmin, isFinancePartner, forgetAuthCache } from '../middleware/auth.js';
import { PERMISSIONS, ROLE_DEFAULTS, ROLE_LABELS, permsFor } from '../utils/permissions.js';
import { audit } from '../utils/audit.js';
import { finLog, requestApproval } from '../utils/financeLog.js';
import { asText } from '../middleware/sanitize.js';
import { signAdmin } from './auth.js';

/**
 * ADMIN ACCOUNTS (Staff screen)
 *
 * Two kinds of admin account:
 *   - Finance partner: shares the Binance money and approves the other partner's sensitive
 *     actions on the team portal.
 *   - Staff (support, orders, inventory, ...): works in this admin panel with the permissions of
 *     its role. No share of the money and no team portal.
 *
 * Two-person rule: creating an admin, deleting one, or changing someone's role / permissions /
 * status / finance-partner setting / password is not applied here. It is stored as a request and
 * applied by the team portal after ANOTHER finance partner approves it. Changing your own name or
 * your own password is immediate. (When there is no other active finance partner to ask, nothing
 * can be approved, so the change is applied at once and written to the log.)
 */

const router = Router();
const MIN_PASSWORD = 8;

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const isId = (v) => mongoose.Types.ObjectId.isValid(String(v || ''));

const publicAdmin = (a) => {
  const o = a.toObject ? a.toObject() : { ...a };
  delete o.passwordHash;
  return { ...o, effectivePermissions: permsFor(o), financePartner: isFinancePartner(o) };
};

/** Is there another active finance partner who could approve a request made by this admin? */
async function anotherPartnerExists(requesterId) {
  const all = await Admin.find({ active: { $ne: false } }).select('role financePartner').lean();
  return all.some((a) => String(a._id) !== String(requesterId) && isFinancePartner(a));
}

async function partnerCountAfter({ excludeId = null, add = false } = {}) {
  const all = await Admin.find({ active: { $ne: false } }).select('role financePartner').lean();
  return all.filter((a) => String(a._id) !== String(excludeId) && isFinancePartner(a)).length + (add ? 1 : 0);
}

const partnerWarning = (count) =>
  count === 2 ? '' : `After this there will be ${count} finance partner${count === 1 ? '' : 's'}. The finance ledger divides money only when there are exactly 2, so every split will be PAUSED until that is true again (or new rules are added for ${count}).`;

router.get('/meta', authAdmin('staff'), (req, res) => {
  res.json({ roles: ROLES, roleLabels: ROLE_LABELS, permissions: PERMISSIONS, roleDefaults: ROLE_DEFAULTS });
});

router.get(
  '/',
  authAdmin('staff'),
  wrap(async (req, res) => {
    const admins = await Admin.find().select('-passwordHash').sort({ createdAt: 1 });
    res.json(admins.map(publicAdmin));
  })
);

// ───────────────────────── Create ─────────────────────────
router.post(
  '/',
  authAdmin('staff'),
  wrap(async (req, res) => {
    const name = asText(req.body?.name, 80).trim();
    const email = asText(req.body?.email, 200).toLowerCase().trim();
    const password = asText(req.body?.password, 200);
    const { role, permissions } = req.body || {};
    const wantsPartner = req.body?.financePartner === true;

    if (!name || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Valid name and email required' });
    if (password.length < MIN_PASSWORD) return res.status(400).json({ message: `Password kam az kam ${MIN_PASSWORD} characters ka hona chahiye` });
    if (await Admin.findOne({ email })) return res.status(400).json({ message: 'Is email ka admin pehle se mojood hai' });

    let targetRole = ROLES.includes(role) ? role : 'admin';
    // Only existing super_admin can create another super_admin
    if (targetRole === 'super_admin' && req.admin.role !== 'super_admin') targetRole = 'admin';

    // A finance partner needs the full admin role; a staff role never shares the money
    const financePartner = wantsPartner && ['super_admin', 'admin'].includes(targetRole);
    const cleanPerms = Array.isArray(permissions) ? permissions.filter((p) => PERMISSIONS.includes(p)) : [];
    const passwordHash = await bcrypt.hash(password, 10);
    const record = { name, email, role: targetRole, permissions: cleanPerms, financePartner };

    const count = await partnerCountAfter({ add: financePartner });
    const warning = financePartner ? partnerWarning(count) : '';

    if (await anotherPartnerExists(req.admin.id)) {
      const asked = await requestApproval(req, {
        action: 'admin_create',
        targetId: `admin:${email}`,
        summary: `Create a new admin account “${name}” (${email}) — ${financePartner ? 'FINANCE PARTNER' : `staff, role ${ROLE_LABELS[targetRole] || targetRole}`}`,
        details: [
          `Role: ${ROLE_LABELS[targetRole] || targetRole}`,
          financePartner ? 'Finance partner: YES (shares the Binance money, can use the team portal)' : 'Finance partner: no (no share of the money, no team portal)',
          `Permissions: ${(cleanPerms.length ? cleanPerms : ROLE_DEFAULTS[targetRole] || []).join(', ') || 'none'}`,
          ...(warning ? [`⚠ ${warning}`] : []),
        ],
        payload: { ...record, passwordHash },
        logPayload: record,
      });
      return res.status(202).json({ pendingApproval: true, message: asked.message });
    }

    const admin = await Admin.create({ ...record, passwordHash, pwdAt: new Date() });
    await audit(req, 'admin_created', 'admin', admin._id, { name: admin.name, email: admin.email, role: admin.role });
    await finLog(req, {
      action: 'admin.created',
      summary: `Created the admin account “${admin.name}” (${admin.email}) — ${financePartner ? 'finance partner' : `staff, role ${admin.role}`}. There was no other finance partner to approve it.`,
      entity: 'admin',
      entityId: admin._id,
      after: record,
    });
    res.status(201).json({ ...publicAdmin(admin), warning });
  })
);

// ───────────────────────── Update ─────────────────────────
router.put(
  '/:id',
  authAdmin('staff'),
  wrap(async (req, res) => {
    if (!isId(req.params.id)) return res.status(404).json({ message: 'Admin not found' });
    const admin = await Admin.findById(req.params.id);
    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    const name = asText(req.body?.name, 80).trim();
    const password = asText(req.body?.password, 200);
    const { role, permissions, active } = req.body || {};
    const isSelf = String(admin._id) === String(req.admin.id);
    const isCallerSuperAdmin = req.admin.role === 'super_admin';

    // Protection: only super_admin can modify another super_admin or promote someone to super_admin
    if ((admin.role === 'super_admin' || role === 'super_admin') && !isCallerSuperAdmin) {
      return res.status(403).json({ message: 'Sirf Super Admin hi Super Admin roles ya accounts ko tabdeel kar sakta hai' });
    }
    if (password && password.length < MIN_PASSWORD) return res.status(400).json({ message: `Password kam az kam ${MIN_PASSWORD} characters ka hona chahiye` });

    const before = { name: admin.name, role: admin.role, active: admin.active !== false, permissions: [...(admin.permissions || [])], financePartner: isFinancePartner(admin) };

    // What is being asked for
    const set = {};
    if (ROLES.includes(role) && role !== admin.role) set.role = role;
    if (Array.isArray(permissions)) {
      const clean = permissions.filter((p) => PERMISSIONS.includes(p));
      if (JSON.stringify(clean) !== JSON.stringify(before.permissions)) set.permissions = clean;
    }
    if (typeof active === 'boolean' && !isSelf && active !== before.active) set.active = active;
    const roleAfter = set.role || admin.role;
    if (typeof req.body?.financePartner === 'boolean') {
      const want = req.body.financePartner && ['super_admin', 'admin'].includes(roleAfter);
      if (want !== before.financePartner) set.financePartner = want;
    } else if (set.role && !['super_admin', 'admin'].includes(roleAfter) && before.financePartner) {
      set.financePartner = false; // moved to a staff role: no longer shares the money
    }

    // never let the last active super admin be demoted/disabled
    if (admin.role === 'super_admin' && ((set.role && set.role !== 'super_admin') || set.active === false)) {
      const supers = await Admin.countDocuments({ role: 'super_admin', active: true });
      if (supers <= 1) return res.status(400).json({ message: 'Aakhri Super Admin ko demote/disable nahi kiya ja sakta' });
    }

    const passwordOfSomeoneElse = Boolean(password) && !isSelf;
    const sensitive = Object.keys(set).length > 0 || passwordOfSomeoneElse;

    // 1. Own name / own password: at once
    const changedNow = [];
    if (name && name !== admin.name) {
      admin.name = name;
      changedNow.push('name');
    }
    if (password && isSelf) {
      admin.passwordHash = await bcrypt.hash(password, 10);
      admin.pwdAt = new Date();
      changedNow.push('password changed');
    }

    // 2. Everything else: two people
    let notice = '';
    let pending = false;
    if (sensitive) {
      const changes = [];
      if (set.role) changes.push(`role ${ROLE_LABELS[before.role] || before.role} → ${ROLE_LABELS[set.role] || set.role}`);
      if (set.permissions) changes.push(`permissions → ${set.permissions.join(', ') || 'role defaults'}`);
      if (set.active !== undefined) changes.push(set.active ? 'switch the account ON' : 'switch the account OFF');
      if (set.financePartner !== undefined) changes.push(set.financePartner ? 'make a FINANCE PARTNER' : 'remove as finance partner');
      if (passwordOfSomeoneElse) changes.push('set a new password');

      let warning = '';
      const stillPartner = set.financePartner !== undefined ? set.financePartner : before.financePartner;
      const stillActive = set.active !== undefined ? set.active : before.active;
      if (stillPartner !== before.financePartner || stillActive !== before.active) {
        const count = await partnerCountAfter({ excludeId: admin._id, add: stillPartner && stillActive });
        warning = partnerWarning(count);
      }

      if (await anotherPartnerExists(req.admin.id)) {
        const payload = { id: String(admin._id), set };
        const logPayload = { id: String(admin._id), set: { ...set }, passwordChanged: passwordOfSomeoneElse };
        if (passwordOfSomeoneElse) payload.passwordHash = await bcrypt.hash(password, 10);
        const asked = await requestApproval(req, {
          action: 'admin_update',
          targetId: `admin:${admin._id}`,
          summary: `Change the admin account “${admin.name}” (${admin.email}): ${changes.join('; ')}`,
          details: warning ? [`⚠ ${warning}`] : [],
          payload,
          logPayload,
        });
        pending = true;
        notice = `These changes were not applied yet (${changes.join('; ')}). ${asked.message}`;
      } else {
        Object.assign(admin, set);
        if (passwordOfSomeoneElse) {
          admin.passwordHash = await bcrypt.hash(password, 10);
          admin.pwdAt = new Date();
        }
        changedNow.push(...changes);
        notice = warning;
      }
    }

    if (changedNow.length > 0) {
      await admin.save();
      forgetAuthCache('admin', admin._id);
      await audit(req, 'admin_updated', 'admin', admin._id, { name: admin.name, role: admin.role, active: admin.active });
      await finLog(req, {
        action: 'admin.updated',
        summary: `Admin account “${admin.name}” (${admin.email}): ${changedNow.join(', ')}`,
        entity: 'admin',
        entityId: admin._id,
        before,
        after: { name: admin.name, role: admin.role, active: admin.active !== false, permissions: admin.permissions, financePartner: isFinancePartner(admin) },
      });
    }

    res.json({
      ...publicAdmin(admin),
      pendingApproval: pending,
      message: notice,
      // changing your own password ends every older login; this is a fresh one for this browser
      ...(password && isSelf ? { token: signAdmin(admin) } : {}),
    });
  })
);

// ───────────────────────── Delete ─────────────────────────
router.delete(
  '/:id',
  authAdmin('staff'),
  wrap(async (req, res) => {
    if (String(req.params.id) === String(req.admin.id)) return res.status(400).json({ message: 'Apna account delete nahi kar sakte' });
    if (!isId(req.params.id)) return res.status(404).json({ message: 'Admin not found' });
    const admin = await Admin.findById(req.params.id);
    if (!admin) return res.status(404).json({ message: 'Admin not found' });
    if (admin.role === 'super_admin') {
      if (req.admin.role !== 'super_admin') {
        return res.status(403).json({ message: 'Super Admin ko delete karne ke liye Super Admin hona zaroori hai' });
      }
      const supers = await Admin.countDocuments({ role: 'super_admin', active: true });
      if (supers <= 1) return res.status(400).json({ message: 'Aakhri Super Admin delete nahi ho sakta' });
    }

    const wasPartner = isFinancePartner(admin) && admin.active !== false;
    const warning = wasPartner ? partnerWarning(await partnerCountAfter({ excludeId: admin._id })) : '';

    if (await anotherPartnerExists(req.admin.id)) {
      const asked = await requestApproval(req, {
        action: 'admin_delete',
        targetId: `admin:${admin._id}`,
        summary: `Delete the admin account “${admin.name}” (${admin.email}, ${wasPartner ? 'finance partner' : `role ${ROLE_LABELS[admin.role] || admin.role}`})`,
        details: warning ? [`⚠ ${warning}`] : [],
        payload: { id: String(admin._id) },
      });
      return res.status(202).json({ ok: true, pendingApproval: true, message: asked.message });
    }

    await admin.deleteOne();
    forgetAuthCache('admin', req.params.id);
    await audit(req, 'admin_deleted', 'admin', req.params.id, { name: admin.name, email: admin.email });
    await finLog(req, {
      action: 'admin.deleted',
      summary: `Deleted the admin account “${admin.name}” (${admin.email}, role ${admin.role}). There was no other finance partner to approve it.`,
      entity: 'admin',
      entityId: req.params.id,
      before: { name: admin.name, email: admin.email, role: admin.role, active: admin.active, financePartner: wasPartner },
    });
    res.json({ ok: true, warning });
  })
);

export default router;
