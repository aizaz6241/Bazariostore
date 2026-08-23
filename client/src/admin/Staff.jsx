import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api.js';
import { Modal, Toggle, ErrorBox, F } from './ui.jsx';
import Ic from '../components/Icons.jsx';

const EMPTY = { name: '', email: '', password: '', role: 'admin', permissions: [] };

const ROLE_COLORS = {
  super_admin: { bg: '#f3e8ff', color: '#7e22ce', border: '#d8b4fe' },
  admin: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  manager: { bg: '#fef3c7', color: '#b45309', border: '#fde68a' },
  support: { bg: '#ecfeff', color: '#0e7490', border: '#a5f3fc' },
  order_manager: { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
  inventory: { bg: '#f1f5f9', color: '#334155', border: '#cbd5e1' },
};

export default function Staff() {
  const [admins, setAdmins] = useState([]);
  const [meta, setMeta] = useState(null);
  const [edit, setEdit] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => api('/admins').then(setAdmins).catch((e) => setError(e.message));

  useEffect(() => {
    load();
    api('/admins/meta').then(setMeta).catch(() => {});
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (edit._id) await api(`/admins/${edit._id}`, { method: 'PUT', body: edit });
      else await api('/admins', { method: 'POST', body: edit });
      setEdit(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (a) => {
    try {
      await api(`/admins/${a._id}`, { method: 'PUT', body: { active: !a.active } });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const del = async (a) => {
    if (!window.confirm(`Are you sure you want to delete administrator "${a.name}"?`)) return;
    try {
      await api(`/admins/${a._id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const togglePerm = (p) =>
    setEdit({
      ...edit,
      permissions: edit.permissions.includes(p) ? edit.permissions.filter((x) => x !== p) : [...edit.permissions, p],
    });

  const roleDefaults = meta?.roleDefaults?.[edit?.role] || [];

  const filteredAdmins = admins.filter((a) => {
    if (!q) return true;
    const term = q.toLowerCase();
    return (
      (a.name || '').toLowerCase().includes(term) ||
      (a.email || '').toLowerCase().includes(term) ||
      (a.role || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="admin-staff-page">
      {/* Header Row */}
      <div className="admin-header-row">
        <div>
          <h2>👥 Staff &amp; Team Management</h2>
          <p className="muted">Manage administrative personnel, department roles, and granular platform access permissions.</p>
        </div>
        <button className="btn-primary" onClick={() => setEdit({ ...EMPTY })}>
          <Ic name="plus" size={16} /> + Onboard Staff Member
        </button>
      </div>

      <ErrorBox error={error} />

      {/* Summary KPI Bar */}
      <div className="admin-staff-stats-bar">
        <div className="stat-box">
          <span className="lbl">Total Team Members</span>
          <b className="val">{admins.length}</b>
        </div>
        <div className="stat-box">
          <span className="lbl">Super Admins</span>
          <b className="val text-purple">{admins.filter((a) => a.role === 'super_admin').length}</b>
        </div>
        <div className="stat-box">
          <span className="lbl">Active Accounts</span>
          <b className="val text-green">{admins.filter((a) => a.active).length}</b>
        </div>
        <div className="stat-box">
          <span className="lbl">System Permissions</span>
          <b className="val text-blue">{meta?.permissions?.length || 0} Modules</b>
        </div>
      </div>

      {/* Search Bar */}
      <div className="table-search-row">
        <div className="search-field">
          <Ic name="search" size={16} />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search staff by name, email, or role..."
          />
        </div>
      </div>

      {/* Staff Members Table */}
      <div className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Staff Member</th>
                <th>Login Email</th>
                <th>Assigned Role</th>
                <th>Active Permissions</th>
                <th>Last Login</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAdmins.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center py-8 muted" style={{ textAlign: 'center', padding: '30px' }}>
                    No staff members found matching your search.
                  </td>
                </tr>
              )}
              {filteredAdmins.map((a) => {
                const roleStyle = ROLE_COLORS[a.role] || ROLE_COLORS.inventory;
                return (
                  <tr key={a._id} className={a.active ? '' : 'row-inactive'}>
                    <td>
                      <div className="staff-user-cell">
                        <div className={`staff-avatar-chip ${a.role === 'super_admin' ? 'super' : ''}`}>
                          {(a.name?.[0] || 'A').toUpperCase()}
                        </div>
                        <div>
                          <b>{a.name}</b>
                          {a.role === 'super_admin' && (
                            <small className="super-crown-tag">👑 Full Access</small>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: '#334155' }}>{a.email}</span>
                    </td>
                    <td>
                      <span
                        className="role-badge"
                        style={{
                          background: roleStyle.bg,
                          color: roleStyle.color,
                          border: `1px solid ${roleStyle.border}`,
                        }}
                      >
                        {meta?.roleLabels?.[a.role] || a.role}
                      </span>
                    </td>
                    <td className="cell-clip" style={{ maxWidth: 260 }}>
                      {a.role === 'super_admin' ? (
                        <span className="perm-chip perm-all">⚡ Unrestricted Super Access</span>
                      ) : (
                        <div className="perm-chips-wrap">
                          {(a.effectivePermissions || []).length > 0 ? (
                            (a.effectivePermissions || []).map((p) => (
                              <span key={p} className="perm-chip">
                                {p}
                              </span>
                            ))
                          ) : (
                            <span className="muted-sm">Default Role Permissions</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      <small style={{ color: '#64748b', fontWeight: 600 }}>
                        {a.lastLoginAt ? fmtDate(a.lastLoginAt) : 'Never'}
                      </small>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Toggle small on={a.active} onChange={() => toggleActive(a)} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: a.active ? '#16a34a' : '#94a3b8' }}>
                          {a.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                        <button className="row-link" onClick={() => setEdit({ ...a, password: '' })}>
                          ✏️ Edit
                        </button>
                        <button className="row-link danger" onClick={() => del(a)}>
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Staff Member Modal */}
      {edit && meta && (
        <Modal title={edit._id ? `✏️ Edit Staff — ${edit.name}` : '➕ Onboard New Staff Member'} onClose={() => setEdit(null)} wide>
          <form onSubmit={save} className="admin-modal-form">
            <div className="form-grid-2">
              <F label="Full Name *">
                <input
                  type="text"
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  placeholder="e.g. Sarah Khan"
                  required
                />
              </F>

              <F label="Login Email *">
                <input
                  type="email"
                  value={edit.email}
                  onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                  placeholder="e.g. staff@bazario.store"
                  required
                  disabled={!!edit._id}
                />
              </F>

              <F label={edit._id ? 'Update Password (leave blank for no change)' : 'Login Password *'}>
                <input
                  type="password"
                  value={edit.password}
                  onChange={(e) => setEdit({ ...edit, password: e.target.value })}
                  placeholder={edit._id ? '••••••••' : 'Min 6 characters'}
                  required={!edit._id}
                />
              </F>

              <F label="Role Assignment">
                <select
                  value={edit.role}
                  onChange={(e) => setEdit({ ...edit, role: e.target.value, permissions: [] })}
                >
                  {meta.roles.map((r) => (
                    <option key={r} value={r}>
                      {meta.roleLabels[r]}
                    </option>
                  ))}
                </select>
              </F>
            </div>

            {edit.role !== 'super_admin' && (
              <div className="permissions-picker-section">
                <div style={{ marginBottom: 8 }}>
                  <b style={{ fontSize: 13, color: '#0f172a' }}>Granular Access Control:</b>
                  <p className="muted-sm" style={{ margin: '2px 0 0' }}>
                    Leave unselected to use role defaults: <b>{roleDefaults.join(', ') || 'Standard'}</b>. Or click chips below to customize:
                  </p>
                </div>
                <div className="picker-box">
                  {meta.permissions.map((p) => {
                    const isSelected = edit.permissions.includes(p);
                    return (
                      <button
                        type="button"
                        key={p}
                        className={`chip ${isSelected ? 'chip-on' : ''}`}
                        onClick={() => togglePerm(p)}
                      >
                        {isSelected ? '✓ ' : '+ '} {p}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="modal-bottom-actions">
              <button type="button" className="btn-cancel" onClick={() => setEdit(null)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : edit._id ? 'Save Staff Changes' : 'Create Staff Credentials'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
