import { useEffect, useState, useMemo, useRef } from 'react';
import { api, fmtDay, fmtDate, money } from '../api.js';
import Ic from '../components/Icons.jsx';
import CurrencyConverterWidget from '../components/CurrencyConverterWidget.jsx';
import { getSocket } from '../socket.js';
import SplitDepositModal from './SplitDepositModal.jsx';
import AddFundsModal from './AddFundsModal.jsx';
import PayoutsAnalytics from './PayoutsAnalytics.jsx';
import StoreLink from './hub/StoreLink.jsx';

// The upgrade fee exactly as the server charges it (offeredFee is null until an offer is sent; $0 is a real fee)
const limitFeeOf = (l) => {
  const f = l?.pendingRequest?.offeredFee;
  return Number(f !== null && f !== undefined ? f : (l?.upgradeFee ?? 50)) || 0;
};

// "3h", "2d" — how long a request has been waiting
function timeAgo(d) {
  const m = Math.max(0, (Date.now() - new Date(d).getTime()) / 60000);
  if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

export default function AdminWithdrawals() {
  const [activeTab, setActiveTab] = useState('requests'); // 'requests' | 'analytics' | 'limits' | 'ledger'
  // ?q=<UTR / store> (from Ctrl + K) fills the search boxes
  const urlQ = (() => {
    try {
      return new URLSearchParams(window.location.search).get('q') || '';
    } catch {
      return '';
    }
  })();
  const [queueSearch, setQueueSearch] = useState(urlQ);
  const [copiedKey, setCopiedKey] = useState('');
  const [analyticsKey, setAnalyticsKey] = useState(0);
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
  const [ledgerSearch, setLedgerSearch] = useState(urlQ);
  const [splitModalDeposit, setSplitModalDeposit] = useState(null);

  const filteredLedger = useMemo(() => {
    // Exclude deleted sellers (orphan records) and test/demo accounts from the deposits ledger
    let list = depositsLedger.filter((d) => {
      // Discard if seller was deleted or missing
      if (!d.seller) return false;
      // Discard if marked as test account
      if (d.seller.isTestAccount || d.seller.accountType === 'test') return false;
      if (d.seller.isPreviousStoreSeller) return false;
      // Discard test or demo stores, owners, or emails
      const sName = (d.storeName || '').toLowerCase().trim();
      const oName = (d.seller.ownerName || '').toLowerCase().trim();
      const email = (d.seller.email || '').toLowerCase().trim();
      if (sName.includes('test') || sName.includes('demo')) return false;
      if (oName.includes('test') || oName.includes('demo')) return false;
      if (email.includes('test') || email.includes('demo')) return false;
      return true;
    });

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
  // Real USDT typed by the admin (what Binance actually shows). Wins over INR ÷ rate.
  const [usdtMap, setUsdtMap] = useState({});
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
    binanceRate: '',
    inrAmount: '',
    reason: '',
    reference: '',
  });
  const [adjusting, setAdjusting] = useState(false);
  const [adjustMsg, setAdjustMsg] = useState('');
  const [adjustErr, setAdjustErr] = useState('');
  // One id per entry, sent with it: submitting the SAME entry again (after a timeout) never adds the
  // money twice. A changed seller / type / amount is a new entry with a new id.
  const adjustReqId = useRef('');
  const [adjustAllowDup, setAdjustAllowDup] = useState(false);
  useEffect(() => {
    adjustReqId.current = '';
    setAdjustAllowDup(false);
  }, [adjustForm.sellerId, adjustForm.type, adjustForm.amount]);

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

  // Only the newest response of each list is used (filters clicked quickly, live updates)
  const loadSeq = useRef(0);
  const ledgerSeq = useRef(0);

  const load = () => {
    setLoading(true);
    const seq = ++loadSeq.current;
    api(`/sellers/withdrawals/all?status=${statusFilter}&type=${typeFilter}`)
      .then((res) => {
        if (seq !== loadSeq.current) return;
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
      .finally(() => {
        if (seq === loadSeq.current) setLoading(false);
      });

    // Also load limit requests
    api('/sellers/limit-requests/all')
      .then((res) => {
        setLimitRequests(res.requests || []);
      })
      .catch(() => {});
  };

  const loadDepositsLedger = () => {
    setLedgerLoading(true);
    const seq = ++ledgerSeq.current;
    api(`/sellers/withdrawals/all?type=deposit&status=${ledgerStatus}&excludeTest=true`)
      .then((res) => {
        if (seq === ledgerSeq.current) setDepositsLedger(res.requests || []);
      })
      .catch(() => {})
      .finally(() => {
        if (seq === ledgerSeq.current) setLedgerLoading(false);
      });
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
      // fresh read: the admin may have logged out since this screen opened
      const t = localStorage.getItem('ng_admin_token');
      if (t && t === adminToken) socket.emit('admin:join', { token: t });
    };
    if (socket.connected) rejoin();
    socket.on('connect', rejoin);

    const handleSync = () => {
      load();
      loadDepositsLedger();
      setAnalyticsKey((k) => k + 1);
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
  }, [statusFilter, typeFilter, ledgerStatus]);

  // Handler: Open Offer Modal (Step 1)
  const handleOpenOffer = (item) => {
    setOfferItem(item);
    const suggestedLimit = item.pendingRequest?.offeredLimit || item.pendingRequest?.requestedLimit || (item.currentMaxAmount * 2);
    setOfferLimit(suggestedLimit);
    setOfferFee(String(limitFeeOf(item)));
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
    const typed = approvedAmountMap[id];
    // a cleared field is NOT $0: it is simply not a valid amount
    const appAmt = typed !== undefined ? (String(typed).trim() === '' ? NaN : Number(typed)) : (req ? req.amount : 0);

    // a deposit approved for MORE than the seller asked (e.g. $5000 typed for a $500 request) is
    // asked once more: it is credited at once (there was no check at all)
    let confirmAboveRequested = false;
    if (status === 'approved') {
      if (!Number.isFinite(appAmt) || appAmt <= 0) {
        alert('Approved amount must be a number greater than $0. To pay nothing, reject the request instead.');
        return;
      }
      const isDepositApproval = (req?.type || reqType) === 'deposit';
      if (req && isDepositApproval && appAmt > Number(req.amount)) {
        const ok = window.confirm(
          `${req.storeName || 'This seller'} asked to deposit $${Number(req.amount).toLocaleString('en-US')}, but you are about to credit $${appAmt.toLocaleString('en-US')} ($${(appAmt - Number(req.amount)).toLocaleString('en-US')} MORE).\n\nIs this amount correct?`
        );
        if (!ok) return;
        confirmAboveRequested = true;
      }
      const isWithdrawal = (req?.type || reqType) === 'withdrawal';
      if (req && isWithdrawal) {
        const sellerLimit = req.seller?.withdrawalLimit?.maxAmount ?? 500;
        if (appAmt > req.amount) {
          alert(`Cannot approve $${appAmt}: Exceeds requested amount ($${req.amount}).`);
          return;
        }
        if (appAmt > sellerLimit) {
          alert(`Cannot approve $${appAmt}: Exceeds seller withdrawal limit of $${sellerLimit}. Upgrade seller limit first.`);
          return;
        }
      }
    }

    // a rejected deposit counts against the store's account health, unless it was an honest mistake
    let healthPenalty;
    if (status === 'rejected' && (req?.type || reqType) === 'deposit') {
      healthPenalty = window.confirm(
        `Reject this deposit of ${req?.storeName || 'this store'}.\n\nOK — also count it against the store’s account health (wrong / fake payment proof).\nCancel — reject only (an honest mistake, no health penalty).`
      );
    }

    setProcessing((p) => ({ ...p, [id]: true }));
    try {
      const isDepositReq = req?.type === 'deposit' || reqType === 'deposit';
      const isWithdrawReq = req?.type === 'withdrawal' || req?.type === 'withdraw' || reqType === 'withdrawal' || reqType === 'withdraw';

      const helpingAmt = (status === 'approved' && isDepositReq)
        ? (helpingAmountMap[id] !== undefined && helpingAmountMap[id] !== '' ? Number(helpingAmountMap[id]) : 0)
        : undefined;

      // Binance numbers are saved ONLY when the admin really typed them. No silent defaults:
      // a made-up rate would put a wrong USDT amount into the finance ledger.
      const typedUsdt = (status === 'approved' && usdtMap[id] !== undefined && usdtMap[id] !== '' && Number(usdtMap[id]) > 0)
        ? Number(usdtMap[id])
        : undefined;

      const currentInrVal = (status === 'approved' && inrAmountMap[id] !== undefined && inrAmountMap[id] !== '' && Number(inrAmountMap[id]) > 0)
        ? Number(inrAmountMap[id])
        : undefined;

      let bRate = (status === 'approved' && bRateMap[id] !== undefined && bRateMap[id] !== '' && Number(bRateMap[id]) > 0)
        ? Number(bRateMap[id])
        : undefined;

      // Real USDT typed -> use it as is (and work the rate out from it). Otherwise INR ÷ rate.
      let usdtAmt = typedUsdt;
      if (usdtAmt !== undefined && currentInrVal > 0) {
        bRate = Number((currentInrVal / usdtAmt).toFixed(2));
      } else if (usdtAmt === undefined && bRate > 0 && currentInrVal > 0) {
        usdtAmt = Number((currentInrVal / bRate).toFixed(2));
      }

      await api(`/sellers/withdrawals/${id}`, {
        method: 'PUT',
        body: {
          status,
          adminNote: noteMap[id] || '',
          transactionRef: refMap[id] || '',
          approvedAmount: status === 'approved' ? appAmt : undefined,
          confirmAboveRequested,
          helpingAmount: helpingAmt,
          binanceRate: bRate,
          inrAmount: currentInrVal,
          usdtAmount: usdtAmt,
          ...(healthPenalty !== undefined ? { healthPenalty } : {}),
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

    if (!adjustReqId.current) {
      adjustReqId.current = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    }
    setAdjusting(true);
    try {
      const isCredit = adjustForm.type === 'credit';
      const helpingAmt = (isCredit && adjustForm.helpingAmount) ? Number(adjustForm.helpingAmount) : 0;
      const bRate = (isCredit && adjustForm.binanceRate) ? Number(adjustForm.binanceRate) : undefined;
      const inrVal = (isCredit && adjustForm.inrAmount !== '' && adjustForm.inrAmount !== undefined)
        ? Number(adjustForm.inrAmount)
        : undefined;
      const usdtVal = (isCredit && bRate > 0 && inrVal > 0)
        ? Number((inrVal / bRate).toFixed(2))
        : undefined;

      const res = await api(`/sellers/${adjustForm.sellerId}/wallet/adjust`, {
        method: 'POST',
        body: {
          type: adjustForm.type,
          amount: amt,
          helpingAmount: helpingAmt,
          binanceRate: bRate,
          inrAmount: inrVal,
          usdtAmount: usdtVal,
          reason: adjustForm.reason,
          reference: adjustForm.reference,
          requestId: adjustReqId.current,
          allowDuplicate: adjustAllowDup,
        },
        timeout: 90000,
      });
      adjustReqId.current = '';
      setAdjustAllowDup(false);
      setAdjustMsg(`✅ ${res.message || 'Wallet adjusted successfully!'}`);
      setAdjustForm((f) => ({ ...f, amount: '', helpingAmount: '', binanceRate: '', inrAmount: '', reason: '', reference: '' }));
      load();
      setTimeout(() => {
        setShowAdjustModal(false);
        setAdjustMsg('');
      }, 1800);
    } catch (err) {
      if (err.timedOut) {
        setAdjustErr('The server did not answer in time. The amount may already be saved — submit again to check: it will NOT be added twice.');
      } else if (err.status === 409 && err.data?.duplicate) {
        setAdjustAllowDup(true);
        setAdjustErr(`⚠️ ${err.message}`);
      } else {
        setAdjustErr(err.message);
      }
    } finally {
      setAdjusting(false);
    }
  };

  const pendingLimitCount = limitRequests.filter((l) => l.pendingRequest?.status === 'pending').length;

  const visibleRequests = useMemo(() => {
    const q = queueSearch.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) =>
      [r.storeName, r.seller?.ownerName, r.seller?.email, r.depositRef, r.transactionRef, r.upiId, r.accountNumber, r.accountTitle, r.walletAddress]
        .some((v) => v && String(v).toLowerCase().includes(q))
    );
  }, [requests, queueSearch]);

  const limitStages = useMemo(() => {
    const c = { pending: 0, offered: 0, accepted_by_seller: 0, approved: 0, closed: 0 };
    limitRequests.forEach((l) => {
      const s = l.pendingRequest?.status;
      if (s === 'rejected' || s === 'declined_by_seller') c.closed += 1;
      else if (c[s] !== undefined) c[s] += 1;
    });
    return c;
  }, [limitRequests]);

  const copyText = (key, value) => {
    if (!value) return;
    try {
      navigator.clipboard?.writeText(String(value));
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? '' : k)), 1400);
    } catch {}
  };

  // One label/value cell of a request's details. `copy` adds a copy-to-clipboard button.
  const Field = ({ label, value, tone, mono, copy, id, internal }) => (
    <div className={`pd-field ${internal ? 'pd-field-internal' : ''}`}>
      <span className="pd-field-label">{label}</span>
      <span className={`pd-field-value ${mono ? 'mono' : ''}`} style={tone ? { color: tone } : undefined}>
        {value}
        {copy && (
          <button type="button" className="pd-copy" onClick={() => copyText(id, copy)} title="Copy">
            <Ic name={copiedKey === id ? 'check' : 'paperclip'} size={12} />
            <span>{copiedKey === id ? 'Copied' : 'Copy'}</span>
          </button>
        )}
      </span>
    </div>
  );

  const METHOD_TEXT = { bank: '🏦 Bank Transfer', upi: '⚡ UPI', paytm: '📱 Paytm', gpay: '🔵 Google Pay', phonepe: '🟣 PhonePe', usdt: '💎 USDT Crypto' };

  return (
    <div className="admin-page pd-root">
      {/* ─── HERO HEADER ─── */}
      <section className="pd-hero">
        <div className="pd-hero-main">
          <span className="pd-hero-eyebrow">
            <span className="pd-live"><span /></span> Finance • Live queue
          </span>
          <h2>Wallet &amp; Payout Control Desk</h2>
          <p>Sellers ki deposit / withdrawal requests process karein, helping split manage karein aur limit upgrades approve karein.</p>
        </div>
        <div className="pd-hero-actions">
          <button
            type="button"
            className="pd-btn-glass"
            onClick={() => { load(); if (activeTab === 'ledger') loadDepositsLedger(); setAnalyticsKey((k) => k + 1); }}
            disabled={loading}
          >
            <Ic name="refresh" size={15} /> Refresh
          </button>
          <button type="button" className="pd-btn-light" onClick={() => setShowAdjustModal(true)}>
            <Ic name="plus" size={15} /> Add / Adjust Funds
          </button>
        </div>
      </section>

      {/* ─── KPI CARDS ─── */}
      <div className="pd-kpis">
        <div className="pd-kpi">
          <span className="pd-kpi-icon tone-slate"><Ic name="clock" size={18} /></span>
          <div>
            <small>Pending Payouts</small>
            <b>{summary.pending || 0}</b>
            <em>{summary.pendingDepositCount ?? 0} deposits • {summary.pendingWithdrawalCount ?? 0} withdrawals</em>
          </div>
        </div>
        <div className="pd-kpi">
          <span className="pd-kpi-icon tone-blue"><Ic name="wallet" size={18} /></span>
          <div>
            <small>Pending Deposits</small>
            <b>{money(summary.pendingDeposits || 0)}</b>
            <em>To be credited on approval</em>
          </div>
        </div>
        <div className="pd-kpi">
          <span className="pd-kpi-icon tone-orange"><Ic name="banknote" size={18} /></span>
          <div>
            <small>Pending Withdrawals</small>
            <b>{money(summary.pendingWithdrawals || 0)}</b>
            <em>Locked from seller balances</em>
          </div>
        </div>
        <div className="pd-kpi">
          <span className="pd-kpi-icon tone-violet"><Ic name="shield" size={18} /></span>
          <div>
            <small>Pending Limit Upgrades</small>
            <b>{pendingLimitCount}</b>
            <em>{limitStages.accepted_by_seller} accepted • ready to activate</em>
          </div>
        </div>
      </div>

      {/* ─── TABS ─── */}
      <nav className="pd-tabs" role="tablist">
        {[
          { key: 'requests', icon: 'banknote', label: 'Payouts & Deposits Queue', badge: summary.pending || 0, tone: 'red' },
          { key: 'analytics', icon: 'grid', label: 'Analytics', badge: null },
          { key: 'ledger', icon: 'fileText', label: 'Deposits Ledger & Helping Split', badge: depositsLedger.length || null, tone: 'violet' },
          { key: 'limits', icon: 'shield', label: 'Limit Upgrade Requests', badge: pendingLimitCount, tone: 'amber' },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={activeTab === t.key}
            className={`pd-tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            <Ic name={t.icon} size={15} />
            <span>{t.label}</span>
            {t.badge > 0 && <span className={`pd-badge pd-badge-${t.tone}`}>{t.badge}</span>}
          </button>
        ))}
      </nav>

      {/* ─────────────────────────────────────────────────────────────
          VIEW 1: DEPOSIT & WITHDRAWAL PAYOUTS QUEUE
          ───────────────────────────────────────────────────────────── */}
      {activeTab === 'requests' && (
        <>
          <div className="pd-toolbar">
            <div className="pd-toolbar-group">
              <span className="pd-toolbar-label">Type</span>
              <div className="pd-seg">
                {[
                  { val: 'all', label: 'All' },
                  { val: 'deposit', label: 'Deposits' },
                  { val: 'withdrawal', label: 'Withdrawals' },
                ].map((t) => (
                  <button key={t.val} type="button" className={typeFilter === t.val ? 'active' : ''} onClick={() => setTypeFilter(t.val)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="pd-toolbar-group">
              <span className="pd-toolbar-label">Status</span>
              <div className="pd-seg">
                {['pending', 'approved', 'rejected', 'all'].map((s) => (
                  <button key={s} type="button" className={statusFilter === s ? 'active' : ''} onClick={() => setStatusFilter(s)}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="pd-search">
              <Ic name="search" size={14} />
              <input
                type="text"
                placeholder="Search store, seller, UTR, UPI, account…"
                value={queueSearch}
                onChange={(e) => setQueueSearch(e.target.value)}
              />
              {queueSearch && (
                <button type="button" onClick={() => setQueueSearch('')} aria-label="Clear search"><Ic name="x" size={13} /></button>
              )}
            </div>
          </div>

          {!loading && requests.length > 0 && (
            <div className="pd-result-count">
              Showing <b>{visibleRequests.length}</b> of {requests.length} requests
            </div>
          )}

          {loading && (
            <div className="pd-skeleton-list">
              {[0, 1, 2].map((i) => <div key={i} className="pd-skeleton pd-skeleton-tall" />)}
            </div>
          )}

          {!loading && visibleRequests.length === 0 && (
            <div className="pd-empty">
              <Ic name="banknote" size={40} stroke={1.2} />
              <p>{queueSearch ? 'Is search se koi request match nahi hui.' : 'Koi wallet request nahi mili.'}</p>
              {queueSearch && <button type="button" className="pd-btn-ghost" onClick={() => setQueueSearch('')}>Clear search</button>}
            </div>
          )}

          <div className="pd-req-list">
            {!loading && visibleRequests.map((r) => {
              const isDeposit = r.type === 'deposit';
              const isPending = r.status === 'pending';
              const currentApprovedAmt = approvedAmountMap[r._id] !== undefined ? approvedAmountMap[r._id] : r.amount;
              const approveNum = String(currentApprovedAmt).trim() === '' ? NaN : Number(currentApprovedAmt);
              const approveValid = Number.isFinite(approveNum) && approveNum > 0;
              const isTest = r.seller?.isTestAccount || r.seller?.accountType === 'test' || r.storeName?.toLowerCase().includes('test');
              const waitMs = Date.now() - new Date(r.createdAt).getTime();
              const hasInternal = Number(r.helpingAmount) > 0 || Number(r.binanceRate) > 0 || Number(r.inrAmount) > 0 || Number(r.usdtAmount) > 0;

              return (
                <article key={r._id} className={`pd-req ${isDeposit ? 'is-deposit' : 'is-withdraw'} ${isPending ? 'is-pending' : ''}`}>
                  {/* Header */}
                  <header className="pd-req-head">
                    <div className="pd-req-who">
                      <div className="pd-avatar">{r.storeName?.[0] || 'S'}</div>
                      <div className="pd-req-who-text">
                        <div className="pd-req-tags">
                          <span className={`pd-type ${isDeposit ? 'pd-type-deposit' : 'pd-type-withdraw'}`}>
                            {r.isManualAdjustment ? '⚡ Direct Admin Adjustment' : (isDeposit ? '↓ Deposit Request' : '↑ Withdrawal Request')}
                          </span>
                          {isTest && <span className="pd-pill pd-pill-violet">🧪 Test Account</span>}
                          {Number.isFinite(r.seller?.accountHealth?.score) && r.seller.accountHealth.score < 60 && (
                            <span className="pd-pill pd-pill-amber" title="Account health below 60 (At risk / Critical): review this request carefully">
                              🛡️ Health {r.seller.accountHealth.score}
                            </span>
                          )}
                        </div>
                        <b className="pd-req-store">
                          <StoreLink id={r.seller} name={r.storeName} />
                        </b>
                        <small className="pd-req-sub">{r.seller?.ownerName} • {r.seller?.email}</small>
                      </div>
                    </div>
                    <div className="pd-req-amount">
                      <span className={`pd-status pd-status-${r.status}`}>{r.status?.toUpperCase()}</span>
                      <b className={isDeposit ? 'tone-dep' : 'tone-wd'}>{money(r.amount)}</b>
                      <small>
                        Requested {fmtDay(r.createdAt)}
                        {isPending && (
                          <span className={`pd-age ${waitMs > 24 * 3600000 ? 'pd-age-late' : ''}`}> • waiting {timeAgo(r.createdAt)}</span>
                        )}
                      </small>
                    </div>
                  </header>

                  {/* Details */}
                  <div className="pd-fields">
                    {isDeposit ? (
                      <>
                        <Field label="Payment Ref / UTR" value={r.depositRef || r.transactionRef || 'N/A'} mono copy={r.depositRef || r.transactionRef} id={`${r._id}-ref`} />
                        <Field label={r.isManualAdjustment ? 'Reason / Note' : 'Seller Note'} value={r.depositNote || r.adminNote || 'None'} />
                      </>
                    ) : (
                      <>
                        <Field
                          label="Method"
                          tone="#1d4ed8"
                          value={METHOD_TEXT[r.method] || (r.method?.toUpperCase() || 'BANK')}
                        />
                        {r.accountTitle && <Field label="Account Title" value={r.accountTitle} copy={r.accountTitle} id={`${r._id}-title`} />}
                        {r.upiId && <Field label="UPI ID / VPA" value={r.upiId} tone="#047857" mono copy={r.upiId} id={`${r._id}-upi`} />}
                        {r.phone && <Field label="Phone / Mobile" value={r.phone} mono copy={r.phone} id={`${r._id}-phone`} />}
                        {r.accountNumber && <Field label="Account No" value={r.accountNumber} mono copy={r.accountNumber} id={`${r._id}-acc`} />}
                        {r.bankName && <Field label="Bank Name" value={r.bankName} />}
                        {r.ifscCode && <Field label="IFSC Code" value={r.ifscCode} tone="#b45309" mono copy={r.ifscCode} id={`${r._id}-ifsc`} />}
                        {r.walletAddress && (
                          <Field label={`USDT Wallet (${r.network || 'TRC-20'})`} value={r.walletAddress} tone="#15803d" mono copy={r.walletAddress} id={`${r._id}-wallet`} />
                        )}
                      </>
                    )}
                  </div>

                  {/* Admin-internal numbers (hidden from seller) */}
                  {(hasInternal || isDeposit) && (
                    <div className="pd-internal">
                      <span className="pd-internal-tag"><Ic name="lock" size={12} /> Admin internal</span>
                      {isDeposit && Number(r.helpingAmount) > 0 && (
                        <span className="pd-internal-item">🤝 Helping <b className="tone-violet">${Number(r.helpingAmount).toLocaleString('en-US')}</b></span>
                      )}
                      {Number(r.binanceRate) > 0 && (
                        <span className="pd-internal-item">🟡 B.Rate <b>₹{r.binanceRate} / USDT</b></span>
                      )}
                      {Number(r.inrAmount) > 0 && (
                        <span className="pd-internal-item">🇮🇳 {isDeposit ? 'INR Deposit' : 'INR Payout'} <b>₹{Number(r.inrAmount).toLocaleString('en-IN')}</b></span>
                      )}
                      {Number(r.usdtAmount) > 0 && (
                        <span className="pd-internal-item">💎 USDT <b className="tone-green">{r.usdtAmount}</b></span>
                      )}
                      {isDeposit && (
                        <button type="button" className="pd-chip-btn" onClick={() => setSplitModalDeposit(r)} title="Split or edit Helping Amount for this deposit">
                          ✏️ Split Helping
                          {Number(r.helpingAmount) > 0 && <span>${Number(r.helpingAmount).toLocaleString('en-US')}</span>}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Approval Action Form */}
                  {isPending && (
                    <div className="pd-action">
                      <div className="pd-action-grid">
                        <label className="pd-input">
                          <span>Approved Amount ($)</span>
                          <input
                            type="number"
                            className={`strong ${approveValid ? '' : 'invalid'}`}
                            min="0.01"
                            step="any"
                            value={currentApprovedAmt}
                            onChange={(e) => setApprovedAmountMap((prev) => ({ ...prev, [r._id]: e.target.value }))}
                          />
                        </label>
                        {isDeposit && (
                          <label className="pd-input pd-input-violet">
                            <span>🤝 Helping Amount ($) <em>hidden from seller</em></span>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="0"
                              value={helpingAmountMap[r._id] !== undefined ? helpingAmountMap[r._id] : (r.helpingAmount || '')}
                              onChange={(e) => setHelpingAmountMap((prev) => ({ ...prev, [r._id]: e.target.value }))}
                            />
                          </label>
                        )}
                        <label className="pd-input">
                          <span>Bank Ref / UTR Number</span>
                          <input
                            type="text"
                            placeholder="UTR / transaction reference"
                            value={refMap[r._id] || ''}
                            onChange={(e) => setRefMap((prev) => ({ ...prev, [r._id]: e.target.value }))}
                          />
                        </label>
                        <label className="pd-input">
                          <span>Admin Note <em>sent to seller chat</em></span>
                          <input
                            type="text"
                            placeholder="e.g. Payout processed via NEFT / IMPS"
                            value={noteMap[r._id] || ''}
                            onChange={(e) => setNoteMap((prev) => ({ ...prev, [r._id]: e.target.value }))}
                          />
                        </label>
                      </div>

                      {/* Binance B.Rate & USDT Calculator (Admin Internal for both Deposits & Withdrawals) */}
                      {(() => {
                        const currentInr = inrAmountMap[r._id] !== undefined
                          ? inrAmountMap[r._id]
                          : (r.inrAmount ? String(r.inrAmount) : '');
                        const currentBRate = bRateMap[r._id] !== undefined
                          ? bRateMap[r._id]
                          : (r.binanceRate ? String(r.binanceRate) : '');
                        const typedUsdtVal = usdtMap[r._id] !== undefined ? usdtMap[r._id] : '';
                        const shownRate = (Number(currentInr) > 0 && Number(typedUsdtVal) > 0)
                          ? (Number(currentInr) / Number(typedUsdtVal)).toFixed(2)
                          : null;
                        const calcUsdt = Number(typedUsdtVal) > 0
                          ? Number(typedUsdtVal).toFixed(2)
                          : (Number(currentInr) > 0 && Number(currentBRate) > 0)
                            ? (Number(currentInr) / Number(currentBRate)).toFixed(2)
                            : null;

                        return (
                          <div className="pd-binance">
                            <div className="pd-binance-head">
                              <b>🟡 {isDeposit ? 'Binance USDT Received' : 'Binance USDT Sent'}</b>
                              <span className="pd-pill pd-pill-amber">Admin internal • hidden from seller</span>
                              {calcUsdt && <span className="pd-binance-result">💎 {calcUsdt} USDT</span>}
                            </div>
                            <div className="pd-action-grid">
                              <label className="pd-input pd-input-amber">
                                <span>{isDeposit ? '🇮🇳 INR Received / Value (₹)' : '🇮🇳 INR Payout (₹)'}</span>
                                <input
                                  type="number"
                                  step="any"
                                  placeholder="e.g. 8350"
                                  value={currentInr}
                                  onChange={(e) => setInrAmountMap((prev) => ({ ...prev, [r._id]: e.target.value }))}
                                />
                                <small>Asli INR likhein jo is transaction me aaye / gaye</small>
                              </label>
                              <label className="pd-input pd-input-green">
                                <span>{isDeposit ? '💎 USDT Received (Binance me aaye)' : '💎 USDT Sent (Binance se gaye)'}</span>
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  placeholder="e.g. 46.45"
                                  value={typedUsdtVal}
                                  onChange={(e) => setUsdtMap((prev) => ({ ...prev, [r._id]: e.target.value }))}
                                />
                                <small>Binance me dekh kar asli amount likhein (Admin Only)</small>
                              </label>
                              <div className="pd-input">
                                <span>🟡 Rate (khud nikalta hai)</span>
                                <div className={`pd-rate ${shownRate ? 'on' : ''}`}>
                                  {shownRate ? `₹${shownRate} / USDT` : 'INR aur USDT likhein'}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="pd-action-btns">
                        <button
                          className="btn-primary"
                          disabled={processing[r._id] || !approveValid}
                          title={approveValid ? undefined : 'Enter an approved amount greater than $0'}
                          onClick={() => handleAction(r._id, 'approved', r.type)}
                        >
                          <Ic name="check" size={15} />
                          {!approveValid
                            ? ' Enter a valid amount to approve'
                            : isDeposit
                              ? ` Approve & Credit $${approveNum} to Wallet`
                              : approveNum < r.amount
                                ? ` Approve Partial $${approveNum} (Refund $${Number((r.amount - approveNum).toFixed(2))})`
                                : ` Approve Payout of $${approveNum}`}
                        </button>
                        <button
                          className="btn-danger"
                          disabled={processing[r._id]}
                          onClick={() => handleAction(r._id, 'rejected', r.type)}
                        >
                          <Ic name="x" size={15} /> Reject (Full Refund)
                        </button>
                        <small className="pd-action-hint">
                          <Ic name="bell" size={12} /> Seller ko chat mein auto-receipt aur sound alert jayegi.
                        </small>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}

      {/* ─────────────────────────────────────────────────────────────
          VIEW 2: ANALYTICS
          ───────────────────────────────────────────────────────────── */}
      {activeTab === 'analytics' && <PayoutsAnalytics refreshKey={analyticsKey} />}

      {/* ─────────────────────────────────────────────────────────────
          VIEW 3: DEPOSITS LEDGER & HELPING AMOUNT SPLIT
          ───────────────────────────────────────────────────────────── */}
      {activeTab === 'ledger' && (
        <div className="admin-deposits-ledger-section pd-section">
          <div className="pd-section-head">
            <div>
              <h3>🤝 Sellers Deposits Ledger &amp; Helping Split</h3>
              <p>
                Sellers ke tamam deposits ka record. Kisi bhi deposit par Admin Helping Amount split karein jo Admin USDT Wallet se minus ho jayegi.
              </p>
            </div>
            <div className="pd-section-actions">
              <button type="button" className="pd-btn-ghost" onClick={loadDepositsLedger} disabled={ledgerLoading}>
                <Ic name="refresh" size={13} /> Refresh
              </button>
              <button type="button" className="pd-btn-green" onClick={() => setShowAdjustModal(true)}>
                <Ic name="plus" size={14} /> Direct Deposit Adjustment
              </button>
            </div>
          </div>

          <div className="pd-ledger-kpis">
            <div className="pd-mini-kpi">
              <small>Total Gross Deposited</small>
              <b>{money(ledgerGrossTotal)}</b>
              <em>Full seller credited funds</em>
            </div>
            <div className="pd-mini-kpi tone-violet">
              <small>🤝 Total Helping Split</small>
              <b>-{money(ledgerHelpingTotal)}</b>
              <em>Excluded from Admin USDT Wallet</em>
            </div>
            <div className="pd-mini-kpi tone-green">
              <small>👤 Real Seller Inflow</small>
              <b>+{money(ledgerRealTotal)}</b>
              <em>Counted in Admin USDT Wallet</em>
            </div>
            <div className="pd-mini-kpi">
              <small>Deposits Count</small>
              <b>{filteredLedger.length}</b>
              <em>Recorded deposits</em>
            </div>
          </div>

          {/* Real vs helping split bar */}
          {ledgerGrossTotal > 0 && (
            <div className="pd-splitbar" title="Real inflow vs helping split">
              <span className="real" style={{ width: `${(ledgerRealTotal / ledgerGrossTotal) * 100}%` }} />
              <span className="help" style={{ width: `${(ledgerHelpingTotal / ledgerGrossTotal) * 100}%` }} />
              <div className="pd-splitbar-legend">
                <span><i className="real" /> Real {((ledgerRealTotal / ledgerGrossTotal) * 100).toFixed(1)}%</span>
                <span><i className="help" /> Helping {((ledgerHelpingTotal / ledgerGrossTotal) * 100).toFixed(1)}%</span>
              </div>
            </div>
          )}

          <div className="pd-toolbar">
            <div className="pd-seg">
              {[
                { val: 'all', label: 'All Deposits' },
                { val: 'approved', label: 'Approved' },
                { val: 'pending', label: 'Pending' },
                { val: 'rejected', label: 'Rejected' },
              ].map((s) => (
                <button key={s.val} type="button" className={ledgerStatus === s.val ? 'active' : ''} onClick={() => setLedgerStatus(s.val)}>
                  {s.label}
                </button>
              ))}
            </div>
            <span className="pd-pill pd-pill-green" title="Testing accounts aur demo sellers ke deposits is ledger mein shamil nahi hain">
              <span className="pd-dot" /> Real Clients Only (Testing Excluded)
            </span>
            <div className="pd-search">
              <Ic name="search" size={14} />
              <input
                type="text"
                placeholder="Search store, seller, UTR reference, note…"
                value={ledgerSearch}
                onChange={(e) => setLedgerSearch(e.target.value)}
              />
              {ledgerSearch && (
                <button type="button" onClick={() => setLedgerSearch('')} aria-label="Clear search"><Ic name="x" size={13} /></button>
              )}
            </div>
          </div>

          {ledgerLoading ? (
            <div className="pd-skeleton pd-skeleton-tall" />
          ) : filteredLedger.length === 0 ? (
            <div className="pd-empty">
              <Ic name="wallet" size={40} stroke={1.2} />
              <p>Koi deposit transaction nahi mili.</p>
              {ledgerSearch && (
                <button type="button" onClick={() => setLedgerSearch('')} className="pd-btn-ghost">Clear Search</button>
              )}
            </div>
          ) : (
            <div className="pd-card pd-card-flush">
              <div className="admin-table-wrap">
                <table className="pd-table">
                  <thead>
                    <tr>
                      <th>Date &amp; Time</th>
                      <th>Store &amp; Seller</th>
                      <th>Gross Deposit</th>
                      <th>Split (Real vs Helping)</th>
                      <th>Method &amp; Ref (UTR)</th>
                      <th>Status</th>
                      <th className="num">Admin Split Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLedger.map((d) => {
                      const gross = d.approvedAmount !== null && d.approvedAmount !== undefined ? d.approvedAmount : d.amount;
                      const helping = d.helpingAmount || 0;
                      const real = Math.max(0, gross - helping);
                      const realPct = gross > 0 ? (real / gross) * 100 : 100;

                      return (
                        <tr key={d._id}>
                          <td>
                            <div className="pd-strong">{fmtDate(d.processedAt || d.createdAt)}</div>
                            <small className="pd-muted mono">#{String(d._id).slice(-6)}</small>
                          </td>
                          <td>
                            <div className="pd-cell-who">
                              <span className="pd-avatar pd-avatar-sm">{(d.storeName || d.seller?.storeName || 'S')[0]}</span>
                              <div>
                                <div className="pd-strong">
                                  <StoreLink id={d.seller} name={d.storeName || d.seller?.storeName || 'Store'} />
                                </div>
                                <small className="pd-muted">{d.seller?.ownerName} {d.seller?.email && `• ${d.seller.email}`}</small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <b className="pd-amount">{money(gross)}</b>
                            {d.isManualAdjustment && <small className="pd-tag-green">Manual Adjustment</small>}
                            {Number(d.binanceRate) > 0 && (
                              <span className="pd-rate-chip">
                                🟡 ₹{d.binanceRate}/USDT{Number(d.usdtAmount) > 0 && ` • ₮${d.usdtAmount}`}
                              </span>
                            )}
                          </td>
                          <td>
                            <div className="pd-split-cell">
                              <div className="pd-split-mini">
                                <span className="real" style={{ width: `${realPct}%` }} />
                                <span className="help" style={{ width: `${100 - realPct}%` }} />
                              </div>
                              <small className="tone-green">👤 Real {money(real)}</small>
                              {helping > 0 ? (
                                <small className="tone-violet">🤝 Helping -{money(helping)}</small>
                              ) : (
                                <small className="pd-muted">No helping deduction</small>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="pd-cell-ref">
                              <span className="pd-method-chip">{(d.method || 'bank').toUpperCase()}</span>
                              <span className="mono">{d.depositRef || d.transactionRef || 'N/A'}</span>
                            </div>
                            {Number(d.inrAmount) > 0 && (
                              <small className="pd-strong pd-block">₹{Number(d.inrAmount).toLocaleString('en-IN')} INR</small>
                            )}
                            {(d.depositNote || d.adminNote) && (
                              <small className="pd-muted pd-ellipsis">{d.depositNote || d.adminNote}</small>
                            )}
                          </td>
                          <td>
                            <span className={`pd-status pd-status-${d.status}`}>{d.status?.toUpperCase()}</span>
                          </td>
                          <td className="num">
                            <button
                              type="button"
                              className="pd-chip-btn"
                              onClick={() => setSplitModalDeposit(d)}
                              title="Click to split or edit Helping Amount for this deposit"
                            >
                              ✏️ Split / Edit
                              {helping > 0 && <span>${helping}</span>}
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
          VIEW 4: WITHDRAWAL LIMIT UPGRADE APPLICATIONS (3-STEP PROTOCOL)
          ───────────────────────────────────────────────────────────── */}
      {activeTab === 'limits' && (
        <div className="admin-limit-requests-section pd-section">
          {/* Pipeline summary */}
          <div className="pd-pipeline">
            {[
              { key: 'pending', label: 'Quote needed', hint: 'Step 1 • send offer', tone: 'amber' },
              { key: 'offered', label: 'Waiting seller', hint: 'Step 2 • seller reviews', tone: 'blue' },
              { key: 'accepted_by_seller', label: 'Seller accepted', hint: 'Step 3 • activate', tone: 'green' },
              { key: 'approved', label: 'Activated', hint: 'Limit live', tone: 'slate' },
              { key: 'closed', label: 'Declined', hint: 'Rejected / seller declined', tone: 'red' },
            ].map((s, i) => (
              <div key={s.key} className={`pd-stage tone-${s.tone}`}>
                <span className="pd-stage-n">{i + 1}</span>
                <div>
                  <b>{limitStages[s.key]}</b>
                  <span>{s.label}</span>
                  <small>{s.hint}</small>
                </div>
              </div>
            ))}
          </div>

          {limitRequests.length === 0 ? (
            <div className="pd-empty">
              <Ic name="shield" size={40} stroke={1.2} />
              <p>Koi limit upgrade application nahi mili.</p>
            </div>
          ) : (
            <div className="pd-card pd-card-flush">
              <div className="admin-table-wrap">
                <table className="pd-table">
                  <thead>
                    <tr>
                      <th>Store &amp; Seller</th>
                      <th>Wallet Balance</th>
                      <th>Current Tier &amp; Limit</th>
                      <th>Withdrawal Milestones</th>
                      <th>Proposed / Requested</th>
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
                      const lowBalance = l.walletBalance < limitFeeOf(l);
                      const pct = Math.min(100, Math.round((l.successfulWithdrawalCount / (l.requiredWithdrawalsForIncrease || 1)) * 100));
                      const reached = l.successfulWithdrawalCount >= l.requiredWithdrawalsForIncrease;

                      return (
                        <tr key={l.sellerId} className={isAccepted ? 'pd-row-highlight' : ''}>
                          <td>
                            <div className="pd-cell-who">
                              <span className="pd-avatar pd-avatar-sm">{(l.storeName || 'S')[0]}</span>
                              <div>
                                <div className="pd-strong">{l.storeName}</div>
                                <small className="pd-muted">{l.ownerName} • {l.email}</small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <b className={lowBalance ? 'tone-red' : 'pd-strong'}>{money(l.walletBalance)}</b>
                            {lowBalance && <small className="tone-red pd-block">⚠️ Low balance for fee</small>}
                          </td>
                          <td>
                            <div className="pd-strong">{money(l.currentMaxAmount)}</div>
                            <small className="pd-muted">{l.currentTierName}</small>
                          </td>
                          <td>
                            <div className="pd-progress-cell">
                              <small className={reached ? 'tone-green' : 'tone-amber'}>
                                {l.successfulWithdrawalCount} / {l.requiredWithdrawalsForIncrease} payouts
                              </small>
                              <div className="pd-progress"><span className={reached ? 'done' : ''} style={{ width: `${pct}%` }} /></div>
                            </div>
                          </td>
                          <td>
                            <b className="tone-blue">{money(l.pendingRequest?.offeredLimit || l.pendingRequest?.requestedLimit || 0)}</b>
                            {l.pendingRequest?.reason && (
                              <small className="pd-muted pd-ellipsis">"{l.pendingRequest.reason}"</small>
                            )}
                          </td>
                          <td>
                            <b className="tone-amber">{money(limitFeeOf(l))}</b>
                          </td>
                          <td>
                            {isPending && <span className="pd-stage-chip tone-amber">● Quote needed</span>}
                            {isOffered && <span className="pd-stage-chip tone-blue">● Waiting seller</span>}
                            {isAccepted && <span className="pd-stage-chip tone-green">● Seller accepted</span>}
                            {isCompleted && <span className="pd-stage-chip tone-slate">✓ Activated</span>}
                            {(status === 'rejected' || status === 'declined_by_seller') && (
                              <span className="pd-stage-chip tone-red">✕ {status === 'declined_by_seller' ? 'Seller declined' : 'Rejected'}</span>
                            )}
                          </td>
                          <td>
                            <div className="pd-row-actions">
                              {(isPending || isOffered) && (
                                <button type="button" className="pd-act pd-act-blue" onClick={() => handleOpenOffer(l)}>
                                  {isOffered ? '✏️ Edit Offer' : '📝 Send Offer'}
                                </button>
                              )}
                              {isAccepted && (
                                <button type="button" className="pd-act pd-act-green" onClick={() => handleOpenFinalize(l)}>
                                  ⚡ Finalize &amp; Activate
                                </button>
                              )}
                              {isCompleted && (
                                <button type="button" className="pd-act pd-act-ghost" onClick={() => handleOpenOffer(l)}>
                                  ⚙️ Offer New Tier
                                </button>
                              )}
                              {(isPending || isOffered || isAccepted) && (
                                <button type="button" className="pd-act pd-act-red" onClick={() => handleOpenReject(l)}>
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
                    {money(limitFeeOf(finalizeItem))}
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
                    {money(finalizeItem.walletBalance - limitFeeOf(finalizeItem))}
                  </div>
                </div>
              </div>

              {finalizeItem.walletBalance < limitFeeOf(finalizeItem) && (
                <div className="pd-note" style={{ marginBottom: 14, background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' }}>
                  <Ic name="alert" size={15} />
                  <span>
                    Seller ka balance fee se kam hai. Activate nahi ho sakta — pehle seller balance add kare ya fee kam karke naya offer bhejein.
                  </span>
                </div>
              )}

              <div className="modal-bottom-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowFinalizeModal(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submittingFinalize || finalizeItem.walletBalance < limitFeeOf(finalizeItem)}
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
      <AddFundsModal
        isOpen={showAdjustModal}
        onClose={() => setShowAdjustModal(false)}
        sellers={sellersList}
        onSuccess={() => {
          load();
          loadDepositsLedger();
        }}
      />

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
