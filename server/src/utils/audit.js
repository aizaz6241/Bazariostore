import AuditLog from '../models/AuditLog.js';

export async function audit(req, action, entity = '', entityId = '', details = null) {
  try {
    await AuditLog.create({
      admin: { id: req.admin?.id || '', name: req.admin?.name || '', email: req.admin?.email || '' },
      action,
      entity,
      entityId: String(entityId || ''),
      details,
    });
  } catch (e) {
    console.error('audit log failed:', e.message);
  }
}
