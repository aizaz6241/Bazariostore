import React, { useState, useEffect } from 'react';
import Ic from '../components/Icons.jsx';

export default function ReserveModal({
  isOpen,
  onClose,
  onAdjust,
  currentReserve = 0,
  totalUsdt = 0,
}) {
  const [mode, setMode] = useState('target'); // 'target' | 'transfer'
  const [targetReserve, setTargetReserve] = useState(String(currentReserve !== undefined && currentReserve !== null ? currentReserve : 0));
  const [action, setAction] = useState('allocate'); // 'allocate' | 'release'
  const [usdtAmount, setUsdtAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTargetReserve(String(currentReserve !== undefined && currentReserve !== null ? currentReserve : 0));
      setUsdtAmount('');
      setNotes('');
      setError('');
    }
  }, [isOpen, currentReserve]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (mode === 'target') {
        const val = Number(targetReserve);
        if (isNaN(val) || val < 0) {
          throw new Error('Please enter a valid target reserve amount (>= 0)');
        }
        await onAdjust({ targetReserve: val });
      } else {
        const amt = Number(usdtAmount);
        if (!amt || amt <= 0) {
          throw new Error('Please enter a valid positive USDT amount');
        }
        await onAdjust({
          action,
          usdtAmount: amt,
          notes: notes || (action === 'allocate' ? 'Allocated to seller reserve pool' : 'Released from reserve to free pool'),
        });
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Reserve update failed');
    } finally {
      setSubmitting(false);
    }
  };

  const PRESETS = [0, 100, 200, 300, 500, 1000];

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
            Yeh USDT amount Binance wallet mein seller withdrawal payouts aur product reinvestment ke liye alag rakhi jaati hai. Baaqi sari amount aap dono ka 50/50 profit pool banti hai.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.04)', borderRadius: 10, padding: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--bf-text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>Total in Binance</span>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginTop: 2 }}>
                ${Number(totalUsdt || 0).toFixed(2)} <small style={{ fontSize: 12, color: 'var(--bf-gold)' }}>USDT</small>
              </div>
            </div>
            <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 10, padding: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--bf-gold)', textTransform: 'uppercase', fontWeight: 600 }}>Current Reserve</span>
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

          {/* Mode Switcher */}
          <div style={{ display: 'flex', gap: 6, background: 'rgba(255,255,255,0.04)', padding: 4, borderRadius: 10, marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => setMode('target')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                background: mode === 'target' ? 'var(--bf-gold)' : 'transparent',
                color: mode === 'target' ? '#000' : 'var(--bf-text-muted)',
                transition: 'all 0.15s',
              }}
            >
              Direct Set Amount (e.g. $200)
            </button>
            <button
              type="button"
              onClick={() => setMode('transfer')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                background: mode === 'transfer' ? 'var(--bf-gold)' : 'transparent',
                color: mode === 'transfer' ? '#000' : 'var(--bf-text-muted)',
                transition: 'all 0.15s',
              }}
            >
              + Lock / - Release Transfer
            </button>
          </div>

          {mode === 'target' ? (
            <div>
              <div className="bf-form-group">
                <label className="bf-form-label">Target Seller Reserve (USDT)</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    className="bf-input"
                    placeholder="e.g. 200"
                    value={targetReserve}
                    onChange={(e) => setTargetReserve(e.target.value)}
                    style={{ fontSize: 20, fontWeight: 800, paddingRight: 70 }}
                  />
                  <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--bf-gold)' }}>
                    USDT
                  </span>
                </div>
              </div>

              {/* Quick Presets */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setTargetReserve(String(p))}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: '1px solid',
                      borderColor: String(targetReserve) === String(p) ? 'var(--bf-gold)' : 'var(--bf-border)',
                      background: String(targetReserve) === String(p) ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.04)',
                      color: String(targetReserve) === String(p) ? '#fcd34d' : 'var(--bf-text-muted)',
                    }}
                  >
                    ${p} USDT
                  </button>
                ))}
              </div>

              <div style={{ fontSize: 12, color: 'var(--bf-text-dim)', background: 'rgba(255,255,255,0.02)', padding: 10, borderRadius: 8, marginBottom: 16 }}>
                💡 <b>Nateeja:</b> Agar Binance mein ${Number(totalUsdt || 0).toFixed(0)} USDT hain aur reserve ${Number(targetReserve || 0).toFixed(0)} USDT rakha, to baaqi <b>${Math.max(0, (totalUsdt || 0) - (Number(targetReserve) || 0)).toFixed(0)} USDT</b> 50/50 profit pool banegi ($500 Aizaz + $500 Abdullah).
              </div>
            </div>
          ) : (
            <div>
              <div className="bf-form-group">
                <label className="bf-form-label">Transfer Action</label>
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
                    - Release to Profit Pool
                  </button>
                </div>
              </div>

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

              <div className="bf-form-group">
                <label className="bf-form-label">Memo / Reason (Optional)</label>
                <input
                  type="text"
                  className="bf-input"
                  placeholder="e.g. Reserved for upcoming seller batches"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            className="bf-btn-submit"
            disabled={submitting}
            style={{ marginTop: 8 }}
          >
            {submitting ? 'Saving...' : mode === 'target' ? `Save Seller Reserve ($${Number(targetReserve || 0).toFixed(0)} USDT)` : action === 'allocate' ? `Lock $${Number(usdtAmount || 0)} USDT` : `Release $${Number(usdtAmount || 0)} USDT`}
          </button>
        </form>
      </div>
    </div>
  );
}
