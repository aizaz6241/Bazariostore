import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, Cell } from 'recharts';
import { api, fmtDate } from '../api.js';
import { ErrorBox } from './ui.jsx';
import Ic from '../components/Icons.jsx';
import VerifiedStoreBadge from '../components/VerifiedStoreBadge.jsx';
import {
  Hero, MetaChip, Kpi, KpiGrid, Card, ChartGrid, Seg, Badge, Avatar, RankList, SplitBar, ChartTip,
  Toolbar, SearchBox, Empty, Meter, SERIES, STATUS, GRID, AXIS, legendText, pctOf, delta,
} from './insights.jsx';

const DAY = 86400000;
// one hue, lighter → darker as an application waits longer
const WAIT_STEPS = ['#f7c9b5', '#ec835a', '#d95926', '#9a3412'];

const DOC_TITLES = {
  aadhaarFront: '🪪 Aadhaar Card (Front)',
  aadhaarBack: '🪪 Aadhaar Card (Back)',
  panFront: '📑 PAN Card (Front)',
  panBack: '📑 PAN Card (Back)',
  idCard: '🪪 National ID (legacy)',
  passport: '🛂 Passport (legacy)',
  bankStatement: '🏦 Bank Statement / Passbook',
};
const getDocTitle = (docType) => DOC_TITLES[docType] || '📄 KYC Document';

const kycValue = (s, docType) => {
  const k = s?.kycDocuments || {};
  if (docType === 'aadhaarFront') return k.aadhaarFront || k.idCard || k.idDocumentUrl || '';
  if (docType === 'aadhaarBack') return k.aadhaarBack || '';
  if (docType === 'panFront') return k.panFront || k.passport || k.passportDocumentUrl || '';
  if (docType === 'panBack') return k.panBack || '';
  if (docType === 'idCard') return k.idCard || k.idDocumentUrl || k.aadhaarFront || '';
  if (docType === 'passport') return k.passport || k.passportDocumentUrl || k.panFront || '';
  if (docType === 'bankStatement') return k.bankStatement || k.bankStatementUrl || '';
  return k[docType] || '';
};

const hasKyc = (s, docType) => {
  if (kycValue(s, docType)) return true;
  if (s?.kycAvailable?.[docType]) return true;
  if (docType === 'aadhaarFront' && (s?.kycAvailable?.idCard || kycValue(s, 'idCard'))) return true;
  if (docType === 'panFront' && (s?.kycAvailable?.passport || kycValue(s, 'passport'))) return true;
  if (docType === 'idCard' && (s?.kycAvailable?.aadhaarFront || kycValue(s, 'aadhaarFront'))) return true;
  if (docType === 'passport' && (s?.kycAvailable?.panFront || kycValue(s, 'panFront'))) return true;
  return false;
};

// The five documents a complete application has
const CORE_DOCS = [
  { key: 'aadhaarFront', label: 'Aadhaar front' },
  { key: 'aadhaarBack', label: 'Aadhaar back' },
  { key: 'panFront', label: 'PAN front' },
  { key: 'panBack', label: 'PAN back' },
  { key: 'bankStatement', label: 'Bank statement' },
];

// One outcome per registration, used by the tabs, the counts and the charts alike
// (before, the tab counts and the tab contents used different rules and did not match).
function outcomeOf(s) {
  if (s.status === 'pending_approval') return 'pending';
  if (s.status === 'suspended' && (s.registrationRejectedAt || /reject/i.test(s.freezeReason || ''))) return 'rejected';
  return 'approved';
}
const OUTCOME_META = {
  pending: { label: 'Waiting for review', tone: 'warning', icon: '⏳' },
  approved: { label: 'Approved', tone: 'good', icon: '✓' },
  rejected: { label: 'Rejected', tone: 'critical', icon: '✕' },
};
const affiliateOf = (s) => s.securityDeposit?.referralCode || s.referralCode || '';
const waitingDays = (s) => Math.max(0, Math.floor((Date.now() - new Date(s.createdAt).getTime()) / DAY));

