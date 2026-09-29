import React, { useState, useEffect } from 'react';
import Ic from '../components/Icons.jsx';

export default function SettlementModal({
  isOpen,
  onClose,
  onSettle,
  settlement = {},
}) {
  const owesPartner = settlement.owesPartner || 'Partner';
  const receiverPartner = settlement.receiverPartner || 'Partner';
  const defaultDiff = settlement.differencePKR || 0;

  const [amount, setAmount] = useState(defaultDiff ? String(defaultDiff) : '');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setAmount(defaultDiff ? String(defaultDiff) : '');
      setNotes(`Cash settlement: ${owesPartner} cleared debt to ${receiverPartner}`);
      setError('');
    }
  }, [isOpen, defaultDiff, owesPartner, receiverPartner]);

  if (!isOpen) return null;

  const numAmt = Number(amount) || 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!numAmt || numAmt <= 0) {
      setError('Please enter a valid settlement amount');
      return;
    }

    setSubmitting(true);
    try {
      await onSettle({
        type: 'settlement',
        category: 'partner_settlement',
        amount: numAmt,
        currency: 'PKR',
        paidBy: owesPartner,
        partnerName: receiverPartner,
        walletSource: 'partner_pocket',
        walletDestination: 'partner_pocket',
        description: `🤝 Settlement: ${owesPartner} paid ${receiverPartner} ₨ ${numAmt.toLocaleString('en-US')} (Debt cleared)`,
        notes: notes || `Office expenditure cash settlement`,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Settlement failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bf-modal-backdrop" onClick={onClose}>
      <div className="bf-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bf-modal-header">
          <h2 className="bf-modal-title">
            <span style={{ fontSize: 20 }}>🤝</span>
            <span>Adjust / Settle Office Debt</span>
          </h2>
          <button type="button" className="bf-icon-btn" onClick={onClose}>
            <Ic name="x" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="bf-modal-body">
          <p style={{ fontSize: 13, color: 'var(--bf-text-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
            Yeh record karne ke baad dono partners ka aapas ka hisaab barabar ho jayega aur debt <b>₨ 0</b> ho jayegi.
          </p>

          {/* Visual Settlement Card */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(16, 185, 129, 0.08))',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 12,
              padding: 14,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div>
              <span style={{ fontSize: 11, color: '#fcd34d', fontWeight: 700, textTransform: 'uppercase' }}>
                Debt Payer (Kharacha Ada Karega)
              </span>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginTop: 2 }}>
                👤 {owesPartner}
              </div>
            </div>

            <div style={{ fontSize: 22, opacity: 0.6 }}>➔</div>

            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 11, color: '#6ee7b7', fontWeight: 700, textTransform: 'uppercase' }}>
                Debt Receiver (Paisa Vasool Karega)
              </span>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginTop: 2 }}>
                👤 {receiverPartner}
              </div>
            </div>
          </div>

          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#fca5a5', fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}

          {/* Settlement Amount Input */}
          <div className="bf-form-group">
            <label className="bf-form-label">Settlement Amount (PKR)</label>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                step="any"
                min="1"
                required
                className="bf-input"
                placeholder="e.g. 2500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ fontSize: 22, fontWeight: 800, paddingRight: 60 }}
              />
              <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--bf-text-dim)' }}>
                PKR
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--bf-text-dim)', marginTop: 4 }}>
              Current calculated debt: <b>₨ {Number(defaultDiff).toLocaleString('en-US')}</b>
            </div>
          </div>

          {/* Notes */}
          <div className="bf-form-group">
            <label className="bf-form-label">Notes / Reference (Optional)</label>
            <input
              type="text"
              className="bf-input"
              placeholder="e.g. Cash paid in office"
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
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: '#fff',
              fontSize: 15,
              fontWeight: 800,
            }}
          >
            {submitting ? 'Recording Settlement...' : `✅ Settle Amount (₨ ${numAmt.toLocaleString('en-US')})`}
          </button>
        </form>
      </div>
    </div>
  );
}
