import { useEffect, useState } from 'react';
import { api, fmtDate, money } from '../api.js';
import Ic from '../components/Icons.jsx';

export default function Referrals() {
  const [masterRefCode, setMasterRefCode] = useState('');
  const [masterUsageCount, setMasterUsageCount] = useState(0);
  const [referralCodes, setReferralCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingMasterRef, setSavingMasterRef] = useState(false);
  const [copiedCode, setCopiedCode] = useState('');

  // Create Custom Referral Code Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    code: '',
    description: '',
    commissionRate: '',
    bonusAmount: '',
    status: 'active',
  });
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState('');

  const loadData = () => {
    setLoading(true);
    api('/sellers/referrals')
      .then((res) => {
        if (res?.masterReferralCode) setMasterRefCode(res.masterReferralCode);
        setMasterUsageCount(res?.masterUsageCount || 0);
        setReferralCodes(res?.referralCodes || []);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveMasterReferral = async (e) => {
    e.preventDefault();
    setSavingMasterRef(true);
    try {
      const res = await api('/sellers/master-referral', {
        method: 'POST',
        body: { code: masterRefCode.trim().toUpperCase() },
      });
      setMasterRefCode(res.masterReferralCode);
      alert('✅ Master Referral Code updated successfully!');
      loadData();
    } catch (err) {
      alert('Error updating referral code: ' + err.message);
    } finally {
      setSavingMasterRef(false);
    }
  };

  const handleCreateReferralSubmit = async (e) => {
    e.preventDefault();
    setCreating(true);
    setCreateErr('');
    try {
      await api('/sellers/referrals', {
        method: 'POST',
        body: createForm,
      });
      alert(`🎉 Referral code "${createForm.code.toUpperCase()}" created successfully!`);
      setCreateModalOpen(false);
      setCreateForm({
        code: '',
        description: '',
        commissionRate: '',
        bonusAmount: '',
        status: 'active',
      });
      loadData();
    } catch (err) {
      setCreateErr(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleToggleStatus = async (id) => {
    try {
      await api(`/sellers/referrals/${id}/toggle`, { method: 'PATCH' });
      loadData();
    } catch (err) {
      alert('Error toggling status: ' + err.message);
    }
  };

  const handleDeleteReferral = async (id, code) => {
    if (!window.confirm(`Are you sure you want to delete referral code "${code}"?`)) return;
    try {
      await api(`/sellers/referrals/${id}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      alert('Error deleting code: ' + err.message);
    }
  };

  const copyToClipboard = (text, identifier) => {
    const url = typeof window !== 'undefined'
      ? `${window.location.origin}/seller/login?ref=${encodeURIComponent(text)}`
      : `https://bazario.com/seller/login?ref=${encodeURIComponent(text)}`;

    navigator.clipboard.writeText(url).then(() => {
      setCopiedCode(identifier || text);
      setTimeout(() => setCopiedCode(''), 2200);
    });
  };

  const totalRegisteredViaReferrals = masterUsageCount + referralCodes.reduce((acc, r) => acc + (r.usageCount || 0), 0);

  return (
    <div className="admin-sellers-page">
      <div className="admin-header-row">
        <div>
          <h2>🔑 Platform Referral Codes &amp; Merchant Onboarding Invites</h2>
          <p className="muted">
            Create custom referral invite codes for marketing campaigns, agency partners, and onboarding discounts. Sellers can register with any active referral code.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setCreateErr(''); setCreateModalOpen(true); }}
          className="btn-primary"
        >
          <Ic name="plus" size={16} /> + Create New Referral Code
        </button>
      </div>

      {/* Summary KPI Bar */}
      <div className="admin-sellers-stats-bar" style={{ marginBottom: 20 }}>
        <div className="stat-box" style={{ borderLeft: '4px solid #2563eb' }}>
          <span className="lbl">Master Referral Code</span>
          <b className="val" style={{ color: '#2563eb', fontSize: 18 }}>{masterRefCode || 'REF-BAZARIO-2026'}</b>
        </div>
        <div className="stat-box" style={{ borderLeft: '4px solid #16a34a' }}>
          <span className="lbl">Active Custom Codes</span>
          <b className="val" style={{ color: '#16a34a' }}>{referralCodes.filter((r) => r.status === 'active').length}</b>
        </div>
        <div className="stat-box" style={{ borderLeft: '4px solid #d97706' }}>
          <span className="lbl">Total Merchants Onboarded</span>
          <b className="val" style={{ color: '#d97706' }}>{totalRegisteredViaReferrals} Merchants</b>
        </div>
        <div className="stat-box" style={{ borderLeft: '4px solid #0f172a' }}>
          <span className="lbl">Total Campaign Codes</span>
          <b className="val">{referralCodes.length + 1}</b>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 24 }}>
        {/* Master Referral Card */}
        <div className="admin-card">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>👑 Global Master Referral Code</h3>
              <span className="badge-pill" style={{ background: '#eff6ff', color: '#1d4ed8', fontWeight: 800 }}>Default Global</span>
            </div>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
              Used by standard applicant registrations and self-service onboarding links.
            </p>
          </div>

          <form onSubmit={handleSaveMasterReferral} style={{ padding: '18px 20px' }}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6, color: '#1e293b' }}>
                Master Code:
              </label>
              <input
                type="text"
                value={masterRefCode}
                onChange={(e) => setMasterRefCode(e.target.value.toUpperCase())}
                placeholder="e.g. BAZARIO2026"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 15, fontWeight: 800, letterSpacing: 1 }}
                required
              />
            </div>

            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <b style={{ color: '#166534', fontSize: 12.5 }}>🔗 Master Applicant Link:</b>
                <span style={{ fontSize: 11.5, color: '#15803d', fontWeight: 700 }}>
                  👥 {masterUsageCount} Merchant(s) Joined
                </span>
              </div>
              <p style={{ margin: '2px 0 8px', fontSize: 11.5, color: '#15803d', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                {typeof window !== 'undefined' ? `${window.location.origin}/seller/login?ref=${masterRefCode || 'BAZARIO'}` : `https://bazario.com/seller/login?ref=${masterRefCode}`}
              </p>
              <button
                type="button"
                onClick={() => copyToClipboard(masterRefCode, 'master')}
                style={{ padding: '4px 10px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
              >
                {copiedCode === 'master' ? '✅ Copied to Clipboard!' : '📋 Copy Master Link'}
              </button>
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={savingMasterRef}
              style={{ width: '100%' }}
            >
              {savingMasterRef ? 'Saving...' : '💾 Save Master Referral Code'}
            </button>
          </form>
        </div>

        {/* Quick Instructions & Policy Card */}
        <div className="admin-card" style={{ background: '#fdfcfe' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>💡 Referral Program Mechanics</h3>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
              How merchant onboarding referral codes work in Bazario:
            </p>
          </div>
          <div style={{ padding: '18px 20px', fontSize: 13, color: '#334155', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 18 }}>1️⃣</span>
              <div>
                <b>Multi-Channel Campaigns:</b>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                  Create dedicated referral codes for specific marketing channels, influencers, or partner networks (e.g. <code>SUMMER2026</code>, <code>AGENCY-ALPHA</code>).
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 18 }}>2️⃣</span>
              <div>
                <b>Seamless Merchant Registration:</b>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                  Applicants entering through a referral link automatically have the code attached to their onboarding application.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 18 }}>3️⃣</span>
              <div>
                <b>Approval &amp; Tracking:</b>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                  When approving a seller in the <b>New Applications</b> desk, the assigned referral code is locked in their security deposit ledger and merchant profile.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Custom Referral Codes Table */}
      <div className="admin-card">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>🏷️ Campaign &amp; Partner Referral Codes</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#64748b' }}>
              Manage custom referral codes, copy invite links, and review live onboarding registration metrics.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setCreateErr(''); setCreateModalOpen(true); }}
            className="btn-primary"
            style={{ padding: '6px 12px', fontSize: 12.5 }}
          >
            <Ic name="plus" size={14} /> + New Code
          </button>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Referral Code</th>
                <th>Description / Purpose</th>
                <th>Commission / Bonus Rate</th>
                <th>Merchants Joined</th>
                <th>Status</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="7" className="text-center py-8 muted">Loading referral codes...</td>
                </tr>
              )}
              {!loading && referralCodes.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center py-8 muted">
                    No custom referral codes created yet. Click "+ Create New Referral Code" above to add one.
                  </td>
                </tr>
              )}
              {referralCodes.map((rc) => (
                <tr key={rc._id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 900, background: '#eff6ff', color: '#1d4ed8', padding: '4px 10px', borderRadius: 6, letterSpacing: 0.5, border: '1px solid #bfdbfe' }}>
                        🔑 {rc.code}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(rc.code, rc._id)}
                        style={{ padding: '3px 8px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                        title="Copy Onboarding Link"
                      >
                        {copiedCode === rc._id ? '✅ Copied!' : '📋 Copy Link'}
                      </button>
                    </div>
                  </td>
                  <td>
                    <span>{rc.description || 'General Partner Code'}</span>
                    <small className="muted block">By: {rc.createdBy || 'Admin'}</small>
                  </td>
                  <td>
                    {rc.commissionRate !== null && rc.commissionRate !== undefined ? (
                      <span className="fee-badge">{rc.commissionRate}% Commission</span>
                    ) : (
                      <span className="muted-sm">Standard Rate</span>
                    )}
                    {rc.bonusAmount > 0 && (
                      <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 700, display: 'block', marginTop: 2 }}>
                        +${rc.bonusAmount} Welcome Credit
                      </span>
                    )}
                  </td>
                  <td>
                    <b style={{ color: '#0f172a', fontSize: 14 }}>{rc.usageCount || 0}</b>
                    <small className="muted block">Registered Sellers</small>
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(rc._id)}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 800,
                        border: 'none',
                        cursor: 'pointer',
                        background: rc.status === 'active' ? '#dcfce7' : '#fee2e2',
                        color: rc.status === 'active' ? '#15803d' : '#b91c1c',
                      }}
                      title="Click to toggle status"
                    >
                      {rc.status === 'active' ? '● Active' : '○ Inactive'}
                    </button>
                  </td>
                  <td>
                    <small>{fmtDate(rc.createdAt)}</small>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(rc.code, rc._id)}
                        style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                      >
                        🔗 Link
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteReferral(rc._id, rc.code)}
                        style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Custom Referral Code Modal */}
      {createModalOpen && (
        <div className="admin-modal-overlay" onClick={() => setCreateModalOpen(false)}>
          <div className="admin-modal-box" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>🔑</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Create New Referral Code</h3>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>Configure custom onboarding code for merchants</p>
                </div>
              </div>
              <button onClick={() => setCreateModalOpen(false)} className="btn-close-modal">✕</button>
            </div>

            {createErr && <div className="modal-err-banner">{createErr}</div>}

            <form onSubmit={handleCreateReferralSubmit} style={{ padding: '18px 22px' }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                  Referral Code *:
                </label>
                <input
                  type="text"
                  value={createForm.code}
                  onChange={(e) => setCreateForm({ ...createForm, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. VIP2026, PARTNER-NYC"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 14, fontWeight: 800, letterSpacing: 0.5 }}
                  required
                />
                <small className="muted-sm">Applicants can register using this code to link to your campaign.</small>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                  Description / Campaign Name:
                </label>
                <input
                  type="text"
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="e.g. Spring Merchant Growth Program"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                    Custom Commission (% - Optional):
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={createForm.commissionRate}
                    onChange={(e) => setCreateForm({ ...createForm, commissionRate: e.target.value })}
                    placeholder="e.g. 8 (Default 10%)"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                    Welcome Bonus Credit ($ - Optional):
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={createForm.bonusAmount}
                    onChange={(e) => setCreateForm({ ...createForm, bonusAmount: e.target.value })}
                    placeholder="e.g. 25"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                  Initial Status:
                </label>
                <select
                  value={createForm.status}
                  onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                >
                  <option value="active">Active (Usable immediately)</option>
                  <option value="inactive">Inactive (Disabled)</option>
                </select>
              </div>

              <div className="modal-bottom-actions">
                <button type="button" onClick={() => setCreateModalOpen(false)} className="btn-cancel">Cancel</button>
                <button type="submit" className="btn-primary" disabled={creating}>
                  {creating ? 'Creating...' : '🔑 Create Referral Code'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
