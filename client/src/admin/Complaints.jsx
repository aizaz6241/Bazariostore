import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, Cell } from 'recharts';
import { api, fmtDate } from '../api.js';
import { ErrorBox } from './ui.jsx';
import Ic from '../components/Icons.jsx';
import {
  Hero, MetaChip, Kpi, KpiGrid, Card, ChartGrid, Seg, Badge, Avatar, RankList, SplitBar, ChartTip,
  Toolbar, SearchBox, Empty, Meter, STATUS, GRID, AXIS, legendText,
} from './insights.jsx';

const DAY = 86400000;
const scoreOf = (s) => (s.accountHealth?.score !== undefined && s.accountHealth?.score !== null ? s.accountHealth.score : 100);
const healthTier = (score) =>
  score >= 80
    ? { key: 'healthy', label: 'Healthy', tone: 'good', color: STATUS.good }
    : score >= 31
    ? { key: 'watch', label: 'Watch', tone: 'warning', color: STATUS.warning }
    : score > 20
    ? { key: 'freeze', label: 'Freeze zone', tone: 'serious', color: STATUS.serious }
    : { key: 'suspend', label: 'Suspension zone', tone: 'critical', color: STATUS.critical };

const HEALTH_BUCKETS = [
  { label: '0–20', min: 0, max: 20, color: STATUS.critical },
  { label: '21–30', min: 21, max: 30, color: STATUS.serious },
  { label: '31–55', min: 31, max: 55, color: STATUS.warning },
  { label: '56–79', min: 56, max: 79, color: '#f6c453' },
  { label: '80–100', min: 80, max: 100, color: STATUS.good },
];

const ACCESS_META = {
  active: { label: 'Active', tone: 'good', icon: '●' },
  frozen: { label: 'Frozen', tone: 'info', icon: '❄' },
  suspended: { label: 'Suspended', tone: 'critical', icon: '⛔' },
};

const TIERS = [
  { max: '500', fee: '50', req: '10', name: 'Tier 1 - Standard ($500 Max)', label: '🥉 Tier 1 · $500' },
  { max: '1000', fee: '75', req: '10', name: 'Tier 2 - Silver Merchant ($1,000 Max)', label: '🥈 Tier 2 · $1,000' },
  { max: '2500', fee: '100', req: '15', name: 'Tier 3 - Gold Partner ($2,500 Max)', label: '🥇 Tier 3 · $2,500' },
  { max: '5000', fee: '150', req: '20', name: 'Tier 4 - Diamond VIP ($5,000 Max)', label: '💎 Tier 4 · $5,000' },
];

const HEALTH_PRESETS = [
  { label: '⏱️ Late dispatch', delta: -15, reason: 'Late order dispatch exceeds platform 48h fulfillment policy.' },
  { label: '⚠️ Defective item', delta: -20, reason: 'Customer complaints of counterfeit / defective items received.' },
  { label: '⛔ Policy violation', delta: -30, reason: 'Serious copyright or policy compliance violation.' },
  { label: '✅ Dispute resolved', delta: 15, reason: 'Customer dispute satisfactorily resolved with refund.' },
  { label: '🌟 Reset to 100', set: 100, reason: 'Clean compliance slate restored by Platform Admin.' },
];

// Rejected registrations are not compliance cases: they belong to New Applications
const isRejectedRegistration = (s) => s.status === 'suspended' && (s.registrationRejectedAt || /reject/i.test(s.freezeReason || ''));

