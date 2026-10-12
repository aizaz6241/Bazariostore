import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, Cell } from 'recharts';
import { api, money, fmtDate } from '../api.js';
import { ErrorBox } from './ui.jsx';
import Ic from '../components/Icons.jsx';
import {
  Hero, MetaChip, Kpi, KpiGrid, Card, ChartGrid, Seg, Meter, Badge, Avatar, RankList, SplitBar, ChartTip,
  Toolbar, SearchBox, Empty, SERIES, STATUS, GRID, AXIS, legendText, pctOf,
} from './insights.jsx';

const DAY = 86400000;
const PRESETS = [
  { orders: 10, bonus: 50, days: 30 },
  { orders: 25, bonus: 150, days: 45 },
  { orders: 50, bonus: 350, days: 60 },
  { orders: 100, bonus: 800, days: 90 },
];
// one hue, lighter → darker as a target gets closer to done
const PROGRESS_STEPS = ['#9ec5f4', '#6da7ec', '#3987e5', '#1c5cab'];

const blankForm = () => ({ sellerId: '', title: 'Deliver 10 orders', targetOrderCount: 10, bonusAmount: 50, durationDays: 30, description: '', descTouched: false });
const autoDescription = (f) =>
  `Deliver ${f.targetOrderCount || 0} orders${f.durationDays ? ` within ${f.durationDays} days` : ''} to receive a ${money(Number(f.bonusAmount) || 0)} cash bonus, credited straight to your wallet.`;

// one state for a target, used everywhere on the page
function stateOf(t) {
  if (t.status === 'completed' || t.status === 'claimed') return 'completed';
  if (t.status === 'expired') return 'expired';
  if (t.expiresAt && new Date(t.expiresAt).getTime() < Date.now()) return 'expired';
  return 'active';
}
const STATE_META = {
  active: { label: 'In progress', tone: 'info', icon: '⚡' },
  completed: { label: 'Completed', tone: 'good', icon: '🏆' },
  expired: { label: 'Expired', tone: 'neutral', icon: '⌛' },
};

function daysLeft(t) {
  if (!t.expiresAt) return null;
  return Math.ceil((new Date(t.expiresAt).getTime() - Date.now()) / DAY);
}

// Monday-start week buckets, oldest → newest
function weekBuckets(n) {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(monday.getTime() - i * 7 * DAY);
    out.push({ start: start.getTime(), end: start.getTime() + 7 * DAY, label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), assigned: 0, completed: 0, bonus: 0 });
  }
  return out;
}

