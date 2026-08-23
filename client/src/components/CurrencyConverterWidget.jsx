import React, { useState, useEffect, useRef } from 'react';
import { useCurrency } from '../context/CurrencyContext.jsx';
import Ic from './Icons.jsx';

const POPULAR_CURRENCIES = [
  { code: 'INR', symbol: '₹', flag: '🇮🇳', name: 'Indian Rupee', presets: [1000, 5000, 10000, 20000, 30000, 50000, 100000] },
  { code: 'EUR', symbol: '€', flag: '🇪🇺', name: 'Euro', presets: [25, 50, 100, 250, 500, 1000] },
  { code: 'GBP', symbol: '£', flag: '🇬🇧', name: 'British Pound', presets: [20, 50, 100, 200, 500, 1000] },
  { code: 'AED', symbol: 'د.إ', flag: '🇦🇪', name: 'UAE Dirham', presets: [100, 250, 500, 1000, 2500, 5000] },
  { code: 'CAD', symbol: 'CA$', flag: '🇨🇦', name: 'Canadian Dollar', presets: [50, 100, 250, 500, 1000, 2000] },
  { code: 'AUD', symbol: 'A$', flag: '🇦🇺', name: 'Australian Dollar', presets: [50, 100, 250, 500, 1000, 2000] },
];

