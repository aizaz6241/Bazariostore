import { useEffect, useState } from 'react';
import { api, fmtDay } from '../api.js';
import Ic from '../components/Icons.jsx';

const STATUS_COLOR = { pending: 'chip-orange', approved: 'chip-green', rejected: 'chip-red' };

function money(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AdminWithdrawals() {
  const [requests, setRequests] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [typeFilter, setTypeFilter] = useState('all');
  const [processing, setProcessing] = useState({});

  // Per-request approval forms
  const [approvedAmountMap, setApprovedAmountMap] = useState({});
  const [noteMap, setNoteMap] = useState({});
  const [refMap, setRefMap] = useState({});

  // Direct Manual Adjustment Modal
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [sellersList, setSellersList] = useState([]);
  const [adjustForm, setAdjustForm] = useState({
    sellerId: '',
    type: 'credit',
    amount: '',
    reason: '',
    reference: '',
  });
  const [adjusting, setAdjusting] = useState(false);
  const [adjustMsg, setAdjustMsg] = useState('');
  const [adjustErr, setAdjustErr] = useState('');

  const load = () => {
    setLoading(true);
    api(`/sellers/withdrawals/all?status=${statusFilter}&type=${typeFilter}`)
      .then((res) => {
        setRequests(res.requests || []);
        setSummary(res.summary || {});

        // Pre-fill approvedAmountMap with original requested amount
        const aMap = {};
        (res.requests || []).forEach((r) => {
          aMap[r._id] = r.amount;
        });
        setApprovedAmountMap((prev) => ({ ...aMap, ...prev }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [statusFilter, typeFilter]);

  // Load sellers for the adjustment modal
  useEffect(() => {
    api('/sellers')
      .then((data) => {
        const list = Array.isArray(data) ? data : data.sellers || [];
        setSellersList(list);
        if (list.length > 0 && !adjustForm.sellerId) {
          setAdjustForm((f) => ({ ...f, sellerId: list[0]._id }));
        }
      })
      .catch(() => {});
  }, []);

  const handleAction = async (id, status, reqType) => {
    setProcessing((p) => ({ ...p, [id]: true }));
    try {
      const appAmt = approvedAmountMap[id] !== undefined ? approvedAmountMap[id] : null;
      await api(`/sellers/withdrawals/${id}`, {
        method: 'PUT',
        body: {
          status,
          adminNote: noteMap[id] || '',
          transactionRef: refMap[id] || '',
          approvedAmount: status === 'approved' ? appAmt : undefined,
        },
      });
      load();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setProcessing((p) => ({ ...p, [id]: false }));
    }
  };

  const handleManualAdjustSubmit = async (e) => {
    e.preventDefault();
    setAdjustErr('');
    setAdjustMsg('');
    const amt = Number(adjustForm.amount);
    if (!adjustForm.sellerId) return setAdjustErr('Please select a seller');
    if (!amt || amt <= 0) return setAdjustErr('Please enter a valid amount greater than 0');

    setAdjusting(true);
    try {
      const res = await api(`/sellers/${adjustForm.sellerId}/wallet/adjust`, {
        method: 'POST',
        body: {
          type: adjustForm.type,
          amount: amt,
          reason: adjustForm.reason,
          reference: adjustForm.reference,
        },
      });
      setAdjustMsg(`✅ ${res.message || 'Wallet adjusted successfully!'}`);
      setAdjustForm((f) => ({ ...f, amount: '', reason: '', reference: '' }));
      load();
      setTimeout(() => {
        setShowAdjustModal(false);
        setAdjustMsg('');
      }, 1800);
    } catch (err) {
      setAdjustErr(err.message);
    } finally {
      setAdjusting(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-page-head flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2>💼 Wallet & Payout Control Desk</h2>
          <p className="muted-sm">Sellers ki deposit/withdrawal requests process karein aur direct wallet adjustments karein.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAdjustModal(true)}>
          <Ic name="plus" size={16} /> 💳 Direct Add / Adjust Funds
        </button>
      </div>

      {/* Summary Bar */}
      <div className="withdraw-summary-row mt-3">
        <div className="withdraw-stat">
          <b>{summary.pending || 0}</b>
          <small>Pending Requests</small>
        </div>
        <div className="withdraw-stat" style={{ color: '#059669' }}>
          <b>{money(summary.pendingDeposits || 0)}</b>
          <small>Pending Deposits</small>
        </div>
        <div className="withdraw-stat" style={{ color: '#dc2626' }}>
          <b>{money(summary.pendingWithdrawals || 0)}</b>
          <small>Pending Withdrawals</small>
        </div>
        <div className="withdraw-stat">
          <b>{summary.total || 0}</b>
          <small>Total Requests</small>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <div className="filter-label">Filter By Type:</div>
          <div className="period-tabs">
            {[
              { val: 'all', label: '📋 All Types' },
              { val: 'deposit', label: '💰 Deposits' },
              { val: 'withdrawal', label: '💸 Withdrawals' },
            ].map((t) => (
              <button key={t.val} className={`period-tab ${typeFilter === t.val ? 'active' : ''}`} onClick={() => setTypeFilter(t.val)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="filter-label">Filter By Status:</div>
          <div className="period-tabs">
            {['pending', 'approved', 'rejected', 'all'].map((s) => (
              <button key={s} className={`period-tab ${statusFilter === s ? 'active' : ''}`} onClick={() => setStatusFilter(s)}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <div className="admin-loading">Loading wallet requests...</div>}

      {!loading && requests.length === 0 && (
        <div className="empty-box">
          <Ic name="banknote" size={44} stroke={1.2} />
          <p>Koi wallet request nahi mili.</p>
        </div>
      )}

      {!loading && requests.map((r) => {
        const isDeposit = r.type === 'deposit';
        const isPending = r.status === 'pending';
        const currentApprovedAmt = approvedAmountMap[r._id] !== undefined ? approvedAmountMap[r._id] : r.amount;

        return (
          <div key={r._id} className={`withdrawal-card ${isPending ? 'withdrawal-pending' : ''}`}>
            {/* Header Badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div
                className="request-type-badge"
                style={{
                  background: isDeposit ? '#d1fae5' : '#dbeafe',
                  color: isDeposit ? '#065f46' : '#1d4ed8',
                  marginBottom: 0,
                }}
              >
                {r.isManualAdjustment ? '⚡ DIRECT ADMIN ADJUSTMENT' : (isDeposit ? '💰 DEPOSIT REQUEST' : '💸 WITHDRAWAL REQUEST')}
              </div>
              <span className={`status-chip ${STATUS_COLOR[r.status] || ''}`}>
                {r.status?.toUpperCase()}
              </span>
            </div>

            <div className="withdrawal-top">
              <div className="withdrawal-seller">
                <div className="avatar-chip">{r.storeName?.[0] || 'S'}</div>
                <div>
                  <b>{r.storeName}</b>
                  <small className="muted block">{r.seller?.ownerName} · {r.seller?.email}</small>
                </div>
              </div>
              <div className="withdrawal-amount-block">
                <div className="withdrawal-amount">{money(r.amount)}</div>
                {r.approvedAmount !== null && r.approvedAmount !== undefined && r.approvedAmount !== r.amount && r.status === 'approved' && (
                  <small className="text-green font-bold block" style={{ fontSize: 13 }}>
                    Credited to Wallet: {money(r.approvedAmount)}
                  </small>
                )}
              </div>
            </div>

            <div className="withdrawal-details">
              {isDeposit ? (
                <>
                  <div className="detail-row"><span>Type</span><b>💰 Deposit</b></div>
                  <div className="detail-row"><span>Requested Amount</span><b>{money(r.amount)}</b></div>
                  <div className="detail-row"><span>Payment Ref / UTR</span><b>{r.depositRef || '—'}</b></div>
                  <div className="detail-row"><span>Seller Note</span><b>{r.depositNote || '—'}</b></div>
                </>
              ) : (
                <>
                  <div className="detail-row"><span>Type</span><b>💸 Withdrawal</b></div>
                  <div className="detail-row"><span>Payout Method</span><b>{r.method?.toUpperCase()}</b></div>
                  {r.method === 'upi' ? (
                    <div className="detail-row"><span>UPI ID</span><b>{r.upiId}</b></div>
                  ) : (
                    <>
                      <div className="detail-row"><span>Bank Name</span><b>{r.bankName}</b></div>
                      <div className="detail-row"><span>Account No</span><b>{r.accountNumber}</b></div>
                      <div className="detail-row"><span>IFSC Code</span><b>{r.ifscCode}</b></div>
                      <div className="detail-row"><span>Account Title</span><b>{r.accountTitle}</b></div>
                    </>
                  )}
                </>
              )}

              <div className="detail-row"><span>Requested Date</span><b>{fmtDay(r.createdAt)}</b></div>
              {r.processedAt && (
                <div className="detail-row"><span>Processed Date</span><b>{fmtDay(r.processedAt)} by {r.processedBy}</b></div>
              )}
              {r.adminNote && (
                <div className="detail-row"><span>Admin Note</span><b>{r.adminNote}</b></div>
              )}
              {r.transactionRef && (
                <div className="detail-row"><span>Admin Ref / UTR</span><b className="text-green">{r.transactionRef}</b></div>
              )}
            </div>

            {/* ACTION SECTION FOR PENDING REQUESTS */}
            {isPending && (
              <div className="withdrawal-actions" style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4, color: '#334155' }}>
                      {isDeposit ? 'Deposit Amount to Wallet (₹) *' : 'Approved Payout Amount (₹) *'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={isDeposit ? undefined : r.amount}
                      className="withdrawal-note-input"
                      style={{ fontWeight: 'bold', color: isDeposit ? '#059669' : '#2563eb' }}
                      value={currentApprovedAmt !== undefined ? currentApprovedAmt : r.amount}
                      onChange={(e) => setApprovedAmountMap((m) => ({ ...m, [r._id]: e.target.value }))}
                      placeholder="Approved Amount"
                    />
                    <small className="muted-sm" style={{ fontSize: 10, display: 'block', marginTop: 2 }}>
                      Requested: <b>₹{Number(r.amount).toLocaleString('en-IN')}</b>
                    </small>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4, color: '#334155' }}>
                      Admin Note (Chat mein jayega)
                    </label>
                    <input
                      className="withdrawal-note-input"
                      placeholder={isDeposit ? 'e.g. Received via UPI/Bank' : 'e.g. ₹30 processed, remaining refunded'}
                      value={noteMap[r._id] || ''}
                      onChange={(e) => setNoteMap((m) => ({ ...m, [r._id]: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4, color: '#334155' }}>
                      Admin Transaction / UTR Ref
                    </label>
                    <input
                      className="withdrawal-note-input"
                      placeholder="UTR / Bank Ref Number"
                      value={refMap[r._id] || ''}
                      onChange={(e) => setRefMap((m) => ({ ...m, [r._id]: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Partial Withdrawal Payout Calculation Preview */}
                {!isDeposit && Number(currentApprovedAmt || r.amount) < r.amount && (
                  <div style={{ marginTop: 8, padding: '6px 10px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 11.5, color: '#1e40af' }}>
                    💡 <b>Partial Payout Preview:</b> ₹{Number(currentApprovedAmt || 0).toLocaleString('en-IN')} payout pass hoga aur remaining <b>₹{(r.amount - Number(currentApprovedAmt || 0)).toLocaleString('en-IN')}</b> seller ke wallet balance mein automatically refund ho jayenge.
                  </div>
                )}

                <div className="withdrawal-btns mt-2" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button
                    className="btn-primary"
                    disabled={processing[r._id]}
                    onClick={() => handleAction(r._id, 'approved', r.type)}
                  >
                    <Ic name="check" size={15} />
                    {isDeposit
                      ? ` Approve & Credit ₹${currentApprovedAmt || r.amount} to Wallet`
                      : Number(currentApprovedAmt || r.amount) < r.amount
                        ? ` Approve Partial ₹${currentApprovedAmt} (Refund ₹${r.amount - currentApprovedAmt})`
                        : ` Approve Payout of ₹${currentApprovedAmt || r.amount}`}
                  </button>

                  <button
                    className="btn-danger"
                    disabled={processing[r._id]}
                    onClick={() => handleAction(r._id, 'rejected', r.type)}
                  >
                    <Ic name="x" size={15} /> Reject Request (Full Refund)
                  </button>

                  <small className="muted-sm ml-auto">
                    Approve/Reject karne par seller ko chat mein auto-receipt aur sound jayegi.
                  </small>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* DIRECT MANUAL WALLET ADJUSTMENT MODAL */}
      {showAdjustModal && (
        <div className="admin-modal-overlay" onClick={() => setShowAdjustModal(false)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-top">
              <h3>💳 Direct Seller Wallet Adjustment</h3>
              <button className="btn-icon" onClick={() => setShowAdjustModal(false)}>
                <Ic name="x" size={18} />
              </button>
            </div>
            <p className="modal-desc-sub">
              Kisi bhi seller ke wallet mein direct paise add (+ credit) karein ya deduct (- debit) karein. Yeh instantly seller ke wallet balance ko update kar dega aur chat notification bhejega.
            </p>

            {adjustMsg && <div className="alert-success mb-3">{adjustMsg}</div>}
            {adjustErr && <div className="alert-error mb-3">{adjustErr}</div>}

            <form onSubmit={handleManualAdjustSubmit} className="admin-modal-form">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <label>
                  <span>Select Seller *</span>
                  <select
                    value={adjustForm.sellerId}
                    onChange={(e) => setAdjustForm((f) => ({ ...f, sellerId: e.target.value }))}
                  >
                    {sellersList.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.storeName} ({s.ownerName} — Balance: {money(s.wallet?.balance || 0)})
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Adjustment Action *</span>
                  <select
                    value={adjustForm.type}
                    onChange={(e) => setAdjustForm((f) => ({ ...f, type: e.target.value }))}
                  >
                    <option value="credit">💰 Credit (+) — Add money to seller wallet</option>
                    <option value="debit">💸 Debit (-) — Deduct money from seller wallet</option>
                  </select>
                </label>

                <label>
                  <span>Amount (₹) *</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 500"
                    value={adjustForm.amount}
                    onChange={(e) => setAdjustForm((f) => ({ ...f, amount: e.target.value }))}
                    required
                  />
                </label>

                <label>
                  <span>Reason / Note <span className="muted-sm">(seller chat mein dikhega)</span></span>
                  <input
                    placeholder="e.g. Manual Cash/Bank deposit verified / Bonus / Correction"
                    value={adjustForm.reason}
                    onChange={(e) => setAdjustForm((f) => ({ ...f, reason: e.target.value }))}
                  />
                </label>

                <label>
                  <span>Payment Ref / UTR <span className="muted-sm">(optional)</span></span>
                  <input
                    placeholder="e.g. UTR1234567890"
                    value={adjustForm.reference}
                    onChange={(e) => setAdjustForm((f) => ({ ...f, reference: e.target.value }))}
                  />
                </label>
              </div>

              <div className="modal-bottom-actions mt-4">
                <button type="button" className="btn-cancel" onClick={() => setShowAdjustModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={adjusting}>
                  {adjusting ? 'Processing...' : (adjustForm.type === 'credit' ? '💰 Credit Funds to Wallet' : '💸 Debit Funds from Wallet')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
