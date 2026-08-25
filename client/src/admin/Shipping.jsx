import { useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { Modal, Toggle, ErrorBox, F } from './ui.jsx';
import Ic from '../components/Icons.jsx';

const EMPTY = { name: '', description: '', cost: 0, etaText: '3-5 business days', zones: '', freeAbove: '', active: true, sortOrder: 0 };

export default function Shipping() {
  const [methods, setMethods] = useState([]);
  const [edit, setEdit] = useState(null);
  const [error, setError] = useState('');

  const load = () => api('/shipping/admin/list').then(setMethods).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      const body = {
        ...edit,
        cost: Number(edit.cost) || 0,
        sortOrder: Number(edit.sortOrder) || 0,
        freeAbove: edit.freeAbove === '' || edit.freeAbove == null ? null : Number(edit.freeAbove),
        zones: typeof edit.zones === 'string' ? edit.zones.split(',').map((z) => z.trim()).filter(Boolean) : edit.zones,
      };
      if (edit._id) await api(`/shipping/${edit._id}`, { method: 'PUT', body });
      else await api('/shipping', { method: 'POST', body });
      setEdit(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggle = async (m) => {
    await api(`/shipping/${m._id}/active`, { method: 'PATCH' });
    load();
  };
  const del = async (m) => {
    if (!window.confirm(`Delete shipping method "${m.name}"?`)) return;
    await api(`/shipping/${m._id}`, { method: 'DELETE' });
    load();
  };

  return (
    <>
      <div className="admin-h1-row">
        <h1 className="admin-h1">Shipping Management</h1>
        <button className="btn-primary" onClick={() => setEdit({ ...EMPTY, sortOrder: methods.length })}><Ic name="plus" size={15} /> ADD METHOD</button>
      </div>
      <ErrorBox error={error} />

      <div className="card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Method</th><th>Charges</th><th>Delivery Time</th><th>Zones</th><th>Free Above</th><th>Enabled</th><th /></tr>
            </thead>
            <tbody>
              {methods.map((m) => (
                <tr key={m._id} className={m.active ? '' : 'row-inactive'}>
                  <td><b>{m.name}</b><br /><small className="muted">{m.description}</small></td>
                  <td>{m.cost ? money(m.cost) : <span className="free">FREE</span>}</td>
                  <td>{m.etaText}</td>
                  <td>{m.zones?.length ? m.zones.join(', ') : 'Nationwide'}</td>
                  <td>{m.freeAbove != null ? money(m.freeAbove) + '+' : '—'}</td>
                  <td><Toggle small on={m.active} onChange={() => toggle(m)} /></td>
                  <td className="row-actions">
                    <button className="row-link" onClick={() => setEdit({ ...m, zones: (m.zones || []).join(', '), freeAbove: m.freeAbove ?? '' })}>Edit</button>
                    <button className="row-link danger" onClick={() => del(m)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {edit && (
        <Modal title={edit._id ? 'Edit Shipping Method' : 'Add Shipping Method'} onClose={() => setEdit(null)}>
          <form onSubmit={save}>
            <F label="Name *"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required /></F>
            <F label="Description"><input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></F>
            <div className="form-grid">
              <F label="Charges ($ — 0 = free)"><input type="number" value={edit.cost} onChange={(e) => setEdit({ ...edit, cost: e.target.value })} /></F>
              <F label="Delivery Time"><input value={edit.etaText} onChange={(e) => setEdit({ ...edit, etaText: e.target.value })} placeholder="e.g. 3-5 business days" /></F>
              <F label="Delivery Zones (comma separated — empty = worldwide)"><input value={edit.zones} onChange={(e) => setEdit({ ...edit, zones: e.target.value })} placeholder="New York, London, Tokyo" /></F>
              <F label="Free Shipping Rule (order over $X = free)"><input type="number" value={edit.freeAbove} onChange={(e) => setEdit({ ...edit, freeAbove: e.target.value })} placeholder="e.g. 50" /></F>
              <F label="Sort Order"><input type="number" value={edit.sortOrder} onChange={(e) => setEdit({ ...edit, sortOrder: e.target.value })} /></F>
            </div>
            <div className="form-actions">
              <button className="btn-primary">SAVE METHOD</button>
              <button type="button" className="btn-outline" onClick={() => setEdit(null)}>CANCEL</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
