import { useEffect, useState } from 'react';
import { sapi, money, fmtDay } from '../api.js';
import Ic from '../components/Icons.jsx';

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div className="analytics-card" style={{ borderTop: `3px solid ${color}` }}>
      <div className="analytics-card-icon" style={{ color }}><Ic name={icon} size={22} /></div>
      <div>
        <div className="analytics-val">{value}</div>
        <div className="analytics-label">{label}</div>
        {sub && <div className="analytics-sub muted-sm">{sub}</div>}
      </div>
    </div>
  );
}

export default function SellerAnalytics() {
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('30');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    sapi(`/sellers/analytics?days=${period}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  const d = data || {};
  const orders = d.orders || [];
  const topProducts = d.topProducts || [];
  const revenueByDay = d.revenueByDay || [];

  return (
    <div className="seller-page">
      <div className="seller-page-header">
        <div>
          <h2>📊 Analytics & Reports</h2>
          <p>Track your store's performance, revenue, and top-selling products.</p>
        </div>
        <div className="period-tabs">
          {[
            { label: '7 Days', val: '7' },
            { label: '30 Days', val: '30' },
            { label: '90 Days', val: '90' },
          ].map((p) => (
            <button
              key={p.val}
              className={`period-tab ${period === p.val ? 'active' : ''}`}
              onClick={() => setPeriod(p.val)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="seller-loading">Loading analytics...</div>}

      {!loading && (
        <>
          {/* KPI Cards */}
          <div className="analytics-grid">
            <StatCard icon="banknote" label="Total Revenue" value={money(d.totalRevenue || 0)} sub={`After ${d.commissionRate || 10}% platform fee`} color="#2563eb" />
            <StatCard icon="package" label="Total Orders" value={d.totalOrders || 0} sub={`Last ${period} days`} color="#7c3aed" />
            <StatCard icon="tag" label="Items Sold" value={d.totalItems || 0} sub="Units dispatched" color="#059669" />
            <StatCard icon="user" label="Avg Order Value" value={money(d.avgOrderValue || 0)} color="#d97706" />
            <StatCard icon="refresh" label="Refunds" value={d.totalRefunds || 0} sub={`${money(d.refundAmount || 0)} refunded`} color="#dc2626" />
            <StatCard icon="badgeCheck" label="Fulfilment Rate" value={`${d.fulfilmentRate || 0}%`} sub="Orders delivered" color="#0891b2" />
          </div>

          {/* Top Products */}
          {topProducts.length > 0 && (
            <div className="card mt-4">
              <h3 className="card-title">🏆 Top Selling Products</h3>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th>Units Sold</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p, i) => (
                    <tr key={p._id || i}>
                      <td><b>#{i + 1}</b></td>
                      <td>{p.name}</td>
                      <td>{p.sold}</td>
                      <td>{money(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Recent Orders */}
          {orders.length > 0 && (
            <div className="card mt-4">
              <h3 className="card-title">📦 Recent Orders</h3>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 10).map((o) => (
                    <tr key={o._id}>
                      <td><b>{o.orderNumber}</b></td>
                      <td>{o.contact?.email || 'Guest'}</td>
                      <td>{money(o.total)}</td>
                      <td><span className="status-chip">{o.status}</span></td>
                      <td>{fmtDay(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {orders.length === 0 && topProducts.length === 0 && (
            <div className="empty-box mt-4">
              <Ic name="eye" size={44} stroke={1.2} />
              <p>No sales data yet for this period. Start selling to see analytics!</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
