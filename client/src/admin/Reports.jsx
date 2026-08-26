import { useEffect, useState, useMemo } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { api, downloadFile, fmtDay } from '../api.js';
import { useCurrency } from '../context/CurrencyContext.jsx';
import { ErrorBox } from './ui.jsx';
import Ic from '../components/Icons.jsx';

const CHART_COLORS = [
  '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#dc2626',
  '#0891b2', '#db2777', '#4b5563', '#ea580c', '#059669',
];

const EXPORT_TYPES = [
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

function StatCard({ icon, label, value, sub, badge, badgeColor = 'blue', color = '#2563eb', bg = '#eff6ff' }) {
  return (
    <div className="analytics-card" style={{ '--card-accent': color, '--icon-bg': bg }}>
      <div className="analytics-card-icon">
        <Ic name={icon} size={22} />
      </div>
      <div className="analytics-card-body">
        <div className="analytics-label">
          <span>{label}</span>
          {badge && <span className={`analytics-badge ${badgeColor}`}>{badge}</span>}
        </div>
        <div className="analytics-val">{value}</div>
        {sub && <div className="analytics-sub">{sub}</div>}
      </div>
    </div>
  );
}

function ShopifyChartTooltip({ active, payload, label, formatMoney }) {
  if (!active || !payload || !payload.length) return null;
  const dataPoint = payload[0]?.payload || {};
  return (
    <div className="chart-tooltip-shopify">
      <div className="tooltip-date">{dataPoint.label || label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="tooltip-row">
          <span className="tooltip-row-label">
            <span className="tooltip-bullet" style={{ backgroundColor: entry.color }} />
            {entry.name}:
          </span>
          <span className="tooltip-row-val">
            {entry.dataKey === 'orders' || entry.dataKey === 'items'
              ? entry.value
              : formatMoney(entry.value || 0)}
          </span>
        </div>
      ))}
      {dataPoint.sales > 0 && dataPoint.profit !== undefined && (
        <div className="tooltip-row" style={{ marginTop: 6, paddingTop: 4, borderTop: '1px solid #334155' }}>
          <span className="tooltip-row-label" style={{ color: '#94a3b8', fontSize: 11 }}>Margin:</span>
          <span className="tooltip-row-val" style={{ color: '#38bdf8', fontSize: 11 }}>
            {Math.round((dataPoint.profit / dataPoint.sales) * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}

export default function Reports() {
  const { formatMoney } = useCurrency();
  const [activeTab, setActiveTab] = useState('analytics'); // 'analytics' | 'export'

  // Visual Analytics State
  const [analyticsData, setAnalyticsData] = useState(null);
  const [period, setPeriod] = useState('30');
  const [timelineOption, setTimelineOption] = useState('none');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [chartMode, setChartMode] = useState('combined');
  const [searchFilter, setSearchFilter] = useState('');

  // Raw Export Center State
  const [exportType, setExportType] = useState('sales');
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadAnalytics = () => {
    setAnalyticsLoading(true);
    let url = `/analytics/reports?days=${period}`;
    if (period === 'custom' && customFrom && customTo) {
      url = `/analytics/reports?from=${customFrom}&to=${customTo}`;
    }
    api(url)
      .then(setAnalyticsData)
      .catch((err) => console.error('Failed to load admin reports:', err))
      .finally(() => setAnalyticsLoading(false));
  };

  useEffect(() => {
    if (activeTab === 'analytics' && period !== 'custom') {
      loadAnalytics();
    }
  }, [activeTab, period]);

  const handlePeriodChange = (val) => {
    setPeriod(val);
    setTimelineOption('none');
  };

  const handleTimelineChange = (e) => {
    const val = e.target.value;
    setTimelineOption(val);
    if (val !== 'none') {
      setPeriod(val);
    }
  };

  const handleCustomApply = (e) => {
    e.preventDefault();
    if (!customFrom || !customTo) return;
    setPeriod('custom');
    setTimelineOption('none');
    loadAnalytics();
  };

  // Raw Export query string
  const exportQs = () => {
    const p = new URLSearchParams();
    if (exportFrom) p.set('from', exportFrom);
    if (exportTo) p.set('to', exportTo);
    return p.toString();
  };

  const loadPreview = async () => {
    setBusy(true);
    setError('');
    try {
      setPreview(await api(`/reports/${exportType}?${exportQs()}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const exportAs = (format) =>
    downloadFile(`/reports/${exportType}?format=${format}&${exportQs()}`, `${exportType}-report.${format}`).catch((e) => setError(e.message));

  const d = analyticsData || {};
  const salesOverTime = d.salesOverTime || [];
  const statusBreakdown = d.statusBreakdown || [];
  const paymentBreakdown = d.paymentBreakdown || [];
  const topProducts = d.topProducts || [];
  const topSellers = d.topSellers || [];
  const recentOrders = d.recentOrders || [];

  const totalOrdersCount = useMemo(() => {
    return statusBreakdown.reduce((s, item) => s + (item.value || 0), 0);
  }, [statusBreakdown]);

  const peakPoint = useMemo(() => {
    if (!salesOverTime.length) return null;
    return salesOverTime.reduce((max, cur) => (cur.sales > (max?.sales || 0) ? cur : max), salesOverTime[0]);
  }, [salesOverTime]);

  return (
    <>
      <div className="admin-h1-row" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="admin-h1" style={{ margin: '0 0 4px 0' }}>Analytics & Reports</h1>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Platform-wide executive overview, Shopify-style financial trends, multi-period timeline & file exports.
          </p>
        </div>
        <div className="period-tabs">
          <button
            className={`period-tab ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            📊 Visual Dashboard
          </button>
          <button
            className={`period-tab ${activeTab === 'export' ? 'active' : ''}`}
            onClick={() => setActiveTab('export')}
          >
            📁 Raw Export Files
          </button>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* TAB 1: VISUAL ANALYTICS & REPORTS DASHBOARD                 */}
      {/* ──────────────────────────────────────────────────────────── */}
      {activeTab === 'analytics' && (
        <>
          {/* Filter & Timeline Toolbar */}
          <div className="analytics-toolbar-wrap">
            <div className="analytics-filter-group">
              <span className="analytics-filter-label">Quick Range:</span>
              <div className="period-tabs">
                {[
                  { label: '7 Days', val: '7' },
                  { label: '30 Days', val: '30' },
                  { label: '90 Days', val: '90' },
                ].map((p) => (
                  <button
                    key={p.val}
                    className={`period-tab ${period === p.val ? 'active' : ''}`}
                    onClick={() => handlePeriodChange(p.val)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <span className="analytics-filter-label" style={{ marginLeft: 12 }}>Timeline:</span>
              <div className="timeline-dropdown-wrap">
                <select
                  className="timeline-select"
                  value={['365', '1825', '3650', 'all'].includes(period) ? period : timelineOption}
                  onChange={handleTimelineChange}
                >
                  <option value="none" disabled>Select Timeline…</option>
                  <option value="365">1 Year (12 Months)</option>
                  <option value="1825">5 Years (Long-Term)</option>
                  <option value="3650">10 Years (Decade View)</option>
                  <option value="all">All-Time Lifetime</option>
                </select>
              </div>
            </div>

            {/* Custom Date Inputs */}
            <form onSubmit={handleCustomApply} className="custom-range-inputs">
              <span className="analytics-filter-label">Custom:</span>
              <input
                type="date"
                className="custom-date-input"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <span className="muted" style={{ fontSize: 12 }}>→</span>
              <input
                type="date"
                className="custom-date-input"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
              <button type="submit" className="btn-outline btn-sm" style={{ padding: '6px 12px' }}>
                Apply
              </button>
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={loadAnalytics}
                disabled={analyticsLoading}
                style={{ marginLeft: 6 }}
              >
                <Ic name="refresh" size={13} /> {analyticsLoading ? '…' : 'Refresh'}
              </button>
            </form>
          </div>

          {analyticsLoading && !analyticsData && <p className="muted">Loading platform analytics & financial reports…</p>}

          {analyticsData && (
            <>
              {/* ─── SECTION 1: PLATFORM FINANCIAL KPIS ─── */}
              <div className="analytics-grid">
                {/* Total Revenue */}
                <StatCard
                  icon="banknote"
                  label="Total Platform Revenue"
                  value={formatMoney(d.totalRevenue || 0)}
                  sub={`${d.totalOrders || 0} orders placed across platform`}
                  badge="Gross Sales"
                  badgeColor="blue"
                  color="#2563eb"
                  bg="#eff6ff"
                />

                {/* Total Withdrawn Amount */}
                <StatCard
                  icon="badgeCheck"
                  label="Total Withdrawn Amount"
                  value={formatMoney(d.totalWithdrawn || 0)}
                  sub="Disbursed to sellers across all payouts"
                  badge="Completed"
                  badgeColor="green"
                  color="#16a34a"
                  bg="#dcfce7"
                />

                {/* Processing Fund */}
                <StatCard
                  icon="lock"
                  label="Platform Processing Fund"
                  value={formatMoney(d.processingFund || 0)}
                  sub="Active seller funds currently locked in fulfillment"
                  badge="In Escrow"
                  badgeColor="orange"
                  color="#d97706"
                  bg="#fef3c7"
                />

                {/* Pending Withdrawals */}
                <StatCard
                  icon="clock"
                  label="Pending Withdrawals"
                  value={formatMoney(d.pendingWithdrawals || 0)}
                  sub={`${d.pendingWithdrawalsCount || 0} seller payout requests in queue`}
                  badge={d.pendingWithdrawals > 0 ? 'Review Needed' : 'Cleared'}
                  badgeColor={d.pendingWithdrawals > 0 ? 'orange' : 'green'}
                  color="#ea580c"
                  bg="#fff7ed"
                />

                {/* Total Sale Profit / Commission */}
                <StatCard
                  icon="sparkle"
                  label="Total Platform Profit"
                  value={formatMoney(d.totalSaleProfit || 0)}
                  sub={`~${d.profitMargin || 15}% estimated commission`}
                  badge="Platform Margin"
                  badgeColor="green"
                  color="#059669"
                  bg="#ecfdf5"
                />

                {/* Fulfilment Rate */}
                <StatCard
                  icon="package"
                  label="Fulfillment Success Rate"
                  value={`${d.fulfilmentRate || 0}%`}
                  sub={`Avg order value: ${formatMoney(d.avgOrderValue || 0)}`}
                  badge={`${d.totalItems || 0} Units`}
                  badgeColor="blue"
                  color="#7c3aed"
                  bg="#ede9fe"
                />
              </div>

              {/* ─── SECTION 2: SHOPIFY-STYLE SALES OVER TIME (LINE GRAPH) ─── */}
              <div className="shopify-chart-card">
                <div className="shopify-chart-header">
                  <div className="shopify-chart-title-wrap">
                    <h3>
                      <Ic name="sparkle" size={20} color="#2563eb" />
                      Platform Sales & Profit Trajectory (Shopify Line Graph)
                    </h3>
                    <p>Continuous area spline tracking gross revenue, platform commission & volume.</p>
                  </div>

                  <div className="shopify-metric-toggles">
                    {[
                      { id: 'combined', label: 'Combined View', color: '#2563eb' },
                      { id: 'sales', label: 'Sales Revenue', color: '#2563eb' },
                      { id: 'profit', label: 'Platform Profit', color: '#16a34a' },
                      { id: 'orders', label: 'Order Volume', color: '#7c3aed' },
                    ].map((toggle) => (
                      <button
                        key={toggle.id}
                        className={`metric-toggle-btn ${chartMode === toggle.id ? 'active' : ''}`}
                        onClick={() => setChartMode(toggle.id)}
                      >
                        <span className="toggle-dot" style={{ backgroundColor: toggle.color }} />
                        {toggle.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="shopify-kpi-summary-row">
                  <div className="shopify-kpi-item">
                    <span className="kpi-label">Gross Revenue in Period</span>
                    <span className="kpi-val">{formatMoney(d.totalRevenue || 0)}</span>
                    <span className="kpi-sub">Total marketplace transactions</span>
                  </div>
                  <div className="shopify-kpi-item">
                    <span className="kpi-label">Platform Profit Earned</span>
                    <span className="kpi-val" style={{ color: '#16a34a' }}>{formatMoney(d.totalSaleProfit || 0)}</span>
                    <span className="kpi-sub">Net revenue share</span>
                  </div>
                  <div className="shopify-kpi-item">
                    <span className="kpi-label">Average Order Size</span>
                    <span className="kpi-val">{formatMoney(d.avgOrderValue || 0)}</span>
                    <span className="kpi-sub">Across all vendors</span>
                  </div>
                  {peakPoint && (
                    <div className="shopify-kpi-item">
                      <span className="kpi-label">Peak Sales Record</span>
                      <span className="kpi-val" style={{ color: '#2563eb' }}>{formatMoney(peakPoint.sales || 0)}</span>
                      <span className="kpi-sub">{peakPoint.label} ({peakPoint.orders || 0} orders)</span>
                    </div>
                  )}
                </div>

                {salesOverTime.length > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <AreaChart data={salesOverTime} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="adminSalesGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0.01} />
                        </linearGradient>
                        <linearGradient id="adminProfitGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#16a34a" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#16a34a" stopOpacity={0.01} />
                        </linearGradient>
                        <linearGradient id="adminOrdersGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.01} />
                        </linearGradient>
                      </defs>

                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => (chartMode === 'orders' ? v : formatMoney(v))}
                      />
                      <Tooltip content={<ShopifyChartTooltip formatMoney={formatMoney} />} />

                      {(chartMode === 'combined' || chartMode === 'sales') && (
                        <Area
                          type="monotone"
                          dataKey="sales"
                          name="Platform Sales"
                          stroke="#2563eb"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#adminSalesGradient)"
                          activeDot={{ r: 5, stroke: '#ffffff', strokeWidth: 2 }}
                        />
                      )}

                      {(chartMode === 'combined' || chartMode === 'profit') && (
                        <Area
                          type="monotone"
                          dataKey="profit"
                          name="Platform Profit"
                          stroke="#16a34a"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#adminProfitGradient)"
                          activeDot={{ r: 5, stroke: '#ffffff', strokeWidth: 2 }}
                        />
                      )}

                      {chartMode === 'orders' && (
                        <Area
                          type="monotone"
                          dataKey="orders"
                          name="Order Volume"
                          stroke="#7c3aed"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#adminOrdersGradient)"
                          activeDot={{ r: 5, stroke: '#ffffff', strokeWidth: 2 }}
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty-box" style={{ padding: '40px 20px' }}>
                    <p className="muted">No sales timeline recorded in this timeframe.</p>
                  </div>
                )}
              </div>

              {/* ─── SECTION 3: PIE CHARTS (STATUS & PAYMENT) ─── */}
              <div className="analytics-two-col-grid">
                <div className="analytics-chart-box">
                  <div className="chart-box-header">
                    <h4>
                      <Ic name="package" size={18} color="#2563eb" />
                      Orders by Status Distribution
                    </h4>
                    <span className="chart-box-badge">{totalOrdersCount} Total</span>
                  </div>
                  <div className="pie-chart-wrap">
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={statusBreakdown}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={3}
                        >
                          {statusBreakdown.map((entry, index) => (
                            <Cell
                              key={`admin-status-${index}`}
                              fill={entry.color || CHART_COLORS[index % CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(val, name) => [
                            `${val} orders (${totalOrdersCount ? Math.round((val / totalOrdersCount) * 100) : 0}%)`,
                            name,
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="pie-legend-grid">
                    {statusBreakdown.map((item, i) => (
                      <div key={item.name} className="pie-legend-item">
                        <span className="pie-legend-label">
                          <span
                            className="pie-legend-dot"
                            style={{ backgroundColor: item.color || CHART_COLORS[i % CHART_COLORS.length] }}
                          />
                          {item.name}
                        </span>
                        <span className="pie-legend-val">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="analytics-chart-box">
                  <div className="chart-box-header">
                    <h4>
                      <Ic name="banknote" size={18} color="#059669" />
                      Payment Methods Distribution
                    </h4>
                    <span className="chart-box-badge">Gateway Split</span>
                  </div>
                  <div className="pie-chart-wrap">
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={paymentBreakdown}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={50}
                          outerRadius={85}
                          paddingAngle={3}
                        >
                          {paymentBreakdown.map((_, index) => (
                            <Cell
                              key={`admin-pay-${index}`}
                              fill={CHART_COLORS[index % CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip formatter={(val, name) => [`${val} orders`, name]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="pie-legend-grid">
                    {paymentBreakdown.map((item, i) => (
                      <div key={item.name} className="pie-legend-item">
                        <span className="pie-legend-label">
                          <span
                            className="pie-legend-dot"
                            style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                          />
                          {item.name}
                        </span>
                        <span className="pie-legend-val">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ─── SECTION 4: BAR CHARTS ─── */}
              <div className="analytics-two-col-grid">
                <div className="analytics-chart-box">
                  <div className="chart-box-header">
                    <h4>
                      <Ic name="grid" size={18} color="#2563eb" />
                      Sales vs. Profit Bars
                    </h4>
                    <span className="chart-box-badge">Comparison</span>
                  </div>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={salesOverTime.slice(-12)} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} tickFormatter={(v) => formatMoney(v)} />
                      <Tooltip formatter={(val, name) => [formatMoney(val), name === 'sales' ? 'Revenue' : 'Profit']} />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                      <Bar dataKey="sales" name="Revenue" fill="#2563eb" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="profit" name="Profit" fill="#16a34a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="analytics-chart-box">
                  <div className="chart-box-header">
                    <h4>
                      <Ic name="tag" size={18} color="#7c3aed" />
                      Top Performing Sellers
                    </h4>
                    <span className="chart-box-badge">By Sales Volume</span>
                  </div>
                  {topSellers.length > 0 ? (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart
                        layout="vertical"
                        data={topSellers.slice(0, 5)}
                        margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" stroke="#94a3b8" fontSize={11} />
                        <YAxis
                          dataKey="name"
                          type="category"
                          stroke="#94a3b8"
                          fontSize={11}
                          width={95}
                          tickFormatter={(name) => (name.length > 13 ? `${name.slice(0, 13)}…` : name)}
                        />
                        <Tooltip formatter={(val) => [formatMoney(val), 'Sales']} />
                        <Bar dataKey="sales" name="Store Sales" fill="#7c3aed" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="empty-box" style={{ padding: '50px 20px' }}>
                      <p className="muted">No top sellers recorded yet.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* ─── SECTION 5: PERFORMANCE REPORT TABLE ─── */}
              {topProducts.length > 0 && (
                <div className="reports-table-card">
                  <div className="reports-table-header">
                    <div>
                      <h3 style={{ margin: '0 0 3px 0', fontSize: 16, fontWeight: 800 }}>🏆 Top Platform Products</h3>
                      <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
                        Highest velocity catalog items across all marketplace vendors.
                      </p>
                    </div>
                  </div>

                  <div className="table-responsive-wrap">
                    <table className="analytics-table">
                      <thead>
                        <tr>
                          <th style={{ width: 50 }}>#</th>
                          <th>Product Name</th>
                          <th>Units Sold</th>
                          <th>Gross Volume</th>
                          <th>Estimated Profit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topProducts.map((p, idx) => (
                          <tr key={p._id || idx}>
                            <td><span className="table-rank">#{idx + 1}</span></td>
                            <td><span className="table-prod-name">{p.name}</span></td>
                            <td><b>{p.sold}</b> units</td>
                            <td><b>{formatMoney(p.revenue)}</b></td>
                            <td style={{ color: '#16a34a', fontWeight: 700 }}>
                              {formatMoney(Math.round(p.revenue * 0.1))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* TAB 2: RAW DATA EXPORT CENTER                               */}
      {/* ──────────────────────────────────────────────────────────── */}
      {activeTab === 'export' && (
        <>
          <div className="card form-card" style={{ marginTop: 8 }}>
            <div className="admin-toolbar" style={{ marginBottom: 0 }}>
              <select value={exportType} onChange={(e) => { setExportType(e.target.value); setPreview(null); }}>
                {EXPORT_TYPES.map(([k, label]) => <option key={k} value={k}>{label} Report</option>)}
              </select>
              <input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} />
              <span className="muted">→</span>
              <input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} />
              <button className="btn-primary" onClick={loadPreview} disabled={busy}>
                {busy ? 'Loading…' : 'PREVIEW'}
              </button>
              <span className="export-btns">
                <button className="btn-outline btn-sm" onClick={() => exportAs('csv')}>
                  <Ic name="arrowRight" size={12} /> CSV
                </button>
                <button className="btn-outline btn-sm" onClick={() => exportAs('xlsx')}>
                  <Ic name="arrowRight" size={12} /> Excel
                </button>
                <button className="btn-outline btn-sm" onClick={() => exportAs('pdf')}>
                  <Ic name="arrowRight" size={12} /> PDF
                </button>
              </span>
            </div>
          </div>
          <ErrorBox error={error} />

          {preview && (
            <div className="card">
              <h3>{preview.title} — {preview.rows.length} rows</h3>
              <div className="admin-table-wrap">
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
              {preview.rows.length > 100 && (
                <p className="muted-sm">First 100 rows shown in preview. Full data will be included in the exported file.</p>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
