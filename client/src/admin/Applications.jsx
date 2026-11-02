import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, fmtDate } from '../api.js';
import { ErrorBox } from './ui.jsx';
import Ic from '../components/Icons.jsx';
import VerifiedStoreBadge from '../components/VerifiedStoreBadge.jsx';
import useLiveReload from '../useLiveReload.js';
import StoreClosures from './StoreClosures.jsx';
import { Hero, MetaChip, Badge, Avatar, Empty, pctOf } from './insights.jsx';

const DAY = 86400000;

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
  // only the rejection date says so (guessing from the word "reject" in a reason moved live
  // stores suspended for other reasons into this tab)
  if (s.status === 'suspended' && s.registrationRejectedAt) return 'rejected';
  return 'approved';
}
const OUTCOME_META = {
  pending: { label: 'Waiting for review', tone: 'warning', icon: '⏳' },
  approved: { label: 'Approved', tone: 'good', icon: '✓' },
  rejected: { label: 'Rejected', tone: 'critical', icon: '✕' },
};
const affiliateOf = (s) => s.securityDeposit?.referralCode || s.referralCode || '';
const waitingDays = (s) => Math.max(0, Math.floor((Date.now() - new Date(s.createdAt).getTime()) / DAY));

/**
 * APPLICATIONS — two tabs: new store applications, and store closure requests
 * (`?tab=closures`, see StoreClosures.jsx).
 */
export default function Applications() {
  const [params, setParams] = useSearchParams();
  const view = params.get('tab') === 'closures' ? 'closures' : 'new';
  const go = (v) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (v === 'closures') next.set('tab', 'closures');
        else next.delete('tab');
        return next;
      },
      { replace: true }
    );
  return (
    <div className="apx">
      <div className="apx-tabs" role="tablist" aria-label="Applications">
        <button type="button" role="tab" aria-selected={view === 'new'} className={view === 'new' ? 'on' : ''} onClick={() => go('new')}>
          <Ic name="badgeCheck" size={15} /> New applications
        </button>
        <button type="button" role="tab" aria-selected={view === 'closures'} className={view === 'closures' ? 'on' : ''} onClick={() => go('closures')}>
          <Ic name="lock" size={15} /> Store closures
        </button>
      </div>
      {view === 'closures' ? <StoreClosures /> : <NewApplications />}
    </div>
  );
}

