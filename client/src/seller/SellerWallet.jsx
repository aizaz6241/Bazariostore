import { useEffect, useState } from 'react';
import { sapi, fmtDay } from '../api.js';
import Ic from '../components/Icons.jsx';

const STATUS_COLOR = { pending: 'chip-orange', approved: 'chip-green', rejected: 'chip-red' };
const TYPE_ICON = { deposit: '💰', withdrawal: '💸' };

function money(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SellerWallet() {
  const [wallet, setWallet] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('deposit'); // 'deposit' | 'withdraw'
  const [method, setMethod] = useState('upi');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Deposit form
  const [depForm, setDepForm] = useState({ amount: '', depositRef: '', depositNote: '' });
  // Withdrawal form
  const [wdForm, setWdForm] = useState({
    amount: '', upiId: '', accountTitle: '', accountNumber: '', bankName: '', ifscCode: '',
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

  useEffect(() => { load(); }, []);

  const setDep = (k) => (e) => setDepForm((f) => ({ ...f, [k]: e.target.value }));
  const setWd = (k) => (e) => setWdForm((f) => ({ ...f, [k]: e.target.value }));

  const handleDeposit = async (e) => {
    e.preventDefault();
    setErr(''); setMsg('');
    if (!depForm.amount || Number(depForm.amount) < 1) return setErr('Amount enter karein (minimum ₹1)');
    setSubmitting(true);
    try {
      await sapi('/sellers/wallet/deposit', {
        method: 'POST',
        body: { amount: Number(depForm.amount), depositRef: depForm.depositRef, depositNote: depForm.depositNote },
      });
      setMsg('✅ Deposit request submit ho gayi! Admin se chat mein bhi notification gaya hai. Approval ke baad wallet mein add ho jaayega.');
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
    setErr(''); setMsg('');
    const amt = Number(wdForm.amount);
    if (!amt || amt < 1) return setErr('Amount enter karein (minimum ₹1)');
    if (amt > (wallet?.balance || 0)) return setErr(`Insufficient balance. Available: ${money(wallet?.balance)}`);
    if (method === 'upi' && !wdForm.upiId) return setErr('UPI ID required hai');
    if (method === 'bank' && (!wdForm.accountNumber || !wdForm.bankName || !wdForm.ifscCode)) return setErr('Bank details incomplete hain');
    setSubmitting(true);
    try {
      await sapi('/sellers/wallet/withdraw', {
        method: 'POST',
        body: { amount: amt, method, ...wdForm },
      });
      setMsg('✅ Withdrawal request submit ho gayi! Admin approve karne ke baad 2-3 business days mein process hogi. Chat mein bhi notification gaya hai.');
      setWdForm({ amount: '', upiId: '', accountTitle: '', accountNumber: '', bankName: '', ifscCode: '' });
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="seller-loading">Loading wallet...</div>;

  const bal = wallet?.balance || 0;
  const deposited = wallet?.totalDeposited || 0;
  const withdrawn = wallet?.totalWithdrawn || 0;
  const pendDep = wallet?.pendingDeposit || 0;
  const pendWd = wallet?.pendingWithdrawal || 0;

  const depositReqs = requests.filter((r) => r.type === 'deposit');
  const withdrawReqs = requests.filter((r) => r.type === 'withdrawal');

  return (
    <div className="seller-page">
      <div className="seller-page-header">
        <div>
          <h2>💼 My Wallet</h2>
          <p>Wallet mein paise add karein ya withdraw karein. Dono requests admin se approve hoti hain.</p>
        </div>
      </div>

      {msg && <div className="alert-success mb-3">{msg}</div>}
      {err && <div className="alert-error mb-3">⚠️ {err}</div>}

      {/* Balance Cards */}
      <div className="wallet-grid">
        <div className="wallet-card wallet-main">
          <div className="wallet-icon"><Ic name="banknote" size={28} /></div>
          <div>
            <div className="wallet-amount">{money(bal)}</div>
            <div className="wallet-label">Available Balance</div>
            <div className="muted-sm">Withdraw karne ke liye available</div>
          </div>
        </div>
        <div className="wallet-card">
          <div className="wallet-icon" style={{ color: '#059669' }}><Ic name="tag" size={22} /></div>
          <div>
            <div className="wallet-amount-sm">{money(deposited)}</div>
            <div className="wallet-label">Total Deposited</div>
          </div>
        </div>
        <div className="wallet-card">
          <div className="wallet-icon" style={{ color: '#7c3aed' }}><Ic name="check" size={22} /></div>
          <div>
            <div className="wallet-amount-sm">{money(withdrawn)}</div>
            <div className="wallet-label">Total Withdrawn</div>
          </div>
        </div>
        <div className="wallet-card">
          <div className="wallet-icon" style={{ color: '#d97706' }}><Ic name="clock" size={22} /></div>
          <div>
            <div className="wallet-amount-sm" style={{ fontSize: 16 }}>
              {pendDep > 0 && <div className="muted-sm">Dep: {money(pendDep)}</div>}
              {pendWd > 0 && <div className="muted-sm">Wd: {money(pendWd)}</div>}
              {pendDep === 0 && pendWd === 0 && <span>—</span>}
            </div>
            <div className="wallet-label">Pending</div>
          </div>
        </div>
      </div>

      {/* Action Tabs */}
      <div className="wallet-action-tabs">
        <button
          className={`wallet-action-tab ${tab === 'deposit' ? 'active' : ''}`}
          onClick={() => { setTab('deposit'); setMsg(''); setErr(''); }}
        >
          💰 Deposit Request
        </button>
        <button
          className={`wallet-action-tab ${tab === 'withdraw' ? 'active' : ''}`}
          onClick={() => { setTab('withdraw'); setMsg(''); setErr(''); }}
        >
          💸 Withdrawal Request
        </button>
      </div>

      {/* DEPOSIT FORM */}
      {tab === 'deposit' && (
        <div className="card form-card mb-4">
          <h3>💰 Deposit Request</h3>
          <p className="muted-sm mb-3">
            Wallet mein paise add karne ke liye request karein. Admin approve karega phir balance mein add ho jaayega.
            <br/>Aapki request admin ke chat mein <b>automatically</b> notification ke taur par bhi jayegi.
          </p>
          <form onSubmit={handleDeposit} className="form-grid">
            <div className="field field-full">
              <label>Amount (₹) *</label>
              <input
                type="number"
                min={1}
                value={depForm.amount}
                onChange={setDep('amount')}
                placeholder="e.g. 5000"
              />
            </div>
            <div className="field field-full">
              <label>Payment Reference / UTR Number <span className="muted-sm">(optional but recommended)</span></label>
              <input
                value={depForm.depositRef}
                onChange={setDep('depositRef')}
                placeholder="Aapne jo payment ki hai uska UTR ya reference number"
              />
            </div>
            <div className="field field-full">
              <label>Note <span className="muted-sm">(optional)</span></label>
              <input
                value={depForm.depositNote}
                onChange={setDep('depositNote')}
                placeholder="Koi bhi zaruri information admin ke liye"
              />
            </div>
            <div className="field field-full">
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Submitting...' : '💰 Submit Deposit Request'}
              </button>
            </div>
          </form>

          {/* Deposit History */}
          {depositReqs.length > 0 && (
            <div className="mt-4">
              <h4>Deposit History</h4>
              <table className="admin-table">
                <thead><tr><th>Date</th><th>Type / Ref</th><th>Amount</th><th>Status</th><th>Admin Note</th></tr></thead>
                <tbody>
                  {depositReqs.map((r) => (
                    <tr key={r._id}>
                      <td>{fmtDay(r.createdAt)}</td>
                      <td>
                        {r.isManualAdjustment ? (
                          <span className="badge-pill" style={{ background: '#dbeafe', color: '#1e40af' }}>Direct Credit</span>
                        ) : (
                          <span className="muted-sm">{r.depositRef || 'Deposit Request'}</span>
                        )}
                      </td>
                      <td>
                        <b>{money(r.amount)}</b>
                        {r.approvedAmount !== null && r.approvedAmount !== undefined && r.approvedAmount !== r.amount && r.status === 'approved' && (
                          <small className="text-green block font-bold" style={{ fontSize: 11 }}>
                            Credited: {money(r.approvedAmount)}
                          </small>
                        )}
                      </td>
                      <td><span className={`status-chip ${STATUS_COLOR[r.status] || ''}`}>{r.status?.toUpperCase()}</span></td>
                      <td className="muted-sm">{r.adminNote || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* WITHDRAWAL FORM */}
      {tab === 'withdraw' && (
        <div className="card form-card mb-4">
          <h3>💸 Withdrawal Request</h3>
          <p className="muted-sm mb-3">
            Wallet se paise nikalne ke liye request karein. Admin approve karega phir 2-3 business days mein transfer hoga.
            <br/>Request admin ke chat mein <b>automatically</b> notification ke taur par bhi jayegi.
          </p>
          <div className="method-toggle mb-3">
            <button type="button" className={`method-btn ${method === 'upi' ? 'active' : ''}`} onClick={() => setMethod('upi')}>
              📱 UPI Transfer
            </button>
            <button type="button" className={`method-btn ${method === 'bank' ? 'active' : ''}`} onClick={() => setMethod('bank')}>
              🏦 Bank Transfer
            </button>
          </div>
          <form onSubmit={handleWithdraw} className="form-grid">
            <div className="field field-full">
              <label>Withdrawal Amount (₹) * — Available: {money(bal)}</label>
              <input
                type="number"
                min={1}
                max={bal}
                value={wdForm.amount}
                onChange={setWd('amount')}
                placeholder={`Max ${money(bal)}`}
              />
            </div>

            {method === 'upi' && (
              <div className="field field-full">
                <label>UPI ID *</label>
                <input
                  value={wdForm.upiId}
                  onChange={setWd('upiId')}
                  placeholder="yourname@paytm / phone@gpay / upi@phonepe"
                />
                <small className="muted-sm">Supports: PhonePe, Google Pay, Paytm, BHIM, etc.</small>
              </div>
            )}

            {method === 'bank' && (
              <>
                <div className="field">
                  <label>Account Holder Name *</label>
                  <input value={wdForm.accountTitle} onChange={setWd('accountTitle')} placeholder="Full name as per bank" />
                </div>
                <div className="field">
                  <label>Account Number *</label>
                  <input value={wdForm.accountNumber} onChange={setWd('accountNumber')} placeholder="Bank account number" />
                </div>
                <div className="field">
                  <label>Bank Name *</label>
                  <input value={wdForm.bankName} onChange={setWd('bankName')} placeholder="e.g. HDFC Bank, SBI, ICICI, Axis" />
                </div>
                <div className="field">
                  <label>IFSC Code *</label>
                  <input
                    value={wdForm.ifscCode}
                    onChange={setWd('ifscCode')}
                    placeholder="e.g. HDFC0001234"
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>
              </>
            )}

            <div className="field field-full">
              <button type="submit" className="btn-primary" disabled={submitting || bal < 1}>
                {submitting ? 'Submitting...' : `💸 Submit Withdrawal Request`}
              </button>
              {bal < 1 && <small className="muted-sm mt-1 block">Wallet balance nahi hai. Pehle deposit karein.</small>}
            </div>
          </form>

          {/* Withdrawal History */}
          {withdrawReqs.length > 0 && (
            <div className="mt-4">
              <h4>Withdrawal History</h4>
              <table className="admin-table">
                <thead>
                  <tr><th>Date</th><th>Amount</th><th>Method</th><th>To</th><th>Status</th><th>Admin Note</th></tr>
                </thead>
                <tbody>
                  {withdrawReqs.map((r) => (
                    <tr key={r._id}>
                      <td>{fmtDay(r.createdAt)}</td>
                      <td><b>{money(r.amount)}</b></td>
                      <td>{r.method?.toUpperCase()}</td>
                      <td className="muted-sm">{r.method === 'upi' ? r.upiId : `${r.bankName} ••••${r.accountNumber?.slice(-4)}`}</td>
                      <td><span className={`status-chip ${STATUS_COLOR[r.status] || ''}`}>{r.status?.toUpperCase()}</span></td>
                      <td className="muted-sm">{r.adminNote || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
