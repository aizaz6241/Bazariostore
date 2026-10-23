import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, Link, useOutletContext } from 'react-router-dom';
import { sapi, fmtDate } from '../api.js';
import Ic from '../components/Icons.jsx';
import CurrencySelector from '../components/CurrencySelector.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';
import { getSocket } from '../socket.js';
import { playNotificationSound } from '../utils/audio.js';
import WalletInsights from './wallet/WalletInsights.jsx';
import { usd, DEFAULT_LIMIT, describeLine, STATUS_LABEL } from './wallet/walletUtils.js';

const INDIAN_BANKS = [
  'State Bank of India (SBI)', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Punjab National Bank (PNB)', 'Kotak Mahindra Bank',
  'Bank of Baroda', 'Canara Bank', 'Union Bank of India', 'IndusInd Bank', 'IDFC FIRST Bank', 'Yes Bank', 'Federal Bank',
  'Bank of India', 'Central Bank of India', 'Indian Bank', 'UCO Bank', 'Indian Overseas Bank', 'Standard Chartered Bank', 'Other / Custom Bank',
];

const PAYOUT_METHODS = [
  { id: 'bank', label: 'Bank transfer', sub: 'NEFT / IMPS / RTGS', saved: 'bankTransfer' },
  { id: 'upi', label: 'UPI', sub: 'Any UPI ID', saved: 'upi' },
  { id: 'paytm', label: 'Paytm', sub: 'Mobile number', saved: 'paytm' },
  { id: 'gpay', label: 'Google Pay', sub: 'Mobile or UPI', saved: 'gpay' },
  { id: 'phonepe', label: 'PhonePe', sub: 'Mobile or UPI', saved: 'phonepe' },
  { id: 'usdt', label: 'USDT', sub: 'TRC-20 / BEP-20', saved: 'usdt' },
];
const DEPOSIT_METHODS = [
  { id: 'upi', label: 'UPI / QR', sub: 'GPay, PhonePe, Paytm, BHIM' },
  { id: 'bank', label: 'Bank transfer', sub: 'IMPS / NEFT / RTGS' },
  { id: 'card', label: 'Card', sub: 'Visa, Mastercard, RuPay' },
  { id: 'other', label: 'Other / wire', sub: 'International transfer' },
];
const LEDGER_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'orders', label: 'Orders' },
  { id: 'deposits', label: 'Deposits' },
  { id: 'withdrawals', label: 'Payouts' },
  { id: 'other', label: 'Other' },
];
const EMPTY_WD = { amount: '', upiId: '', phone: '', walletAddress: '', network: 'TRC-20', accountTitle: '', accountNumber: '', bankName: 'State Bank of India (SBI)', ifscCode: '', bankBranch: '' };
const EMPTY_DEP = { amount: '', method: 'upi', depositRef: '', depositNote: '', depositedFrom: '' };

