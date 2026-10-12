import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { api, fmtDate } from '../api.js';
import { Modal, Toggle, ErrorBox, F } from './ui.jsx';
import Ic from '../components/Icons.jsx';

// New accounts are staff by default: no share of the money, no team portal
const EMPTY = { name: '', email: '', password: '', role: 'support', permissions: [], financePartner: false };
const PARTNER_ROLES = ['super_admin', 'admin'];

// One fixed colour per role (same order as the server's role list), used by the badges and the charts
const ROLE_COLORS = {
  super_admin: '#2a78d6',
  admin: '#eb6834',
  manager: '#1baf7a',
  support: '#eda100',
  order_manager: '#e87ba4',
  inventory: '#008300',
};
const SERIES = { actions: '#2a78d6', logins: '#eb6834' };
const GROUP_ORDER = ['Marketplace', 'Catalog', 'Operations', 'Money', 'System'];

const TABS = [
  { key: 'members', label: 'Members', icon: 'user' },
  { key: 'insights', label: 'Insights', icon: 'sparkle' },
  { key: 'matrix', label: 'Access Matrix', icon: 'shield' },
];

const DAY = 24 * 3600 * 1000;
function timeAgo(d) {
  if (!d) return 'Never';
  const ms = Date.now() - new Date(d).getTime();
  if (ms < 60 * 1000) return 'Just now';
  if (ms < 3600 * 1000) return `${Math.floor(ms / 60000)}m ago`;
  if (ms < DAY) return `${Math.floor(ms / 3600000)}h ago`;
  if (ms < 30 * DAY) return `${Math.floor(ms / DAY)}d ago`;
  return fmtDate(d);
}
const shortDay = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
const effectiveOf = (meta, role, permissions) =>
  role === 'super_admin' ? meta.permissions : permissions?.length ? permissions : meta.roleDefaults?.[role] || [];

/** Same rules as the server (routes/admins.js): why the signed-in admin may not manage this account. */
function manageBlock(meta, target) {
  const me = meta?.me;
  if (!me || me.role === 'super_admin') return '';
  if (String(target._id) === String(me.id)) return '';
  if (target.role === 'super_admin') return 'Only the Super Admin can change a Super Admin account';
  if ((target.effectivePermissions || []).some((p) => !me.permissions.includes(p))) return 'This account has access you do not have';
  if (target.financePartner && !me.financePartner) return 'Only a finance partner can change a finance partner';
  return '';
}

function RoleBadge({ role, label }) {
  return (
    <span className="stf-role">
      <i style={{ background: ROLE_COLORS[role] || '#94a3b8' }} />
      {label || role}
    </span>
  );
}

function Kpi({ label, value, sub, tone }) {
  return (
    <div className={`stf-kpi ${tone ? `stf-kpi-${tone}` : ''}`}>
      <span className="stf-kpi-lbl">{label}</span>
      <b className="stf-kpi-val">{value}</b>
      {sub && <small className="stf-kpi-sub">{sub}</small>}
    </div>
  );
}

