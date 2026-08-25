import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, money, fmtDate } from '../api.js';
import Ic from '../components/Icons.jsx';

export default function Complaints() {
  const navigate = useNavigate();
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'at_risk' | 'warned' | 'frozen' | 'suspended' | 'healthy'

  // Compliance / Freeze & Warning & Health Modal
  const [compModalOpen, setCompModalOpen] = useState(false);
  const [compSeller, setCompSeller] = useState(null);
  const [compTab, setCompTab] = useState('freeze'); // 'freeze' | 'warn' | 'health' | 'limits'
  const [freezeStatus, setFreezeStatus] = useState('frozen');
  const [freezeReason, setFreezeReason] = useState('');
  const [warnActive, setWarnActive] = useState(true);
  const [warnLevel, setWarnLevel] = useState('warning');
  const [warnMessage, setWarnMessage] = useState('');
  const [healthScore, setHealthScore] = useState(100);
  const [healthReason, setHealthReason] = useState('');
  const [submittingComp, setSubmittingComp] = useState(false);
  const [submittingHealth, setSubmittingHealth] = useState(false);

  // Admin Direct Withdrawal Limit Settings
  const [limitMaxAmount, setLimitMaxAmount] = useState('500');
  const [limitMinAmount, setLimitMinAmount] = useState('10');
  const [limitRequiredCount, setLimitRequiredCount] = useState('10');
  const [limitSuccessCount, setLimitSuccessCount] = useState('0');
  const [limitUpgradeFee, setLimitUpgradeFee] = useState('50');
  const [limitTierName, setLimitTierName] = useState('');
  const [submittingLimitEdit, setSubmittingLimitEdit] = useState(false);

  const loadSellers = () => {
    setLoading(true);
    api('/sellers')
      .then((data) => {
        const list = Array.isArray(data) ? data : data.sellers || [];
        setSellers(list.filter((s) => s.status !== 'pending_approval'));
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSellers();
  }, []);

  const handleOpenCompliance = (seller, tab = 'freeze') => {
    setCompSeller(seller);
    setFreezeStatus(seller.status || 'active');
    setFreezeReason(seller.freezeReason || '');
    setWarnActive(Boolean(seller.warning?.active));
    setWarnLevel(seller.warning?.level || 'warning');
    setWarnMessage(seller.warning?.message || '');
    setHealthScore(seller.accountHealth?.score !== undefined ? seller.accountHealth.score : 100);
    setHealthReason('');

    const wl = seller.withdrawalLimit || {};
    setLimitMaxAmount(wl.maxAmount !== undefined ? String(wl.maxAmount) : '500');
    setLimitMinAmount(wl.minAmount !== undefined ? String(wl.minAmount) : '10');
    setLimitRequiredCount(wl.requiredWithdrawalsForIncrease !== undefined ? String(wl.requiredWithdrawalsForIncrease) : '10');
    setLimitSuccessCount(wl.successfulWithdrawalCount !== undefined ? String(wl.successfulWithdrawalCount) : '0');
    setLimitUpgradeFee(wl.upgradeFee !== undefined ? String(wl.upgradeFee) : '50');
    setLimitTierName(wl.currentTierName || 'Tier 1 - Standard ($500 Max)');
    setCompTab(tab);
    setCompModalOpen(true);

    api(`/sellers/${seller._id}`)
      .then((data) => {
        const liveSeller = data.seller || data;
        if (liveSeller) {
          setCompSeller(liveSeller);
          const liveWl = liveSeller.withdrawalLimit || {};
          setLimitMaxAmount(liveWl.maxAmount !== undefined ? String(liveWl.maxAmount) : '500');
          setLimitMinAmount(liveWl.minAmount !== undefined ? String(liveWl.minAmount) : '10');
          setLimitRequiredCount(liveWl.requiredWithdrawalsForIncrease !== undefined ? String(liveWl.requiredWithdrawalsForIncrease) : '10');
          setLimitSuccessCount(liveWl.successfulWithdrawalCount !== undefined ? String(liveWl.successfulWithdrawalCount) : '0');
          setLimitUpgradeFee(liveWl.upgradeFee !== undefined ? String(liveWl.upgradeFee) : '50');
          setLimitTierName(liveWl.currentTierName || 'Tier 1 - Standard ($500 Max)');
          if (liveSeller.accountHealth?.score !== undefined) setHealthScore(liveSeller.accountHealth.score);
        }
      })
      .catch(() => {});
  };

  const handleHealthSubmit = async (e) => {
    e.preventDefault();
    if (!compSeller) return;
    setSubmittingHealth(true);
    try {
      await api(`/sellers/${compSeller._id}/health`, {
        method: 'POST',
        body: {
          score: Number(healthScore),
          reason: healthReason.trim() || 'Health score evaluated by Platform Compliance Desk',
        },
      });
      alert(`Seller Account Health updated to ${healthScore}/100! ✅`);
      setCompModalOpen(false);
      loadSellers();
    } catch (err) {
      alert('Error updating health: ' + err.message);
    } finally {
      setSubmittingHealth(false);
    }
  };

  const handleFreezeSubmit = async (e) => {
    e.preventDefault();
    if (!compSeller) return;
    if (freezeStatus !== 'active' && !freezeReason.trim()) {
      return alert('Please enter a reason for freezing or suspending this account.');
    }
    setSubmittingComp(true);
    try {
      await api(`/sellers/${compSeller._id}/freeze`, {
        method: 'POST',
        body: {
          status: freezeStatus,
          reason: freezeReason.trim(),
        },
      });
      alert(`Seller status updated to ${freezeStatus.toUpperCase()}! ✅`);
      setCompModalOpen(false);
      loadSellers();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSubmittingComp(false);
    }
  };

  const handleWarnSubmit = async (e) => {
    e.preventDefault();
    if (!compSeller) return;
    if (warnActive && !warnMessage.trim()) {
      return alert('Please enter a warning message to display in the header announcement bar.');
    }
    setSubmittingComp(true);
    try {
      await api(`/sellers/${compSeller._id}/warn`, {
        method: 'POST',
        body: {
          active: warnActive,
          level: warnLevel,
          message: warnMessage.trim(),
        },
      });
      alert(warnActive ? 'Official warning broadcasted to seller portal! ⚠️' : 'Warning cleared! ✅');
      setCompModalOpen(false);
      loadSellers();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSubmittingComp(false);
    }
  };

  const handleLimitEditSubmit = async (e) => {
    e.preventDefault();
    if (!compSeller) return;
    setSubmittingLimitEdit(true);
    try {
      await api(`/sellers/${compSeller._id}/withdrawal-limit`, {
        method: 'POST',
        body: {
          maxAmount: Number(limitMaxAmount),
          minAmount: Number(limitMinAmount),
          requiredWithdrawalsForIncrease: Number(limitRequiredCount),
          successfulWithdrawalCount: Number(limitSuccessCount),
          upgradeFee: Number(limitUpgradeFee),
          currentTierName: limitTierName.trim(),
        },
      });
      alert(`Withdrawal limit settings updated for ${compSeller.storeName}! ✅`);
      setCompModalOpen(false);
      loadSellers();
    } catch (err) {
      alert('Error updating limits: ' + err.message);
    } finally {
      setSubmittingLimitEdit(false);
    }
  };

  const atRiskCount = sellers.filter((s) => (s.accountHealth?.score !== undefined ? s.accountHealth.score : 100) <= 30).length;
  const warnedCount = sellers.filter((s) => s.warning?.active).length;
  const frozenCount = sellers.filter((s) => s.status === 'frozen').length;
  const suspendedCount = sellers.filter((s) => s.status === 'suspended').length;
  const healthyCount = sellers.filter((s) => s.status === 'active' && (s.accountHealth?.score ?? 100) >= 80).length;

  const filtered = sellers.filter((s) => {
    const score = s.accountHealth?.score !== undefined ? s.accountHealth.score : 100;
    if (filterTab === 'at_risk' && score > 30) return false;
    if (filterTab === 'warned' && !s.warning?.active) return false;
    if (filterTab === 'frozen' && s.status !== 'frozen') return false;
    if (filterTab === 'suspended' && s.status !== 'suspended') return false;
    if (filterTab === 'healthy' && (s.status !== 'active' || score < 80)) return false;

    if (!q) return true;
    const match =
      s.storeName?.toLowerCase().includes(q.toLowerCase()) ||
      s.ownerName?.toLowerCase().includes(q.toLowerCase()) ||
      s.email?.toLowerCase().includes(q.toLowerCase());
    return match;
  });

  return (
    <div className="admin-sellers-page">
      <div className="admin-header-row">
        <div>
          <h2>🛡️ Merchant Complaints, Warnings &amp; Compliance</h2>
          <p className="muted">
            Manage policy enforcement, issue official warnings, freeze/suspend accounts, monitor seller health scores, and adjust withdrawal tiers.
          </p>
        </div>
      </div>

      {/* Summary KPI Bar */}
      <div className="admin-sellers-stats-bar" style={{ marginBottom: 18 }}>
        <div className="stat-box" style={{ borderLeft: '4px solid #dc2626' }}>
          <span className="lbl">Critical At-Risk (&le; 30%)</span>
          <b className="val" style={{ color: '#dc2626' }}>{atRiskCount}</b>
        </div>
        <div className="stat-box" style={{ borderLeft: '4px solid #d97706' }}>
          <span className="lbl">Active Warnings</span>
          <b className="val" style={{ color: '#d97706' }}>{warnedCount}</b>
        </div>
        <div className="stat-box" style={{ borderLeft: '4px solid #2563eb' }}>
          <span className="lbl">Frozen / Suspended</span>
          <b className="val" style={{ color: '#2563eb' }}>{frozenCount + suspendedCount}</b>
        </div>
        <div className="stat-box" style={{ borderLeft: '4px solid #16a34a' }}>
          <span className="lbl">Healthy Accounts (80+)</span>
          <b className="val" style={{ color: '#16a34a' }}>{healthyCount}</b>
        </div>
      </div>

      {/* Critical Alert Banner if any at-risk sellers */}
      {atRiskCount > 0 && (
        <div className="admin-health-alert-box" style={{ marginBottom: 18 }}>
          <div className="ahab-head">
            <span className="ahab-title">
              ⚠️ URGENT ACTION: {atRiskCount} Merchant Account(s) in Critical Violation Zone (&le; 30% Score)
            </span>
            <small className="muted" style={{ fontSize: 11 }}>Review order fulfillment metrics and freeze/warn violating merchants</small>
          </div>
          <div className="ahab-list">
            {sellers
              .filter((s) => (s.accountHealth?.score !== undefined ? s.accountHealth.score : 100) <= 30)
              .map((s) => {
                const score = s.accountHealth?.score || 0;
                const isSuspendTier = score <= 20;
                return (
                  <div key={s._id} className="ahab-item">
                    <div>
                      <b className="ahab-store-name">{s.storeName}</b>
                      <div className="ahab-store-score" style={{ color: isSuspendTier ? '#dc2626' : '#ea580c' }}>
                        {isSuspendTier ? `⛔ ${score}/100 (Suspension Threshold)` : `❄️ ${score}/100 (Freeze Threshold)`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenCompliance(s, 'freeze')}
                        className="ahab-btn-action"
                      >
                        {isSuspendTier ? '⛔ Suspend' : '❄️ Freeze'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenCompliance(s, 'warn')}
                        className="ahab-btn-action"
                        style={{ background: '#d97706' }}
                      >
                        ⚠️ Warn
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenCompliance(s, 'health')}
                        className="ahab-btn-action"
                        style={{ background: '#0f172a' }}
                      >
                        🛡️ Adjust
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Filter Tabs & Search */}
      <div className="wallet-action-tabs" style={{ marginBottom: 14 }}>
        <button
          type="button"
          className={`wallet-action-tab ${filterTab === 'all' ? 'active' : ''}`}
          onClick={() => setFilterTab('all')}
        >
          📋 All Merchants ({sellers.length})
        </button>
        <button
          type="button"
          className={`wallet-action-tab ${filterTab === 'at_risk' ? 'active' : ''}`}
          onClick={() => setFilterTab('at_risk')}
          style={{ color: filterTab === 'at_risk' ? undefined : atRiskCount > 0 ? '#dc2626' : undefined }}
        >
          ⚠️ Critical At-Risk ({atRiskCount})
        </button>
        <button
          type="button"
          className={`wallet-action-tab ${filterTab === 'warned' ? 'active' : ''}`}
          onClick={() => setFilterTab('warned')}
        >
          🚨 Active Warnings ({warnedCount})
        </button>
        <button
          type="button"
          className={`wallet-action-tab ${filterTab === 'frozen' ? 'active' : ''}`}
          onClick={() => setFilterTab('frozen')}
        >
          ❄️ Frozen ({frozenCount})
        </button>
        <button
          type="button"
          className={`wallet-action-tab ${filterTab === 'suspended' ? 'active' : ''}`}
          onClick={() => setFilterTab('suspended')}
        >
          ⛔ Suspended ({suspendedCount})
        </button>
        <button
          type="button"
          className={`wallet-action-tab ${filterTab === 'healthy' ? 'active' : ''}`}
          onClick={() => setFilterTab('healthy')}
        >
          🟢 Healthy ({healthyCount})
        </button>
      </div>

      <div className="table-search-row">
        <div className="search-field">
          <Ic name="search" size={16} />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search merchant by store name, owner, or email..."
          />
        </div>
      </div>

      {/* Compliance Table */}
      <div className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Merchant Store</th>
                <th>Owner &amp; Contacts</th>
                <th>Account Health</th>
                <th>Access Status</th>
                <th>Active Warning Notice</th>
                <th>Withdrawal Limit</th>
                <th>Compliance Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="7" className="text-center py-8 muted">Loading compliance records...</td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center py-8 muted">No merchant records match your filter criteria.</td>
                </tr>
              )}
              {filtered.map((s) => {
                const score = s.accountHealth?.score !== undefined ? s.accountHealth.score : 100;
                const tierBg = score >= 80 ? '#dcfce7' : score >= 31 ? '#fef9c3' : score > 20 ? '#ffedd5' : '#fee2e2';
                const tierColor = score >= 80 ? '#15803d' : score >= 31 ? '#854d0e' : score > 20 ? '#c2410c' : '#b91c1c';
                const fillBg = score >= 80 ? '#16a34a' : score >= 31 ? '#eab308' : score > 20 ? '#ea580c' : '#dc2626';

                return (
                  <tr key={s._id}>
                    <td>
                      <div className="seller-name-cell">
                        <div className="avatar-chip">{s.storeName[0]}</div>
                        <div>
                          <b>{s.storeName}</b>
                          <small className="muted block">Commission: {s.commissionRate || 10}%</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span>{s.ownerName}</span>
                      <small className="muted block">✉️ {s.email}</small>
                      <small className="muted block">📞 {s.phone || 'N/A'}</small>
                    </td>
                    <td>
                      <div
                        className="admin-health-cell"
                        onClick={() => handleOpenCompliance(s, 'health')}
                        title="Click to adjust Account Health score"
                      >
                        <span
                          className="admin-health-badge"
                          style={{ background: tierBg, color: tierColor, border: `1px solid ${tierColor}40` }}
                        >
                          {score >= 80 ? '🟢' : score >= 31 ? '🟡' : score > 20 ? '🟠' : '🔴'} {score}/100
                        </span>
                        <div className="admin-health-bar-wrap">
                          <div
                            className="admin-health-bar-fill"
                            style={{ width: `${Math.max(4, score)}%`, background: fillBg }}
                          />
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                        <span
                          style={{
                            background: s.status === 'active' ? '#ecfdf5' : s.status === 'frozen' ? '#eff6ff' : '#fef2f2',
                            color: s.status === 'active' ? '#059669' : s.status === 'frozen' ? '#2563eb' : '#dc2626',
                            border: `1px solid ${s.status === 'active' ? '#a7f3d0' : s.status === 'frozen' ? '#bfdbfe' : '#fecaca'}`,
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 12,
                            fontSize: 11,
                          }}
                        >
                          {s.status === 'active' ? '● Active' : s.status === 'frozen' ? '❄️ Frozen' : '⛔ Suspended'}
                        </span>
                        {s.freezeReason && s.status !== 'active' && (
                          <small className="muted block" style={{ fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            "{s.freezeReason}"
                          </small>
                        )}
                      </div>
                    </td>
                    <td>
                      {s.warning?.active ? (
                        <div style={{ maxWidth: 200 }}>
                          <span style={{ fontSize: 10, background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: 8, fontWeight: 700, display: 'inline-block', marginBottom: 3 }}>
                            ⚠️ Active ({s.warning.level || 'warning'})
                          </span>
                          <small className="muted block" style={{ fontSize: 11, lineHeight: 1.3 }}>
                            {s.warning.message}
                          </small>
                        </div>
                      ) : (
                        <span className="muted-sm">No Active Warnings</span>
                      )}
                    </td>
                    <td>
                      <div>
                        <b>${s.withdrawalLimit?.maxAmount || 500} Max</b>
                        <small className="muted block">{s.withdrawalLimit?.currentTierName || 'Tier 1 - Standard'}</small>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenCompliance(s, 'freeze')}
                          className="btn-action-warn"
                          title="Freeze / Suspend Account"
                          style={{
                            background: s.status !== 'active' ? '#fee2e2' : '#f8fafc',
                            color: s.status !== 'active' ? '#991b1b' : '#334155',
                            border: '1px solid #cbd5e1',
                            fontWeight: 600,
                            fontSize: 12,
                            padding: '5px 9px',
                            borderRadius: 6,
                            cursor: 'pointer',
                          }}
                        >
                          {s.status !== 'active' ? '❄️ Manage Freeze' : '❄️ Freeze / Status'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenCompliance(s, 'warn')}
                          className="btn-action-warn"
                          title="Issue or Clear Warning Announcement"
                          style={{
                            background: s.warning?.active ? '#fef3c7' : '#f8fafc',
                            color: s.warning?.active ? '#92400e' : '#334155',
                            border: '1px solid #cbd5e1',
                            fontWeight: 600,
                            fontSize: 12,
                            padding: '5px 9px',
                            borderRadius: 6,
                            cursor: 'pointer',
                          }}
                        >
                          ⚠️ Warn
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenCompliance(s, 'health')}
                          className="btn-action-warn"
                          title="Adjust Health Score (0-100)"
                          style={{
                            background: '#f8fafc',
                            color: '#0f172a',
                            border: '1px solid #cbd5e1',
                            fontWeight: 600,
                            fontSize: 12,
                            padding: '5px 9px',
                            borderRadius: 6,
                            cursor: 'pointer',
                          }}
                        >
                          🛡️ Health
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenCompliance(s, 'limits')}
                          className="btn-action-warn"
                          title="Configure Banking Tier Limits"
                          style={{
                            background: '#f8fafc',
                            color: '#2563eb',
                            border: '1px solid #cbd5e1',
                            fontWeight: 600,
                            fontSize: 12,
                            padding: '5px 9px',
                            borderRadius: 6,
                            cursor: 'pointer',
                          }}
                        >
                          💳 Limits
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate('/admin/chat')}
                          className="btn-action-view"
                          title="Open Support Chat"
                        >
                          💬 Chat
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Compliance / Freeze & Warning Modal */}
      {compModalOpen && compSeller && (
        <div className="admin-modal-overlay" onClick={() => setCompModalOpen(false)}>
          <div className="admin-modal-box" style={{ maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <div>
                <h3>🛡️ Seller Compliance &amp; Policy Controls</h3>
                <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
                  Target Store: <b>{compSeller.storeName}</b> ({compSeller.ownerName})
                </p>
              </div>
              <button onClick={() => setCompModalOpen(false)} className="btn-close-modal">✕</button>
            </div>

            {/* Modal Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', padding: '0 16px', overflowX: 'auto' }}>
              <button
                type="button"
                onClick={() => setCompTab('freeze')}
                style={{
                  padding: '10px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: compTab === 'freeze' ? '2px solid #dc2626' : '2px solid transparent',
                  fontWeight: compTab === 'freeze' ? 700 : 500,
                  color: compTab === 'freeze' ? '#dc2626' : '#64748b',
                  cursor: 'pointer',
                  fontSize: 13,
                  whiteSpace: 'nowrap',
                }}
              >
                ❄️ Freeze / Status
              </button>
              <button
                type="button"
                onClick={() => setCompTab('warn')}
                style={{
                  padding: '10px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: compTab === 'warn' ? '2px solid #d97706' : '2px solid transparent',
                  fontWeight: compTab === 'warn' ? 700 : 500,
                  color: compTab === 'warn' ? '#d97706' : '#64748b',
                  cursor: 'pointer',
                  fontSize: 13,
                  whiteSpace: 'nowrap',
                }}
              >
                ⚠️ Issue Warning
              </button>
              <button
                type="button"
                onClick={() => setCompTab('health')}
                style={{
                  padding: '10px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: compTab === 'health' ? '2px solid #16a34a' : '2px solid transparent',
                  fontWeight: compTab === 'health' ? 700 : 500,
                  color: compTab === 'health' ? '#16a34a' : '#64748b',
                  cursor: 'pointer',
                  fontSize: 13,
                  whiteSpace: 'nowrap',
                }}
              >
                🛡️ Health (0-100)
              </button>
              <button
                type="button"
                onClick={() => setCompTab('limits')}
                style={{
                  padding: '10px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: compTab === 'limits' ? '2px solid #2563eb' : '2px solid transparent',
                  fontWeight: compTab === 'limits' ? 700 : 500,
                  color: compTab === 'limits' ? '#2563eb' : '#64748b',
                  cursor: 'pointer',
                  fontSize: 13,
                  whiteSpace: 'nowrap',
                }}
              >
                💳 Withdrawal Limits
              </button>
            </div>

            <div style={{ padding: '18px 22px' }}>
              {/* TAB 1: FREEZE / ACCOUNT STATUS */}
              {compTab === 'freeze' && (
                <form onSubmit={handleFreezeSubmit}>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6, color: '#1e293b' }}>
                      Account Access Status *
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', background: freezeStatus === 'active' ? '#ecfdf5' : '#fff' }}>
                        <input
                          type="radio"
                          name="freezeStatus"
                          value="active"
                          checked={freezeStatus === 'active'}
                          onChange={(e) => setFreezeStatus(e.target.value)}
                        />
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#059669' }}>🟢 Active</span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', background: freezeStatus === 'frozen' ? '#eff6ff' : '#fff' }}>
                        <input
                          type="radio"
                          name="freezeStatus"
                          value="frozen"
                          checked={freezeStatus === 'frozen'}
                          onChange={(e) => setFreezeStatus(e.target.value)}
                        />
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#2563eb' }}>❄️ Frozen</span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', background: freezeStatus === 'suspended' ? '#fef2f2' : '#fff' }}>
                        <input
                          type="radio"
                          name="freezeStatus"
                          value="suspended"
                          checked={freezeStatus === 'suspended'}
                          onChange={(e) => setFreezeStatus(e.target.value)}
                        />
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#dc2626' }}>⛔ Suspended</span>
                      </label>
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6, color: '#1e293b' }}>
                      Reason / Policy Violation Details {freezeStatus !== 'active' ? '*' : '(Optional)'}
                    </label>
                    <textarea
                      rows="3"
                      value={freezeReason}
                      onChange={(e) => setFreezeReason(e.target.value)}
                      placeholder="e.g. Account frozen due to repeated unfulfilled orders and counterfeit customer complaints."
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, fontFamily: 'inherit' }}
                      required={freezeStatus !== 'active'}
                    />
                    <small className="muted" style={{ fontSize: 11 }}>
                      Yeh reason seller ke portal header aur official chat notification mein dikhega.
                    </small>
                  </div>

                  <div className="modal-bottom-actions" style={{ marginTop: 20 }}>
                    <button type="button" onClick={() => setCompModalOpen(false)} className="btn-cancel">Cancel</button>
                    <button
                      type="submit"
                      className={freezeStatus === 'active' ? 'btn-primary' : 'btn-danger'}
                      disabled={submittingComp}
                    >
                      {submittingComp ? 'Updating Status...' : freezeStatus === 'active' ? '✅ Unfreeze & Restore Full Access' : `⛔ Set Account to ${freezeStatus.toUpperCase()}`}
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 2: ISSUE WARNING ANNOUNCEMENT */}
              {compTab === 'warn' && (
                <form onSubmit={handleWarnSubmit}>
                  <div style={{ marginBottom: 14, background: '#fffbeb', padding: '10px 12px', border: '1px solid #fef3c7', borderRadius: 6 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#92400e' }}>
                      <input
                        type="checkbox"
                        checked={warnActive}
                        onChange={(e) => setWarnActive(e.target.checked)}
                      />
                      <span>Display Top Warning Announcement Bar on Seller Portal</span>
                    </label>
                  </div>

                  {warnActive && (
                    <>
                      <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6, color: '#1e293b' }}>
                          Warning Severity Level
                        </label>
                        <select
                          value={warnLevel}
                          onChange={(e) => setWarnLevel(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                        >
                          <option value="warning">⚠️ Standard Warning (Amber Bar)</option>
                          <option value="critical">🚨 Critical Warning (High Alert Red Bar)</option>
                          <option value="info">ℹ️ Compliance Notice (Info Bar)</option>
                        </select>
                      </div>

                      <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6, color: '#1e293b' }}>
                          Custom Warning Message *
                        </label>
                        <textarea
                          rows="3"
                          value={warnMessage}
                          onChange={(e) => setWarnMessage(e.target.value)}
                          placeholder="e.g. Warning 1/3: High cancellation rate. Please fulfill all pending shipments within 24 hours to avoid account suspension."
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, fontFamily: 'inherit' }}
                          required={warnActive}
                        />
                        <small className="muted" style={{ fontSize: 11 }}>
                          Yeh message seller portal ke top header announcement bar par live broadcast hoga.
                        </small>
                      </div>
                    </>
                  )}

                  <div className="modal-bottom-actions" style={{ marginTop: 20 }}>
                    <button type="button" onClick={() => setCompModalOpen(false)} className="btn-cancel">Cancel</button>
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={submittingComp}
                      style={{ background: warnActive ? '#d97706' : '#059669', borderColor: warnActive ? '#b45309' : '#047857' }}
                    >
                      {submittingComp ? 'Saving...' : warnActive ? '⚠️ Broadcast Warning Announcement' : '✅ Clear Warning Banner'}
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 3: ACCOUNT HEALTH RATING (0-100) */}
              {compTab === 'health' && (
                <form onSubmit={handleHealthSubmit}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '12px 16px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 16 }}>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Current Rating</span>
                      <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>
                        {compSeller.accountHealth?.score !== undefined ? compSeller.accountHealth.score : 100}/100
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Target Tier</span>
                      <div>
                        <span className={`sthp-tag health-tag-${Number(healthScore) >= 80 ? 'healthy' : Number(healthScore) >= 31 ? 'warning' : Number(healthScore) > 20 ? 'freeze' : 'suspended'}`}>
                          {Number(healthScore) >= 80 ? 'Healthy (80-100)' : Number(healthScore) >= 31 ? 'At Risk (31-79)' : Number(healthScore) > 20 ? 'Freeze Alert (21-30)' : 'Suspension Alert (0-20)'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>
                        Adjust Health Score (0 to 100) *
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={healthScore}
                        onChange={(e) => setHealthScore(Math.max(0, Math.min(100, Number(e.target.value))))}
                        style={{ width: 70, padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontWeight: 800, textAlign: 'center' }}
                      />
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={healthScore}
                      onChange={(e) => setHealthScore(Number(e.target.value))}
                      style={{ width: '100%', accentColor: Number(healthScore) >= 80 ? '#16a34a' : Number(healthScore) >= 31 ? '#eab308' : Number(healthScore) > 20 ? '#ea580c' : '#dc2626' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#94a3b8', fontWeight: 700, marginTop: 4 }}>
                      <span style={{ color: '#dc2626' }}>0 (Suspension)</span>
                      <span style={{ color: '#ea580c' }}>20-30 (Freeze)</span>
                      <span style={{ color: '#ca8a04' }}>31-79 (At Risk)</span>
                      <span style={{ color: '#16a34a' }}>80-100 (Healthy)</span>
                    </div>
                  </div>

                  {/* Quick Preset Buttons */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>
                      Quick Reason Presets:
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => {
                          setHealthScore((prev) => Math.max(0, prev - 15));
                          setHealthReason('Late order dispatch exceeds platform 48h fulfillment policy.');
                        }}
                        style={{ fontSize: 11.5, padding: '4px 8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer' }}
                      >
                        ⏱️ Late Dispatch (-15)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setHealthScore((prev) => Math.max(0, prev - 20));
                          setHealthReason('Customer complaints of counterfeit / defective items received.');
                        }}
                        style={{ fontSize: 11.5, padding: '4px 8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer' }}
                      >
                        ⚠️ Defective Item (-20)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setHealthScore((prev) => Math.max(0, prev - 30));
                          setHealthReason('Serious copyright or policy compliance violation.');
                        }}
                        style={{ fontSize: 11.5, padding: '4px 8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer' }}
                      >
                        ⛔ Policy Violation (-30)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setHealthScore((prev) => Math.min(100, prev + 15));
                          setHealthReason('Customer dispute satisfactorily resolved with refund.');
                        }}
                        style={{ fontSize: 11.5, padding: '4px 8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer' }}
                      >
                        ✅ Dispute Resolved (+15)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setHealthScore(100);
                          setHealthReason('Clean compliance slate restored by Platform Admin.');
                        }}
                        style={{ fontSize: 11.5, padding: '4px 8px', background: '#dcfce7', border: '1px solid #86efac', color: '#166534', borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}
                      >
                        🌟 Reset to 100
                      </button>
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6, color: '#1e293b' }}>
                      Reason / Notes *
                    </label>
                    <textarea
                      rows="2"
                      value={healthReason}
                      onChange={(e) => setHealthReason(e.target.value)}
                      placeholder="Enter policy reason for health score adjustment..."
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, fontFamily: 'inherit' }}
                      required
                    />
                  </div>

                  <div className="modal-bottom-actions" style={{ marginTop: 20 }}>
                    <button type="button" onClick={() => setCompModalOpen(false)} className="btn-cancel">Cancel</button>
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={submittingHealth}
                    >
                      {submittingHealth ? 'Saving...' : `💾 Save Account Health (${healthScore}/100)`}
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 4: WITHDRAWAL LIMITS & TIER CONTROLS */}
              {compTab === 'limits' && (
                <form onSubmit={handleLimitEditSubmit}>
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>Current Active Tier for {compSeller.storeName}:</span>
                      <div style={{ fontSize: 14, fontWeight: 900, color: '#14532d', marginTop: 1 }}>
                        {limitTierName || 'Tier 1 - Standard ($500 Max)'}
                      </div>
                    </div>
                    <span style={{ background: '#22c55e', color: '#ffffff', fontWeight: 800, fontSize: 11, padding: '3px 8px', borderRadius: 6 }}>
                      Max: ${Number(limitMaxAmount || 500).toLocaleString('en-US')} USD
                    </span>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 6, color: '#64748b', textTransform: 'uppercase' }}>
                      ⚡ 1-Click Banking Tier Presets:
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => {
                          setLimitMaxAmount('500');
                          setLimitMinAmount('10');
                          setLimitRequiredCount('10');
                          setLimitSuccessCount('0');
                          setLimitUpgradeFee('50');
                          setLimitTierName('Tier 1 - Standard ($500 Max)');
                        }}
                        style={{ padding: '6px 8px', fontSize: 11.5, fontWeight: 700, borderRadius: 6, border: limitMaxAmount == '500' ? '2px solid #2563eb' : '1px solid #cbd5e1', background: limitMaxAmount == '500' ? '#eff6ff' : '#ffffff', color: limitMaxAmount == '500' ? '#1d4ed8' : '#334155', cursor: 'pointer', textAlign: 'center' }}
                      >
                        🥉 Tier 1 ($500 Max)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLimitMaxAmount('1000');
                          setLimitMinAmount('10');
                          setLimitRequiredCount('10');
                          setLimitSuccessCount('0');
                          setLimitUpgradeFee('75');
                          setLimitTierName('Tier 2 - Silver Merchant ($1,000 Max)');
                        }}
                        style={{ padding: '6px 8px', fontSize: 11.5, fontWeight: 700, borderRadius: 6, border: limitMaxAmount == '1000' ? '2px solid #2563eb' : '1px solid #cbd5e1', background: limitMaxAmount == '1000' ? '#eff6ff' : '#ffffff', color: limitMaxAmount == '1000' ? '#1d4ed8' : '#334155', cursor: 'pointer', textAlign: 'center' }}
                      >
                        🥈 Tier 2 ($1,000 Max)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLimitMaxAmount('2500');
                          setLimitMinAmount('10');
                          setLimitRequiredCount('15');
                          setLimitSuccessCount('0');
                          setLimitUpgradeFee('100');
                          setLimitTierName('Tier 3 - Gold Partner ($2,500 Max)');
                        }}
                        style={{ padding: '6px 8px', fontSize: 11.5, fontWeight: 700, borderRadius: 6, border: limitMaxAmount == '2500' ? '2px solid #2563eb' : '1px solid #cbd5e1', background: limitMaxAmount == '2500' ? '#eff6ff' : '#ffffff', color: limitMaxAmount == '2500' ? '#1d4ed8' : '#334155', cursor: 'pointer', textAlign: 'center' }}
                      >
                        🥇 Tier 3 ($2,500 Max)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLimitMaxAmount('5000');
                          setLimitMinAmount('10');
                          setLimitRequiredCount('20');
                          setLimitSuccessCount('0');
                          setLimitUpgradeFee('150');
                          setLimitTierName('Tier 4 - Diamond VIP ($5,000 Max)');
                        }}
                        style={{ padding: '6px 8px', fontSize: 11.5, fontWeight: 700, borderRadius: 6, border: limitMaxAmount == '5000' ? '2px solid #2563eb' : '1px solid #cbd5e1', background: limitMaxAmount == '5000' ? '#eff6ff' : '#ffffff', color: limitMaxAmount == '5000' ? '#1d4ed8' : '#334155', cursor: 'pointer', textAlign: 'center' }}
                      >
                        💎 Tier 4 ($5,000 Max)
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                        Single Max Withdrawal Limit ($ USD) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={limitMaxAmount}
                        onChange={(e) => {
                          const val = e.target.value;
                          setLimitMaxAmount(val);
                          if (val === '500') setLimitTierName('Tier 1 - Standard ($500 Max)');
                          else if (val === '1000') setLimitTierName('Tier 2 - Silver Merchant ($1,000 Max)');
                          else if (val === '2500') setLimitTierName('Tier 3 - Gold Partner ($2,500 Max)');
                          else if (val === '5000') setLimitTierName('Tier 4 - Diamond VIP ($5,000 Max)');
                        }}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 14, fontWeight: 800, color: '#2563eb' }}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                        Minimum Allowed Payout ($ USD)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={limitMinAmount}
                        onChange={(e) => setLimitMinAmount(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                        Required Withdrawals for Next Tier *
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={limitRequiredCount}
                        onChange={(e) => setLimitRequiredCount(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                        Completed Withdrawals (Current Tier)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={limitSuccessCount}
                        onChange={(e) => setLimitSuccessCount(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, fontWeight: 800, color: '#16a34a' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                        Upgrade Processing Fee ($ USD)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={limitUpgradeFee}
                        onChange={(e) => setLimitUpgradeFee(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 14, fontWeight: 800, color: '#d97706' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                        Tier Name Label
                      </label>
                      <input
                        type="text"
                        value={limitTierName}
                        onChange={(e) => setLimitTierName(e.target.value)}
                        placeholder="e.g. Tier 1 - Standard ($500 Max)"
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                      />
                    </div>
                  </div>

                  <div className="modal-bottom-actions" style={{ marginTop: 20 }}>
                    <button type="button" onClick={() => setCompModalOpen(false)} className="btn-cancel">Cancel</button>
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={submittingLimitEdit}
                    >
                      {submittingLimitEdit ? 'Saving...' : '💾 Save Withdrawal Limit Settings'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