export default function Applications() {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('pending');
  const [q, setQ] = useState('');
  const [range, setRange] = useState(30);

  const [approveModal, setApproveModal] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [kycDocModal, setKycDocModal] = useState(null);
  const [kycLoading, setKycLoading] = useState('');
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [modalError, setModalError] = useState('');

  // Team members / partners a seller can belong to (finance is divided by this owner)
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const approveSellerId = approveModal?.seller?._id || '';

  useEffect(() => {
    if (!approveSellerId) return;
    let cancelled = false;
    setTeamLoading(true);
    api(`/sellers/team/members?sellerId=${approveSellerId}`)
      .then((res) => {
        if (cancelled) return;
        setTeamMembers(res.members || []);
        // Pre-select the current owner, unless the admin already picked someone
        setApproveModal((prev) =>
          prev && prev.seller?._id === approveSellerId && !prev.assignedMemberId ? { ...prev, assignedMemberId: res.assignedMemberId || '' } : prev
        );
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setTeamLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [approveSellerId]);

  const openKycDoc = async (s, docType) => {
    let docUrl = kycValue(s, docType);
    if (!docUrl) {
      // only the ONE picture that was clicked is downloaded (a slow connection gets 2 minutes)
      setKycLoading(`${s._id}:${docType}`);
      try {
        const res = await api(`/sellers/${s._id}/kyc?doc=${encodeURIComponent(docType)}`, { timeout: 120000 });
        const got = res?.kycDocuments || {};
        docUrl = got[docType] || kycValue({ kycDocuments: got }, docType);
        // keep it in memory so the next click is instant
        if (docUrl) setSellers((prev) => prev.map((it) => (it._id === s._id ? { ...it, kycDocuments: { ...(it.kycDocuments || {}), [docType]: docUrl } } : it)));
      } catch (e) {
        alert('Could not load this document: ' + (e.message || 'Network error'));
        return;
      } finally {
        setKycLoading('');
      }
    }
    if (!docUrl) {
      alert(`No ${getDocTitle(docType)} found for this applicant.`);
      return;
    }
    setKycDocModal({ seller: s, docType, docUrl, title: getDocTitle(docType) });
  };

  const loadSellers = () => {
    setLoading(true);
    setError('');
    api('/sellers')
      .then((data) => setSellers(Array.isArray(data) ? data : data.sellers || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSellers();
  }, []);

  const handleToggleTest = async (sellerId) => {
    try {
      const res = await api(`/sellers/${sellerId}/toggle-test`, { method: 'PATCH' });
      // On an approved seller this change waits for the other partner: nothing changed yet
      if (res.pendingApproval) {
        alert(res.message);
        return;
      }
      setSellers((prev) => prev.map((s) => (s._id === sellerId ? { ...s, isTestAccount: res.seller?.isTestAccount, accountType: res.seller?.accountType } : s)));
    } catch (err) {
      alert('Could not change the account type: ' + err.message);
    }
  };

  const openApprove = (s) => {
    const o = outcomeOf(s);
    setModalError('');
    setApproveModal({
      seller: s,
      mode: o === 'approved' ? 'edit' : o === 'rejected' ? 'reapprove' : 'approve',
      securityDepositAmount: o === 'approved' ? s.securityDeposit?.amount ?? 500 : 500,
      securityDepositPaid: o === 'approved' ? Boolean(s.securityDeposit?.paid) : true,
      referralCode: affiliateOf(s),
      commissionRate: s.commissionRate ?? 10,
      isTestAccount: Boolean(s.isTestAccount),
      // sent back unchanged unless the admin flips it (it used to be sent as "false" every time,
      // which on a previous-store seller opened a needless two-person change request)
      isPreviousStoreSeller: Boolean(s.isPreviousStoreSeller),
      assignedMemberId: '',
    });
  };

  const handleApproveSubmit = async (e) => {
    e.preventDefault();
    if (!approveModal?.seller) return;
    setModalError('');
    if (!approveModal.isTestAccount && !approveModal.assignedMemberId) {
      setModalError('Please choose who this seller is assigned to (Assigned To).');
      return;
    }
    setApproving(true);
    try {
      const res = await api(`/sellers/${approveModal.seller._id}/approve`, {
        method: 'POST',
        body: {
          securityDepositAmount: Number(approveModal.securityDepositAmount || 0),
          securityDepositPaid: Boolean(approveModal.securityDepositPaid),
          assignedReferralCode: approveModal.referralCode?.trim() || '',
          commissionRate: Number(approveModal.commissionRate ?? 10),
          isTestAccount: Boolean(approveModal.isTestAccount),
          accountType: approveModal.isTestAccount ? 'test' : 'client',
          isPreviousStoreSeller: Boolean(approveModal.isPreviousStoreSeller),
          assignedMemberId: approveModal.assignedMemberId || '',
        },
      });
      // An owner / account-type change on an already approved seller waits for the other partner
      if (res?.pendingApproval) alert(res.message);
      setApproveModal(null);
      loadSellers();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setApproving(false);
    }
  };

  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!rejectModal?.seller) return;
    setModalError('');
    setRejecting(true);
    try {
      await api(`/sellers/${rejectModal.seller._id}/reject`, {
        method: 'POST',
        body: {
          reason: rejectModal.reason?.trim() || 'Application does not meet platform merchant criteria.',
          isTestAccount: Boolean(rejectModal.isTestAccount),
          accountType: rejectModal.isTestAccount ? 'test' : 'client',
        },
      });
      setRejectModal(null);
      loadSellers();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setRejecting(false);
    }
  };

  // ── Analytics (everything comes from the one sellers list)
  const a = useMemo(() => {
    const now = Date.now();
    const counts = { pending: 0, approved: 0, rejected: 0 };
    const startDay = new Date(new Date().setHours(0, 0, 0, 0)).getTime() - (range - 1) * DAY;
    const days = [];
    for (let i = 0; i < range; i++) {
      const d = new Date(startDay + i * DAY);
      days.push({ t: d.getTime(), label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), pending: 0, approved: 0, rejected: 0 });
    }
    const waits = [
      { label: '< 1 day', max: 1, count: 0 },
      { label: '1–3 days', max: 3, count: 0 },
      { label: '3–7 days', max: 7, count: 0 },
      { label: '7+ days', max: Infinity, count: 0 },
    ];
    const docs = Object.fromEntries(CORE_DOCS.map((d) => [d.key, 0]));
    const codes = new Map();
    let pendingComplete = 0;
    let oldest = 0;
    let week = 0;
    let prevWeek = 0;
    let test = 0;
    sellers.forEach((s) => {
      const o = outcomeOf(s);
      counts[o] += 1;
      if (s.isTestAccount) test += 1;
      const created = new Date(s.createdAt).getTime();
      const age = (now - created) / DAY;
      if (age < 7) week += 1;
      else if (age < 14) prevWeek += 1;
      if (created >= startDay) {
        const idx = Math.floor((created - startDay) / DAY);
        if (days[idx]) days[idx][o] += 1;
      }
      const code = affiliateOf(s);
      if (code) {
        const c = codes.get(code) || { key: code, label: code, value: 0, approved: 0 };
        c.value += 1;
        if (o === 'approved') c.approved += 1;
        codes.set(code, c);
      }
      if (o === 'pending') {
        const wd = waitingDays(s);
        oldest = Math.max(oldest, wd);
        waits.find((w) => age < w.max).count += 1;
        let n = 0;
        CORE_DOCS.forEach((d) => {
          if (hasKyc(s, d.key)) {
            docs[d.key] += 1;
            n += 1;
          }
        });
        if (n === CORE_DOCS.length) pendingComplete += 1;
      }
    });
    const decided = counts.approved + counts.rejected;
    return {
      counts,
      days,
      waits,
      oldest,
      week,
      prevWeek,
      test,
      pendingComplete,
      approvalRate: decided ? pctOf(counts.approved, decided) : null,
      docRows: CORE_DOCS.map((d) => ({ ...d, n: docs[d.key], pct: pctOf(docs[d.key], counts.pending) })),
      codes: [...codes.values()].sort((x, y) => y.value - x.value).slice(0, 6).map((c) => ({ ...c, sub: `${c.approved} approved` })),
      inRange: days.reduce((acc, d) => acc + d.pending + d.approved + d.rejected, 0),
    };
  }, [sellers, range]);

  const displayed = sellers
    .filter((s) => {
      if (tab !== 'all' && outcomeOf(s) !== tab) return false;
      if (!q.trim()) return true;
      const needle = q.trim().toLowerCase();
      return [s.storeName, s.ownerName, s.email, s.phone, affiliateOf(s)].some((v) => String(v ?? '').toLowerCase().includes(needle));
    })
    // waiting applications oldest first (first come, first served); others newest first
    .sort((x, y) => (tab === 'pending' ? 1 : -1) * (new Date(x.createdAt) - new Date(y.createdAt)));

  const docButtons = (s) => {
    const hasAadhaarFront = hasKyc(s, 'aadhaarFront');
    const hasPanFront = hasKyc(s, 'panFront');
    return [
      { key: 'aadhaarFront', label: 'Aadhaar F', show: hasAadhaarFront },
      { key: 'aadhaarBack', label: 'Aadhaar B', show: hasKyc(s, 'aadhaarBack') },
      { key: 'panFront', label: 'PAN F', show: hasPanFront },
      { key: 'panBack', label: 'PAN B', show: hasKyc(s, 'panBack') },
      { key: 'idCard', label: 'ID', show: hasKyc(s, 'idCard') && !hasAadhaarFront },
      { key: 'passport', label: 'Passport', show: hasKyc(s, 'passport') && !hasPanFront },
      { key: 'bankStatement', label: 'Bank', show: hasKyc(s, 'bankStatement') },
    ].filter((d) => d.show);
  };

  const renderDocs = (s) => {
    const list = docButtons(s);
    if (!list.length) return <span className="ins-sub">No documents</span>;
    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 230 }}>
        {list.map((d) => {
          const busy = kycLoading === `${s._id}:${d.key}`;
          return (
            <button key={d.key} type="button" className="ins-btn ins-btn-sm" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => openKycDoc(s, d.key)} disabled={busy} title={`View ${getDocTitle(d.key)}`}>
              {busy ? '⏳' : <Ic name="eye" size={11} />} {d.label}
            </button>
          );
        })}
      </div>
    );
  };

  const renderActions = (s) => {
    const o = outcomeOf(s);
    if (o === 'pending') {
      return (
        <>
          <button type="button" className="ins-btn ins-btn-sm ins-btn-good" onClick={() => openApprove(s)}>
            <Ic name="check" size={12} /> Approve
          </button>
          <button type="button" className="ins-btn ins-btn-sm ins-btn-bad" onClick={() => { setModalError(''); setRejectModal({ seller: s, reason: '', isTestAccount: Boolean(s.isTestAccount) }); }}>
            Reject
          </button>
        </>
      );
    }
    if (o === 'rejected') {
      return (
        <button type="button" className="ins-btn ins-btn-sm" onClick={() => openApprove(s)}>
          Re-approve
        </button>
      );
    }
    // Saving the approval form sets the store to "active": a frozen or suspended store is
    // managed on the Complaints page instead, so it is not unfrozen from here by accident.
    if (s.status !== 'active') {
      return (
        <Link to="/admin/complaints" className="ins-btn ins-btn-sm">
          Manage in Complaints
        </Link>
      );
    }
    return (
      <button type="button" className="ins-btn ins-btn-sm" onClick={() => openApprove(s)}>
        Edit deposit &amp; settings
      </button>
    );
  };

  const statusBadge = (s) => {
    const o = outcomeOf(s);
    if (o === 'approved' && s.status !== 'active') {
      return <Badge tone={s.status === 'frozen' ? 'info' : 'critical'} icon={s.status === 'frozen' ? '❄' : '⛔'}>{s.status === 'frozen' ? 'Frozen' : 'Suspended'}</Badge>;
    }
    const m = OUTCOME_META[o];
    return <Badge tone={m.tone} icon={m.icon}>{m.label}</Badge>;
  };

  const weekChange = delta(a.week, a.prevWeek);
  const am = approveModal;

  return (
    <div className="ins-page">
      <Hero
        icon="badgeCheck"
        tone="violet"
        title="New Applications"
        subtitle="Review new store registrations: check the KYC documents, set the security deposit and owner, then approve or reject. Oldest applications are shown first so nobody waits too long."
        actions={
          <button type="button" className="ins-btn" onClick={loadSellers} disabled={loading}>
            <Ic name="refresh" size={14} /> {loading ? 'Loading…' : 'Refresh'}
          </button>
        }
      >
        <MetaChip>{sellers.length} registrations</MetaChip>
        {a.counts.pending > 0 && <MetaChip>⏳ Oldest waiting {a.oldest} day{a.oldest === 1 ? '' : 's'}</MetaChip>}
        <MetaChip>{a.test} test accounts</MetaChip>
      </Hero>

      <ErrorBox error={error} />

      <KpiGrid dim={loading && sellers.length > 0}>
        <Kpi icon="clock" tone="orange" label="Waiting for review" value={a.counts.pending} sub={a.counts.pending ? `${a.pendingComplete} with all 5 KYC documents` : 'All caught up 🎉'} onClick={() => setTab('pending')} active={tab === 'pending'} />
        <Kpi icon="checkCircle" tone="green" label="Approved" value={a.counts.approved} sub="Stores live on the platform" onClick={() => setTab('approved')} active={tab === 'approved'} />
        <Kpi icon="x" tone="red" label="Rejected" value={a.counts.rejected} sub="Registrations turned down" onClick={() => setTab('rejected')} active={tab === 'rejected'} />
        <Kpi icon="badgeCheck" tone="violet" label="Approval rate" value={a.approvalRate === null ? '—' : `${a.approvalRate}%`} sub="Of all decided applications" />
        <Kpi icon="sparkle" tone="blue" label="New this week" value={a.week} change={weekChange} sub={`${a.prevWeek} the week before`} />
      </KpiGrid>

      {sellers.length > 0 && (
        <ChartGrid dim={loading}>
          <Card
            title="Registrations per day"
            hint={`${a.inRange} in the last ${range} days, coloured by where they stand now`}
            wide
            actions={<Seg small label="Time range" value={range} onChange={setRange} options={[{ value: 14, label: '14d' }, { value: 30, label: '30d' }, { value: 90, label: '90d' }]} />}
          >
            {a.inRange === 0 ? (
              <Empty text={`No registrations in the last ${range} days`} />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={a.days} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" {...AXIS} minTickGap={16} />
                  <YAxis {...AXIS} allowDecimals={false} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTip />} />
                  <Legend iconType="square" formatter={legendText} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="approved" name="Approved" stackId="a" fill={STATUS.good} maxBarSize={18} stroke="#fff" strokeWidth={1} />
                  <Bar dataKey="pending" name="Waiting" stackId="a" fill={STATUS.warning} maxBarSize={18} stroke="#fff" strokeWidth={1} />
                  <Bar dataKey="rejected" name="Rejected" stackId="a" fill={STATUS.critical} radius={[4, 4, 0, 0]} maxBarSize={18} stroke="#fff" strokeWidth={1} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card title="Outcome of all applications" hint={`${sellers.length} registrations`}>
            <SplitBar
              height={14}
              parts={[
                { label: '✓ Approved', value: a.counts.approved, color: STATUS.good },
                { label: '⏳ Waiting', value: a.counts.pending, color: STATUS.warning },
                { label: '✕ Rejected', value: a.counts.rejected, color: STATUS.critical },
              ]}
            />
          </Card>

          <Card title="How long applications are waiting" hint={`${a.counts.pending} waiting now`} empty={!a.counts.pending && 'Nothing waiting — all caught up'}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={a.waits} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" {...AXIS} />
                <YAxis {...AXIS} allowDecimals={false} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTip />} />
                <Bar dataKey="count" name="Applications" radius={[4, 4, 0, 0]} maxBarSize={38}>
                  {a.waits.map((w, i) => (
                    <Cell key={w.label} fill={WAIT_STEPS[i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="KYC documents of waiting applicants" hint="Share of waiting applicants who uploaded each one" empty={!a.counts.pending && 'Nothing waiting'}>
            <ul className="ins-stats">
              {a.docRows.map((d) => (
                <li key={d.key}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span>{d.label}</span>
                      <span className="ins-sub">{d.n}/{a.counts.pending}</span>
                    </span>
                    <Meter value={d.pct} color={SERIES[0]} height={6} label={`${d.pct}% uploaded`} />
                  </span>
                  <b style={{ width: 48, textAlign: 'right' }}>{d.pct}%</b>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Top affiliate codes" hint="Registrations per code">
            <RankList rows={a.codes} color={SERIES[6]} format={(v) => `${v}`} empty="No affiliate codes used yet" />
          </Card>
        </ChartGrid>
      )}

      <div className="ins-table-card">
        <div className="ins-table-head">
          <div>
            <h3>📋 Applications</h3>
            <span className="ins-card-hint">{displayed.length} shown{tab === 'pending' ? ' · oldest first' : ' · newest first'}</span>
          </div>
          <Toolbar>
            <Seg
              label="Filter by outcome"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'pending', label: 'Waiting', count: a.counts.pending },
                { value: 'approved', label: 'Approved', count: a.counts.approved },
                { value: 'rejected', label: 'Rejected', count: a.counts.rejected },
                { value: 'all', label: 'All', count: sellers.length },
              ]}
            />
            <SearchBox value={q} onChange={setQ} placeholder="Search store, owner, email, phone, code…" />
          </Toolbar>
        </div>

        <div className="ins-table-scroll ins-hide-mobile">
          <table className="ins-table">
            <thead>
              <tr>
                <th>Applicant</th>
                <th>Contact</th>
                <th>KYC documents</th>
                <th>Affiliate</th>
                <th>Applied</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && sellers.length === 0 &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j}><span className="ins-skel" style={{ width: `${45 + ((i + j) % 4) * 13}%` }} /></td>
                    ))}
                  </tr>
                ))}
              {!loading && displayed.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <Empty icon={tab === 'pending' ? '🎉' : '🔍'} text={tab === 'pending' && !q ? 'No application is waiting for review.' : 'No application matches this filter.'} />
                  </td>
                </tr>
              )}
              {displayed.map((s) => {
                const o = outcomeOf(s);
                const wd = waitingDays(s);
                return (
                  <tr key={s._id}>
                    <td>
                      <div className="ins-cell-who">
                        <Avatar name={s.storeName} />
                        <div>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <b className="ins-clip">{s.storeName || 'Store'}</b>
                            {o === 'approved' && s.status === 'active' && <VerifiedStoreBadge variant="icon" size={13} title="Verified store" />}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleToggleTest(s._id)}
                            title="Switch between test account and client account"
                            className={`ins-badge ins-badge-${s.isTestAccount ? 'violet' : 'neutral'}`}
                            style={{ cursor: 'pointer', marginTop: 3, width: 'fit-content' }}
                          >
                            {s.isTestAccount ? '🧪 Test' : '👤 Client'} ⇄
                          </button>
                        </div>
                      </div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span className="ins-strong">{s.ownerName || '—'}</span>
                      <span className="ins-sub ins-clip">{s.email}</span>
                      <span className="ins-sub">{s.phone || 'No phone'}</span>
                    </td>
                    <td>{renderDocs(s)}</td>
                    <td>{affiliateOf(s) ? <Badge tone="info">🔑 {affiliateOf(s)}</Badge> : <span className="ins-sub">Direct</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span>{fmtDate(s.createdAt)}</span>
                      {o === 'pending' && (
                        <span className="ins-sub" style={{ color: wd >= 3 ? '#a5461f' : undefined, fontWeight: wd >= 3 ? 700 : 400 }}>
                          {wd === 0 ? 'Today' : `Waiting ${wd} day${wd === 1 ? '' : 's'}`}
                        </span>
                      )}
                      {o === 'rejected' && s.freezeReason && <span className="ins-sub ins-clip" title={s.freezeReason}>{s.freezeReason}</span>}
                    </td>
                    <td>{statusBadge(s)}</td>
                    <td>
                      <div className="ins-actions">{renderActions(s)}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="ins-cards">
          {displayed.map((s) => (
            <div className="ins-mcard" key={s._id}>
              <div className="ins-cell-who">
                <Avatar name={s.storeName} size={30} />
                <div style={{ flex: 1 }}>
                  <b>{s.storeName}</b>
                  <span className="ins-sub">{s.ownerName} · {fmtDate(s.createdAt)}</span>
                </div>
                {statusBadge(s)}
              </div>
              <div className="ins-mcard-row">
                <span>Contact</span>
                <span className="ins-clip" style={{ maxWidth: 200 }}>{s.email}</span>
              </div>
              <div>{renderDocs(s)}</div>
              <div className="ins-actions" style={{ justifyContent: 'flex-start' }}>{renderActions(s)}</div>
            </div>
          ))}
          {!loading && displayed.length === 0 && <Empty text="No application matches this filter." />}
        </div>
      </div>

      {/* ─── Approve / edit ─── */}
      {am && (
        <div className="admin-modal-overlay" onClick={() => !approving && setApproveModal(null)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="ins-modal-head">
              <div>
                <h3>{am.mode === 'edit' ? 'Edit store settings' : am.mode === 'reapprove' ? 'Re-approve store' : 'Approve store'}: {am.seller.storeName}</h3>
                <p>{am.seller.ownerName} · {am.seller.email}</p>
              </div>
              <button type="button" className="ins-modal-close" onClick={() => setApproveModal(null)} aria-label="Close">✕</button>
            </div>

            <form className="ins-form" onSubmit={handleApproveSubmit}>
              <div className="ins-field">
                <label>Assigned to {am.isTestAccount ? '(optional for a test account)' : '*'}</label>
                <select
                  className="ins-input"
                  value={am.assignedMemberId || ''}
                  onChange={(e) => setApproveModal({ ...am, assignedMemberId: e.target.value })}
                  required={!am.isTestAccount}
                  disabled={teamLoading}
                >
                  <option value="">{teamLoading ? 'Loading team…' : 'Select partner or team member…'}</option>
                  {teamMembers.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name} — {m.role === 'partner' ? 'Partner' : m.deal === 'inr_50' ? '50% member' : '1:1 PKR member'}
                    </option>
                  ))}
                </select>
                <small>Who this store belongs to. Its deposits and withdrawals are divided for this person, so a client store must have one.</small>
              </div>

              <div className="ins-switch-row">
                <div>
                  <b>{am.isTestAccount ? '🧪 Test account' : '👤 Client account'}</b>
                  <small>{am.isTestAccount ? 'Internal testing — left out of every finance total' : 'Real store — counted in finance totals'}</small>
                </div>
                <button type="button" className="ins-btn ins-btn-sm" onClick={() => setApproveModal({ ...am, isTestAccount: !am.isTestAccount })}>
                  Switch to {am.isTestAccount ? 'client' : 'test'}
                </button>
              </div>

              <div className="ins-switch-row">
                <div>
                  <b>{am.isPreviousStoreSeller ? '🏛️ Previous-store seller' : '✨ Current-store seller'}</b>
                  <small>Previous-store sellers are left out of the client totals</small>
                </div>
                <button type="button" className="ins-btn ins-btn-sm" onClick={() => setApproveModal({ ...am, isPreviousStoreSeller: !am.isPreviousStoreSeller })}>
                  Switch
                </button>
              </div>

              {am.mode !== 'approve' && (
                <div className="ins-callout ins-callout-info">
                  <span aria-hidden="true">ℹ️</span>
                  <span>This store was approved before: a change of account type, previous-store setting or owner is sent to the other partner for approval first.</span>
                </div>
              )}

              <div className="ins-switch-row">
                <div>
                  <b>Security deposit paid</b>
                  <small>Recorded in the seller's wallet as collateral</small>
                </div>
                <input type="checkbox" checked={am.securityDepositPaid} onChange={(e) => setApproveModal({ ...am, securityDepositPaid: e.target.checked })} style={{ width: 20, height: 20, cursor: 'pointer' }} />
              </div>

              <div className="ins-form-grid">
                <div className="ins-field">
                  <label>Security deposit (USD)</label>
                  <input className="ins-input" type="number" min="0" step="1" value={am.securityDepositAmount} disabled={!am.securityDepositPaid} onChange={(e) => setApproveModal({ ...am, securityDepositAmount: e.target.value })} />
                </div>
                <div className="ins-field">
                  <label>Commission rate (%)</label>
                  <input className="ins-input" type="number" min="0" max="100" value={am.commissionRate} onChange={(e) => setApproveModal({ ...am, commissionRate: e.target.value })} required />
                </div>
              </div>

              <div className="ins-field">
                <label>Affiliate code</label>
                <input className="ins-input" value={am.referralCode} onChange={(e) => setApproveModal({ ...am, referralCode: e.target.value.toUpperCase() })} placeholder="e.g. BAZARIO2026" />
              </div>

              {modalError && <ErrorBox error={modalError} />}

              <div className="ins-modal-foot">
                <button type="button" className="ins-btn" onClick={() => setApproveModal(null)} disabled={approving}>Cancel</button>
                <button type="submit" className="ins-btn ins-btn-primary" disabled={approving}>
                  {approving ? 'Saving…' : am.mode === 'edit' ? 'Save settings' : 'Approve & send welcome'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Reject ─── */}
      {rejectModal && (
        <div className="admin-modal-overlay" onClick={() => !rejecting && setRejectModal(null)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="ins-modal-head">
              <div>
                <h3>Reject application: {rejectModal.seller.storeName}</h3>
                <p>The reason is saved on the store and shown to the seller.</p>
              </div>
              <button type="button" className="ins-modal-close" onClick={() => setRejectModal(null)} aria-label="Close">✕</button>
            </div>
            <form className="ins-form" onSubmit={handleRejectSubmit}>
              <div className="ins-field">
                <span className="ins-label">Common reasons</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {['KYC documents are blurry or unreadable.', 'Name on the documents does not match the application.', 'Bank statement is missing or invalid.', 'Duplicate registration.'].map((r) => (
                    <button key={r} type="button" className="ins-btn ins-btn-sm" onClick={() => setRejectModal({ ...rejectModal, reason: r })}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ins-field">
                <label>Reason *</label>
                <textarea className="ins-input" rows={4} value={rejectModal.reason} onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })} placeholder="e.g. Submitted ID documents are blurry. Please re-apply with clear copies." required />
              </div>
              <div className="ins-switch-row">
                <div>
                  <b>{rejectModal.isTestAccount ? '🧪 Test account' : '👤 Client account'}</b>
                  <small>Account type recorded with this registration</small>
                </div>
                <button type="button" className="ins-btn ins-btn-sm" onClick={() => setRejectModal({ ...rejectModal, isTestAccount: !rejectModal.isTestAccount })}>
                  Switch
                </button>
              </div>
              {modalError && <ErrorBox error={modalError} />}
              <div className="ins-modal-foot">
                <button type="button" className="ins-btn" onClick={() => setRejectModal(null)} disabled={rejecting}>Cancel</button>
                <button type="submit" className="ins-btn ins-btn-bad" disabled={rejecting}>
                  {rejecting ? 'Rejecting…' : 'Reject application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── KYC document viewer ─── */}
      {kycDocModal && (
        <div className="admin-modal-overlay" onClick={() => setKycDocModal(null)}>
          <div className="admin-modal-box large" onClick={(e) => e.stopPropagation()}>
            <div className="ins-modal-head">
              <div>
                <h3>{kycDocModal.title}</h3>
                <p>{kycDocModal.seller.storeName} · {kycDocModal.seller.ownerName} · {kycDocModal.seller.email}</p>
              </div>
              <button type="button" className="ins-modal-close" onClick={() => setKycDocModal(null)} aria-label="Close">✕</button>
            </div>
            <div style={{ padding: 16, textAlign: 'center', background: '#0f172a', borderRadius: 12 }}>
              {kycDocModal.docUrl?.toLowerCase().endsWith('.pdf') || kycDocModal.docUrl?.startsWith('data:application/pdf') ? (
                <div style={{ padding: '30px 20px', color: '#fff' }}>
                  <p style={{ fontSize: 15, marginBottom: 14 }}>📄 PDF document</p>
                  <a href={kycDocModal.docUrl} target="_blank" rel="noreferrer" className="ins-btn ins-btn-primary">
                    Open PDF in a new window ↗
                  </a>
                </div>
              ) : (
                <>
                  <img src={kycDocModal.docUrl} alt={kycDocModal.title} style={{ maxWidth: '100%', maxHeight: 520, objectFit: 'contain', borderRadius: 8 }} />
                  <div style={{ marginTop: 10 }}>
                    <a href={kycDocModal.docUrl} target="_blank" rel="noreferrer" style={{ color: '#93c5fd', fontSize: 12, fontWeight: 600 }}>
                      Open full size ↗
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
