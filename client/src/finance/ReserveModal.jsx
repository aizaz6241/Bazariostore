import React, { useState } from 'react';
import Ic from '../components/Icons.jsx';

export default function ReserveModal({
  isOpen,
  onClose,
  onAdjust,
  currentReserve = 0,
  totalUsdt = 0,
}) {
  const [action, setAction] = useState('allocate'); // 'allocate' | 'release'
  const [usdtAmount, setUsdtAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const numAmt = Number(usdtAmount) || 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!numAmt || numAmt <= 0) {
      setError('Please enter a valid USDT amount');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await onAdjust({
        action,
        usdtAmount: numAmt,
        notes: notes || (action === 'allocate' ? 'Allocated to reinvestment pool' : 'Released from reserve to active surplus'),
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Reserve adjustment failed');
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
            <span>Reinvestment Reserve Pool</span>
          </h2>
          <button type="button" className="bf-icon-btn" onClick={onClose}>
            <Ic name="x" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="bf-modal-body">
          <p style={{ fontSize: 13, color: 'var(--bf-text-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
            This pool is reserved in your Binance wallet specifically to fund upcoming seller payouts and product restocking.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.04)', borderRadius: 10, padding: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--bf-text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>Total Binance:</span>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginTop: 2 }}>
                ${Number(totalUsdt).toFixed(2)}
              </div>
            </div>
            <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 10, padding: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--bf-gold)', textTransform: 'uppercase', fontWeight: 600 }}>Currently Reserved:</span>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fcd34d', marginTop: 2 }}>
                ${Number(currentReserve).toFixed(2)}
              </div>
            </div>
          </div>

          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#fca5a5', fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}

          {/* Action Tabs */}
          <div className="bf-form-group">
            <label className="bf-form-label">Action</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                type="button"
                onClick={() => setAction('allocate')}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: action === 'allocate' ? 'var(--bf-gold)' : 'var(--bf-border)',
                  background: action === 'allocate' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.03)',
                  color: action === 'allocate' ? '#fcd34d' : 'var(--bf-text-muted)',
                }}
              >
                + Lock into Reserve
              </button>
              <button
                type="button"
                onClick={() => setAction('release')}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: action === 'release' ? 'var(--bf-blue)' : 'var(--bf-border)',
                  background: action === 'release' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.03)',
                  color: action === 'release' ? '#93c5fd' : 'var(--bf-text-muted)',
                }}
              >
                - Release to Free Surplus
              </button>
            </div>
          </div>

          {/* Amount Input */}
          <div className="bf-form-group">
            <label className="bf-form-label">USDT Amount</label>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                step="any"
                min="0.1"
                required
                className="bf-input"
                placeholder="e.g. 100"
                value={usdtAmount}
                onChange={(e) => setUsdtAmount(e.target.value)}
                style={{ fontSize: 18, fontWeight: 800, paddingRight: 70 }}
              />
              <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--bf-gold)' }}>
                USDT
              </span>
            </div>
          </div>

          {/* Memo */}
          <div className="bf-form-group">
            <label className="bf-form-label">Memo / Reason (Optional)</label>
            <input
              type="text"
              className="bf-input"
              placeholder="e.g. Reserved for Vendor Batch #4 payouts"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="bf-btn-submit"
            disabled={submitting}
            style={{ marginTop: 10 }}
          >
            {submitting ? 'Updating...' : action === 'allocate' ? `Lock $${numAmt || 0} USDT into Reserve` : `Release $${numAmt || 0} USDT to Free Balance`}
          </button>
        </form>
      </div>
    </div>
  );
}
