import { Router } from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import Admin, { ROLES } from '../models/Admin.js';
import { authAdmin, isFinancePartner, forgetAuthCache } from '../middleware/auth.js';
import { PERMISSIONS, PERMISSION_INFO, ROLE_DEFAULTS, ROLE_LABELS, permsFor } from '../utils/permissions.js';
import AuditLog from '../models/AuditLog.js';
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

/**
 * NO PRIVILEGE ESCALATION
 * A staff account that holds the "staff" permission (but is not the Super Admin) can only manage
 * accounts that are not more powerful than itself, and can only hand out access it holds itself.
 * Otherwise e.g. a manager given "staff" could create an account with finance access, or raise
 * its own permissions.
 */
const isSuper = (a) => a?.role === 'super_admin';
const callerPerms = (req) => (isSuper(req.admin) ? [...PERMISSIONS] : req.admin.permissions || []);
const missingFrom = (perms, allowed) => perms.filter((p) => !allowed.includes(p));

/** Why the caller may not give an account this access (or '' when it is allowed). */
function grantProblem(req, { role, permissions, financePartner }) {
  if (isSuper(req.admin)) return '';
  const effective = permsFor({ role, permissions });
  const extra = missingFrom(effective, callerPerms(req));
  if (extra.length) return `You can only give access you have yourself. Missing on your account: ${extra.join(', ')}`;
  if (financePartner && !req.admin.financePartner) return 'Only a finance partner can make someone a finance partner';
  return '';
}

/** Why the caller may not manage this existing account (or '' when it is allowed). */
function manageProblem(req, target) {
  if (isSuper(req.admin)) return '';
  if (isSuper(target)) return 'Only the Super Admin can change a Super Admin account';
  if (missingFrom(permsFor(target), callerPerms(req)).length) return 'This account has access that your account does not have, so only the Super Admin can change it';
  if (isFinancePartner(target) && !req.admin.financePartner) return 'Only a finance partner can change a finance partner account';
  return '';
}

const partnerWarning = (count) =>
  count === 2 ? '' : `After this there will be ${count} finance partner${count === 1 ? '' : 's'}. The finance ledger divides money only when there are exactly 2, so every split will be PAUSED until that is true again (or new rules are added for ${count}).`;

router.get('/meta', authAdmin('staff'), (req, res) => {
  res.json({
    roles: ROLES,
    roleLabels: ROLE_LABELS,
    permissions: PERMISSIONS,
    permissionInfo: PERMISSION_INFO,
    roleDefaults: ROLE_DEFAULTS,
    // what the signed-in admin may hand out (the screen greys out the rest)
    me: { id: req.admin.id, role: req.admin.role, permissions: callerPerms(req), financePartner: Boolean(req.admin.financePartner) },
  });
});

// ───────────────────────── Insights (charts on the Staff screen) ─────────────────────────
const DAY = 24 * 3600 * 1000;
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

