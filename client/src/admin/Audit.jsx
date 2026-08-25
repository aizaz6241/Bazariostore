import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api.js';
import { ErrorBox } from './ui.jsx';
import Ic from '../components/Icons.jsx';

export default function Audit() {
  const [data, setData] = useState({ logs: [], actions: [] });
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (action) p.set('action', action);
    api('/audit?' + p.toString()).then(setData).catch((e) => setError(e.message));
  };
  useEffect(load, [action]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <h1 className="admin-h1">Audit Logs</h1>
      <form className="admin-toolbar" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <div className="admin-search">
          <Ic name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search admin, action, entity…" />
        </div>
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>
          {data.actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button className="btn-primary">SEARCH</button>
      </form>
      <ErrorBox error={error} />

      <div className="card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Time</th><th>Admin</th><th>Action</th><th>Entity</th><th>Details</th></tr>
            </thead>
            <tbody>
              {data.logs.map((l) => (
                <tr key={l._id}>
                  <td>{fmtDate(l.createdAt)}</td>
                  <td><b>{l.admin?.name}</b><br /><small className="muted">{l.admin?.email}</small></td>
                  <td><span className="pay-chip">{l.action}</span></td>
                  <td>{l.entity}{l.entityId ? ` · ${String(l.entityId).slice(-6)}` : ''}</td>
                  <td className="cell-clip"><small>{l.details ? JSON.stringify(l.details) : '—'}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.logs.length === 0 && <p className="muted">No audit entries.</p>}
      </div>
    </>
  );
}
