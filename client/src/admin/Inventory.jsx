import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api.js';
import { Modal, ErrorBox, F } from './ui.jsx';
import Ic from '../components/Icons.jsx';

export default function Inventory() {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [adjust, setAdjust] = useState(null);
  const [incoming, setIncoming] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    api('/inventory/overview').then(setData).catch((e) => setError(e.message));
    api('/inventory/history').then(setHistory).catch(() => {});
  };
  useEffect(load, []);

  const saveAdjust = async (e) => {
    e.preventDefault();
    try {
      await api('/inventory/adjust', { method: 'POST', body: { productId: adjust.product._id, change: Number(adjust.change), note: adjust.note } });
      setAdjust(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const saveIncoming = async (e) => {
    e.preventDefault();
    try {
      await api('/inventory/incoming', { method: 'POST', body: incoming });
      setIncoming(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const receive = async (inc) => {
    await api(`/inventory/incoming/${inc._id}/receive`, { method: 'PATCH' });
    load();
  };

  if (!data) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="admin-h1-row">
        <h1 className="admin-h1">Inventory Management</h1>
        <button className="btn-primary" onClick={() => setIncoming({ productId: '', qty: '', expectedAt: '', note: '' })}>
          <Ic name="plus" size={15} /> ADD INCOMING STOCK
        </button>
      </div>
      <ErrorBox error={error} />

      <div className="stat-grid stat-grid-4">
        {[
          { icon: 'box', label: 'Total Stock (units)', value: data.totalStock },
          { icon: 'clock', label: 'Reserved Stock', value: data.totalReserved },
          { icon: 'tag', label: 'Low Stock Alerts', value: data.lowCount },
          { icon: 'x', label: 'Out of Stock', value: data.outCount },
        ].map((c) => (
          <div className="card stat-card" key={c.label}>
            <i><Ic name={c.icon} size={22} /></i>
            <div><b>{c.value}</b><small>{c.label}</small></div>
          </div>
        ))}
      </div>

      {data.incoming.length > 0 && (
        <div className="card">
          <h3>Incoming Inventory</h3>
          <table className="admin-table">
            <thead><tr><th>Product</th><th>Qty</th><th>Expected</th><th>Note</th><th /></tr></thead>
            <tbody>
              {data.incoming.map((inc) => (
                <tr key={inc._id}>
                  <td><b>{inc.productName}</b></td>
                  <td>+{inc.qty}</td>
                  <td>{inc.expectedAt ? fmtDate(inc.expectedAt) : '—'}</td>
                  <td>{inc.note}</td>
                  <td><button className="row-link" onClick={() => receive(inc)}>Mark Received</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h3>Stock Overview</h3>
        <table className="admin-table">
          <thead>
            <tr><th /><th>Product</th><th>SKU</th><th>Current</th><th>Reserved</th><th>Alert At</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {data.products.map((p) => (
              <tr key={p._id}>
                <td><span className="cart-thumb thumb-sm"><img src={p.image} alt="" /></span></td>
                <td><b>{p.name}</b></td>
                <td>{p.sku}</td>
                <td><b>{p.stock}</b></td>
                <td>{p.reservedStock}</td>
                <td>{p.lowStockThreshold}</td>
                <td>
                  {p.stock <= 0 ? (
                    <span className="status-pill st-cancelled">OUT OF STOCK</span>
                  ) : p.stock <= p.lowStockThreshold ? (
                    <span className="status-pill st-pending">LOW STOCK</span>
                  ) : (
                    <span className="status-pill st-delivered">OK</span>
                  )}
                </td>
                <td><button className="row-link" onClick={() => setAdjust({ product: p, change: '', note: '' })}>Adjust</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Stock History (recent)</h3>
        <table className="admin-table">
          <thead><tr><th>Date</th><th>Product</th><th>Change</th><th>After</th><th>Reason</th><th>Note</th><th>By</th></tr></thead>
          <tbody>
            {history.map((h) => (
              <tr key={h._id}>
                <td>{fmtDate(h.createdAt)}</td>
                <td>{h.productName}</td>
                <td className={h.change > 0 ? 'stock-ok' : 'stock-out'}>{h.change > 0 ? '+' : ''}{h.change}</td>
                <td>{h.stockAfter}</td>
                <td>{h.reason}</td>
                <td>{h.note}</td>
                <td>{h.by || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adjust && (
        <Modal title={`Adjust Stock — ${adjust.product.name}`} onClose={() => setAdjust(null)}>
          <form onSubmit={saveAdjust}>
            <p className="muted-sm">Current stock: <b>{adjust.product.stock}</b></p>
            <F label="Change (+50 restock, -3 damage/correction)"><input type="number" value={adjust.change} onChange={(e) => setAdjust({ ...adjust, change: e.target.value })} required autoFocus /></F>
            <F label="Note"><input value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} placeholder="e.g. New shipment received" /></F>
            <div className="form-actions">
              <button className="btn-primary">APPLY</button>
              <button type="button" className="btn-outline" onClick={() => setAdjust(null)}>CANCEL</button>
            </div>
          </form>
        </Modal>
      )}

      {incoming && (
        <Modal title="Add Incoming Inventory" onClose={() => setIncoming(null)}>
          <form onSubmit={saveIncoming}>
            <F label="Product">
              <select value={incoming.productId} onChange={(e) => setIncoming({ ...incoming, productId: e.target.value })} required>
                <option value="">Select product</option>
                {data.products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
            </F>
            <F label="Quantity"><input type="number" value={incoming.qty} onChange={(e) => setIncoming({ ...incoming, qty: e.target.value })} required min={1} /></F>
            <F label="Expected Date"><input type="date" value={incoming.expectedAt} onChange={(e) => setIncoming({ ...incoming, expectedAt: e.target.value })} /></F>
            <F label="Note"><input value={incoming.note} onChange={(e) => setIncoming({ ...incoming, note: e.target.value })} /></F>
            <div className="form-actions">
              <button className="btn-primary">ADD</button>
              <button type="button" className="btn-outline" onClick={() => setIncoming(null)}>CANCEL</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