router.get(
  '/insights',
  authAdmin('staff'),
  wrap(async (req, res) => {
    const days = Math.min(90, Math.max(7, parseInt(req.query.days, 10) || 30));
    const now = Date.now();
    const since = new Date(now - (days - 1) * DAY);
    since.setUTCHours(0, 0, 0, 0);

    const admins = await Admin.find().select('name email role permissions active financePartner lastLoginAt createdAt').lean();
    const ids = admins.map((a) => String(a._id));

    const [daily, perAdmin, recent, pending] = await Promise.all([
      AuditLog.aggregate([
        { $match: { createdAt: { $gte: since }, 'admin.id': { $in: ids } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            actions: { $sum: { $cond: [{ $eq: ['$action', 'login'] }, 0, 1] } },
            logins: { $sum: { $cond: [{ $eq: ['$action', 'login'] }, 1, 0] } },
          },
        },
      ]),
      AuditLog.aggregate([
        { $match: { createdAt: { $gte: since }, 'admin.id': { $in: ids } } },
        {
          $group: {
            _id: '$admin.id',
            actions: { $sum: { $cond: [{ $eq: ['$action', 'login'] }, 0, 1] } },
            logins: { $sum: { $cond: [{ $eq: ['$action', 'login'] }, 1, 0] } },
            lastAt: { $max: '$createdAt' },
          },
        },
      ]),
      AuditLog.find({ 'admin.id': { $in: ids }, action: { $ne: 'login' } })
        .sort({ createdAt: -1 })
        .limit(12)
        .select('admin action entity createdAt')
        .lean(),
      mongoose.connection.db
        .collection('portalfinanceapprovals')
        .find({ action: { $in: ['admin_create', 'admin_update', 'admin_delete'] }, status: { $in: ['pending', 'processing'] } })
        .project({ summary: 1, action: 1, requestedBy: 1, createdAt: 1 })
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray()
        .catch(() => []),
    ]);

    // one point per day, including quiet days
    const byDay = new Map(daily.map((d) => [d._id, d]));
    const timeline = [];
    for (let t = since.getTime(); t <= now; t += DAY) {
      const k = dayKey(t);
      timeline.push({ date: k, actions: byDay.get(k)?.actions || 0, logins: byDay.get(k)?.logins || 0 });
    }

    const active = admins.filter((a) => a.active !== false);
    const roles = ROLES.map((r) => ({
      role: r,
      label: ROLE_LABELS[r] || r,
      total: admins.filter((a) => a.role === r).length,
      active: active.filter((a) => a.role === r).length,
    }));
    const coverage = PERMISSIONS.map((p) => ({
      permission: p,
      label: PERMISSION_INFO[p]?.label || p,
      group: PERMISSION_INFO[p]?.group || '',
      count: active.filter((a) => permsFor(a).includes(p)).length,
    }));

    const ago = (d) => (d ? now - new Date(d).getTime() : Infinity);
    const loginBuckets = [
      { key: 'today', label: 'Last 24h', count: active.filter((a) => ago(a.lastLoginAt) <= DAY).length },
      { key: 'week', label: '1–7 days', count: active.filter((a) => ago(a.lastLoginAt) > DAY && ago(a.lastLoginAt) <= 7 * DAY).length },
      { key: 'month', label: '8–30 days', count: active.filter((a) => ago(a.lastLoginAt) > 7 * DAY && ago(a.lastLoginAt) <= 30 * DAY).length },
      { key: 'older', label: '30+ days', count: active.filter((a) => a.lastLoginAt && ago(a.lastLoginAt) > 30 * DAY).length },
      { key: 'never', label: 'Never', count: active.filter((a) => !a.lastLoginAt).length },
    ];

    const nameOf = new Map(admins.map((a) => [String(a._id), a]));
    const activity = perAdmin
      .map((r) => ({ id: r._id, name: nameOf.get(r._id)?.name || 'Admin', role: nameOf.get(r._id)?.role || '', actions: r.actions, logins: r.logins, lastAt: r.lastAt }))
      .sort((a, b) => b.actions - a.actions || b.logins - a.logins);

    // Access that deserves a second look
    const risks = [];
    const supers = active.filter((a) => a.role === 'super_admin').length;
    if (supers <= 1) risks.push({ level: 'warn', text: 'Only one active Super Admin. If that login is lost, nobody can manage Super Admin accounts.' });
    const partners = active.filter((a) => isFinancePartner(a)).length;
    if (partners !== 2) risks.push({ level: 'warn', text: `${partners} active finance partner${partners === 1 ? '' : 's'}: the ledger divides money only with exactly 2.` });
    const staffHolders = active.filter((a) => a.role !== 'super_admin' && permsFor(a).includes('staff'));
    if (staffHolders.length) risks.push({ level: 'info', text: `${staffHolders.map((a) => a.name).join(', ')} can manage staff without being Super Admin.` });
    const idle = active.filter((a) => a.role !== 'super_admin' && ago(a.lastLoginAt) > 30 * DAY);
    if (idle.length) risks.push({ level: 'info', text: `${idle.length} active account${idle.length === 1 ? ' has' : 's have'} not logged in for 30+ days — consider switching ${idle.length === 1 ? 'it' : 'them'} off.` });
    const custom = active.filter((a) => a.role !== 'super_admin' && (a.permissions || []).length);
    if (custom.length) risks.push({ level: 'info', text: `${custom.length} account${custom.length === 1 ? ' uses' : 's use'} custom permissions instead of the role defaults.` });

    res.json({
      days,
      totals: {
        total: admins.length,
        active: active.length,
        inactive: admins.length - active.length,
        partners,
        superAdmins: supers,
        customPermissions: custom.length,
        activeLast7: active.filter((a) => ago(a.lastLoginAt) <= 7 * DAY).length,
        actions: timeline.reduce((n, d) => n + d.actions, 0),
        logins: timeline.reduce((n, d) => n + d.logins, 0),
      },
      timeline,
      roles,
      coverage,
      loginBuckets,
      activity,
      recent: recent.map((r) => ({ id: String(r._id), name: r.admin?.name || 'Admin', adminId: r.admin?.id || '', action: r.action, entity: r.entity || '', at: r.createdAt })),
      pending: pending.map((p) => ({ id: String(p._id), action: p.action, summary: p.summary, by: p.requestedBy?.name || '', at: p.createdAt })),
      risks,
    });
  })
);

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
    const grantIssue = grantProblem(req, { role: targetRole, permissions: cleanPerms, financePartner });
    if (grantIssue) return res.status(403).json({ message: grantIssue });
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
    if (!isSelf) {
      const issue = manageProblem(req, admin);
      if (issue) return res.status(403).json({ message: issue });
    }

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

    // Your own role / permissions / finance-partner setting are changed by someone else (no self-promotion)
    if (isSelf && !isCallerSuperAdmin && (set.role || set.permissions || set.financePartner !== undefined)) {
      return res.status(403).json({ message: 'You cannot change your own role or permissions. Ask the Super Admin.' });
    }
    if (set.role || set.permissions || set.financePartner) {
      const grantIssue = grantProblem(req, {
        role: roleAfter,
        // a new role without a custom list falls back to that role's defaults
        permissions: set.permissions || (set.role ? [] : admin.permissions || []),
        financePartner: set.financePartner,
      });
      if (grantIssue) return res.status(403).json({ message: grantIssue });
    }

    // never let the last active super admin be demoted/disabled (an already switched-off super
    // admin is not that last one: it was counted as if it were)
    if (admin.role === 'super_admin' && admin.active !== false && ((set.role && set.role !== 'super_admin') || set.active === false)) {
      const supers = await Admin.countDocuments({ role: 'super_admin', active: { $ne: false } });
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
      // an open admin panel of this account follows the change at once (rooms / closed account)
      await req.app.get('resyncAdminSockets')?.(admin._id);
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
      const supers = await Admin.countDocuments({ role: 'super_admin', active: { $ne: false } });
      if (admin.active !== false && supers <= 1) return res.status(400).json({ message: 'Aakhri Super Admin delete nahi ho sakta' });
    }
    const issue = manageProblem(req, admin);
    if (issue) return res.status(403).json({ message: issue });

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
    // its open admin panel stops receiving live data at once
    await req.app.get('resyncAdminSockets')?.(req.params.id);
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
