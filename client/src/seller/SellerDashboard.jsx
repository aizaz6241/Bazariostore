import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sapi, money, fmtDate } from '../api.js';
import Ic from '../components/Icons.jsx';
import SellerAppModal from '../components/SellerAppModal.jsx';

export default function SellerDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [appModalOpen, setAppModalOpen] = useState(false);

  const loadData = () => {
    setLoading(true);
    sapi('/sellers/dashboard')
      .then((res) => {
        setData(res);
        setErr('');
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading && !data) {
    return <div className="seller-loading-state"><div className="spinner"></div><p>Loading your seller analytics...</p></div>;
  }

  if (err) {
    return <div className="seller-error-card"><Ic name="shield" size={20} /> <p>{err}</p><button onClick={loadData}>Retry</button></div>;
  }

  const { stats, salesByDay = [], topProducts = [], recentOrders = [], lowStockProducts = [] } = data || {};
  const maxDayRev = Math.max(...salesByDay.map((d) => d.revenue), 1000);

  return (
    <div className="seller-dash">
      {/* Welcome Banner */}
      <div className="seller-dash-welcome">
        <div>
          <h2>Seller Business Hub 🚀</h2>
          <p>Welcome back, <b>{data?.seller?.storeName}</b>! Here is your real-time performance summary.</p>
        </div>
        <div className="seller-quick-actions">
          <button type="button" onClick={() => setAppModalOpen(true)} className="seller-btn-app-install">
            <Ic name="download" size={16} /> Install Seller App
          </button>
          <Link to="/seller/products" className="seller-btn-pri"><Ic name="plus" size={16} /> Add Product</Link>
          <Link to="/seller/support" className="seller-btn-sec"><Ic name="chat" size={16} /> Support Chat</Link>
        </div>
      </div>

      {/* Featured Mobile App Card Banner */}
      <div className="seller-app-dashboard-banner">
        <div className="sadb-left">
          <div className="sadb-icon-badge">📱</div>
          <div className="sadb-text">
            <b>Bazario Merchant Mobile App (Android &amp; iOS)</b>
            <p>Get instant sound alerts on every new order, fulfill shipments faster, and chat with Admin on the go.</p>
          </div>
        </div>
        <div className="sadb-actions">
          <button type="button" className="btn-sadb-install" onClick={() => setAppModalOpen(true)}>
            <Ic name="download" size={15} /> ⚡ 1-Click Install App
          </button>
          <a
            href="/downloads/bazario-seller.apk"
            download="bazario-seller.apk"
            className="btn-sadb-apk"
          >
            <Ic name="package" size={15} /> Download APK
          </a>
        </div>
      </div>

      {/* Low Stock Warning Alert */}
      {lowStockProducts.length > 0 && (
        <div className="seller-low-stock-alert">
          <div className="alert-icon">⚠️</div>
          <div className="alert-text">
            <b>Low Inventory Notice ({lowStockProducts.length} items):</b> Some of your products are running low on stock. Please restock soon to prevent missed sales.
          </div>
          <Link to="/seller/products" className="alert-action">Manage Stock →</Link>
        </div>
      )}

      {/* KPI Metric Cards */}
      <div className="seller-kpi-grid">
        {/* Available Wallet Balance */}
        <div className="seller-kpi-card revenue-card">
          <div className="kpi-header">
            <span className="kpi-title">Available Wallet Balance</span>
            <span className="kpi-icon-wrap green"><Ic name="banknote" size={20} /></span>
          </div>
          <div className="kpi-value">{money(stats?.availableBalance || data?.seller?.wallet?.balance)}</div>
          <div className="kpi-footer text-green">
            <Link to="/seller/wallet" style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>
              Withdraw / View Wallet →
            </Link>
          </div>
        </div>

        {/* Processing Funds Locked */}
        <div className="seller-kpi-card pending-card">
          <div className="kpi-header">
            <span className="kpi-title">In-Flight Processing Funds</span>
            <span className="kpi-icon-wrap orange"><Ic name="lock" size={20} /></span>
          </div>
          <div className="kpi-value text-amber">{money(stats?.processingFund || data?.seller?.wallet?.processingFund)}</div>
          <div className="kpi-footer text-orange">
            <span>Locked for confirmed active orders</span>
          </div>
        </div>

        {/* 20% Profit Earned */}
        <div className="seller-kpi-card profit-card">
          <div className="kpi-header">
            <span className="kpi-title">20% Profit Margins Earned</span>
            <span className="kpi-icon-wrap blue"><Ic name="sparkle" size={20} /></span>
          </div>
          <div className="kpi-value text-green">+{money(stats?.totalProfitEarned || data?.seller?.wallet?.totalProfitEarned)}</div>
          <div className="kpi-footer text-blue">
            <span>Accumulated 20% order margins</span>
          </div>
        </div>

        {/* Total Orders */}
        <div className="seller-kpi-card orders-card">
          <div className="kpi-header">
            <span className="kpi-title">Total Orders</span>
            <span className="kpi-icon-wrap purple"><Ic name="package" size={20} /></span>
          </div>
          <div className="kpi-value">{stats?.totalOrders || 0}</div>
          <div className="kpi-footer">
            <span>{stats?.pendingOrders || 0} pending fulfillment</span>
          </div>
        </div>
      </div>

      {/* Secondary Metrics Bar */}
      <div className="seller-secondary-metrics">
        <div className="sec-metric">
          <span className="sec-lbl">Gross Store Sales</span>
          <b className="sec-val">{money(stats?.grossRevenue)}</b>
        </div>
        <div className="sec-metric">
          <span className="sec-lbl">Active Products Listed</span>
          <b className="sec-val">{stats?.totalProducts || 0}</b>
        </div>
        <div className="sec-metric">
          <span className="sec-lbl">Customer Rating</span>
          <b className="sec-val text-yellow">⭐ {data?.seller?.rating || '4.9'} / 5.0</b>
        </div>
        <div className="sec-metric">
          <span className="sec-lbl">Units Dispatched</span>
          <b className="sec-val">{stats?.totalItemsSold || 0}</b>
        </div>
        <div className="sec-metric">
          <span className="sec-lbl">Customer Refunds</span>
          <b className="sec-val">{stats?.refundCount || 0}</b>
        </div>
      </div>

      {/* Sales Trend Chart & Top Selling Products */}
      <div className="seller-charts-row">
        {/* Sales Chart */}
        <div className="seller-card chart-card">
          <div className="seller-card-head">
            <h3>📈 Daily Sales Revenue Trend (Last 14 Days)</h3>
            <span className="badge-pill">USD Revenue ($)</span>
          </div>
          <div className="sales-bar-chart">
            {salesByDay.map((day, idx) => {
              const heightPercent = Math.max(8, Math.round((day.revenue / maxDayRev) * 100));
              return (
                <div key={idx} className="chart-bar-col" title={`${day.rawDate}: ${money(day.revenue)} (${day.orders} orders)`}>
                  <div className="bar-hover-val">{day.revenue > 0 ? money(day.revenue) : ''}</div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ height: `${heightPercent}%`, backgroundColor: day.revenue > 0 ? '#ff9900' : '#e2e8f0' }}
                    ></div>
                  </div>
                  <span className="bar-label">{day.date}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Selling Products */}
        <div className="seller-card top-prods-card">
          <div className="seller-card-head">
            <h3>🔥 Top Selling Products</h3>
            <Link to="/seller/products" className="link-sm">View All</Link>
          </div>
          <div className="top-prods-list">
            {topProducts.length === 0 && <p className="muted-sm">No sales recorded yet.</p>}
            {topProducts.map((p, i) => (
              <div key={i} className="top-prod-item">
                <span className="top-rank">{i + 1}</span>
                <img src={p.image || '/img/products/serum.svg'} alt={p.name} className="top-prod-img" />
                <div className="top-prod-info">
                  <b className="top-prod-name">{p.name}</b>
                  <small className="muted">{p.qty} units sold</small>
                </div>
                <div className="top-prod-rev">{money(p.revenue)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Orders Table */}
      <div className="seller-card recent-orders-card">
        <div className="seller-card-head">
          <h3>📦 Recent Orders for Your Store</h3>
          <Link to="/seller/orders" className="seller-view-all">View All Orders ({stats?.totalOrders || 0}) →</Link>
        </div>
        <div className="seller-table-wrap">
          <table className="seller-table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Date</th>
                <th>Items Ordered</th>
                <th>Customer / City</th>
                <th>Seller Total</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center py-6 muted">No orders placed yet.</td>
                </tr>
              )}
              {recentOrders.map((ord) => {
                const sellerItems = ord.items.filter((it) => it.seller?.toString() === data?.seller?._id?.toString());
                const sellerTot = sellerItems.reduce((a, b) => a + (b.price || 0) * (b.qty || 1), 0);
                const status = sellerItems[0]?.itemStatus || ord.status;

                return (
                  <tr key={ord._id}>
                    <td><b>{ord.orderNumber}</b></td>
                    <td>{fmtDate(ord.createdAt)}</td>
                    <td>
                      <div className="order-items-preview">
                        {sellerItems.map((it, idx) => (
                          <div key={idx} className="preview-line">
                            <span className="item-qty-badge">{it.qty}x</span> {it.name}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span>{ord.shippingAddress?.fullName || 'Customer'}</span>
                      <small className="muted block">{ord.shippingAddress?.city || ''}</small>
                    </td>
                    <td><b>{money(sellerTot)}</b></td>
                    <td>
                      <span className={`status-tag status-${status}`}>{status.replace(/_/g, ' ')}</span>
                    </td>
                    <td>
                      <Link to="/seller/orders" className="btn-sm-action">Fulfill →</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Seller Central App Setup & APK Installer Modal */}
      <SellerAppModal isOpen={appModalOpen} onClose={() => setAppModalOpen(false)} />
    </div>
  );
}
