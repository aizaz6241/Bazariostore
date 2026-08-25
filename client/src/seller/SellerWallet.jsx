import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { sapi, fmtDay, fmtDate } from '../api.js';
import Ic from '../components/Icons.jsx';
import CurrencySelector from '../components/CurrencySelector.jsx';
import CurrencyConverterWidget from '../components/CurrencyConverterWidget.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';
import { getSocket } from '../socket.js';
import { playNotificationSound } from '../utils/audio.js';

const STATUS_COLOR = {
  pending: 'chip-orange',
  approved: 'chip-green',
  rejected: 'chip-red',
  completed: 'chip-green',
};

const TYPE_BADGE = {
  deposit: { label: 'Deposit', color: '#16a34a', bg: '#dcfce7', icon: '💰' },
  withdrawal: { label: 'Withdrawal', color: '#dc2626', bg: '#fee2e2', icon: '💸' },
  order_processing_lock: { label: 'Order Processing Lock', color: '#d97706', bg: '#fef3c7', icon: '🔒' },
  order_delivered_release: { label: 'Delivered Payout (+20% Profit)', color: '#2563eb', bg: '#dbeafe', icon: '🎉' },
  order_cancelled_release: { label: 'Cancelled Order Refund', color: '#64748b', bg: '#f1f5f9', icon: '↩️' },
  adjustment: { label: 'Admin Adjustment', color: '#7c3aed', bg: '#ede9fe', icon: '⚙️' },
};

const INDIAN_BANKS = [
  'State Bank of India (SBI)',
  'HDFC Bank',
  'ICICI Bank',
  'Axis Bank',
  'Punjab National Bank (PNB)',
  'Kotak Mahindra Bank',
  'Bank of Baroda',
  'Canara Bank',
  'Union Bank of India',
  'IndusInd Bank',
  'IDFC FIRST Bank',
  'Yes Bank',
  'Federal Bank',
  'Bank of India',
  'Central Bank of India',
  'Indian Bank',
  'UCO Bank',
  'Indian Overseas Bank',
  'Standard Chartered Bank',
  'Other / Custom Bank',
];

const UPI_APPS = [
  { id: 'gpay', name: 'Google Pay (GPay)', handle: '@okhdfcbank', icon: '🔵', color: '#1a73e8' },
  { id: 'phonepe', name: 'PhonePe', handle: '@ybl', icon: '🟣', color: '#5f259f' },
  { id: 'paytm', name: 'Paytm UPI', handle: '@paytm', icon: '🔷', color: '#00b9f5' },
  { id: 'bhim', name: 'BHIM UPI', handle: '@upi', icon: '🟠', color: '#f37021' },
  { id: 'amazonpay', name: 'Amazon Pay', handle: '@apl', icon: '🟡', color: '#ff9900' },
  { id: 'other', name: 'Custom UPI VPA', handle: '', icon: '⚡', color: '#2563eb' },
];