export default function CurrencyConverterWidget({
  usdValue = '',
  onUsdChange,
  title = 'Live Currency Calculator & Converter',
  mode = 'deposit', // 'deposit' | 'withdraw'
}) {
  const { rates } = useCurrency();
  const [selectedCode, setSelectedCode] = useState('INR');
  const [localValue, setLocalValue] = useState('');
  const lastActiveSource = useRef(null); // 'local' | 'usd' | 'preset' | null

  const targetCurr = POPULAR_CURRENCIES.find((c) => c.code === selectedCode) || POPULAR_CURRENCIES[0];
  
  // Safe rate lookup (1 USD = X Local Currency)
  const rawRate = Number(rates?.[selectedCode]);
  const rate = rawRate && rawRate > 0 ? rawRate : (selectedCode === 'INR' ? 83.50 : 1.0);

  // Sync Local value ONLY when USD changes from outside (e.g. form reset or parent change)
  useEffect(() => {
    if (lastActiveSource.current === 'local') {
      // User is actively typing local currency; do not overwrite
      return;
    }
    if (!usdValue || isNaN(usdValue) || Number(usdValue) <= 0) {
      setLocalValue('');
    } else {
      const calcLocal = Number(usdValue) * rate;
      setLocalValue(calcLocal > 0 ? (calcLocal >= 100 ? calcLocal.toFixed(0) : calcLocal.toFixed(2)) : '');
    }
  }, [usdValue, rate]);

  // When user types in Local Currency (e.g. 5000 INR or 30000 INR)
  const handleLocalInput = (rawText) => {
    lastActiveSource.current = 'local';
    setLocalValue(rawText);

    const num = parseFloat(rawText);
    if (!rawText || isNaN(num) || num <= 0) {
      onUsdChange?.('');
    } else {
      // 1 USD = rate Local Currency  ==>  USD = num / rate
      const usdCalc = (num / rate).toFixed(2);
      onUsdChange?.(usdCalc);
    }
  };

  // When user types in USD ($)
  const handleUsdInput = (rawText) => {
    lastActiveSource.current = 'usd';
    onUsdChange?.(rawText);

    const num = parseFloat(rawText);
    if (!rawText || isNaN(num) || num <= 0) {
      setLocalValue('');
    } else {
      const localCalc = (num * rate).toFixed(2);
      setLocalValue(localCalc);
    }
  };

  // Preset button click (e.g. ₹5,000 or ₹30,000)
  const handlePresetClick = (amount) => {
    lastActiveSource.current = 'preset';
    setLocalValue(String(amount));
    const usdCalc = (amount / rate).toFixed(2);
    onUsdChange?.(usdCalc);
  };

  // Tab change (e.g. INR -> EUR)
  const handleCurrencyTabChange = (code) => {
    lastActiveSource.current = 'tab';
    setSelectedCode(code);
    const newRawRate = Number(rates?.[code]);
    const newRate = newRawRate && newRawRate > 0 ? newRawRate : (code === 'INR' ? 83.50 : 1.0);

    if (usdValue && !isNaN(usdValue) && Number(usdValue) > 0) {
      const calc = Number(usdValue) * newRate;
      setLocalValue(calc >= 100 ? calc.toFixed(0) : calc.toFixed(2));
    } else if (localValue && !isNaN(localValue) && Number(localValue) > 0) {
      const usdCalc = (Number(localValue) / newRate).toFixed(2);
      onUsdChange?.(usdCalc);
    }
  };

  const parsedUsd = parseFloat(usdValue) || 0;
  const parsedLocal = parseFloat(localValue) || (parsedUsd > 0 ? parsedUsd * rate : 0);

  return (
    <div className="currency-converter-card">
      <div className="ccc-header">
        <div className="ccc-title-wrap">
          <span className="ccc-icon">💱</span>
          <div>
            <b className="ccc-title">{title}</b>
            <span className="ccc-subtitle">
              Enter amount in <b>{targetCurr.code}</b> or <b>USD ($)</b> — both convert in real-time.
            </span>
          </div>
        </div>

        {/* Currency Switcher Tabs */}
        <div className="ccc-tabs">
          {POPULAR_CURRENCIES.map((c) => (
            <button
              key={c.code}
              type="button"
              className={`ccc-tab-btn ${selectedCode === c.code ? 'active' : ''}`}
              onClick={() => handleCurrencyTabChange(c.code)}
            >
              <span className="tab-flag">{c.flag}</span>
              <span className="tab-code">{c.code}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Dual Converter Blocks (Both inputs guaranteed 100% visible) */}
      <div className="ccc-dual-converter-box">
        {/* Block 1: Local Currency Input */}
        <div className="ccc-currency-block local-block">
          <div className="ccc-block-top">
            <span className="ccc-block-title">
              {targetCurr.flag} Amount in {targetCurr.name} ({targetCurr.symbol})
            </span>
            <span className="ccc-badge-sub">Local Currency</span>
          </div>
          <div className="ccc-input-container">
            <span className="ccc-input-symbol">{targetCurr.symbol}</span>
            <input
              type="number"
              min="0"
              step="any"
              value={localValue}
              onFocus={() => { lastActiveSource.current = 'local'; }}
              onChange={(e) => handleLocalInput(e.target.value)}
              placeholder={`e.g. 30,000 ${targetCurr.code}`}
              className="ccc-main-input"
            />
            <span className="ccc-input-tag">{targetCurr.code}</span>
          </div>
        </div>

        {/* Bridge Indicator */}
        <div className="ccc-bridge-divider">
          <div className="ccc-bridge-badge">
            <span className="bridge-icon">⇅</span>
            <span className="bridge-rate">1 USD ≈ {rate.toFixed(2)} {targetCurr.code}</span>
          </div>
        </div>

        {/* Block 2: Converted Main USD Input */}
        <div className="ccc-currency-block usd-block">
          <div className="ccc-block-top">
            <span className="ccc-block-title text-blue">
              💵 Amount in US Dollars ($) *
            </span>
            <span className="ccc-badge-primary">Main Platform Currency</span>
          </div>
          <div className="ccc-input-container usd-focused">
            <span className="ccc-input-symbol usd-sym">$</span>
            <input
              type="number"
              min="0.01"
              step="any"
              value={usdValue}
              onFocus={() => { lastActiveSource.current = 'usd'; }}
              onChange={(e) => handleUsdInput(e.target.value)}
              placeholder="e.g. 100.00"
              required
              className="ccc-main-input usd-input"
            />
            <span className="ccc-input-tag usd-tag">USD ($)</span>
          </div>
        </div>
      </div>

      {/* Quick Amount Presets */}
      <div className="ccc-presets-row">
        <span className="presets-label">⚡ Quick {targetCurr.code} Presets:</span>
        <div className="presets-chips">
          {targetCurr.presets.map((p) => {
            const usdEq = (p / rate).toFixed(2);
            return (
              <button
                key={p}
                type="button"
                className="preset-chip"
                onClick={() => handlePresetClick(p)}
              >
                {targetCurr.symbol}{p.toLocaleString()} <small>(≈${usdEq} USD)</small>
              </button>
            );
          })}
        </div>
      </div>

      {/* Real-Time Calculation Summary Note */}
      {parsedUsd > 0 && (
        <div className="ccc-summary-pill">
          <Ic name="checkCircle" size={16} />
          <span>
            {mode === 'deposit' ? '💰 Deposit Summary:' : '💸 Withdrawal / Adjustment Summary:'}{' '}
            <b>{targetCurr.symbol}{parsedLocal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {targetCurr.code}</b>{' '}
            = <b>${parsedUsd.toFixed(2)} USD</b>{' '}
            {mode === 'deposit' ? 'will be credited to seller wallet' : 'will be processed in wallet'} (Rate: 1 USD = {targetCurr.symbol}{rate.toFixed(2)} {targetCurr.code}).
          </span>
        </div>
      )}
    </div>
  );
}
