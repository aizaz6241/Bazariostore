import React, { useState, useEffect, useCallback } from 'react';
import Ic from '../components/Icons.jsx';
import PinLockScreen from './PinLockScreen.jsx';
import TransactionModal from './TransactionModal.jsx';
import P2PConvertModal from './P2PConvertModal.jsx';
import ReserveModal from './ReserveModal.jsx';
import SettingsModal from './SettingsModal.jsx';
import InstallShortcutModal from './InstallShortcutModal.jsx';
import '../styles/businessFinance.css';

const SESSION_TOKEN_KEY = 'bf_partner_session_token';
const SESSION_PIN_KEY = 'bf_partner_saved_pin';

export default function BusinessFinance() {
  // Authentication & Security State
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return Boolean(sessionStorage.getItem(SESSION_TOKEN_KEY) || localStorage.getItem(SESSION_TOKEN_KEY));
  });
  const [token, setToken] = useState(() => {
    return sessionStorage.getItem(SESSION_TOKEN_KEY) || localStorage.getItem(SESSION_TOKEN_KEY) || '';
  });
  const [savedPin, setSavedPin] = useState(() => {
    return sessionStorage.getItem(SESSION_PIN_KEY) || localStorage.getItem(SESSION_PIN_KEY) || '7860';
  });

  // Active Bottom Nav Tab for mobile (scroll trigger)
  const [activeTab, setActiveTab] = useState('overview');

  // Dashboard Data State
  const [overview, setOverview] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Filters
  const [txTypeFilter, setTxTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals State
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txModalData, setTxModalData] = useState(null);
  const [p2pModalOpen, setP2pModalOpen] = useState(false);
  const [reserveModalOpen, setReserveModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [installModalOpen, setInstallModalOpen] = useState(false);

  // Authenticated API request helper
  const apiFetch = useCallback(
    async (path, options = {}) => {
      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        'X-Partner-Pin': savedPin,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`/api/business-finance${path}`, {
        ...options,
        headers,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          handleLock();
        }
        throw new Error(data.message || `Request failed (${res.status})`);
      }
      return data;
    },
    [token, savedPin]
  );

  // Unlock callback from PinLockScreen
  const handleUnlock = (sessionToken, initialSettings, enteredPin) => {
    setIsAuthenticated(true);
    setToken(sessionToken);
    setSavedPin(enteredPin);
    sessionStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
    sessionStorage.setItem(SESSION_PIN_KEY, enteredPin);
    if (initialSettings) setSettings(initialSettings);
  };

  // Lock portal
  const handleLock = () => {
    setIsAuthenticated(false);
    setToken('');
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.removeItem(SESSION_TOKEN_KEY);
  };

  // Main Data Loader
  const loadData = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setErrorMsg('');

    try {
      const [overviewRes, txRes] = await Promise.all([
        apiFetch('/overview'),
        apiFetch('/transactions?limit=200'),
      ]);

      if (overviewRes?.ok) {
        setOverview(overviewRes);
        if (overviewRes.settings) setSettings(overviewRes.settings);
      }
      if (txRes?.ok) {
        setTransactions(txRes.transactions || []);
      }
    } catch (err) {
      console.error('[Finance Load Error]', err);
      setErrorMsg(err.message || 'Failed to load finance data');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, apiFetch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sync Bazario Deposits & Withdrawals
  const handleSyncBazario = async () => {
    setSyncing(true);
    setStatusMsg('');
    try {
      const res = await apiFetch('/sync-bazario', { method: 'POST' });
      setStatusMsg(`Bazario synced! (${res.syncedCount || 0} updated, ${res.skippedCount || 0} already up-to-date)`);
      setTimeout(() => setStatusMsg(''), 4000);
      loadData();
    } catch (err) {
      setErrorMsg(err.message || 'Bazario sync failed');
    } finally {
      setSyncing(false);
    }
  };

  // Save Transaction (Create or Edit)
  const handleSaveTransaction = async (formData) => {
    if (formData._id) {
      await apiFetch(`/transactions/${formData._id}`, {
        method: 'PUT',
        body: JSON.stringify(formData),
      });
      setStatusMsg('Transaction updated successfully');
    } else {
      await apiFetch('/transactions', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      setStatusMsg('New transaction recorded');
    }
    setTimeout(() => setStatusMsg(''), 4000);
    loadData();
  };

  // Delete Transaction
  const handleDeleteTransaction = async (id) => {
    await apiFetch(`/transactions/${id}`, { method: 'DELETE' });
    setStatusMsg('Transaction deleted');
    setTimeout(() => setStatusMsg(''), 3000);
    loadData();
  };

  // Binance P2P Convert
  const handleP2pConvert = async (payload) => {
    await apiFetch('/p2p-convert', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStatusMsg(`Converted $${payload.usdtAmount} USDT into ₨ ${Number(payload.pkrAmount).toLocaleString('en-US')}`);
    setTimeout(() => setStatusMsg(''), 4000);
    loadData();
  };

  // Adjust Reinvestment Reserve
  const handleAdjustReserve = async (payload) => {
    await apiFetch('/allocate-reserve', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStatusMsg(
      payload.targetReserve !== undefined
        ? `Seller reserve updated to $${payload.targetReserve} USDT`
        : payload.action === 'allocate'
        ? 'USDT locked into Seller Reserve'
        : 'USDT released to Net Profit Pool'
    );
    setTimeout(() => setStatusMsg(''), 4000);
    loadData();
  };

  // Save Settings
  const handleSaveSettings = async (newSettings) => {
    const res = await apiFetch('/settings', {
      method: 'PUT',
      body: JSON.stringify(newSettings),
    });
    setSettings(res.settings);
    setStatusMsg('Settings saved successfully');
    setTimeout(() => setStatusMsg(''), 3000);
    loadData();
  };

  // Change PIN
  const handleChangePin = async (currentPin, newPin) => {
    await apiFetch('/update-pin', {
      method: 'POST',
      body: JSON.stringify({ currentPin, newPin }),
    });
    setSavedPin(newPin);
    sessionStorage.setItem(SESSION_PIN_KEY, newPin);
    setStatusMsg('Security PIN changed successfully');
    setTimeout(() => setStatusMsg(''), 3000);
  };

  // If locked, render PIN Gate
  if (!isAuthenticated) {
    return <PinLockScreen onUnlock={handleUnlock} defaultPin="7860" />;
  }

  // Shorthands from overview
  const wallets = overview?.wallets || {};
  const binance = wallets.binance || {};
  const officeExpenses = overview?.officeExpenses || {};
  const partners = overview?.partners || {};
  const p1 = partners.partner1 || { name: 'Aizaz', profitShareUSDT: 0, remainingInBinanceUSDT: 0, withdrawnUSDT: 0 };
  const p2 = partners.partner2 || { name: 'Abdullah', profitShareUSDT: 0, remainingInBinanceUSDT: 0, withdrawnUSDT: 0 };
  const currentRate = overview?.exchangeRate || 278.5;

  // Filter office expense transactions
  const officeExpenseTxs = transactions.filter(
    (tx) => tx.type === 'expense' && tx.category !== 'seller_withdrawal' && tx.category !== 'reinvestment'
  );

  // Filtered transactions for audit feed
  const filteredTxs = transactions.filter((tx) => {
    if (txTypeFilter === 'income' && tx.type !== 'income') return false;
    if (txTypeFilter === 'expense' && (tx.type !== 'expense' || tx.category === 'seller_withdrawal' || tx.category === 'reinvestment')) return false;
    if (txTypeFilter === 'drawing' && tx.type !== 'drawing') return false;
    if (txTypeFilter === 'conversion' && tx.type !== 'conversion') return false;
    if (txTypeFilter === 'reserve' && tx.type !== 'reserve_transfer' && tx.category !== 'seller_withdrawal') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const desc = (tx.description || '').toLowerCase();
      const notes = (tx.notes || '').toLowerCase();
      const pName = (tx.partnerName || '').toLowerCase();
      const store = (tx.bazarioRef?.storeName || '').toLowerCase();
      return desc.includes(q) || notes.includes(q) || pName.includes(q) || store.includes(q);
    }
    return true;
  });

  return (
    <div className="bf-root">
      {/* ─── APP HEADER ────────────────────────────────────────── */}
      <header className="bf-header">
        <div className="bf-header-content">
          <div className="bf-brand">
            <div className="bf-logo-icon">💎</div>
            <div>
              <h1 className="bf-title">Business Finance</h1>
              <p className="bf-subtitle">
                <span className="bf-status-dot"></span>
                <span>{p1.name} & {p2.name} (50/50)</span>
              </p>
            </div>
          </div>

          <div className="bf-header-actions">
            {/* Live Exchange Rate Badge */}
            <div
              className="bf-rate-badge"
              title="Click to adjust default USDT/PKR exchange rate"
              onClick={() => setSettingsModalOpen(true)}
              style={{ cursor: 'pointer' }}
            >
              <span>🇵🇰 1 USDT = ₨ {currentRate}</span>
            </div>

            {/* Sync Bazario Button */}
            <button
              type="button"
              className="bf-icon-btn"
              title="Sync Bazario deposits & seller payouts"
              onClick={handleSyncBazario}
              disabled={syncing}
            >
              <Ic name="refresh" size={17} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
            </button>

            {/* Settings Button */}
            <button
              type="button"
              className="bf-icon-btn"
              title="Configure PIN, Rate & Partners"
              onClick={() => setSettingsModalOpen(true)}
            >
              <Ic name="gear" size={17} />
            </button>

            {/* Lock Button */}
            <button
              type="button"
              className="bf-icon-btn danger"
              title="Lock portal"
              onClick={handleLock}
            >
              <Ic name="lock" size={17} />
            </button>
          </div>
        </div>
      </header>

      {/* ─── MAIN CONTENT ──────────────────────────────────────── */}
      <main className="bf-container">
        {/* Status / Alert Toasts */}
        {statusMsg && (
          <div style={{ padding: '10px 16px', borderRadius: 12, background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#6ee7b7', fontSize: 13, fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>✅ {statusMsg}</span>
            <button onClick={() => setStatusMsg('')} style={{ background: 'none', border: 'none', color: '#6ee7b7', cursor: 'pointer' }}>✕</button>
          </div>
        )}
        {errorMsg && (
          <div style={{ padding: '10px 16px', borderRadius: 12, background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#fca5a5', fontSize: 13, fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>⚠️ {errorMsg}</span>
            <button onClick={() => setErrorMsg('')} style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {/* ─── 1. MASTER BINANCE WALLET HERO CARD ───────────────── */}
        <section className="bf-hero-wallet">
          <div className="bf-hero-top">
            <span className="bf-hero-badge">
              💎 Binance USDT Wallet
            </span>
            <span style={{ fontSize: 11, color: 'var(--bf-text-dim)', fontWeight: 600 }}>
              Live Partner Pool
            </span>
          </div>

          <div className="bf-hero-balance-label">Total Binance Balance</div>
          <div className="bf-hero-amount">
            ${(binance.totalUSDT || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="bf-hero-currency">USDT</span>
          </div>
          <div className="bf-hero-pkr">
            ≈ ₨ {(binance.totalPKREquivalent || 0).toLocaleString('en-US')} PKR
          </div>

          {/* Dual Breakdown Capsules: Reserve & Net Profit */}
          <div className="bf-hero-capsules">
            {/* Capsule 1: Seller Reserve */}
            <div className="bf-capsule reserve">
              <div>
                <div className="bf-capsule-head">
                  <span className="bf-capsule-title">
                    <span>🛡️</span>
                    <span>Seller Reserve</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setReserveModalOpen(true)}
                    style={{
                      background: 'rgba(245, 158, 11, 0.18)',
                      border: '1px solid rgba(245, 158, 11, 0.4)',
                      borderRadius: 6,
                      color: '#fcd34d',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      cursor: 'pointer',
                    }}
                  >
                    ✏️ Edit
                  </button>
                </div>
                <div className="bf-capsule-amount reserve-color">
                  ${(binance.reinvestmentReserveUSDT || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  <small style={{ fontSize: 12, marginLeft: 3, opacity: 0.8 }}>USDT</small>
                </div>
                <div className="bf-capsule-sub">
                  ≈ ₨ {(binance.reservePKREquivalent || 0).toLocaleString('en-US')} • For seller payouts
                </div>
              </div>
            </div>

            {/* Capsule 2: Net Profit Pool */}
            <div className="bf-capsule profit">
              <div>
                <div className="bf-capsule-head">
                  <span className="bf-capsule-title">
                    <span>💰</span>
                    <span>Net Profit Pool</span>
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#34d399', background: 'rgba(16, 185, 129, 0.15)', padding: '2px 6px', borderRadius: 6 }}>
                    50/50 SPLIT
                  </span>
                </div>
                <div className="bf-capsule-amount profit-color">
                  ${(binance.profitPoolUSDT || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  <small style={{ fontSize: 12, marginLeft: 3, opacity: 0.8 }}>USDT</small>
                </div>
                <div className="bf-capsule-sub">
                  ≈ ₨ {(binance.profitPoolPKR || 0).toLocaleString('en-US')} • ${(p1.profitShareUSDT || 0).toFixed(0)} each
                </div>
              </div>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="bf-hero-actions">
            <button
              type="button"
              className="bf-btn-main primary"
              onClick={() => {
                setTxModalData({ type: 'income', currency: 'USDT', category: 'seller_deposit' });
                setTxModalOpen(true);
              }}
            >
              <span>💰</span>
              <span>+ Add Profit (USDT)</span>
            </button>

            <button
              type="button"
              className="bf-btn-main glass"
              onClick={() => setP2pModalOpen(true)}
            >
              <span>🔄</span>
              <span>P2P Cashout</span>
            </button>

            <button
              type="button"
              className="bf-btn-main red-glass"
              onClick={() => {
                setTxModalData({ type: 'expense', category: 'office_food', currency: 'PKR', paidBy: 'both_50_50' });
                setTxModalOpen(true);
              }}
            >
              <span>🍔</span>
              <span>+ Add Kharcha</span>
            </button>
          </div>
        </section>

        {/* ─── 2. PARTNERS 50/50 SHARE CARDS ───────────────────── */}
        <div className="bf-section-title">
          <span>👥 Partners 50/50 Profit Split</span>
          <span className="bf-section-sub">
            Strict 50% {p1.name} • 50% {p2.name}
          </span>
        </div>

        <div className="bf-partners-grid">
          {/* Partner 1 Card (Aizaz) */}
          <div className="bf-partner-card">
            <div>
              <div className="bf-partner-header">
                <div className="bf-partner-avatar p1">
                  {(p1.name || 'A')[0].toUpperCase()}
                </div>
                <div className="bf-partner-info">
                  <h3>{p1.name || 'Aizaz'}</h3>
                  <span className="bf-partner-share-pill">50% Profit Share</span>
                </div>
              </div>

              {/* Glowing Available in Binance Box */}
              <div className="bf-partner-glow">
                <div>
                  <div className="bf-pglow-label">⚡ In Binance Wallet</div>
                  <div className="bf-pglow-amount">
                    ${(p1.remainingInBinanceUSDT || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    <small style={{ fontSize: 13, color: 'var(--bf-gold)', marginLeft: 3 }}>USDT</small>
                  </div>
                  <div className="bf-pglow-pkr">
                    ≈ ₨ {(p1.remainingInBinancePKR || 0).toLocaleString('en-US')} PKR
                  </div>
                </div>
                <button
                  type="button"
                  className="bf-btn-sm gold"
                  style={{ padding: '8px 14px', fontSize: 12, height: 38 }}
                  onClick={() => {
                    setTxModalData({ type: 'drawing', partnerName: p1.name, currency: 'USDT', walletSource: 'binance_usdt' });
                    setTxModalOpen(true);
                  }}
                >
                  <span>💸 Withdraw</span>
                </button>
              </div>

              {/* Stats Row */}
              <div className="bf-partner-stats-row">
                <div className="bf-pstat-item">
                  <div className="bf-pstat-lbl">Total 50% Profit</div>
                  <div className="bf-pstat-num" style={{ color: '#34d399' }}>
                    +${(p1.profitShareUSDT || 0).toFixed(2)} USDT
                  </div>
                </div>
                <div className="bf-pstat-item">
                  <div className="bf-pstat-lbl">Withdrawn to Cash</div>
                  <div className="bf-pstat-num" style={{ color: '#fb7185' }}>
                    -${(p1.withdrawnUSDT || 0).toFixed(2)} USDT
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Partner 2 Card (Abdullah) */}
          <div className="bf-partner-card">
            <div>
              <div className="bf-partner-header">
                <div className="bf-partner-avatar p2">
                  {(p2.name || 'A')[0].toUpperCase()}
                </div>
                <div className="bf-partner-info">
                  <h3>{p2.name || 'Abdullah'}</h3>
                  <span className="bf-partner-share-pill">50% Profit Share</span>
                </div>
              </div>

              {/* Glowing Available in Binance Box */}
              <div className="bf-partner-glow">
                <div>
                  <div className="bf-pglow-label">⚡ In Binance Wallet</div>
                  <div className="bf-pglow-amount">
                    ${(p2.remainingInBinanceUSDT || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    <small style={{ fontSize: 13, color: 'var(--bf-gold)', marginLeft: 3 }}>USDT</small>
                  </div>
                  <div className="bf-pglow-pkr">
                    ≈ ₨ {(p2.remainingInBinancePKR || 0).toLocaleString('en-US')} PKR
                  </div>
                </div>
                <button
                  type="button"
                  className="bf-btn-sm gold"
                  style={{ padding: '8px 14px', fontSize: 12, height: 38 }}
                  onClick={() => {
                    setTxModalData({ type: 'drawing', partnerName: p2.name, currency: 'USDT', walletSource: 'binance_usdt' });
                    setTxModalOpen(true);
                  }}
                >
                  <span>💸 Withdraw</span>
                </button>
              </div>

              {/* Stats Row */}
              <div className="bf-partner-stats-row">
                <div className="bf-pstat-item">
                  <div className="bf-pstat-lbl">Total 50% Profit</div>
                  <div className="bf-pstat-num" style={{ color: '#34d399' }}>
                    +${(p2.profitShareUSDT || 0).toFixed(2)} USDT
                  </div>
                </div>
                <div className="bf-pstat-item">
                  <div className="bf-pstat-lbl">Withdrawn to Cash</div>
                  <div className="bf-pstat-num" style={{ color: '#fb7185' }}>
                    -${(p2.withdrawnUSDT || 0).toFixed(2)} USDT
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── 3. OFFICE EXPENSES (KHARCHA 50/50) ────────────────── */}
        <section className="bf-expense-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: '#fff', margin: '0 0 3px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🍔</span>
                <span>Office Kharcha (Split 50/50)</span>
              </h3>
              <p style={{ fontSize: 12, color: 'var(--bf-text-dim)', margin: 0 }}>
                Chai, biryani, office table, bills & daily expenses split equally.
              </p>
            </div>

            <button
              type="button"
              className="bf-btn-main red-glass"
              style={{ padding: '8px 16px', fontSize: 13 }}
              onClick={() => {
                setTxModalData({ type: 'expense', category: 'office_food', currency: 'PKR', walletSource: 'pkr_cash', paidBy: 'both_50_50' });
                setTxModalOpen(true);
              }}
            >
              <span>🍔 + Add Kharcha</span>
            </button>
          </div>

          {/* Settlement Status Banner */}
          <div className={`bf-settlement-bar ${officeExpenses.settlement?.status === 'settled' ? 'settled' : 'owes'}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>
                {officeExpenses.settlement?.status === 'settled' ? '✅' : '🤝'}
              </span>
              <span>{officeExpenses.settlement?.message || 'All expenses split evenly 50/50'}</span>
            </div>
            {officeExpenses.settlement?.status !== 'settled' && (
              <span style={{ fontSize: 11, opacity: 0.85 }}>(Cash se adjust karein)</span>
            )}
          </div>

          {/* 3 Summary Chips */}
          <div className="bf-expense-chips">
            <div className="bf-expense-chip">
              <span className="bf-echip-label">Total Kharcha</span>
              <div className="bf-echip-val" style={{ color: '#fb7185' }}>
                ₨ {(officeExpenses.totalPKR || 0).toLocaleString('en-US')}
              </div>
            </div>
            <div className="bf-expense-chip">
              <span className="bf-echip-label">{p1.name} (Paid)</span>
              <div className="bf-echip-val" style={{ color: '#93c5fd' }}>
                ₨ {(officeExpenses.aizazPaidPKR || 0).toLocaleString('en-US')}
              </div>
            </div>
            <div className="bf-expense-chip">
              <span className="bf-echip-label">{p2.name} (Paid)</span>
              <div className="bf-echip-val" style={{ color: '#c084fc' }}>
                ₨ {(officeExpenses.abdullahPaidPKR || 0).toLocaleString('en-US')}
              </div>
            </div>
          </div>

          {/* Compact Recent Office Expenses Feed */}
          {officeExpenseTxs.length > 0 && (
            <div style={{ borderTop: '1px solid var(--bf-border-subtle)', paddingTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--bf-text-muted)', marginBottom: 8 }}>
                Recent Kharcha List:
              </div>
              <div className="bf-tx-list">
                {officeExpenseTxs.slice(0, 5).map((tx) => {
                  const pkr = tx.amountPKR || tx.amount;
                  const half = Math.round(pkr * 0.5);
                  return (
                    <div key={tx._id} className="bf-tx-item">
                      <div className="bf-tx-left">
                        <div className="bf-tx-icon expense">
                          {tx.category === 'chai_refreshment' ? '☕' : tx.category === 'bills_electricity' || tx.category === 'bills_internet' ? '⚡' : '🍔'}
                        </div>
                        <div>
                          <div className="bf-tx-desc">{tx.description}</div>
                          <div className="bf-tx-meta">
                            <span>{new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                            <span>•</span>
                            <span style={{ color: 'var(--bf-gold)' }}>
                              {tx.paidBy === 'both_50_50' ? 'Both 50/50' : tx.paidBy ? `Paid by ${tx.paidBy}` : 'Both 50/50'}
                            </span>
                            <span>•</span>
                            <span>Share: ₨ {half.toLocaleString('en-US')} each</span>
                          </div>
                        </div>
                      </div>

                      <div className="bf-tx-right">
                        <div className="bf-tx-amount-box">
                          <div className="bf-tx-amount red">-₨ {Number(pkr).toLocaleString('en-US')}</div>
                        </div>
                        <div className="bf-tx-actions">
                          <button
                            type="button"
                            className="bf-icon-btn"
                            style={{ width: 28, height: 28 }}
                            title="Edit"
                            onClick={() => {
                              setTxModalData(tx);
                              setTxModalOpen(true);
                            }}
                          >
                            <span style={{ fontSize: 12 }}>✏️</span>
                          </button>
                          <button
                            type="button"
                            className="bf-icon-btn danger"
                            style={{ width: 28, height: 28 }}
                            title="Delete"
                            onClick={() => {
                              if (window.confirm(`Delete expense "${tx.description}"?`)) {
                                handleDeleteTransaction(tx._id);
                              }
                            }}
                          >
                            <span style={{ fontSize: 12 }}>🗑️</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* ─── 4. TRANSACTIONS & HISAAB AUDIT FEED ────────────────── */}
        <section className="bf-ledger-card">
          <div className="bf-ledger-toolbar">
            <div className="bf-toolbar-top">
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: '0 0 2px' }}>
                  Transactions & Hisaab History
                </h3>
                <p style={{ fontSize: 11, color: 'var(--bf-text-dim)', margin: 0 }}>
                  Live records, deposits, payouts & withdrawals.
                </p>
              </div>

              <input
                type="text"
                className="bf-search-input"
                placeholder="Search history..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="bf-filter-chips">
              {[
                { id: 'all', label: 'All' },
                { id: 'income', label: '💰 Profits (USDT)' },
                { id: 'expense', label: '🍔 Office Kharcha' },
                { id: 'drawing', label: '💸 Withdrawals' },
                { id: 'conversion', label: '🔄 P2P Cashout' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`bf-filter-chip ${txTypeFilter === f.id ? 'active' : ''}`}
                  onClick={() => setTxTypeFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Transactions List */}
          <div className="bf-tx-list">
            {filteredTxs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--bf-text-dim)' }}>
                <span style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>📝</span>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>No records found</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  Click "+ Add Profit" or "+ Add Kharcha" to log your first business entry.
                </div>
              </div>
            ) : (
              filteredTxs.map((tx) => {
                const isIncome = tx.type === 'income';
                const isExpense = tx.type === 'expense';
                const isDrawing = tx.type === 'drawing';
                const isConversion = tx.type === 'conversion';
                const isUsdt = tx.currency === 'USDT' || tx.currency === 'USD';

                return (
                  <div key={tx._id} className="bf-tx-item">
                    <div className="bf-tx-left">
                      <div className={`bf-tx-icon ${tx.type}`}>
                        {isIncome ? '💰' : isExpense ? '🍔' : isDrawing ? '💸' : isConversion ? '🔄' : '💎'}
                      </div>
                      <div>
                        <div className="bf-tx-desc">{tx.description}</div>
                        <div className="bf-tx-meta">
                          <span>{new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                          <span>•</span>
                          <span>{tx.walletSource === 'binance_usdt' ? 'Binance USDT' : tx.walletSource === 'binance_reserve' ? 'Seller Reserve' : 'Cash Drawer'}</span>
                          {tx.partnerName && (
                            <>
                              <span>•</span>
                              <span style={{ color: '#93c5fd' }}>Partner: {tx.partnerName}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="bf-tx-right">
                      <div className="bf-tx-amount-box">
                        <div className={`bf-tx-amount ${isIncome ? 'green' : isExpense || isDrawing ? 'red' : 'white'}`}>
                          {isIncome ? '+' : isExpense || isDrawing ? '-' : ''}
                          {isUsdt ? `$${Number(tx.amount).toFixed(2)} USDT` : `₨ ${Number(tx.amount).toLocaleString('en-US')}`}
                        </div>
                        <div className="bf-tx-sub">
                          ≈ {isUsdt ? `₨ ${(tx.amountPKR || 0).toLocaleString('en-US')}` : `$${(tx.amountUSDT || 0).toFixed(2)} USDT`}
                        </div>
                      </div>

                      <div className="bf-tx-actions">
                        <button
                          type="button"
                          className="bf-icon-btn"
                          style={{ width: 28, height: 28 }}
                          title="Edit transaction"
                          onClick={() => {
                            setTxModalData(tx);
                            setTxModalOpen(true);
                          }}
                        >
                          <span style={{ fontSize: 12 }}>✏️</span>
                        </button>
                        <button
                          type="button"
                          className="bf-icon-btn danger"
                          style={{ width: 28, height: 28 }}
                          title="Delete transaction"
                          onClick={() => {
                            if (window.confirm(`Delete transaction "${tx.description}"?`)) {
                              handleDeleteTransaction(tx._id);
                            }
                          }}
                        >
                          <span style={{ fontSize: 12 }}>🗑️</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </main>

      {/* ─── MOBILE BOTTOM BAR ─────────────────────────────────── */}
      <nav className="bf-bottom-nav">
        <button
          type="button"
          className={`bf-nav-item ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('overview');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <span style={{ fontSize: 18 }}>📊</span>
          <span>Overview</span>
        </button>

        <button
          type="button"
          className="bf-nav-item"
          onClick={() => {
            setTxModalData({ type: 'income', currency: 'USDT', category: 'seller_deposit' });
            setTxModalOpen(true);
          }}
        >
          <span style={{ fontSize: 18 }}>💰</span>
          <span>+ Profit</span>
        </button>

        <button
          type="button"
          className="bf-nav-item"
          onClick={() => {
            setTxModalData({ type: 'expense', category: 'office_food', currency: 'PKR', paidBy: 'both_50_50' });
            setTxModalOpen(true);
          }}
        >
          <span style={{ fontSize: 18 }}>🍔</span>
          <span>+ Kharcha</span>
        </button>

        <button
          type="button"
          className="bf-nav-item"
          onClick={() => setP2pModalOpen(true)}
        >
          <span style={{ fontSize: 18 }}>🔄</span>
          <span>P2P Cashout</span>
        </button>

        <button
          type="button"
          className="bf-nav-item"
          onClick={() => setSettingsModalOpen(true)}
        >
          <span style={{ fontSize: 18 }}>⚙️</span>
          <span>Settings</span>
        </button>
      </nav>

      {/* ─── MODALS ────────────────────────────────────────────── */}
      <TransactionModal
        isOpen={txModalOpen}
        onClose={() => setTxModalOpen(false)}
        onSave={handleSaveTransaction}
        onDelete={handleDeleteTransaction}
        initialData={txModalData}
        currentRate={currentRate}
        partnerNames={{ p1: p1.name, p2: p2.name }}
      />

      <P2PConvertModal
        isOpen={p2pModalOpen}
        onClose={() => setP2pModalOpen(false)}
        onConvert={handleP2pConvert}
        currentUsdtBalance={binance.totalUSDT || 0}
        defaultRate={currentRate}
      />

      <ReserveModal
        isOpen={reserveModalOpen}
        onClose={() => setReserveModalOpen(false)}
        onAdjust={handleAdjustReserve}
        currentReserve={binance.reinvestmentReserveUSDT || 0}
        totalUsdt={binance.totalUSDT || 0}
      />

      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        settings={settings}
        onSaveSettings={handleSaveSettings}
        onChangePin={handleChangePin}
      />

      <InstallShortcutModal
        isOpen={installModalOpen}
        onClose={() => setInstallModalOpen(false)}
      />
    </div>
  );
}
