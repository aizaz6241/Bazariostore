import { useState, useRef, useEffect } from 'react';
import { useCurrency } from '../context/CurrencyContext.jsx';
import Ic from './Icons.jsx';

export default function CurrencySelector({ compact = false, showLabel = true, className = '' }) {
  const { currency, setCurrency, currencies, rates } = useCurrency();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  const activeCurr = currencies[currency] || currencies.USD;

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [open]);

  return (
    <div className={`currency-selector-wrap ${className}`} ref={dropdownRef}>
      <button
        type="button"
        className={`currency-select-trigger ${compact ? 'compact' : ''} ${open ? 'open' : ''}`}
        onClick={() => setOpen(!open)}
        title="Change Platform Currency (Real-Time Rates)"
        aria-expanded={open}
      >
        <span className="curr-flag">{activeCurr.flag}</span>
        <span className="curr-code">{activeCurr.code}</span>
        <span className="curr-symbol">({activeCurr.symbol})</span>
        <Ic name="chevronDown" size={13} className={`curr-chevron ${open ? 'rotate' : ''}`} />
      </button>

      {open && (
        <div className="currency-dropdown-menu">
          <div className="currency-dropdown-header">
            <span>🌐 Select Currency</span>
            <small>Live Exchange Rates</small>
          </div>
          <div className="currency-list">
            {Object.values(currencies).map((c) => {
              const isSelected = c.code === currency;
              const rate = rates[c.code] || c.defaultRate || 1.0;
              return (
                <button
                  key={c.code}
                  type="button"
                  className={`currency-option-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    setCurrency(c.code);
                    setOpen(false);
                  }}
                >
                  <div className="co-left">
                    <span className="co-flag">{c.flag}</span>
                    <div className="co-meta">
                      <b className="co-code">{c.code} <span className="co-sym">({c.symbol})</span></b>
                      <span className="co-name">{c.name}</span>
                    </div>
                  </div>

                  <div className="co-right">
                    {c.code !== 'USD' && (
                      <span className="co-rate" title={`1 USD = ${rate.toFixed(2)} ${c.code}`}>
                        1$ ≈ {rate >= 10 ? rate.toFixed(1) : rate.toFixed(2)} {c.symbol}
                      </span>
                    )}
                    {isSelected && <Ic name="check" size={14} className="co-check" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
