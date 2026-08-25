import { useEffect, useState } from 'react';
import { api, fmtDate, money } from '../api.js';
import Ic from '../components/Icons.jsx';

export default function Applications() {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pending'); // 'pending' | 'approved' | 'rejected' | 'all'
  const [q, setQ] = useState('');

  // Pending Approvals & KYC Modal
  const [pendingApproveModal, setPendingApproveModal] = useState(null);
  const [pendingRejectModal, setPendingRejectModal] = useState(null);
  const [kycDocModal, setKycDocModal] = useState(null);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const loadSellers = () => {
    setLoading(true);
    api('/sellers')
      .then((data) => {
        const list = Array.isArray(data) ? data : data.sellers || [];
        setSellers(list);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSellers();
  }, []);

  const handleApproveSubmit = async (e) => {
    e.preventDefault();
    if (!pendingApproveModal?.seller) return;
    setApproving(true);
    try {
      await api(`/sellers/${pendingApproveModal.seller._id}/approve`, {
        method: 'POST',
        body: {
          securityDepositAmount: Number(pendingApproveModal.securityDepositAmount || 0),
          securityDepositPaid: Boolean(pendingApproveModal.securityDepositPaid),
          assignedReferralCode: pendingApproveModal.referralCode?.trim() || '',
          commissionRate: Number(pendingApproveModal.commissionRate || 10),
        },
      });
      alert(`🎉 Store "${pendingApproveModal.seller.storeName}" has been successfully approved! Notification sent.`);
      setPendingApproveModal(null);
      loadSellers();
    } catch (err) {
      alert('Error approving seller: ' + err.message);
    } finally {
      setApproving(false);
    }
  };

  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!pendingRejectModal?.seller) return;
    setRejecting(true);
    try {
      await api(`/sellers/${pendingRejectModal.seller._id}/reject`, {
        method: 'POST',
        body: {
          reason: pendingRejectModal.reason?.trim() || 'Application does not meet platform merchant criteria.',
        },
      });
      alert(`Seller application for "${pendingRejectModal.seller.storeName}" has been rejected.`);
      setPendingRejectModal(null);
      loadSellers();
    } catch (err) {
      alert('Error rejecting seller: ' + err.message);
    } finally {
      setRejecting(false);
    }
  };

  const pendingList = sellers.filter((s) => s.status === 'pending_approval');
  const approvedList = sellers.filter((s) => s.status === 'active' || s.verified);
  const rejectedList = sellers.filter((s) => s.status === 'suspended' && s.freezeReason?.includes('reject'));

  const displayed = sellers.filter((s) => {
    if (tab === 'pending' && s.status !== 'pending_approval') return false;
    if (tab === 'approved' && s.status !== 'active') return false;
    if (tab === 'rejected' && s.status !== 'suspended') return false;

    if (!q) return true;
    const match =
      s.storeName?.toLowerCase().includes(q.toLowerCase()) ||
      s.ownerName?.toLowerCase().includes(q.toLowerCase()) ||
      s.email?.toLowerCase().includes(q.toLowerCase()) ||
      s.phone?.toLowerCase().includes(q.toLowerCase());
    return match;
  });

  return (
    <div className="admin-sellers-page">
      <div className="admin-header-row">
        <div>
          <h2>⏳ New Merchant Applications &amp; KYC Verification</h2>
          <p className="muted">
            Review self-registration submissions, verify KYC identity documents (National ID, Passport, Bank Statement), and configure security deposits upon onboarding approval.
          </p>
        </div>
      </div>

      {/* Summary KPI Tabs */}
      <div className="wallet-action-tabs" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className={`wallet-action-tab ${tab === 'pending' ? 'active' : ''}`}
          onClick={() => setTab('pending')}
        >
          ⏳ Pending Review ({pendingList.length})
        </button>
        <button
          type="button"
          className={`wallet-action-tab ${tab === 'approved' ? 'active' : ''}`}
          onClick={() => setTab('approved')}
        >
          ✅ Approved &amp; Active ({approvedList.length})
        </button>
        <button
          type="button"
          className={`wallet-action-tab ${tab === 'rejected' ? 'active' : ''}`}
          onClick={() => setTab('rejected')}
        >
          ❌ Rejected ({rejectedList.length})
        </button>
        <button
          type="button"
          className={`wallet-action-tab ${tab === 'all' ? 'active' : ''}`}
          onClick={() => setTab('all')}
        >
          📋 All Registrations ({sellers.length})
        </button>
      </div>

      <div className="table-search-row">
        <div className="search-field">
          <Ic name="search" size={16} />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search applicants by store name, owner, email, phone..."
          />
        </div>
      </div>

      {/* Applications Table */}
      <div className="admin-card">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>
              {tab === 'pending' ? '⏳ Applications Awaiting Admin Review' : tab === 'approved' ? '✅ Approved Merchant Accounts' : tab === 'rejected' ? '❌ Rejected Merchant Registrations' : '📋 All Merchant Applications'}
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#64748b' }}>
              Inspect uploaded identification documents and configure security deposit before activating seller accounts.
            </p>
          </div>
          {tab === 'pending' && (
            <span className="badge-pill" style={{ background: '#fef3c7', color: '#92400e', fontWeight: 800 }}>
              {pendingList.length} Pending Decision
            </span>
          )}
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Applicant Store</th>
                <th>Owner &amp; Contacts</th>
                <th>Referral Code</th>
                <th>KYC Documents</th>
                <th>Application Date</th>
                <th>Status</th>
                <th>Decision Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="7" className="text-center py-8 muted">Loading registration applications...</td>
                </tr>
              )}
              {!loading && displayed.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center py-8 muted">
                    {tab === 'pending'
                      ? '🎉 No pending merchant registrations awaiting approval.'
                      : 'No applications found matching your search.'}
                  </td>
                </tr>
              )}
              {displayed.map((s) => (
                <tr key={s._id}>
                  <td>
                    <div className="seller-name-cell">
                      <div className="avatar-chip">{s.storeName?.[0] || 'S'}</div>
                      <div>
                        <b>{s.storeName}</b>
                        <small className="muted block">{s.description || 'Merchant Store'}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <b>{s.ownerName}</b>
                    <small className="muted block">✉️ {s.email}</small>
                    <small className="muted block">📞 {s.phone || 'N/A'}</small>
                  </td>
                  <td>
                    {s.securityDeposit?.referralCode || s.referralCode ? (
                      <span style={{ fontSize: 11, fontWeight: 800, background: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: 4 }}>
                        🔑 {s.securityDeposit?.referralCode || s.referralCode}
                      </span>
                    ) : (
                      <span className="muted-sm">Direct / None</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {s.kycDocuments?.idCard || s.kycDocuments?.idDocumentUrl ? (
                        <button
                          type="button"
                          onClick={() => setKycDocModal({ seller: s, docType: 'idCard', docUrl: s.kycDocuments.idCard || s.kycDocuments.idDocumentUrl })}
                          style={{ padding: '3px 8px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                        >
                          🪪 View ID
                        </button>
                      ) : (
                        <small className="muted-sm">No ID</small>
                      )}
                      {s.kycDocuments?.passport || s.kycDocuments?.passportDocumentUrl ? (
                        <button
                          type="button"
                          onClick={() => setKycDocModal({ seller: s, docType: 'passport', docUrl: s.kycDocuments.passport || s.kycDocuments.passportDocumentUrl })}
                          style={{ padding: '3px 8px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                        >
                          🛂 View Passport
                        </button>
                      ) : (
                        <small className="muted-sm">No Passport</small>
                      )}
                      {s.kycDocuments?.bankStatement || s.kycDocuments?.bankStatementUrl ? (
                        <button
                          type="button"
                          onClick={() => setKycDocModal({ seller: s, docType: 'bankStatement', docUrl: s.kycDocuments.bankStatement || s.kycDocuments.bankStatementUrl })}
                          style={{ padding: '3px 8px', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 4, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', color: '#1d4ed8' }}
                        >
                          🏦 Bank Statement
                        </button>
                      ) : (
                        <small className="muted-sm">No Statement</small>
                      )}
                    </div>
                  </td>
                  <td>
                    <small>{fmtDate(s.createdAt)}</small>
                  </td>
                  <td>
                    <span
                      style={{
                        background: s.status === 'active' ? '#ecfdf5' : s.status === 'pending_approval' ? '#fef3c7' : '#fef2f2',
                        color: s.status === 'active' ? '#059669' : s.status === 'pending_approval' ? '#b45309' : '#dc2626',
                        border: `1px solid ${s.status === 'active' ? '#a7f3d0' : s.status === 'pending_approval' ? '#fde68a' : '#fecaca'}`,
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: 12,
                        fontSize: 11,
                      }}
                    >
                      {s.status === 'active' ? '● Active' : s.status === 'pending_approval' ? '⏳ Pending Review' : '⛔ Rejected / Suspended'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {s.status === 'pending_approval' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setPendingApproveModal({ seller: s, securityDepositAmount: 500, securityDepositPaid: true, referralCode: s.securityDeposit?.referralCode || s.referralCode || '', commissionRate: s.commissionRate || 10 })}
                            style={{ padding: '6px 12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                          >
                            ✅ Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingRejectModal({ seller: s, reason: '' })}
                            style={{ padding: '6px 12px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                          >
                            ❌ Reject
                          </button>
                        </>
                      ) : s.status === 'active' ? (
                        <button
                          type="button"
                          onClick={() => setPendingApproveModal({ seller: s, securityDepositAmount: s.securityDeposit?.amount || 500, securityDepositPaid: s.securityDeposit?.paid || false, referralCode: s.securityDeposit?.referralCode || '', commissionRate: s.commissionRate || 10 })}
                          style={{ padding: '5px 10px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                        >
                          ✏️ Edit Deposit / Settings
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPendingApproveModal({ seller: s, securityDepositAmount: 500, securityDepositPaid: true, referralCode: s.securityDeposit?.referralCode || '', commissionRate: 10 })}
                          style={{ padding: '5px 10px', background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', borderRadius: 6, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                        >
                          🔄 Re-Approve
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Modal 1: Approve Seller Application ─── */}
      {pendingApproveModal && (
        <div className="admin-modal-overlay" onClick={() => setPendingApproveModal(null)}>
          <div className="admin-modal-box" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>✅</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Approve Merchant: <b>{pendingApproveModal.seller.storeName}</b></h3>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>Configure security deposit collateral &amp; activate account</p>
                </div>
              </div>
              <button onClick={() => setPendingApproveModal(null)} className="btn-close-modal">✕</button>
            </div>

            <form onSubmit={handleApproveSubmit} style={{ padding: '18px 22px' }}>
              <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: '#1e293b' }}>
                  <b>Applicant:</b> {pendingApproveModal.seller.ownerName} &bull; <b>Email:</b> {pendingApproveModal.seller.email}
                </div>
              </div>

              <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px 16px', borderRadius: 8 }}>
                <div>
                  <b style={{ color: '#166534', fontSize: 13.5, display: 'block' }}>Security Deposit Paid by Merchant</b>
                  <small style={{ color: '#15803d', fontSize: 12 }}>Lock collateral in seller wallet ledger</small>
                </div>
                <input
                  type="checkbox"
                  checked={pendingApproveModal.securityDepositPaid}
                  onChange={(e) => setPendingApproveModal({ ...pendingApproveModal, securityDepositPaid: e.target.checked })}
                  style={{ width: 20, height: 20, cursor: 'pointer' }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                  Security Deposit Collateral ($ USD):
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={pendingApproveModal.securityDepositAmount}
                  onChange={(e) => setPendingApproveModal({ ...pendingApproveModal, securityDepositAmount: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 14 }}
                  required
                />
                <small className="muted-sm">This amount will show in the seller's wallet as Security Deposit.</small>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                    Referral Code:
                  </label>
                  <input
                    type="text"
                    value={pendingApproveModal.referralCode}
                    onChange={(e) => setPendingApproveModal({ ...pendingApproveModal, referralCode: e.target.value.toUpperCase() })}
                    placeholder="e.g. BAZARIO2026"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                    Commission Rate (%):
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={pendingApproveModal.commissionRate}
                    onChange={(e) => setPendingApproveModal({ ...pendingApproveModal, commissionRate: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                    required
                  />
                </div>
              </div>

              <div className="modal-bottom-actions">
                <button type="button" onClick={() => setPendingApproveModal(null)} className="btn-cancel">Cancel</button>
                <button type="submit" className="btn-primary" disabled={approving} style={{ background: '#16a34a', borderColor: '#16a34a' }}>
                  {approving ? 'Approving...' : '🎉 Approve Merchant & Send Welcome Notice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal 2: Reject Seller Application ─── */}
      {pendingRejectModal && (
        <div className="admin-modal-overlay" onClick={() => setPendingRejectModal(null)}>
          <div className="admin-modal-box" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>❌</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Reject Application: <b>{pendingRejectModal.seller.storeName}</b></h3>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>Provide a reason for rejection</p>
                </div>
              </div>
              <button onClick={() => setPendingRejectModal(null)} className="btn-close-modal">✕</button>
            </div>

            <form onSubmit={handleRejectSubmit} style={{ padding: '18px 22px' }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 6 }}>
                  Rejection Reason:
                </label>
                <textarea
                  rows={4}
                  value={pendingRejectModal.reason}
                  onChange={(e) => setPendingRejectModal({ ...pendingRejectModal, reason: e.target.value })}
                  placeholder="e.g. Submitted ID documents are blurry or invalid. Please re-apply with a clear passport copy."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, fontFamily: 'inherit' }}
                  required
                />
              </div>

              <div className="modal-bottom-actions">
                <button type="button" onClick={() => setPendingRejectModal(null)} className="btn-cancel">Cancel</button>
                <button type="submit" className="btn-primary" disabled={rejecting} style={{ background: '#dc2626', borderColor: '#dc2626' }}>
                  {rejecting ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal 3: View KYC Documents ─── */}
      {kycDocModal && (
        <div className="admin-modal-overlay" onClick={() => setKycDocModal(null)}>
          <div className="admin-modal-box" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>📄</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>
                    KYC Document: <b>
                      {kycDocModal.docType === 'idCard'
                        ? 'National ID / Aadhaar / DL'
                        : kycDocModal.docType === 'bankStatement'
                        ? 'Bank Account Statement / Passbook'
                        : 'Passport / Proof of Address'}
                    </b>
                  </h3>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>Merchant: {kycDocModal.seller.storeName} ({kycDocModal.seller.ownerName})</p>
                </div>
              </div>
              <button onClick={() => setKycDocModal(null)} className="btn-close-modal">✕</button>
            </div>

            <div style={{ padding: '20px', textAlign: 'center', background: '#0f172a', borderRadius: '0 0 8px 8px' }}>
              {kycDocModal.docUrl?.toLowerCase().endsWith('.pdf') ? (
                <div style={{ padding: '30px 20px', color: '#fff' }}>
                  <p style={{ fontSize: 15, marginBottom: 14 }}>📄 PDF Document Uploaded</p>
                  <a
                    href={kycDocModal.docUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'inline-block', padding: '10px 18px', background: '#3b82f6', color: '#fff', borderRadius: 6, fontWeight: 700, textDecoration: 'none' }}
                  >
                    Open PDF in New Window ↗
                  </a>
                </div>
              ) : (
                <img
                  src={kycDocModal.docUrl}
                  alt="KYC Document Preview"
                  style={{ maxWidth: '100%', maxHeight: 480, objectFit: 'contain', borderRadius: 6 }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
