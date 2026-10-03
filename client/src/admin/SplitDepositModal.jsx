import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api.js';
import Ic from '../components/Icons.jsx';

export default function SplitDepositModal({ isOpen, onClose, deposit, onSuccess }) {
  const [helpingAmount, setHelpingAmount] = useState('');
  const [binanceRate, setBinanceRate] = useState('');
  const [inrAmount, setInrAmount] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const gross = Number(
    deposit
      ? deposit.approvedAmount !== null && deposit.approvedAmount !== undefined
        ? deposit.approvedAmount
        : deposit.grossAmount !== undefined && deposit.grossAmount !== null
        ? deposit.grossAmount
        : deposit.amount || 0
      : 0
  );

  useEffect(() => {
    if (deposit) {
      setHelpingAmount(deposit.helpingAmount !== undefined ? String(deposit.helpingAmount) : '0');
      setBinanceRate(deposit.binanceRate ? String(deposit.binanceRate) : '');
      const defaultInr = gross > 0 ? (gross * 83.5).toFixed(0) : '';
      setInrAmount(deposit.inrAmount ? String(deposit.inrAmount) : defaultInr);
      setAdminNote(deposit.adminNote || '');
      setError('');
    }
  }, [deposit, gross]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !deposit) return null;

  const parsedHelping = Math.max(0, Number(helpingAmount) || 0);
  const realSellerDeposit = Math.max(0, gross - parsedHelping);

  const sellerPercent = gross > 0 ? Math.round((realSellerDeposit / gross) * 100) : 100;
  const helpingPercent = gross > 0 ? Math.round((parsedHelping / gross) * 100) : 0;

  const setPreset = (percentage) => {
    const val = Math.round(((gross * percentage) / 100) * 100) / 100;
    setHelpingAmount(String(val));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (parsedHelping > gross) {
      setError(`Helping amount ($${parsedHelping}) cannot exceed total gross deposit ($${gross}).`);
      return;
    }

    setSaving(true);
    setError('');

    try {
      const bRate = binanceRate ? Number(binanceRate) : undefined;
      const inrVal = inrAmount ? Number(inrAmount) : undefined;
      const usdtVal = (bRate > 0 && inrVal > 0) ? Number((inrVal / bRate).toFixed(2)) : undefined;

      const res = await api(`/sellers/withdrawals/${deposit._id}/split-helping`, {
        method: 'PATCH',
        body: {
          helpingAmount: parsedHelping,
          binanceRate: bRate,
          inrAmount: inrVal,
          usdtAmount: usdtVal,
          adminNote: adminNote.trim(),
        },
      });

      if (onSuccess) {
        onSuccess(res.transaction || res.request || { ...deposit, helpingAmount: parsedHelping, binanceRate: bRate, inrAmount: inrVal, usdtAmount: usdtVal, adminNote });
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update deposit helping amount split');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="admin-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 100000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={onClose}
    >
      <div
        className="admin-modal-content"
        style={{
          background: '#ffffff',
          borderRadius: 16,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          width: '100%',
          maxWidth: '560px',
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '18px 22px',
            borderBottom: '1px solid #e2e8f0',
            background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: '#ede9fe',
                border: '1px solid #c4b5fd',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#7c3aed',
                fontSize: 18,
              }}
            >
              🤝
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: '#4c1d95' }}>
                Split Deposit — Helping Amount
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#6b21a8' }}>
                Admin Internal Split • Excludes helping amount from USDT Wallet
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#ffffff',
              border: '1px solid #ddd6fe',
              borderRadius: 8,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6b21a8',
              cursor: 'pointer',
            }}
          >
            <Ic name="x" size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSave} style={{ padding: '20px 22px' }}>
          {error && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#b91c1c',
                fontSize: 12.5,
                marginBottom: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Ic name="alert" size={15} />
              <span>{error}</span>
            </div>
          )}

          {/* Deposit Info Card */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: '12px 14px',
              marginBottom: 16,
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 10,
              fontSize: 12,
            }}
          >
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>Seller / Store:</span>
              <b style={{ color: '#0f172a', fontSize: 13 }}>{deposit.storeName || deposit.seller?.storeName || 'Store'}</b>
              {deposit.seller?.ownerName && (
                <div style={{ color: '#64748b', fontSize: 11 }}>{deposit.seller.ownerName}</div>
              )}
            </div>

            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>Total Gross Deposit:</span>
              <b style={{ color: '#0f172a', fontSize: 16 }}>
                ${gross.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </b>
              <span style={{ color: '#059669', fontSize: 11, marginLeft: 4 }}>
                ({gross.toFixed(2)} USDT)
              </span>
            </div>

            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>Date &amp; Time:</span>
              <span style={{ color: '#334155' }}>{fmtDate(deposit.processedAt || deposit.createdAt)}</span>
            </div>

            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>Reference / UTR:</span>
              <span style={{ color: '#334155', fontFamily: 'monospace' }}>
                {deposit.depositRef || deposit.transactionRef || 'N/A'}
              </span>
            </div>
          </div>

          {/* Input & Split Controls */}
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 13,
                fontWeight: 800,
                color: '#6b21a8',
                marginBottom: 6,
              }}
            >
              <span>🤝 Helping Amount ($ USD / USDT):</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#7c3aed' }}>
                Admin Internal Deduction
              </span>
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <span
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontWeight: 800,
                    color: '#7c3aed',
                    fontSize: 15,
                  }}
                >
                  $
                </span>
                <input
                  type="number"
                  min="0"
                  max={gross}
                  step="any"
                  value={helpingAmount}
                  onChange={(e) => setHelpingAmount(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 28px',
                    borderRadius: 8,
                    border: '2px solid #c4b5fd',
                    fontSize: 16,
                    fontWeight: 800,
                    color: '#6b21a8',
                    outline: 'none',
                    background: '#faf5ff',
                  }}
                />
              </div>

              <button
                type="button"
                onClick={() => setHelpingAmount('0')}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#475569',
                  cursor: 'pointer',
                }}
              >
                Reset ($0)
              </button>
            </div>

            {/* Quick Presets */}
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#64748b', alignSelf: 'center', marginRight: 2 }}>Presets:</span>
              {[
                { label: '$0 (None)', p: 0 },
                { label: '10%', p: 10 },
                { label: '20%', p: 20 },
                { label: '25%', p: 25 },
                { label: '50%', p: 50 },
                { label: '100% (Full)', p: 100 },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setPreset(item.p)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#334155',
                    cursor: 'pointer',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Live Visual Split Bar */}
          <div
            style={{
              background: '#f8fafc',
              border: '1.5px solid #e2e8f0',
              borderRadius: 12,
              padding: '14px',
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 8 }}>
              Live Split Breakdown Preview:
            </div>

            {/* Progress bar */}
            <div
              style={{
                height: 14,
                borderRadius: 7,
                background: '#e2e8f0',
                display: 'flex',
                overflow: 'hidden',
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  width: `${sellerPercent}%`,
                  background: '#10b981',
                  transition: 'width 0.2s ease',
                }}
                title={`Seller Real Deposit: ${sellerPercent}%`}
              />
              <div
                style={{
                  width: `${helpingPercent}%`,
                  background: '#8b5cf6',
                  transition: 'width 0.2s ease',
                }}
                title={`Admin Helping: ${helpingPercent}%`}
              />
            </div>

            {/* Split Figures Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {/* Seller portion */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1.5px solid #a7f3d0',
                  borderRadius: 8,
                  padding: '10px 12px',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: '#047857' }}>
                  👤 Seller Real Deposit ({sellerPercent}%)
                </div>
                <div style={{ fontSize: 17, fontWeight: 900, color: '#047857', marginTop: 2 }}>
                  +${realSellerDeposit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: 10, color: '#059669', marginTop: 2, fontWeight: 600 }}>
                  ✓ Included in Admin USDT Wallet
                </div>
              </div>

              {/* Helping portion */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1.5px solid #ddd6fe',
                  borderRadius: 8,
                  padding: '10px 12px',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6b21a8' }}>
                  🤝 Helping Amount ({helpingPercent}%)
                </div>
                <div style={{ fontSize: 17, fontWeight: 900, color: '#6b21a8', marginTop: 2 }}>
                  -${parsedHelping.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: 10, color: '#dc2626', marginTop: 2, fontWeight: 600 }}>
                  ✕ Excluded from Admin USDT Wallet
                </div>
              </div>
            </div>
          </div>

          {/* Binance USDT Rate Section (Admin Internal) */}
          <div
            style={{
              background: 'linear-gradient(135deg, #fefce8 0%, #fffdf0 100%)',
              border: '1.5px solid #fde047',
              borderRadius: 10,
              padding: '12px 14px',
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14 }}>🟡</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#854d0e' }}>Binance USDT Rate &amp; Conversion</span>
                <span style={{ fontSize: 10, background: '#fef9c3', color: '#a16207', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>
                  Admin Internal • Hidden from Seller
                </span>
              </div>
              {Number(inrAmount) > 0 && Number(binanceRate) > 0 && (
                <span style={{ background: '#16a34a', color: '#fff', padding: '2px 8px', borderRadius: 5, fontSize: 11.5, fontWeight: 800 }}>
                  💎 {(Number(inrAmount) / Number(binanceRate)).toFixed(2)} USDT
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 3, color: '#713f12' }}>
                  🇮🇳 INR Amount (₹):
                </label>
                <input
                  type="number"
                  step="any"
                  value={inrAmount}
                  onChange={(e) => setInrAmount(e.target.value)}
                  placeholder={`e.g. ${(gross * 83.5).toFixed(0)}`}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #fde047', background: '#fff', fontSize: 13, fontWeight: 700, color: '#0f172a' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 800, display: 'block', marginBottom: 3, color: '#854d0e' }}>
                  🟡 Binance Rate (₹/USDT):
                </label>
                <input
                  type="number"
                  step="any"
                  value={binanceRate}
                  onChange={(e) => setBinanceRate(e.target.value)}
                  placeholder="e.g. 90.00"
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1.5px solid #eab308', background: '#fff', fontSize: 13, fontWeight: 800, color: '#854d0e' }}
                />
              </div>
            </div>
          </div>

          {/* Admin Note */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
              Admin Internal Note (Optional):
            </label>
            <input
              type="text"
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              placeholder="e.g. Subsidized $100 for onboarding promotion"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                fontSize: 12.5,
                color: '#0f172a',
              }}
            />
          </div>

          {/* Information Notice */}
          <div
            style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 11.5,
              color: '#166534',
              marginBottom: 18,
              lineHeight: 1.5,
            }}
          >
            💡 <b>Admin Eaziness Guarantee</b>: Seller ke store wallet balance mein koi farq nahi parega (unka total balance aur deposits same rahenge). Sirf Admin USDT Wallet mein se Helping Amount separate/minus ho jayegi taake USDT Wallet mein sirf seller ke apne real funds count hon.
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                fontSize: 13,
                fontWeight: 700,
                color: '#475569',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '8px 22px',
                borderRadius: 8,
                border: 'none',
                background: '#7c3aed',
                fontSize: 13,
                fontWeight: 800,
                color: '#ffffff',
                cursor: saving ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 6px rgba(124, 58, 237, 0.3)',
              }}
            >
              {saving ? 'Saving Split…' : 'Save Split & Update Wallet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
