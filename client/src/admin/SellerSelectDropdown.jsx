import React, { useState, useEffect, useRef, useMemo } from 'react';
import { money } from '../api.js';
import Ic from '../components/Icons.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';

// Vibrant avatar gradients based on store initial
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', // Blue
  'linear-gradient(135deg, #059669 0%, #047857 100%)', // Emerald
  'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)', // Purple
  'linear-gradient(135deg, #d97706 0%, #b45309 100%)', // Amber
  'linear-gradient(135deg, #e11d48 0%, #be123c 100%)', // Rose
  'linear-gradient(135deg, #0891b2 0%, #0e7490 100%)', // Cyan
  'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)', // Indigo
];

function getStoreGradient(name = '') {
  const code = (name.charCodeAt(0) || 0) + (name.charCodeAt(name.length - 1) || 0);
  return AVATAR_GRADIENTS[code % AVATAR_GRADIENTS.length];
}

export default function SellerSelectDropdown({
  sellers = [],
  value = '',
  onChange,
  placeholder = 'Select target merchant store...',
  disabled = false,
  showBalance = true,
  inrRate: propInrRate,
  className = '',
}) {
  const { rates } = useCurrency();
  const INR_RATE = Number(propInrRate) > 0 ? Number(propInrRate) : Number(rates?.INR) > 0 ? Number(rates.INR) : 83.5;

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  // Find currently selected seller
  const selectedSeller = useMemo(() => {
    if (!value) return null;
    return sellers.find((s) => String(s._id) === String(value)) || null;
  }, [sellers, value]);

  // Filter sellers based on search input
  const filteredSellers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sellers;
    return sellers.filter((s) => {
      const name = (s.storeName || '').toLowerCase();
      const owner = (s.ownerName || '').toLowerCase();
      const email = (s.email || '').toLowerCase();
      const phone = (s.phone || s.contact?.phone || '').toLowerCase();
      const id = String(s._id || '').toLowerCase();
      return name.includes(q) || owner.includes(q) || email.includes(q) || phone.includes(q) || id.includes(q);
    });
  }, [sellers, search]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Auto focus search input when opening
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else if (!isOpen) {
      setSearch('');
    }
  }, [isOpen]);

  const handleSelect = (seller) => {
    if (disabled) return;
    setIsOpen(false);
    if (onChange) {
      onChange(seller._id, seller);
    }
  };

  const isTest = (s) => Boolean(s?.isTestAccount || s?.accountType === 'test');

  return (
    <div className={`seller-picker-wrap ${className}`} ref={containerRef}>
      {/* ─── 1. Trigger Display Button ─── */}
      <button
        type="button"
        className={`seller-picker-trigger ${isOpen ? 'is-open' : ''}`}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="seller-picker-trigger-content">
          {selectedSeller ? (
            <>
              <div
                className="seller-picker-avatar"
                style={{ background: getStoreGradient(selectedSeller.storeName) }}
              >
                {(selectedSeller.storeName?.[0] || 'S').toUpperCase()}
              </div>
              <div className="seller-picker-info">
                <div className="seller-picker-title-row">
                  <span className="seller-picker-store-name" title={selectedSeller.storeName}>
                    {selectedSeller.storeName}
                  </span>
                  {isTest(selectedSeller) && (
                    <span className="seller-picker-badge-test">Test Store</span>
                  )}
                </div>
                <div className="seller-picker-sub">
                  <span className="seller-picker-owner">
                    Owner: {selectedSeller.ownerName || 'Merchant'}
                  </span>
                  {selectedSeller.email && (
                    <>
                      <span>&bull;</span>
                      <span className="seller-picker-email" title={selectedSeller.email}>
                        {selectedSeller.email}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="seller-picker-placeholder">
              <span className="seller-picker-placeholder-icon">🏬</span>
              <span>{placeholder}</span>
            </div>
          )}
        </div>

        <div className="seller-picker-trigger-side">
          {selectedSeller && showBalance && (
            <div className="seller-picker-balance-pill">
              <span className="seller-picker-balance-usd">
                {money(selectedSeller.wallet?.balance || 0)}
              </span>
              <span className="seller-picker-balance-inr">
                ≈ ₹{Math.round((selectedSeller.wallet?.balance || 0) * INR_RATE).toLocaleString('en-IN')}
              </span>
            </div>
          )}
          <div className={`seller-picker-chevron ${isOpen ? 'is-rotated' : ''}`}>
            <Ic name="chevDown" size={16} />
          </div>
        </div>
      </button>

      {/* ─── 2. Floating Dropdown Menu Panel ─── */}
      {isOpen && (
        <div className="seller-picker-popover" role="listbox">
          {/* Search bar */}
          <div className="seller-picker-search-bar">
            <div className="seller-picker-search-input-wrap">
              <span className="seller-picker-search-icon">
                <Ic name="search" size={15} />
              </span>
              <input
                ref={searchInputRef}
                type="text"
                className="seller-picker-search-input"
                placeholder="Search merchant by store name, owner, email, ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="seller-picker-search-clear"
                  onClick={() => setSearch('')}
                  title="Clear search"
                >
                  <Ic name="x" size={14} />
                </button>
              )}
            </div>

            <div className="seller-picker-meta-row">
              <span>
                Showing{' '}
                <b className="seller-picker-count-badge">
                  {filteredSellers.length}
                </b>{' '}
                of {sellers.length} merchant stores
              </span>
              {search && (
                <span>Filter active</span>
              )}
            </div>
          </div>

          {/* Options list */}
          <div className="seller-picker-list">
            {filteredSellers.length === 0 ? (
              <div className="seller-picker-empty">
                <div className="seller-picker-empty-icon">🔍</div>
                <p className="seller-picker-empty-title">No merchant store found</p>
                <p className="seller-picker-empty-desc">
                  No stores matched “{search}”. Check spelling or try searching by owner name.
                </p>
                <button
                  type="button"
                  className="seller-picker-clear-search-btn"
                  onClick={() => setSearch('')}
                >
                  Clear search query
                </button>
              </div>
            ) : (
              filteredSellers.map((s) => {
                const isSelected = String(s._id) === String(value);
                const bal = s.wallet?.balance || 0;
                const inr = Math.round(bal * INR_RATE);
                const locked = s.wallet?.processingFund || 0;

                return (
                  <div
                    key={s._id}
                    className={`seller-picker-item ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => handleSelect(s)}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <div className="seller-picker-item-left">
                      <div
                        className="seller-picker-avatar"
                        style={{ background: getStoreGradient(s.storeName), width: 34, height: 34, fontSize: 14 }}
                      >
                        {(s.storeName?.[0] || 'S').toUpperCase()}
                      </div>
                      <div className="seller-picker-item-info">
                        <div className="seller-picker-item-name-row">
                          <b className="seller-picker-item-name" title={s.storeName}>
                            {s.storeName}
                          </b>
                          {isTest(s) && (
                            <span className="seller-picker-badge-test">Test</span>
                          )}
                        </div>
                        <div className="seller-picker-item-sub">
                          <span>Owner: <b>{s.ownerName || 'Merchant'}</b></span>
                          {s.email && (
                            <>
                              <span>&bull;</span>
                              <span title={s.email}>{s.email}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="seller-picker-item-right">
                      {showBalance && (
                        <div className="seller-picker-item-balance">
                          <span className="seller-picker-item-usd">{money(bal)}</span>
                          <span className="seller-picker-item-inr">≈ ₹{inr.toLocaleString('en-IN')}</span>
                          {locked > 0 && (
                            <span className="seller-picker-item-locked" title="Processing funds locked in confirmed orders">
                              Locked: {money(locked)}
                            </span>
                          )}
                        </div>
                      )}
                      {isSelected && (
                        <div className="seller-picker-check" title="Currently Selected">
                          <Ic name="check" size={13} stroke={2.5} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
