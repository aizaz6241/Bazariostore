import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { api, money, fmtDate } from '../api.js';
import { STATUS_LABELS, PAYMENT_LABELS } from '../data.js';
import { ErrorBox } from './ui.jsx';
import Ic from '../components/Icons.jsx';
import { getSocket } from '../socket.js';
import UsdtWalletHistoryModal from './UsdtWalletHistoryModal.jsx';

// Categorical slots in fixed order (identity), reserved status colours for seller states
const CAT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const SELLER_STATES = [
  { key: 'active', label: 'Active', color: '#0ca30c' },
  { key: 'pending', label: 'Awaiting approval', color: '#fab219' },
  { key: 'rejected', label: 'Rejected', color: '#d03b3b' },
  { key: 'other', label: 'Suspended / frozen', color: '#94a3b8' },
];

const fmtUsdt = (val) => `${Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
const compact = (n) => {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(Math.round(v));
};
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

function Tip({ active, payload, label, valueFormatter = (v) => v }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="dsh-tip">
      {label !== undefined && <b>{label}</b>}
      {payload.map((p) => (
        <div key={p.dataKey || p.name} className="dsh-tip-row">
          <i style={{ background: p.color || p.payload?.fill }} />
          <span>{p.name}</span>
          <strong>{valueFormatter(p.value, p)}</strong>
        </div>
      ))}
    </div>
  );
}

function ChartCard({ title, sub, icon, action, children, className = '' }) {
  return (
    <section className={`dsh-card ${className}`}>
      <header className="dsh-card-head">
        <div>
          <h3>{icon && <Ic name={icon} size={16} />} {title}</h3>
          {sub && <p>{sub}</p>}
        </div>
        {action}
      </header>
      <div className="dsh-card-body">{children}</div>
    </section>
  );
}

export default function Dashboard() {
  const outlet = useOutletContext() || {};
  const adminName = outlet.admin?.name || 'Admin';
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [usdtHistoryModalOpen, setUsdtHistoryModalOpen] = useState(false);
  const [usdtHistoryTab, setUsdtHistoryTab] = useState('all');
  const [revMetric, setRevMetric] = useState('revenue'); // revenue | orders

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

    const events = ['order:update', 'order:status_update', 'order:new', 'withdrawal:new', 'withdrawal:update', 'seller:status_update', 'wallet:update', 'seller:new_registration'];
    events.forEach((ev) => socket.on(ev, loadData));

    return () => {
      socket.off('connect', rejoin);
      events.forEach((ev) => socket.off(ev, loadData));
    };
  }, []);

  const derived = useMemo(() => {
    if (!d) return null;
    const statusBars = Object.entries(d.ordersByStatus || {})
      .map(([k, v]) => ({ key: k, name: STATUS_LABELS[k] || k, value: v }))
      .sort((a, b) => b.value - a.value);
    const payTotal = (d.paymentSplit || []).reduce((t, p) => t + p.n, 0);
    const pay = (d.paymentSplit || [])
      .map((p) => ({ name: PAYMENT_LABELS[p.label] || p.label || 'Other', value: p.n }))
      .sort((a, b) => b.value - a.value);
    // more than 5 methods: the rest fold into "Other"
    const payFolded = pay.length > 5 ? [...pay.slice(0, 4), { name: 'Other', value: pay.slice(4).reduce((t, p) => t + p.value, 0) }] : pay;
    const daily = d.daily30 || (d.revenue30 || []).map((r) => ({ ...r }));
    const half = Math.floor(daily.length / 2);
    const sum = (arr, k) => arr.reduce((t, x) => t + (x[k] || 0), 0);
    const last15 = sum(daily.slice(half), 'revenue');
    const prev15 = sum(daily.slice(0, half), 'revenue');
    const change = prev15 > 0 ? Math.round(((last15 - prev15) / prev15) * 100) : null;
    return { statusBars, pay: payFolded, payTotal, daily, months: d.months12 || d.monthly12 || [], change, total30: sum(daily, 'revenue'), orders30: sum(daily, 'orders') };
  }, [d]);

  if (error) return <ErrorBox error={error} />;
  if (!d || !derived) {
    return (
      <div className="dsh">
        <div className="dsh-skel dsh-skel-hero" />
        <div className="dsh-kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="dsh-skel dsh-skel-tile" />)}</div>
        <div className="dsh-skel dsh-skel-chart" />
      </div>
    );
  }

  const w = d.usdtWallet || { total: 0, today: 0, week: 0, month: 0, grossDeposits: 0, helpingAmount: 0, depositCount: 0 };
  const sales = d.sales || {};
  const sellers = d.sellers || { total: 0, active: 0, pending: 0, rejected: 0, other: 0, newThisMonth: 0 };
  const os = d.ordersByStatus || {};
  // the server only sends the parts this admin's role covers
  const show = d.sections || { sales: true, recentOrders: true, stock: true, wallet: true, sellers: true };
  const nothing = !show.sales && !show.recentOrders && !show.stock && !show.wallet && !show.sellers;

  const salesTiles = [
    { key: 'today', label: 'Today', icon: 'clock' },
    { key: 'week', label: 'This week', icon: 'sparkle' },
    { key: 'month', label: 'This month', icon: 'banknote' },
    { key: 'year', label: 'This year', icon: 'chart' },
  ];

  const usdtTiles = [
    { tab: 'all', label: 'Wallet balance', value: w.total, sub: `${w.depositCount || 0} deposits`, primary: true },
    { tab: 'today', label: 'Received today', value: w.today, sub: "Today's inflow" },
    { tab: 'week', label: 'This week', value: w.week, sub: 'Last 7 days' },
    { tab: 'month', label: 'This month', value: w.month, sub: 'Month to date' },
  ];

  const orderTiles = [
    { icon: 'clock', label: 'Pending', value: os.pending || 0, link: '/admin/orders?status=pending', tone: 'amber' },
    { icon: 'package', label: 'Processing', value: (os.processing || 0) + (os.packed || 0) + (os.confirmed || 0), link: '/admin/orders?status=processing', tone: 'blue' },
    { icon: 'truck', label: 'In transit', value: (os.shipped || 0) + (os.out_for_delivery || 0) + (os.out_from_warehouse || 0) + (os.delivery_warehouse || 0), link: '/admin/orders?status=shipped', tone: 'violet' },
    { icon: 'checkCircle', label: 'Delivered', value: os.delivered || 0, link: '/admin/orders?status=delivered', tone: 'green' },
    { icon: 'refresh', label: 'Cancelled / refunded', value: (os.cancelled || 0) + (os.refunded || 0), link: '/admin/orders?status=cancelled', tone: 'red' },
  ];

  const sellerBar = SELLER_STATES.map((s) => ({ ...s, value: sellers[s.key] || 0 }));

  return (
    <div className="dsh">
      {/* ─── Hero ─── */}
      <section className="dsh-hero">
        <div>
          <span className="dsh-date">{new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
          <h1>{greeting()}, {adminName.split(' ')[0]}</h1>
          <p>
            {show.sales ? (
              <>{money(sales.today?.revenue || 0)} in sales today from {sales.today?.orders || 0} order{sales.today?.orders === 1 ? '' : 's'}</>
            ) : nothing ? (
              'Your role does not include dashboard figures. Use the menu to open the sections you work on.'
            ) : (
              'Here is what your role covers today.'
            )}
            {show.sellers && sellers.pending ? <> · <b>{sellers.pending}</b> seller application{sellers.pending === 1 ? '' : 's'} waiting</> : null}
          </p>
        </div>
        <div className="dsh-hero-actions">
          {show.sellers && (
            <>
              <Link to="/admin/applications" className="dsh-hero-btn">
                <Ic name="badgeCheck" size={16} /> Applications {sellers.pending > 0 && <span className="dsh-badge">{sellers.pending}</span>}
              </Link>
              <Link to="/admin/affiliates" className="dsh-hero-btn"><Ic name="tag" size={16} /> Affiliate codes</Link>
            </>
          )}
          {show.sales && <Link to="/admin/reports" className="dsh-hero-btn solid"><Ic name="chart" size={16} /> Full reports</Link>}
        </div>
      </section>

      {/* ─── Sales KPIs ─── */}
      {show.sales && (
      <div className="dsh-kpis">
        {salesTiles.map((t) => (
          <div className="dsh-kpi" key={t.key}>
            <div className="dsh-kpi-top">
              <span>{t.label}</span>
              <i><Ic name={t.icon} size={16} /></i>
            </div>
            <b>{money(sales[t.key]?.revenue || 0)}</b>
            <small>{sales[t.key]?.orders || 0} order{sales[t.key]?.orders === 1 ? '' : 's'}</small>
          </div>
        ))}
      </div>
      )}

      {/* ─── Revenue + seller pipeline ─── */}
      {(show.sales || show.sellers) && (
      <div className={show.sales && show.sellers ? 'dsh-grid dsh-grid-main' : 'dsh-grid'}>
        {show.sales && (
        <ChartCard
          icon="trend"
          title={revMetric === 'revenue' ? 'Revenue — last 30 days' : 'Orders — last 30 days'}
          sub={
            <>
              {revMetric === 'revenue' ? money(derived.total30) : `${derived.orders30} orders`}
              {derived.change !== null && revMetric === 'revenue' && (
                <span className={`dsh-delta ${derived.change >= 0 ? 'up' : 'down'}`}>
                  {derived.change >= 0 ? '▲' : '▼'} {Math.abs(derived.change)}% vs previous 15 days
                </span>
              )}
            </>
          }
          action={
            <div className="dsh-seg" role="tablist">
              {['revenue', 'orders'].map((m) => (
                <button key={m} type="button" role="tab" aria-selected={revMetric === m} className={revMetric === m ? 'on' : ''} onClick={() => setRevMetric(m)}>
                  {m === 'revenue' ? 'Revenue' : 'Orders'}
                </button>
              ))}
            </div>
          }
        >
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={derived.daily} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="dshRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2a78d6" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#2a78d6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#eef1f5" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={revMetric === 'revenue' ? compact : undefined} allowDecimals={false} />
              <Tooltip cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }} content={<Tip valueFormatter={(v) => (revMetric === 'revenue' ? money(v) : v)} />} />
              <Area type="monotone" dataKey={revMetric} name={revMetric === 'revenue' ? 'Revenue' : 'Orders'} stroke="#2a78d6" strokeWidth={2} fill="url(#dshRev)" activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        )}

        {show.sellers && (
        <ChartCard icon="users" title="Seller pipeline" sub={`${sellers.total} sellers · ${sellers.newThisMonth} new this month`} action={<Link className="dsh-more" to="/admin/sellers">Sellers →</Link>}>
          <div className="dsh-pipe-bar" aria-hidden="true">
            {sellerBar.map((s) => (s.value > 0 ? <i key={s.key} style={{ flexGrow: s.value, background: s.color }} /> : null))}
            {sellers.total === 0 && <i style={{ flexGrow: 1, background: '#eef1f5' }} />}
          </div>
          <ul className="dsh-pipe-list">
            {sellerBar.map((s) => (
              <li key={s.key}>
                <i style={{ background: s.color }} />
                <span>{s.label}</span>
                <b>{s.value}</b>
                <small>{sellers.total ? Math.round((s.value / sellers.total) * 100) : 0}%</small>
              </li>
            ))}
          </ul>
          {sellers.pending > 0 && (
            <Link to="/admin/applications" className="dsh-cta">
              <Ic name="badgeCheck" size={16} /> Review {sellers.pending} pending application{sellers.pending === 1 ? '' : 's'}
            </Link>
          )}
        </ChartCard>
        )}
      </div>
      )}

      {/* ─── USDT wallet ─── */}
      {show.wallet && d.usdtWallet && (
      <section className="dsh-card dsh-usdt">
        <header className="dsh-card-head">
          <div>
            <h3><Ic name="wallet" size={16} /> USDT wallet</h3>
            <p>
              Real client accounts only (tests &amp; previous stores excluded)
              {w.helpingAmount > 0 && <> · Gross {fmtUsdt(w.grossDeposits)}, helping −{fmtUsdt(w.helpingAmount)}</>}
            </p>
          </div>
          <div className="dsh-head-actions">
            <button type="button" className="dsh-more" onClick={() => openUsdtHistory('all')}>History &amp; breakdown →</button>
            <Link className="dsh-more" to="/admin/withdrawals">Deposits &amp; payouts →</Link>
          </div>
        </header>
        <div className="dsh-usdt-grid">
          {usdtTiles.map((c) => (
            <button type="button" key={c.tab} className={`dsh-usdt-tile ${c.primary ? 'primary' : ''}`} onClick={() => openUsdtHistory(c.tab)} title={`View ${c.label.toLowerCase()} transactions`}>
              <span>{c.label}</span>
              <b>{fmtUsdt(c.value)}</b>
              <small>{c.sub} <em>↗</em></small>
            </button>
          ))}
        </div>
      </section>
      )}

      {/* ─── Order pipeline ─── */}
      {show.sales && (
      <>
      <div className="dsh-orders">
        {orderTiles.map((c) => (
          <Link key={c.label} to={c.link} className={`dsh-order-tile tone-${c.tone}`}>
            <i><Ic name={c.icon} size={18} /></i>
            <div>
              <b>{c.value}</b>
              <small>{c.label}</small>
            </div>
          </Link>
        ))}
      </div>

      {/* ─── Monthly / status / payments ─── */}
      <div className="dsh-grid dsh-grid-3">
        <ChartCard icon="chart" title="Monthly revenue" sub="Last 12 months" className="span-2">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={derived.months} margin={{ top: 10, right: 8, left: -8, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke="#eef1f5" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={compact} />
              <Tooltip cursor={{ fill: 'rgba(15,23,42,0.04)' }} content={<Tip valueFormatter={(v) => money(v)} />} />
              <Bar dataKey="revenue" name="Revenue" fill="#2a78d6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard icon="card" title="Payment methods" sub={`${derived.payTotal} paid orders`}>
          {derived.pay.length === 0 ? (
            <div className="dsh-empty">No orders yet.</div>
          ) : (
            <div className="dsh-donut">
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={derived.pay} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={2} stroke="#fff" strokeWidth={2}>
                    {derived.pay.map((_, i) => <Cell key={i} fill={CAT[i]} />)}
                  </Pie>
                  <Tooltip content={<Tip />} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="dsh-legend">
                {derived.pay.map((p, i) => (
                  <li key={p.name}>
                    <i style={{ background: CAT[i] }} />
                    <span>{p.name}</span>
                    <b>{p.value}</b>
                    <small>{derived.payTotal ? Math.round((p.value / derived.payTotal) * 100) : 0}%</small>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ChartCard>
      </div>
      </>
      )}

      {(show.sales || show.stock || show.sellers) && (
      <div className="dsh-grid dsh-grid-2">
        {show.sales && (
        <ChartCard icon="package" title="Orders by status" sub="All time" action={<Link className="dsh-more" to="/admin/orders">Orders →</Link>}>
          {derived.statusBars.length === 0 ? (
            <div className="dsh-empty">No orders yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, derived.statusBars.length * 30 + 20)}>
              <BarChart data={derived.statusBars} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }} barCategoryGap="26%">
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12, fill: '#334155' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(15,23,42,0.04)' }} content={<Tip />} />
                <Bar dataKey="value" name="Orders" fill="#2a78d6" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: '#475569', fontWeight: 700 }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        )}

        <ChartCard icon="user" title="Customers & stock" sub="Shoppers and inventory health">
          <div className="dsh-mini-grid">
            {[
              ...(show.sales
                ? [
                    { icon: 'user', label: 'Customers', value: d.customers?.total || 0 },
                    { icon: 'sparkle', label: 'New this month', value: d.customers?.newThisMonth || 0 },
                    { icon: 'refresh', label: 'Returning', value: d.customers?.returning || 0 },
                  ]
                : []),
              ...(show.stock
                ? [
                    { icon: 'box', label: 'Low stock', value: d.lowStock?.length || 0, warn: (d.lowStock?.length || 0) > 0, link: '/admin/inventory' },
                    { icon: 'x', label: 'Out of stock', value: d.outOfStock?.length || 0, warn: (d.outOfStock?.length || 0) > 0, link: '/admin/inventory' },
                  ]
                : []),
              ...(show.sellers ? [{ icon: 'users', label: 'Active sellers', value: sellers.active, link: '/admin/sellers' }] : []),
            ].map((c) => {
              const body = (
                <>
                  <i><Ic name={c.icon} size={15} /></i>
                  <b>{c.value}</b>
                  <small>{c.label}</small>
                </>
              );
              return c.link ? (
                <Link key={c.label} to={c.link} className={`dsh-mini ${c.warn ? 'warn' : ''}`}>{body}</Link>
              ) : (
                <div key={c.label} className="dsh-mini">{body}</div>
              );
            })}
          </div>
        </ChartCard>
      </div>
      )}

      {/* ─── Lists ─── */}
      {show.stock && (
      <div className="dsh-grid dsh-grid-2">
        <ChartCard icon="star" title="Best selling products" action={<Link className="dsh-more" to="/admin/products">All products →</Link>}>
          {(d.bestSelling || []).length === 0 && <div className="dsh-empty">No sales yet.</div>}
          <ol className="dsh-rank">
            {(d.bestSelling || []).map((p, i) => (
              <li key={p._id}>
                <span className="dsh-rank-n">{i + 1}</span>
                <span className="dsh-thumb">{p.image ? <img src={p.image} alt="" loading="lazy" /> : null}</span>
                <span className="dsh-rank-name">
                  {p.name}
                  <small>{p.sold} sold · {p.stock} in stock</small>
                </span>
                <b>{money(p.price)}</b>
              </li>
            ))}
          </ol>
        </ChartCard>

        <ChartCard icon="alert" title="Stock alerts" action={<Link className="dsh-more" to="/admin/inventory">Inventory →</Link>}>
          {[...(d.outOfStock || []), ...(d.lowStock || [])].length === 0 && (
            <div className="dsh-allgood"><Ic name="checkCircle" size={16} /> All products are well stocked.</div>
          )}
          <ul className="dsh-rank">
            {(d.outOfStock || []).map((p) => (
              <li key={p._id}>
                <span className="dsh-thumb">{p.image ? <img src={p.image} alt="" loading="lazy" /> : null}</span>
                <span className="dsh-rank-name">{p.name}</span>
                <span className="dsh-flag red">Out of stock</span>
              </li>
            ))}
            {(d.lowStock || []).map((p) => (
              <li key={p._id}>
                <span className="dsh-thumb">{p.image ? <img src={p.image} alt="" loading="lazy" /> : null}</span>
                <span className="dsh-rank-name">{p.name}</span>
                <span className="dsh-flag amber">{p.stock} left</span>
              </li>
            ))}
          </ul>
        </ChartCard>
      </div>
      )}

      {show.recentOrders && (
      <ChartCard icon="list" title="Recent orders" action={<Link to="/admin/orders" className="dsh-more">See all →</Link>}>
        {(d.recent || []).length === 0 ? (
          <div className="dsh-empty">No orders yet.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table dsh-table">
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
                    <td><b>{money(o.total)}</b></td>
                    <td><span className="pay-chip">{(PAYMENT_LABELS[o.paymentMethod] || o.paymentMethod || '').toUpperCase()}</span></td>
                    <td><span className={`status-pill st-${o.status}`}>{STATUS_LABELS[o.status] || o.status}</span></td>
                    <td><Link className="row-link" to={`/admin/orders/${o._id}`}>View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
      )}

      {show.wallet && (
      <UsdtWalletHistoryModal
        isOpen={usdtHistoryModalOpen}
        onClose={() => setUsdtHistoryModalOpen(false)}
        initialTab={usdtHistoryTab}
      />
      )}
    </div>
  );
}