export default function SellerWallet() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { formatMoney, currentCurrency } = useCurrency();

  // Initialize wallet from localStorage seller data as immediate fallback
  // This prevents $0.00 flicker while API call is in progress
  // The API load() will overwrite with fresh data shortly after
  const [wallet, setWallet] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('ng_seller') || 'null');
      return cached?.wallet || null;
    } catch {
      return null;
    }
  });
  const [withdrawalLimit, setWithdrawalLimit] = useState(null);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(() => searchParams.get('tab') || 'ledger'); // 'ledger' | 'deposit' | 'withdraw'
  const [ledgerFilter, setLedgerFilter] = useState('all'); // 'all' | 'orders' | 'deposits' | 'withdrawals'
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Limit Increase Modal
  const [limitModalOpen, setLimitModalOpen] = useState(false);
  const [reqLimitAmount, setReqLimitAmount] = useState('');
  const [reqLimitReason, setReqLimitReason] = useState('');
  const [submittingLimitReq, setSubmittingLimitReq] = useState(false);

  // Request Success Confirmation Modal (for Deposit & Withdrawal)
  const [requestSuccessModal, setRequestSuccessModal] = useState(null);

  useEffect(() => {
    const urlTab = searchParams.get('tab');
    if (urlTab && ['ledger', 'deposit', 'withdraw'].includes(urlTab)) {
      setTab(urlTab);
    }
  }, [searchParams]);

  const handleTabChange = (newTab) => {
    setTab(newTab);
    setSearchParams({ tab: newTab });
    setMsg('');
    setErr('');
  };

  // Deposit form
  const [depForm, setDepForm] = useState({
    amount: '',
    method: 'upi',
    depositRef: '',
    depositNote: '',
    depositedFrom: '',
  });

  // Withdrawal form
  const [method, setMethod] = useState('bank'); // 'bank' | 'upi' | 'paytm' | 'gpay' | 'phonepe' | 'usdt'
  const [withdrawalMethods, setWithdrawalMethods] = useState({});
  const [activeSavedKey, setActiveSavedKey] = useState('');
  const [confirmAccountNumber, setConfirmAccountNumber] = useState('');
  const [accountType, setAccountType] = useState('Savings');
  const [selectedUpiApp, setSelectedUpiApp] = useState('gpay');
  const [upiPhone, setUpiPhone] = useState('');
  const [usdtNetwork, setUsdtNetwork] = useState('TRC-20');
  const [wdForm, setWdForm] = useState({
    amount: '',
    upiId: '',
    phone: '',
    walletAddress: '',
    network: 'TRC-20',
    accountTitle: '',
    accountNumber: '',
    bankName: 'State Bank of India (SBI)',
    ifscCode: '',
    bankBranch: '',
  });

  const applySavedMethod = (key, data) => {
    setActiveSavedKey(key);
    if (key === 'bankTransfer') {
      setMethod('bank');
      setWdForm((prev) => ({
        ...prev,
        accountTitle: data.accountTitle || '',
        bankName: data.bankName || 'State Bank of India (SBI)',
        accountNumber: data.accountNumber || '',
        ifscCode: data.ifscCode || '',
        bankBranch: data.branchName || '',
      }));
      setConfirmAccountNumber(data.accountNumber || '');
      setAccountType(data.accountType || 'Savings');
    } else if (key === 'upi') {
      setMethod('upi');
      setWdForm((prev) => ({
        ...prev,
        upiId: data.upiId || '',
        accountTitle: data.holderName || '',
      }));
      setSelectedUpiApp('other');
    } else if (key === 'paytm') {
      setMethod('paytm');
      setWdForm((prev) => ({
        ...prev,
        phone: data.phone || '',
        upiId: data.phone ? `${data.phone}@paytm` : '',
        accountTitle: data.accountName || '',
      }));
      setUpiPhone(data.phone || '');
    } else if (key === 'gpay') {
      setMethod('gpay');
      setWdForm((prev) => ({
        ...prev,
        phone: data.phone || '',
        upiId: data.upiId || (data.phone ? `${data.phone}@okhdfcbank` : ''),
        accountTitle: data.accountName || '',
      }));
      setUpiPhone(data.phone || '');
    } else if (key === 'phonepe') {
      setMethod('phonepe');
      setWdForm((prev) => ({
        ...prev,
        phone: data.phone || '',
        upiId: data.upiId || (data.phone ? `${data.phone}@ybl` : ''),
        accountTitle: data.accountName || '',
      }));
      setUpiPhone(data.phone || '');
    } else if (key === 'usdt') {
      setMethod('usdt');
      setWdForm((prev) => ({
        ...prev,
        walletAddress: data.walletAddress || '',
        network: data.network || 'TRC-20',
      }));
      setUsdtNetwork(data.network || 'TRC-20');
    }
  };

  const load = () => {
    sapi('/sellers/wallet')
      .then((res) => {
        setWallet(res.wallet);
        setWithdrawalLimit(res.withdrawalLimit);
        setWithdrawalMethods(res.withdrawalMethods || res.seller?.withdrawalMethods || {});
        setPendingOrdersCount(res.pendingOrdersCount || 0);
        setRequests(res.requests || []);

        // Auto-select first active saved method if form empty
        const wm = res.withdrawalMethods || res.seller?.withdrawalMethods || {};
        if (!activeSavedKey) {
          if (wm.bankTransfer?.enabled && wm.bankTransfer?.accountNumber) {
            applySavedMethod('bankTransfer', wm.bankTransfer);
          } else if (wm.upi?.enabled && wm.upi?.upiId) {
            applySavedMethod('upi', wm.upi);
          } else if (wm.paytm?.enabled && wm.paytm?.phone) {
            applySavedMethod('paytm', wm.paytm);
          } else if (wm.gpay?.enabled) {
            applySavedMethod('gpay', wm.gpay);
          } else if (wm.phonepe?.enabled) {
            applySavedMethod('phonepe', wm.phonepe);
          } else if (wm.usdt?.enabled && wm.usdt?.walletAddress) {
            applySavedMethod('usdt', wm.usdt);
          }
        }
      })
      .catch((err) => {
        console.error('[SellerWallet] load error:', err?.message);
        // Fallback: use cached seller wallet from localStorage if API fails
        try {
          const cached = JSON.parse(localStorage.getItem('ng_seller') || 'null');
          if (cached?.wallet) setWallet(cached.wallet);
        } catch {}
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();

    const socket = getSocket();
    const token = localStorage.getItem('ng_seller_token');

    // Ensure seller is joined to their socket room so wallet:update events arrive
    // This is a safety net in case SellerLayout's join hasn't fired yet
    const sellerData = (() => { try { return JSON.parse(localStorage.getItem('ng_seller') || 'null'); } catch { return null; } })();
    const joinRoom = () => {
      if (token && sellerData?._id) {
        socket.emit('seller:join', { token, sellerId: sellerData._id });
      }
    };
    if (socket.connected) joinRoom();
    socket.on('connect', joinRoom);

    const onWalletUpdate = (payload) => {
      // Directly update wallet state from socket payload — instant, no API round-trip needed
      // This ensures balance shows immediately without waiting for API call
      if (payload && typeof payload === 'object') {
        if (payload?.withdrawalLimit) {
          setWithdrawalLimit(payload.withdrawalLimit);
        }
        // If payload has balance data, update wallet state directly
        const hasWalletData = payload.balance !== undefined ||
          payload.totalDeposited !== undefined ||
          payload.pendingDeposit !== undefined ||
          payload.pendingWithdrawal !== undefined;
        if (hasWalletData) {
          setWallet((prev) => ({
            ...(prev || {}),
            ...(payload.balance !== undefined && { balance: payload.balance }),
            ...(payload.totalDeposited !== undefined && { totalDeposited: payload.totalDeposited }),
            ...(payload.totalEarned !== undefined && { totalEarned: payload.totalEarned }),
            ...(payload.totalWithdrawn !== undefined && { totalWithdrawn: payload.totalWithdrawn }),
            ...(payload.pendingDeposit !== undefined && { pendingDeposit: payload.pendingDeposit }),
            ...(payload.pendingWithdrawal !== undefined && { pendingWithdrawal: payload.pendingWithdrawal }),
          }));
        }
      }
      // Also reload from API for full consistency (requests list, etc.)
      load();
    };

    // notify event: server sends this on approval — also triggers a refresh
    const onNotify = () => load();

    socket.on('wallet:update', onWalletUpdate);
    socket.on('withdrawal:update', onWalletUpdate);
    socket.on('withdrawal:new', onWalletUpdate);
    socket.on('seller:limit_update', onWalletUpdate);
    socket.on('limit:update', onWalletUpdate);
    socket.on('seller:status_update', onWalletUpdate);
    socket.on('order:new', onWalletUpdate);
    socket.on('notify', onNotify);

    return () => {
      socket.off('connect', joinRoom);
      socket.off('wallet:update', onWalletUpdate);
      socket.off('withdrawal:update', onWalletUpdate);
      socket.off('withdrawal:new', onWalletUpdate);
      socket.off('seller:limit_update', onWalletUpdate);
      socket.off('limit:update', onWalletUpdate);
      socket.off('seller:status_update', onWalletUpdate);
      socket.off('order:new', onWalletUpdate);
      socket.off('notify', onNotify);
    };
  }, []);

  const setDep = (k) => (e) => setDepForm((f) => ({ ...f, [k]: e.target.value }));
  const setWd = (k) => (e) => setWdForm((f) => ({ ...f, [k]: e.target.value }));

  const handleDeposit = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');

    const amt = Number(depForm.amount);
    if (!amt || isNaN(amt) || amt < 1) {
      setErr('Please enter a valid deposit amount (minimum $1.00 USD)');
      return;
    }
    if (!depForm.depositRef || !depForm.depositRef.trim()) {
      setErr('Please enter the Payment UTR / Transaction Reference ID');
      return;
    }

    setSubmitting(true);
    try {
      const res = await sapi('/sellers/wallet/deposit', {
        method: 'POST',
        body: {
          amount: amt,
          method: depForm.method || 'bank',
          depositRef: (depForm.depositRef || '').trim(),
          depositNote: (depForm.depositNote || '').trim(),
          depositedFrom: (depForm.depositedFrom || '').trim(),
        },
      });

      const submittedAmt = amt;
      const submittedRef = (depForm.depositRef || '').trim();
      const submittedMethod = depForm.method || 'bank';
      const submittedFrom = (depForm.depositedFrom || '').trim();

      setMsg(`Deposit request for $${submittedAmt.toLocaleString('en-US', { minimumFractionDigits: 2 })} submitted successfully! Admin will verify and credit your balance.`);
      setDepForm({ amount: '', method: 'upi', depositRef: '', depositNote: '', depositedFrom: '' });

      // Audio notification chime
      playNotificationSound('deposit');

      // Open High-Visibility Confirmation Modal Dialog
      setRequestSuccessModal({
        type: 'deposit',
        title: '💰 Deposit Request Submitted!',
        amount: submittedAmt,
        ref: submittedRef,
        method: submittedMethod,
        from: submittedFrom,
        message: 'Your deposit request has been securely dispatched to Super Admin. Once verified, the funds will be added directly to your Available Balance.',
      });

      load();
    } catch (e) {
      setErr(e.message || 'Failed to submit deposit request. Please check your connection.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');

    if (pendingOrdersCount > 0) {
      return setErr(`Withdrawal blocked! You have ${pendingOrdersCount} unconfirmed pending order(s). Please confirm them in "Orders & Dispatch" first.`);
    }

    const amt = Number(wdForm.amount);
    const maxLimit = withdrawalLimit?.maxAmount !== undefined ? withdrawalLimit.maxAmount : 500;
    const minLimit = withdrawalLimit?.minAmount !== undefined ? withdrawalLimit.minAmount : 10;

    if (!amt || isNaN(amt) || amt < minLimit) {
      return setErr(`Minimum withdrawal amount is ${formatMoney(minLimit)}`);
    }
    if (amt > maxLimit) {
      return setErr(`Withdrawal amount (${formatMoney(amt)}) exceeds your current tier limit of ${formatMoney(maxLimit)}. Apply for a limit increase below.`);
    }
    if (amt > (wallet?.balance || 0)) {
      return setErr(`Insufficient balance. Available: ${formatMoney(wallet?.balance)}`);
    }

    if (method === 'bank') {
      if (!wdForm.accountTitle || !wdForm.accountNumber || !wdForm.bankName) {
        return setErr('Please fill in Account Holder Name, Bank Name, and Account Number.');
      }
      if (confirmAccountNumber && confirmAccountNumber !== wdForm.accountNumber) {
        return setErr('Bank Account Numbers do not match. Please verify your account number.');
      }
      if (wdForm.ifscCode && wdForm.ifscCode.trim().length < 11) {
        return setErr('Please enter a valid 11-character Indian IFSC Code (e.g. SBIN0001234).');
      }
    } else if (method === 'upi') {
      if (!wdForm.upiId || !wdForm.upiId.includes('@')) {
        return setErr('Please enter a valid UPI ID / VPA (e.g. yourname@okhdfcbank or 9876543210@paytm).');
      }
      if (!wdForm.accountTitle) {
        return setErr('Please enter your full registered name on the UPI / Bank account.');
      }
    } else if (method === 'paytm') {
      if (!wdForm.phone && !upiPhone) {
        return setErr('Please enter your 10-digit Paytm registered mobile number.');
      }
    } else if (method === 'gpay') {
      if (!wdForm.phone && !wdForm.upiId && !upiPhone) {
        return setErr('Please enter your Google Pay registered mobile number or UPI ID.');
      }
    } else if (method === 'phonepe') {
      if (!wdForm.phone && !wdForm.upiId && !upiPhone) {
        return setErr('Please enter your PhonePe registered mobile number or UPI ID.');
      }
    } else if (method === 'usdt') {
      if (!wdForm.walletAddress) {
        return setErr('Please enter your USDT receiving wallet address (TRC-20 / BEP-20).');
      }
    }

    setSubmitting(true);
    try {
      await sapi('/sellers/wallet/withdraw', {
        method: 'POST',
        body: {
          amount: amt,
          method,
          upiId: (wdForm.upiId || '').trim(),
          phone: (wdForm.phone || upiPhone || '').trim(),
          walletAddress: (wdForm.walletAddress || '').trim(),
          network: (usdtNetwork || wdForm.network || 'TRC-20').trim(),
          accountTitle: (wdForm.accountTitle || '').trim(),
          accountNumber: method === 'bank' ? (wdForm.accountNumber || '').trim() : '',
          bankName: method === 'bank' ? (wdForm.bankName || '').trim() : '',
          ifscCode: method === 'bank' ? (wdForm.ifscCode || '').trim().toUpperCase() : '',
          branchName: method === 'bank' ? (wdForm.bankBranch || '').trim() : '',
          accountType: method === 'bank' ? accountType : '',
          upiPhone: (upiPhone || wdForm.phone || '').trim(),
        },
      });

      setMsg(`Withdrawal payout request for $${amt.toLocaleString('en-US', { minimumFractionDigits: 2 })} submitted successfully!`);
      setWdForm((prev) => ({ ...prev, amount: '' }));

      // Audio notification chime
      playNotificationSound('withdrawal');

      // Open High-Visibility Confirmation Modal Dialog
      setRequestSuccessModal({
        type: 'withdrawal',
        title: '💸 Payout Request Submitted!',
        amount: amt,
        method: method,
        account: method === 'bank' ? `${wdForm.bankName} (A/C: •••• ${String(wdForm.accountNumber || '').slice(-4)})` : (wdForm.upiId || wdForm.phone || wdForm.walletAddress),
        message: 'Your payout transfer request has been registered and deducted from your Available Balance. Super Admin will verify and process the transfer.',
      });

      load();
    } catch (e) {
      setErr(e.message || 'Failed to submit withdrawal request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLimitIncreaseSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    const amt = Number(reqLimitAmount);
    const currentMax = withdrawalLimit?.maxAmount !== undefined ? withdrawalLimit.maxAmount : 500;
    if (!amt || amt <= currentMax) {
      return setErr(`Requested limit must be greater than current limit of ${formatMoney(currentMax)}`);
    }
    setSubmittingLimitReq(true);
    try {
      await sapi('/sellers/wallet/limit-increase-request', {
        method: 'POST',
        body: {
          requestedLimit: amt,
          reason: reqLimitReason.trim(),
        },
      });
      setMsg('🚀 Limit increase request submitted! An official notice has been posted to Admin Support Chat.');
      setLimitModalOpen(false);
      setReqLimitAmount('');
      setReqLimitReason('');
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSubmittingLimitReq(false);
    }
  };

  const [respondingOffer, setRespondingOffer] = useState(false);
  const handleLimitOfferResponse = async (action) => {
    setErr('');
    setMsg('');
    setRespondingOffer(true);
    try {
      const res = await sapi('/sellers/wallet/limit-offer-response', {
        method: 'POST',
        body: { action },
      });
      if (res?.withdrawalLimit) {
        setWithdrawalLimit(res.withdrawalLimit);
      }
      setMsg(`✅ ${res?.message || 'Offer response processed successfully!'}`);
      load();
    } catch (e) {
      setErr(e.message || 'Failed to process offer response');
      alert(e.message || 'Failed to process offer response');
    } finally {
      setRespondingOffer(false);
    }
  };

  if (loading) return <div className="seller-loading">Loading wallet &amp; financial ledger...</div>;

  const bal = wallet?.balance || 0;
  const processingFund = wallet?.processingFund || 0;
  const totalProfitEarned = wallet?.totalProfitEarned || 0;
  const totalEarned = wallet?.totalEarned || 0;
  const totalWithdrawn = wallet?.totalWithdrawn || 0;
  const pendingWithdrawal = wallet?.pendingWithdrawal || 0;
  const securityDeposit = wallet?.securityDeposit || 0;

  const filteredLedger = requests.filter((r) => {
    if (ledgerFilter === 'all') return true;
    if (ledgerFilter === 'orders') return r.type.startsWith('order_');
    if (ledgerFilter === 'deposits') return r.type === 'deposit';
    if (ledgerFilter === 'withdrawals') return r.type === 'withdrawal';
    return true;
  });

  return (
    <div className="seller-page">
      <div className="seller-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2>💼 Merchant Wallet &amp; Financial Ledger</h2>
          <p>Manage your available balance, in-flight processing funds, approved payouts, and 20% order profit earnings in <b>{currentCurrency.code} ({currentCurrency.symbol})</b>.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CurrencySelector />
        </div>
      </div>

      {msg && <div className="alert-success mb-3">{msg}</div>}
      {err && <div className="alert-error mb-3">⚠️ {err}</div>}

      {/* Core Financial KPI Cards (Enhanced with Total Withdrawn & Pending Withdrawals) */}
      <div className="seller-wallet-kpi-grid">
        {/* 1. Available Balance */}
        <div className="sw-kpi-card card-available">
          <div className="sw-kpi-head">
            <span className="sw-kpi-title">Available Balance</span>
            <div className="sw-kpi-icon"><Ic name="banknote" size={22} /></div>
          </div>
          <div className="sw-kpi-val">{formatMoney(bal)}</div>
          <small className="sw-kpi-sub">Ready for immediate payout</small>
        </div>

        {/* 2. Total Approved Withdrawals */}
        <div className="sw-kpi-card card-total">
          <div className="sw-kpi-head">
            <span className="sw-kpi-title">Total Withdrawn</span>
            <div className="sw-kpi-icon" style={{ color: '#0284c7', background: '#e0f2fe' }}><Ic name="wallet" size={20} /></div>
          </div>
          <div className="sw-kpi-val" style={{ color: '#0284c7' }}>{formatMoney(totalWithdrawn)}</div>
          <small className="sw-kpi-sub">Cumulative approved withdrawals</small>
        </div>

        {/* 3. Pending Withdrawals */}
        <div className="sw-kpi-card card-processing">
          <div className="sw-kpi-head">
            <span className="sw-kpi-title">Pending Withdrawals</span>
            <div className="sw-kpi-icon" style={{ color: '#ea580c', background: '#ffedd5' }}><Ic name="clock" size={20} /></div>
          </div>
          <div className="sw-kpi-val" style={{ color: '#ea580c' }}>{formatMoney(pendingWithdrawal)}</div>
          <small className="sw-kpi-sub">Awaiting admin payout approval</small>
        </div>

        {/* 4. Processing Funds (In-Flight) */}
        <div className="sw-kpi-card card-processing">
          <div className="sw-kpi-head">
            <span className="sw-kpi-title">Processing Funds</span>
            <div className="sw-kpi-icon" style={{ color: '#d97706', background: '#fef3c7' }}><Ic name="lock" size={20} /></div>
          </div>
          <div className="sw-kpi-val text-amber">{formatMoney(processingFund)}</div>
          <small className="sw-kpi-sub">Locked for confirmed orders</small>
        </div>

        {/* 5. 20% Profit Earned */}
        <div className="sw-kpi-card card-profit">
          <div className="sw-kpi-head">
            <span className="sw-kpi-title">20% Profit Earned</span>
            <div className="sw-kpi-icon" style={{ color: '#16a34a', background: '#dcfce7' }}><Ic name="tag" size={20} /></div>
          </div>
          <div className="sw-kpi-val text-green">+{formatMoney(totalProfitEarned)}</div>
          <small className="sw-kpi-sub">Net profit margins accumulated</small>
        </div>

        {/* 6. Total Lifetime Earnings Released */}
        <div className="sw-kpi-card card-total">
          <div className="sw-kpi-head">
            <span className="sw-kpi-title">Total Payout Volume</span>
            <div className="sw-kpi-icon" style={{ color: '#2563eb', background: '#dbeafe' }}><Ic name="checkCircle" size={20} /></div>
          </div>
          <div className="sw-kpi-val">{formatMoney(totalEarned)}</div>
          <small className="sw-kpi-sub">Lifetime principal + profit released</small>
        </div>

        {/* 7. Security Deposit (If Recorded) */}
        {(securityDeposit > 0 || wallet?.securityDepositPaid) && (
          <div className="sw-kpi-card" style={{ background: '#f8fafc', borderLeft: '4px solid #6366f1' }}>
            <div className="sw-kpi-head">
              <span className="sw-kpi-title">Security Deposit</span>
              <div className="sw-kpi-icon" style={{ color: '#6366f1', background: '#e0e7ff' }}><Ic name="shield" size={20} /></div>
            </div>
            <div className="sw-kpi-val" style={{ color: '#4338ca' }}>{formatMoney(securityDeposit)}</div>
            <small className="sw-kpi-sub">Merchant collateral (Active &amp; Verified)</small>
          </div>
        )}
      </div>

      {/* Action Navigation Tabs */}
      <div className="wallet-action-tabs">
        <button
          className={`wallet-action-tab ${tab === 'ledger' ? 'active' : ''}`}
          onClick={() => handleTabChange('ledger')}
        >
          📊 Financial Ledger &amp; Payouts
        </button>
        <button
          className={`wallet-action-tab ${tab === 'deposit' ? 'active' : ''}`}
          onClick={() => handleTabChange('deposit')}
        >
          💰 Deposit Funds
        </button>
        <button
          className={`wallet-action-tab ${tab === 'withdraw' ? 'active' : ''}`}
          onClick={() => handleTabChange('withdraw')}
        >
          💸 Withdraw Funds
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: FINANCIAL LEDGER & TRANSACTION HISTORY
          ───────────────────────────────────────────────────────────── */}
      {tab === 'ledger' && (
        <div className="seller-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>📜 Financial Transaction Ledger</h3>
              <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#64748b' }}>
                Complete audit trail of Order Processing locks, 20% Profit releases, Deposits, and Withdrawals.
              </p>
            </div>

            {/* Filter Pills */}
            <div className="ledger-filter-pills">
              <button
                type="button"
                className={`lfp-btn ${ledgerFilter === 'all' ? 'active' : ''}`}
                onClick={() => setLedgerFilter('all')}
              >
                All ({requests.length})
              </button>
              <button
                type="button"
                className={`lfp-btn ${ledgerFilter === 'orders' ? 'active' : ''}`}
                onClick={() => setLedgerFilter('orders')}
              >
                Order Settlements ({requests.filter((r) => r.type.startsWith('order_')).length})
              </button>
              <button
                type="button"
                className={`lfp-btn ${ledgerFilter === 'deposits' ? 'active' : ''}`}
                onClick={() => setLedgerFilter('deposits')}
              >
                Deposits ({requests.filter((r) => r.type === 'deposit').length})
              </button>
              <button
                type="button"
                className={`lfp-btn ${ledgerFilter === 'withdrawals' ? 'active' : ''}`}
                onClick={() => setLedgerFilter('withdrawals')}
              >
                Withdrawals ({requests.filter((r) => r.type === 'withdrawal').length})
              </button>
            </div>
          </div>

          <div className="seller-table-wrap">
            <table className="seller-table">
              <thead>
                <tr>
                  <th>Date &amp; Time</th>
                  <th>Transaction Type</th>
                  <th>Order / Ref</th>
                  <th>Principal</th>
                  <th>+20% Profit</th>
                  <th>Total Amount</th>
                  <th>Balance After</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredLedger.length === 0 && (
                  <tr>
                    <td colSpan="8" className="text-center py-8 muted">No transactions found matching this filter.</td>
                  </tr>
                )}
                {filteredLedger.map((r) => {
                  const badge = TYPE_BADGE[r.type] || { label: r.type, color: '#64748b', bg: '#f1f5f9', icon: '📄' };
                  const isLock = r.type === 'order_processing_lock';
                  const isDelivered = r.type === 'order_delivered_release';
                  const isDeposit = r.type === 'deposit';
                  const isWithdrawal = r.type === 'withdrawal';
                  const dObj = new Date(r.createdAt || r.processedAt || Date.now());

                  return (
                    <tr key={r._id}>
                      <td>
                        <div className="ledger-datetime-cell">
                          <span className="ldt-date">
                            {dObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          <span className="ldt-time">
                            {dObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span
                          className="ledger-type-chip"
                          style={{ color: badge.color, background: badge.bg, border: `1px solid ${badge.color}30` }}
                        >
                          {badge.icon} {badge.label}
                        </span>
                      </td>
                      <td>
                        {r.orderNumber ? (
                          <b>#{r.orderNumber}</b>
                        ) : r.depositRef ? (
                          <span className="muted-sm">Ref: {r.depositRef}</span>
                        ) : (
                          <span className="muted-sm">—</span>
                        )}
                      </td>
                      <td>
                        {r.principalAmount ? (
                          <span>{formatMoney(r.principalAmount)}</span>
                        ) : (
                          <span className="muted-sm">—</span>
                        )}
                      </td>
                      <td>
                        {r.profitAmount > 0 ? (
                          <b style={{ color: '#16a34a' }}>+{formatMoney(r.profitAmount)}</b>
                        ) : (
                          <span className="muted-sm">—</span>
                        )}
                      </td>
                      <td>
                        {(() => {
                          if (isWithdrawal) {
                            if (r.status === 'approved') {
                              const finalAmt = r.approvedAmount !== undefined && r.approvedAmount !== null ? r.approvedAmount : r.amount;
                              const isPartial = finalAmt < r.amount;
                              return (
                                <div>
                                  <b style={{ fontSize: 14, color: '#dc2626' }}>
                                    -{formatMoney(finalAmt)}
                                  </b>
                                  {isPartial && (
                                    <small style={{ display: 'block', color: '#16a34a', fontSize: 11, fontWeight: 700 }}>
                                      +{formatMoney(r.amount - finalAmt)} Refunded
                                    </small>
                                  )}
                                </div>
                              );
                            }
                            if (r.status === 'rejected') {
                              return (
                                <div>
                                  <b style={{ fontSize: 13, color: '#64748b', textDecoration: 'line-through' }}>
                                    -{formatMoney(r.amount)}
                                  </b>
                                  <small style={{ display: 'block', color: '#16a34a', fontSize: 11, fontWeight: 700 }}>
                                    Full {formatMoney(r.amount)} Refunded
                                  </small>
                                </div>
                              );
                            }
                            return (
                              <b style={{ fontSize: 14, color: '#dc2626' }}>
                                -{formatMoney(r.amount)}
                              </b>
                            );
                          }

                          if (isDeposit) {
                            if (r.status === 'approved') {
                              const finalAmt = r.approvedAmount !== undefined && r.approvedAmount !== null ? r.approvedAmount : r.amount;
                              return (
                                <b style={{ fontSize: 14, color: '#16a34a' }}>
                                  +{formatMoney(finalAmt)}
                                </b>
                              );
                            }
                            if (r.status === 'rejected') {
                              return (
                                <b style={{ fontSize: 13, color: '#64748b', textDecoration: 'line-through' }}>
                                  +{formatMoney(r.amount)}
                                </b>
                              );
                            }
                            return (
                              <b style={{ fontSize: 14, color: '#16a34a' }}>
                                +{formatMoney(r.amount)}
                              </b>
                            );
                          }

                          return (
                            <b
                              style={{
                                fontSize: 14,
                                color: isLock ? '#dc2626' : '#16a34a',
                              }}
                            >
                              {isLock ? '-' : '+'}{formatMoney(r.amount)}
                            </b>
                          );
                        })()}
                      </td>
                      <td>
                        {r.balanceAfter !== null && r.balanceAfter !== undefined ? (
                          <b style={{ color: '#0f172a' }}>{formatMoney(r.balanceAfter)}</b>
                        ) : (
                          <span className="muted-sm">—</span>
                        )}
                      </td>
                      <td>
                        <span className={`status-chip ${STATUS_COLOR[r.status] || ''}`}>
                          {r.status?.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: DEPOSIT FUNDS
          ───────────────────────────────────────────────────────────── */}
      {tab === 'deposit' && (
        <div className="card form-card mb-4">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h3 style={{ margin: 0 }}>💰 Add Funds to Merchant Wallet</h3>
              <p className="muted-sm" style={{ margin: '2px 0 0' }}>
                Submit a deposit request to add funds into your Available Balance (USD $). Supports Indian UPI Apps &amp; Instant Bank Transfers.
              </p>
            </div>
            <span className="swt-pill-limit-tag" style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}>
              Instant Verification • <b>24/7 Support</b>
            </span>
          </div>

          <form onSubmit={handleDeposit} className="form-grid">
            <div className="field field-full">
              <CurrencyConverterWidget
                usdValue={depForm.amount}
                onUsdChange={(val) => setDepForm((prev) => ({ ...prev, amount: val }))}
                title="Deposit Currency Converter (INR / EUR / GBP / AED to USD)"
                mode="deposit"
              />
            </div>

            {/* Deposit Payment Method Segment */}
            <div className="field field-full">
              <label style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
                Select Your Deposit Method:
              </label>
              <div className="deposit-method-pills">
                {[
                  { id: 'upi', label: '⚡ UPI / QR Transfer', sub: 'GPay, PhonePe, Paytm, BHIM' },
                  { id: 'bank', label: '🏦 IMPS / NEFT / RTGS', sub: 'Direct Bank Wire Transfer' },
                  { id: 'card', label: '💳 Debit / Credit Card', sub: 'Visa, MasterCard, RuPay' },
                  { id: 'other', label: '🌐 Other / Wire', sub: 'International Remittance' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`deposit-method-pill ${depForm.method === m.id ? 'active' : ''}`}
                    onClick={() => setDepForm((prev) => ({ ...prev, method: m.id }))}
                  >
                    <b>{m.label}</b>
                    <small>{m.sub}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>
                {depForm.method === 'upi'
                  ? 'Your Sender UPI ID / Mobile Number'
                  : depForm.method === 'bank'
                  ? 'Your Sender Bank Name & Account'
                  : 'Deposited From Account / Card Name'}
              </label>
              <input
                value={depForm.depositedFrom}
                onChange={setDep('depositedFrom')}
                placeholder={
                  depForm.method === 'upi'
                    ? 'e.g. yourname@okhdfcbank / 9876543210'
                    : depForm.method === 'bank'
                    ? 'e.g. HDFC Bank - Aizaz Ahmad'
                    : 'Account / Cardholder Name'
                }
              />
            </div>

            <div className="field">
              <label>
                Payment UTR / Reference / Transaction ID <span className="sig-req">*</span>
              </label>
              <input
                value={depForm.depositRef}
                onChange={setDep('depositRef')}
                placeholder="12-digit UTR number or Bank Transfer Ref ID"
                required
              />
            </div>

            <div className="field field-full">
              <label>Deposit Notes for Admin <span className="muted-sm">(optional)</span></label>
              <input
                value={depForm.depositNote}
                onChange={setDep('depositNote')}
                placeholder="e.g. Deposited ₹10,000 via Google Pay for order fulfillment fund"
              />
            </div>

            {/* Inline Alert Feedback inside Deposit Card */}
            {err && (
              <div className="field field-full">
                <div style={{ background: '#fef2f2', border: '1.5px solid #f87171', borderRadius: 8, padding: '12px 16px', color: '#991b1b', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>⚠️</span>
                  <div>
                    <b>Deposit Request Error:</b>
                    <div style={{ marginTop: 2 }}>{err}</div>
                  </div>
                </div>
              </div>
            )}
            {msg && (
              <div className="field field-full">
                <div style={{ background: '#ecfdf5', border: '1.5px solid #34d399', borderRadius: 8, padding: '12px 16px', color: '#065f46', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>✅</span>
                  <div>
                    <b>Success:</b>
                    <div style={{ marginTop: 2 }}>{msg}</div>
                  </div>
                </div>
              </div>
            )}

            <div className="field field-full">
              <button
                type="submit"
                className="seller-btn-pri"
                disabled={submitting}
                style={{ padding: '13px 20px', fontSize: 15, fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer' }}
              >
                {submitting ? (
                  <span>⏳ Submitting Deposit Request to Admin...</span>
                ) : (
                  <span>💰 Submit Deposit Request ({Number(depForm.amount) > 0 ? `$${Number(depForm.amount).toFixed(2)} USD` : 'Enter Amount Above'})</span>
                )}
              </button>
              {(!depForm.amount || Number(depForm.amount) < 1) && (
                <small className="muted-sm" style={{ display: 'block', marginTop: 6, color: '#64748b' }}>
                  ℹ️ Please enter the amount in USD ($) or use the converter widget above before submitting.
                </small>
              )}
            </div>
          </form>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 3: WITHDRAW FUNDS & TIERED WITHDRAWAL LIMITS
          ───────────────────────────────────────────────────────────── */}
      {tab === 'withdraw' && (
        <div className="seller-withdraw-tab-wrap">
          {/* ─── TIERED WITHDRAWAL LIMIT & UPGRADE PROGRESS HERO CARD ─── */}
          {(() => {
            const limit = withdrawalLimit || {
              maxAmount: 500,
              minAmount: 10,
              requiredWithdrawalsForIncrease: 10,
              successfulWithdrawalCount: 0,
              upgradeFee: 50,
              currentTierName: 'Tier 1 - Standard ($500 Max)',
              pendingIncreaseRequest: { status: 'none' },
            };

            const maxAmount = limit.maxAmount !== undefined ? limit.maxAmount : 500;
            const completedCount = limit.successfulWithdrawalCount || 0;
            const requiredCount = limit.requiredWithdrawalsForIncrease || 10;
            const upgradeFee = limit.upgradeFee !== undefined ? limit.upgradeFee : 50;
            const tierName = limit.currentTierName || 'Tier 1 - Standard';
            const pendingReq = limit.pendingIncreaseRequest || { status: 'none' };
            const status = pendingReq.status || 'none';

            const isPending = status === 'pending';
            const isOffered = status === 'offered';
            const isAccepted = status === 'accepted_by_seller';
            const progressPercent = Math.min(100, Math.round((completedCount / (requiredCount || 1)) * 100));
            const isEligible = completedCount >= requiredCount;

            return (
              <div className="seller-withdrawal-tier-card">
                <div className="swt-top">
                  <div className="swt-left">
                    <div className="swt-icon-box">
                      <Ic name="shield" size={26} />
                    </div>
                    <div className="swt-meta">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="swt-tier-name">{tierName}</span>
                        <span className="swt-limit-badge">Current Max: {formatMoney(maxAmount)} / request</span>
                      </div>
                      <p className="swt-sub">
                        Single withdrawal ceiling. Complete <b>{requiredCount} successful withdrawals</b> to unlock higher limits.
                      </p>
                    </div>
                  </div>

                  <div className="swt-right">
                    {isPending ? (
                      <div className="swt-pending-badge">
                        <span>⏳ Application Under Review:</span>
                        <b>{formatMoney(pendingReq.requestedLimit || 0)}</b>
                      </div>
                    ) : isOffered ? (
                      <div className="swt-pending-badge" style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}>
                        <span>📋 Offer Received:</span>
                        <b>{formatMoney(pendingReq.offeredLimit || 0)}</b>
                      </div>
                    ) : isAccepted ? (
                      <div className="swt-pending-badge" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e40af' }}>
                        <span>🤝 Terms Accepted — Awaiting Admin Activation</span>
                      </div>
                    ) : isEligible ? (
                      <button
                        type="button"
                        onClick={() => setLimitModalOpen(true)}
                        className="swt-apply-btn eligible"
                      >
                        🚀 Apply for Limit Increase
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="swt-apply-btn"
                        style={{ opacity: 0.65, cursor: 'not-allowed', background: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1' }}
                        title={`Complete ${requiredCount - completedCount} more approved withdrawals at current tier to unlock limit upgrade.`}
                      >
                        🔒 Locked ({completedCount}/{requiredCount} Payouts)
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress Bar towards next tier */}
                <div className="swt-progress-wrap">
                  <div className="swt-progress-labels">
                    <span>
                      <b>{completedCount}</b> of <b>{requiredCount}</b> Approved Withdrawals Completed ({progressPercent}%)
                    </span>
                    <span>Milestone Goal: <b>{requiredCount} Successful Payouts</b></span>
                  </div>
                  <div className="swt-progress-track">
                    <div
                      className={`swt-progress-fill ${isEligible ? 'fill-gold' : 'fill-blue'}`}
                      style={{ width: `${Math.max(4, progressPercent)}%` }}
                    />
                  </div>
                </div>

                {/* ─── OFFER SLIP BOX (STEP 2: SELLER REVIEWS AND ACCEPTS TERMS) ─── */}
                {isOffered && (
                  <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 10, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 20 }}>📋</span>
                        <div>
                          <b style={{ fontSize: 14, color: '#166534' }}>Official Limit Upgrade Offer from Platform Admin</b>
                          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#15803d' }}>
                            Admin has reviewed your store and quoted the following upgrade terms:
                          </p>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, background: '#ffffff', padding: '10px 14px', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                      <div>
                        <small style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Offered New Limit</small>
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#16a34a' }}>
                          {formatMoney(pendingReq.offeredLimit || 0)}
                        </div>
                      </div>
                      <div>
                        <small style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Upgrade Processing Fee</small>
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#d97706' }}>
                          {formatMoney(pendingReq.offeredFee !== undefined ? pendingReq.offeredFee : 50)}
                        </div>
                      </div>
                      <div>
                        <small style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Next Target Milestones</small>
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#2563eb' }}>
                          {pendingReq.offeredNextCount || 15} Withdrawals
                        </div>
                      </div>
                    </div>

                    {pendingReq.adminNote && (
                      <div style={{ fontSize: 12, color: '#334155', fontStyle: 'italic', background: '#f8fafc', padding: '6px 10px', borderRadius: 6 }}>
                        <b>Admin Note:</b> "{pendingReq.adminNote}"
                      </div>
                    )}

                    <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fef3c7', padding: '8px 12px', borderRadius: 6 }}>
                      💡 <b>Payment Notice:</b> Accepting this offer agrees to the terms. <b>No money is deducted right now</b> — the {formatMoney(pendingReq.offeredFee || 50)} processing fee will only be deducted when Admin performs the final limit activation.
                    </div>

                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => handleLimitOfferResponse('accept')}
                        disabled={respondingOffer}
                        style={{
                          padding: '8px 18px',
                          background: '#16a34a',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        {respondingOffer ? 'Processing...' : '✅ Accept Terms & Agree to Upgrade'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleLimitOfferResponse('decline')}
                        disabled={respondingOffer}
                        style={{
                          padding: '8px 16px',
                          background: '#f1f5f9',
                          color: '#64748b',
                          border: '1px solid #cbd5e1',
                          borderRadius: 8,
                          fontSize: 12.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        ❌ Decline Offer (Keep Current Limit)
                      </button>
                    </div>
                  </div>
                )}

                {/* ─── WAITING FOR ADMIN ACTIVATION NOTICE (STEP 3) ─── */}
                {isAccepted && (
                  <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 22 }}>🤝</span>
                    <div>
                      <b style={{ fontSize: 13.5, color: '#1e40af' }}>You have accepted the Limit Upgrade Offer Terms!</b>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: '#1d4ed8' }}>
                        Agreed Limit: <b>{formatMoney(pendingReq.offeredLimit)}</b> • Processing Fee upon activation: <b>{formatMoney(pendingReq.offeredFee)}</b>. Admin will perform the final activation shortly. <i>No fee has been deducted yet.</i>
                      </p>
                    </div>
                  </div>
                )}

                {/* Under Review Notice (Step 1 Pending) */}
                {isPending && (
                  <div className="swt-review-banner">
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 16 }}>📋</span>
                      <div>
                        <b>Limit Increase Application Pending Admin Review</b>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#92400e' }}>
                          Requested Limit: <b>{formatMoney(pendingReq.requestedLimit)}</b>. Admin will review your store orders and send an official Offer Slip with custom terms.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ─── WITHDRAWAL FORM CARD ─── */}
          <div className="card form-card mb-4">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h3 style={{ margin: 0 }}>💸 Request Payout Transfer</h3>
                <p className="muted-sm" style={{ margin: '2px 0 0' }}>
                  Payouts are debited in USD ($) and transferred directly to your Indian Bank Account or UPI VPA Address.
                </p>
              </div>
              <span className="swt-pill-limit-tag">
                Max Allowed: <b>{formatMoney(withdrawalLimit?.maxAmount || 500)}</b>
              </span>
            </div>

            {/* Unconfirmed Orders Blocker Notice */}
            {pendingOrdersCount > 0 && (
              <div style={{ background: '#fef2f2', border: '1.5px solid #f87171', borderRadius: 10, padding: '14px 18px', marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 26 }}>🚫</span>
                  <div style={{ flex: 1 }}>
                    <b style={{ color: '#991b1b', fontSize: 14 }}>Withdrawals Blocked — Unconfirmed Orders Pending</b>
                    <p style={{ margin: '3px 0 8px', color: '#b91c1c', fontSize: 12.5, lineHeight: 1.4 }}>
                      You currently have <b>{pendingOrdersCount} unconfirmed customer order(s)</b>. Marketplace compliance policy requires all pending customer orders to be confirmed and processed in order to request payout transfers.
                    </p>
                    <Link
                      to="/seller/orders"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: '#dc2626',
                        color: '#ffffff',
                        padding: '6px 14px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 800,
                        textDecoration: 'none',
                      }}
                    >
                      📦 View &amp; Confirm Pending Orders ({pendingOrdersCount}) →
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* ─── 1-CLICK SAVED PAYMENT METHODS QUICK SELECT ─── */}
            {(() => {
              const wm = withdrawalMethods || {};
              const hasAnySaved = Boolean(
                (wm.bankTransfer?.enabled && wm.bankTransfer?.accountNumber) ||
                (wm.upi?.enabled && wm.upi?.upiId) ||
                (wm.paytm?.enabled && wm.paytm?.phone) ||
                (wm.gpay?.enabled && (wm.gpay?.phone || wm.gpay?.upiId)) ||
                (wm.phonepe?.enabled && (wm.phonepe?.phone || wm.phonepe?.upiId)) ||
                (wm.usdt?.enabled && wm.usdt?.walletAddress)
              );

              if (hasAnySaved) {
                return (
                  <div className="saved-withdrawal-methods-box mb-4">
                    <div className="swm-head">
                      <div className="swm-head-left">
                        <span className="swm-bolt-icon">⚡</span>
                        <div>
                          <b className="swm-head-title">Saved Payment Methods (1-Click Auto-Fill)</b>
                          <small className="swm-head-sub">Click any of your configured payment coordinates to auto-populate all details instantly:</small>
                        </div>
                      </div>
                      <Link to="/seller/settings" className="swm-edit-link">
                        ⚙️ Edit Saved in Settings
                      </Link>
                    </div>

                    <div className="swm-cards-grid">
                      {wm.bankTransfer?.enabled && wm.bankTransfer?.accountNumber && (
                        <div
                          className={`swm-card ${activeSavedKey === 'bankTransfer' && method === 'bank' ? 'selected' : ''}`}
                          onClick={() => applySavedMethod('bankTransfer', wm.bankTransfer)}
                        >
                          <div className="swm-card-top">
                            <span className="swm-card-icon">🏦</span>
                            <b className="swm-card-name">Indian Bank</b>
                            {activeSavedKey === 'bankTransfer' && method === 'bank' && <span className="swm-selected-badge">✓ Active</span>}
                          </div>
                          <div className="swm-card-detail">{wm.bankTransfer.bankName || 'State Bank of India'}</div>
                          <div className="swm-card-acc">A/C: •••• {String(wm.bankTransfer.accountNumber || '').slice(-4)} ({wm.bankTransfer.accountTitle || 'Account'})</div>
                          <div className="swm-card-ifsc">IFSC: {wm.bankTransfer.ifscCode || '—'}</div>
                        </div>
                      )}

                      {wm.upi?.enabled && wm.upi?.upiId && (
                        <div
                          className={`swm-card ${activeSavedKey === 'upi' && method === 'upi' ? 'selected' : ''}`}
                          onClick={() => applySavedMethod('upi', wm.upi)}
                        >
                          <div className="swm-card-top">
                            <span className="swm-card-icon">⚡</span>
                            <b className="swm-card-name">UPI VPA</b>
                            {activeSavedKey === 'upi' && method === 'upi' && <span className="swm-selected-badge">✓ Active</span>}
                          </div>
                          <div className="swm-card-detail">{wm.upi.upiId}</div>
                          <div className="swm-card-acc">{wm.upi.holderName || 'Registered UPI Name'}</div>
                        </div>
                      )}

                      {wm.paytm?.enabled && wm.paytm?.phone && (
                        <div
                          className={`swm-card ${activeSavedKey === 'paytm' && method === 'paytm' ? 'selected' : ''}`}
                          onClick={() => applySavedMethod('paytm', wm.paytm)}
                        >
                          <div className="swm-card-top">
                            <span className="swm-card-icon">📱</span>
                            <b className="swm-card-name">Paytm</b>
                            {activeSavedKey === 'paytm' && method === 'paytm' && <span className="swm-selected-badge">✓ Active</span>}
                          </div>
                          <div className="swm-card-detail">Mob: {wm.paytm.phone}</div>
                          <div className="swm-card-acc">{wm.paytm.accountName || 'Paytm Wallet'}</div>
                        </div>
                      )}

                      {wm.gpay?.enabled && (wm.gpay?.phone || wm.gpay?.upiId) && (
                        <div
                          className={`swm-card ${activeSavedKey === 'gpay' && method === 'gpay' ? 'selected' : ''}`}
                          onClick={() => applySavedMethod('gpay', wm.gpay)}
                        >
                          <div className="swm-card-top">
                            <span className="swm-card-icon">🔵</span>
                            <b className="swm-card-name">Google Pay</b>
                            {activeSavedKey === 'gpay' && method === 'gpay' && <span className="swm-selected-badge">✓ Active</span>}
                          </div>
                          <div className="swm-card-detail">{wm.gpay.phone || wm.gpay.upiId}</div>
                          <div className="swm-card-acc">{wm.gpay.accountName || 'GPay Account'}</div>
                        </div>
                      )}

                      {wm.phonepe?.enabled && (wm.phonepe?.phone || wm.phonepe?.upiId) && (
                        <div
                          className={`swm-card ${activeSavedKey === 'phonepe' && method === 'phonepe' ? 'selected' : ''}`}
                          onClick={() => applySavedMethod('phonepe', wm.phonepe)}
                        >
                          <div className="swm-card-top">
                            <span className="swm-card-icon">🟣</span>
                            <b className="swm-card-name">PhonePe</b>
                            {activeSavedKey === 'phonepe' && method === 'phonepe' && <span className="swm-selected-badge">✓ Active</span>}
                          </div>
                          <div className="swm-card-detail">{wm.phonepe.phone || wm.phonepe.upiId}</div>
                          <div className="swm-card-acc">{wm.phonepe.accountName || 'PhonePe User'}</div>
                        </div>
                      )}

                      {wm.usdt?.enabled && wm.usdt?.walletAddress && (
                        <div
                          className={`swm-card ${activeSavedKey === 'usdt' && method === 'usdt' ? 'selected' : ''}`}
                          onClick={() => applySavedMethod('usdt', wm.usdt)}
                        >
                          <div className="swm-card-top">
                            <span className="swm-card-icon">💎</span>
                            <b className="swm-card-name">USDT ({wm.usdt.network || 'TRC-20'})</b>
                            {activeSavedKey === 'usdt' && method === 'usdt' && <span className="swm-selected-badge">✓ Active</span>}
                          </div>
                          <div className="swm-card-detail" style={{ fontFamily: 'monospace', fontSize: 11 }}>
                            {String(wm.usdt.walletAddress || '').slice(0, 8)}...{String(wm.usdt.walletAddress || '').slice(-6)}
                          </div>
                          <div className="swm-card-acc">{wm.usdt.network || 'TRC-20'} Crypto Payout</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div className="no-saved-methods-callout mb-4">
                  <span style={{ fontSize: 24 }}>💡</span>
                  <div style={{ flex: 1 }}>
                    <b style={{ color: '#0f172a', fontSize: 13.5, display: 'block' }}>Save Your Payment Coordinates for 1-Click Auto-Fill</b>
                    <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: 12.5 }}>
                      You can save your Indian Bank Account, UPI ID, Paytm, GPay, or USDT wallet in Store Settings once. They will automatically appear here for instant 1-click withdrawals!
                    </p>
                  </div>
                  <Link to="/seller/settings" className="seller-btn-pri btn-sm" style={{ whiteSpace: 'nowrap' }}>
                    ⚙️ Setup in Settings
                  </Link>
                </div>
              );
            })()}

            <form onSubmit={handleWithdraw} className="form-grid">
              <div className="field field-full">
                <CurrencyConverterWidget
                  usdValue={wdForm.amount}
                  onUsdChange={(val) => setWdForm((prev) => ({ ...prev, amount: val }))}
                  title="Payout Currency Converter (USD to INR / EUR / GBP / AED)"
                  mode="withdraw"
                />
              </div>

              {/* Transfer Method Switcher Tabs */}
              <div className="field field-full">
                <label style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
                  Select Payout Transfer Method:
                </label>
                <div className="payment-method-selector-tabs-grid">
                  <button
                    type="button"
                    className={`pms-tab-card ${method === 'bank' ? 'active' : ''}`}
                    onClick={() => {
                      setMethod('bank');
                      if (withdrawalMethods?.bankTransfer?.enabled) {
                        applySavedMethod('bankTransfer', withdrawalMethods.bankTransfer);
                      }
                    }}
                  >
                    <span className="pms-icon">🏦</span>
                    <div className="pms-text">
                      <b>Indian Bank Transfer</b>
                      <small>NEFT / IMPS / RTGS</small>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`pms-tab-card ${method === 'upi' ? 'active' : ''}`}
                    onClick={() => {
                      setMethod('upi');
                      if (withdrawalMethods?.upi?.enabled) {
                        applySavedMethod('upi', withdrawalMethods.upi);
                      }
                    }}
                  >
                    <span className="pms-icon">⚡</span>
                    <div className="pms-text">
                      <b>UPI (Instant VPA)</b>
                      <small>GPay, PhonePe, BHIM</small>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`pms-tab-card ${method === 'paytm' ? 'active' : ''}`}
                    onClick={() => {
                      setMethod('paytm');
                      if (withdrawalMethods?.paytm?.enabled) {
                        applySavedMethod('paytm', withdrawalMethods.paytm);
                      }
                    }}
                  >
                    <span className="pms-icon">📱</span>
                    <div className="pms-text">
                      <b>Paytm Wallet</b>
                      <small>Mobile / Payments Bank</small>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`pms-tab-card ${method === 'gpay' ? 'active' : ''}`}
                    onClick={() => {
                      setMethod('gpay');
                      if (withdrawalMethods?.gpay?.enabled) {
                        applySavedMethod('gpay', withdrawalMethods.gpay);
                      }
                    }}
                  >
                    <span className="pms-icon">🔵</span>
                    <div className="pms-text">
                      <b>Google Pay</b>
                      <small>Phone / GPay UPI</small>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`pms-tab-card ${method === 'phonepe' ? 'active' : ''}`}
                    onClick={() => {
                      setMethod('phonepe');
                      if (withdrawalMethods?.phonepe?.enabled) {
                        applySavedMethod('phonepe', withdrawalMethods.phonepe);
                      }
                    }}
                  >
                    <span className="pms-icon">🟣</span>
                    <div className="pms-text">
                      <b>PhonePe</b>
                      <small>Mobile / @ybl handle</small>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`pms-tab-card ${method === 'usdt' ? 'active' : ''}`}
                    onClick={() => {
                      setMethod('usdt');
                      if (withdrawalMethods?.usdt?.enabled) {
                        applySavedMethod('usdt', withdrawalMethods.usdt);
                      }
                    }}
                  >
                    <span className="pms-icon">💎</span>
                    <div className="pms-text">
                      <b>USDT Crypto</b>
                      <small>TRC-20 / BEP-20</small>
                    </div>
                  </button>
                </div>
              </div>

              {/* ──────────────────────────────────────────────────
                  MODE A: INDIAN BANK TRANSFER FIELDS
                  ────────────────────────────────────────────────── */}
              {method === 'bank' && (
                <>
                  <div className="field">
                    <label>
                      Account Holder Full Name <span className="sig-req">*</span>
                    </label>
                    <input
                      value={wdForm.accountTitle}
                      onChange={setWd('accountTitle')}
                      placeholder="Full name as printed in bank passbook"
                      required
                    />
                    <small className="muted-sm">Must match your verified merchant legal name.</small>
                  </div>

                  <div className="field">
                    <label>
                      Select Indian Bank <span className="sig-req">*</span>
                    </label>
                    <div className="bank-select-wrap">
                      <select
                        value={wdForm.bankName}
                        onChange={setWd('bankName')}
                        required
                        className="sig-select"
                      >
                        {INDIAN_BANKS.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="field">
                    <label>
                      Bank Account Number <span className="sig-req">*</span>
                    </label>
                    <input
                      type="text"
                      value={wdForm.accountNumber}
                      onChange={setWd('accountNumber')}
                      placeholder="Enter 9 to 18 digit account number"
                      required
                    />
                  </div>

                  <div className="field">
                    <label>
                      Confirm Bank Account Number <span className="sig-req">*</span>
                    </label>
                    <input
                      type="text"
                      value={confirmAccountNumber}
                      onChange={(e) => setConfirmAccountNumber(e.target.value)}
                      placeholder="Re-enter bank account number"
                      required
                    />
                    {confirmAccountNumber && confirmAccountNumber !== wdForm.accountNumber && (
                      <small style={{ color: '#dc2626', fontWeight: 700, marginTop: 2 }}>
                        ⚠️ Account numbers do not match!
                      </small>
                    )}
                    {confirmAccountNumber && confirmAccountNumber === wdForm.accountNumber && (
                      <small style={{ color: '#16a34a', fontWeight: 700, marginTop: 2 }}>
                        ✓ Account numbers match perfectly
                      </small>
                    )}
                  </div>

                  <div className="field">
                    <label>
                      Bank IFSC Code (11 Characters) <span className="sig-req">*</span>
                    </label>
                    <input
                      value={wdForm.ifscCode}
                      onChange={setWd('ifscCode')}
                      placeholder="e.g. SBIN0001234 / HDFC0000001"
                      style={{ textTransform: 'uppercase', letterSpacing: 1 }}
                      maxLength={11}
                      required
                    />
                    <small className="muted-sm">11-character Indian Financial System Code.</small>
                  </div>

                  <div className="field">
                    <label>Account Type</label>
                    <select
                      value={accountType}
                      onChange={(e) => setAccountType(e.target.value)}
                      className="sig-select"
                    >
                      <option value="Savings">Savings Account</option>
                      <option value="Current">Current / Business Account</option>
                    </select>
                  </div>
                </>
              )}

              {/* ──────────────────────────────────────────────────
                  MODE B: UPI FIELDS
                  ────────────────────────────────────────────────── */}
              {method === 'upi' && (
                <>
                  <div className="field field-full">
                    <label style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                      Choose UPI App Provider:
                    </label>
                    <div className="upi-app-chips">
                      {UPI_APPS.map((app) => (
                        <button
                          key={app.id}
                          type="button"
                          className={`upi-chip ${selectedUpiApp === app.id ? 'active' : ''}`}
                          onClick={() => {
                            setSelectedUpiApp(app.id);
                            if (app.handle && !wdForm.upiId.includes('@')) {
                              setWdForm((prev) => ({
                                ...prev,
                                upiId: prev.upiId ? `${prev.upiId}${app.handle}` : '',
                              }));
                            }
                          }}
                        >
                          <span>{app.icon}</span>
                          <b>{app.name}</b>
                          {app.handle && <small>{app.handle}</small>}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="field">
                    <label>
                      UPI ID / VPA Address <span className="sig-req">*</span>
                    </label>
                    <input
                      value={wdForm.upiId}
                      onChange={setWd('upiId')}
                      placeholder="e.g. yourname@okhdfcbank or 9876543210@paytm"
                      required
                    />
                    <small className="muted-sm">Virtual Payment Address registered on GPay, PhonePe, Paytm, BHIM, etc.</small>
                  </div>

                  <div className="field">
                    <label>
                      Registered Name on UPI / Bank <span className="sig-req">*</span>
                    </label>
                    <input
                      value={wdForm.accountTitle}
                      onChange={setWd('accountTitle')}
                      placeholder="Name registered with UPI app"
                      required
                    />
                    <small className="muted-sm">Ensures instant NPCI name verification.</small>
                  </div>
                </>
              )}

              {/* ──────────────────────────────────────────────────
                  MODE C: PAYTM WALLET FIELDS
                  ────────────────────────────────────────────────── */}
              {method === 'paytm' && (
                <>
                  <div className="field">
                    <label>
                      Paytm Registered 10-Digit Mobile Number <span className="sig-req">*</span>
                    </label>
                    <input
                      type="tel"
                      value={wdForm.phone || upiPhone}
                      onChange={(e) => {
                        setWdForm((prev) => ({ ...prev, phone: e.target.value }));
                        setUpiPhone(e.target.value);
                      }}
                      placeholder="e.g. 9876543210"
                      maxLength={10}
                      required
                    />
                    <small className="muted-sm">Payout transferred to your linked Paytm wallet / Payments Bank.</small>
                  </div>

                  <div className="field">
                    <label>Paytm Account Holder Full Name</label>
                    <input
                      value={wdForm.accountTitle}
                      onChange={setWd('accountTitle')}
                      placeholder="Name registered on Paytm"
                    />
                  </div>
                </>
              )}

              {/* ──────────────────────────────────────────────────
                  MODE D: GOOGLE PAY FIELDS
                  ────────────────────────────────────────────────── */}
              {method === 'gpay' && (
                <>
                  <div className="field">
                    <label>
                      GPay Mobile Number / UPI ID <span className="sig-req">*</span>
                    </label>
                    <input
                      value={wdForm.phone || wdForm.upiId || upiPhone}
                      onChange={(e) => {
                        const val = e.target.value;
                        setWdForm((prev) => ({
                          ...prev,
                          phone: val,
                          upiId: val.includes('@') ? val : '',
                        }));
                        setUpiPhone(val);
                      }}
                      placeholder="e.g. 9876543210 or yourname@oksbi"
                      required
                    />
                    <small className="muted-sm">Google Pay linked phone number or @okhdfcbank / @oksbi handle.</small>
                  </div>

                  <div className="field">
                    <label>Google Pay Registered Name</label>
                    <input
                      value={wdForm.accountTitle}
                      onChange={setWd('accountTitle')}
                      placeholder="Name registered on Google Pay"
                    />
                  </div>
                </>
              )}

              {/* ──────────────────────────────────────────────────
                  MODE E: PHONEPE FIELDS
                  ────────────────────────────────────────────────── */}
              {method === 'phonepe' && (
                <>
                  <div className="field">
                    <label>
                      PhonePe Mobile Number / UPI ID <span className="sig-req">*</span>
                    </label>
                    <input
                      value={wdForm.phone || wdForm.upiId || upiPhone}
                      onChange={(e) => {
                        const val = e.target.value;
                        setWdForm((prev) => ({
                          ...prev,
                          phone: val,
                          upiId: val.includes('@') ? val : '',
                        }));
                        setUpiPhone(val);
                      }}
                      placeholder="e.g. 9876543210 or yourname@ybl"
                      required
                    />
                    <small className="muted-sm">PhonePe linked phone number or @ybl / @ibl UPI handle.</small>
                  </div>

                  <div className="field">
                    <label>PhonePe Registered Full Name</label>
                    <input
                      value={wdForm.accountTitle}
                      onChange={setWd('accountTitle')}
                      placeholder="Name registered on PhonePe"
                    />
                  </div>
                </>
              )}

              {/* ──────────────────────────────────────────────────
                  MODE F: USDT CRYPTO FIELDS
                  ────────────────────────────────────────────────── */}
              {method === 'usdt' && (
                <>
                  <div className="field">
                    <label>
                      USDT Receiving Wallet Address <span className="sig-req">*</span>
                    </label>
                    <input
                      value={wdForm.walletAddress}
                      onChange={(e) => setWdForm((prev) => ({ ...prev, walletAddress: e.target.value }))}
                      placeholder="e.g. Txxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      required
                    />
                    <small className="muted-sm">Make sure this address matches the selected blockchain network.</small>
                  </div>

                  <div className="field">
                    <label>Blockchain Network <span className="sig-req">*</span></label>
                    <select
                      value={usdtNetwork}
                      onChange={(e) => {
                        setUsdtNetwork(e.target.value);
                        setWdForm((prev) => ({ ...prev, network: e.target.value }));
                      }}
                      className="sig-select"
                      required
                    >
                      <option value="TRC-20">TRON (TRC-20) — Recommended (Fastest &amp; Low Gas)</option>
                      <option value="BEP-20">BNB Smart Chain (BEP-20)</option>
                      <option value="ERC-20">Ethereum (ERC-20)</option>
                    </select>
                  </div>
                </>
              )}

              {/* Inline Alert Feedback inside Withdrawal Card */}
              {err && (
                <div className="field field-full">
                  <div style={{ background: '#fef2f2', border: '1.5px solid #f87171', borderRadius: 8, padding: '12px 16px', color: '#991b1b', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18 }}>⚠️</span>
                    <div>
                      <b>Withdrawal Request Error:</b>
                      <div style={{ marginTop: 2 }}>{err}</div>
                    </div>
                  </div>
                </div>
              )}
              {msg && (
                <div className="field field-full">
                  <div style={{ background: '#ecfdf5', border: '1.5px solid #34d399', borderRadius: 8, padding: '12px 16px', color: '#065f46', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18 }}>✅</span>
                    <div>
                      <b>Success:</b>
                      <div style={{ marginTop: 2 }}>{msg}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Submit Button & Validations */}
              <div className="field field-full">
                <button
                  type="submit"
                  className="seller-btn-pri"
                  disabled={
                    submitting ||
                    bal < 1 ||
                    !wdForm.amount ||
                    Number(wdForm.amount) > bal ||
                    Number(wdForm.amount) > (withdrawalLimit?.maxAmount || 500)
                  }
                >
                  {submitting ? (
                    'Submitting Withdrawal Request...'
                  ) : (
                    <>
                      <Ic name="send" size={16} />
                      <span>
                        💸 Submit Payout via{' '}
                        {method === 'bank'
                          ? '🏦 Indian Bank Transfer'
                          : method === 'upi'
                          ? '⚡ UPI Instant VPA'
                          : method === 'paytm'
                          ? '📱 Paytm Wallet'
                          : method === 'gpay'
                          ? '🔵 Google Pay'
                          : method === 'phonepe'
                          ? '🟣 PhonePe'
                          : '💎 USDT Crypto'}{' '}
                        (${Number(wdForm.amount || 0).toFixed(2)} USD)
                      </span>
                    </>
                  )}
                </button>
                {bal < 1 && <small className="muted-sm mt-1 block">Insufficient available balance to withdraw.</small>}
                {Number(wdForm.amount) > (withdrawalLimit?.maxAmount || 500) && (
                  <small className="muted-sm mt-1 block" style={{ color: '#dc2626', fontWeight: 700 }}>
                    ⚠️ Amount exceeds current single withdrawal limit of {formatMoney(withdrawalLimit?.maxAmount || 500)}.
                  </small>
                )}
                {Number(wdForm.amount) > bal && (
                  <small className="muted-sm mt-1 block" style={{ color: '#dc2626' }}>
                    Withdrawal amount cannot exceed available balance (${Number(bal).toFixed(2)} USD).
                  </small>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── LIMIT INCREASE APPLICATION MODAL ─── */}
      {limitModalOpen && (
        <div className="admin-modal-overlay" onClick={() => setLimitModalOpen(false)}>
          <div className="admin-modal-box" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Ic name="shield" size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>🚀 Apply for Withdrawal Limit Increase</h3>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                    Upgrade your store withdrawal tier for higher single payout volumes
                  </p>
                </div>
              </div>
              <button onClick={() => setLimitModalOpen(false)} className="btn-close-modal">✕</button>
            </div>

            <form onSubmit={handleLimitIncreaseSubmit} style={{ padding: '18px 22px' }}>
              {/* Current Status Summary */}
              <div style={{ display: 'flex', justifyContent: 'space-between', background: '#f8fafc', padding: '12px 16px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 16 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Current Single Limit</span>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>
                    {formatMoney(withdrawalLimit?.maxAmount || 500)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Tier Progress</span>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#16a34a' }}>
                    {withdrawalLimit?.successfulWithdrawalCount || 0} / {withdrawalLimit?.requiredWithdrawalsForIncrease || 10} Completed
                  </div>
                </div>
              </div>

              {/* Requested Limit Input */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 6, color: '#1e293b' }}>
                  Requested New Limit (USD $) *
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: 9, fontWeight: 800, color: '#64748b' }}>$</span>
                  <input
                    type="number"
                    min={(withdrawalLimit?.maxAmount || 500) + 1}
                    value={reqLimitAmount}
                    onChange={(e) => setReqLimitAmount(e.target.value)}
                    placeholder={`e.g. 2000 (Must be > $${withdrawalLimit?.maxAmount || 500})`}
                    style={{ width: '100%', padding: '9px 12px 9px 28px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 14, fontWeight: 700 }}
                    required
                  />
                </div>
                <small className="muted" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                  Enter your requested maximum ceiling for individual payout requests.
                </small>
              </div>

              {/* Reason / Store Performance Notes */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 6, color: '#1e293b' }}>
                  Business Justification / Reason *
                </label>
                <textarea
                  rows="3"
                  value={reqLimitReason}
                  onChange={(e) => setReqLimitReason(e.target.value)}
                  placeholder="e.g. Monthly store sales have grown significantly. Fulfilling customer orders reliably and need higher batch payout limits."
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, fontFamily: 'inherit' }}
                  required
                />
              </div>

              {/* Review Policy Notice */}
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#1e40af', lineHeight: 1.4 }}>
                  <b>💡 Upgrade Process:</b> Platform administration will review your store metrics and send an Official Offer Slip with tailored limits and fee terms for your final confirmation.
                </div>
              </div>

              <div className="modal-bottom-actions">
                <button type="button" onClick={() => setLimitModalOpen(false)} className="btn-cancel">Cancel</button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submittingLimitReq || !reqLimitAmount || Number(reqLimitAmount) <= (withdrawalLimit?.maxAmount || 500)}
                >
                  {submittingLimitReq ? 'Submitting Application...' : '🚀 Submit Upgrade Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── REQUEST SUCCESS CONFIRMATION MODAL ─── */}
      {requestSuccessModal && (
        <div className="admin-modal-overlay" onClick={() => setRequestSuccessModal(null)}>
          <div className="admin-modal-box" style={{ maxWidth: 520, textAlign: 'center', padding: '30px 24px', borderRadius: 16 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: requestSuccessModal.type === 'deposit' ? '#ecfdf5' : '#eff6ff', color: requestSuccessModal.type === 'deposit' ? '#16a34a' : '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 34, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.08)' }}>
              {requestSuccessModal.type === 'deposit' ? '💰' : '💸'}
            </div>

            <h3 style={{ margin: '0 0 6px', fontSize: 20, color: '#0f172a', fontWeight: 800 }}>
              {requestSuccessModal.title}
            </h3>
            <p style={{ color: '#64748b', fontSize: 13.5, margin: '0 0 18px', lineHeight: 1.5 }}>
              {requestSuccessModal.message}
            </p>

            {/* Summary Slip */}
            <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '16px 18px', textAlign: 'left', marginBottom: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderBottom: '1px dashed #cbd5e1', paddingBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Amount Requested</span>
                <span style={{ fontSize: 18, fontWeight: 900, color: requestSuccessModal.type === 'deposit' ? '#16a34a' : '#2563eb' }}>
                  ${Number(requestSuccessModal.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                </span>
              </div>

              {requestSuccessModal.ref && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: '#64748b', fontWeight: 600 }}>Payment Ref / UTR:</span>
                  <b style={{ color: '#0f172a', fontFamily: 'monospace', background: '#e2e8f0', padding: '2px 6px', borderRadius: 4 }}>{requestSuccessModal.ref}</b>
                </div>
              )}

              {requestSuccessModal.method && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: '#64748b', fontWeight: 600 }}>Payment Method:</span>
                  <b style={{ color: '#0f172a', textTransform: 'uppercase' }}>{requestSuccessModal.method}</b>
                </div>
              )}

              {requestSuccessModal.from && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: '#64748b', fontWeight: 600 }}>Sender Info:</span>
                  <b style={{ color: '#0f172a' }}>{requestSuccessModal.from}</b>
                </div>
              )}

              {requestSuccessModal.account && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: '#64748b', fontWeight: 600 }}>Account / Destination:</span>
                  <b style={{ color: '#0f172a' }}>{requestSuccessModal.account}</b>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
                <span style={{ color: '#64748b', fontWeight: 600, fontSize: 13 }}>Status:</span>
                <span className="chip-orange" style={{ fontWeight: 800, padding: '4px 10px', borderRadius: 20, fontSize: 11.5 }}>
                  ⏳ PENDING ADMIN APPROVAL
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  setRequestSuccessModal(null);
                  handleTabChange('ledger');
                }}
                className="btn-primary"
                style={{ padding: '11px 22px', fontWeight: 800, fontSize: 13.5 }}
              >
                📋 View in Financial Ledger
              </button>
              <button
                type="button"
                onClick={() => setRequestSuccessModal(null)}
                className="btn-cancel"
                style={{ padding: '11px 18px', fontWeight: 700 }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
