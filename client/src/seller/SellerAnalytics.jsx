import { useEffect, useState, useMemo } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { sapi, fmtDay, fmtDate } from '../api.js';
import { useCurrency } from '../context/CurrencyContext.jsx';
import Ic from '../components/Icons.jsx';

const CHART_COLORS = [
  '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#dc2626',
  '#0891b2', '#db2777', '#4b5563', '#ea580c', '#059669',
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

// Custom Shopify-Style Tooltip for the main Sales/Profit Line Graph
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

export default function SellerAnalytics() {
  const { formatMoney } = useCurrency();
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('30'); // '7' | '30' | '90' | '365' | '1825' | '3650' | 'all' | 'custom'
  const [timelineOption, setTimelineOption] = useState('none');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [chartMode, setChartMode] = useState('combined'); // 'combined' | 'sales' | 'profit' | 'orders'
  const [searchFilter, setSearchFilter] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');

  const fetchAnalytics = () => {
    setLoading(true);
    let url = `/sellers/analytics?days=${period}`;
    if (period === 'custom' && customFrom && customTo) {
      url = `/sellers/analytics?from=${customFrom}&to=${customTo}`;
    }
    sapi(url)
      .then(setData)
      .catch((err) => console.error('Failed to load seller analytics:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (period !== 'custom') {
      fetchAnalytics();
    }
  }, [period]);

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
    fetchAnalytics();
  };

  const d = data || {};
  const salesOverTime = d.salesOverTime || [];
  const statusBreakdown = d.statusBreakdown || [];
  const paymentBreakdown = d.paymentBreakdown || [];
  const topProducts = d.topProducts || [];
  const orders = d.orders || [];

  // Filtered orders in table
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchSearch =
        !searchFilter ||
        o.orderNumber?.toLowerCase().includes(searchFilter.toLowerCase()) ||
        o.customer?.toLowerCase().includes(searchFilter.toLowerCase());
      const matchStatus = orderStatusFilter === 'all' || o.status === orderStatusFilter;
      return matchSearch && matchStatus;
    });
  }, [orders, searchFilter, orderStatusFilter]);

  // Peak day computation
  const peakPoint = useMemo(() => {
    if (!salesOverTime.length) return null;
    return salesOverTime.reduce((max, cur) => (cur.sales > (max?.sales || 0) ? cur : max), salesOverTime[0]);
  }, [salesOverTime]);

  // Total status count for pie chart center display
  const totalOrdersCount = useMemo(() => {
    return statusBreakdown.reduce((s, item) => s + (item.value || 0), 0);
  }, [statusBreakdown]);

  // CSV Exporter
  const exportCSV = () => {
    if (!salesOverTime.length && !topProducts.length) return;
    let csv = 'Date/Label,Sales Revenue,Net Profit,Orders,Units Sold\n';
    salesOverTime.forEach((row) => {
      csv += `"${row.label}",${row.sales || 0},${row.profit || 0},${row.orders || 0},${row.items || 0}\n`;
    });
    csv += '\nTop Products,Units Sold,Revenue,Profit\n';
    topProducts.forEach((p) => {
      csv += `"${p.name.replace(/"/g, '""')}",${p.sold || 0},${p.revenue || 0},${p.profit || 0}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Seller-Analytics-${period}-days.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="seller-page">
      {/* ─── Header ─────────────────────────────────────────── */}
      <div className="seller-page-header">
        <div>
          <h2>📊 Analytics & Reports</h2>
          <p>Real-time financial breakdown, Shopify-style sales & profit trends, withdrawals, and store insights.</p>
        </div>
        <div className="analytics-actions">
          <button className="btn-outline btn-sm" onClick={exportCSV} title="Export CSV report">
            <Ic name="download" size={14} /> Export CSV
          </button>
          <button className="btn-primary btn-sm" onClick={fetchAnalytics} disabled={loading} title="Refresh live data">
            <Ic name="refresh" size={14} /> {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ─── Filter & Timeline Toolbar ──────────────────────── */}
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

        {/* Custom date range picker */}
        <form onSubmit={handleCustomApply} className="custom-range-inputs">
          <span className="analytics-filter-label">Custom:</span>
          <input
            type="date"
            className="custom-date-input"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            title="Start date"
          />
          <span className="muted" style={{ fontSize: 12 }}>→</span>
          <input
            type="date"
            className="custom-date-input"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            title="End date"
          />
          <button type="submit" className="btn-outline btn-sm" style={{ padding: '6px 12px' }}>
            Apply
          </button>
        </form>
      </div>

      {loading && !data && <div className="seller-loading">Loading analytics & financial reports...</div>}

      {data && (
        <>
          {/* ─── SECTION 1: CORE FINANCIAL & OPERATIONS KPIS ─── */}
          <div className="analytics-grid">
            {/* Total Revenue */}
            <StatCard
              icon="banknote"
              label="Total Revenue"
              value={formatMoney(d.totalRevenue || 0)}
              sub={`After ${d.commissionRate || 10}% platform commission`}
              badge="Net Sales"
              badgeColor="blue"
              color="#2563eb"
              bg="#eff6ff"
            />

            {/* Total Withdrawn Amount */}
            <StatCard
              icon="badgeCheck"
              label="Total Withdrawn Amount"
              value={formatMoney(d.totalWithdrawn || 0)}
              sub="Paid out to Bank / UPI / Crypto"
              badge="Completed"
              badgeColor="green"
              color="#16a34a"
              bg="#dcfce7"
            />

            {/* Processing Fund */}
            <StatCard
              icon="lock"
              label="Processing Fund"
              value={formatMoney(d.processingFund || 0)}
              sub="Active orders locked in fulfillment"
              badge="In-Flight"
              badgeColor="orange"
              color="#d97706"
              bg="#fef3c7"
            />

            {/* Pending Withdrawals */}
            <StatCard
              icon="clock"
              label="Pending Withdrawals"
              value={formatMoney(d.pendingWithdrawals || 0)}
              sub={`${d.pendingWithdrawalsCount || 0} payout requests awaiting admin approval`}
              badge={d.pendingWithdrawals > 0 ? 'Pending Action' : 'Cleared'}
              badgeColor={d.pendingWithdrawals > 0 ? 'orange' : 'green'}
              color="#ea580c"
              bg="#fff7ed"
            />

            {/* Total Sale Profit / Net Profit */}
            <StatCard
              icon="sparkle"
              label="Total Sale Profit"
              value={formatMoney(d.totalSaleProfit || 0)}
              sub={`${d.profitMargin || 20}% overall store profit margin`}
              badge="Net Profit"
              badgeColor="green"
              color="#059669"
              bg="#ecfdf5"
            />

            {/* Total Orders & Fulfilment */}
            <StatCard
              icon="package"
              label="Total Orders & Volume"
              value={d.totalOrders || 0}
              sub={`${d.fulfilmentRate || 0}% delivered · ${d.totalRefunds || 0} refunds (${formatMoney(d.refundAmount || 0)})`}
              badge={`${d.totalItems || 0} Items`}
              badgeColor="blue"
              color="#7c3aed"
              bg="#ede9fe"
            />
          </div>

          {/* ─── SECTION 2: SHOPIFY-STYLE SALES & PROFIT OVER TIME (LINE GRAPH) ─── */}
          <div className="shopify-chart-card">
            <div className="shopify-chart-header">
              <div className="shopify-chart-title-wrap">
                <h3>
                  <Ic name="sparkle" size={20} color="#2563eb" />
                  Sales Over Time & Profit Trajectory
                </h3>
                <p>Interactive Shopify-style curve with dynamic area gradient and margin indicators.</p>
              </div>

              {/* Metric View Switcher */}
              <div className="shopify-metric-toggles">
                {[
                  { id: 'combined', label: 'Combined View', color: '#2563eb' },
                  { id: 'sales', label: 'Sales Revenue', color: '#2563eb' },
                  { id: 'profit', label: 'Total Sale Profit', color: '#16a34a' },
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

            {/* Quick KPI Summary Row */}
            <div className="shopify-kpi-summary-row">
              <div className="shopify-kpi-item">
                <span className="kpi-label">Gross Revenue</span>
                <span className="kpi-val">{formatMoney(d.grossRevenue || d.totalRevenue || 0)}</span>
                <span className="kpi-sub">Total product order value</span>
              </div>
              <div className="shopify-kpi-item">
                <span className="kpi-label">Net Sale Profit</span>
                <span className="kpi-val" style={{ color: '#16a34a' }}>{formatMoney(d.totalSaleProfit || 0)}</span>
                <span className="kpi-sub">Take-home earnings</span>
              </div>
              <div className="shopify-kpi-item">
                <span className="kpi-label">Average Order Value</span>
                <span className="kpi-val">{formatMoney(d.avgOrderValue || 0)}</span>
                <span className="kpi-sub">Per completed transaction</span>
              </div>
              {peakPoint && (
                <div className="shopify-kpi-item">
                  <span className="kpi-label">Peak Performance Day</span>
                  <span className="kpi-val" style={{ color: '#2563eb' }}>{formatMoney(peakPoint.sales || 0)}</span>
                  <span className="kpi-sub">{peakPoint.label} ({peakPoint.orders || 0} orders)</span>
                </div>
              )}
            </div>

            {/* Recharts Area/Line Graph */}
            {salesOverTime.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={salesOverTime} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="shopifySalesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="shopifyProfitGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#16a34a" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#16a34a" stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="shopifyOrdersGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                  />
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
                      name="Sales Revenue"
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#shopifySalesGradient)"
                      activeDot={{ r: 5, stroke: '#ffffff', strokeWidth: 2 }}
                    />
                  )}

                  {(chartMode === 'combined' || chartMode === 'profit') && (
                    <Area
                      type="monotone"
                      dataKey="profit"
                      name="Total Sale Profit"
                      stroke="#16a34a"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#shopifyProfitGradient)"
                      activeDot={{ r: 5, stroke: '#ffffff', strokeWidth: 2 }}
                    />
                  )}

                  {chartMode === 'orders' && (
                    <Area
                      type="monotone"
                      dataKey="orders"
                      name="Orders Count"
                      stroke="#7c3aed"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#shopifyOrdersGradient)"
                      activeDot={{ r: 5, stroke: '#ffffff', strokeWidth: 2 }}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-box" style={{ padding: '40px 20px' }}>
                <p className="muted">No sales timeline data available for the chosen period.</p>
              </div>
            )}
          </div>

          {/* ─── SECTION 3: PIE CHARTS (DISTRIBUTIONS) ─── */}
          <div className="analytics-two-col-grid">
            {/* Pie Chart A: Orders by Fulfillment Status */}
            <div className="analytics-chart-box">
              <div className="chart-box-header">
                <h4>
                  <Ic name="package" size={18} color="#2563eb" />
                  Order Fulfillment Status
                </h4>
                <span className="chart-box-badge">{totalOrdersCount} Orders Total</span>
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
                          key={`status-cell-${index}`}
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

            {/* Pie Chart B: Payment Methods Breakdown */}
            <div className="analytics-chart-box">
              <div className="chart-box-header">
                <h4>
                  <Ic name="banknote" size={18} color="#059669" />
                  Payment Methods Share
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
                          key={`pay-cell-${index}`}
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

          {/* ─── SECTION 4: BAR CHARTS (REVENUE VS PROFIT & TOP PRODUCTS) ─── */}
          <div className="analytics-two-col-grid">
            {/* Bar Chart 1: Revenue vs Profit Periodic Comparison */}
            <div className="analytics-chart-box">
              <div className="chart-box-header">
                <h4>
                  <Ic name="grid" size={18} color="#2563eb" />
                  Revenue vs. Profit Comparison
                </h4>
                <span className="chart-box-badge">Periodic Bars</span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={salesOverTime.slice(-12)} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} tickFormatter={(v) => formatMoney(v)} />
                  <Tooltip
                    formatter={(val, name) => [formatMoney(val), name === 'sales' ? 'Revenue' : 'Net Profit']}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                  <Bar dataKey="sales" name="Revenue" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="profit" name="Net Profit" fill="#16a34a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Bar Chart 2: Top Products Performance Bars */}
            <div className="analytics-chart-box">
              <div className="chart-box-header">
                <h4>
                  <Ic name="tag" size={18} color="#7c3aed" />
                  Top Selling Products
                </h4>
                <span className="chart-box-badge">Units Sold</span>
              </div>
              {topProducts.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    layout="vertical"
                    data={topProducts.slice(0, 5)}
                    margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" stroke="#94a3b8" fontSize={11} />
                    <YAxis
                      dataKey="name"
                      type="category"
                      stroke="#94a3b8"
                      fontSize={11}
                      width={90}
                      tickFormatter={(name) => (name.length > 12 ? `${name.slice(0, 12)}…` : name)}
                    />
                    <Tooltip
                      formatter={(val, name) => [
                        name === 'revenue' ? formatMoney(val) : `${val} units`,
                        name === 'revenue' ? 'Revenue' : 'Units Sold',
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                    <Bar dataKey="sold" name="Units Sold" fill="#7c3aed" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="revenue" name="Revenue" fill="#0891b2" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-box" style={{ padding: '50px 20px' }}>
                  <p className="muted">No top products registered yet.</p>
                </div>
              )}
            </div>
          </div>

          {/* ─── SECTION 5: DETAILED TABULAR REPORTS & DRILL-DOWN ─── */}
          {/* Table A: Top Products Performance */}
          {topProducts.length > 0 && (
            <div className="reports-table-card">
              <div className="reports-table-header">
                <div>
                  <h3 style={{ margin: '0 0 3px 0', fontSize: 16, fontWeight: 800 }}>🏆 Top Products Performance</h3>
                  <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
                    Breakdown of revenue, units dispatched, and estimated profit per catalog product.
                  </p>
                </div>
              </div>

              <div className="table-responsive-wrap">
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}>#</th>
                      <th>Product</th>
                      <th>Units Sold</th>
                      <th>Gross Revenue</th>
                      <th>Net Profit</th>
                      <th>Profit Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((p, idx) => {
                      const sharePct = d.totalRevenue > 0 ? Math.round((p.revenue / d.totalRevenue) * 100) : 0;
                      return (
                        <tr key={p._id || idx}>
                          <td><span className="table-rank">#{idx + 1}</span></td>
                          <td>
                            <span className="table-prod-name">{p.name}</span>
                          </td>
                          <td><b>{p.sold}</b> units</td>
                          <td><b>{formatMoney(p.revenue)}</b></td>
                          <td style={{ color: '#16a34a', fontWeight: 700 }}>
                            {formatMoney(p.profit || Math.round(p.revenue * 0.2))}
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 999 }}>
                                <div
                                  style={{
                                    height: '100%',
                                    width: `${Math.min(100, sharePct)}%`,
                                    background: '#2563eb',
                                    borderRadius: 999,
                                  }}
                                />
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 700, minWidth: 32 }}>{sharePct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Table B: Recent Orders Audit & Reporting */}
          <div className="reports-table-card">
            <div className="reports-table-header">
              <div>
                <h3 style={{ margin: '0 0 3px 0', fontSize: 16, fontWeight: 800 }}>📦 Orders in Period</h3>
                <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
                  Detailed transaction list for order verification and fulfillment tracking.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Search order # or customer…"
                  className="reports-search-input"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                />
                <select
                  className="timeline-select"
                  value={orderStatusFilter}
                  onChange={(e) => setOrderStatusFilter(e.target.value)}
                >
                  <option value="all">All Statuses</option>
                  <option value="delivered">Delivered</option>
                  <option value="processing">Processing</option>
                  <option value="pending">Pending</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="refunded">Refunded</option>
                </select>
              </div>
            </div>

            {filteredOrders.length > 0 ? (
              <div className="table-responsive-wrap">
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>Order #</th>
                      <th>Customer</th>
                      <th>Items</th>
                      <th>Order Total</th>
                      <th>Payment Method</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((o) => (
                      <tr key={o._id}>
                        <td><b>{o.orderNumber}</b></td>
                        <td>{o.customer}</td>
                        <td>{o.itemsCount || 1}</td>
                        <td><b>{formatMoney(o.total)}</b></td>
                        <td><span style={{ fontSize: 12 }}>{o.paymentMethod}</span></td>
                        <td>
                          <span className={`status-badge ${o.status}`}>
                            {o.status}
                          </span>
                        </td>
                        <td>{fmtDay(o.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-box" style={{ padding: '30px 20px' }}>
                <p className="muted">No matching orders found in this period.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
