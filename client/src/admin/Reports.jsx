import { useState } from 'react';
import { api, downloadFile } from '../api.js';
import { ErrorBox } from './ui.jsx';
import Ic from '../components/Icons.jsx';

const TYPES = [
  ['sales', 'Sales'],
  ['customers', 'Customers'],
  ['products', 'Products'],
  ['refunds', 'Refunds'],
  ['inventory', 'Inventory'],
  ['finance', 'Finance'],
  ['taxes', 'Taxes'],
  ['coupons', 'Coupons'],
  ['discounts', 'Discounts'],
];

export default function Reports() {
  const [type, setType] = useState('sales');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const qs = () => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    return p.toString();
  };

  const loadPreview = async () => {
    setBusy(true);
    setError('');
    try {
      setPreview(await api(`/reports/${type}?${qs()}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const exportAs = (format) =>
    downloadFile(`/reports/${type}?format=${format}&${qs()}`, `${type}-report.${format}`).catch((e) => setError(e.message));

  return (
    <>
      <h1 className="admin-h1">Reports</h1>

      <div className="card form-card">
        <div className="admin-toolbar" style={{ marginBottom: 0 }}>
          <select value={type} onChange={(e) => { setType(e.target.value); setPreview(null); }}>
            {TYPES.map(([k, label]) => <option key={k} value={k}>{label} Report</option>)}
          </select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="muted">→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <button className="btn-primary" onClick={loadPreview} disabled={busy}>{busy ? 'Loading…' : 'PREVIEW'}</button>
          <span className="export-btns">
            <button className="btn-outline btn-sm" onClick={() => exportAs('csv')}><Ic name="arrowRight" size={12} /> CSV</button>
            <button className="btn-outline btn-sm" onClick={() => exportAs('xlsx')}><Ic name="arrowRight" size={12} /> Excel</button>
            <button className="btn-outline btn-sm" onClick={() => exportAs('pdf')}><Ic name="arrowRight" size={12} /> PDF</button>
          </span>
        </div>
      </div>
      <ErrorBox error={error} />

      {preview && (
        <div className="card">
          <h3>{preview.title} — {preview.rows.length} rows</h3>
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>{preview.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 100).map((r, i) => (
                  <tr key={i}>{preview.columns.map((c) => <td key={c.key}>{String(r[c.key] ?? '')}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length > 100 && <p className="muted-sm">Pehli 100 rows preview mein — poora data export files mein hoga.</p>}
        </div>
      )}
    </>
  );
}
