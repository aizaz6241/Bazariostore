import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sapi, fmtDate } from '../api.js';
import Ic from '../components/Icons.jsx';
import SellerAppModal from '../components/SellerAppModal.jsx';
import CurrencySelector from '../components/CurrencySelector.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';
import { getSocket } from '../socket.js';

export default function SellerDashboard() {
  const { formatMoney, currentCurrency } = useCurrency();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [appModalOpen, setAppModalOpen] = useState(false);

  const loadData = () => {
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

    const socket = getSocket();
    const onSync = () => loadData();
    socket.on('order:new', onSync);
    socket.on('wallet:update', onSync);
    socket.on('seller:health_update', onSync);
    socket.on('seller:status_update', onSync);
    socket.on('seller:targets_update', onSync);

    return () => {
      socket.off('order:new', onSync);
      socket.off('wallet:update', onSync);
      socket.off('seller:health_update', onSync);
      socket.off('seller:status_update', onSync);
      socket.off('seller:targets_update', onSync);
    };
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
        <div className="sdw-heading">
          <h2>Seller Business Hub 🚀</h2>
          <p>Welcome back, <b>{data?.seller?.storeName}</b>! Here is your real-time performance summary.</p>
        </div>
        <div className="seller-quick-actions">
          <Link to="/seller/products" className="seller-btn-pri"><Ic name="plus" size={16} /> Add Product</Link>
          <Link to="/seller/support" className="seller-btn-sec"><Ic name="chat" size={16} /> Support &amp; Helpline</Link>
          <Link to="/seller/wallet" className="seller-btn-wallet hide-on-mobile">
            <Ic name="banknote" size={16} /> My Wallet ({formatMoney(stats?.availableBalance || data?.seller?.wallet?.balance)})
          </Link>
        </div>
      </div>

      {/* ─── LIVE MERCHANT WALLET HERO & QUICK PAYOUT ACTIONS ─── */}
      <div className="seller-wallet-hero-card">
        <div className="swh-left">
          <div className="swh-icon-box">
            <Ic name="banknote" size={26} />
          </div>
          <div className="swh-info">
            <span className="swh-title">Available Merchant Wallet Balance</span>
            <div className="swh-balance-row">
              <span className="swh-amount">{formatMoney(stats?.availableBalance || data?.seller?.wallet?.balance)}</span>
              {(stats?.securityDeposit > 0 || data?.seller?.securityDeposit?.amount > 0 || data?.seller?.wallet?.securityDeposit > 0) && (
                <span className="swh-security-badge" title="Verified Registration Security Deposit Collateral">
                  🛡️ {formatMoney(stats?.securityDeposit || data?.seller?.securityDeposit?.amount || data?.seller?.wallet?.securityDeposit || 0)} Security Deposit
                </span>
              )}
              {(stats?.processingFund > 0 || data?.seller?.wallet?.processingFund > 0) && (
                <span className="swh-proc-badge" title="Funds locked in active order processing">
                  🔒 {formatMoney(stats?.processingFund || data?.seller?.wallet?.processingFund)} Processing
                </span>
              )}
              {(stats?.totalProfitEarned > 0 || data?.seller?.wallet?.totalProfitEarned > 0) && (
                <span className="swh-profit-badge" title="Cumulative 20% order profits earned">
                  +{formatMoney(stats?.totalProfitEarned || data?.seller?.wallet?.totalProfitEarned)} Profit Earned
                </span>
              )}
            </div>
            <span className="swh-sub">Ready for withdrawal or used for order fulfillment fund locking.</span>
          </div>
        </div>

        <div className="swh-actions">
          <Link to="/seller/wallet?tab=deposit" className="swh-btn swh-btn-deposit">
            <Ic name="plus" size={15} /> 💰 Add Deposit
          </Link>
          <Link to="/seller/wallet?tab=withdraw" className="swh-btn swh-btn-withdraw">
            <Ic name="banknote" size={15} /> 💸 Request Payout
          </Link>
          <Link to="/seller/wallet?tab=ledger" className="swh-btn swh-btn-ledger">
            <Ic name="eye" size={15} /> 📜 Financial Ledger
          </Link>
        </div>
      </div>

      {/* ─── SELLER ACCOUNT HEALTH & COMPLIANCE RATING HERO CARD ─── */}
      {(() => {
        const health = data?.seller?.accountHealth || {};
        const score = health.score !== undefined ? health.score : 100;
        const tier = score >= 80 ? 'healthy' : score >= 31 ? 'warning' : score > 20 ? 'freeze' : 'suspended';
        const tierLabel = score >= 80 ? 'Good / Healthy Standing' : score >= 31 ? 'At Risk / Needs Attention' : score > 20 ? 'Critical (Freeze Warning)' : 'Critical (Suspension Warning)';
        const tierDesc = score >= 80
          ? 'Your merchant store is in excellent standing. You enjoy uninterrupted product listings and fast withdrawal processing.'
          : score >= 31
          ? 'Your account health has dropped below 80. Improve dispatch timeliness and customer satisfaction to avoid account restrictions.'
          : score > 20
          ? 'Urgent attention required: Your score is near the 30% freeze threshold. Contact Platform Compliance immediately.'
          : 'High Risk Notice: Your account is at the 20% suspension threshold. Platform Admin review is pending.';

        return (
          <div className={`seller-health-hero-card health-card-tier-${tier}`}>
            <div className="shh-top">
              <div className="shh-left">
                <div className={`shh-score-badge tier-badge-${tier}`}>
                  <Ic name="shield" size={26} />
                  <div className="shh-score-val-wrap">
                    <span className="shh-score-num">{score}</span>
                    <span className="shh-score-total">/100</span>
                  </div>
                </div>
                <div className="shh-title-box">
                  <div className="shh-title-row">
                    <b className="shh-main-title">Account Health &amp; Compliance Rating</b>
                    <span className={`shh-status-pill tier-pill-${tier}`}>{tierLabel}</span>
                  </div>
                  <p className="shh-desc">{tierDesc}</p>
                </div>
              </div>

              <div className="shh-actions">
                <Link to="/seller/support" className="shh-support-btn">
                  <Ic name="chat" size={15} /> 🎧 Merchant Helpline
                </Link>
              </div>
            </div>

            {/* Visual Range Progress Bar Gauge */}
            <div className="shh-gauge-wrap">
              <div className="shh-gauge-track">
                <div
                  className={`shh-gauge-fill fill-${tier}`}
                  style={{ width: `${Math.max(4, Math.min(100, score))}%` }}
                >
                  <span className="shh-gauge-glow-cap" />
                </div>
              </div>
              <div className="shh-gauge-scale-grid">
                <div className="scale-pill pill-red">
                  <span className="scale-dot red" />
                  <span className="scale-lbl">0–20 (Suspension)</span>
                </div>
                <div className="scale-pill pill-orange">
                  <span className="scale-dot orange" />
                  <span className="scale-lbl">21–30 (Freeze)</span>
                </div>
                <div className="scale-pill pill-yellow">
                  <span className="scale-dot yellow" />
                  <span className="scale-lbl">31–79 (At Risk)</span>
                </div>
                <div className="scale-pill pill-green">
                  <span className="scale-dot green" />
                  <span className="scale-lbl">80–100 (Healthy)</span>
                </div>
              </div>
            </div>

            {/* Policy Metric Breakdown Grid */}
            <div className="shh-metrics-grid">
              <div className="shh-metric-item">
                <span className="smi-lbl">Account Privileges</span>
                <b className={`smi-val ${tier === 'healthy' ? 'text-green' : tier === 'warning' ? 'text-yellow' : 'text-red'}`}>
                  {tier === 'healthy' ? '✅ Full Privileges' : tier === 'warning' ? '⚠️ At Risk' : tier === 'freeze' ? '❄️ Freeze Alert' : '⛔ Suspension Alert'}
                </b>
              </div>
              <div className="shh-metric-item">
                <span className="smi-lbl">Policy Violations</span>
                <b className="smi-val text-green">{health.policyViolations || 0} Active Notices</b>
              </div>
              <div className="shh-metric-item">
                <span className="smi-lbl">Order Defect Rate</span>
                <b className="smi-val text-green">{((health.orderDefectRate || 0) * 100).toFixed(1)}% (Target &lt; 1%)</b>
              </div>
              <div className="shh-metric-item">
                <span className="smi-lbl">Latest Evaluation</span>
                <b className="smi-val">{health.lastEvaluatedAt ? fmtDate(health.lastEvaluatedAt) : 'Recently Validated'}</b>
              </div>
            </div>

            {/* Recent Adjustments History (if available) */}
            {Array.isArray(health.history) && health.history.length > 0 && (
              <div className="shh-history-box">
                <span className="shh-hist-title">Recent Compliance Log:</span>
                <div className="shh-hist-list">
                  {health.history.slice(0, 2).map((h, i) => (
                    <div key={i} className="shh-hist-row">
                      <span className={`hist-delta ${h.delta >= 0 ? 'plus' : 'minus'}`}>
                        {h.delta >= 0 ? `+${h.delta}` : h.delta} pts
                      </span>
                      <span className="hist-reason">"{h.reason || 'Routine Policy Evaluation'}"</span>
                      <small className="hist-meta">• {h.changedBy || 'Admin'} ({fmtDate(h.createdAt)})</small>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

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
          <div className="kpi-value">{formatMoney(stats?.availableBalance || data?.seller?.wallet?.balance)}</div>
          <div className="kpi-footer text-green">
            <Link to="/seller/wallet" style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>
              Withdraw / View Wallet →
            </Link>
          </div>
        </div>

        {/* Security Deposit Fund (Collateral) */}
        {(stats?.securityDeposit > 0 || data?.seller?.securityDeposit?.amount > 0 || data?.seller?.wallet?.securityDeposit > 0 || data?.seller?.securityDeposit?.paid) && (
          <div className="seller-kpi-card security-card">
            <div className="kpi-header">
              <span className="kpi-title">Security Deposit Fund</span>
              <span className="kpi-icon-wrap indigo"><Ic name="shield" size={20} /></span>
            </div>
            <div className="kpi-value text-indigo">
              {formatMoney(stats?.securityDeposit || data?.seller?.securityDeposit?.amount || data?.seller?.wallet?.securityDeposit || 0)}
            </div>
            <div className="kpi-footer text-indigo">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Ic name="badgeCheck" size={13} /> Active Merchant Collateral
              </span>
            </div>
          </div>
        )}

        {/* Processing Funds Locked */}
        <div className="seller-kpi-card pending-card">
          <div className="kpi-header">
            <span className="kpi-title">In-Flight Processing Funds</span>
            <span className="kpi-icon-wrap orange"><Ic name="lock" size={20} /></span>
          </div>
          <div className="kpi-value text-amber">{formatMoney(stats?.processingFund || data?.seller?.wallet?.processingFund)}</div>
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
          <div className="kpi-value text-green">+{formatMoney(stats?.totalProfitEarned || data?.seller?.wallet?.totalProfitEarned)}</div>
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
          <b className="sec-val">{formatMoney(stats?.grossRevenue)}</b>
        </div>
        <div className="sec-metric">
          <span className="sec-lbl">Active Products Listed</span>
          <b className="sec-val">{stats?.totalProducts || 0}</b>
        </div>
        {(stats?.securityDeposit > 0 || data?.seller?.securityDeposit?.amount > 0) && (
          <div className="sec-metric">
            <span className="sec-lbl">Security Collateral</span>
            <b className="sec-val text-indigo">🛡️ {formatMoney(stats?.securityDeposit || data?.seller?.securityDeposit?.amount)}</b>
          </div>
        )}
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

      {/* ─── PERFORMANCE TARGETS & CASH BONUSES WIDGET ─── */}
      {Array.isArray(data?.seller?.targets) && data.seller.targets.length > 0 && (
        <div className="seller-card" style={{ marginBottom: 20, borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 24 }}>🎯</span>
              <div>
                <h3 style={{ margin: 0, fontSize: 16 }}>Store Performance Targets &amp; Cash Bonuses</h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                  Complete assigned delivery order volume milestones to unlock instant wallet cash bonuses.
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {data.seller.targets.map((tgt) => {
              const current = tgt.currentOrderCount || 0;
              const target = tgt.targetOrderCount || 1;
              const pct = Math.min(100, Math.round((current / target) * 100));
              const isCompleted = tgt.status === 'completed' || current >= target;

              return (
                <div
                  key={tgt._id || tgt.title}
                  style={{
                    background: isCompleted ? '#f0fdf4' : '#f8fafc',
                    border: `1.5px solid ${isCompleted ? '#86efac' : '#e2e8f0'}`,
                    borderRadius: 10,
                    padding: '14px 16px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <b style={{ fontSize: 14, color: '#0f172a' }}>{tgt.title}</b>
                      {tgt.description && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>{tgt.description}</p>}
                    </div>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 800,
                        background: isCompleted ? '#dcfce7' : '#fef3c7',
                        color: isCompleted ? '#166534' : '#92400e',
                      }}
                    >
                      {isCompleted ? '🎉 COMPLETED' : 'IN PROGRESS'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0 4px', fontSize: 12.5 }}>
                    <span><b>{current}</b> / {target} Delivered Orders</span>
                    <b style={{ color: '#16a34a', fontSize: 13 }}>Bonus: +{formatMoney(tgt.bonusAmount || 0)}</b>
                  </div>

                  <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: isCompleted ? '#16a34a' : '#f59e0b',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                  {isCompleted && tgt.bonusCredited && (
                    <small style={{ display: 'block', marginTop: 6, color: '#166534', fontWeight: 700, fontSize: 11 }}>
                      ✅ Bonus {formatMoney(tgt.bonusAmount)} credited directly to Merchant Wallet!
                    </small>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sales Trend Chart & Top Selling Products */}
      <div className="seller-charts-row">
        {/* Sales Chart */}
        <div className="seller-card chart-card">
          <div className="seller-card-head">
            <div className="sch-title-box">
              <h3>📈 Daily Sales Revenue Trend (Last 14 Days)</h3>
              <span className="sch-subtitle">Store revenue progression and customer order volume</span>
            </div>
            <span className="badge-pill">{currentCurrency.code} ({currentCurrency.symbol})</span>
          </div>
          <div className="sales-chart-outer-wrap">
            <div className="sales-bar-chart">
              {salesByDay.map((day, idx) => {
                const heightPercent = Math.max(8, Math.round((day.revenue / maxDayRev) * 100));
                return (
                  <div key={idx} className="chart-bar-col" title={`${day.rawDate}: ${formatMoney(day.revenue)} (${day.orders} orders)`}>
                    <div className="bar-hover-val">{day.revenue > 0 ? formatMoney(day.revenue) : ''}</div>
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
        </div>

        {/* Top Selling Products */}
        <div className="seller-card top-prods-card">
          <div className="seller-card-head">
            <div className="sch-title-box">
              <h3>🔥 Top Selling Products</h3>
              <span className="sch-subtitle">Highest volume merchandise</span>
            </div>
            <Link to="/seller/products" className="seller-view-all-pill">View All Catalog →</Link>
          </div>
          <div className="top-prods-list">
            {topProducts.length === 0 && (
              <div className="top-prods-empty">
                <span className="empty-emoji">📦</span>
                <p>No sales recorded yet. Publish active products to track performance.</p>
              </div>
            )}
            {topProducts.map((p, i) => (
              <div key={i} className="top-prod-item">
                <span className={`top-rank rank-${i + 1}`}>#{i + 1}</span>
                <img src={p.image || '/img/products/serum.svg'} alt={p.name} className="top-prod-img" />
                <div className="top-prod-info">
                  <b className="top-prod-name" title={p.name}>{p.name}</b>
                  <small className="top-prod-meta">{p.qty} units sold</small>
                </div>
                <div className="top-prod-rev">{formatMoney(p.revenue)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Orders Table */}
      <div className="seller-card recent-orders-card">
        <div className="seller-card-head">
          <div className="sch-title-box">
            <h3>📦 Recent Orders for Your Store</h3>
            <span className="sch-subtitle">Latest incoming orders requiring dispatch and fulfillment</span>
          </div>
          <Link to="/seller/orders" className="seller-view-all-btn">
            View All Orders ({stats?.totalOrders || 0}) →
          </Link>
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
                    <td><b>{formatMoney(sellerTot)}</b></td>
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
