import { useEffect, useState } from 'react';
import { api } from '../api.js';

const FEE = 1500;

const inputStyle = {
  width: '100%',
  padding: '9px 11px',
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  fontSize: 14,
  boxSizing: 'border-box',
};
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 };
const hintStyle = { display: 'block', fontSize: 11, color: '#64748b', marginTop: 3 };

/**
 * Upgrade a store to 💎 Diamond: the admin enters what came in for the one-time $1,500 fee.
 * For a client store this goes to the other partner for approval (team portal → Finance); when
 * approved the fee's real USDT is divided like a deposit of this store and the store becomes Diamond
 * for life. A test store is upgraded at once.
 */
export default function DiamondUpgradeModal({ seller, onClose, onDone }) {
  const [form, setForm] = useState({ usdtAmount: '', inrAmount: '', helpingAmount: '0', pkrRate: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setForm({ usdtAmount: '', inrAmount: '', helpingAmount: '0', pkrRate: '', note: seller?.tierRequest?.status === 'pending' ? 'Upgrade fee received' : '' });
    setErr('');
  }, [seller?._id]);

  if (!seller) return null;
  const isTest = seller.isTestAccount === true || seller.accountType === 'test';
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const helping = Math.min(FEE, Math.max(0, Number(form.helpingAmount) || 0));
  const realPart = Math.round((FEE - helping) * 100) / 100;

  const submit = async () => {
    setErr('');
    if (!isTest && realPart > 0 && !(Number(form.usdtAmount) > 0)) return setErr(`$${realPart} of the fee is real money: enter the real USDT received on Binance.`);
    if (!isTest && realPart > 0 && !(Number(form.inrAmount) > 0)) return setErr('Enter the INR the seller paid for the fee.');
    const ok = window.confirm(
      isTest
        ? `Upgrade the TEST store "${seller.storeName}" to 💎 Diamond now? (No fee in finance.)`
        : `Send "${seller.storeName}" for the 💎 Diamond upgrade?\n\nFee $${FEE}: ${realPart > 0 ? `₮${form.usdtAmount} real (₹${form.inrAmount})` : 'no real money'}${helping > 0 ? `, $${helping} helping` : ''}.\n\nThe other partner approves it on the team portal (Finance). Then the store becomes Diamond FOR LIFE (there is no way back to Basic).`
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await api(`/sellers/${seller._id}/tier`, {
        method: 'POST',
        body: isTest ? { tier: 'diamond', note: form.note } : { tier: 'diamond', ...form, usdtAmount: realPart > 0 ? form.usdtAmount : 0, inrAmount: realPart > 0 ? form.inrAmount : 0 },
      });
      onDone?.(res);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-top">
          <h3 style={{ margin: 0 }}>💎 Upgrade to Diamond</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#475569' }}>
            <b>{seller.storeName}</b> · one-time fee <b>${FEE.toLocaleString('en-US')}</b> · Diamond is for life
          </p>
        </div>

        <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
          {isTest ? (
            <div style={{ padding: 10, borderRadius: 8, background: '#f5f3ff', color: '#5b21b6', fontSize: 13 }}>
              🧪 Test account: upgraded at once, nothing goes into finance.
            </div>
          ) : (
            <>
              <div>
                <label style={labelStyle}>Helping amount ($)</label>
                <input style={inputStyle} inputMode="decimal" value={form.helpingAmount} onChange={set('helpingAmount')} />
                <span style={hintStyle}>The part of the fee the admins covered (no real money). Put {FEE} if the whole fee is helping.</span>
              </div>
              {realPart > 0 ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>Real USDT received *</label>
                      <input style={inputStyle} inputMode="decimal" value={form.usdtAmount} onChange={set('usdtAmount')} placeholder="on Binance" />
                    </div>
                    <div>
                      <label style={labelStyle}>INR paid *</label>
                      <input style={inputStyle} inputMode="decimal" value={form.inrAmount} onChange={set('inrAmount')} placeholder="₹" />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Today's PKR rate (PKR per 1 USDT)</label>
                    <input style={inputStyle} inputMode="decimal" value={form.pkrRate} onChange={set('pkrRate')} />
                    <span style={hintStyle}>Needed only when the store belongs to a 1:1 PKR member (same as a deposit).</span>
                  </div>
                  <div style={{ padding: 10, borderRadius: 8, background: '#ecfeff', color: '#155e75', fontSize: 12.5, lineHeight: 1.45 }}>
                    The real USDT is divided <b>exactly like a deposit of this store</b> (owner's share, 1:1 PKR rule, referral, partners) and it
                    counts for rewards. It is <b>not</b> added to the store wallet.
                  </div>
                </>
              ) : (
                <div style={{ padding: 10, borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: 12.5 }}>
                  The whole fee is helping amount: no real money, nothing is divided. The store still becomes Diamond.
                </div>
              )}
            </>
          )}
          <div>
            <label style={labelStyle}>Note (optional)</label>
            <input style={inputStyle} value={form.note} onChange={set('note')} placeholder="payment reference, who paid…" />
          </div>
          {err && <div style={{ padding: 10, borderRadius: 8, background: '#fef2f2', color: '#991b1b', fontSize: 13, fontWeight: 600 }}>{err}</div>}
        </div>

        <div className="modal-bottom-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            style={{ padding: '10px 16px', borderRadius: 8, border: 0, fontWeight: 800, color: '#fff', background: 'linear-gradient(135deg,#164e63,#0891b2)', cursor: busy ? 'wait' : 'pointer' }}
          >
            {busy ? 'Sending…' : isTest ? '💎 Upgrade now' : '💎 Send for approval'}
          </button>
        </div>
      </div>
    </div>
  );
}