export default function Complaints() {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [filterTab, setFilterTab] = useState('all');
  const [sortBy, setSortBy] = useState('risk');
  const [range, setRange] = useState(30);

  const [compSeller, setCompSeller] = useState(null);
  const [compTab, setCompTab] = useState('freeze');
  const [freezeStatus, setFreezeStatus] = useState('frozen');
  const [freezeReason, setFreezeReason] = useState('');
  const [warnActive, setWarnActive] = useState(true);
  const [warnLevel, setWarnLevel] = useState('warning');
  const [warnMessage, setWarnMessage] = useState('');
  const [healthScore, setHealthScore] = useState(100);
  const [healthReason, setHealthReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  const liveReq = useRef(0);

  const [limit, setLimit] = useState({ max: '500', min: '10', req: '10', done: '0', fee: '50', name: '' });

  const loadSellers = () => {
    setLoading(true);
    setError('');
    api('/sellers')
      .then((data) => {
        const list = Array.isArray(data) ? data : data.sellers || [];
        setSellers(list.filter((s) => s.status !== 'pending_approval' && !isRejectedRegistration(s)));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSellers();
  }, []);

  const fillLimit = (wl = {}) =>
    setLimit({
      max: wl.maxAmount !== undefined ? String(wl.maxAmount) : '500',
      min: wl.minAmount !== undefined ? String(wl.minAmount) : '10',
      req: wl.requiredWithdrawalsForIncrease !== undefined ? String(wl.requiredWithdrawalsForIncrease) : '10',
      done: wl.successfulWithdrawalCount !== undefined ? String(wl.successfulWithdrawalCount) : '0',
      fee: wl.upgradeFee !== undefined ? String(wl.upgradeFee) : '50',
      name: wl.currentTierName || 'Tier 1 - Standard ($500 Max)',
    });

  const openCompliance = (seller, tab = 'freeze') => {
    setCompSeller(seller);
    setFreezeStatus(seller.status || 'active');
    setFreezeReason(seller.freezeReason || '');
    setWarnActive(true); // opening "Warn" means issuing one; untick to clear the current warning
    setWarnLevel(seller.warning?.level || 'warning');
    setWarnMessage(seller.warning?.message || '');
    setHealthScore(scoreOf(seller));
    setHealthReason('');
    fillLimit(seller.withdrawalLimit);
    setCompTab(tab);
    setModalError('');

    // fresh numbers for this store; a slow answer for a store that is no longer open is ignored
    const reqId = ++liveReq.current;
    api(`/sellers/${seller._id}?kyc=0`)
      .then((data) => {
        if (liveReq.current !== reqId) return;
        const live = data.seller || data;
        if (!live?._id) return;
        setCompSeller((prev) => (prev && prev._id === live._id ? { ...prev, ...live } : prev));
        fillLimit(live.withdrawalLimit);
        if (live.accountHealth?.score !== undefined) setHealthScore(live.accountHealth.score);
      })
      .catch(() => {});
  };

  const closeModal = () => {
    liveReq.current += 1;
    setCompSeller(null);
  };

  const run = async (fn) => {
    setSubmitting(true);
    setModalError('');
    try {
      await fn();
      closeModal();
      loadSellers();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const submitFreeze = (e) => {
    e.preventDefault();
    if (freezeStatus !== 'active' && !freezeReason.trim()) return setModalError('Please enter a reason for freezing or suspending this store.');
    run(() => api(`/sellers/${compSeller._id}/freeze`, { method: 'POST', body: { status: freezeStatus, reason: freezeReason.trim() } }));
  };
  const submitWarn = (e) => {
    e.preventDefault();
    if (warnActive && !warnMessage.trim()) return setModalError('Please enter the warning message.');
    run(() => api(`/sellers/${compSeller._id}/warn`, { method: 'POST', body: { active: warnActive, level: warnLevel, message: warnMessage.trim() } }));
  };
  const submitHealth = (e) => {
    e.preventDefault();
    run(() =>
      api(`/sellers/${compSeller._id}/health`, {
        method: 'POST',
        body: { score: Number(healthScore), reason: healthReason.trim() || 'Health score evaluated by Platform Compliance Desk' },
      })
    );
  };
  const submitLimit = (e) => {
    e.preventDefault();
    if (Number(limit.min) > Number(limit.max)) return setModalError('The minimum payout cannot be more than the maximum.');
    run(() =>
      api(`/sellers/${compSeller._id}/withdrawal-limit`, {
        method: 'POST',
        body: {
          maxAmount: Number(limit.max),
          minAmount: Number(limit.min),
          requiredWithdrawalsForIncrease: Number(limit.req),
          successfulWithdrawalCount: Number(limit.done),
          upgradeFee: Number(limit.fee),
          currentTierName: limit.name.trim(),
        },
      })
    );
  };

  // ── Analytics
  const a = useMemo(() => {
    const counts = { critical: 0, warned: 0, frozen: 0, suspended: 0, active: 0, healthy: 0 };
    const warnLevels = { info: 0, warning: 0, critical: 0 };
    const buckets = HEALTH_BUCKETS.map((b) => ({ ...b, count: 0 }));
    const startDay = new Date(new Date().setHours(0, 0, 0, 0)).getTime() - (range - 1) * DAY;
    const days = [];
    for (let i = 0; i < range; i++) {
      const d = new Date(startDay + i * DAY);
      days.push({ label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), penalties: 0, restored: 0 });
    }
    const reasons = new Map();
    let scoreSum = 0;
    let pointsLost = 0;
    sellers.forEach((s) => {
      const score = scoreOf(s);
      scoreSum += score;
      if (score <= 30) counts.critical += 1;
      if (score >= 80 && s.status === 'active') counts.healthy += 1;
      if (counts[s.status] !== undefined) counts[s.status] += 1;
      if (s.warning?.active) {
        counts.warned += 1;
        warnLevels[s.warning.level] = (warnLevels[s.warning.level] || 0) + 1;
      }
      const b = buckets.find((x) => score >= x.min && score <= x.max);
      if (b) b.count += 1;
      (s.accountHealth?.history || []).forEach((h) => {
        const t = new Date(h.createdAt).getTime();
        if (!(t >= startDay)) return;
        const idx = Math.floor((t - startDay) / DAY);
        const dlt = Number(h.delta) || 0;
        if (dlt < 0) {
          if (days[idx]) days[idx].penalties += 1;
          pointsLost += -dlt;
          // order numbers make every automatic penalty unique: group them as one reason
          const key = (h.reason || 'No reason given').replace(/#\s?[A-Z]{2}-[\w-]+/gi, '#…').trim().slice(0, 70);
          const r = reasons.get(key) || { key, label: key, value: 0, stores: new Set() };
          r.value += 1;
          r.stores.add(String(s._id));
          reasons.set(key, r);
        } else if (dlt > 0 && days[idx]) days[idx].restored += 1;
      });
    });
    const watch = sellers
      .filter((s) => s.status === 'active' && (scoreOf(s) <= 30 || s.warning?.level === 'critical'))
      .sort((x, y) => scoreOf(x) - scoreOf(y))
      .slice(0, 6);
    return {
      counts,
      warnLevels,
      buckets,
      days,
      watch,
      pointsLost,
      avg: sellers.length ? Math.round(scoreSum / sellers.length) : 100,
      penalties: days.reduce((acc, d) => acc + d.penalties, 0),
      restored: days.reduce((acc, d) => acc + d.restored, 0),
      reasons: [...reasons.values()].sort((x, y) => y.value - x.value).slice(0, 6).map((r) => ({ ...r, sub: `${r.stores.size} store${r.stores.size === 1 ? '' : 's'}` })),
    };
  }, [sellers, range]);

  const filtered = sellers
    .filter((s) => {
      const score = scoreOf(s);
      if (filterTab === 'critical' && score > 30) return false;
      if (filterTab === 'warned' && !s.warning?.active) return false;
      if (filterTab === 'frozen' && s.status !== 'frozen') return false;
      if (filterTab === 'suspended' && s.status !== 'suspended') return false;
      if (filterTab === 'healthy' && (s.status !== 'active' || score < 80)) return false;
      if (!q.trim()) return true;
      const needle = q.trim().toLowerCase();
      return [s.storeName, s.ownerName, s.email, s.phone].some((v) => String(v ?? '').toLowerCase().includes(needle));
    })
    .sort((x, y) => {
      if (sortBy === 'name') return (x.storeName || '').localeCompare(y.storeName || '');
      if (sortBy === 'recent') {
        const lx = new Date(x.accountHealth?.history?.[0]?.createdAt || x.frozenAt || x.warning?.issuedAt || 0).getTime();
        const ly = new Date(y.accountHealth?.history?.[0]?.createdAt || y.frozenAt || y.warning?.issuedAt || 0).getTime();
        return ly - lx;
      }
      // risk: restricted first, then lowest health, then warnings
      const rank = (s) => (s.status === 'suspended' ? 0 : s.status === 'frozen' ? 1 : 2);
      return rank(x) - rank(y) || scoreOf(x) - scoreOf(y) || Number(Boolean(y.warning?.active)) - Number(Boolean(x.warning?.active));
    });

  const lastAction = (s) => {
    const h = s.accountHealth?.history?.[0];
    if (!h) return <span className="ins-sub">No changes yet</span>;
    const dlt = Number(h.delta) || 0;
    return (
      <>
        <span className="ins-strong" style={{ color: dlt < 0 ? '#a72929' : dlt > 0 ? '#006300' : undefined }}>
          {dlt > 0 ? '+' : ''}{dlt} pts
        </span>
        <span className="ins-sub ins-clip" title={h.reason}>{h.reason}</span>
        <span className="ins-sub">{fmtDate(h.createdAt)}</span>
      </>
    );
  };

  const healthCell = (s) => {
    const score = scoreOf(s);
    const tier = healthTier(score);
    return (
      <button type="button" onClick={() => openCompliance(s, 'health')} title="Adjust health score" style={{ all: 'unset', cursor: 'pointer', display: 'block', minWidth: 170 }}>
        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
          <b style={{ fontSize: 15, color: '#0f172a' }}>{score}<span className="ins-sub" style={{ display: 'inline' }}>/100</span></b>
          <Badge tone={tier.tone}>{tier.label}</Badge>
        </span>
        <Meter value={score} color={tier.color} height={6} label={`Health ${score} of 100`} />
      </button>
    );
  };

  const accessCell = (s) => {
    const m = ACCESS_META[s.status] || ACCESS_META.active;
    return (
      <>
        <Badge tone={m.tone} icon={m.icon}>{m.label}</Badge>
        {s.status !== 'active' && s.freezeReason && <span className="ins-sub ins-clip" title={s.freezeReason} style={{ marginTop: 4 }}>{s.freezeReason}</span>}
      </>
    );
  };

  const warnCell = (s) =>
    s.warning?.active ? (
      <>
        <Badge tone={s.warning.level === 'critical' ? 'critical' : s.warning.level === 'info' ? 'info' : 'warning'} icon="⚠">
          {s.warning.level || 'warning'}
        </Badge>
        <span className="ins-sub ins-clip" title={s.warning.message} style={{ marginTop: 4 }}>{s.warning.message}</span>
      </>
    ) : (
      <span className="ins-sub">None</span>
    );

  // one button per row: the dialog has a tab for access, warning, health and limits
  const actionButtons = (s) => {
    const score = scoreOf(s);
    const tab = s.status !== 'active' ? 'freeze' : score <= 30 ? 'freeze' : s.warning?.active ? 'warn' : 'health';
    return (
      <button type="button" className={`ins-btn ins-btn-sm${score <= 30 && s.status === 'active' ? ' ins-btn-bad' : ''}`} onClick={() => openCompliance(s, tab)}>
        <Ic name="shield" size={12} /> Manage
      </button>
    );
  };

  const hTier = healthTier(Number(healthScore) || 0);

  return (
    <div className="ins-page">
      <Hero
        icon="shield"
        tone="red"
        title="Complaints & Compliance"
        subtitle="Watch store health, issue warnings, freeze or suspend stores and set withdrawal limits. Every action is sent to the seller in chat and as a notification."
        actions={
          <>
            <Link to="/admin/chat" className="ins-btn">
              <Ic name="chat" size={14} /> Support desk
            </Link>
            <button type="button" className="ins-btn" onClick={loadSellers} disabled={loading}>
              <Ic name="refresh" size={14} /> {loading ? 'Loading…' : 'Refresh'}
            </button>
          </>
        }
      >
        <MetaChip>{sellers.length} stores monitored</MetaChip>
        <MetaChip>Average health {a.avg}/100</MetaChip>
        {a.penalties > 0 && <MetaChip>{a.penalties} penalties in {range} days</MetaChip>}
      </Hero>

      <ErrorBox error={error} />

      <KpiGrid dim={loading && sellers.length > 0}>
        <Kpi icon="alert" tone="red" label="Critical (≤ 30)" value={a.counts.critical} sub="In the freeze or suspension zone" onClick={() => setFilterTab('critical')} active={filterTab === 'critical'} />
        <Kpi icon="bell" tone="yellow" label="Active warnings" value={a.counts.warned} sub={`${a.warnLevels.critical || 0} critical · ${a.warnLevels.warning || 0} standard`} onClick={() => setFilterTab('warned')} active={filterTab === 'warned'} />
        <Kpi icon="lock" tone="blue" label="Frozen" value={a.counts.frozen} sub="Cannot withdraw" onClick={() => setFilterTab('frozen')} active={filterTab === 'frozen'} />
        <Kpi icon="x" tone="slate" label="Suspended" value={a.counts.suspended} sub="Store closed" onClick={() => setFilterTab('suspended')} active={filterTab === 'suspended'} />
        <Kpi icon="checkCircle" tone="green" label="Healthy (80+)" value={a.counts.healthy} sub={`${sellers.length ? Math.round((a.counts.healthy / sellers.length) * 100) : 0}% of stores`} onClick={() => setFilterTab('healthy')} active={filterTab === 'healthy'} />
      </KpiGrid>

      {sellers.length > 0 && (
        <ChartGrid dim={loading}>
          <Card
            title="Health actions over time"
            hint={`${a.penalties} penalties (${a.pointsLost} points) · ${a.restored} restorations`}
            wide
            actions={<Seg small label="Time range" value={range} onChange={setRange} options={[{ value: 14, label: '14d' }, { value: 30, label: '30d' }, { value: 90, label: '90d' }]} />}
          >
            {a.penalties + a.restored === 0 ? (
              <Empty icon="🛡️" text={`No health changes in the last ${range} days`} />
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={a.days} margin={{ top: 6, right: 8, left: -18, bottom: 0 }} barGap={2}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" {...AXIS} minTickGap={16} />
                  <YAxis {...AXIS} allowDecimals={false} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTip />} />
                  <Legend iconType="square" formatter={legendText} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="penalties" name="Penalties" fill={STATUS.critical} radius={[4, 4, 0, 0]} maxBarSize={14} />
                  <Bar dataKey="restored" name="Restored" fill={STATUS.good} radius={[4, 4, 0, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card title="Store access" hint={`${sellers.length} approved stores`}>
            <SplitBar
              height={14}
              parts={[
                { label: '● Active', value: a.counts.active, color: STATUS.good },
                { label: '❄ Frozen', value: a.counts.frozen, color: '#2a78d6' },
                { label: '⛔ Suspended', value: a.counts.suspended, color: STATUS.critical },
              ]}
            />
          </Card>

          <Card title="Health score spread" hint="How many stores sit in each score band">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={a.buckets} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" {...AXIS} />
                <YAxis {...AXIS} allowDecimals={false} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTip labelFmt={(l) => `Score ${l}`} />} />
                <Bar dataKey="count" name="Stores" radius={[4, 4, 0, 0]} maxBarSize={36}>
                  {a.buckets.map((b) => (
                    <Cell key={b.label} fill={b.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Most common penalty reasons" hint={`Last ${range} days`}>
            <RankList rows={a.reasons} color={STATUS.critical} format={(v) => `${v}×`} empty="No penalties in this period" />
          </Card>

          <Card title="Needs attention" hint="Active stores in the danger zone">
            {a.watch.length === 0 ? (
              <Empty icon="✅" text="No active store is in the danger zone" />
            ) : (
              <ul className="ins-attn">
                {a.watch.map((s) => {
                  const score = scoreOf(s);
                  const tier = healthTier(score);
                  return (
                    <li key={s._id}>
                      <button type="button" onClick={() => openCompliance(s, score <= 30 ? 'freeze' : 'warn')}>
                        <span className="ins-attn-icon" style={{ background: `${tier.color}22`, color: tier.color }}>{score <= 20 ? '⛔' : score <= 30 ? '❄' : '⚠'}</span>
                        <span className="ins-attn-text">
                          <b>{s.storeName}</b>
                          <span>{tier.label}{s.warning?.active ? ` · ${s.warning.level} warning` : ''}</span>
                        </span>
                        <span className="ins-attn-count">{score}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </ChartGrid>
      )}

      <div className="ins-table-card">
        <div className="ins-table-head">
          <div>
            <h3>🛡️ Store compliance</h3>
            <span className="ins-card-hint">{filtered.length} shown</span>
          </div>
          <Toolbar>
            <Seg
              label="Filter"
              value={filterTab}
              onChange={setFilterTab}
              options={[
                { value: 'all', label: 'All', count: sellers.length },
                { value: 'critical', label: 'Critical', count: a.counts.critical },
                { value: 'warned', label: 'Warned', count: a.counts.warned },
                { value: 'frozen', label: 'Frozen', count: a.counts.frozen },
                { value: 'suspended', label: 'Suspended', count: a.counts.suspended },
                { value: 'healthy', label: 'Healthy', count: a.counts.healthy },
              ]}
            />
            <select className="ins-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort">
              <option value="risk">Highest risk first</option>
              <option value="recent">Latest action first</option>
              <option value="name">Store name A–Z</option>
            </select>
            <SearchBox value={q} onChange={setQ} placeholder="Search store, owner, email…" />
          </Toolbar>
        </div>

        <div className="ins-table-scroll ins-hide-mobile">
          <table className="ins-table">
            <thead>
              <tr>
                <th>Store</th>
                <th>Health</th>
                <th>Access</th>
                <th>Warning</th>
                <th>Last health change</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && sellers.length === 0 &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j}><span className="ins-skel" style={{ width: `${45 + ((i + j) % 4) * 13}%` }} /></td>
                    ))}
                  </tr>
                ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <Empty icon="🔍" text="No store matches this filter." />
                  </td>
                </tr>
              )}
              {filtered.map((s) => (
                <tr key={s._id}>
                  <td>
                    <div className="ins-cell-who">
                      <Avatar name={s.storeName} />
                      <div>
                        <b className="ins-clip">{s.storeName || 'Store'}</b>
                        <span className="ins-sub ins-clip">{s.ownerName} · {s.email}</span>
                        <span className="ins-sub" title={s.withdrawalLimit?.currentTierName || 'Tier 1 - Standard'}>
                          Withdrawal limit ${Number(s.withdrawalLimit?.maxAmount ?? 500).toLocaleString('en-US')}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>{healthCell(s)}</td>
                  <td>{accessCell(s)}</td>
                  <td style={{ maxWidth: 220 }}>{warnCell(s)}</td>
                  <td style={{ maxWidth: 220 }}>{lastAction(s)}</td>
                  <td>
                    <div className="ins-actions">{actionButtons(s)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ins-cards">
          {filtered.map((s) => (
            <div className="ins-mcard" key={s._id}>
              <div className="ins-cell-who">
                <Avatar name={s.storeName} size={30} />
                <div style={{ flex: 1 }}>
                  <b>{s.storeName}</b>
                  <span className="ins-sub">{s.ownerName}</span>
                </div>
                {accessCell(s)}
              </div>
              {healthCell(s)}
              {s.warning?.active && <div>{warnCell(s)}</div>}
              <div className="ins-actions" style={{ justifyContent: 'flex-start' }}>{actionButtons(s)}</div>
            </div>
          ))}
          {!loading && filtered.length === 0 && <Empty text="No store matches this filter." />}
        </div>
      </div>

      {compSeller && (
        <div className="admin-modal-overlay" onClick={() => !submitting && closeModal()}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="ins-modal-head">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Avatar name={compSeller.storeName} size={38} />
                <div>
                  <h3>{compSeller.storeName}</h3>
                  <p>
                    {compSeller.ownerName} · health {scoreOf(compSeller)}/100 · {(ACCESS_META[compSeller.status] || ACCESS_META.active).label}
                  </p>
                </div>
              </div>
              <button type="button" className="ins-modal-close" onClick={closeModal} aria-label="Close">✕</button>
            </div>

            <div className="ins-tabs" role="tablist">
              {[
                ['freeze', '❄️ Access'],
                ['warn', '⚠️ Warning'],
                ['health', '🛡️ Health'],
                ['limits', '💳 Limits'],
              ].map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={compTab === k} className={compTab === k ? 'on' : ''} onClick={() => { setCompTab(k); setModalError(''); }}>
                  {label}
                </button>
              ))}
            </div>

            {compTab === 'freeze' && (
              <form className="ins-form" onSubmit={submitFreeze}>
                <div className="ins-field">
                  <span className="ins-label">Store access</span>
                  <Seg
                    label="Store access"
                    value={freezeStatus}
                    onChange={setFreezeStatus}
                    options={[
                      { value: 'active', label: '● Active' },
                      { value: 'frozen', label: '❄ Frozen' },
                      { value: 'suspended', label: '⛔ Suspended' },
                    ]}
                  />
                  <small>
                    {freezeStatus === 'active'
                      ? 'Full access: the store can sell and withdraw.'
                      : freezeStatus === 'frozen'
                      ? 'The store stays visible but withdrawals are blocked.'
                      : 'The store is closed until you restore it.'}
                  </small>
                </div>
                <div className="ins-field">
                  <label>Reason {freezeStatus !== 'active' ? '*' : '(optional)'}</label>
                  <textarea className="ins-input" rows={3} value={freezeReason} onChange={(e) => setFreezeReason(e.target.value)} placeholder="e.g. Repeated unfulfilled orders and counterfeit complaints." required={freezeStatus !== 'active'} />
                  <small>Shown to the seller in the portal header and in chat.</small>
                </div>
                {modalError && <ErrorBox error={modalError} />}
                <div className="ins-modal-foot">
                  <button type="button" className="ins-btn" onClick={closeModal} disabled={submitting}>Cancel</button>
                  <button type="submit" className={`ins-btn ${freezeStatus === 'active' ? 'ins-btn-primary' : 'ins-btn-bad'}`} disabled={submitting}>
                    {submitting ? 'Saving…' : freezeStatus === 'active' ? 'Restore full access' : `Set store to ${freezeStatus}`}
                  </button>
                </div>
              </form>
            )}

            {compTab === 'warn' && (
              <form className="ins-form" onSubmit={submitWarn}>
                <div className="ins-switch-row">
                  <div>
                    <b>Show a warning bar on the seller portal</b>
                    <small>{warnActive ? 'The seller sees it at the top of every page' : 'Turn off to clear the current warning'}</small>
                  </div>
                  <input type="checkbox" checked={warnActive} onChange={(e) => setWarnActive(e.target.checked)} style={{ width: 20, height: 20, cursor: 'pointer' }} />
                </div>
                {warnActive && (
                  <>
                    <div className="ins-field">
                      <span className="ins-label">Severity</span>
                      <Seg
                        label="Severity"
                        value={warnLevel}
                        onChange={setWarnLevel}
                        options={[
                          { value: 'info', label: 'ℹ️ Notice' },
                          { value: 'warning', label: '⚠️ Warning' },
                          { value: 'critical', label: '🚨 Critical' },
                        ]}
                      />
                    </div>
                    <div className="ins-field">
                      <label>Message *</label>
                      <textarea className="ins-input" rows={3} value={warnMessage} onChange={(e) => setWarnMessage(e.target.value)} maxLength={1000} placeholder="e.g. Warning 1/3: high cancellation rate. Ship all pending orders within 24 hours to avoid suspension." required />
                    </div>
                  </>
                )}
                {modalError && <ErrorBox error={modalError} />}
                <div className="ins-modal-foot">
                  <button type="button" className="ins-btn" onClick={closeModal} disabled={submitting}>Cancel</button>
                  <button type="submit" className={`ins-btn ${warnActive ? 'ins-btn-primary' : 'ins-btn-good'}`} disabled={submitting}>
                    {submitting ? 'Saving…' : warnActive ? 'Send warning' : 'Clear warning'}
                  </button>
                </div>
              </form>
            )}

            {compTab === 'health' && (
              <form className="ins-form" onSubmit={submitHealth}>
                <div className="ins-switch-row">
                  <div>
                    <b>Now {scoreOf(compSeller)}/100 → new {healthScore}/100</b>
                    <small>
                      {Number(healthScore) - scoreOf(compSeller) === 0
                        ? 'No change'
                        : `${Number(healthScore) - scoreOf(compSeller) > 0 ? '+' : ''}${Number(healthScore) - scoreOf(compSeller)} points`}
                    </small>
                  </div>
                  <Badge tone={hTier.tone}>{hTier.label}</Badge>
                </div>
                <div className="ins-field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label>New score (0–100) *</label>
                    <input
                      className="ins-input"
                      type="number"
                      min="0"
                      max="100"
                      value={healthScore}
                      onChange={(e) => setHealthScore(e.target.value === '' ? '' : Math.max(0, Math.min(100, Math.round(Number(e.target.value)))))}
                      style={{ width: 80, textAlign: 'center', fontWeight: 800 }}
                      required
                    />
                  </div>
                  <input type="range" min="0" max="100" value={Number(healthScore) || 0} onChange={(e) => setHealthScore(Number(e.target.value))} style={{ width: '100%', accentColor: hTier.color }} />
                  <small>0–20 suspension zone · 21–30 freeze zone · 31–79 watch · 80–100 healthy</small>
                </div>
                <div className="ins-field">
                  <span className="ins-label">Quick reasons</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {HEALTH_PRESETS.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        className="ins-btn ins-btn-sm"
                        onClick={() => {
                          const base = scoreOf(compSeller);
                          setHealthScore(p.set !== undefined ? p.set : Math.max(0, Math.min(100, base + p.delta)));
                          setHealthReason(p.reason);
                        }}
                      >
                        {p.label}{p.delta ? ` (${p.delta > 0 ? '+' : ''}${p.delta})` : ''}
                      </button>
                    ))}
                  </div>
                  <small>Presets are counted from the current score, so clicking twice does not deduct twice.</small>
                </div>
                <div className="ins-field">
                  <label>Reason *</label>
                  <textarea className="ins-input" rows={2} value={healthReason} onChange={(e) => setHealthReason(e.target.value)} placeholder="Why the score changes…" required />
                </div>
                {compSeller.accountHealth?.history?.length > 0 && (
                  <div className="ins-field">
                    <span className="ins-label">Recent changes</span>
                    <ul className="ins-stats">
                      {compSeller.accountHealth.history.slice(0, 4).map((h, i) => (
                        <li key={h._id || i}>
                          <span className="ins-clip" style={{ maxWidth: 300 }} title={h.reason}>{fmtDate(h.createdAt)} · {h.reason}</span>
                          <b style={{ color: h.delta < 0 ? '#a72929' : '#006300' }}>{h.delta > 0 ? '+' : ''}{h.delta}</b>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {modalError && <ErrorBox error={modalError} />}
                <div className="ins-modal-foot">
                  <button type="button" className="ins-btn" onClick={closeModal} disabled={submitting}>Cancel</button>
                  <button type="submit" className="ins-btn ins-btn-primary" disabled={submitting || healthScore === ''}>
                    {submitting ? 'Saving…' : `Save health (${healthScore}/100)`}
                  </button>
                </div>
              </form>
            )}

            {compTab === 'limits' && (
              <form className="ins-form" onSubmit={submitLimit}>
                <div className="ins-field">
                  <span className="ins-label">Tier presets</span>
                  <Seg
                    small
                    label="Tier presets"
                    value={limit.max}
                    onChange={(v) => {
                      const t = TIERS.find((x) => x.max === v);
                      if (t) setLimit((p) => ({ ...p, max: t.max, min: '10', req: t.req, done: '0', fee: t.fee, name: t.name }));
                    }}
                    options={TIERS.map((t) => ({ value: t.max, label: t.label }))}
                  />
                </div>
                <div className="ins-form-grid">
                  <div className="ins-field">
                    <label>Max per withdrawal (USD) *</label>
                    <input className="ins-input" type="number" min="1" value={limit.max} onChange={(e) => setLimit((p) => ({ ...p, max: e.target.value, name: TIERS.find((t) => t.max === e.target.value)?.name || p.name }))} required />
                  </div>
                  <div className="ins-field">
                    <label>Minimum payout (USD) *</label>
                    <input className="ins-input" type="number" min="1" value={limit.min} onChange={(e) => setLimit((p) => ({ ...p, min: e.target.value }))} required />
                  </div>
                  <div className="ins-field">
                    <label>Withdrawals needed for next tier *</label>
                    <input className="ins-input" type="number" min="1" value={limit.req} onChange={(e) => setLimit((p) => ({ ...p, req: e.target.value }))} required />
                  </div>
                  <div className="ins-field">
                    <label>Completed in this tier</label>
                    <input className="ins-input" type="number" min="0" value={limit.done} onChange={(e) => setLimit((p) => ({ ...p, done: e.target.value }))} />
                  </div>
                  <div className="ins-field">
                    <label>Upgrade fee (USD)</label>
                    <input className="ins-input" type="number" min="0" value={limit.fee} onChange={(e) => setLimit((p) => ({ ...p, fee: e.target.value }))} />
                  </div>
                  <div className="ins-field">
                    <label>Tier name</label>
                    <input className="ins-input" value={limit.name} onChange={(e) => setLimit((p) => ({ ...p, name: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5, color: '#475569' }}>
                    <span>Progress to next tier</span>
                    <b>{Number(limit.done) || 0}/{Number(limit.req) || 0}</b>
                  </div>
                  <Meter value={Number(limit.done) || 0} max={Number(limit.req) || 1} color="#2a78d6" />
                </div>
                {modalError && <ErrorBox error={modalError} />}
                <div className="ins-modal-foot">
                  <button type="button" className="ins-btn" onClick={closeModal} disabled={submitting}>Cancel</button>
                  <button type="submit" className="ins-btn ins-btn-primary" disabled={submitting}>
                    {submitting ? 'Saving…' : 'Save limits'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
