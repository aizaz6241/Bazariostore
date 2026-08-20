import React, { useState, useEffect } from 'react';
import { useCurrency } from '../context/CurrencyContext.jsx';
import Ic from './Icons.jsx';

const POPULAR_CURRENCIES = [
  { code: 'INR', symbol: '₹', flag: '🇮🇳', name: 'Indian Rupee', presets: [1000, 5000, 10000, 25000, 50000, 100000] },
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

  const targetCurr = POPULAR_CURRENCIES.find((c) => c.code === selectedCode) || POPULAR_CURRENCIES[0];
  const rate = rates[selectedCode] || (selectedCode === 'INR' ? 83.5 : 1.0);

  // Sync Local value whenever USD value changes from outside
  useEffect(() => {
    if (usdValue === '' || isNaN(usdValue)) {
      setLocalValue('');
    } else {
      const calc = Number(usdValue) * rate;
      setLocalValue(calc > 0 ? (calc >= 100 ? calc.toFixed(0) : calc.toFixed(2)) : '');
    }
  }, [usdValue, rate]);

  const handleUsdInput = (val) => {
    onUsdChange(val);
    if (!val || isNaN(val)) {
      setLocalValue('');
    } else {
      const calc = Number(val) * rate;
      setLocalValue(calc > 0 ? (calc >= 100 ? calc.toFixed(0) : calc.toFixed(2)) : '');
    }
  };

  const handleLocalInput = (val) => {
    setLocalValue(val);
    if (!val || isNaN(val)) {
      onUsdChange('');
    } else {
      const usdCalc = Number(val) / rate;
      onUsdChange(usdCalc > 0 ? usdCalc.toFixed(2) : '');
    }
  };

  const handlePresetClick = (amount) => {
    setLocalValue(String(amount));
    const usdCalc = amount / rate;
    onUsdChange(usdCalc.toFixed(2));
  };

  return (
    <div className="currency-converter-card">
      <div className="ccc-header">
        <div className="ccc-title-wrap">
          <span className="ccc-icon">💱</span>
          <div>
            <b className="ccc-title">{title}</b>
            <span className="ccc-subtitle">
              Platform operates in <b>USD ($)</b>. Convert your local currency in real-time.
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
              onClick={() => {
                setSelectedCode(c.code);
                const newRate = rates[c.code] || (c.code === 'INR' ? 83.5 : 1.0);
                if (usdValue && !isNaN(usdValue)) {
                  const calc = Number(usdValue) * newRate;
                  setLocalValue(calc > 0 ? (calc >= 100 ? calc.toFixed(0) : calc.toFixed(2)) : '');
                }
              }}
            >
              <span className="tab-flag">{c.flag}</span>
              <span className="tab-code">{c.code}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Dual Converter Input Box */}
      <div className="ccc-inputs-grid">
        {/* Local Currency Input */}
        <div className="ccc-field">
          <label>
            <span>Amount in {targetCurr.name} ({targetCurr.symbol})</span>
            <small className="ccc-badge-sub">Local Currency</small>
          </label>
          <div className="ccc-input-group">
            <span className="ccc-prefix">{targetCurr.symbol}</span>
            <input
              type="number"
              min="0"
              step="any"
              value={localValue}
              onChange={(e) => handleLocalInput(e.target.value)}
              placeholder={`e.g. 50,000 ${targetCurr.code}`}
            />
            <span className="ccc-suffix">{targetCurr.code}</span>
          </div>
        </div>

        {/* Swap / Equals Indicator */}
        <div className="ccc-swap-indicator">
          <div className="ccc-equals-sign">⇄</div>
          <span className="ccc-live-rate-tag">1 USD ≈ {rate.toFixed(2)} {targetCurr.code}</span>
        </div>

        {/* Converted USD Input */}
        <div className="ccc-field highlight-usd">
          <label>
            <span>Amount in US Dollars ($) *</span>
            <small className="ccc-badge-primary">Main Platform Currency</small>
          </label>
          <div className="ccc-input-group usd-group">
            <span className="ccc-prefix">$</span>
            <input
              type="number"
              min="1"
              step="any"
              value={usdValue}
              onChange={(e) => handleUsdInput(e.target.value)}
              placeholder="e.g. 100.00"
              required
            />
            <span className="ccc-suffix">USD ($)</span>
          </div>
        </div>
      </div>

      {/* Quick Amount Presets */}
      <div className="ccc-presets-row">
        <span className="presets-label">⚡ Quick {targetCurr.code} Presets:</span>
        <div className="presets-chips">
          {targetCurr.presets.map((p) => {
            const usdEq = (p / rate).toFixed(0);
            return (
              <button
                key={p}
                type="button"
                className="preset-chip"
                onClick={() => handlePresetClick(p)}
              >
                {targetCurr.symbol}{p.toLocaleString()} <small>(~${usdEq})</small>
              </button>
            );
          })}
        </div>
      </div>

      {/* Real-Time Calculation Note */}
      {usdValue > 0 && (
        <div className="ccc-summary-pill">
          <Ic name="checkCircle" size={14} />
          <span>
            {mode === 'deposit' ? 'Adding' : 'Withdrawing'} <b>${Number(usdValue).toFixed(2)} USD</b>{' '}
            which equals approximately <b>{targetCurr.symbol}{Number(localValue || (usdValue * rate)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {targetCurr.code}</b> at live market rate.
          </span>
        </div>
      )}
    </div>
  );
}
