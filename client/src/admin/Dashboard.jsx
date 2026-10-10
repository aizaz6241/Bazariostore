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
import UsdtWalletHistoryModal from './UsdtWalletHistoryModal.jsx';

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [usdtHistoryModalOpen, setUsdtHistoryModalOpen] = useState(false);
  const [usdtHistoryTab, setUsdtHistoryTab] = useState('all');

  const openUsdtHistory = (tab = 'all') => {
    setUsdtHistoryTab(tab);
    setUsdtHistoryModalOpen(true);
  };

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
      // fresh read: the admin may have logged out since this screen opened
      const t = localStorage.getItem('ng_admin_token');
      if (t && t === adminToken) socket.emit('admin:join', { token: t });
    };
    if (socket.connected) rejoin();
    socket.on('connect', rejoin);

    const handleSync = () => {
      loadData();
    };

    socket.on('order:update', handleSync);
    socket.on('order:status_update', handleSync);
    socket.on('order:new', handleSync);
    socket.on('withdrawal:new', handleSync);
    socket.on('withdrawal:update', handleSync);
    socket.on('seller:status_update', handleSync);
    socket.on('wallet:update', handleSync);

    return () => {
      socket.off('connect', rejoin);
      socket.off('order:update', handleSync);
      socket.off('order:status_update', handleSync);
      socket.off('order:new', handleSync);
      socket.off('withdrawal:new', handleSync);
      socket.off('withdrawal:update', handleSync);
      socket.off('seller:status_update', handleSync);
      socket.off('wallet:update', handleSync);
    };
  }, []);

  if (error) return <ErrorBox error={error} />;
  if (!d) return <p className="muted">Loading…</p>;

  const fmtUsdt = (val) => {
    const n = Number(val || 0);
    return `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
  };

  const w = d.usdtWallet || {
    total: 0,
    today: 0,
    week: 0,
    month: 0,
    year: 0,
    grossDeposits: 0,
    helpingAmount: 0,
    depositCount: 0,
    clientSellersCount: 0,
  };

  const usdtCards = [
    {
      tab: 'all',
      label: 'USDT Wallet',
      value: fmtUsdt(w.total),
      sub: `${w.depositCount || 0} deposits · Real Clients`,
      icon: 'wallet',
      badge: 'Main Balance',
      isPrimary: true,
      color: '#059669',
      bg: '#ecfdf5',
    },
    {
      tab: 'today',
      label: "Today Received",
      value: fmtUsdt(w.today),
      sub: "Today's Client Inflow",
      icon: 'clock',
      badge: 'Today',
      color: '#0284c7',
      bg: '#f0f9ff',
    },
    {
      tab: 'week',
      label: 'Weekly Received',
      value: fmtUsdt(w.week),
      sub: "This Week's Client Inflow",
      icon: 'sparkle',
      badge: '7 Days',
      color: '#7c3aed',
      bg: '#faf5ff',
    },
    {
      tab: 'month',
      label: 'Monthly Received',
      value: fmtUsdt(w.month),
      sub: "This Month's Client Inflow",
      icon: 'banknote',
      badge: '30 Days',
      color: '#ea580c',
      bg: '#fff7ed',
    },
  ];

  const statusPie = Object.entries(d.ordersByStatus).map(([k, v]) => ({ name: STATUS_LABELS[k] || k, value: v }));
  const payPie = d.paymentSplit.map((p) => ({ name: PAYMENT_LABELS[p.label] || p.label, value: p.n }));

  return (
    <>
      <h1 className="admin-h1">Dashboard</h1>

      {/* ─── USDT WALLET SECTION (REAL CLIENT FUNDS ONLY) ─── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-flex', padding: '6px 8px', borderRadius: 8, background: '#ecfdf5', color: '#059669' }}>
                <Ic name="wallet" size={20} />
              </span>
              USDT Wallet
            </h2>
            <span style={{
              background: '#ecfdf5',
              color: '#047857',
              border: '1px solid #a7f3d0',
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 10px',
              borderRadius: 20,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }}></span>
              Real Client Accounts Only (Tests & Previous Stores Excluded)
            </span>
            {w.helpingAmount > 0 && (
              <span style={{
                background: '#f8fafc',
                color: '#64748b',
                border: '1px solid #e2e8f0',
                fontSize: 11,
                fontWeight: 600,
                padding: '3px 9px',
                borderRadius: 6,
              }}>
                Gross: {fmtUsdt(w.grossDeposits)} | Helping: -{fmtUsdt(w.helpingAmount)}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => openUsdtHistory('all')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#ecfdf5',
                border: '1.5px solid #10b981',
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 700,
                color: '#047857',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#d1fae5';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#ecfdf5';
              }}
              title="Click to view detailed USDT transactions, sellers, amounts & dates"
            >
              <Ic name="wallet" size={14} />
              <span>Click for USDT History &amp; Breakdown</span>
            </button>

            <Link
              to="/admin/withdrawals"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 700,
                color: '#0f172a',
                textDecoration: 'none',
              }}
            >
              <span>Manage Deposits & Payouts</span>
              <span>→</span>
            </Link>
          </div>
        </div>

        <div className="stat-grid stat-grid-4">
          {usdtCards.map((c) => (
            <div
              className="card stat-card"
              key={c.label}
              onClick={() => openUsdtHistory(c.tab)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openUsdtHistory(c.tab);
                }
              }}
              title={`Click to view transaction history for ${c.label}`}
              style={{
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                position: 'relative',
                ...(c.isPrimary ? {
                  border: '1.5px solid #a7f3d0',
                  background: 'linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%)',
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.08)',
                } : {}),
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 14px rgba(0, 0, 0, 0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = c.isPrimary ? '0 2px 8px rgba(16, 185, 129, 0.08)' : '';
              }}
            >
              <i style={{ background: c.bg, color: c.color }}>
                <Ic name={c.icon} size={22} />
              </i>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                    {c.label}
                  </span>
                  <span style={{ fontSize: 9.5, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: c.bg, color: c.color }}>
                    {c.badge}
                  </span>
                </div>
                <b style={{ fontSize: 18, fontWeight: 900, color: c.isPrimary ? '#047857' : '#0f172a', letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>{c.value}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: c.color, opacity: 0.85 }} title="Click to view history">↗</span>
                </b>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 }}>
                  <small style={{ color: '#64748b', fontSize: 11 }}>
                    {c.sub}
                  </small>
                  <span style={{ fontSize: 10, fontWeight: 700, color: c.color }}>
                    History ↗
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
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

      {/* ─── USDT WALLET TRANSACTIONS & HISTORY MODAL ─── */}
      <UsdtWalletHistoryModal
        isOpen={usdtHistoryModalOpen}
        onClose={() => setUsdtHistoryModalOpen(false)}
        initialTab={usdtHistoryTab}
      />
    </>
  );
}
