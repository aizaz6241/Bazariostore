import { useEffect, useState, useMemo } from 'react';
import { api, fmtDay, fmtDate, money } from '../api.js';
import Ic from '../components/Icons.jsx';
import CurrencyConverterWidget from '../components/CurrencyConverterWidget.jsx';
import { getSocket } from '../socket.js';
import SplitDepositModal from './SplitDepositModal.jsx';

const STATUS_COLOR = { pending: 'chip-orange', approved: 'chip-green', rejected: 'chip-red' };

export default function AdminWithdrawals() {
  const [activeTab, setActiveTab] = useState('requests'); // 'requests' | 'limits' | 'ledger'
  const [requests, setRequests] = useState([]);
  const [limitRequests, setLimitRequests] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [typeFilter, setTypeFilter] = useState('all');
  const [processing, setProcessing] = useState({});

  // ─── DEPOSITS LEDGER & SPLIT STATE ───
  const [depositsLedger, setDepositsLedger] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerStatus, setLedgerStatus] = useState('all');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [splitModalDeposit, setSplitModalDeposit] = useState(null);

  const filteredLedger = useMemo(() => {
    let list = [...depositsLedger];
    if (ledgerSearch.trim()) {
      const q = ledgerSearch.trim().toLowerCase();
      list = list.filter(
        (d) =>
          (d.storeName && d.storeName.toLowerCase().includes(q)) ||
          (d.seller?.ownerName && d.seller.ownerName.toLowerCase().includes(q)) ||
          (d.seller?.email && d.seller.email.toLowerCase().includes(q)) ||
          (d.depositRef && d.depositRef.toLowerCase().includes(q)) ||
          (d.transactionRef && d.transactionRef.toLowerCase().includes(q)) ||
          (d.method && d.method.toLowerCase().includes(q)) ||
          (d.depositNote && d.depositNote.toLowerCase().includes(q)) ||
          (d.adminNote && d.adminNote.toLowerCase().includes(q))
      );
    }
    return list;
  }, [depositsLedger, ledgerSearch]);

  const ledgerGrossTotal = useMemo(() => {
    return filteredLedger.reduce((sum, d) => {
      const gross = d.approvedAmount !== null && d.approvedAmount !== undefined ? d.approvedAmount : d.amount;
      return sum + (gross || 0);
    }, 0);
  }, [filteredLedger]);

  const ledgerHelpingTotal = useMemo(() => {
    return filteredLedger.reduce((sum, d) => sum + (d.helpingAmount || 0), 0);
  }, [filteredLedger]);

  const ledgerRealTotal = Math.max(0, ledgerGrossTotal - ledgerHelpingTotal);

  // Per-request approval forms
  const [approvedAmountMap, setApprovedAmountMap] = useState({});
  const [helpingAmountMap, setHelpingAmountMap] = useState({});
  const [bRateMap, setBRateMap] = useState({});
  const [inrAmountMap, setInrAmountMap] = useState({});
  const [noteMap, setNoteMap] = useState({});
  const [refMap, setRefMap] = useState({});

  // Direct Manual Adjustment Modal
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [sellersList, setSellersList] = useState([]);
  const [adjustForm, setAdjustForm] = useState({
    sellerId: '',
    type: 'credit',
    amount: '',
    helpingAmount: '',
    reason: '',
    reference: '',
  });
  const [adjusting, setAdjusting] = useState(false);
  const [adjustMsg, setAdjustMsg] = useState('');
  const [adjustErr, setAdjustErr] = useState('');

  // ─── 3-STEP LIMIT UPGRADE MODALS STATE ───
  // Modal 1: Quote / Send Offer (Step 1)
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [offerItem, setOfferItem] = useState(null);
  const [offerLimit, setOfferLimit] = useState('');
  const [offerFee, setOfferFee] = useState('50');
  const [offerNextCount, setOfferNextCount] = useState('15');
  const [offerTierName, setOfferTierName] = useState('');
  const [offerNote, setOfferNote] = useState('');
  const [submittingOffer, setSubmittingOffer] = useState(false);

  // Modal 2: Finalize & Activate (Step 3)
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [finalizeItem, setFinalizeItem] = useState(null);
  const [submittingFinalize, setSubmittingFinalize] = useState(false);

  // Modal 3: Reject / Decline
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectItem, setRejectItem] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);

  const load = () => {
    setLoading(true);
    api(`/sellers/withdrawals/all?status=${statusFilter}&type=${typeFilter}`)
      .then((res) => {
        setRequests(res.requests || []);
        setSummary(res.summary || {});

        const aMap = {};
        const hMap = {};
        const bMap = {};
        const iMap = {};
        (res.requests || []).forEach((r) => {
          aMap[r._id] = r.amount;
          if (r.helpingAmount !== undefined) hMap[r._id] = r.helpingAmount;
          if (r.binanceRate !== undefined) bMap[r._id] = r.binanceRate;
          if (r.inrAmount !== undefined) iMap[r._id] = r.inrAmount;
        });
        setApprovedAmountMap((prev) => ({ ...aMap, ...prev }));
        setHelpingAmountMap((prev) => ({ ...hMap, ...prev }));
        setBRateMap((prev) => ({ ...bMap, ...prev }));
        setInrAmountMap((prev) => ({ ...iMap, ...prev }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Also load limit requests
    api('/sellers/limit-requests/all')
      .then((res) => {
        setLimitRequests(res.requests || []);
      })
      .catch(() => {});
  };

  const loadDepositsLedger = () => {
    setLedgerLoading(true);
    api(`/sellers/withdrawals/all?type=deposit&status=${ledgerStatus}`)
      .then((res) => {
        setDepositsLedger(res.requests || []);
      })
      .catch(() => {})
      .finally(() => setLedgerLoading(false));
  };

  useEffect(() => {
    load();
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    if (activeTab === 'ledger') {
      loadDepositsLedger();
    }
  }, [activeTab, ledgerStatus]);

  const handleSplitSuccess = (updatedDoc) => {
    setRequests((prev) => prev.map((r) => (r._id === updatedDoc._id ? { ...r, ...updatedDoc } : r)));
    setDepositsLedger((prev) => prev.map((r) => (r._id === updatedDoc._id ? { ...r, ...updatedDoc } : r)));
    if (updatedDoc.helpingAmount !== undefined) {
      setHelpingAmountMap((prev) => ({ ...prev, [updatedDoc._id]: updatedDoc.helpingAmount }));
    }
    load();
    loadDepositsLedger();
  };

  // Real-time synchronization on WebSocket events
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // Safety net: ensure admin is in 'admins' room so withdrawal:new events are received
    // AdminLayout does this too, but if admin navigates directly here or socket reconnects
    // after component mount, we need to re-emit admin:join
    const adminToken = localStorage.getItem('ng_admin_token');
    const rejoin = () => {
      if (adminToken) socket.emit('admin:join', { token: adminToken });
    };
    if (socket.connected) rejoin();
    socket.on('connect', rejoin);

    const handleSync = () => {
      load();
      loadDepositsLedger();
    };

    socket.on('withdrawal:new', handleSync);
    socket.on('withdrawal:update', handleSync);
    socket.on('limit:new', handleSync);
    socket.on('limit:update', handleSync);

    return () => {
      socket.off('connect', rejoin);
      socket.off('withdrawal:new', handleSync);
      socket.off('withdrawal:update', handleSync);
      socket.off('limit:new', handleSync);
      socket.off('limit:update', handleSync);
    };
  }, [statusFilter, typeFilter]);

  // Handler: Open Offer Modal (Step 1)
  const handleOpenOffer = (item) => {
    setOfferItem(item);
    const suggestedLimit = item.pendingRequest?.offeredLimit || item.pendingRequest?.requestedLimit || (item.currentMaxAmount * 2);
    setOfferLimit(suggestedLimit);
    setOfferFee(item.pendingRequest?.offeredFee !== undefined ? item.pendingRequest.offeredFee : (item.upgradeFee !== undefined ? item.upgradeFee : '50'));
    setOfferNextCount(item.pendingRequest?.offeredNextCount || '15');
    setOfferTierName(item.pendingRequest?.offeredTierName || `Tier Upgraded ($${suggestedLimit} Max)`);
    setOfferNote(item.pendingRequest?.adminNote || 'Based on your store volume, you are eligible for this limit upgrade offer.');
    setShowOfferModal(true);
  };

  // Handler: Submit Offer (Step 1 - $0 Deducted)
  const handleSendOfferSubmit = async (e) => {
    e.preventDefault();
    if (!offerItem) return;
    setSubmittingOffer(true);
    try {
      await api(`/sellers/${offerItem.sellerId}/limit-offer`, {
        method: 'POST',
        body: {
          offeredLimit: Number(offerLimit),
          offeredFee: Number(offerFee),
          offeredNextCount: Number(offerNextCount),
          offeredTierName: offerTierName.trim(),
          adminNote: offerNote.trim(),
        },
      });
      alert(`Official limit upgrade offer sent to ${offerItem.storeName}! Waiting for seller acceptance. ✅`);
      setShowOfferModal(false);
      load();
    } catch (err) {
      alert('Error sending offer: ' + err.message);
    } finally {
      setSubmittingOffer(false);
    }
  };

  // Handler: Open Finalize Modal (Step 3)
  const handleOpenFinalize = (item) => {
    setFinalizeItem(item);
    setShowFinalizeModal(true);
  };

  // Handler: Submit Finalize & Activate (Step 3 - Fee Deducted & Limit Activated)
  const handleFinalizeSubmit = async (e) => {
    e.preventDefault();
    if (!finalizeItem) return;
    setSubmittingFinalize(true);
    try {
      const res = await api(`/sellers/${finalizeItem.sellerId}/limit-finalize`, {
        method: 'POST',
        body: {},
      });
      alert(`Limit successfully finalized and activated for ${finalizeItem.storeName}! ✅`);
      setShowFinalizeModal(false);
      load();
    } catch (err) {
      alert('Error activating limit: ' + err.message);
    } finally {
      setSubmittingFinalize(false);
    }
  };

  // Handler: Open Reject Modal
  const handleOpenReject = (item) => {
    setRejectItem(item);
    setRejectNote('Please fulfill more completed orders with positive customer ratings before re-applying.');
    setShowRejectModal(true);
  };

  // Handler: Submit Reject
  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!rejectItem) return;
    setSubmittingReject(true);
    try {
      await api(`/sellers/${rejectItem.sellerId}/limit-increase-decision`, {
        method: 'POST',
        body: { action: 'reject', adminNote: rejectNote.trim() },
      });
      alert(`Limit request declined for ${rejectItem.storeName}.`);
      setShowRejectModal(false);
      load();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSubmittingReject(false);
    }
  };

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
    const req = requests.find((r) => r._id === id);
    const appAmt = approvedAmountMap[id] !== undefined ? Number(approvedAmountMap[id]) : (req ? req.amount : 0);

    if (status === 'approved' && req && (req.type === 'withdraw' || reqType === 'withdraw')) {
      const sellerLimit = req.seller?.withdrawalLimit?.maxAmount !== undefined ? req.seller.withdrawalLimit.maxAmount : 500;
      if (appAmt > req.amount) {
        alert(`Cannot approve $${appAmt}: Exceeds requested amount ($${req.amount}).`);
        return;
      }
      if (appAmt > sellerLimit) {
        alert(`Cannot approve $${appAmt}: Exceeds seller withdrawal limit of $${sellerLimit}. Upgrade seller limit first.`);
        return;
      }
      if (appAmt <= 0) {
        alert('Approved amount must be greater than $0.');
        return;
      }
    }

    setProcessing((p) => ({ ...p, [id]: true }));
    try {
      const isDepositReq = req?.type === 'deposit' || reqType === 'deposit';
      const isWithdrawReq = req?.type === 'withdrawal' || req?.type === 'withdraw' || reqType === 'withdrawal' || reqType === 'withdraw';

      const helpingAmt = (status === 'approved' && isDepositReq)
        ? (helpingAmountMap[id] !== undefined && helpingAmountMap[id] !== '' ? Number(helpingAmountMap[id]) : 0)
        : undefined;

      const bRate = (status === 'approved' && isWithdrawReq && bRateMap[id] !== undefined && bRateMap[id] !== '')
        ? Number(bRateMap[id])
        : undefined;

      const currentInrVal = (status === 'approved' && isWithdrawReq)
        ? (inrAmountMap[id] !== undefined && inrAmountMap[id] !== '' ? Number(inrAmountMap[id]) : Number((appAmt * 83.50).toFixed(2)))
        : undefined;

      const usdtAmt = (status === 'approved' && isWithdrawReq && bRate > 0 && currentInrVal > 0)
        ? Number((currentInrVal / bRate).toFixed(2))
        : undefined;

      await api(`/sellers/withdrawals/${id}`, {
        method: 'PUT',
        body: {
          status,
          adminNote: noteMap[id] || '',
          transactionRef: refMap[id] || '',
          approvedAmount: status === 'approved' ? appAmt : undefined,
          helpingAmount: helpingAmt,
          binanceRate: bRate,
          inrAmount: currentInrVal,
          usdtAmount: usdtAmt,
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
      const helpingAmt = (adjustForm.type === 'credit' && adjustForm.helpingAmount) ? Number(adjustForm.helpingAmount) : 0;
      const res = await api(`/sellers/${adjustForm.sellerId}/wallet/adjust`, {
        method: 'POST',
        body: {
          type: adjustForm.type,
          amount: amt,
          helpingAmount: helpingAmt,
          reason: adjustForm.reason,
          reference: adjustForm.reference,
        },
      });
      setAdjustMsg(`✅ ${res.message || 'Wallet adjusted successfully!'}`);
      setAdjustForm((f) => ({ ...f, amount: '', helpingAmount: '', reason: '', reference: '' }));
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
          <small>Pending Payouts</small>
        </div>
        <div className="withdraw-stat" style={{ color: '#059669' }}>
          <b>{money(summary.pendingDeposits || 0)}</b>
          <small>Pending Deposits</small>
        </div>
        <div className="withdraw-stat" style={{ color: '#dc2626' }}>
          <b>{money(summary.pendingWithdrawals || 0)}</b>
          <small>Pending Withdrawals</small>
        </div>
        <div className="withdraw-stat" style={{ color: '#2563eb' }}>
          <b>{limitRequests.filter((l) => l.pendingRequest?.status === 'pending').length}</b>
          <small>Pending Limit Upgrades</small>
        </div>
      </div>

      {/* Main View Tab Switcher */}
      <div style={{ display: 'flex', gap: 10, margin: '20px 0 16px', borderBottom: '2px solid #e2e8f0', paddingBottom: 10 }}>
        <button
          type="button"
          onClick={() => setActiveTab('requests')}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 13.5,
            border: 'none',
            cursor: 'pointer',
            background: activeTab === 'requests' ? '#0f172a' : '#f1f5f9',
            color: activeTab === 'requests' ? '#ffffff' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>💸 Payouts &amp; Deposits Queue</span>
          {(summary.pending || 0) > 0 && (
            <span style={{ background: '#ef4444', color: '#fff', fontSize: 10.5, padding: '1px 6px', borderRadius: 10, fontWeight: 800 }}>
              {summary.pending}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ledger')}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 13.5,
            border: 'none',
            cursor: 'pointer',
            background: activeTab === 'ledger' ? '#0f172a' : '#f1f5f9',
            color: activeTab === 'ledger' ? '#ffffff' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>📑 Deposits Ledger &amp; Helping Split</span>
          <span style={{ background: '#7c3aed', color: '#fff', fontSize: 10.5, padding: '1px 6px', borderRadius: 10, fontWeight: 800 }}>
            {depositsLedger.length > 0 ? depositsLedger.length : 'Ledger'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('limits')}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 13.5,
            border: 'none',
            cursor: 'pointer',
            background: activeTab === 'limits' ? '#0f172a' : '#f1f5f9',
            color: activeTab === 'limits' ? '#ffffff' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>🚀 Withdrawal Limit Upgrade Requests</span>
          {limitRequests.filter((l) => l.pendingRequest?.status === 'pending').length > 0 && (
            <span style={{ background: '#f59e0b', color: '#fff', fontSize: 10.5, padding: '1px 6px', borderRadius: 10, fontWeight: 800 }}>
              {limitRequests.filter((l) => l.pendingRequest?.status === 'pending').length}
            </span>
          )}
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          VIEW 1: DEPOSIT & WITHDRAWAL PAYOUTS QUEUE
          ───────────────────────────────────────────────────────────── */}
      {activeTab === 'requests' && (
        <>
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
                      <small className="muted-sm block">{r.seller?.ownerName} • {r.seller?.email}</small>
                    </div>
                  </div>

                  <div className="withdrawal-amt-box">
                    <span className="muted-sm block">Requested Amount</span>
                    <b style={{ fontSize: 18, color: isDeposit ? '#16a34a' : '#dc2626' }}>
                      {money(r.amount)}
                    </b>
                  </div>
                </div>

                {/* Details Section */}
                <div className="withdrawal-details-grid" style={{ margin: '12px 0', padding: '10px 14px', background: '#f8fafc', borderRadius: 8 }}>
                  <div>
                    <span className="muted-sm block">Requested At:</span>
                    <small><b>{fmtDay(r.createdAt)}</b></small>
                  </div>
                  {isDeposit ? (
                    <>
                      <div>
                        <span className="muted-sm block">Payment Ref / UTR:</span>
                        <small><b>{r.depositRef || r.transactionRef || 'N/A'}</b></small>
                      </div>
                      <div>
                        <span className="muted-sm block">{r.isManualAdjustment ? 'Reason / Note:' : 'Seller Note:'}</span>
                        <small>{r.depositNote || r.adminNote || 'None'}</small>
                      </div>
                      {Number(r.helpingAmount) > 0 && (
                        <div>
                          <span className="muted-sm block">🤝 Helping Amount:</span>
                          <small><b style={{ color: '#7c3aed' }}>${Number(r.helpingAmount).toLocaleString('en-US')}</b> <span style={{ fontSize: 10, color: '#6b7280' }}>(Admin Internal)</span></small>
                        </div>
                      )}
                      <div>
                        <span className="muted-sm block">Admin Split:</span>
                        <button
                          type="button"
                          onClick={() => setSplitModalDeposit(r)}
                          style={{
                            background: '#faf5ff',
                            border: '1px solid #c4b5fd',
                            borderRadius: 6,
                            padding: '3px 8px',
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#7c3aed',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                          title="Split or edit Helping Amount for this deposit"
                        >
                          <span>✏️ Split Helping</span>
                          {Number(r.helpingAmount) > 0 && (
                            <span style={{ fontSize: 9.5, background: '#ede9fe', padding: '0 4px', borderRadius: 3 }}>
                              ${Number(r.helpingAmount).toLocaleString('en-US')}
                            </span>
                          )}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <span className="muted-sm block">Method:</span>
                        <small>
                          <b style={{ color: '#2563eb' }}>
                            {r.method === 'bank' ? '🏦 BANK TRANSFER' : r.method === 'upi' ? '⚡ UPI VPA' : r.method === 'paytm' ? '📱 PAYTM' : r.method === 'gpay' ? '🔵 GOOGLE PAY' : r.method === 'phonepe' ? '🟣 PHONEPE' : r.method === 'usdt' ? '💎 USDT CRYPTO' : (r.method?.toUpperCase() || 'BANK')}
                          </b>
                        </small>
                      </div>
                      {r.accountTitle && (
                        <div>
                          <span className="muted-sm block">Account Title:</span>
                          <small><b>{r.accountTitle}</b></small>
                        </div>
                      )}
                      {r.upiId && (
                        <div>
                          <span className="muted-sm block">UPI ID / VPA:</span>
                          <small><b style={{ color: '#059669' }}>{r.upiId}</b></small>
                        </div>
                      )}
                      {r.phone && (
                        <div>
                          <span className="muted-sm block">Phone / Mobile:</span>
                          <small><b>{r.phone}</b></small>
                        </div>
                      )}
                      {r.accountNumber && (
                        <div>
                          <span className="muted-sm block">Account No:</span>
                          <small><b>{r.accountNumber}</b></small>
                        </div>
                      )}
                      {r.bankName && (
                        <div>
                          <span className="muted-sm block">Bank Name:</span>
                          <small><b>{r.bankName}</b></small>
                        </div>
                      )}
                      {r.ifscCode && (
                        <div>
                          <span className="muted-sm block">IFSC Code:</span>
                          <small><b style={{ color: '#d97706' }}>{r.ifscCode}</b></small>
                        </div>
                      )}
                      {r.walletAddress && (
                        <div>
                          <span className="muted-sm block">USDT Wallet ({r.network || 'TRC-20'}):</span>
                          <small><b style={{ fontFamily: 'monospace', color: '#16a34a' }}>{r.walletAddress}</b></small>
                        </div>
                      )}
                      {Number(r.binanceRate) > 0 && (
                        <div>
                          <span className="muted-sm block">🟡 B.Rate (Binance):</span>
                          <small><b style={{ color: '#b45309' }}>₹{r.binanceRate} / USDT</b> <span style={{ fontSize: 10, color: '#6b7280' }}>(Admin Internal)</span></small>
                        </div>
                      )}
                      {Number(r.inrAmount) > 0 && (
                        <div>
                          <span className="muted-sm block">🇮🇳 INR Payout:</span>
                          <small><b style={{ color: '#0f172a' }}>₹{Number(r.inrAmount).toLocaleString('en-IN')}</b> <span style={{ fontSize: 10, color: '#6b7280' }}>(Admin Internal)</span></small>
                        </div>
                      )}
                      {Number(r.usdtAmount) > 0 && (
                        <div>
                          <span className="muted-sm block">💎 Resulting USDT:</span>
                          <small><b style={{ color: '#15803d' }}>{r.usdtAmount} USDT</b> <span style={{ fontSize: 10, color: '#6b7280' }}>(Admin Internal)</span></small>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Approval Action Form */}
                {isPending && (
                  <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: 12, marginTop: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                          Approved Amount ($):
                        </label>
                        <input
                          type="number"
                          value={currentApprovedAmt}
                          onChange={(e) => setApprovedAmountMap((prev) => ({ ...prev, [r._id]: e.target.value }))}
                          style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, fontWeight: 700 }}
                        />
                      </div>
                      {isDeposit && (
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 800, display: 'block', marginBottom: 4, color: '#7c3aed' }}>
                            🤝 Helping Amount ($ USD) <span style={{ fontSize: 10, fontWeight: 600, color: '#6b7280' }}>(Admin Internal • Hidden from Seller)</span>:
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0"
                            value={helpingAmountMap[r._id] !== undefined ? helpingAmountMap[r._id] : (r.helpingAmount || '')}
                            onChange={(e) => setHelpingAmountMap((prev) => ({ ...prev, [r._id]: e.target.value }))}
                            style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1.5px solid #c4b5fd', background: '#faf5ff', fontSize: 13, fontWeight: 700, color: '#6b21a8' }}
                          />
                        </div>
                      )}
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                          Bank Ref / UTR Number:
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. UTR9876543210"
                          value={refMap[r._id] || ''}
                          onChange={(e) => setRefMap((prev) => ({ ...prev, [r._id]: e.target.value }))}
                          style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                          Admin Note (Sent to Seller Chat):
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Payout processed via NEFT / IMPS"
                          value={noteMap[r._id] || ''}
                          onChange={(e) => setNoteMap((prev) => ({ ...prev, [r._id]: e.target.value }))}
                          style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                        />
                      </div>
                    </div>

                    {/* Binance B.Rate & USDT Calculator (Admin Internal for Withdrawals) */}
                    {!isDeposit && (() => {
                      const appNum = Number(currentApprovedAmt !== undefined && currentApprovedAmt !== '' ? currentApprovedAmt : (r.amount || 0));
                      const defaultInr = appNum > 0 ? (appNum * 83.5).toFixed(0) : '';
                      const currentInr = inrAmountMap[r._id] !== undefined
                        ? inrAmountMap[r._id]
                        : (r.inrAmount ? String(r.inrAmount) : defaultInr);
                      const currentBRate = bRateMap[r._id] !== undefined ? bRateMap[r._id] : (r.binanceRate ? String(r.binanceRate) : '');
                      const calcUsdt = (Number(currentInr) > 0 && Number(currentBRate) > 0)
                        ? (Number(currentInr) / Number(currentBRate)).toFixed(2)
                        : null;

                      return (
                        <div style={{
                          background: 'linear-gradient(135deg, #fefce8 0%, #fffdf0 100%)',
                          border: '1.5px solid #fde047',
                          borderRadius: 8,
                          padding: '10px 14px',
                          marginBottom: 10,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 16 }}>🟡</span>
                              <b style={{ fontSize: 12, color: '#854d0e' }}>B.Rate &amp; Binance USDT Conversion</b>
                              <span style={{ fontSize: 10, background: '#fef9c3', color: '#a16207', padding: '1px 6px', borderRadius: 4, fontWeight: 700, border: '1px solid #fde047' }}>
                                Admin Internal • Hidden from Seller
                              </span>
                            </div>
                            {calcUsdt && (
                              <div style={{ background: '#16a34a', color: '#ffffff', padding: '3px 10px', borderRadius: 6, fontSize: 12.5, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span>💎 Binance USDT:</span>
                                <span>{calcUsdt} USDT</span>
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'flex-start' }}>
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4, color: '#713f12' }}>
                                🇮🇳 Indian Rupees Payout (₹ INR):
                              </label>
                              <input
                                type="number"
                                step="any"
                                placeholder="e.g. 8350"
                                value={currentInr}
                                onChange={(e) => setInrAmountMap((prev) => ({ ...prev, [r._id]: e.target.value }))}
                                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #fde047', background: '#ffffff', fontSize: 13, fontWeight: 700, color: '#0f172a' }}
                              />
                              <small style={{ fontSize: 10.5, color: '#a16207', display: 'block', marginTop: 2 }}>
                                Auto: ${appNum} × 83.50 = ₹{(appNum * 83.5).toFixed(0)} (editable)
                              </small>
                            </div>

                            <div>
                              <label style={{ fontSize: 11, fontWeight: 800, display: 'block', marginBottom: 4, color: '#854d0e' }}>
                                🟡 B.Rate (Binance Rate ₹/USDT) *:
                              </label>
                              <input
                                type="number"
                                step="any"
                                placeholder="e.g. 90.00"
                                value={currentBRate}
                                onChange={(e) => setBRateMap((prev) => ({ ...prev, [r._id]: e.target.value }))}
                                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1.5px solid #eab308', background: '#ffffff', fontSize: 13, fontWeight: 800, color: '#854d0e' }}
                              />
                              <small style={{ fontSize: 10.5, color: '#a16207', display: 'block', marginTop: 2 }}>
                                Binance P2P rate (1 USDT = ₹{currentBRate || '...'})
                              </small>
                            </div>

                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4, color: '#713f12' }}>
                                💎 Converted Binance USDT:
                              </label>
                              <div style={{
                                padding: '6px 10px',
                                borderRadius: 6,
                                background: calcUsdt ? '#ecfdf5' : '#f8fafc',
                                border: `1.5px solid ${calcUsdt ? '#86efac' : '#cbd5e1'}`,
                                fontSize: 13,
                                fontWeight: 800,
                                color: calcUsdt ? '#15803d' : '#94a3b8',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                minHeight: 33,
                              }}>
                                <span>{calcUsdt ? `${calcUsdt} USDT` : 'B.Rate enter karein'}</span>
                                {calcUsdt && <span style={{ fontSize: 10.5, color: '#16a34a' }}>₹{currentInr} ÷ {currentBRate}</span>}
                              </div>
                              <small style={{ fontSize: 10.5, color: '#a16207', display: 'block', marginTop: 2 }}>
                                Indian Rupees se itni USDT bani
                              </small>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="withdrawal-btns mt-2" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        className="btn-primary"
                        disabled={processing[r._id]}
                        onClick={() => handleAction(r._id, 'approved', r.type)}
                      >
                        <Ic name="check" size={15} />
                        {isDeposit
                          ? ` Approve & Credit $${currentApprovedAmt || r.amount} to Wallet`
                          : Number(currentApprovedAmt || r.amount) < r.amount
                            ? ` Approve Partial $${currentApprovedAmt} (Refund $${r.amount - currentApprovedAmt})`
                            : ` Approve Payout of $${currentApprovedAmt || r.amount}`}
                      </button>

                      <button
                        className="btn-danger"
                        disabled={processing[r._id]}
                        onClick={() => handleAction(r._id, 'rejected', r.type)}
                      >
                        <Ic name="x" size={15} /> Reject Request (Full Refund)
                      </button>

                      <small className="muted-sm ml-auto">
                        Approve/Reject karne par seller ko chat mein auto-receipt aur sound alert jayegi.
                      </small>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {/* ─────────────────────────────────────────────────────────────
          VIEW 3: DEPOSITS LEDGER & HELPING AMOUNT SPLIT
          ───────────────────────────────────────────────────────────── */}
      {activeTab === 'ledger' && (
        <div className="admin-deposits-ledger-section">
          {/* Header & Direct Adjustment Trigger */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-flex', padding: '6px 8px', borderRadius: 8, background: '#ede9fe', color: '#7c3aed' }}>
                  🤝
                </span>
                Sellers Deposits Ledger &amp; Helping Split
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#64748b' }}>
                Yahan par sellers ke tamam deposits ka record hai. Kisi bhi deposit par click karke Admin Helping Amount split kar sakta hai jo Admin USDT Wallet se minus ho jayegi.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                onClick={loadDepositsLedger}
                disabled={ledgerLoading}
                style={{
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  padding: '7px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#475569',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Ic name="refresh" size={13} />
                <span>Refresh</span>
              </button>

              <button
                type="button"
                onClick={() => setShowAdjustModal(true)}
                style={{
                  background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '7px 14px',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 2px 6px rgba(5, 150, 105, 0.25)',
                }}
              >
                <span>➕ Direct Deposit Adjustment</span>
              </button>
            </div>
          </div>

          {/* Ledger KPI Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: 12,
              marginBottom: 16,
            }}
          >
            {/* Total Gross Deposited */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Total Gross Deposited
              </div>
              <div style={{ fontSize: 19, fontWeight: 900, color: '#0f172a', marginTop: 2 }}>
                {money(ledgerGrossTotal)}
              </div>
              <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>
                Full seller credited funds
              </div>
            </div>

            {/* Total Helping Split */}
            <div style={{ background: '#ffffff', border: '1.5px solid #ddd6fe', borderRadius: 12, padding: '12px 16px', boxShadow: '0 1px 3px rgba(124, 58, 237, 0.06)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>
                🤝 Total Helping Split
              </div>
              <div style={{ fontSize: 19, fontWeight: 900, color: '#7c3aed', marginTop: 2 }}>
                -{money(ledgerHelpingTotal)}
              </div>
              <div style={{ fontSize: 10.5, color: '#8b5cf6', marginTop: 2 }}>
                Excluded from Admin USDT Wallet
              </div>
            </div>

            {/* Real Seller Inflow (USDT Wallet) */}
            <div style={{ background: '#ffffff', border: '1.5px solid #a7f3d0', borderRadius: 12, padding: '12px 16px', boxShadow: '0 1px 3px rgba(16, 185, 129, 0.08)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#047857', textTransform: 'uppercase' }}>
                👤 Real Seller Inflow
              </div>
              <div style={{ fontSize: 19, fontWeight: 900, color: '#047857', marginTop: 2 }}>
                +{money(ledgerRealTotal)}
              </div>
              <div style={{ fontSize: 10.5, color: '#059669', marginTop: 2 }}>
                Counted in Admin USDT Wallet
              </div>
            </div>

            {/* Filtered Count */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Deposits Count
              </div>
              <div style={{ fontSize: 19, fontWeight: 900, color: '#0f172a', marginTop: 2 }}>
                {filteredLedger.length}
              </div>
              <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>
                Recorded deposits
              </div>
            </div>
          </div>

          {/* Filters & Search Toolbar */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: 12,
              padding: '12px 16px',
              border: '1px solid #e2e8f0',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            {/* Status pills */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { val: 'all', label: 'All Deposits' },
                { val: 'approved', label: '✓ Approved' },
                { val: 'pending', label: '⏳ Pending' },
                { val: 'rejected', label: '✕ Rejected' },
              ].map((s) => (
                <button
                  key={s.val}
                  type="button"
                  onClick={() => setLedgerStatus(s.val)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    background: ledgerStatus === s.val ? '#0f172a' : '#f1f5f9',
                    color: ledgerStatus === s.val ? '#ffffff' : '#64748b',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div style={{ position: 'relative', minWidth: 260, flex: 1, maxWidth: 420 }}>
              <input
                type="text"
                placeholder="Search store, seller, UTR reference, note..."
                value={ledgerSearch}
                onChange={(e) => setLedgerSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 12px 7px 32px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  fontSize: 12.5,
                  outline: 'none',
                }}
              />
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
                <Ic name="search" size={14} />
              </span>
              {ledgerSearch && (
                <button
                  type="button"
                  onClick={() => setLedgerSearch('')}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                >
                  <Ic name="x" size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Ledger Table */}
          {ledgerLoading ? (
            <div className="card text-center py-5">
              <p className="muted">Loading deposits ledger…</p>
            </div>
          ) : filteredLedger.length === 0 ? (
            <div className="empty-box">
              <Ic name="wallet" size={44} stroke={1.2} />
              <p>Koi deposit transaction nahi mili.</p>
              {ledgerSearch && (
                <button
                  type="button"
                  onClick={() => setLedgerSearch('')}
                  className="btn-outline btn-sm mt-2"
                >
                  Clear Search
                </button>
              )}
            </div>
          ) : (
            <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Date &amp; Time</th>
                      <th>Store &amp; Seller</th>
                      <th>Gross Deposit</th>
                      <th>Split (Real vs Helping)</th>
                      <th>Method &amp; Ref (UTR)</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Admin Split Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLedger.map((d) => {
                      const gross = d.approvedAmount !== null && d.approvedAmount !== undefined ? d.approvedAmount : d.amount;
                      const helping = d.helpingAmount || 0;
                      const real = Math.max(0, gross - helping);

                      return (
                        <tr key={d._id}>
                          <td>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>
                              {fmtDate(d.processedAt || d.createdAt)}
                            </div>
                            <small className="muted-sm">ID #{String(d._id).slice(-6)}</small>
                          </td>

                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontWeight: 800, color: '#0f172a' }}>
                                {d.storeName || d.seller?.storeName || 'Store'}
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              {d.seller?.ownerName} {d.seller?.email && `• ${d.seller.email}`}
                            </div>
                          </td>

                          <td>
                            <b style={{ fontSize: 14, color: '#0f172a' }}>{money(gross)}</b>
                            {d.isManualAdjustment && (
                              <span style={{ fontSize: 10, display: 'block', color: '#059669', fontWeight: 700 }}>
                                Manual Adjustment
                              </span>
                            )}
                          </td>

                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <div style={{ fontSize: 12, color: '#047857', fontWeight: 800 }}>
                                👤 Real: {money(real)}
                              </div>
                              {helping > 0 ? (
                                <div style={{ fontSize: 11, color: '#7c3aed', fontWeight: 700, background: '#faf5ff', padding: '1px 6px', borderRadius: 4, display: 'inline-block' }}>
                                  🤝 Helping: -{money(helping)}
                                </div>
                              ) : (
                                <small style={{ color: '#94a3b8', fontSize: 10.5 }}>
                                  No helping deduction
                                </small>
                              )}
                            </div>
                          </td>

                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span className="pay-chip" style={{ fontSize: 10 }}>
                                {(d.method || 'bank').toUpperCase()}
                              </span>
                              <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#334155' }}>
                                {d.depositRef || d.transactionRef || 'N/A'}
                              </span>
                            </div>
                            {(d.depositNote || d.adminNote) && (
                              <small style={{ color: '#64748b', display: 'block', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {d.depositNote || d.adminNote}
                              </small>
                            )}
                          </td>

                          <td>
                            <span className={`status-chip ${STATUS_COLOR[d.status] || ''}`}>
                              {d.status?.toUpperCase()}
                            </span>
                          </td>

                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={() => setSplitModalDeposit(d)}
                              style={{
                                background: '#faf5ff',
                                border: '1.5px solid #c4b5fd',
                                borderRadius: 7,
                                padding: '5px 10px',
                                fontSize: 11.5,
                                fontWeight: 800,
                                color: '#6b21a8',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                transition: 'all 0.15s ease',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#ede9fe';
                                e.currentTarget.style.borderColor = '#8b5cf6';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = '#faf5ff';
                                e.currentTarget.style.borderColor = '#c4b5fd';
                              }}
                              title="Click to split or edit Helping Amount for this deposit"
                            >
                              <span>✏️ Split / Edit Helping</span>
                              {helping > 0 && (
                                <span style={{ background: '#8b5cf6', color: '#fff', fontSize: 10, padding: '1px 5px', borderRadius: 4 }}>
                                  ${helping}
                                </span>
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          VIEW 2: WITHDRAWAL LIMIT UPGRADE APPLICATIONS (3-STEP PROTOCOL)
          ───────────────────────────────────────────────────────────── */}
      {activeTab === 'limits' && (
        <div className="admin-limit-requests-section">
          {limitRequests.length === 0 ? (
            <div className="empty-box">
              <Ic name="shield" size={44} stroke={1.2} />
              <p>Koi limit upgrade application nahi mili.</p>
            </div>
          ) : (
            <div className="admin-card">
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Store &amp; Seller</th>
                      <th>Wallet Balance</th>
                      <th>Current Tier &amp; Limit</th>
                      <th>Withdrawal Milestones</th>
                      <th>Proposed / Requested Limit</th>
                      <th>Upgrade Fee</th>
                      <th>Pipeline Stage</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {limitRequests.map((l) => {
                      const status = l.pendingRequest?.status || 'none';
                      const isPending = status === 'pending';
                      const isOffered = status === 'offered';
                      const isAccepted = status === 'accepted_by_seller';
                      const isCompleted = status === 'approved';

                      return (
                        <tr key={l.sellerId} style={{ background: isAccepted ? '#f0fdf4' : 'transparent' }}>
                          <td>
                            <b>{l.storeName}</b>
                            <small className="muted-sm block">{l.ownerName} • {l.email}</small>
                          </td>
                          <td>
                            <b style={{ color: l.walletBalance < (l.pendingRequest?.offeredFee || 50) ? '#dc2626' : '#0f172a' }}>
                              {money(l.walletBalance)}
                            </b>
                            {l.walletBalance < (l.pendingRequest?.offeredFee || 50) && (
                              <small className="block" style={{ fontSize: 10.5, color: '#dc2626', fontWeight: 700 }}>
                                ⚠️ Low Balance for fee
                              </small>
                            )}
                          </td>
                          <td>
                            <span style={{ fontWeight: 700, color: '#0f172a' }}>{money(l.currentMaxAmount)}</span>
                            <small className="muted-sm block">{l.currentTierName}</small>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              <span style={{ fontSize: 11.5, fontWeight: 800, color: l.successfulWithdrawalCount >= l.requiredWithdrawalsForIncrease ? '#16a34a' : '#d97706' }}>
                                {l.successfulWithdrawalCount} / {l.requiredWithdrawalsForIncrease} Payouts
                              </span>
                              <div style={{ width: 90, height: 5, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                                <div
                                  style={{
                                    width: `${Math.min(100, Math.round((l.successfulWithdrawalCount / (l.requiredWithdrawalsForIncrease || 1)) * 100))}%`,
                                    height: '100%',
                                    background: l.successfulWithdrawalCount >= l.requiredWithdrawalsForIncrease ? '#16a34a' : '#2563eb',
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          <td>
                            <b style={{ fontSize: 14, color: '#2563eb' }}>
                              {money(l.pendingRequest?.offeredLimit || l.pendingRequest?.requestedLimit || 0)}
                            </b>
                            {l.pendingRequest?.reason && (
                              <small className="muted-sm block" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                "{l.pendingRequest.reason}"
                              </small>
                            )}
                          </td>
                          <td>
                            <span style={{ fontWeight: 700, color: '#d97706' }}>
                              {money(l.pendingRequest?.offeredFee !== undefined ? l.pendingRequest.offeredFee : l.upgradeFee)}
                            </span>
                          </td>
                          <td>
                            {isPending && (
                              <span className="status-chip chip-orange" style={{ fontWeight: 800 }}>
                                🟡 QUOTE NEEDED
                              </span>
                            )}
                            {isOffered && (
                              <span className="status-chip chip-blue" style={{ fontWeight: 800, background: '#eff6ff', color: '#1d4ed8' }}>
                                🔵 WAITING SELLER
                              </span>
                            )}
                            {isAccepted && (
                              <span className="status-chip chip-green" style={{ fontWeight: 800, background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>
                                🟢 SELLER ACCEPTED
                              </span>
                            )}
                            {isCompleted && (
                              <span className="status-chip chip-green">
                                ✅ ACTIVATED
                              </span>
                            )}
                            {(status === 'rejected' || status === 'declined_by_seller') && (
                              <span className="status-chip chip-red">
                                ❌ {status === 'declined_by_seller' ? 'SELLER DECLINED' : 'REJECTED'}
                              </span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {/* Step 1 Action: Quote Terms & Send Offer */}
                              {(isPending || isOffered) && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenOffer(l)}
                                  style={{
                                    padding: '5px 10px',
                                    fontSize: 11.5,
                                    fontWeight: 700,
                                    borderRadius: 6,
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: '#2563eb',
                                    color: '#fff',
                                  }}
                                >
                                  {isOffered ? '✏️ Edit Offer' : '📝 Send Offer Quote'}
                                </button>
                              )}

                              {/* Step 3 Action: Finalize & Activate Limit */}
                              {isAccepted && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenFinalize(l)}
                                  style={{
                                    padding: '6px 12px',
                                    fontSize: 12,
                                    fontWeight: 800,
                                    borderRadius: 6,
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: '#16a34a',
                                    color: '#fff',
                                    boxShadow: '0 2px 6px rgba(22, 163, 74, 0.3)',
                                  }}
                                >
                                  ⚡ Finalize &amp; Activate Limit
                                </button>
                              )}

                              {/* Re-configure after completed */}
                              {isCompleted && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenOffer(l)}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    borderRadius: 6,
                                    border: '1px solid #cbd5e1',
                                    background: '#f8fafc',
                                    cursor: 'pointer',
                                  }}
                                >
                                  ⚙️ Offer New Tier
                                </button>
                              )}

                              {/* Reject / Decline */}
                              {(isPending || isOffered || isAccepted) && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenReject(l)}
                                  style={{
                                    padding: '5px 8px',
                                    fontSize: 11.5,
                                    fontWeight: 700,
                                    borderRadius: 6,
                                    border: '1px solid #fecaca',
                                    cursor: 'pointer',
                                    background: '#fff',
                                    color: '#dc2626',
                                  }}
                                >
                                  ✕ Decline
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
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 1: SEND LIMIT UPGRADE OFFER / QUOTE (STEP 1 - $0 DEDUCTED)
          ───────────────────────────────────────────────────────────── */}
      {showOfferModal && offerItem && (
        <div className="admin-modal-overlay" onClick={() => setShowOfferModal(false)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div className="modal-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Ic name="shield" size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>📝 Send Limit Upgrade Offer / Quote</h3>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                    Store: <b>{offerItem.storeName}</b> (Current Limit: {money(offerItem.currentMaxAmount)})
                  </p>
                </div>
              </div>
              <button className="btn-close-modal" onClick={() => setShowOfferModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSendOfferSubmit} style={{ padding: '18px 22px' }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
                <small style={{ color: '#475569', fontSize: 12, lineHeight: 1.4 }}>
                  💡 <b>No Money Deducted:</b> Sending this offer will quote the terms to the seller. The seller will review the terms in their wallet and decide whether to <b>Accept</b> or <b>Decline</b>.
                </small>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                    Proposed New Single Limit ($ USD) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={offerLimit}
                    onChange={(e) => setOfferLimit(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 14, fontWeight: 800, color: '#2563eb' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                    Upgrade Processing Fee ($ USD)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={offerFee}
                    onChange={(e) => setOfferFee(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 14, fontWeight: 800, color: '#d97706' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                    Target Withdrawals for Next Tier *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={offerNextCount}
                    onChange={(e) => setOfferNextCount(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                    Tier Name Label
                  </label>
                  <input
                    type="text"
                    value={offerTierName}
                    onChange={(e) => setOfferTierName(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                  Admin Note (Included in Official Offer Slip)
                </label>
                <textarea
                  rows="2"
                  value={offerNote}
                  onChange={(e) => setOfferNote(e.target.value)}
                  placeholder="e.g. Based on your consistent order volume, we are offering you this limit upgrade."
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, fontFamily: 'inherit' }}
                />
              </div>

              <div className="modal-bottom-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowOfferModal(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submittingOffer}
                >
                  {submittingOffer ? 'Sending Offer...' : `📤 Send Official Offer ($${offerLimit} Limit)`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 2: FINALIZE & ACTIVATE LIMIT INCREASE (STEP 3 - ACTIVATION)
          ───────────────────────────────────────────────────────────── */}
      {showFinalizeModal && finalizeItem && (
        <div className="admin-modal-overlay" onClick={() => setShowFinalizeModal(false)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Ic name="shield" size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>⚡ Finalize &amp; Activate Limit Increase</h3>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                    Store: <b>{finalizeItem.storeName}</b>
                  </p>
                </div>
              </div>
              <button className="btn-close-modal" onClick={() => setShowFinalizeModal(false)}>✕</button>
            </div>

            <form onSubmit={handleFinalizeSubmit} style={{ padding: '18px 22px' }}>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
                <b style={{ color: '#166534', fontSize: 13.5, display: 'block', marginBottom: 4 }}>
                  Seller has reviewed and accepted the upgrade terms!
                </b>
                <p style={{ margin: 0, color: '#15803d', fontSize: 12 }}>
                  Clicking confirm below will instantly activate the new limit and deduct the agreed processing fee from the seller's wallet balance.
                </p>
              </div>

              {/* Terms Review Box */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, background: '#f8fafc', padding: '12px 14px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 16 }}>
                <div>
                  <small style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>New Single Limit</small>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#16a34a' }}>
                    {money(finalizeItem.pendingRequest?.offeredLimit || finalizeItem.pendingRequest?.requestedLimit || 2000)}
                  </div>
                </div>
                <div>
                  <small style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Upgrade Fee to Deduct</small>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#d97706' }}>
                    {money(finalizeItem.pendingRequest?.offeredFee !== undefined ? finalizeItem.pendingRequest.offeredFee : 50)}
                  </div>
                </div>
                <div>
                  <small style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Seller Available Balance</small>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                    {money(finalizeItem.walletBalance)}
                  </div>
                </div>
                <div>
                  <small style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Balance After Fee</small>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#2563eb' }}>
                    {money(finalizeItem.walletBalance - (finalizeItem.pendingRequest?.offeredFee || 50))}
                  </div>
                </div>
              </div>

              <div className="modal-bottom-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowFinalizeModal(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submittingFinalize}
                  style={{ background: '#16a34a', borderColor: '#15803d' }}
                >
                  {submittingFinalize ? 'Activating...' : `⚡ Confirm & Activate Limit ($${finalizeItem.pendingRequest?.offeredLimit || 2000})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 3: DECLINE LIMIT INCREASE
          ───────────────────────────────────────────────────────────── */}
      {showRejectModal && rejectItem && (
        <div className="admin-modal-overlay" onClick={() => setShowRejectModal(false)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Ic name="shield" size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>❌ Decline Limit Increase Application</h3>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                    Store: <b>{rejectItem.storeName}</b>
                  </p>
                </div>
              </div>
              <button className="btn-close-modal" onClick={() => setShowRejectModal(false)}>✕</button>
            </div>

            <form onSubmit={handleRejectSubmit} style={{ padding: '18px 22px' }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                  Decline Reason / Explanation (Sent to Seller Chat)
                </label>
                <textarea
                  rows="3"
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, fontFamily: 'inherit' }}
                  required
                />
              </div>

              <div className="modal-bottom-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowRejectModal(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-danger"
                  disabled={submittingReject}
                >
                  {submittingReject ? 'Declining...' : '❌ Confirm Decline'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DIRECT MANUAL WALLET ADJUSTMENT MODAL */}
      {showAdjustModal && (() => {
        const selectedSellerObj = sellersList.find((s) => String(s._id) === String(adjustForm.sellerId)) || sellersList[0];
        const isDebit = adjustForm.type === 'debit';
        const isExcessDebit = isDebit && Number(adjustForm.amount) > (selectedSellerObj?.wallet?.balance || 0);

        return (
          <div className="admin-modal-overlay" onClick={() => setShowAdjustModal(false)}>
            <div className="admin-modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
              <div className="modal-top">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                    💳
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900 }}>Direct Seller Wallet Adjustment</h3>
                    <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                      Credit or debit vendor funds instantly with live balance synchronization.
                    </p>
                  </div>
                </div>
                <button type="button" className="btn-close-modal" onClick={() => setShowAdjustModal(false)}>
                  <Ic name="x" size={18} />
                </button>
              </div>

              {adjustMsg && <div className="alert-success mb-3" style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{adjustMsg}</div>}
              {adjustErr && <div className="alert-error mb-3" style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{adjustErr}</div>}

              <form onSubmit={handleManualAdjustSubmit} className="admin-modal-form">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* 1. SELLER SELECTOR & PREVIEW */}
                  <div className="adjust-seller-section">
                    <label style={{ fontSize: 12.5, fontWeight: 800, color: '#1e293b', display: 'block', marginBottom: 6 }}>
                      Select Target Seller Store *
                    </label>
                    <div className="custom-seller-dropdown-wrap">
                      <select
                        className="custom-seller-select"
                        value={adjustForm.sellerId}
                        onChange={(e) => setAdjustForm((f) => ({ ...f, sellerId: e.target.value }))}
                      >
                        {sellersList.map((s) => (
                          <option key={s._id} value={s._id}>
                            🏬 {s.storeName} — Owner: {s.ownerName} (Balance: {money(s.wallet?.balance || 0)})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Selected Seller Profile Preview Card */}
                    {selectedSellerObj && (
                      <div className="selected-seller-preview-box">
                        <div className="sspb-left">
                          <div className="sspb-avatar">
                            {(selectedSellerObj.storeName?.[0] || 'S').toUpperCase()}
                          </div>
                          <div className="sspb-info">
                            <b className="sspb-name">{selectedSellerObj.storeName}</b>
                            <span className="sspb-owner">
                              Owner: {selectedSellerObj.ownerName} &bull; {selectedSellerObj.email}
                            </span>
                          </div>
                        </div>
                        <div className="sspb-right">
                          <span className="sspb-lbl">Available Balance</span>
                          <b className="sspb-balance">{money(selectedSellerObj.wallet?.balance || 0)}</b>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 2. ADJUSTMENT ACTION SEGMENTED CARDS */}
                  <div>
                    <label style={{ fontSize: 12.5, fontWeight: 800, color: '#1e293b', display: 'block', marginBottom: 6 }}>
                      Select Adjustment Action *
                    </label>
                    <div className="adjust-action-toggle-grid">
                      <button
                        type="button"
                        className={`adjust-action-card credit ${!isDebit ? 'active' : ''}`}
                        onClick={() => setAdjustForm((f) => ({ ...f, type: 'credit' }))}
                      >
                        <span className="aac-icon">💰</span>
                        <div className="aac-text">
                          <b>Credit Funds (+)</b>
                          <small>Add funds directly to available wallet</small>
                        </div>
                        {!isDebit && <span className="aac-check">✓</span>}
                      </button>

                      <button
                        type="button"
                        className={`adjust-action-card debit ${isDebit ? 'active' : ''}`}
                        onClick={() => setAdjustForm((f) => ({ ...f, type: 'debit' }))}
                      >
                        <span className="aac-icon">💸</span>
                        <div className="aac-text">
                          <b>Debit Funds (-)</b>
                          <small>Deduct funds from available wallet</small>
                        </div>
                        {isDebit && <span className="aac-check">✓</span>}
                      </button>
                    </div>
                  </div>

                  {/* 3. MULTI-CURRENCY CONVERTER WIDGET */}
                  <div className="field-full">
                    <CurrencyConverterWidget
                      usdValue={adjustForm.amount}
                      onUsdChange={(val) => setAdjustForm((f) => ({ ...f, amount: val }))}
                      title="Manual Amount & Currency Converter"
                      mode={adjustForm.type === 'credit' ? 'deposit' : 'withdraw'}
                    />
                  </div>

                  {/* Helping Amount Input (Admin Internal • Hidden from Seller) */}
                  {!isDebit && (
                    <div style={{ background: '#faf5ff', border: '1.5px solid #c4b5fd', borderRadius: 8, padding: '10px 14px' }}>
                      <label style={{ fontSize: 12, fontWeight: 800, color: '#7c3aed', display: 'block', marginBottom: 4 }}>
                        🤝 Helping Amount ($ USD) <span style={{ fontSize: 10.5, fontWeight: 600, color: '#6b7280' }}>(Admin Internal • Hidden from Seller)</span>:
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0 (e.g. how much admin contributed as help)"
                        value={adjustForm.helpingAmount}
                        onChange={(e) => setAdjustForm((f) => ({ ...f, helpingAmount: e.target.value }))}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #c4b5fd', background: '#ffffff', fontSize: 13, fontWeight: 700, color: '#6b21a8' }}
                      />
                      <small style={{ color: '#8b5cf6', fontSize: 11, marginTop: 4, display: 'block' }}>
                        Admin ki taraf se di gayi help amount. Seller ko chat ya wallet mein ye amount show nahi hoga.
                      </small>
                    </div>
                  )}

                  {/* Excess Debit Warning */}
                  {isExcessDebit && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      ⚠️ Warning: Debit amount (${adjustForm.amount}) exceeds seller's current balance ({money(selectedSellerObj?.wallet?.balance || 0)}). Wallet will go negative.
                    </div>
                  )}

                  {/* 4. REASON & REF INPUTS */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                        Reason / Notes * <span className="muted-sm">(Visible to seller)</span>
                      </label>
                      <input
                        placeholder="e.g. Bank wire deposit verified / Bonus / Penalty"
                        value={adjustForm.reason}
                        onChange={(e) => setAdjustForm((f) => ({ ...f, reason: e.target.value }))}
                        required
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                        Payment Ref / UTR <span className="muted-sm">(Optional)</span>
                      </label>
                      <input
                        placeholder="e.g. UTR1234567890 / Cash Receipt #"
                        value={adjustForm.reference}
                        onChange={(e) => setAdjustForm((f) => ({ ...f, reference: e.target.value }))}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                      />
                    </div>
                  </div>
                </div>

                {/* 5. MODAL BOTTOM ACTIONS */}
                <div className="modal-bottom-actions mt-4">
                  <button type="button" className="btn-cancel" onClick={() => setShowAdjustModal(false)}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={adjusting || !adjustForm.amount || Number(adjustForm.amount) <= 0}
                    style={{
                      background: isDebit ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' : 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                      borderColor: isDebit ? '#b91c1c' : '#15803d',
                      boxShadow: isDebit ? '0 2px 8px rgba(220, 38, 38, 0.3)' : '0 2px 8px rgba(22, 163, 74, 0.3)',
                    }}
                  >
                    {adjusting ? 'Processing Adjustment...' : isDebit ? `💸 Confirm Debit $${adjustForm.amount || 0} USD` : `💰 Confirm Credit +$${adjustForm.amount || 0} USD`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Split Deposit Helping Amount Modal */}
      <SplitDepositModal
        isOpen={!!splitModalDeposit}
        deposit={splitModalDeposit}
        onClose={() => setSplitModalDeposit(null)}
        onSuccess={handleSplitSuccess}
      />
    </div>
  );
}
