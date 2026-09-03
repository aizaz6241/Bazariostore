import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { api, money, fmtDate } from '../api.js';
import { STATUS_LABELS, PAYMENT_LABELS } from '../data.js';
import { CHART_COLORS, ErrorBox } from './ui.jsx';
import Ic from '../components/Icons.jsx';
import { getSocket } from '../socket.js';

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');

  const loadData = () => {
    api('/analytics/dashboard').then(setD).catch((e) => setError(e.message));
  };

  useEffect(() => {
    loadData();
  }, []);

  // Real-time synchronization on WebSocket events
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const adminToken = localStorage.getItem('ng_admin_token');
    const rejoin = () => {
      if (adminToken) socket.emit('admin:join', { token: adminToken });
    };
    if (socket.connected) rejoin();
    socket.on('connect', rejoin);

    const handleSync = () => {
      loadData();
    };

    socket.on('order:update', handleSync);
    socket.on('order:status_update', handleSync);
    socket.on('order:new', handleSync);

    return () => {
      socket.off('connect', rejoin);
      socket.off('order:update', handleSync);
      socket.off('order:status_update', handleSync);
      socket.off('order:new', handleSync);
    };
  }, []);

  if (error) return <ErrorBox error={error} />;
  if (!d) return <p className="muted">Loading…</p>;

  const salesCards = [
    { label: "Today's Sales", ...d.sales.today },
    { label: 'Weekly Sales', ...d.sales.week },
    { label: 'Monthly Sales', ...d.sales.month },
    { label: 'Yearly Sales', ...d.sales.year },
  ];
  const statusPie = Object.entries(d.ordersByStatus).map(([k, v]) => ({ name: STATUS_LABELS[k] || k, value: v }));
  const payPie = d.paymentSplit.map((p) => ({ name: PAYMENT_LABELS[p.label] || p.label, value: p.n }));

  return (
    <>
      <h1 className="admin-h1">Dashboard</h1>

      <div className="stat-grid stat-grid-4">
        {salesCards.map((c) => (
          <div className="card stat-card" key={c.label}>
            <i><Ic name="banknote" size={22} /></i>
            <div><b>{money(c.revenue)}</b><small>{c.label} · {c.orders} orders</small></div>
          </div>
        ))}
      </div>

      <div className="stat-grid stat-grid-4">
        {[
          { icon: 'clock', label: 'Pending Orders', value: d.ordersByStatus.pending || 0, link: '/admin/orders?status=pending' },
          { icon: 'package', label: 'Processing', value: (d.ordersByStatus.processing || 0) + (d.ordersByStatus.packed || 0), link: '/admin/orders?status=processing' },
          { icon: 'checkCircle', label: 'Delivered', value: d.ordersByStatus.delivered || 0, link: '/admin/orders?status=delivered' },
          { icon: 'refresh', label: 'Cancelled / Refunded', value: (d.ordersByStatus.cancelled || 0) + (d.ordersByStatus.refunded || 0), link: '/admin/orders?status=cancelled' },
        ].map((c) => (
          <Link className="card stat-card" key={c.label} to={c.link}>
            <i><Ic name={c.icon} size={22} /></i>
            <div><b>{c.value}</b><small>{c.label}</small></div>
          </Link>
        ))}
      </div>

      <div className="chart-grid">
        <div className="card chart-card chart-wide">
          <h3>Revenue — Last 30 Days</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={d.revenue30}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3d3de" />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v) => money(v)} />
              <Line type="monotone" dataKey="revenue" stroke="#e0446e" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card chart-card">
          <h3>Orders by Status</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={statusPie} dataKey="value" nameKey="name" outerRadius={80} label={(e) => e.value}>
                {statusPie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="card chart-card chart-wide">
          <h3>Monthly Revenue — Last 12 Months</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={d.monthly12}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3d3de" />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v) => money(v)} />
              <Bar dataKey="revenue" fill="#e0446e" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card chart-card">
          <h3>Payment Methods</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={payPie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} label={(e) => e.value}>
                {payPie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="stat-grid">
        {[
          { icon: 'user', label: 'Total Customers', value: d.customers.total },
          { icon: 'sparkle', label: 'New This Month', value: d.customers.newThisMonth },
          { icon: 'refresh', label: 'Returning Customers', value: d.customers.returning },
          { icon: 'box', label: 'Low Stock Products', value: d.lowStock.length },
          { icon: 'x', label: 'Out of Stock', value: d.outOfStock.length },
        ].map((c) => (
          <div className="card stat-card" key={c.label}>
            <i><Ic name={c.icon} size={22} /></i>
            <div><b>{c.value}</b><small>{c.label}</small></div>
          </div>
        ))}
      </div>

      <div className="dash-lists">
        <div className="card">
          <div className="card-head"><h3>Best Selling Products</h3><Link className="see-all" to="/admin/products">All products →</Link></div>
          {d.bestSelling.map((p) => (
            <div className="os-item" key={p._id}>
              <span className="cart-thumb"><img src={p.image} alt="" /></span>
              <span className="os-name">{p.name}<small className="muted">{p.sold} sold · {p.stock} in stock</small></span>
              <b>{money(p.price)}</b>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-head"><h3>Stock Alerts</h3><Link className="see-all" to="/admin/inventory">Inventory →</Link></div>
          {[...d.outOfStock, ...d.lowStock].length === 0 && <p className="muted">Sab products ka stock theek hai 🎉</p>}
          {d.outOfStock.map((p) => (
            <div className="os-item" key={p._id}>
              <span className="cart-thumb"><img src={p.image} alt="" /></span>
              <span className="os-name">{p.name}</span>
              <span className="status-pill st-cancelled">OUT OF STOCK</span>
            </div>
          ))}
          {d.lowStock.map((p) => (
            <div className="os-item" key={p._id}>
              <span className="cart-thumb"><img src={p.image} alt="" /></span>
              <span className="os-name">{p.name}</span>
              <span className="status-pill st-pending">{p.stock} left</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Recent Orders</h3><Link to="/admin/orders" className="see-all">See all →</Link></div>
        {d.recent.length === 0 ? (
          <p className="muted">Abhi tak koi order nahi.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Order #</th><th>Date</th><th>Customer</th><th>City</th><th>Total</th><th>Payment</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {d.recent.map((o) => (
                  <tr key={o._id}>
                    <td><b>{o.orderNumber}</b></td>
                    <td>{fmtDate(o.createdAt)}</td>
                    <td>{o.shippingAddress?.fullName}</td>
                    <td>{o.shippingAddress?.city}</td>
                    <td>{money(o.total)}</td>
                    <td><span className="pay-chip">{(PAYMENT_LABELS[o.paymentMethod] || o.paymentMethod || '').toUpperCase()}</span></td>
                    <td><span className={`status-pill st-${o.status}`}>{STATUS_LABELS[o.status]}</span></td>
                    <td><Link className="row-link" to={`/admin/orders/${o._id}`}>View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
