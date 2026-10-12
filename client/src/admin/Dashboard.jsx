import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { api, money, fmtDate } from '../api.js';
import { STATUS_LABELS, PAYMENT_LABELS } from '../data.js';
import { ErrorBox } from './ui.jsx';
import Ic from '../components/Icons.jsx';
import { getSocket } from '../socket.js';
import UsdtWalletHistoryModal from './UsdtWalletHistoryModal.jsx';
import {
  Hero, MetaChip, Kpi, KpiGrid, Card, ChartGrid, Seg, Badge, Avatar, RankList, SplitBar, ChartTip, Empty,
  SERIES, STATUS, GRID, AXIS, shortMoney, delta,
} from './insights.jsx';

const FULFILLMENT = ['confirmed', 'processing', 'packed', 'out_from_warehouse', 'delivery_warehouse', 'shipped', 'out_for_delivery'];
const STATUS_TONE = {
  pending: 'warning',
  delivered: 'good',
  cancelled: 'critical',
  refunded: 'neutral',
};
const fmtUsdt = (val) => `${Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [metric, setMetric] = useState('revenue');
  const [usdtHistoryModalOpen, setUsdtHistoryModalOpen] = useState(false);
  const [usdtHistoryTab, setUsdtHistoryTab] = useState('all');
  const [updatedAt, setUpdatedAt] = useState(null);

  const openUsdtHistory = (tab = 'all') => {
    setUsdtHistoryTab(tab);
    setUsdtHistoryModalOpen(true);
  };

  const loadData = () => {
    setLoading(true);
    return api('/analytics/dashboard')
      .then((res) => {
        setD(res);
        setError('');
        setUpdatedAt(new Date());
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  // Real-time: a burst of socket events (one order touches orders, wallets and sellers at once)
  // reloads the dashboard once, instead of once per event.
  const timer = useRef(null);
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;

    const adminToken = localStorage.getItem('ng_admin_token');
    const rejoin = () => {
      // fresh read: the admin may have logged out since this screen opened
      const t = localStorage.getItem('ng_admin_token');
      if (t && t === adminToken) socket.emit('admin:join', { token: t });
    };
    if (socket.connected) rejoin();
    socket.on('connect', rejoin);

    const handleSync = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(loadData, 1500);
    };
    const events = ['order:update', 'order:status_update', 'order:new', 'withdrawal:new', 'withdrawal:update', 'seller:status_update', 'wallet:update', 'seller:health_update'];
    events.forEach((ev) => socket.on(ev, handleSync));

    return () => {
      clearTimeout(timer.current);
      socket.off('connect', rejoin);
      events.forEach((ev) => socket.off(ev, handleSync));
    };
  }, []);

  if (!d) {
    return (
      <div className="ins-page">
        <Hero icon="grid" title="Dashboard" subtitle="Loading your store overview…" />
        {error ? (
          <div>
            <ErrorBox error={error} />
            <button type="button" className="ins-btn" onClick={loadData} style={{ marginTop: 10 }}>
              <Ic name="refresh" size={14} /> Try again
            </button>
          </div>
        ) : (
          <KpiGrid>
            {Array.from({ length: 6 }).map((_, i) => (
              <div className="ins-kpi" key={i}>
                <span className="ins-skel" style={{ width: '50%' }} />
                <span className="ins-skel" style={{ width: '70%', height: 22 }} />
                <span className="ins-skel" style={{ width: '40%' }} />
              </div>
            ))}
          </KpiGrid>
        )}
      </div>
    );
  }

  const w = d.usdtWallet || {};
  const cur = d.period?.current || { revenue: 0, orders: 0, aov: 0, delivered: 0, cancelled: 0 };
  const prev = d.period?.previous || { revenue: 0, orders: 0, aov: 0, delivered: 0, cancelled: 0 };
  const sb = d.ordersByStatus || {};
  const totalOrders = Object.values(sb).reduce((a, b) => a + b, 0);
  const sellers = d.sellers || {};
  const health = d.health || {};
  const targets = d.targets || {};
  const req = d.requests || { deposits: { count: 0, amount: 0 }, withdrawals: { count: 0, amount: 0 } };
  const revenue30 = d.revenue30 || [];
  const hasDaily = revenue30.some((r) => r.orders > 0);
  const hasMonthly = (d.monthly12 || []).some((m) => m.orders > 0);
  const usdtTrend = w.trend || [];
  const hasUsdt = usdtTrend.some((x) => x.amount > 0);

  const attention = [
    { to: '/admin/applications', icon: '📝', color: '#6250d6', title: 'Applications waiting', sub: 'New stores to review', count: sellers.pendingApplications || 0 },
    { to: '/admin/withdrawals', icon: '💸', color: '#eb6834', title: 'Withdrawal requests', sub: money(req.withdrawals.amount), count: req.withdrawals.count },
    { to: '/admin/withdrawals', icon: '💰', color: '#2a78d6', title: 'Deposit requests', sub: money(req.deposits.amount), count: req.deposits.count },
    { to: '/admin/orders?status=pending', icon: '⏳', color: '#c98500', title: 'Orders open > 48 h', sub: 'Not delivered or cancelled yet', count: d.staleOpenOrders || 0 },
    { to: '/admin/complaints', icon: '🛡️', color: '#d03b3b', title: 'Stores at risk', sub: 'Health 30 or below', count: sellers.atRisk || 0 },
    { to: '/admin/inventory', icon: '📦', color: '#475569', title: 'Out of stock', sub: `${d.lowStock?.length || 0} more running low`, count: d.outOfStock?.length || 0 },
  ];
  const openItems = attention.reduce((a, x) => a + (x.count > 0 ? 1 : 0), 0);

  return (
    <div className="ins-page">
      <Hero
        icon="grid"
        title={`${greeting()} 👋`}
        subtitle="Your marketplace at a glance: sales, orders, stores and the money moving through seller wallets. Updates live as orders and payments come in."
        actions={
          <>
            <button type="button" className="ins-btn" onClick={() => openUsdtHistory('all')}>
              <Ic name="wallet" size={14} /> USDT history
            </button>
            <button type="button" className="ins-btn ins-btn-primary" onClick={loadData} disabled={loading}>
              <Ic name="refresh" size={14} /> {loading ? 'Updating…' : 'Refresh'}
            </button>
          </>
        }
      >
        <MetaChip live>Live</MetaChip>
        <MetaChip>Today {money(d.sales?.today?.revenue || 0)} · {d.sales?.today?.orders || 0} orders</MetaChip>
        {updatedAt && <MetaChip>Updated {updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</MetaChip>}
      </Hero>

      <ErrorBox error={error} />

      <KpiGrid dim={loading}>
        <Kpi icon="banknote" tone="blue" label="Revenue · 30 days" value={money(cur.revenue)} change={delta(cur.revenue, prev.revenue)} sub={`vs ${money(prev.revenue)} the 30 days before`} />
        <Kpi icon="box" tone="aqua" label="Orders · 30 days" value={cur.orders.toLocaleString('en-US')} change={delta(cur.orders, prev.orders)} sub={`${cur.delivered} delivered · ${cur.cancelled} cancelled`} />
        <Kpi icon="tag" tone="violet" label="Average order" value={money(cur.aov)} change={delta(cur.aov, prev.aov)} sub="Last 30 days" />
        <Kpi icon="package" tone="orange" label="Selling stores" value={sellers.active || 0} sub={`${sellers.newThisMonth || 0} new this month · ${sellers.total || 0} approved`} />
        <Kpi icon="user" tone="magenta" label="Customers" value={(d.customers?.total || 0).toLocaleString('en-US')} sub={`${d.customers?.newThisMonth || 0} new this month · ${d.customers?.returning || 0} returning`} />
        <Kpi icon="wallet" tone="green" label="USDT received" value={fmtUsdt(w.total)} sub={`${w.depositCount || 0} client deposits`} onClick={() => openUsdtHistory('all')} title="Open the USDT history" />
      </KpiGrid>

      <ChartGrid dim={loading}>
        <Card
          title={metric === 'revenue' ? 'Revenue — last 30 days' : 'Orders — last 30 days'}
          hint={metric === 'revenue' ? `${money(cur.revenue)} · cancelled & refunded left out` : `${cur.orders} orders`}
          wide
          actions={<Seg small label="Metric" value={metric} onChange={setMetric} options={[{ value: 'revenue', label: 'Revenue' }, { value: 'orders', label: 'Orders' }]} />}
          empty={!hasDaily && 'No orders in the last 30 days'}
        >
          <ResponsiveContainer width="100%" height={330}>
            <AreaChart data={revenue30} margin={{ top: 6, right: 8, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="dashTrend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.24} />
                  <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" {...AXIS} minTickGap={18} />
              <YAxis {...AXIS} tickFormatter={metric === 'revenue' ? shortMoney : undefined} allowDecimals={false} />
              <Tooltip
                cursor={{ stroke: '#cbd5e1', strokeDasharray: '3 3' }}
                content={<ChartTip fmt={(v, n, p) => (metric === 'revenue' ? `${money(v)} · ${p.payload.orders} orders` : `${v} · ${p.payload.delivered} delivered`)} />}
              />
              <Area type="monotone" dataKey={metric} name={metric === 'revenue' ? 'Revenue' : 'Orders'} stroke={SERIES[0]} strokeWidth={2} fill="url(#dashTrend)" activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Needs your attention" hint={openItems ? `${openItems} area${openItems === 1 ? '' : 's'} waiting on you` : 'Nothing waiting — all clear'}>
          <ul className="ins-attn">
            {attention.map((x) => (
              <li key={x.title}>
                <Link to={x.to}>
                  <span className="ins-attn-icon" style={{ background: `${x.color}1a` }}>{x.icon}</span>
                  <span className="ins-attn-text">
                    <b>{x.title}</b>
                    <span>{x.sub}</span>
                  </span>
                  <span className="ins-attn-count" style={{ color: x.count ? x.color : '#cbd5e1' }}>{x.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Monthly revenue — last 12 months" hint={`This year ${money(d.sales?.year?.revenue || 0)} · this month ${money(d.sales?.month?.revenue || 0)}`} wide empty={!hasMonthly && 'No revenue in the last 12 months'}>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={d.monthly12} margin={{ top: 6, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" {...AXIS} />
              <YAxis {...AXIS} tickFormatter={shortMoney} />
              <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTip fmt={(v, n, p) => `${money(v)} · ${p.payload.orders} orders`} />} />
              <Bar dataKey="revenue" name="Revenue" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={30} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Order pipeline" hint={`${totalOrders.toLocaleString('en-US')} orders all time`} empty={!totalOrders && 'No orders yet'}>
          <SplitBar
            height={14}
            parts={[
              { label: '⏳ Waiting', value: sb.pending || 0, color: STATUS.warning },
              { label: '🚚 In fulfilment', value: FULFILLMENT.reduce((a, k) => a + (sb[k] || 0), 0), color: SERIES[0] },
              { label: '✓ Delivered', value: sb.delivered || 0, color: STATUS.good },
              { label: '✕ Cancelled / refunded', value: (sb.cancelled || 0) + (sb.refunded || 0), color: STATUS.critical },
            ]}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14 }}>
            <Link to="/admin/orders?status=pending" className="ins-btn ins-btn-sm">Waiting orders →</Link>
            <Link to="/admin/orders" className="ins-btn ins-btn-sm">All orders →</Link>
          </div>
        </Card>
      </ChartGrid>

      <div className="ins-section-title">
        <h2>💵 USDT wallet</h2>
        <span>Real client accounts only — test and previous-store accounts left out{w.helpingAmount > 0 ? ` · gross ${fmtUsdt(w.grossDeposits)}, helping −${fmtUsdt(w.helpingAmount)}` : ''}</span>
      </div>

      <KpiGrid dim={loading}>
        <Kpi icon="wallet" tone="green" label="Total received" value={fmtUsdt(w.total)} sub={`${w.clientSellersCount || 0} client stores`} onClick={() => openUsdtHistory('all')} />
        <Kpi icon="clock" tone="blue" label="Today" value={fmtUsdt(w.today)} sub="Since midnight" onClick={() => openUsdtHistory('today')} />
        <Kpi icon="sparkle" tone="violet" label="This week" value={fmtUsdt(w.week)} sub="Since Monday" onClick={() => openUsdtHistory('week')} />
        <Kpi icon="banknote" tone="orange" label="This month" value={fmtUsdt(w.month)} sub="Since the 1st" onClick={() => openUsdtHistory('month')} />
      </KpiGrid>

      <ChartGrid dim={loading}>
        <Card title="USDT received per day" hint="Net client deposits, last 30 days" wide empty={!hasUsdt && 'No client deposits in the last 30 days'}>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={usdtTrend} margin={{ top: 6, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" {...AXIS} minTickGap={18} />
              <YAxis {...AXIS} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)} />
              <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTip fmt={(v) => fmtUsdt(v)} />} />
              <Bar dataKey="amount" name="Received" fill={SERIES[2]} radius={[4, 4, 0, 0]} maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Latest client deposits" actions={<button type="button" className="ins-btn ins-btn-sm" onClick={() => openUsdtHistory('all')}>All →</button>}>
          {(w.recentPayments || []).length === 0 ? (
            <Empty text="No client deposits yet" />
          ) : (
            <ul className="ins-stats">
              {w.recentPayments.map((p) => (
                <li key={p._id}>
                  <span style={{ minWidth: 0 }}>
                    <span className="ins-strong ins-clip" style={{ display: 'block' }}>{p.storeName || 'Store'}</span>
                    <span className="ins-sub">{fmtDate(p.createdAt)}</span>
                  </span>
                  <b style={{ color: '#006300' }}>+{fmtUsdt(p.netUsdt)}</b>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </ChartGrid>

      <div className="ins-section-title">
        <h2>🏪 Stores &amp; sellers</h2>
        <span>
          <Link to="/admin/sellers" style={{ color: '#2a78d6', fontWeight: 600 }}>Open Sellers →</Link>
        </span>
      </div>

      <ChartGrid dim={loading}>
        <Card title="Top stores · 30 days" hint="By order value">
          <RankList
            rows={(d.topSellers || []).map((s, i) => ({ key: String(s._id || i), label: s.storeName, value: s.gmv, sub: `${s.orders} orders` }))}
            color={SERIES[0]}
            empty="No store sales in the last 30 days"
          />
        </Card>

        <Card title="Store health" hint={`${sellers.total || 0} approved stores`}>
          <SplitBar
            height={14}
            parts={[
              { label: 'Healthy (80+)', value: health.healthy || 0, color: STATUS.good },
              { label: 'Watch (31–79)', value: health.watch || 0, color: STATUS.warning },
              { label: 'Freeze zone (21–30)', value: health.atRisk || 0, color: STATUS.serious },
              { label: 'Suspension zone (≤20)', value: health.critical || 0, color: STATUS.critical },
            ]}
          />
          <ul className="ins-stats" style={{ marginTop: 10 }}>
            <li><span>Frozen</span><b>{sellers.frozen || 0}</b></li>
            <li><span>Suspended</span><b>{sellers.suspended || 0}</b></li>
            <li><span>Active warnings</span><b>{sellers.warned || 0}</b></li>
          </ul>
        </Card>

        <Card title="Targets & bonuses" actions={<Link to="/admin/targets" className="ins-btn ins-btn-sm">Manage →</Link>}>
          <ul className="ins-stats">
            <li><span>⚡ In progress</span><b>{targets.active || 0}</b></li>
            <li><span>🏆 Completed</span><b>{targets.completed || 0}</b></li>
            <li><span>⌛ Expired</span><b>{targets.expired || 0}</b></li>
            <li><span>Bonus paid out</span><b style={{ color: '#006300' }}>{money(targets.bonusPaid || 0)}</b></li>
            <li><span>Bonus still on offer</span><b>{money(targets.bonusOpen || 0)}</b></li>
          </ul>
        </Card>

        <Card title="Payment methods" hint="Live orders, all time">
          <RankList
            rows={(d.paymentSplit || []).map((p) => ({ key: p.label || 'other', label: PAYMENT_LABELS[p.label] || p.label || 'Other', value: p.n, sub: money(p.revenue) })).sort((a, b) => b.value - a.value)}
            color={SERIES[2]}
            format={(v) => `${v} orders`}
            empty="No orders yet"
          />
        </Card>

        <Card title="Best-selling products" actions={<Link to="/admin/treasury" className="ins-btn ins-btn-sm">Products →</Link>}>
          {(d.bestSelling || []).length === 0 ? (
            <Empty text="No sales yet" />
          ) : (
            <ul className="ins-stats">
              {d.bestSelling.map((p) => (
                <li key={p._id}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{ width: 34, height: 34, borderRadius: 8, background: '#f1f5f9', overflow: 'hidden', flexShrink: 0 }}>
                      {p.image && <img src={p.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span className="ins-strong ins-clip" style={{ display: 'block', maxWidth: 180 }}>{p.name}</span>
                      <span className="ins-sub">{p.sold || 0} sold · {p.stock} in stock</span>
                    </span>
                  </span>
                  <b>{money(p.price)}</b>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Stock alerts" actions={<Link to="/admin/inventory" className="ins-btn ins-btn-sm">Inventory →</Link>}>
          {[...(d.outOfStock || []), ...(d.lowStock || [])].length === 0 ? (
            <Empty icon="✅" text="Every product has enough stock" />
          ) : (
            <ul className="ins-stats">
              {(d.outOfStock || []).slice(0, 4).map((p) => (
                <li key={p._id}>
                  <span className="ins-clip" style={{ maxWidth: 200 }}>{p.name}</span>
                  <Badge tone="critical">Out of stock</Badge>
                </li>
              ))}
              {(d.lowStock || []).slice(0, Math.max(0, 6 - Math.min(4, (d.outOfStock || []).length))).map((p) => (
                <li key={p._id}>
                  <span className="ins-clip" style={{ maxWidth: 200 }}>{p.name}</span>
                  <Badge tone="warning">{p.stock} left</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </ChartGrid>

      <div className="ins-table-card">
        <div className="ins-table-head">
          <div>
            <h3>🧾 Recent orders</h3>
            <span className="ins-card-hint">The latest {d.recent?.length || 0} orders</span>
          </div>
          <Link to="/admin/orders" className="ins-btn ins-btn-sm">All orders →</Link>
        </div>
        {(d.recent || []).length === 0 ? (
          <Empty icon="📦" text="No orders yet" />
        ) : (
          <div className="ins-table-scroll">
            <table className="ins-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Store</th>
                  <th>Customer</th>
                  <th className="num">Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.recent.map((o) => {
                  const store = o.items?.[0]?.sellerName || '';
                  return (
                    <tr key={o._id}>
                      <td>
                        <b style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5 }}>#{o.orderNumber}</b>
                        <span className="ins-sub">{fmtDate(o.createdAt)}</span>
                      </td>
                      <td>
                        {store ? (
                          <div className="ins-cell-who">
                            <Avatar name={store} size={28} />
                            <span className="ins-clip" style={{ maxWidth: 150 }}>{store}</span>
                          </div>
                        ) : (
                          <span className="ins-sub">Bazario Direct</span>
                        )}
                      </td>
                      <td>
                        <span className="ins-strong">{o.shippingAddress?.fullName || 'Guest'}</span>
                        <span className="ins-sub">{o.shippingAddress?.city || ''}</span>
                      </td>
                      <td className="num"><b>{money(o.total)}</b></td>
                      <td><span className="ins-sub" style={{ color: '#334155' }}>{PAYMENT_LABELS[o.paymentMethod] || o.paymentMethod || 'COD'}</span></td>
                      <td><Badge tone={STATUS_TONE[o.status] || 'info'}>{STATUS_LABELS[o.status] || o.status}</Badge></td>
                      <td>
                        <div className="ins-actions">
                          <Link className="ins-btn ins-btn-sm" to={`/admin/orders/${o._id}`}>View</Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <UsdtWalletHistoryModal isOpen={usdtHistoryModalOpen} onClose={() => setUsdtHistoryModalOpen(false)} initialTab={usdtHistoryTab} />
    </div>
  );
}
