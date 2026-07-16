import { useEffect, useState } from 'react';
import { api, money, fmtDate } from '../api.js';
import { Modal, ErrorBox } from './ui.jsx';
import Ic from '../components/Icons.jsx';

const RSTATUS = { requested: 'Requested', approved: 'Approved', rejected: 'Rejected', refunded: 'Refunded' };
const PILL = { requested: 'st-pending', approved: 'st-confirmed', rejected: 'st-cancelled', refunded: 'st-delivered' };

export default function Refunds() {
  const [data, setData] = useState({ refunds: [], summary: {} });
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    api('/refunds' + (status ? `?status=${status}` : ''))
      .then(setData)
      .catch((e) => setError(e.message));
  };
  useEffect(load, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (r, newStatus) => {
    try {
      const updated = await api(`/refunds/${r._id}/status`, { method: 'PATCH', body: { status: newStatus, note } });
      setOpen(updated);
      setNote('');
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const s = data.summary || {};
  return (
    <>
      <h1 className="admin-h1">Refund Management</h1>
      <div className="stat-grid">
        {[
          { label: 'Requested', value: s.requested || 0, icon: 'clock' },
          { label: 'Approved (payment pending)', value: s.pendingPayments || 0, icon: 'checkCircle' },
          { label: 'Rejected', value: s.rejected || 0, icon: 'x' },
          { label: 'Refunded (returned)', value: s.refunded || 0, icon: 'refresh' },
          { label: 'Total Refunded Amount', value: money(s.refundedAmount || 0), icon: 'banknote' },
        ].map((c) => (
          <div className="card stat-card" key={c.label}>
            <i><Ic name={c.icon} size={22} /></i>
            <div><b>{c.value}</b><small>{c.label}</small></div>
          </div>
        ))}
      </div>

      <div className="filter-tabs">
        <button className={!status ? 'on' : ''} onClick={() => setStatus('')}>All</button>
        {Object.entries(RSTATUS).map(([k, label]) => (
          <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{label}</button>
        ))}
      </div>

      <ErrorBox error={error} />
      <div className="card">
        {data.refunds.length === 0 ? (
          <p className="muted">No refunds{status ? ` (${RSTATUS[status]})` : ''}.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr><th>Order #</th><th>Customer</th><th>Amount</th><th>Reason</th><th>Requested By</th><th>Date</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {data.refunds.map((r) => (
                <tr key={r._id}>
                  <td><b>{r.orderNumber}</b></td>
                  <td>{r.customer?.name}<br /><small className="muted">{r.customer?.phone}</small></td>
                  <td>{money(r.amount)}</td>
                  <td className="cell-clip">{r.reason || '—'}</td>
                  <td>{r.requestedBy}</td>
                  <td>{fmtDate(r.createdAt)}</td>
                  <td><span className={`status-pill ${PILL[r.status]}`}>{RSTATUS[r.status]}</span></td>
                  <td><button className="row-link" onClick={() => setOpen(r)}>Manage</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {open && (
        <Modal title={`Refund — ${open.orderNumber}`} onClose={() => setOpen(null)} wide>
          <div className="refund-detail">
            <div>
              <p className="addr">
                Customer: <b>{open.customer?.name}</b> ({open.customer?.phone})<br />
                Amount: <b>{money(open.amount)}</b> · Status: <span className={`status-pill ${PILL[open.status]}`}>{RSTATUS[open.status]}</span><br />
                Payment returned: <b>{open.paymentReturned ? 'Yes' : 'No'}</b>
              </p>
              <p className="addr"><b>Reason:</b> {open.reason || '—'}</p>
              <h4>Timeline</h4>
              <ul className="history">
                {[...open.timeline].reverse().map((t, i) => (
                  <li key={i}>
                    <b>{RSTATUS[t.status] || t.status}</b> — {fmtDate(t.at)}{t.by ? ` · by ${t.by}` : ''}
                    {t.note && <small>{t.note}</small>}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="field">
                <label>Note (timeline mein save hoga)</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note…" />
              </div>
              {open.status === 'requested' && (
                <div className="form-actions">
                  <button className="btn-primary" onClick={() => act(open, 'approved')}>APPROVE</button>
                  <button className="btn-outline danger-outline" onClick={() => act(open, 'rejected')}>REJECT</button>
                </div>
              )}
              {open.status === 'approved' && (
                <button className="btn-buynow btn-block" onClick={() => act(open, 'refunded')}>
                  MARK PAYMENT RETURNED ({money(open.amount)})
                </button>
              )}
              {open.status === 'refunded' && <p className="promo-ok"><Ic name="check" size={14} /> Refund complete — order restocked & expense logged.</p>}
              {open.status === 'rejected' && <p className="muted-sm">Yeh request reject ho chuki hai.</p>}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
