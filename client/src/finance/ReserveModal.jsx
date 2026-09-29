import React, { useState, useEffect } from 'react';
import Ic from '../components/Icons.jsx';

export default function ReserveModal({
  isOpen,
  onClose,
  onAdjust,
  currentReserve = 0,
  totalUsdt = 0,
  initialAction = 'allocate',
}) {
  const [action, setAction] = useState('allocate'); // 'allocate' | 'release' | 'reinvest'
  const [usdtAmount, setUsdtAmount] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setUsdtAmount('');
      setDescription('');
      setNotes('');
      setError('');
      setAction(initialAction || 'allocate');
    }
  }, [isOpen, initialAction]);

  if (!isOpen) return null;

  const numAmt = Number(usdtAmount) || 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!numAmt || numAmt <= 0) {
      setError('Please enter a valid positive USDT amount');
      return;
    }

    if (action === 'release' && numAmt > (currentReserve || 0)) {
      setError(`Cannot release more than current reserve ($${Number(currentReserve || 0).toFixed(2)} USDT)`);
      return;
    }

    if (action === 'reinvest' && numAmt > (currentReserve || 0)) {
      setError(`Cannot reinvest more than available reserve ($${Number(currentReserve || 0).toFixed(2)} USDT)`);
      return;
    }

    setSubmitting(true);

    try {
      await onAdjust({
        action,
        usdtAmount: numAmt,
        description: description.trim() || (action === 'reinvest' ? 'Reinvestment: Inventory / Supplier sourcing' : undefined),
        notes: notes || (
          action === 'allocate'
            ? 'Locked into seller reserve pool'
            : action === 'release'
            ? 'Released from reserve to main profit pool'
            : 'Reinvested funds deployed from seller reserve'
        ),
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Reserve update failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bf-modal-backdrop" onClick={onClose}>
      <div className="bf-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bf-modal-header">
          <h2 className="bf-modal-title">
            <span style={{ color: 'var(--bf-gold)' }}>🛡️</span>
            <span>Seller Reserve (Reinvestment)</span>
          </h2>
          <button type="button" className="bf-icon-btn" onClick={onClose}>
            <Ic name="x" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="bf-modal-body">
          <p style={{ fontSize: 13, color: 'var(--bf-text-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
            Yeh USDT amount Binance mein seller payouts ke liye mehfooz rehti hai. Isko direct withdraw nahi kiya ja sakta; nikaalne ke liye pehle yahan se <b>Release</b> karein.
          </p>

          {/* Current Status Pills */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.04)', borderRadius: 10, padding: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--bf-text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>Total in Binance</span>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginTop: 2 }}>
                ${Number(totalUsdt || 0).toFixed(2)} <small style={{ fontSize: 12, color: 'var(--bf-gold)' }}>USDT</small>
              </div>
            </div>
            <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 10, padding: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--bf-gold)', textTransform: 'uppercase', fontWeight: 600 }}>Currently in Reserve</span>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fcd34d', marginTop: 2 }}>
                ${Number(currentReserve || 0).toFixed(2)} <small style={{ fontSize: 12, color: 'var(--bf-gold)' }}>USDT</small>
              </div>
            </div>
          </div>

          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#fca5a5', fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}

          {/* Action Tabs: Lock vs Release vs Reinvest */}
          <div className="bf-form-group">
            <label className="bf-form-label">Action</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              <button
                type="button"
                onClick={() => setAction('allocate')}
                style={{
                  padding: '10px 6px',
                  borderRadius: 10,
                  fontWeight: 800,
                  fontSize: 12,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: action === 'allocate' ? 'var(--bf-gold)' : 'var(--bf-border)',
                  background: action === 'allocate' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255,255,255,0.03)',
                  color: action === 'allocate' ? '#fcd34d' : 'var(--bf-text-muted)',
                  transition: 'all 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <span>🔒</span>
                <span>Lock</span>
              </button>
              <button
                type="button"
                onClick={() => setAction('release')}
                style={{
                  padding: '10px 6px',
                  borderRadius: 10,
                  fontWeight: 800,
                  fontSize: 12,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: action === 'release' ? '#10b981' : 'var(--bf-border)',
                  background: action === 'release' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255,255,255,0.03)',
                  color: action === 'release' ? '#6ee7b7' : 'var(--bf-text-muted)',
                  transition: 'all 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <span>🔓</span>
                <span>Release</span>
              </button>
              <button
                type="button"
                onClick={() => setAction('reinvest')}
                style={{
                  padding: '10px 6px',
                  borderRadius: 10,
                  fontWeight: 800,
                  fontSize: 12,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: action === 'reinvest' ? '#a855f7' : 'var(--bf-border)',
                  background: action === 'reinvest' ? 'rgba(168, 85, 247, 0.25)' : 'rgba(255,255,255,0.03)',
                  color: action === 'reinvest' ? '#c084fc' : 'var(--bf-text-muted)',
                  transition: 'all 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <span>🚀</span>
                <span>Reinvest</span>
              </button>
            </div>
          </div>

          {/* Explainer Box */}
          <div style={{ fontSize: 12, color: 'var(--bf-text-dim)', background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 8, marginBottom: 16 }}>
            {action === 'allocate' ? (
              <span>🔒 Main Binance Wallet se USDT nikaal kar Reserve pool mein lock ho jayegi.</span>
            ) : action === 'release' ? (
              <span>🔓 Reserve pool se USDT nikaal kar wapas 50/50 profit pool (Main Wallet) mein shamil ho jayegi.</span>
            ) : (
              <span>🚀 Reserve mein rakhi USDT business reinvestment (stock, supplier, ads) ke liye kharch hogi. Dono partners ka 50/50 profit pool mehfooz rahega.</span>
            )}
          </div>

          {/* Amount Input */}
          <div className="bf-form-group">
            <label className="bf-form-label">
              {action === 'allocate' ? 'Lock USDT Amount' : action === 'release' ? 'Release USDT Amount' : 'Reinvest USDT Amount'}
            </label>
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

          {/* Reinvestment Purpose / Description */}
          {action === 'reinvest' && (
            <div className="bf-form-group">
              <label className="bf-form-label">Reinvestment Purpose / Description</label>
              <input
                type="text"
                className="bf-input"
                placeholder="e.g. New Inventory Stock / Supplier Batch Order"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          )}

          {/* Memo / Notes */}
          <div className="bf-form-group">
            <label className="bf-form-label">Memo / Notes (Optional)</label>
            <input
              type="text"
              className="bf-input"
              placeholder={
                action === 'allocate'
                  ? 'e.g. Kept for upcoming seller batch payouts'
                  : action === 'release'
                  ? 'e.g. Releasing surplus back to profit'
                  : 'e.g. Sourced from wholesale manufacturer'
              }
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="bf-btn-submit"
            disabled={submitting}
            style={{
              marginTop: 10,
              background:
                action === 'allocate'
                  ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                  : action === 'release'
                  ? 'linear-gradient(135deg, #10b981, #059669)'
                  : 'linear-gradient(135deg, #a855f7, #7c3aed)',
              color: action === 'allocate' ? '#000' : '#fff',
            }}
          >
            {submitting
              ? 'Processing...'
              : action === 'allocate'
              ? `Lock $${numAmt ? numAmt.toFixed(2) : 0} USDT into Reserve`
              : action === 'release'
              ? `Release $${numAmt ? numAmt.toFixed(2) : 0} USDT to Profit Pool`
              : `🚀 Reinvest $${numAmt ? numAmt.toFixed(2) : 0} USDT from Reserve`}
          </button>
        </form>
      </div>
    </div>
  );
}
