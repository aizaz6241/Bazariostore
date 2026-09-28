import React, { useState, useEffect } from 'react';
import Ic from '../components/Icons.jsx';

export default function SettingsModal({
  isOpen,
  onClose,
  settings = {},
  onSaveSettings,
  onChangePin,
}) {
  const [partner1Name, setPartner1Name] = useState('Aizaz');
  const [partner1Share, setPartner1Share] = useState(50);
  const [partner2Name, setPartner2Name] = useState('Abdullah');
  const [partner2Share, setPartner2Share] = useState(50);
  const [defaultRate, setDefaultRate] = useState(278.5);
  const [autoSync, setAutoSync] = useState(true);

  // PIN change fields
  const [showPinChange, setShowPinChange] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (settings) {
      setPartner1Name(settings.partner1?.name || 'Aizaz');
      setPartner1Share(settings.partner1?.sharePercent !== undefined ? settings.partner1.sharePercent : 50);
      setPartner2Name(
        settings.partner2?.name && settings.partner2.name !== 'Business Partner'
          ? settings.partner2.name
          : 'Abdullah'
      );
      setPartner2Share(settings.partner2?.sharePercent !== undefined ? settings.partner2.sharePercent : 50);
      setDefaultRate(settings.defaultUsdtRate || 278.5);
      setAutoSync(settings.autoSyncBazario !== undefined ? settings.autoSyncBazario : true);
    }
    setError('');
    setMsg('');
  }, [settings, isOpen]);

  if (!isOpen) return null;

  const handlePartner1ShareChange = (val) => {
    const p1 = Math.max(0, Math.min(100, Number(val) || 0));
    setPartner1Share(p1);
    setPartner2Share(100 - p1);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setMsg('');

    try {
      // If user filled PIN change form
      if (showPinChange && newPin) {
        if (newPin.length < 4) {
          throw new Error('New PIN must be at least 4 digits');
        }
        if (newPin !== confirmPin) {
          throw new Error('New PIN and Confirm PIN do not match');
        }
        await onChangePin(currentPin, newPin);
      }

      await onSaveSettings({
        partner1: { name: partner1Name, sharePercent: Number(partner1Share) },
        partner2: { name: partner2Name, sharePercent: Number(partner2Share) },
        defaultUsdtRate: Number(defaultRate),
        autoSyncBazario: Boolean(autoSync),
      });

      setMsg('Settings successfully updated!');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      setError(err.message || 'Failed to update settings');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bf-modal-backdrop" onClick={onClose}>
      <div className="bf-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bf-modal-header">
          <h2 className="bf-modal-title">
            <Ic name="gear" size={20} />
            <span>Finance Hub Configuration</span>
          </h2>
          <button type="button" className="bf-icon-btn" onClick={onClose}>
            <Ic name="x" size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="bf-modal-body">
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#fca5a5', fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}
          {msg && (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#6ee7b7', fontSize: 13, marginBottom: 16 }}>
              {msg}
            </div>
          )}

          {/* Partner 1 Details */}
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--bf-blue)', textTransform: 'uppercase' }}>
              👤 Partner 1 (Managing Partner / You)
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginTop: 8 }}>
              <input
                type="text"
                className="bf-input"
                placeholder="Partner 1 Name"
                value={partner1Name}
                onChange={(e) => setPartner1Name(e.target.value)}
              />
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="bf-input"
                  value={partner1Share}
                  onChange={(e) => handlePartner1ShareChange(e.target.value)}
                  style={{ paddingRight: 28 }}
                />
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--bf-text-dim)', fontWeight: 700 }}>%</span>
              </div>
            </div>
          </div>

          {/* Partner 2 Details */}
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--bf-purple)', textTransform: 'uppercase' }}>
              👤 Partner 2 (Business Partner)
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginTop: 8 }}>
              <input
                type="text"
                className="bf-input"
                placeholder="Partner 2 Name"
                value={partner2Name}
                onChange={(e) => setPartner2Name(e.target.value)}
              />
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="bf-input"
                  value={partner2Share}
                  readOnly
                  style={{ paddingRight: 28, opacity: 0.8 }}
                />
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--bf-text-dim)', fontWeight: 700 }}>%</span>
              </div>
            </div>
          </div>

          {/* Default USDT Rate & Bazario Sync */}
          <div className="bf-form-group">
            <label className="bf-form-label">Default Exchange Rate (PKR / 1 USDT)</label>
            <input
              type="number"
              step="0.1"
              required
              className="bf-input"
              value={defaultRate}
              onChange={(e) => setDefaultRate(Number(e.target.value))}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Auto-Sync Bazario Deposits & Payouts</div>
              <div style={{ fontSize: 11, color: 'var(--bf-text-dim)' }}>Automatically record vendor wallet operations as profits/expenses</div>
            </div>
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => setAutoSync(e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--bf-gold)' }}
            />
          </div>

          {/* Change Security PIN Toggle */}
          <div style={{ borderTop: '1px solid var(--bf-border)', paddingTop: 14, marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => setShowPinChange(!showPinChange)}
              style={{ background: 'none', border: 'none', color: 'var(--bf-gold)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}
            >
              <Ic name="lock" size={14} />
              <span>{showPinChange ? 'Cancel PIN Change' : 'Change Partner Security PIN'}</span>
            </button>

            {showPinChange && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input
                  type="password"
                  className="bf-input"
                  placeholder="Current Security PIN"
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value)}
                />
                <input
                  type="password"
                  className="bf-input"
                  placeholder="New Security PIN (at least 4 digits)"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                />
                <input
                  type="password"
                  className="bf-input"
                  placeholder="Confirm New Security PIN"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            className="bf-btn-submit"
            disabled={submitting}
          >
            {submitting ? 'Saving Changes...' : 'Save Settings'}
          </button>
        </form>
      </div>
    </div>
  );
}