export default function SellerWallet() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { formatMoney, convert, currentCurrency, rates } = useCurrency();
  const { isFrozen: restricted } = useOutletContext() || {};

  // the cached seller record avoids a $0.00 flash while the first answer is on its way
  const [wallet, setWallet] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ng_seller') || 'null')?.wallet || null;
    } catch {
      return null;
    }
  });
  const [withdrawalLimit, setWithdrawalLimit] = useState(null);
  const [withdrawalMethods, setWithdrawalMethods] = useState({});
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [requests, setRequests] = useState([]);
  const [hasMoreLines, setHasMoreLines] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');

  const [tab, setTab] = useState(() => (['ledger', 'deposit', 'withdraw'].includes(searchParams.get('tab')) ? searchParams.get('tab') : 'ledger'));
  const [ledgerFilter, setLedgerFilter] = useState('all');
  const [ledgerQuery, setLedgerQuery] = useState('');
  const [notice, setNotice] = useState(null); // { ok, text } — one message, shown in the open form
  const [submitting, setSubmitting] = useState(false);
  const submitLockRef = useRef(false);

  const [limitModalOpen, setLimitModalOpen] = useState(false);
  const [reqLimitAmount, setReqLimitAmount] = useState('');
  const [reqLimitReason, setReqLimitReason] = useState('');
  const [submittingLimitReq, setSubmittingLimitReq] = useState(false);
  const [respondingOffer, setRespondingOffer] = useState(false);
  const [successSlip, setSuccessSlip] = useState(null);

  // forms
  // a "Deposit $X" button from support opens this page with ?amount=X: the amount is filled in
  const urlAmount = (() => {
    const n = Number(searchParams.get('amount'));
    return n > 0 && n <= 1000000 ? String(Math.round(n * 100) / 100) : '';
  })();
  const [depForm, setDepForm] = useState(() => (urlAmount ? { ...EMPTY_DEP, amount: urlAmount } : EMPTY_DEP));
  const [depInLocal, setDepInLocal] = useState(false);
  const [method, setMethod] = useState('bank');
  const [activeSavedKey, setActiveSavedKey] = useState('');
  const savedKeyRef = useRef(''); // read by load(): a live refresh must never reset a form being filled
  const [confirmAccountNumber, setConfirmAccountNumber] = useState('');
  const [accountType, setAccountType] = useState('Savings');
  const [usdtNetwork, setUsdtNetwork] = useState('TRC-20');
  const [wdForm, setWdForm] = useState(EMPTY_WD);

  useEffect(() => {
    const urlTab = searchParams.get('tab');
    if (urlTab && ['ledger', 'deposit', 'withdraw'].includes(urlTab)) setTab(urlTab);
    if (urlTab === 'deposit' && urlAmount) setDepForm((p) => ({ ...p, amount: urlAmount }));
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeTab = (next) => {
    setTab(next);
    setSearchParams({ tab: next });
    setNotice(null);
  };

  const applySavedMethod = useCallback((key, data) => {
    if (!data) return;
    savedKeyRef.current = key;
    setActiveSavedKey(key);
    if (key === 'bankTransfer') {
      setMethod('bank');
      setWdForm((p) => ({ ...p, accountTitle: data.accountTitle || '', bankName: data.bankName || 'State Bank of India (SBI)', accountNumber: data.accountNumber || '', ifscCode: data.ifscCode || '', bankBranch: data.branchName || '' }));
      setConfirmAccountNumber(data.accountNumber || '');
      setAccountType(data.accountType || 'Savings');
    } else if (key === 'upi') {
      setMethod('upi');
      setWdForm((p) => ({ ...p, upiId: data.upiId || '', accountTitle: data.holderName || '' }));
    } else if (key === 'paytm') {
      setMethod('paytm');
      setWdForm((p) => ({ ...p, phone: data.phone || '', upiId: data.phone ? `${data.phone}@paytm` : '', accountTitle: data.accountName || '' }));
    } else if (key === 'gpay') {
      setMethod('gpay');
      setWdForm((p) => ({ ...p, phone: data.phone || '', upiId: data.upiId || '', accountTitle: data.accountName || '' }));
    } else if (key === 'phonepe') {
      setMethod('phonepe');
      setWdForm((p) => ({ ...p, phone: data.phone || '', upiId: data.upiId || '', accountTitle: data.accountName || '' }));
    } else if (key === 'usdt') {
      setMethod('usdt');
      setWdForm((p) => ({ ...p, walletAddress: data.walletAddress || '', network: data.network || 'TRC-20' }));
      setUsdtNetwork(data.network || 'TRC-20');
    }
  }, []);

  const load = useCallback(() => {
    return sapi('/sellers/wallet')
      .then((res) => {
        setWallet(res.wallet);
        setWithdrawalLimit(res.withdrawalLimit);
        const wm = res.withdrawalMethods || res.seller?.withdrawalMethods || {};
        setWithdrawalMethods(wm);
        setPendingOrdersCount(res.pendingOrdersCount || 0);
        setRequests(res.requests || []);
        setHasMoreLines(Boolean(res.hasMoreLines));
        setInsights(Array.isArray(res.insights) ? res.insights : []);
        setLoadErr('');
        // pre-select the first saved payout method once (never over a method the seller picked)
        if (!savedKeyRef.current) {
          if (wm.bankTransfer?.enabled && wm.bankTransfer?.accountNumber) applySavedMethod('bankTransfer', wm.bankTransfer);
          else if (wm.upi?.enabled && wm.upi?.upiId) applySavedMethod('upi', wm.upi);
          else if (wm.paytm?.enabled && wm.paytm?.phone) applySavedMethod('paytm', wm.paytm);
          else if (wm.gpay?.enabled && (wm.gpay?.phone || wm.gpay?.upiId)) applySavedMethod('gpay', wm.gpay);
          else if (wm.phonepe?.enabled && (wm.phonepe?.phone || wm.phonepe?.upiId)) applySavedMethod('phonepe', wm.phonepe);
          else if (wm.usdt?.enabled && wm.usdt?.walletAddress) applySavedMethod('usdt', wm.usdt);
        }
      })
      .catch((e) => {
        setLoadErr(e?.message || 'Could not load your wallet');
        try {
          const cached = JSON.parse(localStorage.getItem('ng_seller') || 'null');
          if (cached?.wallet) setWallet((w) => w || cached.wallet);
        } catch {}
      })
      .finally(() => setLoading(false));
  }, [applySavedMethod]);

  useEffect(() => {
    load();
    const socket = getSocket();
    const token = localStorage.getItem('ng_seller_token');
    const sellerData = (() => { try { return JSON.parse(localStorage.getItem('ng_seller') || 'null'); } catch { return null; } })();
    // safety net: be in this store's room so wallet events arrive (the layout joins it too)
    const joinRoom = () => {
      const t = localStorage.getItem('ng_seller_token');
      if (t && t === token && sellerData?._id) socket.emit('seller:join', { token: t, sellerId: sellerData._id });
    };
    if (socket.connected) joinRoom();
    socket.on('connect', joinRoom);

    let timer = null;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(load, 500); // events come in bursts: one reload
    };
    const onWalletUpdate = (payload) => {
      if (payload && typeof payload === 'object' && !payload.notification) {
        const figures = payload.wallet && typeof payload.wallet === 'object' ? payload.wallet : payload;
        if (payload.withdrawalLimit) setWithdrawalLimit(payload.withdrawalLimit);
        const keys = ['balance', 'processingFund', 'frozenFund', 'totalDeposited', 'totalEarned', 'totalWithdrawn', 'pendingDeposit', 'pendingWithdrawal', 'totalProfitEarned'];
        const patch = {};
        for (const k of keys) if (figures[k] !== undefined) patch[k] = figures[k];
        if (Object.keys(patch).length) setWallet((w) => ({ ...(w || {}), ...patch }));
      }
      refresh();
    };
    const events = ['wallet:update', 'withdrawal:update', 'withdrawal:new', 'seller:limit_update', 'limit:update', 'seller:status_update', 'order:new', 'order:update'];
    events.forEach((e) => socket.on(e, onWalletUpdate));
    socket.on('notify', refresh);
    return () => {
      clearTimeout(timer);
      socket.off('connect', joinRoom);
      events.forEach((e) => socket.off(e, onWalletUpdate));
      socket.off('notify', refresh);
    };
  }, [load]);

  const loadMore = async () => {
    const last = requests[requests.length - 1];
    if (!last || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await sapi(`/sellers/wallet/ledger?before=${encodeURIComponent(last.createdAt)}&limit=50`);
      setRequests((prev) => {
        const seen = new Set(prev.map((r) => r._id));
        return [...prev, ...(res.lines || []).filter((r) => !seen.has(r._id))];
      });
      setHasMoreLines(Boolean(res.hasMore));
    } catch (e) {
      setNotice({ ok: false, text: e.message || 'Could not load older transactions' });
    } finally {
      setLoadingMore(false);
    }
  };

  // ── figures ──
  const bal = Number(wallet?.balance) || 0;
  const processingFund = Number(wallet?.processingFund) || 0;
  const frozenFund = Number(wallet?.frozenFund) || 0;
  const pendingWithdrawal = Number(wallet?.pendingWithdrawal) || 0;
  const pendingDeposit = Number(wallet?.pendingDeposit) || 0;
  const securityDeposit = Number(wallet?.securityDeposit) || 0;
  const totalProfitEarned = Number(wallet?.totalProfitEarned) || 0;
  const totalWithdrawn = Number(wallet?.totalWithdrawn) || 0;
  const totalDeposited = Number(wallet?.totalDeposited) || 0;
  const totalEarned = Number(wallet?.totalEarned) || 0;
  const limit = { ...DEFAULT_LIMIT, ...(withdrawalLimit || {}) };
  const maxLimit = Number(limit.maxAmount ?? 500);
  const minLimit = Number(limit.minAmount ?? 10);
  const openWithdrawal = requests.find((r) => r.type === 'withdrawal' && (r.status === 'pending' || r.status === 'processing'));
  const openDeposit = requests.find((r) => r.type === 'deposit' && (r.status === 'pending' || r.status === 'processing'));
  const parts = [
    { key: 'Available', v: bal, c: '#10b981' },
    { key: 'Locked in orders', v: processingFund, c: '#3b82f6' },
    { key: 'Payout in progress', v: pendingWithdrawal, c: '#8b5cf6' },
    { key: 'Frozen', v: frozenFund, c: '#94a3b8' },
  ];
  const partsTotal = parts.reduce((a, p) => a + Math.max(0, p.v), 0);

  const ledger = useMemo(() => {
    const q = ledgerQuery.trim().toLowerCase();
    return requests.filter((r) => {
      const t = String(r.type || '');
      if (ledgerFilter === 'orders' && !t.startsWith('order_')) return false;
      if (ledgerFilter === 'deposits' && t !== 'deposit') return false;
      if (ledgerFilter === 'withdrawals' && t !== 'withdrawal') return false;
      if (ledgerFilter === 'other' && (t.startsWith('order_') || t === 'deposit' || t === 'withdrawal')) return false;
      if (!q) return true;
      return [r.orderNumber, r.depositRef, r.transactionRef, describeLine(r).label].some((x) => String(x || '').toLowerCase().includes(q));
    });
  }, [requests, ledgerFilter, ledgerQuery]);
  const filterCount = (id) => requests.filter((r) => {
    const t = String(r.type || '');
    if (id === 'all') return true;
    if (id === 'orders') return t.startsWith('order_');
    if (id === 'deposits') return t === 'deposit';
    if (id === 'withdrawals') return t === 'withdrawal';
    return !(t.startsWith('order_') || t === 'deposit' || t === 'withdrawal');
  }).length;

  // ── actions ──
  const setDep = (k) => (e) => setDepForm((f) => ({ ...f, [k]: e.target.value }));
  const setWd = (k) => (e) => setWdForm((f) => ({ ...f, [k]: e.target.value }));
  const fail = (text) => setNotice({ ok: false, text });

  const handleDeposit = async (e) => {
    e.preventDefault();
    if (submitLockRef.current) return;
    setNotice(null);
    const amt = Number(depForm.amount);
    if (!amt || Number.isNaN(amt) || amt < 1) return fail('Enter a deposit amount of at least $1.00.');
    if (!depForm.depositRef.trim()) return fail('Enter the payment UTR / transaction reference so the team can find your payment.');
    if (openDeposit) return fail('You already have a deposit waiting for approval. Please wait until it is approved before sending another.');
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      await sapi('/sellers/wallet/deposit', {
        method: 'POST',
        body: { amount: amt, method: depForm.method || 'bank', depositRef: depForm.depositRef.trim(), depositNote: depForm.depositNote.trim(), depositedFrom: depForm.depositedFrom.trim() },
      });
      playNotificationSound('deposit');
      setSuccessSlip({ type: 'deposit', amount: amt, rows: [['Method', DEPOSIT_METHODS.find((m) => m.id === depForm.method)?.label || depForm.method], ['UTR / reference', depForm.depositRef.trim()], ...(depForm.depositedFrom.trim() ? [['Sent from', depForm.depositedFrom.trim()]] : [])] });
      setDepForm(EMPTY_DEP);
      load();
    } catch (err) {
      fail(err.message || 'Could not send the deposit request. Check your connection and try again.');
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();
    if (submitLockRef.current) return;
    setNotice(null);
    if (pendingOrdersCount > 0) return fail(`Confirm your ${pendingOrdersCount} waiting order${pendingOrdersCount === 1 ? '' : 's'} in Orders first — payouts are paused until then.`);
    if (openWithdrawal) return fail('You already have a payout in progress. A new one can be requested once it is done.');
    const amt = Number(wdForm.amount);
    // limits are in US dollars, like the amount field
    if (!amt || Number.isNaN(amt) || amt < minLimit) return fail(`The minimum payout is ${usd(minLimit)}.`);
    if (amt > maxLimit) return fail(`${usd(amt)} is above your payout limit of ${usd(maxLimit)} per request.`);
    if (amt > bal) return fail(`Not enough available balance — you have ${usd(bal)}.`);
    if (method === 'bank') {
      if (!wdForm.accountTitle || !wdForm.accountNumber || !wdForm.bankName) return fail('Fill in the account holder name, bank and account number.');
      if (confirmAccountNumber !== wdForm.accountNumber) return fail('The two account numbers do not match.');
      if (wdForm.ifscCode && wdForm.ifscCode.trim().length !== 11) return fail('The IFSC code has 11 characters (e.g. SBIN0001234).');
    } else if (method === 'upi') {
      if (!wdForm.upiId.includes('@')) return fail('Enter a valid UPI ID (e.g. name@okhdfcbank).');
      if (!wdForm.accountTitle) return fail('Enter the name registered on the UPI account.');
    } else if (['paytm', 'gpay', 'phonepe'].includes(method)) {
      if (!wdForm.phone && !wdForm.upiId) return fail('Enter the registered mobile number or UPI ID.');
    } else if (method === 'usdt') {
      if (!wdForm.walletAddress.trim()) return fail('Enter your USDT wallet address.');
    }
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      await sapi('/sellers/wallet/withdraw', {
        method: 'POST',
        body: {
          amount: amt,
          method,
          upiId: wdForm.upiId.trim(),
          phone: wdForm.phone.trim(),
          walletAddress: wdForm.walletAddress.trim(),
          network: (usdtNetwork || wdForm.network || 'TRC-20').trim(),
          accountTitle: wdForm.accountTitle.trim(),
          accountNumber: method === 'bank' ? wdForm.accountNumber.trim() : '',
          bankName: method === 'bank' ? wdForm.bankName.trim() : '',
          ifscCode: method === 'bank' ? wdForm.ifscCode.trim().toUpperCase() : '',
          branchName: method === 'bank' ? wdForm.bankBranch.trim() : '',
          accountType: method === 'bank' ? accountType : '',
          upiPhone: wdForm.phone.trim(),
        },
      });
      playNotificationSound('withdrawal');
      const dest = method === 'bank' ? `${wdForm.bankName} ·••• ${String(wdForm.accountNumber).slice(-4)}` : method === 'usdt' ? `${wdForm.walletAddress.slice(0, 6)}…${wdForm.walletAddress.slice(-4)} (${usdtNetwork})` : wdForm.upiId || wdForm.phone;
      setSuccessSlip({ type: 'withdrawal', amount: amt, rows: [['Method', PAYOUT_METHODS.find((m) => m.id === method)?.label || method], ['To', dest]] });
      setWdForm((p) => ({ ...p, amount: '' }));
      load();
    } catch (err) {
      fail(err.message || 'Could not send the payout request.');
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  const handleLimitIncreaseSubmit = async (e) => {
    e.preventDefault();
    const amt = Number(reqLimitAmount);
    if (!amt || amt <= maxLimit) return fail(`The new limit must be above your current ${usd(maxLimit)}.`);
    setSubmittingLimitReq(true);
    try {
      await sapi('/sellers/wallet/limit-increase-request', { method: 'POST', body: { requestedLimit: amt, reason: reqLimitReason.trim() } });
      setNotice({ ok: true, text: 'Limit increase request sent. The team will review it and send you an offer.' });
      setLimitModalOpen(false);
      setReqLimitAmount('');
      setReqLimitReason('');
      load();
    } catch (err) {
      fail(err.message);
      setLimitModalOpen(false);
    } finally {
      setSubmittingLimitReq(false);
    }
  };

  const handleLimitOfferResponse = async (action) => {
    setNotice(null);
    setRespondingOffer(true);
    try {
      const res = await sapi('/sellers/wallet/limit-offer-response', { method: 'POST', body: { action } });
      if (res?.withdrawalLimit) setWithdrawalLimit(res.withdrawalLimit);
      setNotice({ ok: true, text: res?.message || (action === 'accept' ? 'Offer accepted.' : 'Offer declined.') });
      load();
    } catch (err) {
      fail(err.message || 'Could not answer the offer');
    } finally {
      setRespondingOffer(false);
    }
  };

  if (loading && !wallet) {
    return (
      <div className="wl">
        <div className="wl-skel" style={{ height: 80 }} />
        <div className="wl-top"><div className="wl-skel" style={{ height: 220 }} /><div className="wl-skel" style={{ height: 220 }} /></div>
      </div>
    );
  }

  const NoticeBox = notice ? (
    <div className={`wl-notice ${notice.ok ? 'ok' : 'err'}`} role="status">
      <Ic name={notice.ok ? 'checkCircle' : 'alert'} size={17} />
      <span>{notice.text}</span>
      <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss"><Ic name="x" size={14} /></button>
    </div>
  ) : null;

  return (
    <div className="wl">
      {/* ── Header ── */}
      <header className="wl-head">
        <div>
          <p className="wl-eyebrow">Finance</p>
          <h1>My Wallet</h1>
          <p className="wl-head-sub">Amounts are kept in US dollars and shown in {currentCurrency.code}.</p>
        </div>
        <div className="wl-head-actions">
          <CurrencySelector compact />
          <button type="button" className="wl-btn wl-btn-ghost" onClick={() => changeTab('deposit')}><Ic name="plus" size={15} /> Deposit</button>
          <button type="button" className="wl-btn wl-btn-dark" onClick={() => changeTab('withdraw')}><Ic name="send" size={15} /> Withdraw</button>
        </div>
      </header>

      {loadErr && (
        <div className="wl-banner tone-red">
          <Ic name="alert" size={18} />
          <div><b>Wallet could not refresh</b><p>{loadErr} — showing the last known figures.</p></div>
          <button type="button" className="wl-btn wl-btn-ghost sm" onClick={load}>Retry</button>
        </div>
      )}

      {/* ── Balance + lifetime ── */}
      <div className="wl-top">
        <section className="wl-balance">
          <div className="wl-bal-row">
            <div>
              <span className="wl-bal-lbl">Available balance</span>
              <b className="wl-bal-val">{formatMoney(bal)}</b>
              {currentCurrency.code !== 'USD' && <span className="wl-bal-usd">{usd(bal)}</span>}
            </div>
            <span className="wl-bal-icon"><Ic name="wallet" size={22} /></span>
          </div>
          <div className="wl-stack" role="img" aria-label="Wallet breakdown">
            {partsTotal > 0 ? parts.filter((p) => p.v > 0).map((p) => <span key={p.key} style={{ flexGrow: p.v, background: p.c }} title={`${p.key}: ${formatMoney(p.v)}`} />) : <span style={{ flexGrow: 1, background: 'rgba(255,255,255,0.12)' }} />}
          </div>
          <ul className="wl-parts">
            {parts.map((p) => (
              <li key={p.key} className={p.v > 0 ? '' : 'zero'}><i style={{ background: p.c }} /><span>{p.key}</span><b>{formatMoney(p.v)}</b></li>
            ))}
            {securityDeposit > 0 && <li className="sep"><i className="ring" /><span>Security deposit</span><b>{formatMoney(securityDeposit)}</b></li>}
          </ul>
          <div className="wl-bal-actions">
            <button type="button" className="wl-btn wl-btn-light" onClick={() => changeTab('withdraw')} disabled={restricted}><Ic name="send" size={15} /> Withdraw</button>
            <button type="button" className="wl-btn wl-btn-glass" onClick={() => changeTab('deposit')}><Ic name="plus" size={15} /> Add funds</button>
          </div>
        </section>

        <section className="wl-life">
          <div className="wl-life-grid">
            <div><span><i className="dot green" />Profit earned</span><b className="t-green">+{formatMoney(totalProfitEarned)}</b><small>Lifetime order profit</small></div>
            <div><span><i className="dot blue" />Total deposited</span><b>{formatMoney(totalDeposited)}</b><small>{pendingDeposit > 0 ? `${formatMoney(pendingDeposit)} waiting approval` : 'Approved deposits'}</small></div>
            <div><span><i className="dot violet" />Total withdrawn</span><b>{formatMoney(totalWithdrawn)}</b><small>{pendingWithdrawal > 0 ? `${formatMoney(pendingWithdrawal)} in progress` : 'Paid out to you'}</small></div>
            <div><span><i className="dot slate" />Order payouts</span><b>{formatMoney(totalEarned)}</b><small>Order amount + profit released</small></div>
          </div>
          <LimitMini limit={limit} onApply={() => setLimitModalOpen(true)} onOpen={() => changeTab('withdraw')} />
        </section>
      </div>

      {/* ── Things in progress ── */}
      {(pendingOrdersCount > 0 || openWithdrawal || openDeposit || restricted) && (
        <div className="wl-alerts">
          {pendingOrdersCount > 0 && (
            <Link to="/seller/orders" className="wl-alert tone-red">
              <Ic name="alert" size={16} /><span><b>Payouts paused</b> — {pendingOrdersCount} order{pendingOrdersCount === 1 ? '' : 's'} waiting for your confirmation</span><em>Confirm →</em>
            </Link>
          )}
          {openWithdrawal && (
            <div className="wl-alert tone-violet"><Ic name="clock" size={16} /><span><b>Payout of {formatMoney(Math.abs(openWithdrawal.amount))}</b> in progress · requested {fmtDate(openWithdrawal.createdAt)}</span></div>
          )}
          {openDeposit && (
            <div className="wl-alert tone-blue"><Ic name="clock" size={16} /><span><b>Deposit of {formatMoney(openDeposit.amount)}</b> waiting for approval · ref {openDeposit.depositRef || '—'}</span></div>
          )}
          {restricted && (
            <Link to="/seller/support" className="wl-alert tone-slate"><Ic name="lock" size={16} /><span><b>Store frozen</b> — payouts are paused; you can still deposit to confirm orders</span><em>Support →</em></Link>
          )}
        </div>
      )}

      {/* ── Charts ── */}
      <WalletInsights insights={insights} formatMoney={formatMoney} convert={convert} symbol={currentCurrency.symbol} />

      {/* ── Tabs ── */}
      <div className="wl-tabs" role="tablist" aria-label="Wallet sections">
        {[
          { id: 'ledger', label: 'Transactions', icon: 'list' },
          { id: 'deposit', label: 'Add funds', icon: 'plus' },
          { id: 'withdraw', label: 'Withdraw', icon: 'send' },
        ].map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => changeTab(t.id)}>
            <Ic name={t.icon} size={15} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── Transactions ── */}
      {tab === 'ledger' && (
        <section className="wl-card wl-ledger">
          {NoticeBox}
          <div className="wl-ledger-bar">
            <div className="wl-chips">
              {LEDGER_FILTERS.map((f) => (
                <button key={f.id} type="button" className={ledgerFilter === f.id ? 'on' : ''} onClick={() => setLedgerFilter(f.id)}>
                  {f.label} <span>{filterCount(f.id)}</span>
                </button>
              ))}
            </div>
            <label className="wl-search">
              <Ic name="search" size={15} />
              <input type="search" value={ledgerQuery} onChange={(e) => setLedgerQuery(e.target.value)} placeholder="Order #, UTR or type" aria-label="Search transactions" />
            </label>
          </div>

          {ledger.length === 0 ? (
            <div className="wl-empty-box"><Ic name="fileText" size={20} /><b>No transactions here</b><p>{ledgerQuery ? 'Try a different search.' : 'Deposits, order payouts and withdrawals will show up here.'}</p></div>
          ) : (
            <ul className="wl-lines">
              {ledger.map((r) => <LedgerRow key={r._id} r={r} formatMoney={formatMoney} />)}
            </ul>
          )}
          {hasMoreLines && ledgerFilter === 'all' && !ledgerQuery && (
            <div className="wl-more"><button type="button" className="wl-btn wl-btn-ghost" onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load older transactions'}</button></div>
          )}
          {hasMoreLines && (ledgerFilter !== 'all' || ledgerQuery) && <p className="wl-fine center">Showing your latest transactions. Clear the filter to load older ones.</p>}
        </section>
      )}

      {/* ── Add funds ── */}
      {tab === 'deposit' && (
        <div className="wl-form-grid">
          <section className="wl-card">
            <div className="wl-card-head"><div><h3>Add funds</h3><p className="wl-sub">Send the money, then tell us the payment reference. The team verifies it and credits your balance.</p></div></div>
            {restricted && <div className="wl-callout tone-blue"><Ic name="lock" size={16} /><p>Your store is frozen — deposit to confirm your waiting orders. Delivered payouts stay in your Frozen amount until it is lifted.</p></div>}
            {openDeposit && <div className="wl-callout tone-amber"><Ic name="clock" size={16} /><p>Your deposit of <b>{formatMoney(openDeposit.amount)}</b> is still waiting for approval. A new deposit can be sent once it is approved.</p></div>}
            <form onSubmit={handleDeposit} className="wl-form">
              <AmountField
                label="Amount"
                value={depForm.amount}
                onChange={(v) => setDepForm((p) => ({ ...p, amount: v }))}
                local={depInLocal}
                onToggleLocal={() => setDepInLocal((x) => !x)}
                rates={rates}
                presets={[50, 100, 250, 500, 1000]}
              />
              <div className="wl-field">
                <span className="wl-label">How did you pay?</span>
                <div className="wl-options cols-4">
                  {DEPOSIT_METHODS.map((m) => (
                    <button key={m.id} type="button" className={depForm.method === m.id ? 'on' : ''} onClick={() => setDepForm((p) => ({ ...p, method: m.id }))}>
                      <b>{m.label}</b><small>{m.sub}</small>
                    </button>
                  ))}
                </div>
              </div>
              <div className="wl-row-2">
                <label className="wl-field">
                  <span className="wl-label">UTR / transaction reference <em>*</em></span>
                  <input className="wl-input" value={depForm.depositRef} onChange={setDep('depositRef')} placeholder="e.g. 12-digit UTR number" required />
                </label>
                <label className="wl-field">
                  <span className="wl-label">{depForm.method === 'upi' ? 'Paid from UPI ID / mobile' : depForm.method === 'bank' ? 'Paid from bank & account name' : 'Paid from (name)'}</span>
                  <input className="wl-input" value={depForm.depositedFrom} onChange={setDep('depositedFrom')} placeholder={depForm.method === 'upi' ? 'name@okhdfcbank / 9876543210' : 'Account / card holder name'} />
                </label>
              </div>
              <label className="wl-field">
                <span className="wl-label">Note for the team <small>(optional)</small></span>
                <input className="wl-input" value={depForm.depositNote} onChange={setDep('depositNote')} placeholder="Anything that helps us match your payment" />
              </label>
              {NoticeBox}
              <button type="submit" className="wl-btn wl-btn-primary lg" disabled={submitting || Boolean(openDeposit) || !(Number(depForm.amount) >= 1)}>
                {submitting ? 'Sending…' : Number(depForm.amount) >= 1 ? `Send deposit request · ${usd(depForm.amount)}` : 'Enter an amount'}
              </button>
            </form>
          </section>
          <aside className="wl-card wl-side">
            <h3>How it works</h3>
            <ol className="wl-steps">
              <li><b>Pay</b><span>Send the amount by UPI, bank transfer or card.</span></li>
              <li><b>Send the reference</b><span>Enter the UTR / transaction ID here and submit.</span></li>
              <li><b>Get credited</b><span>Once the team verifies the payment, it is added to your available balance.</span></li>
            </ol>
            <RecentList title="Recent deposits" rows={requests.filter((r) => r.type === 'deposit').slice(0, 4)} formatMoney={formatMoney} />
          </aside>
        </div>
      )}

      {/* ── Withdraw ── */}
      {tab === 'withdraw' && restricted && (
        <div className="wl-banner tone-slate">
          <Ic name="lock" size={18} />
          <div><b>Withdrawals are paused while your store is frozen</b><p>Please contact support to resolve it.</p></div>
          <Link to="/seller/support" className="wl-btn wl-btn-ghost sm">Contact support</Link>
        </div>
      )}
      {tab === 'withdraw' && !restricted && (
        <div className="wl-form-grid">
          <section className="wl-card">
            <div className="wl-card-head">
              <div><h3>Withdraw</h3><p className="wl-sub">Payouts are sent from your available balance to your bank, UPI or USDT wallet.</p></div>
              <span className="wl-pill">Limit {usd(maxLimit)} / request</span>
            </div>

            {pendingOrdersCount > 0 && (
              <div className="wl-callout tone-red"><Ic name="alert" size={16} /><p><b>Payouts are paused</b> — confirm your {pendingOrdersCount} waiting order{pendingOrdersCount === 1 ? '' : 's'} first. <Link to="/seller/orders">Go to Orders →</Link></p></div>
            )}
            {openWithdrawal && (
              <div className="wl-callout tone-violet"><Ic name="clock" size={16} /><p>Your payout of <b>{formatMoney(Math.abs(openWithdrawal.amount))}</b> is in progress. You can request the next one once it is done.</p></div>
            )}

            <SavedMethods wm={withdrawalMethods} activeKey={activeSavedKey} method={method} onPick={applySavedMethod} />

            <form onSubmit={handleWithdraw} className="wl-form">
              <AmountField
                label="Amount"
                value={wdForm.amount}
                onChange={(v) => setWdForm((p) => ({ ...p, amount: v }))}
                local={false}
                rates={rates}
                max={Math.min(bal, maxLimit)}
                presetsPct
              />

              <div className="wl-field">
                <span className="wl-label">Send to</span>
                <div className="wl-options cols-3">
                  {PAYOUT_METHODS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={method === m.id ? 'on' : ''}
                      onClick={() => {
                        setMethod(m.id);
                        const saved = withdrawalMethods?.[m.saved];
                        if (saved?.enabled) applySavedMethod(m.saved, saved);
                        else {
                          savedKeyRef.current = 'manual';
                          setActiveSavedKey('');
                        }
                      }}
                    >
                      <b>{m.label}</b><small>{m.sub}</small>
                    </button>
                  ))}
                </div>
              </div>

              {method === 'bank' && (
                <>
                  <div className="wl-row-2">
                    <label className="wl-field"><span className="wl-label">Account holder name <em>*</em></span><input className="wl-input" value={wdForm.accountTitle} onChange={setWd('accountTitle')} placeholder="As printed in the passbook" required /></label>
                    <label className="wl-field"><span className="wl-label">Bank <em>*</em></span>
                      <select className="wl-input" value={wdForm.bankName} onChange={setWd('bankName')} required>{INDIAN_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}</select>
                    </label>
                  </div>
                  <div className="wl-row-2">
                    <label className="wl-field"><span className="wl-label">Account number <em>*</em></span><input className="wl-input mono" inputMode="numeric" value={wdForm.accountNumber} onChange={setWd('accountNumber')} placeholder="9–18 digits" required /></label>
                    <label className="wl-field"><span className="wl-label">Confirm account number <em>*</em></span>
                      <input className={`wl-input mono ${confirmAccountNumber && confirmAccountNumber !== wdForm.accountNumber ? 'bad' : ''}`} inputMode="numeric" value={confirmAccountNumber} onChange={(e) => setConfirmAccountNumber(e.target.value)} placeholder="Type it again" required />
                      {confirmAccountNumber && <small className={confirmAccountNumber === wdForm.accountNumber ? 't-green' : 't-red'}>{confirmAccountNumber === wdForm.accountNumber ? '✓ Numbers match' : 'Numbers do not match'}</small>}
                    </label>
                  </div>
                  <div className="wl-row-2">
                    <label className="wl-field"><span className="wl-label">IFSC code <em>*</em></span><input className="wl-input mono upper" value={wdForm.ifscCode} onChange={setWd('ifscCode')} placeholder="SBIN0001234" maxLength={11} required /></label>
                    <label className="wl-field"><span className="wl-label">Account type</span>
                      <select className="wl-input" value={accountType} onChange={(e) => setAccountType(e.target.value)}><option value="Savings">Savings</option><option value="Current">Current / business</option></select>
                    </label>
                  </div>
                </>
              )}
              {method === 'upi' && (
                <div className="wl-row-2">
                  <label className="wl-field"><span className="wl-label">UPI ID <em>*</em></span><input className="wl-input" value={wdForm.upiId} onChange={setWd('upiId')} placeholder="name@okhdfcbank" required /></label>
                  <label className="wl-field"><span className="wl-label">Name on the UPI account <em>*</em></span><input className="wl-input" value={wdForm.accountTitle} onChange={setWd('accountTitle')} placeholder="Registered name" required /></label>
                </div>
              )}
              {['paytm', 'gpay', 'phonepe'].includes(method) && (
                <div className="wl-row-2">
                  <label className="wl-field"><span className="wl-label">{method === 'paytm' ? 'Paytm mobile number' : 'Mobile number or UPI ID'} <em>*</em></span>
                    <input
                      className="wl-input"
                      value={wdForm.upiId && wdForm.upiId.includes('@') && method !== 'paytm' ? wdForm.upiId : wdForm.phone}
                      onChange={(e) => {
                        const v = e.target.value;
                        setWdForm((p) => (method !== 'paytm' && v.includes('@') ? { ...p, upiId: v, phone: '' } : { ...p, phone: v, upiId: method === 'paytm' && v ? `${v}@paytm` : '' }));
                      }}
                      placeholder={method === 'paytm' ? '9876543210' : '9876543210 or name@ybl'}
                      required
                    />
                  </label>
                  <label className="wl-field"><span className="wl-label">Registered name</span><input className="wl-input" value={wdForm.accountTitle} onChange={setWd('accountTitle')} placeholder="Name on the account" /></label>
                </div>
              )}
              {method === 'usdt' && (
                <div className="wl-row-2">
                  <label className="wl-field"><span className="wl-label">USDT wallet address <em>*</em></span><input className="wl-input mono" value={wdForm.walletAddress} onChange={setWd('walletAddress')} placeholder="T… / 0x…" required /></label>
                  <label className="wl-field"><span className="wl-label">Network <em>*</em></span>
                    <select className="wl-input" value={usdtNetwork} onChange={(e) => { setUsdtNetwork(e.target.value); setWdForm((p) => ({ ...p, network: e.target.value })); }}>
                      <option value="TRC-20">TRON (TRC-20) — recommended</option>
                      <option value="BEP-20">BNB Smart Chain (BEP-20)</option>
                      <option value="ERC-20">Ethereum (ERC-20)</option>
                    </select>
                  </label>
                </div>
              )}

              {NoticeBox}

              <div className="wl-summary">
                <div><span>Withdraw</span><b>{usd(wdForm.amount)}</b></div>
                <div><span>Balance after</span><b className={Number(wdForm.amount) > bal ? 't-red' : ''}>{usd(Math.max(0, bal - (Number(wdForm.amount) || 0)))}</b></div>
                {currentCurrency.code !== 'USD' && <div><span>≈ in {currentCurrency.code}</span><b>{formatMoney(Number(wdForm.amount) || 0)}</b></div>}
              </div>
              <button
                type="submit"
                className="wl-btn wl-btn-primary lg"
                disabled={submitting || pendingOrdersCount > 0 || Boolean(openWithdrawal) || !(Number(wdForm.amount) >= minLimit) || Number(wdForm.amount) > bal || Number(wdForm.amount) > maxLimit}
              >
                {submitting ? 'Sending…' : `Request payout${Number(wdForm.amount) > 0 ? ` · ${usd(wdForm.amount)}` : ''}`}
              </button>
              <p className="wl-fine">
                Min {usd(minLimit)} · max {usd(maxLimit)} per request · one payout at a time.
                {Number(wdForm.amount) > maxLimit && <span className="t-red"> Above your limit.</span>}
                {Number(wdForm.amount) > bal && <span className="t-red"> Above your available balance.</span>}
              </p>
            </form>
          </section>

          <aside className="wl-side-stack">
            <LimitCard limit={limit} formatMoney={formatMoney} responding={respondingOffer} onApply={() => setLimitModalOpen(true)} onRespond={handleLimitOfferResponse} />
            <section className="wl-card wl-side"><RecentList title="Recent payouts" rows={requests.filter((r) => r.type === 'withdrawal').slice(0, 5)} formatMoney={formatMoney} /></section>
          </aside>
        </div>
      )}

      {limitModalOpen && (
        <Modal onClose={() => !submittingLimitReq && setLimitModalOpen(false)} title="Ask for a higher payout limit">
          <form onSubmit={handleLimitIncreaseSubmit} className="wl-form">
            <div className="wl-summary">
              <div><span>Current limit</span><b>{usd(maxLimit)}</b></div>
              <div><span>Payouts done</span><b>{limit.successfulWithdrawalCount || 0} / {limit.requiredWithdrawalsForIncrease || 10}</b></div>
            </div>
            <label className="wl-field"><span className="wl-label">New limit you need (USD) <em>*</em></span>
              <div className="wl-amount"><em>$</em><input type="number" min={maxLimit + 1} value={reqLimitAmount} onChange={(e) => setReqLimitAmount(e.target.value)} placeholder={`More than ${maxLimit}`} required /></div>
            </label>
            <label className="wl-field"><span className="wl-label">Why do you need it? <em>*</em></span>
              <textarea className="wl-input" rows={3} value={reqLimitReason} onChange={(e) => setReqLimitReason(e.target.value)} placeholder="e.g. Sales have grown and I need larger payouts." required />
            </label>
            <p className="wl-fine">The team reviews your store and sends you an offer with the new limit and its fee. Nothing is charged until you accept and it is activated.</p>
            <div className="wl-modal-actions">
              <button type="button" className="wl-btn wl-btn-ghost" onClick={() => setLimitModalOpen(false)} disabled={submittingLimitReq}>Cancel</button>
              <button type="submit" className="wl-btn wl-btn-dark" disabled={submittingLimitReq || !(Number(reqLimitAmount) > maxLimit)}>{submittingLimitReq ? 'Sending…' : 'Send request'}</button>
            </div>
          </form>
        </Modal>
      )}

      {successSlip && (
        <Modal onClose={() => setSuccessSlip(null)}>
          <div className="wl-success">
            <span className={`wl-success-ico ${successSlip.type}`}><Ic name="checkCircle" size={28} /></span>
            <h3>{successSlip.type === 'deposit' ? 'Deposit request sent' : 'Payout requested'}</h3>
            <p>{successSlip.type === 'deposit' ? 'The team will verify your payment and add it to your available balance.' : 'The amount has moved out of your available balance and will be sent after the team approves it.'}</p>
            <div className="wl-slip">
              <div className="big"><span>Amount</span><b>{usd(successSlip.amount)}</b></div>
              {successSlip.rows.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
              <div><span>Status</span><span className="wl-tag tone-amber">Waiting for approval</span></div>
            </div>
            <div className="wl-modal-actions">
              <button type="button" className="wl-btn wl-btn-ghost" onClick={() => setSuccessSlip(null)}>Done</button>
              <button type="button" className="wl-btn wl-btn-dark" onClick={() => { setSuccessSlip(null); changeTab('ledger'); }}>View transactions</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ───────────────────────── pieces ───────────────────────── */

function LedgerRow({ r, formatMoney }) {
  const d = describeLine(r);
  const st = STATUS_LABEL[r.status] || { label: r.status || '—', tone: 'slate' };
  const when = new Date(r.processedAt && (r.type === 'deposit' || r.type === 'withdrawal') ? r.processedAt : r.createdAt);
  const rejected = r.status === 'rejected';
  const partial = r.type === 'withdrawal' && (r.status === 'approved' || r.status === 'completed') && r.approvedAmount != null && Math.abs(r.approvedAmount) < Math.abs(r.amount);
  const ref = r.orderNumber ? `#${r.orderNumber}` : r.depositRef ? `Ref ${r.depositRef}` : r.transactionRef ? `UTR ${r.transactionRef}` : '';
  return (
    <li className="wl-line">
      <span className={`wl-line-ico tone-${d.tone}`}><Ic name={d.icon} size={16} /></span>
      <div className="wl-line-main">
        <b>{d.label}{r.profitRate >= 35 && r.type === 'order_delivered_release' ? ' 💎' : ''}</b>
        <small>
          {when.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })} · {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {ref && <> · <span className="mono">{ref}</span></>}
        </small>
        {d.note && <small className="t-muted">{d.note}</small>}
        {r.profitAmount > 0 && r.type === 'order_delivered_release' && <small className="t-green">includes +{formatMoney(r.profitAmount)} profit ({r.profitRate}%)</small>}
        {rejected && r.adminNote && <small className="t-red">{r.adminNote}</small>}
      </div>
      <div className="wl-line-side">
        <b className={`wl-amt ${rejected ? 'void' : d.sign === '+' ? 'in' : d.sign === '−' ? 'out' : ''}`}>{d.sign}{formatMoney(d.value)}</b>
        {partial && <small className="t-green">+{formatMoney(Math.abs(r.amount) - Math.abs(r.approvedAmount))} returned</small>}
        {rejected && (r.type === 'withdrawal') && <small className="t-green">returned to balance</small>}
        <div className="wl-line-meta">
          {r.balanceAfter != null && <small>Bal. {formatMoney(r.balanceAfter)}</small>}
          {r.status !== 'completed' && <span className={`wl-tag tone-${st.tone}`}>{st.label}</span>}
        </div>
      </div>
    </li>
  );
}

function AmountField({ label, value, onChange, local, onToggleLocal, rates, presets, max, presetsPct }) {
  const rate = Number(rates?.INR) > 0 ? Number(rates.INR) : 83.5;
  const [localText, setLocalText] = useState('');
  useEffect(() => {
    if (!local) return;
    const v = Number(value);
    setLocalText(v > 0 ? String(Math.round(v * rate)) : '');
  }, [local]); // eslint-disable-line react-hooks/exhaustive-deps
  const usdNum = Number(value) || 0;
  return (
    <div className="wl-field">
      <div className="wl-label-row">
        <span className="wl-label">{label} <em>*</em></span>
        {onToggleLocal && (
          <button type="button" className="wl-link" onClick={onToggleLocal}>{local ? 'Enter in USD' : 'Enter in ₹ INR'}</button>
        )}
      </div>
      {local ? (
        <div className="wl-amount">
          <em>₹</em>
          <input
            type="number" inputMode="decimal" min="0" step="any" value={localText}
            onChange={(e) => {
              setLocalText(e.target.value);
              const n = Number(e.target.value);
              onChange(n > 0 ? (n / rate).toFixed(2) : '');
            }}
            placeholder="0"
          />
          <span className="wl-amount-conv">= {usd(usdNum)}</span>
        </div>
      ) : (
        <div className="wl-amount">
          <em>$</em>
          <input type="number" inputMode="decimal" min="0" step="0.01" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0.00" />
          {usdNum > 0 && <span className="wl-amount-conv">≈ ₹{Math.round(usdNum * rate).toLocaleString('en-IN')}</span>}
        </div>
      )}
      <div className="wl-presets">
        {presetsPct && max > 0
          ? [0.25, 0.5, 1].map((p) => (
              <button key={p} type="button" onClick={() => onChange((Math.floor(max * p * 100) / 100).toFixed(2))}>{p === 1 ? `Max ${usd(max)}` : `${p * 100}%`}</button>
            ))
          : (presets || []).map((p) => <button key={p} type="button" className={Number(value) === p ? 'on' : ''} onClick={() => onChange(String(p))}>${p.toLocaleString('en-US')}</button>)}
      </div>
    </div>
  );
}

function SavedMethods({ wm = {}, activeKey, method, onPick }) {
  const cards = [];
  if (wm.bankTransfer?.enabled && wm.bankTransfer?.accountNumber) cards.push({ key: 'bankTransfer', m: 'bank', title: wm.bankTransfer.bankName || 'Bank account', line: `•••• ${String(wm.bankTransfer.accountNumber).slice(-4)} · ${wm.bankTransfer.accountTitle || ''}`, data: wm.bankTransfer });
  if (wm.upi?.enabled && wm.upi?.upiId) cards.push({ key: 'upi', m: 'upi', title: 'UPI', line: wm.upi.upiId, data: wm.upi });
  if (wm.paytm?.enabled && wm.paytm?.phone) cards.push({ key: 'paytm', m: 'paytm', title: 'Paytm', line: wm.paytm.phone, data: wm.paytm });
  if (wm.gpay?.enabled && (wm.gpay?.phone || wm.gpay?.upiId)) cards.push({ key: 'gpay', m: 'gpay', title: 'Google Pay', line: wm.gpay.phone || wm.gpay.upiId, data: wm.gpay });
  if (wm.phonepe?.enabled && (wm.phonepe?.phone || wm.phonepe?.upiId)) cards.push({ key: 'phonepe', m: 'phonepe', title: 'PhonePe', line: wm.phonepe.phone || wm.phonepe.upiId, data: wm.phonepe });
  if (wm.usdt?.enabled && wm.usdt?.walletAddress) cards.push({ key: 'usdt', m: 'usdt', title: `USDT ${wm.usdt.network || 'TRC-20'}`, line: `${String(wm.usdt.walletAddress).slice(0, 6)}…${String(wm.usdt.walletAddress).slice(-4)}`, data: wm.usdt });

  if (!cards.length) {
    return (
      <div className="wl-callout tone-slate"><Ic name="sparkle" size={16} /><p>Save your bank, UPI or USDT details once in <Link to="/seller/settings">Store Settings</Link> and pick them here in one tap.</p></div>
    );
  }
  return (
    <div className="wl-field">
      <div className="wl-label-row"><span className="wl-label">Saved accounts</span><Link to="/seller/settings" className="wl-link">Edit</Link></div>
      <div className="wl-saved">
        {cards.map((c) => (
          <button key={c.key} type="button" className={activeKey === c.key && method === c.m ? 'on' : ''} onClick={() => onPick(c.key, c.data)}>
            <span className="wl-saved-check"><Ic name="check" size={12} /></span>
            <b>{c.title}</b>
            <small className="mono">{c.line}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function LimitMini({ limit, onApply, onOpen }) {
  const done = limit.successfulWithdrawalCount || 0;
  const need = limit.requiredWithdrawalsForIncrease || 10;
  const pct = Math.min(100, Math.round((done / (need || 1)) * 100));
  const R = 22;
  const C = 2 * Math.PI * R;
  const status = limit.pendingIncreaseRequest?.status || 'none';
  return (
    <div className="wl-limit-mini">
      <svg viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r={R} fill="none" stroke="#eef2f7" strokeWidth="6" />
        <circle cx="28" cy="28" r={R} fill="none" stroke={done >= need ? '#f59e0b' : '#3b82f6'} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(pct / 100) * C} ${C}`} transform="rotate(-90 28 28)" />
      </svg>
      <div className="wl-limit-mini-txt">
        <b>Payout limit {usd(limit.maxAmount)}</b>
        <small>{status === 'offered' ? 'You have a new limit offer' : status === 'pending' ? 'Increase request under review' : `${Math.min(done, need)} of ${need} payouts to a higher limit`}</small>
      </div>
      {status === 'offered' ? (
        <button type="button" className="wl-btn wl-btn-dark sm" onClick={onOpen}>See offer</button>
      ) : done >= need && status === 'none' ? (
        <button type="button" className="wl-btn wl-btn-dark sm" onClick={onApply}>Apply</button>
      ) : null}
    </div>
  );
}

function LimitCard({ limit, formatMoney, responding, onApply, onRespond }) {
  const done = limit.successfulWithdrawalCount || 0;
  const need = limit.requiredWithdrawalsForIncrease || 10;
  const pct = Math.min(100, Math.round((done / (need || 1)) * 100));
  const req = limit.pendingIncreaseRequest || { status: 'none' };
  const eligible = done >= need;
  return (
    <section className="wl-card wl-limit">
      <div className="wl-card-head">
        <div><h3><Ic name="shield" size={16} /> Payout limit</h3><p className="wl-sub">{limit.currentTierName || 'Standard tier'}</p></div>
        <b className="wl-limit-val">{usd(limit.maxAmount)}<small>/request</small></b>
      </div>
      <div className="wl-progress"><span className={eligible ? 'gold' : ''} style={{ width: `${Math.max(3, pct)}%` }} /></div>
      <p className="wl-fine">{Math.min(done, need)} of {need} approved payouts done{eligible ? ' — you can ask for a higher limit.' : ` — ${need - done} more to unlock a higher limit.`}</p>

      {req.status === 'pending' && <div className="wl-callout tone-amber"><Ic name="clock" size={16} /><p>Your request for <b>{usd(req.requestedLimit)}</b> is under review. You will get an offer with the terms.</p></div>}
      {req.status === 'accepted_by_seller' && <div className="wl-callout tone-blue"><Ic name="checkCircle" size={16} /><p>You accepted <b>{usd(req.offeredLimit)}</b>. The fee of {usd(req.offeredFee)} is taken only when the team activates it.</p></div>}
      {req.status === 'offered' && (
        <div className="wl-offer">
          <b>New limit offer</b>
          <div className="wl-offer-grid">
            <div><span>New limit</span><b className="t-green">{usd(req.offeredLimit)}</b></div>
            <div><span>One-time fee</span><b>{usd(req.offeredFee ?? 50)}</b></div>
            <div><span>Next milestone</span><b>{req.offeredNextCount || 15} payouts</b></div>
          </div>
          {req.adminNote && <p className="wl-fine">“{req.adminNote}”</p>}
          <p className="wl-fine">Accepting agrees to the terms. Nothing is charged now — the fee is taken when the team activates the new limit.</p>
          <div className="wl-modal-actions">
            <button type="button" className="wl-btn wl-btn-ghost sm" disabled={responding} onClick={() => onRespond('decline')}>Decline</button>
            <button type="button" className="wl-btn wl-btn-dark sm" disabled={responding} onClick={() => onRespond('accept')}>{responding ? 'Saving…' : 'Accept offer'}</button>
          </div>
        </div>
      )}
      {req.status !== 'pending' && req.status !== 'offered' && req.status !== 'accepted_by_seller' && (
        <button type="button" className="wl-btn wl-btn-ghost full" onClick={onApply} disabled={!eligible} title={eligible ? '' : `Complete ${need - done} more approved payouts first`}>
          {eligible ? 'Ask for a higher limit' : `Locked · ${done}/${need} payouts`}
        </button>
      )}
    </section>
  );
}

function RecentList({ title, rows, formatMoney }) {
  return (
    <div className="wl-recent">
      <h4>{title}</h4>
      {rows.length === 0 ? <p className="wl-fine">None yet.</p> : (
        <ul>
          {rows.map((r) => {
            const d = describeLine(r);
            const st = STATUS_LABEL[r.status] || { label: r.status, tone: 'slate' };
            return (
              <li key={r._id}>
                <div><b>{formatMoney(d.value)}</b><small>{fmtDate(r.createdAt)}</small></div>
                <span className={`wl-tag tone-${st.tone}`}>{st.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="wl-modal-root" role="dialog" aria-modal="true" aria-label={title || 'Dialog'}>
      <button type="button" className="wl-modal-bg" onClick={onClose} aria-label="Close" tabIndex={-1} />
      <div className="wl-modal">
        {title && (
          <div className="wl-modal-head"><h3>{title}</h3><button type="button" className="wl-icon-btn" onClick={onClose} aria-label="Close"><Ic name="x" size={18} /></button></div>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}
