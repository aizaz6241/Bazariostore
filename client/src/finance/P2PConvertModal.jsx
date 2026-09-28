import React, { useState } from 'react';
import Ic from '../components/Icons.jsx';

export default function P2PConvertModal({
  isOpen,
  onClose,
  onConvert,
  currentUsdtBalance = 0,
  defaultRate = 278.5,
}) {
  const [usdtAmount, setUsdtAmount] = useState('');
  const [rate, setRate] = useState(defaultRate);
  const [targetWallet, setTargetWallet] = useState('pkr_cash');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const numUsdt = Number(usdtAmount) || 0;
  const numRate = Number(rate) || defaultRate;
  const calculatedPKR = Math.round(numUsdt * numRate);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!numUsdt || numUsdt <= 0) {
      setError('Please enter a valid USDT amount to convert');
      return;
    }
    if (numUsdt > currentUsdtBalance && currentUsdtBalance > 0) {
      if (!window.confirm(`Notice: You entered $${numUsdt} USDT, which is greater than your current Binance balance ($${currentUsdtBalance} USDT). Do you wish to proceed?`)) {
        return;
      }
    }

    setSubmitting(true);
    setError('');

    try {
      await onConvert({
        usdtAmount: numUsdt,
        rate: numRate,
        pkrAmount: calculatedPKR,
        targetWallet,
        date,
        notes: notes || 'Binance P2P withdrawal into PKR cash/bank',
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Conversion failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bf-modal-backdrop" onClick={onClose}>
      <div className="bf-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bf-modal-header">
          <h2 className="bf-modal-title">
            <span style={{ color: 'var(--bf-gold)' }}>🔄</span>
            <span>Binance P2P Cashout (USDT → PKR)</span>
          </h2>
          <button type="button" className="bf-icon-btn" onClick={onClose}>
            <Ic name="x" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="bf-modal-body">
          <p style={{ fontSize: 13, color: 'var(--bf-text-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
            Withdraw funds from Binance into liquid PKR for office food, utility bills, and local expenses.
          </p>

          {/* Current Binance Holdings Display */}
          <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: 12, padding: 12, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--bf-gold)', fontWeight: 600 }}>Current Binance Balance:</span>
            <span style={{ fontSize: 16, color: '#fff', fontWeight: 800 }}>${Number(currentUsdtBalance).toFixed(2)} USDT</span>
          </div>

          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#fca5a5', fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}

          {/* USDT Amount to Sell */}
          <div className="bf-form-group">
            <label className="bf-form-label">USDT Sold / Withdrawn from Binance</label>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                step="any"
                min="0.1"
                required
                className="bf-input"
                placeholder="e.g. 200"
                value={usdtAmount}
                onChange={(e) => setUsdtAmount(e.target.value)}
                style={{ fontSize: 20, fontWeight: 800, paddingRight: 70 }}
              />
              <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--bf-gold)' }}>
                USDT
              </span>
            </div>
          </div>

          {/* Exchange Rate */}
          <div className="bf-form-group">
            <label className="bf-form-label">P2P Selling Rate (PKR per 1 USDT)</label>
            <input
              type="number"
              step="0.1"
              required
              className="bf-input"
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
            />
          </div>

          {/* Calculated PKR Result Box */}
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 12, padding: 14, marginBottom: 16, textAlign: 'center' }}>
            <span style={{ fontSize: 12, color: '#a7f3d0', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>
              Total PKR To Credit
            </span>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#34d399', margin: '4px 0' }}>
              ₨ {calculatedPKR.toLocaleString('en-US')}
            </div>
            <span style={{ fontSize: 12, color: 'var(--bf-text-dim)' }}>
              ({numUsdt || 0} USDT × ₨ {numRate})
            </span>
          </div>

          {/* Destination Wallet */}
          <div className="bf-form-group">
            <label className="bf-form-label">Deposit PKR Into</label>
            <select
              className="bf-select"
              value={targetWallet}
              onChange={(e) => setTargetWallet(e.target.value)}
            >
              <option value="pkr_cash">💵 Office Cash Drawer (Food, Chai & Daily Expenses)</option>
              <option value="pkr_bank">🏦 Business Bank Account (Meezan / Sadapay / Nayapay)</option>
            </select>
          </div>

          {/* Date & Reference */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="bf-form-group">
              <label className="bf-form-label">Date</label>
              <input
                type="date"
                className="bf-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="bf-form-group">
              <label className="bf-form-label">P2P Order ID / Memo</label>
              <input
                type="text"
                className="bf-input"
                placeholder="Optional"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            className="bf-btn-submit"
            disabled={submitting}
            style={{ marginTop: 10 }}
          >
            {submitting ? 'Converting...' : `Confirm & Credit ₨ ${calculatedPKR.toLocaleString('en-US')}`}
          </button>
        </form>
      </div>
    </div>
  );
}
