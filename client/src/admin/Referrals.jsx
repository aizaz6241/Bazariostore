import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { api, fmtDay } from '../api.js';
import Ic from '../components/Icons.jsx';

// Chart colours: categorical slots in fixed order for the sign-up sources, reserved status colours
// (always shown with a text label) for where the sellers are now.
const SERIES = { withCode: '#2a78d6', unknownCode: '#eb6834', direct: '#1baf7a' };
const STATUS = { approved: '#0ca30c', pending: '#fab219', rejected: '#d03b3b', other: '#94a3b8' };

const EMPTY_FORM = { code: '', description: '', commissionRate: '', bonusAmount: '', status: 'active' };
const EMPTY_BULK = { prefix: '', count: 10, description: '', commissionRate: '', bonusAmount: '', status: 'active' };
const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
const cleanCode = (v) => String(v || '').replace(/\s+/g, '').toUpperCase();
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const shortWeek = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function inviteUrl(code) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://bazario.com';
  return `${origin}/seller/login?affiliate=${encodeURIComponent(code)}`;
}

// legend text stays in ink colour; the dot beside it carries the series colour
const legendText = (value) => <span style={{ color: '#475569', fontWeight: 600 }}>{value}</span>;

function ChartTooltip({ active, payload, label, labelFormatter }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((t, p) => t + (Number(p.value) || 0), 0);
  return (
    <div className="aff-tip">
      <b>{labelFormatter ? labelFormatter(label) : label}</b>
      {payload.map((p) => (
        <div key={p.dataKey} className="aff-tip-row">
          <i style={{ background: p.color }} />
          <span>{p.name}</span>
          <strong>{p.value}</strong>
        </div>
      ))}
      {payload.length > 1 && (
        <div className="aff-tip-row aff-tip-total">
          <span>Total</span>
          <strong>{total}</strong>
        </div>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, sub, tone = 'blue' }) {
  return (
    <div className={`aff-kpi tone-${tone}`}>
      <span className="aff-kpi-ic"><Ic name={icon} size={20} /></span>
      <div>
        <small>{label}</small>
        <b>{value}</b>
        {sub && <span className="aff-kpi-sub">{sub}</span>}
      </div>
    </div>
  );
}

// Approved / pending / rejected split of one code, as a thin stacked bar
function UsageBar({ approved = 0, pending = 0, rejected = 0, total = 0 }) {
  const other = Math.max(0, total - approved - pending - rejected);
  if (!total) return <span className="aff-usage-zero">No sellers yet</span>;
  const seg = (n, color, name) => (n > 0 ? <i key={name} style={{ flexGrow: n, background: color }} title={`${name}: ${n}`} /> : null);
  return (
    <div className="aff-usage">
      <div className="aff-usage-top">
        <b>{total}</b>
        <small>
          {approved} approved · {pending} pending{rejected ? ` · ${rejected} rejected` : ''}
        </small>
      </div>
      <div className="aff-usage-bar">
        {seg(approved, STATUS.approved, 'Approved')}
        {seg(pending, STATUS.pending, 'Pending')}
        {seg(rejected, STATUS.rejected, 'Rejected')}
        {seg(other, STATUS.other, 'Suspended / other')}
      </div>
    </div>
  );
}

export default function Referrals() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [toast, setToast] = useState(null);

  const [masterInput, setMasterInput] = useState('');
  const [savingMaster, setSavingMaster] = useState(false);
  const [copied, setCopied] = useState('');

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('usage');

  const [formModal, setFormModal] = useState(null); // { mode: 'create' | 'edit', id? }
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState(EMPTY_BULK);
  const [bulkErr, setBulkErr] = useState('');
  const [bulkResult, setBulkResult] = useState(null);

  const notify = (msg, type = 'ok') => {
    setToast({ msg, type, id: Date.now() });
    setTimeout(() => setToast((t) => (t && Date.now() - t.id >= 3000 ? null : t)), 3200);
  };

  const loadData = () => {
    setLoading(true);
    api('/sellers/affiliates')
      .then((res) => {
        setData(res);
        setMasterInput(res?.masterAffiliateCode || res?.masterReferralCode || '');
        setLoadErr('');
      })
      .catch((e) => setLoadErr(e.message || 'Could not load security codes'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const masterCode = data?.masterAffiliateCode || data?.masterReferralCode || '';
  const codes = useMemo(() => data?.affiliateCodes || data?.referralCodes || [], [data]);
  const ms = data?.masterStats || {};
  const totals = data?.totals || { sellers: 0, viaCodes: 0, unknown: 0, activeCodes: 0, inactiveCodes: 0 };
  const approvedViaCodes = (ms.approved || 0) + codes.reduce((t, c) => t + (c.approvedCount || 0), 0);
  const pendingViaCodes = (ms.pending || 0) + codes.reduce((t, c) => t + (c.pendingCount || 0), 0);

  const trend = useMemo(() => (data?.trend || []).map((w) => ({ ...w, label: shortWeek(w.week) })), [data]);
  const trendTotal = trend.reduce((t, w) => t + w.withCode + w.unknownCode + w.direct, 0);
  const trendHasUnknown = trend.some((w) => w.unknownCode > 0);

  const topCodes = useMemo(() => {
    const rows = [
      { code: masterCode, approved: ms.approved || 0, pending: ms.pending || 0, rejected: ms.rejected || 0, total: data?.masterUsageCount || 0 },
      ...codes.map((c) => ({ code: c.code, approved: c.approvedCount || 0, pending: c.pendingCount || 0, rejected: c.rejectedCount || 0, total: c.usageCount || 0 })),
    ]
      .filter((r) => r.code && r.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
    return rows.map((r) => ({ ...r, other: Math.max(0, r.total - r.approved - r.pending - r.rejected) }));
  }, [codes, masterCode, ms, data]);

  const visibleCodes = useMemo(() => {
    const term = q.trim().toUpperCase();
    const list = codes.filter(
      (c) =>
        (statusFilter === 'all' || c.status === statusFilter) &&
        (!term || c.code.includes(term) || (c.description || '').toUpperCase().includes(term))
    );
    const by = {
      usage: (a, b) => (b.usageCount || 0) - (a.usageCount || 0),
      newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      code: (a, b) => a.code.localeCompare(b.code),
    }[sortBy];
    return [...list].sort(by);
  }, [codes, q, statusFilter, sortBy]);

  const copyText = (text, id, what = 'Link') => {
    const done = () => {
      setCopied(id);
      notify(`${what} copied`);
      setTimeout(() => setCopied((c) => (c === id ? '' : c)), 2000);
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => notify('Copy failed — please copy by hand', 'err'));
    else notify('Copy is not available in this browser', 'err');
  };

  const saveMaster = async (e) => {
    e.preventDefault();
    const code = cleanCode(masterInput);
    if (!CODE_RE.test(code)) return notify('Master code: 3-32 letters, numbers, "-" or "_"', 'err');
    if (code === masterCode) return notify('This is already the master code');
    if (!window.confirm(`Change the master code from ${masterCode} to ${code}?\n\nNew sellers will need the new code. ${masterCode} is kept as an inactive code so its sellers stay tracked.`)) return;
    setSavingMaster(true);
    try {
      await api('/sellers/master-affiliate', { method: 'POST', body: { code } });
      notify(`Master code is now ${code}`);
      loadData();
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setSavingMaster(false);
    }
  };

  const openCreate = (prefill = '') => {
    setForm({ ...EMPTY_FORM, code: prefill });
    setFormErr('');
    setFormModal({ mode: 'create' });
  };
  const openEdit = (c) => {
    setForm({
      code: c.code,
      description: c.description || '',
      commissionRate: c.commissionRate ?? '',
      bonusAmount: c.bonusAmount || '',
      status: c.status,
    });
    setFormErr('');
    setFormModal({ mode: 'edit', id: c._id });
  };

  const submitForm = async (e) => {
    e.preventDefault();
    const code = cleanCode(form.code);
    if (formModal.mode === 'create') {
      if (!CODE_RE.test(code)) return setFormErr('Code must be 3-32 characters: letters, numbers, "-" or "_".');
      if (code === masterCode || codes.some((c) => c.code === code)) return setFormErr(`"${code}" already exists.`);
    }
    setSaving(true);
    setFormErr('');
    try {
      if (formModal.mode === 'create') {
        await api('/sellers/affiliates', { method: 'POST', body: { ...form, code } });
        notify(`Code ${code} created`);
      } else {
        const { description, commissionRate, bonusAmount, status } = form;
        await api(`/sellers/affiliates/${formModal.id}`, { method: 'PATCH', body: { description, commissionRate, bonusAmount, status } });
        notify(`Code ${code} updated`);
      }
      setFormModal(null);
      loadData();
    } catch (err) {
      setFormErr(err.message);
    } finally {
      setSaving(false);
    }
  };

  const submitBulk = async (e) => {
    e.preventDefault();
    setSaving(true);
    setBulkErr('');
    try {
      const res = await api('/sellers/affiliates/bulk', { method: 'POST', body: bulk });
      setBulkResult(res.codes || []);
      notify(res.message || 'Codes generated');
      loadData();
    } catch (err) {
      setBulkErr(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (c) => {
    try {
      const res = await api(`/sellers/affiliates/${c._id}/toggle`, { method: 'PATCH' });
      notify(res.message || 'Status changed');
      loadData();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  const remove = async (c) => {
    const used = c.usageCount || 0;
    // a code sellers joined with is kept (their history and waiting applications depend on it):
    // it can only be switched off
    if (used) {
      if (c.status !== 'active') {
        window.alert(`"${c.code}" was used by ${used} seller(s), so it cannot be deleted. It is already inactive (no new sign-ups).`);
        return;
      }
      if (window.confirm(`"${c.code}" was used by ${used} seller(s), so it cannot be deleted.\n\nSet it to Inactive instead? New sellers can no longer use it; its sellers and history stay.`)) {
        toggleStatus(c);
      }
      return;
    }
    if (!window.confirm(`Delete security code "${c.code}"?`)) return;
    try {
      await api(`/sellers/affiliates/${c._id}`, { method: 'DELETE' });
      notify(`Code ${c.code} deleted`);
      loadData();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  if (loadErr && !data) {
    return (
      <div className="aff-page">
        <div className="aff-error">
          <Ic name="alert" size={18} /> {loadErr}
          <button type="button" onClick={loadData}>Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="aff-page">
      {/* ─── Header ─── */}
      <div className="aff-head">
        <div>
          <span className="aff-eyebrow"><Ic name="tag" size={13} /> Seller acquisition</span>
          <h1>Security Codes</h1>
          <p>Invite sellers with tracked codes. A seller can only register with the master code or an <b>active</b> custom code — wrong or switched-off codes are refused.</p>
        </div>
        <div className="aff-head-actions">
          <button type="button" className="aff-btn ghost" onClick={() => { setBulk(EMPTY_BULK); setBulkErr(''); setBulkResult(null); setBulkOpen(true); }}>
            <Ic name="layers" size={16} /> Bulk generate
          </button>
          <button type="button" className="aff-btn primary" onClick={() => openCreate()}>
            <Ic name="plus" size={16} /> New code
          </button>
        </div>
      </div>

      {/* ─── KPIs ─── */}
      <div className="aff-kpis">
        <Kpi icon="users" tone="blue" label="Sellers via codes" value={loading && !data ? '…' : totals.viaCodes} sub={`${pct(totals.viaCodes, totals.sellers)}% of ${totals.sellers} sellers`} />
        <Kpi icon="checkCircle" tone="green" label="Approved from codes" value={loading && !data ? '…' : approvedViaCodes} sub={`${pct(approvedViaCodes, totals.viaCodes)}% approval · ${pendingViaCodes} waiting`} />
        <Kpi icon="tag" tone="violet" label="Active codes" value={loading && !data ? '…' : totals.activeCodes} sub={`${totals.inactiveCodes} inactive · incl. master`} />
        <Kpi
          icon="alert"
          tone={totals.unknown ? 'orange' : 'slate'}
          label="Unknown-code sign-ups"
          value={loading && !data ? '…' : totals.unknown}
          sub={totals.unknown ? 'Typos / deleted — see below' : 'All codes check out'}
        />
      </div>

      {/* ─── Charts ─── */}
      <div className="aff-charts">
        <section className="aff-card">
          <header className="aff-card-head">
            <div>
              <h3><Ic name="chart" size={16} /> Seller sign-ups per week</h3>
              <p>Last 12 weeks · {trendTotal} registrations by source</p>
            </div>
          </header>
          <div className="aff-chart-box">
            {trendTotal === 0 ? (
              <div className="aff-empty-chart">No seller registrations in the last 12 weeks.</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap="22%">
                  <CartesianGrid vertical={false} stroke="#eef1f5" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(15,23,42,0.04)' }} content={<ChartTooltip labelFormatter={(l) => `Week of ${l}`} />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 6 }} formatter={legendText} />
                  <Bar dataKey="withCode" name="Valid code" stackId="s" fill={SERIES.withCode} stroke="#fff" strokeWidth={1} />
                  {trendHasUnknown && <Bar dataKey="unknownCode" name="Unknown code" stackId="s" fill={SERIES.unknownCode} stroke="#fff" strokeWidth={1} />}
                  <Bar dataKey="direct" name="No code" stackId="s" fill={SERIES.direct} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="aff-card">
          <header className="aff-card-head">
            <div>
              <h3><Ic name="trend" size={16} /> Top codes by sellers</h3>
              <p>Where each code's sellers are now</p>
            </div>
          </header>
          <div className="aff-chart-box">
            {topCodes.length === 0 ? (
              <div className="aff-empty-chart">No seller has used a code yet. Share an invite link to get started.</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(180, topCodes.length * 34 + 60)}>
                <BarChart data={topCodes} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }} barCategoryGap="28%">
                  <CartesianGrid horizontal={false} stroke="#eef1f5" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="code" width={120} tick={{ fontSize: 11, fill: '#334155', fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(15,23,42,0.04)' }} content={<ChartTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 6 }} formatter={legendText} />
                  <Bar dataKey="approved" name="Approved" stackId="u" fill={STATUS.approved} stroke="#fff" strokeWidth={1} />
                  <Bar dataKey="pending" name="Pending" stackId="u" fill={STATUS.pending} stroke="#fff" strokeWidth={1} />
                  <Bar dataKey="rejected" name="Rejected" stackId="u" fill={STATUS.rejected} stroke="#fff" strokeWidth={1} />
                  <Bar dataKey="other" name="Suspended / other" stackId="u" fill={STATUS.other} stroke="#fff" strokeWidth={1} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>

      {/* ─── Master code + unknown codes ─── */}
      <div className="aff-split">
        <section className="aff-card aff-master">
          <header className="aff-card-head">
            <div>
              <h3><Ic name="shield" size={16} /> Master code</h3>
              <p>Always valid. Used by the default invite link.</p>
            </div>
            <span className="aff-pill blue">Default</span>
          </header>
          <form onSubmit={saveMaster} className="aff-master-form">
            <input value={masterInput} onChange={(e) => setMasterInput(cleanCode(e.target.value))} maxLength={32} aria-label="Master security code" />
            <button type="submit" className="aff-btn primary" disabled={savingMaster || cleanCode(masterInput) === masterCode}>
              {savingMaster ? 'Saving…' : 'Save'}
            </button>
          </form>
          <div className="aff-linkbox">
            <code>{inviteUrl(masterCode || 'CODE')}</code>
            <button type="button" className="aff-icon-btn" onClick={() => copyText(inviteUrl(masterCode), 'master')} title="Copy invite link">
              <Ic name={copied === 'master' ? 'check' : 'copy'} size={15} />
            </button>
          </div>
          <UsageBar approved={ms.approved} pending={ms.pending} rejected={ms.rejected} total={data?.masterUsageCount || 0} />
        </section>

        <section className={`aff-card ${data?.unknownCodes?.length ? 'aff-warn' : ''}`}>
          <header className="aff-card-head">
            <div>
              <h3><Ic name="alert" size={16} /> Codes that match nothing</h3>
              <p>Saved before codes were checked (typos), or their code was deleted.</p>
            </div>
          </header>
          {!data?.unknownCodes?.length ? (
            <div className="aff-allgood"><Ic name="checkCircle" size={18} /> Every seller's code matches a real security code.</div>
          ) : (
            <ul className="aff-unknown">
              {data.unknownCodes.slice(0, 8).map((u) => (
                <li key={u.code}>
                  <span className="aff-code-chip warn">{u.code}</span>
                  <small>{u.count} seller{u.count === 1 ? '' : 's'}{u.lastUsedAt ? ` · last ${fmtDay(u.lastUsedAt)}` : ''}</small>
                  {CODE_RE.test(u.code) && (
                    <button type="button" className="aff-link-btn" onClick={() => openCreate(u.code)}>Create this code</button>
                  )}
                </li>
              ))}
              <li className="aff-unknown-hint">
                Or fix the code on the seller in <Link to="/admin/sellers">Sellers &amp; Vendors</Link>. New approvals with an unknown code are blocked.
              </li>
            </ul>
          )}
        </section>
      </div>

      {/* ─── Codes table ─── */}
      <section className="aff-card aff-table-card">
        <header className="aff-card-head aff-toolbar">
          <div>
            <h3><Ic name="list" size={16} /> Custom codes</h3>
            <p>{codes.length} code{codes.length === 1 ? '' : 's'} · click a status to switch it</p>
          </div>
          <div className="aff-filters">
            <label className="aff-search">
              <Ic name="search" size={15} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code or campaign" />
            </label>
            <div className="aff-seg" role="tablist" aria-label="Filter by status">
              {['all', 'active', 'inactive'].map((s) => (
                <button key={s} type="button" role="tab" aria-selected={statusFilter === s} className={statusFilter === s ? 'on' : ''} onClick={() => setStatusFilter(s)}>
                  {s[0].toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort codes">
              <option value="usage">Most sellers</option>
              <option value="newest">Newest</option>
              <option value="code">A → Z</option>
            </select>
          </div>
        </header>

        <div className="admin-table-wrap">
          <table className="aff-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Campaign</th>
                <th>Terms</th>
                <th style={{ minWidth: 190 }}>Sellers</th>
                <th>Last sign-up</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {loading && !data && (
                <tr><td colSpan="7" className="aff-td-empty">Loading security codes…</td></tr>
              )}
              {data && visibleCodes.length === 0 && (
                <tr>
                  <td colSpan="7" className="aff-td-empty">
                    {codes.length === 0 ? (
                      <>No custom codes yet. <button type="button" className="aff-link-btn" onClick={() => openCreate()}>Create your first code</button></>
                    ) : 'No code matches this search.'}
                  </td>
                </tr>
              )}
              {visibleCodes.map((c) => (
                <tr key={c._id} className={c.status !== 'active' ? 'is-off' : ''}>
                  <td>
                    <div className="aff-code-cell">
                      <span className="aff-code-chip">{c.code}</span>
                      <button type="button" className="aff-icon-btn" onClick={() => copyText(inviteUrl(c.code), c._id)} title="Copy invite link">
                        <Ic name={copied === c._id ? 'check' : 'link'} size={14} />
                      </button>
                    </div>
                  </td>
                  <td>
                    <span className="aff-desc">{c.description || <em>No description</em>}</span>
                    <small className="aff-muted">by {c.createdBy || 'Admin'} · {fmtDay(c.createdAt)}</small>
                  </td>
                  <td>
                    {c.commissionRate !== null && c.commissionRate !== undefined ? <span className="aff-pill violet">{c.commissionRate}% commission</span> : <span className="aff-muted">Standard rate</span>}
                    {c.bonusAmount > 0 && <span className="aff-pill green">+${c.bonusAmount} bonus</span>}
                  </td>
                  <td>
                    <UsageBar approved={c.approvedCount} pending={c.pendingCount} rejected={c.rejectedCount} total={c.usageCount} />
                  </td>
                  <td><span className="aff-muted">{c.lastUsedAt ? fmtDay(c.lastUsedAt) : '—'}</span></td>
                  <td>
                    <button type="button" className={`aff-status ${c.status}`} onClick={() => toggleStatus(c)} title="Click to switch">
                      <i /> {c.status === 'active' ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td>
                    <div className="aff-row-actions">
                      <button type="button" className="aff-icon-btn" onClick={() => openEdit(c)} title="Edit"><Ic name="edit" size={15} /></button>
                      <button type="button" className="aff-icon-btn danger" onClick={() => remove(c)} title="Delete"><Ic name="trash" size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ─── Create / edit modal ─── */}
      {formModal && (
        <div className="admin-modal-overlay" onClick={() => setFormModal(null)}>
          <div className="aff-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <header>
              <div>
                <h3>{formModal.mode === 'create' ? 'New security code' : `Edit ${form.code}`}</h3>
                <p>{formModal.mode === 'create' ? 'Sellers can register with it as soon as it is active.' : 'The code itself cannot be renamed: sellers already linked to it keep their link.'}</p>
              </div>
              <button type="button" className="aff-icon-btn" onClick={() => setFormModal(null)} aria-label="Close"><Ic name="x" size={16} /></button>
            </header>
            <form onSubmit={submitForm}>
              {formErr && <div className="aff-form-err">{formErr}</div>}
              <label className="aff-field">
                <span>Code *</span>
                <input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: cleanCode(e.target.value) })}
                  placeholder="e.g. PARTNER-NYC"
                  maxLength={32}
                  disabled={formModal.mode === 'edit'}
                  className="aff-mono"
                  required
                  autoFocus
                />
                <small>3-32 characters · letters, numbers, "-" and "_"</small>
              </label>
              <label className="aff-field">
                <span>Campaign / description</span>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Instagram influencer" maxLength={200} />
              </label>
              <div className="aff-field-row">
                <label className="aff-field">
                  <span>Commission %</span>
                  <input type="number" min="0" max="100" step="0.1" value={form.commissionRate} onChange={(e) => setForm({ ...form, commissionRate: e.target.value })} placeholder="Standard" />
                  <small>Pre-fills the approve form</small>
                </label>
                <label className="aff-field">
                  <span>Welcome bonus $</span>
                  <input type="number" min="0" step="1" value={form.bonusAmount} onChange={(e) => setForm({ ...form, bonusAmount: e.target.value })} placeholder="0" />
                  <small>For your records</small>
                </label>
              </div>
              <label className="aff-field">
                <span>Status</span>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="active">Active — sellers can use it</option>
                  <option value="inactive">Inactive — refused at registration</option>
                </select>
              </label>
              <footer>
                <button type="button" className="aff-btn ghost" onClick={() => setFormModal(null)}>Cancel</button>
                <button type="submit" className="aff-btn primary" disabled={saving}>{saving ? 'Saving…' : formModal.mode === 'create' ? 'Create code' : 'Save changes'}</button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {/* ─── Bulk generate modal ─── */}
      {bulkOpen && (
        <div className="admin-modal-overlay" onClick={() => setBulkOpen(false)}>
          <div className="aff-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <header>
              <div>
                <h3>Bulk generate codes</h3>
                <p>Unique random codes like <code>{(cleanCode(bulk.prefix) || 'PREFIX')}-K7QX2M</code>, one per partner or agent.</p>
              </div>
              <button type="button" className="aff-icon-btn" onClick={() => setBulkOpen(false)} aria-label="Close"><Ic name="x" size={16} /></button>
            </header>
            {bulkResult ? (
              <div className="aff-bulk-result">
                <p><b>{bulkResult.length}</b> codes created{bulk.status === 'inactive' ? ' as inactive' : ' and ready to use'}.</p>
                <div className="aff-bulk-list">
                  {bulkResult.map((c) => <span key={c} className="aff-code-chip">{c}</span>)}
                </div>
                <footer>
                  <button type="button" className="aff-btn ghost" onClick={() => copyText(bulkResult.join('\n'), 'bulk', 'Codes')}>
                    <Ic name="copy" size={15} /> Copy codes
                  </button>
                  <button type="button" className="aff-btn ghost" onClick={() => copyText(bulkResult.map(inviteUrl).join('\n'), 'bulk-links', 'Links')}>
                    <Ic name="link" size={15} /> Copy links
                  </button>
                  <button type="button" className="aff-btn primary" onClick={() => setBulkOpen(false)}>Done</button>
                </footer>
              </div>
            ) : (
              <form onSubmit={submitBulk}>
                {bulkErr && <div className="aff-form-err">{bulkErr}</div>}
                <div className="aff-field-row">
                  <label className="aff-field">
                    <span>Prefix</span>
                    <input value={bulk.prefix} onChange={(e) => setBulk({ ...bulk, prefix: cleanCode(e.target.value) })} placeholder="e.g. AGENT" maxLength={16} className="aff-mono" />
                  </label>
                  <label className="aff-field">
                    <span>How many *</span>
                    <input type="number" min="1" max="50" value={bulk.count} onChange={(e) => setBulk({ ...bulk, count: e.target.value })} required />
                    <small>1 to 50</small>
                  </label>
                </div>
                <label className="aff-field">
                  <span>Campaign / description</span>
                  <input value={bulk.description} onChange={(e) => setBulk({ ...bulk, description: e.target.value })} placeholder="e.g. Field agents — city" maxLength={200} />
                </label>
                <div className="aff-field-row">
                  <label className="aff-field">
                    <span>Commission %</span>
                    <input type="number" min="0" max="100" step="0.1" value={bulk.commissionRate} onChange={(e) => setBulk({ ...bulk, commissionRate: e.target.value })} placeholder="Standard" />
                  </label>
                  <label className="aff-field">
                    <span>Status</span>
                    <select value={bulk.status} onChange={(e) => setBulk({ ...bulk, status: e.target.value })}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </label>
                </div>
                <footer>
                  <button type="button" className="aff-btn ghost" onClick={() => setBulkOpen(false)}>Cancel</button>
                  <button type="submit" className="aff-btn primary" disabled={saving}>{saving ? 'Generating…' : `Generate ${Number(bulk.count) || 0} codes`}</button>
                </footer>
              </form>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className={`aff-toast ${toast.type}`} role="status">
          <Ic name={toast.type === 'err' ? 'alert' : 'checkCircle'} size={16} /> {toast.msg}
        </div>
      )}
    </div>
  );
}