export default function Targets() {
  const [allTargets, setAllTargets] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [q, setQ] = useState('');
  const [deleting, setDeleting] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [sellerQ, setSellerQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const loadData = () => {
    setLoading(true);
    setError('');
    Promise.all([api('/sellers/targets/all'), api('/sellers').catch(() => [])])
      .then(([tgtRes, sellersRes]) => {
        setAllTargets(Array.isArray(tgtRes?.targets) ? tgtRes.targets : Array.isArray(tgtRes) ? tgtRes : []);
        const sList = Array.isArray(sellersRes) ? sellersRes : sellersRes?.sellers || [];
        // only approved, active stores can work towards a target
        setSellers(sList.filter((s) => s.status === 'active').sort((a, b) => (a.storeName || '').localeCompare(b.storeName || '')));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const setF = (patch) =>
    setForm((prev) => {
      const next = { ...prev, ...patch };
      if (!next.descTouched) next.description = autoDescription(next);
      return next;
    });

  const openModal = (sellerId = '') => {
    const f = { ...blankForm(), sellerId };
    f.description = autoDescription(f);
    setForm(f);
    setSellerQ('');
    setFormError('');
    setModalOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.sellerId) return setFormError('Please choose a store.');
    if (!(Number(form.targetOrderCount) >= 1)) return setFormError('Target orders must be at least 1.');
    if (!(Number(form.bonusAmount) > 0)) return setFormError('Bonus must be more than $0.');
    setSaving(true);
    try {
      await api(`/sellers/${form.sellerId}/targets`, {
        method: 'POST',
        body: {
          title: form.title.trim(),
          targetOrders: Number(form.targetOrderCount),
          bonusAmount: Number(form.bonusAmount),
          durationDays: form.durationDays ? Number(form.durationDays) : null,
          description: form.description.trim(),
        },
      });
      setModalOpen(false);
      loadData();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t) => {
    const s = stateOf(t);
    const warn =
      s === 'completed'
        ? `Remove the completed target "${t.title}" from ${t.storeName}? The bonus that was already paid stays in the wallet.`
        : `Remove "${t.title}" from ${t.storeName}? The seller loses the progress (${t.currentOrders}/${t.targetOrders}) and will not get the bonus.`;
    if (!window.confirm(warn)) return;
    setDeleting(t._id);
    try {
      await api(`/sellers/${t.sellerId}/targets/${t._id}`, { method: 'DELETE' });
      setAllTargets((prev) => prev.filter((x) => x._id !== t._id));
    } catch (err) {
      alert('Could not remove the target: ' + err.message);
    } finally {
      setDeleting('');
    }
  };

  // ── Analytics
  const stats = useMemo(() => {
    const out = { active: 0, completed: 0, expired: 0, bonusPaid: 0, bonusOpen: 0, progressSum: 0, expiringSoon: 0, merchants: new Set() };
    const progress = [
      { label: '0–24%', count: 0 },
      { label: '25–49%', count: 0 },
      { label: '50–74%', count: 0 },
      { label: '75–99%', count: 0 },
    ];
    const weeks = weekBuckets(12);
    const earners = new Map();
    allTargets.forEach((t) => {
      const s = stateOf(t);
      out[s] += 1;
      out.merchants.add(String(t.sellerId));
      const pct = Math.min(100, ((t.currentOrders || 0) / (t.targetOrders || 1)) * 100);
      if (s === 'active') {
        out.bonusOpen += t.bonusAmount || 0;
        out.progressSum += pct;
        progress[Math.min(3, Math.floor(pct / 25))].count += 1;
        const dl = daysLeft(t);
        if (dl !== null && dl <= 7) out.expiringSoon += 1;
      }
      if (s === 'completed') {
        out.bonusPaid += t.bonusAmount || 0;
        const e = earners.get(String(t.sellerId)) || { key: String(t.sellerId), label: t.storeName || 'Store', value: 0, n: 0 };
        e.value += t.bonusAmount || 0;
        e.n += 1;
        earners.set(e.key, e);
      }
      const created = new Date(t.createdAt).getTime();
      const wkA = weeks.find((w) => created >= w.start && created < w.end);
      if (wkA) wkA.assigned += 1;
      if (s === 'completed' && t.completedAt) {
        const done = new Date(t.completedAt).getTime();
        const wkC = weeks.find((w) => done >= w.start && done < w.end);
        if (wkC) {
          wkC.completed += 1;
          wkC.bonus += t.bonusAmount || 0;
        }
      }
    });
    const closed = out.completed + out.expired;
    return {
      ...out,
      merchants: out.merchants.size,
      avgProgress: out.active ? Math.round(out.progressSum / out.active) : 0,
      successRate: closed ? pctOf(out.completed, closed) : null,
      progress,
      weeks,
      earners: [...earners.values()].sort((a, b) => b.value - a.value).slice(0, 6).map((e) => ({ ...e, sub: `${e.n} target${e.n === 1 ? '' : 's'} completed` })),
      closest: allTargets
        .filter((t) => stateOf(t) === 'active')
        .map((t) => ({ t, pct: Math.min(100, Math.round(((t.currentOrders || 0) / (t.targetOrders || 1)) * 100)) }))
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 5),
    };
  }, [allTargets]);

  const filtered = allTargets.filter((t) => {
    const s = stateOf(t);
    if (filterStatus !== 'all' && s !== filterStatus) return false;
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    return [t.storeName, t.ownerName, t.title, t.email].some((v) => String(v || '').toLowerCase().includes(needle));
  });

  const sellerOptions = sellers.filter((s) => {
    if (!sellerQ.trim()) return true;
    const needle = sellerQ.trim().toLowerCase();
    return [s.storeName, s.ownerName, s.email].some((v) => String(v || '').toLowerCase().includes(needle));
  });
  const chosenSeller = sellers.find((s) => s._id === form.sellerId);
  const chosenActive = chosenSeller ? allTargets.filter((t) => String(t.sellerId) === chosenSeller._id && stateOf(t) === 'active').length : 0;
  const hasWeeks = stats.weeks.some((w) => w.assigned || w.completed);

  return (
    <div className="ins-page">
      <Hero
        icon="sparkle"
        tone="amber"
        title="Targets & Bonuses"
        subtitle="Give stores a delivery goal and a cash reward. Progress counts delivered orders only, and the bonus is paid into the seller's wallet automatically the moment the goal is reached."
        actions={
          <>
            <button type="button" className="ins-btn" onClick={loadData} disabled={loading}>
              <Ic name="refresh" size={14} /> {loading ? 'Loading…' : 'Refresh'}
            </button>
            <button type="button" className="ins-btn ins-btn-primary" onClick={() => openModal()}>
              <Ic name="plus" size={15} /> New target
            </button>
          </>
        }
      >
        <MetaChip>{allTargets.length} targets</MetaChip>
        <MetaChip>{stats.merchants} stores enrolled</MetaChip>
        {stats.expiringSoon > 0 && <MetaChip>⌛ {stats.expiringSoon} ending within 7 days</MetaChip>}
      </Hero>

      <ErrorBox error={error} />

      <KpiGrid dim={loading && allTargets.length > 0}>
        <Kpi icon="refresh" tone="blue" label="In progress" value={stats.active} sub={`Average progress ${stats.avgProgress}%`} onClick={() => setFilterStatus('active')} active={filterStatus === 'active'} />
        <Kpi icon="checkCircle" tone="green" label="Completed" value={stats.completed} sub={stats.successRate === null ? 'None closed yet' : `${stats.successRate}% of closed targets were reached`} onClick={() => setFilterStatus('completed')} active={filterStatus === 'completed'} />
        <Kpi icon="banknote" tone="aqua" label="Bonus paid out" value={money(stats.bonusPaid)} sub="Credited to seller wallets" />
        <Kpi icon="wallet" tone="orange" label="Bonus still on offer" value={money(stats.bonusOpen)} sub="Due if every open target is reached" />
        <Kpi icon="clock" tone="slate" label="Expired" value={stats.expired} sub="Deadline passed before the goal" onClick={() => setFilterStatus('expired')} active={filterStatus === 'expired'} />
      </KpiGrid>

      {allTargets.length > 0 && (
        <ChartGrid dim={loading}>
          <Card title="Targets over the last 12 weeks" hint="Assigned vs completed, per week" wide empty={!hasWeeks && 'No targets assigned or completed in the last 12 weeks'}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={stats.weeks} margin={{ top: 6, right: 8, left: -18, bottom: 0 }} barGap={2}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" {...AXIS} minTickGap={12} />
                <YAxis {...AXIS} allowDecimals={false} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTip labelFmt={(l) => `Week of ${l}`} />} />
                <Legend iconType="square" formatter={legendText} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="assigned" name="Assigned" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={16} />
                <Bar dataKey="completed" name="Completed" fill={SERIES[2]} radius={[4, 4, 0, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Where targets stand" hint={`${allTargets.length} targets in total`}>
            <SplitBar
              height={14}
              parts={[
                { label: '⚡ In progress', value: stats.active, color: SERIES[0] },
                { label: '🏆 Completed', value: stats.completed, color: STATUS.good },
                { label: '⌛ Expired', value: stats.expired, color: STATUS.neutral },
              ]}
            />
          </Card>

          <Card title="How far open targets are" hint="Progress of every target still running" empty={!stats.active && 'No target in progress'}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats.progress} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" {...AXIS} />
                <YAxis {...AXIS} allowDecimals={false} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTip />} />
                <Bar dataKey="count" name="Targets" radius={[4, 4, 0, 0]} maxBarSize={38}>
                  {stats.progress.map((p, i) => (
                    <Cell key={p.label} fill={PROGRESS_STEPS[i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Closest to the finish line" hint="Worth a nudge in the seller chat">
            {stats.closest.length === 0 ? (
              <Empty text="No target in progress" />
            ) : (
              <ul className="ins-stats">
                {stats.closest.map(({ t, pct }) => (
                  <li key={t._id}>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span className="ins-strong ins-clip" style={{ display: 'block' }}>{t.storeName}</span>
                      <span className="ins-sub">
                        {t.currentOrders}/{t.targetOrders} · {money(t.bonusAmount)}
                      </span>
                      <Meter value={pct} color={PROGRESS_STEPS[Math.min(3, Math.floor(pct / 25))]} height={5} label={`${pct}% done`} />
                    </span>
                    <b>{pct}%</b>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Top bonus earners">
            <RankList rows={stats.earners} color={STATUS.good} empty="No bonus paid yet" />
          </Card>
        </ChartGrid>
      )}

      <div className="ins-table-card">
        <div className="ins-table-head">
          <div>
            <h3>🎯 All targets</h3>
            <span className="ins-card-hint">{filtered.length} shown · newest first</span>
          </div>
          <Toolbar>
            <Seg
              label="Filter by status"
              value={filterStatus}
              onChange={setFilterStatus}
              options={[
                { value: 'all', label: 'All', count: allTargets.length },
                { value: 'active', label: 'In progress', count: stats.active },
                { value: 'completed', label: 'Completed', count: stats.completed },
                { value: 'expired', label: 'Expired', count: stats.expired },
              ]}
            />
            <SearchBox value={q} onChange={setQ} placeholder="Search store, owner or title…" />
          </Toolbar>
        </div>

        <div className="ins-table-scroll ins-hide-mobile">
          <table className="ins-table">
            <thead>
              <tr>
                <th>Store</th>
                <th>Target</th>
                <th style={{ minWidth: 180 }}>Progress</th>
                <th className="num">Bonus</th>
                <th>Status</th>
                <th>Timeline</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && allTargets.length === 0 &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j}><span className="ins-skel" style={{ width: `${50 + ((i + j) % 4) * 12}%` }} /></td>
                    ))}
                  </tr>
                ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <Empty icon="🎯" text={allTargets.length ? 'No target matches this filter.' : 'No targets yet. Create the first one to motivate your stores.'}>
                      {!allTargets.length && (
                        <button type="button" className="ins-btn ins-btn-primary ins-btn-sm" onClick={() => openModal()}>
                          <Ic name="plus" size={13} /> New target
                        </button>
                      )}
                    </Empty>
                  </td>
                </tr>
              )}
              {filtered.map((t) => {
                const s = stateOf(t);
                const meta = STATE_META[s];
                const pct = Math.min(100, Math.round(((t.currentOrders || 0) / (t.targetOrders || 1)) * 100));
                const dl = daysLeft(t);
                return (
                  <tr key={t._id}>
                    <td>
                      <div className="ins-cell-who">
                        <Avatar name={t.storeName} />
                        <div>
                          <b className="ins-clip">{t.storeName || 'Store'}</b>
                          <span className="ins-sub">{t.ownerName || '—'}{t.isTestAccount ? ' · test' : ''}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="ins-strong">{t.title}</span>
                      {t.description && <span className="ins-sub ins-clip" title={t.description}>{t.description}</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                        <span>
                          <b>{t.currentOrders || 0}</b> / {t.targetOrders} delivered
                        </span>
                        <b>{pct}%</b>
                      </div>
                      <Meter value={pct} color={s === 'completed' ? STATUS.good : s === 'expired' ? STATUS.neutral : SERIES[0]} label={`${pct}% done`} />
                    </td>
                    <td className="num">
                      <b style={{ color: s === 'completed' ? '#006300' : '#0f172a' }}>{money(t.bonusAmount || 0)}</b>
                    </td>
                    <td>
                      <Badge tone={meta.tone} icon={meta.icon}>{meta.label}</Badge>
                    </td>
                    <td>
                      <span className="ins-sub">Set {fmtDate(t.createdAt)}</span>
                      <span className="ins-sub">
                        {s === 'completed' && t.completedAt
                          ? `Reached ${fmtDate(t.completedAt)}`
                          : !t.expiresAt
                          ? 'No deadline'
                          : s === 'expired'
                          ? `Ended ${fmtDate(t.expiresAt)}`
                          : dl <= 0
                          ? 'Ends today'
                          : <span style={{ color: dl <= 7 ? '#a5461f' : undefined, fontWeight: dl <= 7 ? 700 : 400 }}>{dl} day{dl === 1 ? '' : 's'} left</span>}
                      </span>
                    </td>
                    <td>
                      <div className="ins-actions">
                        <button type="button" className="ins-btn ins-btn-sm ins-btn-bad" onClick={() => remove(t)} disabled={deleting === t._id} title="Remove this target">
                          {deleting === t._id ? 'Removing…' : 'Remove'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="ins-cards">
          {filtered.map((t) => {
            const s = stateOf(t);
            const meta = STATE_META[s];
            const pct = Math.min(100, Math.round(((t.currentOrders || 0) / (t.targetOrders || 1)) * 100));
            return (
              <div className="ins-mcard" key={t._id}>
                <div className="ins-cell-who">
                  <Avatar name={t.storeName} size={30} />
                  <div style={{ flex: 1 }}>
                    <b>{t.storeName}</b>
                    <span className="ins-sub">{t.title}</span>
                  </div>
                  <Badge tone={meta.tone} icon={meta.icon}>{meta.label}</Badge>
                </div>
                <div>
                  <div className="ins-mcard-row" style={{ marginBottom: 5 }}>
                    <span>{t.currentOrders || 0} / {t.targetOrders} delivered</span>
                    <b>{pct}%</b>
                  </div>
                  <Meter value={pct} color={s === 'completed' ? STATUS.good : s === 'expired' ? STATUS.neutral : SERIES[0]} />
                </div>
                <div className="ins-mcard-row">
                  <span>Bonus {money(t.bonusAmount || 0)} · {t.expiresAt ? `ends ${fmtDate(t.expiresAt)}` : 'no deadline'}</span>
                  <button type="button" className="ins-btn ins-btn-sm ins-btn-bad" onClick={() => remove(t)} disabled={deleting === t._id}>
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
          {!loading && filtered.length === 0 && <Empty icon="🎯" text="No target matches this filter." />}
        </div>
      </div>

      {modalOpen && (
        <div className="admin-modal-overlay" onClick={() => !saving && setModalOpen(false)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="ins-modal-head">
              <div>
                <h3>🎯 New target &amp; bonus</h3>
                <p>The seller gets a chat message and a notification right away.</p>
              </div>
              <button type="button" className="ins-modal-close" onClick={() => setModalOpen(false)} aria-label="Close">✕</button>
            </div>

            <form className="ins-form" onSubmit={submit}>
              <div className="ins-field">
                <label>Store *</label>
                {sellers.length > 8 && (
                  <input className="ins-input" type="search" value={sellerQ} onChange={(e) => setSellerQ(e.target.value)} placeholder="Type to filter stores…" />
                )}
                <select className="ins-input" value={form.sellerId} onChange={(e) => setF({ sellerId: e.target.value })} required>
                  <option value="">— Choose an active store ({sellerOptions.length}) —</option>
                  {sellerOptions.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.storeName} · {s.ownerName}{s.isTestAccount ? ' (test)' : ''}
                    </option>
                  ))}
                </select>
                {chosenSeller && chosenActive > 0 && (
                  <small>This store already has {chosenActive} target{chosenActive === 1 ? '' : 's'} in progress — every delivery counts towards all of them.</small>
                )}
              </div>

              <div className="ins-field">
                <span className="ins-label">Quick presets</span>
                <Seg
                  small
                  label="Target presets"
                  value={`${form.targetOrderCount}-${form.bonusAmount}`}
                  onChange={(v) => {
                    const p = PRESETS.find((x) => `${x.orders}-${x.bonus}` === v);
                    if (p) setF({ targetOrderCount: p.orders, bonusAmount: p.bonus, durationDays: p.days, title: `Deliver ${p.orders} orders` });
                  }}
                  options={PRESETS.map((p) => ({ value: `${p.orders}-${p.bonus}`, label: `${p.orders} orders → $${p.bonus}` }))}
                />
              </div>

              <div className="ins-field">
                <label>Title *</label>
                <input className="ins-input" value={form.title} onChange={(e) => setF({ title: e.target.value })} maxLength={120} required />
              </div>

              <div className="ins-form-grid">
                <div className="ins-field">
                  <label>Delivered orders needed *</label>
                  <input className="ins-input" type="number" min="1" step="1" value={form.targetOrderCount} onChange={(e) => setF({ targetOrderCount: e.target.value })} required />
                </div>
                <div className="ins-field">
                  <label>Cash bonus (USD) *</label>
                  <input className="ins-input" type="number" min="1" step="0.01" value={form.bonusAmount} onChange={(e) => setF({ bonusAmount: e.target.value })} required />
                </div>
              </div>

              <div className="ins-field">
                <label>Deadline (days)</label>
                <input className="ins-input" type="number" min="1" step="1" value={form.durationDays} onChange={(e) => setF({ durationDays: e.target.value })} placeholder="Leave empty for no deadline" />
                <small>
                  {form.durationDays
                    ? `Ends on ${new Date(Date.now() + Number(form.durationDays) * DAY).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}. Deliveries after that no longer count.`
                    : 'No deadline: the target stays open until it is reached or removed.'}
                </small>
              </div>

              <div className="ins-field">
                <label>Message to the seller</label>
                <textarea className="ins-input" rows={2} value={form.description} maxLength={500} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value, descTouched: true }))} />
              </div>

              <div className="ins-callout ins-callout-info">
                <span aria-hidden="true">💡</span>
                <span>
                  Cost: <b>{money(Number(form.bonusAmount) || 0)}</b> for <b>{form.targetOrderCount || 0}</b> delivered orders —
                  {' '}
                  <b>{money((Number(form.bonusAmount) || 0) / Math.max(1, Number(form.targetOrderCount) || 1))}</b> per order.
                </span>
              </div>

              {formError && <ErrorBox error={formError} />}

              <div className="ins-modal-foot">
                <button type="button" className="ins-btn" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button>
                <button type="submit" className="ins-btn ins-btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Assign target'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