function NewApplications() {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('pending');
  const [q, setQ] = useState('');
  const range = 30; // days counted for "new this week" style numbers

  const [approveModal, setApproveModal] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [kycDocModal, setKycDocModal] = useState(null);
  const [kycLoading, setKycLoading] = useState('');
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [modalError, setModalError] = useState('');

  // Team members / partners a seller can belong to (finance is divided by this owner)
  const [teamMembers, setTeamMembers] = useState([]);
  const [leadHint, setLeadHint] = useState(null); // team portal lead with this store's phone
  const [teamLoading, setTeamLoading] = useState(false);
  const approveSellerId = approveModal?.seller?._id || '';

  // Known affiliate codes (master + custom), so the approve form can say if a code is real
  const [affCodes, setAffCodes] = useState(null); // null = not loaded; [{ code, status, commissionRate }]
  useEffect(() => {
    if (!approveSellerId || affCodes) return;
    api('/sellers/affiliates')
      .then((res) => {
        const master = res?.masterAffiliateCode || res?.masterReferralCode;
        const list = (res?.affiliateCodes || []).map((c) => ({ code: c.code, status: c.status, commissionRate: c.commissionRate, description: c.description }));
        setAffCodes([...(master ? [{ code: master, status: 'active', commissionRate: null, description: 'Master code', master: true }] : []), ...list]);
      })
      .catch(() => setAffCodes([]));
  }, [approveSellerId, affCodes]);
  const findAffCode = (code) => (affCodes || []).find((c) => c.code === String(code || '').replace(/\s+/g, '').toUpperCase());

  // A first approval takes the commission of the code the seller joined with (e.g. a 5% partner
  // code). It used to open with the default 10%, and the code's rate only came in when the admin
  // retyped the code. Not done once the admin has typed a commission, nor for an approved store.
  useEffect(() => {
    if (!affCodes || !approveModal || approveModal.mode === 'edit' || approveModal.commissionTouched) return;
    const known = findAffCode(approveModal.referralCode);
    if (!known || known.commissionRate === null || known.commissionRate === undefined) return;
    if (Number(approveModal.commissionRate) === Number(known.commissionRate)) return;
    setApproveModal((prev) => (prev && prev.seller?._id === approveModal.seller?._id && !prev.commissionTouched ? { ...prev, commissionRate: known.commissionRate } : prev));
  }, [affCodes, approveModal?.seller?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!approveSellerId) return;
    let cancelled = false;
    setLeadHint(null);
    setTeamLoading(true);
    api(`/sellers/team/members?sellerId=${approveSellerId}`)
      .then((res) => {
        if (cancelled) return;
        setTeamMembers(res.members || []);
        setLeadHint(res.leadHint || null);
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

  const loadSellers = (opts) => {
    if (opts?.silent !== true) setLoading(true);
    setError('');
    api('/sellers')
      .then((data) => setSellers(Array.isArray(data) ? data : data.sellers || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSellers();
  }, []);

  // a new registration, or a decision by another admin, shows here by itself
  useLiveReload(['sellers:changed', 'seller:new_registration', 'seller:deleted'], () => loadSellers({ silent: true }));

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
      // not ticked in advance: the admin confirms the deposit really came in (a forgotten tick
      // used to record a $500 deposit that was never paid)
      securityDepositPaid: o === 'approved' ? Boolean(s.securityDeposit?.paid) : false,
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
    // managed in the seller's profile instead, so it is not unfrozen from here by accident.
    if (s.status !== 'active') {
      return (
        <Link to={`/admin/sellers?open=${s._id}&tab=upgrades`} className="ins-btn ins-btn-sm">
          Manage in seller profile
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

  const am = approveModal;

  return (
    <div className="ins-page">
      <Hero
        icon="badgeCheck"
        tone="violet"
        title="New Applications"
        subtitle="Check the KYC documents, choose the owner and security deposit, then approve or reject."
        actions={
          <button type="button" className="ins-btn" onClick={loadSellers} disabled={loading}>
            <Ic name="refresh" size={14} /> {loading ? 'Loading…' : 'Refresh'}
          </button>
        }
      >
        <MetaChip>{sellers.length} registrations</MetaChip>
        {a.counts.pending > 0 && <MetaChip>⏳ Oldest waiting {a.oldest} day{a.oldest === 1 ? '' : 's'}</MetaChip>}
        {a.approvalRate !== null && <MetaChip>{a.approvalRate}% approved</MetaChip>}
        <MetaChip>{a.test} test accounts</MetaChip>
      </Hero>

      <ErrorBox error={error} />

      {/* status tabs with their numbers (they also filter the list below) */}
      <div className="apl-status" role="tablist" aria-label="Filter applications">
        {[
          { v: 'pending', label: 'Waiting for review', n: a.counts.pending, sub: a.counts.pending ? `${a.pendingComplete} with all 5 documents` : 'All caught up', tone: 'amber' },
          { v: 'approved', label: 'Approved', n: a.counts.approved, sub: 'Stores live on Bazario', tone: 'green' },
          { v: 'rejected', label: 'Rejected', n: a.counts.rejected, sub: 'Turned down', tone: 'red' },
          { v: 'all', label: 'All', n: sellers.length, sub: `${a.week} new this week`, tone: 'slate' },
        ].map((t) => (
          <button key={t.v} type="button" role="tab" aria-selected={tab === t.v} className={`apl-stat t-${t.tone}${tab === t.v ? ' on' : ''}`} onClick={() => setTab(t.v)}>
            <span className="apl-stat-lbl">{t.label}</span>
            <b>{loading && !sellers.length ? '–' : t.n}</b>
            <small>{t.sub}</small>
          </button>
        ))}
      </div>

      <section className="apl-card" aria-labelledby="apl-title">
        <header className="apl-head">
          <div>
            <h3 id="apl-title">{{ pending: 'Waiting for review', approved: 'Approved stores', rejected: 'Rejected applications', all: 'All applications' }[tab]}</h3>
            <p aria-live="polite">{displayed.length} shown{tab === 'pending' ? ' · oldest first, so nobody waits too long' : ' · newest first'}</p>
          </div>
          <label className="apl-search">
            <Ic name="search" size={16} />
            <span className="apl-sr">Search applications</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Store, owner, email, phone or code" enterKeyHint="search" />
            {q && <button type="button" className="apl-search-clear" onClick={() => setQ('')} aria-label="Clear search">✕</button>}
          </label>
        </header>

        {loading && sellers.length === 0 && (
          <div className="apl-skel" aria-busy="true">{Array.from({ length: 3 }).map((_, i) => <span key={i} />)}</div>
        )}
        {!loading && displayed.length === 0 && (
          <Empty icon={tab === 'pending' && !q ? '🎉' : '🔍'} text={tab === 'pending' && !q ? 'No application is waiting for review.' : 'No application matches this filter.'} />
        )}

        <ul className="apl-list">
          {displayed.map((s) => {
            const o = outcomeOf(s);
            const wd = waitingDays(s);
            const docs = docButtons(s);
            const have = CORE_DOCS.filter((d) => hasKyc(s, d.key)).length;
            return (
              <li key={s._id} className={`apl-item o-${o}`}>
                <div className="apl-who">
                  <Avatar name={s.storeName} size={38} />
                  <div className="apl-who-txt">
                    <div className="apl-name">
                      <b title={s.storeName}>{s.storeName || 'Store'}</b>
                      {o === 'approved' && s.status === 'active' && <VerifiedStoreBadge variant="icon" size={13} title="Verified store" />}
                      {statusBadge(s)}
                    </div>
                    <div className="apl-sub">
                      <span>{s.ownerName || '—'}</span>
                      {s.email && <a href={`mailto:${s.email}`} title={s.email}>{s.email}</a>}
                      {s.phone ? <a href={`tel:${s.phone}`}>{s.phone}</a> : <span>No phone</span>}
                    </div>
                  </div>
                </div>

                <dl className="apl-meta">
                  <div>
                    <dt>Applied</dt>
                    <dd>{fmtDate(s.createdAt)}</dd>
                    {o === 'pending' && <dd className={`apl-wait${wd >= 3 ? ' is-late' : ''}`}>{wd === 0 ? 'Today' : `Waiting ${wd} day${wd === 1 ? '' : 's'}`}</dd>}
                    {o === 'rejected' && s.freezeReason && <dd className="apl-reason" title={s.freezeReason}>{s.freezeReason}</dd>}
                  </div>
                  <div>
                    <dt>Security code</dt>
                    <dd>{affiliateOf(s) ? <span className="apl-code">🔑 {affiliateOf(s)}</span> : 'Direct'}</dd>
                  </div>
                  <div>
                    <dt>Account</dt>
                    <dd>
                      <button type="button" onClick={() => handleToggleTest(s._id)} title="Switch between test account and client account" className={`apl-type${s.isTestAccount ? ' is-test' : ''}`}>
                        {s.isTestAccount ? '🧪 Test' : '👤 Client'} <span aria-hidden="true">⇄</span>
                      </button>
                    </dd>
                  </div>
                </dl>

                <div className="apl-docs">
                  <span className="apl-docs-lbl">
                    KYC documents <b className={have === CORE_DOCS.length ? 'ok' : 'miss'}>{have}/{CORE_DOCS.length}</b>
                  </span>
                  <div className="apl-doc-list">
                    {docs.length ? (
                      docs.map((d) => {
                        const busy = kycLoading === `${s._id}:${d.key}`;
                        return (
                          <button key={d.key} type="button" className="apl-doc" onClick={() => openKycDoc(s, d.key)} disabled={busy} title={`View ${getDocTitle(d.key)}`}>
                            {busy ? '⏳' : <Ic name="eye" size={12} />} {d.label}
                          </button>
                        );
                      })
                    ) : (
                      <span className="apl-nodocs">No documents uploaded</span>
                    )}
                  </div>
                </div>

                <div className="apl-actions">{renderActions(s)}</div>
              </li>
            );
          })}
        </ul>
      </section>

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
                {leadHint && (
                  <small style={{ display: 'block', marginTop: 6, color: am.assignedMemberId === leadHint.memberId ? '#15803d' : '#b45309', fontWeight: 600 }}>
                    {am.assignedMemberId === leadHint.memberId ? '✓ ' : '⚠ '}
                    This seller was {leadHint.memberName || 'a member'}'s lead
                    {leadHint.since ? ` (given ${new Date(leadHint.since).toLocaleDateString()})` : ''} in the team portal
                    {am.assignedMemberId === leadHint.memberId ? ', so he is pre-selected.' : '. You chose someone else — please double-check.'}
                  </small>
                )}
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
                  <input className="ins-input" type="number" min="0" max="100" value={am.commissionRate} onChange={(e) => setApproveModal({ ...am, commissionRate: e.target.value, commissionTouched: true })} required />
                </div>
              </div>

              <div className="ins-field">
                <label>Security code</label>
                <input
                  className="ins-input"
                  list="approve-affiliate-codes"
                  value={am.referralCode}
                  onChange={(e) => {
                    const code = e.target.value.replace(/\s+/g, '').toUpperCase();
                    const known = findAffCode(code);
                    setApproveModal({
                      ...am,
                      referralCode: code,
                      // a code with its own commission fills it in (still editable)
                      ...(known && known.commissionRate !== null && known.commissionRate !== undefined ? { commissionRate: known.commissionRate } : {}),
                    });
                  }}
                  placeholder="e.g. BAZARIO2026"
                />
                <datalist id="approve-affiliate-codes">
                  {(affCodes || []).filter((c) => c.status === 'active').map((c) => (
                    <option key={c.code} value={c.code}>{c.description || ''}</option>
                  ))}
                </datalist>
                {am.referralCode && affCodes && (() => {
                  const known = findAffCode(am.referralCode);
                  const color = !known ? '#b91c1c' : known.status === 'active' ? '#15803d' : '#b45309';
                  const text = !known
                    ? '✕ Unknown code — correct it or clear the field'
                    : known.status === 'active'
                    ? `✓ ${known.master ? 'Master code' : 'Valid code'}${known.commissionRate !== null && known.commissionRate !== undefined ? ` · ${known.commissionRate}% commission` : ''}`
                    : '! Code exists but is inactive';
                  return <small style={{ fontWeight: 700, color }}>{text}</small>;
                })()}
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
