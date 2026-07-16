import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, money, fmtDate } from '../api.js';
import { STATUS_LABELS, ALL_STATUSES, PAYMENT_LABELS } from '../data.js';
import { ErrorBox } from './ui.jsx';
import Ic from '../components/Icons.jsx';

export default function Orders() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const [q, setQ] = useState('');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    const query = new URLSearchParams();
    if (status) query.set('status', status);
    if (q.trim()) query.set('q', q.trim());
    api('/orders?' + query.toString())
      .then(setOrders)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <h1 className="admin-h1">Orders</h1>

      <form
        className="admin-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <div className="admin-search">
          <Ic name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: customer name, phone, order #, email…" />
        </div>
        <button className="btn-primary">SEARCH</button>
      </form>

      <div className="filter-tabs">
        <button className={!status ? 'on' : ''} onClick={() => setParams({})}>All</button>
        {ALL_STATUSES.map((s) => (
          <button key={s} className={status === s ? 'on' : ''} onClick={() => setParams({ status: s })}>
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <ErrorBox error={error} />
      <div className="card">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : orders.length === 0 ? (
          <p className="muted">No {status ? STATUS_LABELS[status].toLowerCase() : ''} orders found.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr><th>Order #</th><th>Date</th><th>Customer</th><th>Phone</th><th>City</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o._id}>
                  <td><b>{o.orderNumber}</b></td>
                  <td>{fmtDate(o.createdAt)}</td>
                  <td>{o.shippingAddress?.fullName}</td>
                  <td>{o.contact?.phone}</td>
                  <td>{o.shippingAddress?.city}</td>
                  <td>{o.items?.reduce((s, i) => s + i.qty, 0)}</td>
                  <td>{money(o.total)}</td>
                  <td><span className="pay-chip">{(PAYMENT_LABELS[o.paymentMethod] || o.paymentMethod || '').toUpperCase()}</span></td>
                  <td><span className={`status-pill st-${o.status}`}>{STATUS_LABELS[o.status]}</span></td>
                  <td><Link className="row-link" to={`/admin/orders/${o._id}`}>View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
