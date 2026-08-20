import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { sapi, fmtDay, fmtDate } from '../api.js';
import Ic from '../components/Icons.jsx';
import CurrencySelector from '../components/CurrencySelector.jsx';
import CurrencyConverterWidget from '../components/CurrencyConverterWidget.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';

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

export default function SellerWallet() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { formatMoney, currentCurrency } = useCurrency();
  const [wallet, setWallet] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(() => searchParams.get('tab') || 'ledger'); // 'ledger' | 'deposit' | 'withdraw'
  const [ledgerFilter, setLedgerFilter] = useState('all'); // 'all' | 'orders' | 'deposits' | 'withdrawals'
  const [method, setMethod] = useState('bank');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
  const [depForm, setDepForm] = useState({ amount: '', depositRef: '', depositNote: '' });
  // Withdrawal form
  const [wdForm, setWdForm] = useState({
    amount: '',
    upiId: '',
    accountTitle: '',
    accountNumber: '',
    bankName: '',
    ifscCode: '',
  });

  const load = () => {
    sapi('/sellers/wallet')
      .then((res) => {
        setWallet(res.wallet);
        setRequests(res.requests || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const setDep = (k) => (e) => setDepForm((f) => ({ ...f, [k]: e.target.value }));
  const setWd = (k) => (e) => setWdForm((f) => ({ ...f, [k]: e.target.value }));

  const handleDeposit = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    if (!depForm.amount || Number(depForm.amount) < 1) return setErr('Please enter an amount (minimum $1)');
    setSubmitting(true);
    try {
      await sapi('/sellers/wallet/deposit', {
        method: 'POST',
        body: { amount: Number(depForm.amount), depositRef: depForm.depositRef, depositNote: depForm.depositNote },
      });
      setMsg('✅ Deposit request submitted successfully! Funds will be credited after admin verification.');
      setDepForm({ amount: '', depositRef: '', depositNote: '' });
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    const amt = Number(wdForm.amount);
    if (!amt || amt < 1) return setErr('Please enter an amount (minimum $1)');
    if (amt > (wallet?.balance || 0)) return setErr(`Insufficient balance. Available: ${formatMoney(wallet?.balance)}`);
    if (method === 'bank' && (!wdForm.accountNumber || !wdForm.bankName)) return setErr('Bank details are incomplete');
    setSubmitting(true);
    try {
      await sapi('/sellers/wallet/withdraw', {
        method: 'POST',
        body: { amount: amt, method, ...wdForm },
      });
      setMsg('✅ Withdrawal request submitted! Admin will process within 2-3 business days.');
      setWdForm({ amount: '', upiId: '', accountTitle: '', accountNumber: '', bankName: '', ifscCode: '' });
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="seller-loading">Loading wallet &amp; financial ledger...</div>;

  const bal = wallet?.balance || 0;
  const processingFund = wallet?.processingFund || 0;
  const totalProfitEarned = wallet?.totalProfitEarned || 0;
  const totalEarned = wallet?.totalEarned || 0;
  const deposited = wallet?.totalDeposited || 0;
  const withdrawn = wallet?.totalWithdrawn || 0;

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
          <p>Manage your available balance, in-flight processing funds, and 20% order profit earnings in <b>{currentCurrency.code} ({currentCurrency.symbol})</b>.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CurrencySelector />
        </div>
      </div>

      {msg && <div className="alert-success mb-3">{msg}</div>}
      {err && <div className="alert-error mb-3">⚠️ {err}</div>}

      {/* 4 Core Financial KPI Cards */}
      <div className="seller-wallet-kpi-grid">
        {/* 1. Available Balance */}
        <div className="sw-kpi-card card-available">
          <div className="sw-kpi-head">
            <span className="sw-kpi-title">Available Balance</span>
            <div className="sw-kpi-icon"><Ic name="banknote" size={22} /></div>
          </div>
          <div className="sw-kpi-val">{formatMoney(bal)}</div>
          <small className="sw-kpi-sub">Ready for immediate withdrawal</small>
        </div>

        {/* 2. Processing Funds (In-Flight) */}
        <div className="sw-kpi-card card-processing">
          <div className="sw-kpi-head">
            <span className="sw-kpi-title">Processing Funds</span>
            <div className="sw-kpi-icon" style={{ color: '#d97706', background: '#fef3c7' }}><Ic name="lock" size={20} /></div>
          </div>
          <div className="sw-kpi-val text-amber">{formatMoney(processingFund)}</div>
          <small className="sw-kpi-sub">Locked for active confirmed orders</small>
        </div>

        {/* 3. 20% Profit Earned */}
        <div className="sw-kpi-card card-profit">
          <div className="sw-kpi-head">
            <span className="sw-kpi-title">20% Profit Earned</span>
            <div className="sw-kpi-icon" style={{ color: '#16a34a', background: '#dcfce7' }}><Ic name="tag" size={20} /></div>
          </div>
          <div className="sw-kpi-val text-green">+{formatMoney(totalProfitEarned)}</div>
          <small className="sw-kpi-sub">Net profit margins accumulated</small>
        </div>

        {/* 4. Total Lifetime Earnings Released */}
        <div className="sw-kpi-card card-total">
          <div className="sw-kpi-head">
            <span className="sw-kpi-title">Total Payout Volume</span>
            <div className="sw-kpi-icon" style={{ color: '#2563eb', background: '#dbeafe' }}><Ic name="checkCircle" size={20} /></div>
          </div>
          <div className="sw-kpi-val">{formatMoney(totalEarned)}</div>
          <small className="sw-kpi-sub">Lifetime principal + profit released</small>
        </div>
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
                        <b
                          style={{
                            fontSize: 14,
                            color: isLock || isWithdrawal ? '#dc2626' : '#16a34a',
                          }}
                        >
                          {isLock || isWithdrawal ? '-' : '+'}{formatMoney(r.amount)}
                        </b>
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
          <h3>💰 Add Funds to Merchant Wallet</h3>
          <p className="muted-sm mb-3">
            Submit a deposit request to add funds into your Available Balance (USD $). You can use the live currency converter below to calculate from INR or other local currencies.
          </p>

          <form onSubmit={handleDeposit} className="form-grid">
            <div className="field field-full">
              <CurrencyConverterWidget
                usdValue={depForm.amount}
                onUsdChange={(val) => setDepForm((prev) => ({ ...prev, amount: val }))}
                title="Deposit Currency Converter (INR / EUR / GBP / AED to USD)"
                mode="deposit"
              />
            </div>

            <div className="field field-full">
              <label>Payment Reference / Transaction ID <span className="muted-sm">(optional)</span></label>
              <input
                value={depForm.depositRef}
                onChange={setDep('depositRef')}
                placeholder="Bank transfer / Wire reference number / UPI Ref ID"
              />
            </div>
            <div className="field field-full">
              <label>Notes for Admin <span className="muted-sm">(optional)</span></label>
              <input
                value={depForm.depositNote}
                onChange={setDep('depositNote')}
                placeholder="e.g. Deposited via Bank Transfer / UPI / Card"
              />
            </div>
            <div className="field field-full">
              <button type="submit" className="seller-btn-pri" disabled={submitting || !depForm.amount}>
                {submitting ? 'Submitting...' : `💰 Submit Deposit Request ($${Number(depForm.amount || 0).toFixed(2)} USD)`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 3: WITHDRAW FUNDS
          ───────────────────────────────────────────────────────────── */}
      {tab === 'withdraw' && (
        <div className="card form-card mb-4">
          <h3>💸 Withdraw Funds from Merchant Wallet</h3>
          <p className="muted-sm mb-3">
            Request a payout from your Available Balance directly to your Bank Account (Available: ${Number(bal).toFixed(2)} USD).
          </p>

          <form onSubmit={handleWithdraw} className="form-grid">
            <div className="field field-full">
              <CurrencyConverterWidget
                usdValue={wdForm.amount}
                onUsdChange={(val) => setWdForm((prev) => ({ ...prev, amount: val }))}
                title="Payout Currency Converter (USD to INR / EUR / GBP / AED)"
                mode="withdraw"
              />
            </div>

            <div className="field">
              <label>Account Holder Name *</label>
              <input value={wdForm.accountTitle} onChange={setWd('accountTitle')} placeholder="Full name as per bank" required />
            </div>
            <div className="field">
              <label>Account Number / IBAN *</label>
              <input value={wdForm.accountNumber} onChange={setWd('accountNumber')} placeholder="Bank account number or IBAN" required />
            </div>
            <div className="field">
              <label>Bank Name *</label>
              <input value={wdForm.bankName} onChange={setWd('bankName')} placeholder="e.g. State Bank of India, HDFC, Chase, Barclays" required />
            </div>
            <div className="field">
              <label>Routing / SWIFT / IFSC Code</label>
              <input
                value={wdForm.ifscCode}
                onChange={setWd('ifscCode')}
                placeholder="e.g. SBIN0001234 / CHASUS33"
                style={{ textTransform: 'uppercase' }}
              />
            </div>

            <div className="field field-full">
              <button type="submit" className="seller-btn-pri" disabled={submitting || bal < 1 || !wdForm.amount || Number(wdForm.amount) > bal}>
                {submitting ? 'Submitting...' : `💸 Submit Withdrawal Request ($${Number(wdForm.amount || 0).toFixed(2)} USD)`}
              </button>
              {bal < 1 && <small className="muted-sm mt-1 block">Insufficient available balance to withdraw.</small>}
              {Number(wdForm.amount) > bal && <small className="muted-sm mt-1 block" style={{ color: '#dc2626' }}>Withdrawal amount cannot exceed available balance (${Number(bal).toFixed(2)} USD).</small>}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