function ChartCard({ title, sub, children, wide, action }) {
  return (
    <div className={`stf-card ${wide ? 'stf-span-2' : ''}`}>
      <div className="stf-card-head">
        <div>
          <h3>{title}</h3>
          {sub && <small>{sub}</small>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

const tooltipStyle = { borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 6px 18px rgba(15,23,42,.08)', fontSize: 12 };

export default function Staff() {
  const [admins, setAdmins] = useState([]);
  const [meta, setMeta] = useState(null);
  const [insights, setInsights] = useState(null);
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState('members');
  const [edit, setEdit] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [saving, setSaving] = useState(false);
  // Shown when a change was sent to the other partner instead of being applied
  const [notice, setNotice] = useState('');

  const load = () => api('/admins').then(setAdmins).catch((e) => setError(e.message));
  const loadInsights = (d = days) => api(`/admins/insights?days=${d}`).then(setInsights).catch(() => {});

  useEffect(() => {
    load();
    api('/admins/meta').then(setMeta).catch(() => {});
  }, []);
  useEffect(() => {
    loadInsights(days);
  }, [days]);

  const reloadAll = () => {
    load();
    loadInsights();
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      setError('');
      const res = edit._id ? await api(`/admins/${edit._id}`, { method: 'PUT', body: edit }) : await api('/admins', { method: 'POST', body: edit });
      // changing your own password ends older logins; keep this browser signed in
      if (res?.token) localStorage.setItem('ng_admin_token', res.token);
      setNotice(res?.pendingApproval ? `🔐 ${res.message}` : res?.warning || res?.message || '');
      setEdit(null);
      reloadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (a) => {
    try {
      const res = await api(`/admins/${a._id}`, { method: 'PUT', body: { active: !a.active } });
      setNotice(res?.pendingApproval ? `🔐 ${res.message}` : res?.message || '');
      reloadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const del = async (a) => {
    if (!window.confirm(`Are you sure you want to delete administrator "${a.name}"?`)) return;
    try {
      const res = await api(`/admins/${a._id}`, { method: 'DELETE' });
      setNotice(res?.pendingApproval ? `🔐 ${res.message}` : res?.warning || '');
      reloadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const activityOf = useMemo(() => new Map((insights?.activity || []).map((r) => [String(r.id), r])), [insights]);

  const filteredAdmins = admins.filter((a) => {
    if (roleFilter !== 'all' && a.role !== roleFilter) return false;
    if (statusFilter === 'active' && !a.active) return false;
    if (statusFilter === 'inactive' && a.active) return false;
    if (!q) return true;
    const term = q.toLowerCase();
    return (a.name || '').toLowerCase().includes(term) || (a.email || '').toLowerCase().includes(term) || (a.role || '').toLowerCase().includes(term);
  });

  const t = insights?.totals;
  const totalModules = meta?.permissions?.length || 0;

  return (
    <div className="admin-staff-page stf">
      {/* Header */}
      <div className="stf-header">
        <div>
          <h2>Staff &amp; Team</h2>
          <p className="muted">Team accounts, roles and exactly which parts of the admin panel each person can open.</p>
        </div>
        <div className="stf-header-actions">
          {meta?.me?.role === 'super_admin' || meta?.me?.permissions?.includes('audit') ? (
            <Link className="stf-btn-ghost" to="/admin/audit">
              <Ic name="fileText" size={15} /> Audit log
            </Link>
          ) : null}
          <button className="btn-primary" onClick={() => setEdit({ ...EMPTY })}>
            <Ic name="plus" size={16} /> Add staff member
          </button>
        </div>
      </div>

      <ErrorBox error={error} />

      {notice && (
        <div className="stf-notice">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="stf-kpis">
        <Kpi label="Team members" value={admins.length} sub={`${admins.filter((a) => a.active).length} active · ${admins.filter((a) => !a.active).length} off`} />
        <Kpi label="Active this week" value={t ? t.activeLast7 : '—'} sub="logged in within 7 days" tone="blue" />
        <Kpi label={`Actions · ${days}d`} value={t ? t.actions.toLocaleString() : '—'} sub={t ? `${t.logins} logins` : ''} />
        <Kpi label="Finance partners" value={admins.filter((a) => a.financePartner && a.active).length} sub="share the Binance money" tone="green" />
        <Kpi label="Custom access" value={t ? t.customPermissions : '—'} sub="not on role defaults" />
        <Kpi
          label="Waiting approval"
          value={insights ? insights.pending.length : '—'}
          sub="team changes on the portal"
          tone={insights?.pending?.length ? 'amber' : ''}
        />
      </div>

      {/* Tabs */}
      <div className="stf-tabs" role="tablist">
        {TABS.map((x) => (
          <button key={x.key} role="tab" aria-selected={tab === x.key} className={tab === x.key ? 'on' : ''} onClick={() => setTab(x.key)}>
            <Ic name={x.icon} size={15} /> {x.label}
          </button>
        ))}
      </div>

      {/* ───────────── MEMBERS ───────────── */}
      {tab === 'members' && (
        <>
          <div className="stf-toolbar">
            <div className="search-field stf-search">
              <Ic name="search" size={16} />
              <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email or role…" />
            </div>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="stf-select">
              <option value="all">All roles</option>
              {(meta?.roles || []).map((r) => (
                <option key={r} value={r}>
                  {meta.roleLabels[r]}
                </option>
              ))}
            </select>
            <div className="stf-seg">
              {['all', 'active', 'inactive'].map((s) => (
                <button key={s} className={statusFilter === s ? 'on' : ''} onClick={() => setStatusFilter(s)}>
                  {s === 'all' ? 'All' : s === 'active' ? 'Active' : 'Off'}
                </button>
              ))}
            </div>
          </div>

          <div className="stf-card stf-table-card">
            <div className="admin-table-wrap">
              <table className="admin-table stf-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Role</th>
                    <th>Access</th>
                    <th>Activity ({days}d)</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAdmins.length === 0 && (
                    <tr>
                      <td colSpan="6" className="muted" style={{ textAlign: 'center', padding: 30 }}>
                        No staff members match these filters.
                      </td>
                    </tr>
                  )}
                  {filteredAdmins.map((a) => {
                    const perms = a.effectivePermissions || [];
                    const isMe = String(a._id) === String(meta?.me?.id);
                    const block = manageBlock(meta, a);
                    const act = activityOf.get(String(a._id));
                    const custom = a.role !== 'super_admin' && (a.permissions || []).length > 0;
                    return (
                      <tr key={a._id} className={a.active ? '' : 'row-inactive'}>
                        <td>
                          <div className="staff-user-cell">
                            <div className="stf-avatar" style={{ background: ROLE_COLORS[a.role] || '#475569' }}>
                              {(a.name?.[0] || 'A').toUpperCase()}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <b className="stf-name">
                                {a.name} {isMe && <span className="stf-tag stf-tag-me">You</span>}
                              </b>
                              <small className="stf-email">{a.email}</small>
                              <div className="stf-tags">
                                {a.role === 'super_admin' && <span className="stf-tag stf-tag-super">👑 Full access</span>}
                                {a.financePartner && <span className="stf-tag stf-tag-partner">💰 Finance partner</span>}
                                {custom && <span className="stf-tag">Custom access</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <RoleBadge role={a.role} label={meta?.roleLabels?.[a.role]} />
                        </td>
                        <td style={{ minWidth: 200 }}>
                          <div className="stf-access">
                            <div className="stf-meter" title={`${perms.length} of ${totalModules} modules`}>
                              <span style={{ width: `${totalModules ? (perms.length / totalModules) * 100 : 0}%` }} />
                            </div>
                            <small>
                              {perms.length}/{totalModules} modules
                            </small>
                          </div>
                          <div className="perm-chips-wrap" style={{ marginTop: 6 }}>
                            {a.role === 'super_admin' ? (
                              <span className="perm-chip perm-all">Everything</span>
                            ) : (
                              <>
                                {perms.slice(0, 4).map((p) => (
                                  <span key={p} className="perm-chip" title={meta?.permissionInfo?.[p]?.desc}>
                                    {meta?.permissionInfo?.[p]?.label || p}
                                  </span>
                                ))}
                                {perms.length > 4 && (
                                  <span className="perm-chip perm-more" title={perms.slice(4).join(', ')}>
                                    +{perms.length - 4}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="stf-activity">
                            <b>{act ? act.actions : 0}</b> <span>actions</span>
                          </div>
                          <small className="muted-sm" title={a.lastLoginAt ? fmtDate(a.lastLoginAt) : ''}>
                            Last login: {timeAgo(a.lastLoginAt)}
                          </small>
                        </td>
                        <td>
                          <div className="stf-status" title={isMe ? 'You cannot switch off your own account' : block}>
                            <span style={{ pointerEvents: isMe || block ? 'none' : 'auto', opacity: isMe || block ? 0.5 : 1 }}>
                              <Toggle small on={a.active} onChange={() => toggleActive(a)} />
                            </span>
                            <span className={a.active ? 'stf-on' : 'stf-off'}>{a.active ? 'Active' : 'Off'}</span>
                          </div>
                        </td>
                        <td>
                          <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                            <button className="row-link" disabled={!!block} title={block} onClick={() => setEdit({ ...a, password: '' })}>
                              Edit
                            </button>
                            {!isMe && (
                              <button className="row-link danger" disabled={!!block} title={block} onClick={() => del(a)}>
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ───────────── INSIGHTS ───────────── */}
      {tab === 'insights' && (
        <Insights insights={insights} days={days} setDays={setDays} />
      )}

      {/* ───────────── ACCESS MATRIX ───────────── */}
      {tab === 'matrix' && meta && <AccessMatrix admins={admins} meta={meta} />}

      {/* Add / Edit modal */}
      {edit && meta && (
        <StaffForm edit={edit} setEdit={setEdit} meta={meta} saving={saving} onSubmit={save} admins={admins} />
      )}
    </div>
  );
}

/* ═══════════════════════════ Insights tab ═══════════════════════════ */
function Insights({ insights, days, setDays }) {
  if (!insights) return <p className="muted">Loading insights…</p>;
  const roleData = insights.roles.filter((r) => r.total > 0).map((r) => ({ ...r, color: ROLE_COLORS[r.role] || '#94a3b8' }));
  const coverage = [...insights.coverage].sort((a, b) => b.count - a.count);
  const maxActions = Math.max(1, ...insights.activity.map((r) => r.actions));
  const activeTotal = insights.totals.active || 0;
  const tickEvery = Math.max(1, Math.round(insights.timeline.length / 8));

  return (
    <>
      <div className="stf-range">
        <span className="muted-sm">Period</span>
        <div className="stf-seg">
          {[7, 30, 90].map((d) => (
            <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>
              {d} days
            </button>
          ))}
        </div>
      </div>

      {insights.risks.length > 0 && (
        <div className="stf-risks">
          {insights.risks.map((r, i) => (
            <div key={i} className={`stf-risk stf-risk-${r.level}`}>
              <Ic name={r.level === 'warn' ? 'alert' : 'shield'} size={15} />
              <span>{r.text}</span>
            </div>
          ))}
        </div>
      )}

      <div className="stf-grid">
        <ChartCard title="Team activity" sub={`Admin-panel actions and logins per day · last ${days} days`} wide>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={insights.timeline} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="stfActions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES.actions} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={SERIES.actions} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#eef2f7" />
              <XAxis dataKey="date" tickFormatter={shortDay} interval={tickEvery - 1} fontSize={11} stroke="#94a3b8" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} fontSize={11} stroke="#94a3b8" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => new Date(`${l}T00:00:00`).toDateString()} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="actions" name="Actions" stroke={SERIES.actions} strokeWidth={2} fill="url(#stfActions)" activeDot={{ r: 5 }} />
              <Area type="monotone" dataKey="logins" name="Logins" stroke={SERIES.logins} strokeWidth={2} fill="none" activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Team by role" sub={`${insights.totals.total} accounts · ${activeTotal} active`}>
          <ResponsiveContainer width="100%" height={190}>
            <PieChart>
              <Pie data={roleData} dataKey="total" nameKey="label" innerRadius={52} outerRadius={80} paddingAngle={2} stroke="#fff" strokeWidth={2}>
                {roleData.map((r) => (
                  <Cell key={r.role} fill={r.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v, n, p) => [`${v} (${p.payload.active} active)`, n]} />
            </PieChart>
          </ResponsiveContainer>
          <ul className="stf-legend">
            {roleData.map((r) => (
              <li key={r.role}>
                <i style={{ background: r.color }} />
                <span>{r.label}</span>
                <b>{r.total}</b>
              </li>
            ))}
          </ul>
        </ChartCard>

        <ChartCard title="Module coverage" sub="How many active members can open each module" wide>
          <ResponsiveContainer width="100%" height={Math.max(260, coverage.length * 26 + 30)}>
            <BarChart data={coverage} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }} barCategoryGap={4}>
              <CartesianGrid horizontal={false} stroke="#eef2f7" />
              <XAxis type="number" allowDecimals={false} domain={[0, Math.max(1, activeTotal)]} fontSize={11} stroke="#94a3b8" tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="label" width={140} interval={0} fontSize={11.5} stroke="#475569" tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: '#f1f5f9' }}
                formatter={(v) => [`${v} of ${activeTotal} active members`, 'Access']}
              />
              <Bar dataKey="count" fill={SERIES.actions} radius={[0, 4, 4, 0]} maxBarSize={14} label={{ position: 'right', fontSize: 11, fill: '#475569' }} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Last login" sub="Active accounts by how recently they signed in">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={insights.loginBuckets} margin={{ top: 16, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#eef2f7" />
              <XAxis dataKey="label" fontSize={11} stroke="#94a3b8" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} fontSize={11} stroke="#94a3b8" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f1f5f9' }} formatter={(v) => [v, 'Members']} />
              <Bar dataKey="count" fill={SERIES.actions} radius={[4, 4, 0, 0]} maxBarSize={36} label={{ position: 'top', fontSize: 11, fill: '#475569' }} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Most active" sub={`Actions in the last ${days} days`}>
          {insights.activity.length === 0 && <p className="muted-sm">No activity recorded in this period.</p>}
          <ul className="stf-leaders">
            {insights.activity.slice(0, 7).map((r) => (
              <li key={r.id}>
                <div className="stf-leader-top">
                  <span>
                    <i style={{ background: ROLE_COLORS[r.role] || '#94a3b8' }} />
                    {r.name}
                  </span>
                  <b>{r.actions}</b>
                </div>
                <div className="stf-meter">
                  <span style={{ width: `${(r.actions / maxActions) * 100}%` }} />
                </div>
                <small className="muted-sm">
                  {r.logins} logins · last seen {timeAgo(r.lastAt)}
                </small>
              </li>
            ))}
          </ul>
        </ChartCard>

        <ChartCard title="Recent team activity" sub="Latest changes made in the admin panel">
          {insights.recent.length === 0 && <p className="muted-sm">Nothing yet.</p>}
          <ul className="stf-feed">
            {insights.recent.map((r) => (
              <li key={r.id}>
                <span className="stf-feed-dot" />
                <div>
                  <b>{r.name}</b> <span className="stf-feed-action">{r.action.replace(/_/g, ' ')}</span>
                  {r.entity && <span className="muted-sm"> · {r.entity}</span>}
                  <small className="muted-sm">{timeAgo(r.at)}</small>
                </div>
              </li>
            ))}
          </ul>
        </ChartCard>

        <ChartCard title="Waiting for approval" sub="Team changes the other finance partner must approve">
          {insights.pending.length === 0 && <p className="muted-sm">No team changes are waiting. ✅</p>}
          <ul className="stf-feed">
            {insights.pending.map((p) => (
              <li key={p.id}>
                <span className="stf-feed-dot amber" />
                <div>
                  <span>{p.summary}</span>
                  <small className="muted-sm">
                    asked by {p.by || 'someone'} · {timeAgo(p.at)}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        </ChartCard>
      </div>

      <details className="stf-card stf-table-view">
        <summary>Show module coverage as a table</summary>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Module</th>
              <th>Group</th>
              <th>Active members with access</th>
            </tr>
          </thead>
          <tbody>
            {insights.coverage.map((c) => (
              <tr key={c.permission}>
                <td>{c.label}</td>
                <td>{c.group}</td>
                <td>
                  {c.count} / {activeTotal}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

/* ═══════════════════════════ Access matrix tab ═══════════════════════════ */
function AccessMatrix({ admins, meta }) {
  const [view, setView] = useState('members');
  const info = meta.permissionInfo || {};
  const cols = [...meta.permissions].sort((a, b) => GROUP_ORDER.indexOf(info[a]?.group) - GROUP_ORDER.indexOf(info[b]?.group));
  const groups = GROUP_ORDER.map((g) => ({ g, n: cols.filter((p) => info[p]?.group === g).length })).filter((x) => x.n);

  const rows =
    view === 'members'
      ? admins.map((a) => ({
          key: a._id,
          title: a.name,
          sub: meta.roleLabels[a.role] || a.role,
          role: a.role,
          inactive: !a.active,
          has: a.effectivePermissions || [],
          defaults: a.role === 'super_admin' ? meta.permissions : meta.roleDefaults[a.role] || [],
        }))
      : meta.roles.map((r) => ({
          key: r,
          title: meta.roleLabels[r],
          sub: 'role default',
          role: r,
          has: r === 'super_admin' ? meta.permissions : meta.roleDefaults[r] || [],
          defaults: r === 'super_admin' ? meta.permissions : meta.roleDefaults[r] || [],
        }));

  return (
    <div className="stf-card">
      <div className="stf-card-head">
        <div>
          <h3>Who can open what</h3>
          <small>Every module the server checks, for every {view === 'members' ? 'team member' : 'role'}.</small>
        </div>
        <div className="stf-seg">
          <button className={view === 'members' ? 'on' : ''} onClick={() => setView('members')}>
            By member
          </button>
          <button className={view === 'roles' ? 'on' : ''} onClick={() => setView('roles')}>
            Role defaults
          </button>
        </div>
      </div>
      <div className="stf-matrix-legend">
        <span>
          <i className="stf-cell yes">✓</i> Role default
        </span>
        <span>
          <i className="stf-cell extra">+</i> Added (custom)
        </span>
        <span>
          <i className="stf-cell removed">–</i> Removed from role default
        </span>
        <span>
          <i className="stf-cell" /> No access
        </span>
      </div>
      <div className="stf-matrix-wrap">
        <table className="stf-matrix">
          <thead>
            <tr>
              <th />
              {groups.map((x) => (
                <th key={x.g} colSpan={x.n} className="stf-matrix-group">
                  {x.g}
                </th>
              ))}
            </tr>
            <tr>
              <th className="stf-matrix-name">{view === 'members' ? 'Member' : 'Role'}</th>
              {cols.map((p) => (
                <th key={p} title={info[p]?.desc} className="stf-matrix-col">
                  <span>{info[p]?.label || p}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={r.inactive ? 'row-inactive' : ''}>
                <td className="stf-matrix-name">
                  <b>
                    <i style={{ background: ROLE_COLORS[r.role] || '#94a3b8' }} />
                    {r.title}
                  </b>
                  <small>
                    {r.sub}
                    {r.inactive ? ' · off' : ''}
                  </small>
                </td>
                {cols.map((p) => {
                  const has = r.has.includes(p);
                  const def = r.defaults.includes(p);
                  const kind = has && def ? 'yes' : has ? 'extra' : def ? 'removed' : '';
                  return (
                    <td key={p}>
                      <i className={`stf-cell ${kind}`} title={`${info[p]?.label || p}: ${has ? 'access' : 'no access'}`}>
                        {kind === 'yes' ? '✓' : kind === 'extra' ? '+' : kind === 'removed' ? '–' : ''}
                      </i>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════ Add / edit form ═══════════════════════════ */
function StaffForm({ edit, setEdit, meta, saving, onSubmit, admins }) {
  const me = meta.me || { role: 'super_admin', permissions: meta.permissions };
  const isSuperMe = me.role === 'super_admin';
  const isSelf = edit._id && String(edit._id) === String(me.id);
  const lockAccess = isSelf && !isSuperMe; // nobody raises their own access
  const info = meta.permissionInfo || {};
  const [mode, setMode] = useState(edit.permissions?.length ? 'custom' : 'defaults');
  const effective = effectiveOf(meta, edit.role, mode === 'custom' ? edit.permissions : []);
  const canGrant = (p) => isSuperMe || me.permissions.includes(p);
  const roleAllowed = (r) => isSuperMe || (r !== 'super_admin' && (meta.roleDefaults[r] || []).every(canGrant));
  const original = edit._id ? admins.find((a) => a._id === edit._id) : null;

  const setRole = (r) => {
    setMode('defaults');
    setEdit({ ...edit, role: r, permissions: [], financePartner: PARTNER_ROLES.includes(r) ? edit.financePartner : false });
  };
  const switchMode = (m) => {
    setMode(m);
    setEdit({ ...edit, permissions: m === 'custom' ? [...(meta.roleDefaults[edit.role] || [])].filter(canGrant) : [] });
  };
  const togglePerm = (p) =>
    setEdit({ ...edit, permissions: edit.permissions.includes(p) ? edit.permissions.filter((x) => x !== p) : [...edit.permissions, p] });

  return (
    <Modal title={edit._id ? `Edit ${edit.name}` : 'Add a staff member'} onClose={() => setEdit(null)} wide>
      <form onSubmit={onSubmit} className="admin-modal-form stf-form">
        <div className="stf-form-section">
          <h4>Account</h4>
          <div className="form-grid-2">
            <F label="Full name *">
              <input type="text" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Sarah Khan" required />
            </F>
            <F label="Login email *">
              <input
                type="email"
                value={edit.email}
                onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                placeholder="e.g. staff@bazario.store"
                required
                disabled={!!edit._id}
              />
            </F>
            <F label={edit._id ? 'New password (leave blank to keep)' : 'Login password *'} full>
              <input
                type="password"
                value={edit.password}
                onChange={(e) => setEdit({ ...edit, password: e.target.value })}
                placeholder={edit._id ? '••••••••' : 'Min 8 characters'}
                minLength={8}
                required={!edit._id}
                autoComplete="new-password"
              />
            </F>
          </div>
        </div>

        <div className="stf-form-section">
          <h4>Role</h4>
          {lockAccess && <p className="muted-sm">You cannot change your own role or access. Ask the Super Admin.</p>}
          <div className="stf-role-cards">
            {meta.roles.map((r) => {
              const allowed = roleAllowed(r) && !lockAccess;
              const n = r === 'super_admin' ? meta.permissions.length : (meta.roleDefaults[r] || []).length;
              return (
                <button
                  type="button"
                  key={r}
                  disabled={!allowed && edit.role !== r}
                  className={`stf-role-card ${edit.role === r ? 'on' : ''}`}
                  onClick={() => allowed && setRole(r)}
                  title={allowed ? '' : 'This role has access your account does not have'}
                >
                  <i style={{ background: ROLE_COLORS[r] || '#94a3b8' }} />
                  <b>{meta.roleLabels[r]}</b>
                  <small>{r === 'super_admin' ? 'Everything' : `${n} modules by default`}</small>
                </button>
              );
            })}
          </div>

          <label className={`stf-partner ${PARTNER_ROLES.includes(edit.role) && !lockAccess ? '' : 'disabled'}`}>
            <input
              type="checkbox"
              checked={Boolean(edit.financePartner) && PARTNER_ROLES.includes(edit.role)}
              disabled={!PARTNER_ROLES.includes(edit.role) || lockAccess || (!me.financePartner && !isSuperMe)}
              onChange={(e) => setEdit({ ...edit, financePartner: e.target.checked })}
            />
            <span>
              <b>💰 Finance partner</b>
              <small>
                Shares the Binance money and can use the team portal. Leave off for support, orders and other staff. Needs the Administrator or Super Admin
                role. The ledger divides money only while there are exactly 2 finance partners.
              </small>
            </span>
          </label>
        </div>

        {edit.role !== 'super_admin' && (
          <div className="stf-form-section">
            <div className="stf-access-head">
              <h4>Access</h4>
              <div className="stf-seg">
                <button type="button" disabled={lockAccess} className={mode === 'defaults' ? 'on' : ''} onClick={() => switchMode('defaults')}>
                  Role defaults
                </button>
                <button type="button" disabled={lockAccess} className={mode === 'custom' ? 'on' : ''} onClick={() => switchMode('custom')}>
                  Custom
                </button>
              </div>
              <span className="stf-access-count">
                {effective.length}/{meta.permissions.length} modules
              </span>
            </div>
            {mode === 'custom' && edit.permissions.length === 0 && (
              <p className="muted-sm">Nothing selected: the account will use the role defaults.</p>
            )}
            <div className="stf-perm-groups">
              {GROUP_ORDER.map((g) => {
                const list = meta.permissions.filter((p) => info[p]?.group === g);
                if (!list.length) return null;
                return (
                  <div key={g} className="stf-perm-group">
                    <h5>{g}</h5>
                    {list.map((p) => {
                      const on = effective.includes(p);
                      const disabled = mode !== 'custom' || lockAccess || (!canGrant(p) && !on);
                      return (
                        <label key={p} className={`stf-perm ${on ? 'on' : ''} ${disabled ? 'disabled' : ''}`} title={!canGrant(p) ? 'Your account does not have this access' : ''}>
                          <input type="checkbox" checked={on} disabled={disabled} onChange={() => togglePerm(p)} />
                          <span>
                            <b>{info[p]?.label || p}</b>
                            <small>{info[p]?.desc}</small>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="stf-approval-note">
          🔐 Creating an admin, deleting one, or changing a role, permissions, status, the finance-partner setting or someone else’s password is applied only after
          the other finance partner approves it on the team portal (Finance).
          {original && original.role !== edit.role ? ` Role change: ${meta.roleLabels[original.role]} → ${meta.roleLabels[edit.role]}.` : ''}
        </p>

        <div className="modal-bottom-actions">
          <button type="button" className="btn-cancel" onClick={() => setEdit(null)}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : edit._id ? 'Save changes' : 'Create account'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
