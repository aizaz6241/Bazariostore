import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api.js';
import { Modal, Toggle, ErrorBox, F } from './ui.jsx';
import Ic from '../components/Icons.jsx';

const EMPTY = { name: '', email: '', password: '', role: 'admin', permissions: [] };

export default function Staff() {
  const [admins, setAdmins] = useState([]);
  const [meta, setMeta] = useState(null);
  const [edit, setEdit] = useState(null);
  const [error, setError] = useState('');

  const load = () => api('/admins').then(setAdmins).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    api('/admins/meta').then(setMeta).catch(() => {});
  }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      if (edit._id) await api(`/admins/${edit._id}`, { method: 'PUT', body: edit });
      else await api('/admins', { method: 'POST', body: edit });
      setEdit(null);
      load();
    } catch (err) {
      setError(err.message);
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
    if (!window.confirm(`Delete admin "${a.name}"?`)) return;
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

  return (
    <>
      <div className="admin-h1-row">
        <h1 className="admin-h1">Staff & Roles</h1>
        <button className="btn-primary" onClick={() => setEdit({ ...EMPTY })}><Ic name="plus" size={15} /> ADD STAFF MEMBER</button>
      </div>
      <ErrorBox error={error} />

      <div className="card">
        <table className="admin-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Permissions</th><th>Last Login</th><th>Active</th><th /></tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a._id} className={a.active ? '' : 'row-inactive'}>
                <td><b>{a.name}</b></td>
                <td>{a.email}</td>
                <td><span className="pay-chip">{meta?.roleLabels?.[a.role] || a.role}</span></td>
                <td className="cell-clip"><small>{a.role === 'super_admin' ? 'All permissions' : (a.effectivePermissions || []).join(', ')}</small></td>
                <td>{a.lastLoginAt ? fmtDate(a.lastLoginAt) : '—'}</td>
                <td><Toggle small on={a.active} onChange={() => toggleActive(a)} /></td>
                <td className="row-actions">
                  <button className="row-link" onClick={() => setEdit({ ...a, password: '' })}>Edit</button>
                  <button className="row-link danger" onClick={() => del(a)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && meta && (
        <Modal title={edit._id ? `Edit — ${edit.name}` : 'Add Staff Member'} onClose={() => setEdit(null)} wide>
          <form onSubmit={save}>
            <div className="form-grid">
              <F label="Name *"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required /></F>
              <F label="Email *"><input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} required disabled={!!edit._id} /></F>
              <F label={edit._id ? 'New Password (khali = no change)' : 'Password *'}>
                <input type="password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} required={!edit._id} />
              </F>
              <F label="Role">
                <select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value, permissions: [] })}>
                  {meta.roles.map((r) => <option key={r} value={r}>{meta.roleLabels[r]}</option>)}
                </select>
              </F>
            </div>

            {edit.role !== 'super_admin' && (
              <>
                <p className="muted-sm">
                  Custom permissions (khali chhorne par role ki default permissions lagti hain: <b>{roleDefaults.join(', ')}</b>)
                </p>
                <div className="picker-box">
                  {meta.permissions.map((p) => (
                    <button type="button" key={p} className={'chip' + (edit.permissions.includes(p) ? ' chip-on' : '')} onClick={() => togglePerm(p)}>
                      {p}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="form-actions">
              <button className="btn-primary">SAVE</button>
              <button type="button" className="btn-outline" onClick={() => setEdit(null)}>CANCEL</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
