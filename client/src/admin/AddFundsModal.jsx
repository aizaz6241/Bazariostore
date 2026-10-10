import React, { useState, useEffect, useRef } from 'react';
import { api, money } from '../api.js';
import Ic from '../components/Icons.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';
import SellerSelectDropdown from './SellerSelectDropdown.jsx';

const FALLBACK_INR_RATE = 83.5; // used only if the live rate has not loaded
const REASON_PRESETS = [
  'Order fulfillment funds',
  'Bank deposit verified',
  'Store balance top-up',
  'Promotional credit bonus',
];

export default function AddFundsModal({
  isOpen,
  onClose,
  sellers = [],
  preselectedSellerId = '',
  onSuccess,
}) {
  // Same live USD → INR rate the seller sees in the deposit calculator, so both sides match.
  const { rates } = useCurrency();
  const INR_RATE = Number(rates?.INR) > 0 ? Number(rates.INR) : FALLBACK_INR_RATE;

  const [sellersList, setSellersList] = useState(sellers);
  const [selectedSellerId, setSelectedSellerId] = useState('');
  const [type, setType] = useState('credit'); // 'credit' | 'debit'

  // Amounts
  const [inrAmount, setInrAmount] = useState('');
  const [usdAmount, setUsdAmount] = useState('');
  const lastEditedRef = useRef('inr'); // 'inr' | 'usd'

  // Binance & Helping (Admin Internal)
  const [usdtReceived, setUsdtReceived] = useState(''); // real USDT that reached Binance (empty = no real money)
  const [binanceInr, setBinanceInr] = useState(''); // real INR the seller sent for this credit
  const [helpingAmount, setHelpingAmount] = useState('');

  // Reason & Reference
  const [reason, setReason] = useState('Order fulfillment funds');
  const [reference, setReference] = useState('');

  // Status & Feedback
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  // Second step: the admin must confirm the exact seller before anything is sent
  const [confirming, setConfirming] = useState(false);

  // Keep sellersList updated
  useEffect(() => {
    if (sellers && sellers.length > 0) {
      setSellersList(sellers);
    } else if (isOpen && sellersList.length === 0) {
      api('/sellers?status=approved')
        .then((res) => {
          const list = Array.isArray(res) ? res : res.sellers || [];
          setSellersList(list);
        })
        .catch(() => {});
    }
  }, [sellers, isOpen]);

  // Set initial selected seller when opened
  useEffect(() => {
    if (!isOpen) {
      setError('');
      setSuccessMsg('');
      setConfirming(false);
      // Never carry the last seller over to the next adjustment
      setSelectedSellerId('');
      return;
    }

    // No seller is picked automatically: the admin must choose one every time
    if (preselectedSellerId) setSelectedSellerId(preselectedSellerId);
  }, [isOpen, preselectedSellerId]);

  // Any change after "Review" sends the admin back to the review step
  useEffect(() => { setConfirming(false); }, [selectedSellerId, type, usdAmount, inrAmount, helpingAmount, usdtReceived, binanceInr]);

  // ESC key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Only stores whose registration is approved can get wallet money
  // (A debit can still pick any store, so money added by mistake can be taken back.)
  const eligibleSellers = type === 'debit' ? sellersList : sellersList.filter((s) => s.status !== 'pending_approval' && !s.registrationRejectedAt);
  const selectedSeller = eligibleSellers.find((s) => String(s._id) === String(selectedSellerId)) || null;
  const currentBalance = selectedSeller?.wallet?.balance || 0;
  const isDebit = type === 'debit';

  // Handle INR amount input
  const handleInrChange = (val) => {
    lastEditedRef.current = 'inr';
    setInrAmount(val);
    const num = parseFloat(val);
    if (!val || isNaN(num) || num <= 0) {
      setUsdAmount('');
    } else {
      const calcUsd = (num / INR_RATE).toFixed(2);
      setUsdAmount(calcUsd);
    }
  };

  // Handle USD amount input
  const handleUsdChange = (val) => {
    lastEditedRef.current = 'usd';
    setUsdAmount(val);
    const num = parseFloat(val);
    if (!val || isNaN(num) || num <= 0) {
      setInrAmount('');
    } else {
      const calcInr = Math.round(num * INR_RATE);
      setInrAmount(String(calcInr));
    }
  };

  // Binance USDT conversion calculations
  const parsedInr = parseFloat(inrAmount) || (parseFloat(usdAmount) > 0 ? parseFloat(usdAmount) * INR_RATE : 0);
  // The admin types the REAL USDT received on Binance; the rate is only worked out for reference.
  const parsedUsdt = parseFloat(usdtReceived) || 0;
  const calcUsdt = parsedUsdt > 0 ? parsedUsdt.toFixed(2) : null;
  const parsedBinanceInr = parseFloat(binanceInr) || 0;
  const parsedBRate = (parsedBinanceInr > 0 && parsedUsdt > 0) ? Number((parsedBinanceInr / parsedUsdt).toFixed(2)) : 0;

  // Helping amount calculation
  const parsedHelping = parseFloat(helpingAmount) || 0;
  const parsedUsd = parseFloat(usdAmount) || 0;
  const realSellerInflow = Math.max(0, parsedUsd - parsedHelping);

  // Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!selectedSellerId || !selectedSeller) {
      return setError('Please select the seller first (step 1 at the top).');
    }

    const amt = parseFloat(usdAmount);
    if (!amt || isNaN(amt) || amt <= 0) {
      return setError('Please enter a valid amount greater than 0.');
    }

    // Step 1 of submit: show the seller + amount and ask for a second click
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setSubmitting(true);
    try {
      // Only the INR the admin really typed in the Binance box is saved (never a converted guess)
      const inrVal = (!isDebit && parsedBinanceInr > 0) ? Number(parsedBinanceInr.toFixed(2)) : undefined;
      const bRate = (!isDebit && parsedBRate > 0) ? parsedBRate : undefined;
      const usdtVal = (!isDebit && parsedUsdt > 0) ? parsedUsdt : undefined;
      const hAmt = (!isDebit && parsedHelping > 0) ? parsedHelping : 0;

      const res = await api(`/sellers/${selectedSellerId}/wallet/adjust`, {
        method: 'POST',
        body: {
          type,
          amount: amt,
          helpingAmount: hAmt,
          binanceRate: bRate,
          inrAmount: inrVal,
          usdtAmount: usdtVal,
          reason: reason.trim(),
          reference: reference.trim(),
        },
      });

      const successText = `✅ ${res.message || 'Seller wallet updated successfully!'}`;
      setSuccessMsg(successText);

      if (onSuccess) {
        onSuccess({
          ...res,
          sellerId: selectedSellerId,
          amount: amt,
          type,
        });
      }

      // Reset form fields
      setInrAmount('');
      setUsdAmount('');
      setHelpingAmount('');
      setUsdtReceived('');
      setBinanceInr('');
      setReference('');

      setTimeout(() => {
        onClose();
        setSuccessMsg('');
      }, 1400);
    } catch (err) {
      setError(err.message || 'Failed to adjust seller wallet');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="add-funds-modal-overlay" onClick={onClose}>
      <div className="add-funds-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="afm-header">
          <div className="afm-header-left">
            <div className="afm-header-icon">
              <span>💳</span>
            </div>
            <div>
              <h3 className="afm-title">Direct Seller Wallet Adjustment</h3>
              <p className="afm-subtitle">
                Add or adjust merchant funds in <b>INR (₹)</b> or <b>USD ($)</b> with live <b>Binance USDT rate</b>.
              </p>
            </div>
          </div>
          <button type="button" className="afm-close-btn" onClick={onClose} title="Close">
            <Ic name="x" size={18} />
          </button>
        </div>

        {/* Alerts */}
        {successMsg && <div className="afm-alert afm-alert-success">{successMsg}</div>}
        {error && <div className="afm-alert afm-alert-error">{error}</div>}

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="afm-body">
          {/* 1. SELLER SELECTION */}
          <div className="afm-section">
            <label className="afm-label">
              <span className="afm-label-main">1. Target Merchant Store *</span>
            </label>

            <SellerSelectDropdown
              sellers={eligibleSellers}
              value={selectedSellerId}
              onChange={(id) => setSelectedSellerId(id)}
              inrRate={INR_RATE}
              hideOwner={true}
              placeholder="-- Choose target merchant store --"
            />
            {selectedSeller ? (
              <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, border: '2px solid #2563eb', background: '#eff6ff' }}>
                <div style={{ fontSize: 12, color: '#1e40af', fontWeight: 700 }}>SELECTED SELLER</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>{selectedSeller.storeName || selectedSeller.name}</div>
                <div style={{ fontSize: 13, color: '#334155' }}>
                  {[selectedSeller.name, selectedSeller.email, selectedSeller.phone].filter(Boolean).join(' · ')}
                </div>
                <div style={{ fontSize: 13, color: '#334155' }}>Current balance: <b>${Number(currentBalance).toFixed(2)}</b></div>
              </div>
            ) : (
              <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, border: '2px dashed #dc2626', background: '#fef2f2', color: '#b91c1c', fontWeight: 700, fontSize: 13 }}>
                ⚠️ No seller selected. Choose the seller first. (For a credit only approved sellers are listed.)
              </div>
            )}
          </div>

          {/* 2. TRANSACTION TYPE TOGGLE (Credit vs Debit) */}
          <div className="afm-section">
            <label className="afm-label">
              <span className="afm-label-main">2. Select Adjustment Action *</span>
            </label>
            <div className="afm-type-toggle-grid">
              <button
                type="button"
                className={`afm-type-card credit ${!isDebit ? 'active' : ''}`}
                onClick={() => setType('credit')}
              >
                <div className="afm-type-icon">💰</div>
                <div className="afm-type-info">
                  <b>Credit Funds (+)</b>
                </div>
                {!isDebit && <div className="afm-type-check">✓ Active</div>}
              </button>

              <button
                type="button"
                className={`afm-type-card debit ${isDebit ? 'active' : ''}`}
                onClick={() => setType('debit')}
              >
                <div className="afm-type-icon">💸</div>
                <div className="afm-type-info">
                  <b>Debit Funds (-)</b>
                </div>
                {isDebit && <div className="afm-type-check">✓ Active</div>}
              </button>
            </div>
          </div>

          {/* 3. DUAL CURRENCY AMOUNT INPUT (INR & USD) */}
          <div className="afm-section">
            <label className="afm-label">
              <span className="afm-label-main">3. Enter Adjustment Amount *</span>
            </label>

            <div className="afm-amount-card">
              {/* Primary: Indian Rupees Input */}
              <div className="afm-currency-field inr-field">
                <div className="afm-currency-header">
                  <span className="afm-currency-title">
                    🇮🇳 Amount in Indian Rupees (₹ INR)
                  </span>
                </div>
                <div className="afm-input-group">
                  <span className="afm-input-prefix">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={inrAmount}
                    onChange={(e) => handleInrChange(e.target.value)}
                    placeholder="e.g. 50000"
                    className="afm-currency-input inr-input"
                  />
                  <span className="afm-input-tag">INR</span>
                </div>
              </div>

              {/* Conversion Rate Indicator */}
              <div className="afm-rate-bridge">
                <span className="afm-bridge-icon">⇅</span>
                <span className="afm-bridge-text">Auto-Conversion: 1 USD ≈ ₹{INR_RATE.toFixed(2)} INR</span>
              </div>

              {/* Secondary: USD Input (Credited to Wallet) */}
              <div className="afm-currency-field usd-field">
                <div className="afm-currency-header">
                  <span className="afm-currency-title text-blue">
                    💵 Amount in US Dollars ($ USD) *
                  </span>
                </div>
                <div className="afm-input-group">
                  <span className="afm-input-prefix">$</span>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={usdAmount}
                    onChange={(e) => handleUsdChange(e.target.value)}
                    placeholder="e.g. 598.80"
                    required
                    className="afm-currency-input usd-input"
                  />
                  <span className="afm-input-tag">USD</span>
                </div>
              </div>
            </div>
          </div>

          {/* 4. BINANCE USDT RATE & CONVERSION (ADMIN INTERNAL) */}
          {!isDebit && (
            <div className="afm-binance-container">
              <div className="afm-binance-header">
                <div className="afm-binance-header-left">
                  <span className="afm-binance-icon">🟡</span>
                  <b className="afm-binance-title">Binance USDT Received</b>
                </div>
                {calcUsdt && (
                  <div className="afm-usdt-pill">
                    <span>{calcUsdt} USDT</span>
                  </div>
                )}
              </div>

              <div className="afm-binance-grid">
                {/* Real INR received */}
                <div>
                  <label className="afm-sublabel">
                    🇮🇳 Indian Rupees Received (₹ INR):
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="e.g. 5000"
                    value={binanceInr}
                    onChange={(e) => setBinanceInr(e.target.value)}
                    className="afm-subinput binance-rate-input"
                  />
                  {parseFloat(inrAmount) > 0 && String(parseFloat(inrAmount)) !== String(parsedBinanceInr) && (
                    <button
                      type="button"
                      onClick={() => setBinanceInr(String(parseFloat(inrAmount)))}
                      className="afm-copy-amt-link"
                    >
                      Copy from above (₹{Number(parseFloat(inrAmount)).toLocaleString('en-IN')})
                    </button>
                  )}
                </div>

                {/* Real USDT received */}
                <div>
                  <label className="afm-sublabel">
                    💎 USDT Received:
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="e.g. 46.45"
                    value={usdtReceived}
                    onChange={(e) => setUsdtReceived(e.target.value)}
                    className="afm-subinput binance-rate-input"
                  />
                </div>

                {/* Worked-out rate (reference only) */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <div className="afm-rate-row">
                    <label className="afm-sublabel" style={{ margin: 0 }}>
                      🟡 Rate:
                    </label>
                    <div className={`afm-usdt-display-box ${parsedBRate > 0 ? 'has-val' : ''}`}>
                      <span className="afm-usdt-val">
                        {parsedBRate > 0 ? `₹${parsedBRate} / USDT` : '—'}
                      </span>
                      {parsedBRate > 0 && (
                        <span className="afm-usdt-calc">
                          (₹{Number(parsedBinanceInr).toFixed(0)} ÷ {calcUsdt})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 5. HELPING AMOUNT */}
          {!isDebit && (
            <div className="afm-helping-container">
              <div className="afm-helping-header">
                <span className="afm-helping-icon">🤝</span>
                <b className="afm-helping-title">Admin Helping Amount ($ USD)</b>
              </div>

              <div className="afm-helping-body">
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.00 (Optional admin help contribution)"
                  value={helpingAmount}
                  onChange={(e) => setHelpingAmount(e.target.value)}
                  className="afm-subinput helping-input"
                />

                {parsedHelping > 0 && parsedUsd > 0 && (
                  <div className="afm-helping-summary-pill">
                    <span>Credited: <b>${parsedUsd.toFixed(2)}</b></span>
                    <span>&bull;</span>
                    <span>Admin Helping: <b style={{ color: '#7c3aed' }}>-${parsedHelping.toFixed(2)}</b></span>
                    <span>&bull;</span>
                    <span>Real Inflow: <b style={{ color: '#059669' }}>+${realSellerInflow.toFixed(2)}</b></span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Warning for excess debit */}
          {isDebit && parseFloat(usdAmount) > currentBalance && (
            <div className="afm-alert afm-alert-warning">
              ⚠️ Warning: Debit amount (${usdAmount}) exceeds seller's current balance ({money(currentBalance)}). Seller's balance will become negative.
            </div>
          )}

          {/* 6. REASON & REFERENCE */}
          <div className="afm-meta-grid">
            <div>
              <label className="afm-sublabel">
                Reason / Notes *
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Order fulfillment funds / Wire verified"
                className="afm-subinput"
                required
              />
              <div className="afm-quick-reasons">
                {REASON_PRESETS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`afm-reason-chip ${reason === r ? 'active' : ''}`}
                    onClick={() => setReason(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="afm-sublabel">
                Bank Ref / UTR # <span className="afm-note-vis">(Optional)</span>
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. UTR982348234 / Cash Receipt #"
                className="afm-subinput"
              />
            </div>
          </div>

          {confirming && selectedSeller && (
            <div style={{ margin: '4px 0 12px', padding: '12px 14px', borderRadius: 10, border: `2px solid ${isDebit ? '#dc2626' : '#16a34a'}`, background: isDebit ? '#fef2f2' : '#f0fdf4' }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>
                Please check: {isDebit ? 'DEBIT' : 'CREDIT'} ${parsedUsd ? parsedUsd.toFixed(2) : '0.00'} {isDebit ? 'from' : 'to'}
              </div>
              <div style={{ fontWeight: 900, fontSize: 18, color: isDebit ? '#b91c1c' : '#15803d' }}>{selectedSeller.storeName || selectedSeller.name}</div>
              <div style={{ fontSize: 13, color: '#334155' }}>{[selectedSeller.name, selectedSeller.email].filter(Boolean).join(' · ')}</div>
              <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>Is this the right seller? Press the button again to confirm, or change the seller above.</div>
            </div>
          )}

          {/* Modal Actions */}
          <div className="afm-footer">
            <button type="button" className="afm-btn-cancel" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button
              type="submit"
              className={`afm-btn-submit ${isDebit ? 'debit' : 'credit'}`}
              disabled={submitting || !selectedSeller || !usdAmount || parseFloat(usdAmount) <= 0}
            >
              {submitting ? (
                'Processing Adjustment...'
              ) : !selectedSeller ? (
                'Select a seller first'
              ) : !confirming ? (
                `Review → ${selectedSeller.storeName || selectedSeller.name}`
              ) : isDebit ? (
                `💸 Confirm Debit -$${parsedUsd ? parsedUsd.toFixed(2) : '0.00'} USD`
              ) : (
                `💰 Confirm & Credit +$${parsedUsd ? parsedUsd.toFixed(2) : '0.00'} USD (₹${parsedInr ? Number(parsedInr).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '0'} INR)`
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
