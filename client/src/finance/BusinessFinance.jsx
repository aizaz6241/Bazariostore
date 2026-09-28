import React, { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
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

  // Active View Tab: 'overview' | 'wallets' | 'partners' | 'ledger' | 'analytics'
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
  const [dateFilter, setDateFilter] = useState('month'); // 'today' | 'week' | 'month' | 'all' | 'custom'
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
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

  // Immediate Lock Screen Action
  const handleLock = () => {
    setIsAuthenticated(false);
    setToken('');
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_PIN_KEY);
  };

  // Calculate query dates based on filter
  const getFilterDates = () => {
    const now = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    if (dateFilter === 'today') return { from: iso(now), to: iso(now) };
    if (dateFilter === 'week') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return { from: iso(d), to: iso(now) };
    }
    if (dateFilter === 'month') {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: iso(d), to: iso(now) };
    }
    if (dateFilter === 'custom') return customRange;
    return { from: '', to: '' };
  };

  // Load Overview & Transactions
  const loadData = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setErrorMsg('');

    try {
      const { from, to } = getFilterDates();
      const q = new URLSearchParams();
      if (from) q.set('from', from);
      if (to) q.set('to', to);

      const [ovData, txData, settsData] = await Promise.all([
        apiFetch(`/overview?${q.toString()}`),
        apiFetch(`/transactions?limit=250`),
        apiFetch(`/settings`),
      ]);

      setOverview(ovData);
      setTransactions(txData.transactions || []);
      setSettings(settsData.settings || null);
    } catch (err) {
      setErrorMsg(err.message || 'Error loading financial data');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, dateFilter, customRange, apiFetch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sync Bazario Transactions Hook
  const handleSyncBazario = async () => {
    setSyncing(true);
    setStatusMsg('');
    setErrorMsg('');
    try {
      const res = await apiFetch('/sync-bazario', { method: 'POST' });
      setStatusMsg(res.message || 'Bazario sync completed!');
      await loadData();
      setTimeout(() => setStatusMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to sync with Bazario');
    } finally {
      setSyncing(false);
    }
  };

  // Save / Update Transaction
  const handleSaveTransaction = async (payload, id = null) => {
    if (id) {
      await apiFetch(`/transactions/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } else {
      await apiFetch('/transactions', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
    loadData();
  };

  // Delete Transaction
  const handleDeleteTransaction = async (id) => {
    await apiFetch(`/transactions/${id}`, { method: 'DELETE' });
    loadData();
  };

  // Binance P2P Convert
  const handleP2pConvert = async (payload) => {
    await apiFetch('/p2p-convert', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStatusMsg(`Successfully converted $${payload.usdtAmount} USDT into ₨ ${payload.pkrAmount.toLocaleString('en-US')}`);
    setTimeout(() => setStatusMsg(''), 4000);
    loadData();
  };

  // Adjust Reinvestment Reserve
  const handleAdjustReserve = async (payload) => {
    await apiFetch('/allocate-reserve', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStatusMsg(payload.action === 'allocate' ? 'USDT locked into Reinvestment Reserve' : 'USDT released to free surplus');
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
  };

  // If locked, render PIN Gate
  if (!isAuthenticated) {
    return <PinLockScreen onUnlock={handleUnlock} defaultPin="7860" />;
  }

  // Shorthands from overview
  const wallets = overview?.wallets || {};
  const binance = wallets.binance || {};
  const pkrWallet = wallets.pkr || {};
  const performance = overview?.performance || {};
  const partners = overview?.partners || {};
  const p1 = partners.partner1 || { name: 'Aizaz', sharePercent: 50, investedPKR: 0, netBalancePKR: 0, drawingsPKR: 0 };
  const p2 = partners.partner2 || { name: 'Partner', sharePercent: 50, investedPKR: 0, netBalancePKR: 0, drawingsPKR: 0 };
  const currentRate = overview?.exchangeRate || settings?.defaultUsdtRate || 278.5;

  // Filter transactions for table
  const filteredTxs = transactions.filter((tx) => {
    if (txTypeFilter !== 'all') {
      if (txTypeFilter === 'expense' && tx.type !== 'expense') return false;
      if (txTypeFilter === 'income' && tx.type !== 'income') return false;
      if (txTypeFilter === 'conversion' && tx.type !== 'conversion') return false;
      if (txTypeFilter === 'partner' && !['investment', 'drawing'].includes(tx.type)) return false;
      if (txTypeFilter === 'synced' && !tx.isAutoSynced) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchDesc = (tx.description || '').toLowerCase().includes(q);
      const matchStore = (tx.bazarioRef?.storeName || '').toLowerCase().includes(q);
      const matchPartner = (tx.partnerName || '').toLowerCase().includes(q);
      const matchNotes = (tx.notes || '').toLowerCase().includes(q);
      if (!matchDesc && !matchStore && !matchPartner && !matchNotes) return false;
    }
    return true;
  });

  // Chart data
  const monthlyChartData = overview?.monthlyChart || [];
  const expensePieData = Object.entries(overview?.expenseBreakdown?.categories || {})
    .filter(([_, val]) => val > 0)
    .map(([cat, val]) => {
      const names = {
        office_food: 'Food & Meals',
        chai_refreshment: 'Chai & Refreshments',
        bills_electricity: 'Electricity Bill',
        bills_internet: 'Internet Fiber',
        office_rent: 'Office Rent',
        staff_salary: 'Staff Salaries',
        marketing: 'Marketing',
        logistics: 'Logistics & Courier',
        seller_withdrawal: 'Seller Payouts',
        reinvestment: 'Inventory Restock',
        misc_expense: 'Misc Expenses',
      };
      return { name: names[cat] || cat, value: val };
    });

  const PIE_COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316', '#64748b'];

  return (
    <div className="bf-root">
      {/* ─── TOP EXECUTIVE APP HEADER ──────────────────────────── */}
      <header className="bf-header">
        <div className="bf-header-inner">
          <div className="bf-brand">
            <div className="bf-brand-icon">💎</div>
            <div>
              <h1 className="bf-brand-title">Bazario Finance</h1>
              <p className="bf-brand-subtitle">Executive Partner Hub</p>
            </div>
          </div>

          <div className="bf-header-actions">
            {/* Live Exchange Rate Pill */}
            <div
              className="bf-rate-badge"
              title="Click to adjust default exchange rate in settings"
              onClick={() => setSettingsModalOpen(true)}
            >
              <span>🇵🇰 1 USDT = ₨ {currentRate}</span>
            </div>

            {/* Sync Bazario Button */}
            <button
              type="button"
              className="bf-icon-btn"
              title="Sync latest seller deposits and payouts from Bazario"
              onClick={handleSyncBazario}
              disabled={syncing}
            >
              <Ic name="refresh" size={17} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
            </button>

            {/* Install Shortcut Modal Trigger */}
            <button
              type="button"
              className="bf-icon-btn"
              title="Add shortcut to mobile home screen"
              onClick={() => setInstallModalOpen(true)}
            >
              <span style={{ fontSize: 16 }}>📲</span>
            </button>

            {/* Settings Button */}
            <button
              type="button"
              className="bf-icon-btn"
              title="Partner profiles & settings"
              onClick={() => setSettingsModalOpen(true)}
            >
              <Ic name="gear" size={17} />
            </button>

            {/* Lock Button */}
            <button
              type="button"
              className="bf-icon-btn danger"
              title="Lock portal immediately"
              onClick={handleLock}
            >
              <Ic name="lock" size={17} />
            </button>
          </div>
        </div>
      </header>

      {/* ─── MAIN CONTAINER ────────────────────────────────────── */}
      <main className="bf-container">
        {/* Status / Alert Toasts */}
        {statusMsg && (
          <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#6ee7b7', fontSize: 13, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>✅ {statusMsg}</span>
            <button onClick={() => setStatusMsg('')} style={{ background: 'none', border: 'none', color: '#6ee7b7', cursor: 'pointer' }}>✕</button>
          </div>
        )}
        {errorMsg && (
          <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#fca5a5', fontSize: 13, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>⚠️ {errorMsg}</span>
            <button onClick={() => setErrorMsg('')} style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {/* Quick Homescreen Banner (Clickable) */}
        <div className="bf-install-pill" onClick={() => setInstallModalOpen(true)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>📲</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#93c5fd' }}>
                Add Bazario Finance to Mobile Home Screen
              </div>
              <div style={{ fontSize: 11, color: 'var(--bf-text-muted)' }}>
                Opens directly like a private finance app with PIN lock.
              </div>
            </div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--bf-blue)' }}>Install →</span>
        </div>

        {/* Date Filter Bar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
            {[
              { id: 'today', label: 'Today' },
              { id: 'week', label: 'This Week' },
              { id: 'month', label: 'This Month' },
              { id: 'all', label: 'All Time' },
              { id: 'custom', label: 'Custom' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                className={`bf-filter-chip ${dateFilter === p.id ? 'active' : ''}`}
                onClick={() => setDateFilter(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {dateFilter === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="date"
                className="bf-input"
                style={{ padding: '6px 10px', fontSize: 12, width: 140 }}
                value={customRange.from}
                onChange={(e) => setCustomRange({ ...customRange, from: e.target.value })}
              />
              <span style={{ color: 'var(--bf-text-dim)' }}>→</span>
              <input
                type="date"
                className="bf-input"
                style={{ padding: '6px 10px', fontSize: 12, width: 140 }}
                value={customRange.to}
                onChange={(e) => setCustomRange({ ...customRange, to: e.target.value })}
              />
            </div>
          )}
        </div>

        {/* ─── 1. PRIMARY ASSET & LIQUIDITY KPI GRID ───────────────── */}
        <div className="bf-kpi-grid">
          {/* Card 1: Binance USDT Wallet */}
          <div className="bf-card gold-accent">
            <div className="bf-card-header">
              <span className="bf-card-label">
                <span style={{ color: 'var(--bf-gold)' }}>💎</span>
                Binance USDT Wallet
              </span>
              <span className="bf-card-pill gold">Crypto Reserve</span>
            </div>

            <div className="bf-card-value">
              ${(binance.totalUSDT || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} <small style={{ fontSize: 16, color: 'var(--bf-gold)' }}>USDT</small>
            </div>
            <div className="bf-card-sub">
              <span>≈ ₨ {(binance.totalPKREquivalent || 0).toLocaleString('en-US')} PKR</span>
            </div>

            {/* Reinvestment Reserve Progress Bar */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700 }}>
                <span style={{ color: 'var(--bf-gold)' }}>🛡️ Reinvestment Reserve:</span>
                <span style={{ color: '#fff' }}>${binance.reinvestmentReserveUSDT || 0} USDT</span>
              </div>
              <div className="bf-progress-bar">
                <div
                  className="bf-progress-fill gold"
                  style={{
                    width: `${Math.min(
                      100,
                      ((binance.reinvestmentReserveUSDT || 0) / Math.max(1, binance.totalUSDT || 1)) * 100
                    )}%`,
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--bf-text-dim)' }}>
                <span>Free Surplus: ${(binance.availableUSDT || 0).toFixed(2)}</span>
                <span>For Seller Payouts</span>
              </div>
            </div>

            <div className="bf-card-actions">
              <button
                type="button"
                className="bf-btn-sm gold"
                onClick={() => setP2pModalOpen(true)}
              >
                <span>🔄 Cashout to PKR</span>
              </button>
              <button
                type="button"
                className="bf-btn-sm"
                onClick={() => setReserveModalOpen(true)}
              >
                <span>🛡️ Adjust Reserve</span>
              </button>
            </div>
          </div>

          {/* Card 2: Liquid PKR Cash & Bank */}
          <div className="bf-card green-accent">
            <div className="bf-card-header">
              <span className="bf-card-label">
                <span style={{ color: 'var(--bf-green)' }}>💵</span>
                PKR Liquid Funds
              </span>
              <span className="bf-card-pill green">Office Cash & Bank</span>
            </div>

            <div className="bf-card-value">
              ₨ {(pkrWallet.balancePKR || 0).toLocaleString('en-US')}
            </div>
            <div className="bf-card-sub">
              <span>≈ ${(Number(pkrWallet.balancePKR || 0) / currentRate).toFixed(2)} USDT</span>
            </div>

            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--bf-text-muted)', lineHeight: 1.6 }}>
              <div>• Funded via Binance P2P cashouts & capital</div>
              <div>• Ready for office food, chai, rent & daily bills</div>
            </div>

            <div className="bf-card-actions">
              <button
                type="button"
                className="bf-btn-sm green"
                onClick={() => {
                  setTxModalData({ type: 'expense', currency: 'PKR', category: 'office_food' });
                  setTxModalOpen(true);
                }}
              >
                <span>🍔 Log Office Expense</span>
              </button>
              <button
                type="button"
                className="bf-btn-sm"
                onClick={() => {
                  setTxModalData({ type: 'income', currency: 'PKR' });
                  setTxModalOpen(true);
                }}
              >
                <span>+ Add Revenue</span>
              </button>
            </div>
          </div>

          {/* Card 3: Business Net Profit / Performance */}
          <div className="bf-card purple-accent">
            <div className="bf-card-header">
              <span className="bf-card-label">
                <span style={{ color: 'var(--bf-purple)' }}>📈</span>
                Net Business Profit
              </span>
              <span className="bf-card-pill purple">
                {dateFilter === 'all' ? 'All Time' : 'Selected Period'}
              </span>
            </div>

            <div
              className="bf-card-value"
              style={{
                color: (performance.periodNetProfitPKR || 0) >= 0 ? '#34d399' : '#f87171',
              }}
            >
              ₨ {(performance.periodNetProfitPKR || 0).toLocaleString('en-US')}
            </div>
            <div className="bf-card-sub">
              <span>
                ≈ ${(performance.periodNetProfitUSDT || 0).toLocaleString('en-US')} USDT (Margin:{' '}
                <b>{performance.profitMarginPercent || 0}%</b>)
              </span>
            </div>

            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, background: 'rgba(0,0,0,0.2)', padding: 10, borderRadius: 10 }}>
              <div>
                <span style={{ fontSize: 11, color: 'var(--bf-text-dim)', textTransform: 'uppercase' }}>Inflow / Revenue</span>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#34d399' }}>
                  ₨ {(performance.periodRevenuePKR || 0).toLocaleString('en-US')}
                </div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--bf-text-dim)', textTransform: 'uppercase' }}>Expenses</span>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f87171' }}>
                  ₨ {(performance.periodExpensePKR || 0).toLocaleString('en-US')}
                </div>
              </div>
            </div>

            <div className="bf-card-actions">
              <button
                type="button"
                className="bf-btn-sm"
                onClick={() => setActiveTab('analytics')}
              >
                <span>📊 View Breakdown</span>
              </button>
            </div>
          </div>
        </div>

        {/* ─── 2. PARTNER EQUITY & BALANCE SECTION ────────────────── */}
        <div className="bf-section-title">
          <span>👥 Partners Capital & Profit Balance</span>
          <span style={{ fontSize: 13, color: 'var(--bf-text-dim)', fontWeight: 600 }}>
            Total Capital: ₨ {(partners.totalCapitalInvestedPKR || 0).toLocaleString('en-US')}
          </span>
        </div>

        <div className="bf-partners-grid">
          {/* Partner 1 Card (You / Aizaz) */}
          <div className="bf-partner-card">
            <div className="bf-partner-header">
              <div className="bf-partner-avatar p1">
                {(p1.name || 'A')[0].toUpperCase()}
              </div>
              <div>
                <h3 className="bf-partner-name">{p1.name || 'Aizaz (You)'}</h3>
                <p className="bf-partner-role">
                  Managing Partner • <b>{p1.sharePercent || 50}% Profit Share</b>
                </p>
              </div>
            </div>

            <div className="bf-partner-stats-grid">
              <div>
                <div className="bf-pstat-label">Capital Invested</div>
                <div className="bf-pstat-val">₨ {(p1.investedPKR || 0).toLocaleString('en-US')}</div>
              </div>
              <div>
                <div className="bf-pstat-label">Profit Earned ({p1.sharePercent}%)</div>
                <div className="bf-pstat-val" style={{ color: '#34d399' }}>
                  ₨ {(p1.profitSharePKR || 0).toLocaleString('en-US')}
                </div>
              </div>
              <div>
                <div className="bf-pstat-label">Personal Drawings</div>
                <div className="bf-pstat-val" style={{ color: '#f87171' }}>
                  ₨ {(p1.drawingsPKR || 0).toLocaleString('en-US')}
                </div>
              </div>
              <div>
                <div className="bf-pstat-label">USDT Equivalent</div>
                <div className="bf-pstat-val" style={{ color: 'var(--bf-gold)' }}>
                  ${(p1.netBalanceUSDT || 0).toLocaleString('en-US')}
                </div>
              </div>
            </div>

            {/* Current Available Partner Balance */}
            <div className="bf-partner-balance-box">
              <div>
                <div className="bf-pbal-title">CURRENT AVAILABLE BALANCE:</div>
                <div className="bf-pbal-amount">
                  ₨ {(p1.netBalancePKR || 0).toLocaleString('en-US')}
                </div>
              </div>
              <div className="bf-pbal-usdt">
                ${(p1.netBalanceUSDT || 0).toLocaleString('en-US')} USDT
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                className="bf-btn-sm"
                onClick={() => {
                  setTxModalData({ type: 'investment', partnerName: p1.name, currency: 'PKR' });
                  setTxModalOpen(true);
                }}
              >
                <span>+ Invest Capital</span>
              </button>
              <button
                type="button"
                className="bf-btn-sm"
                onClick={() => {
                  setTxModalData({ type: 'drawing', partnerName: p1.name, currency: 'PKR' });
                  setTxModalOpen(true);
                }}
              >
                <span>💸 Draw Profit</span>
              </button>
            </div>
          </div>

          {/* Partner 2 Card */}
          <div className="bf-partner-card">
            <div className="bf-partner-header">
              <div className="bf-partner-avatar p2">
                {(p2.name || 'P')[0].toUpperCase()}
              </div>
              <div>
                <h3 className="bf-partner-name">{p2.name || 'Business Partner'}</h3>
                <p className="bf-partner-role">
                  Investment Partner • <b>{p2.sharePercent || 50}% Profit Share</b>
                </p>
              </div>
            </div>

            <div className="bf-partner-stats-grid">
              <div>
                <div className="bf-pstat-label">Capital Invested</div>
                <div className="bf-pstat-val">₨ {(p2.investedPKR || 0).toLocaleString('en-US')}</div>
              </div>
              <div>
                <div className="bf-pstat-label">Profit Earned ({p2.sharePercent}%)</div>
                <div className="bf-pstat-val" style={{ color: '#34d399' }}>
                  ₨ {(p2.profitSharePKR || 0).toLocaleString('en-US')}
                </div>
              </div>
              <div>
                <div className="bf-pstat-label">Personal Drawings</div>
                <div className="bf-pstat-val" style={{ color: '#f87171' }}>
                  ₨ {(p2.drawingsPKR || 0).toLocaleString('en-US')}
                </div>
              </div>
              <div>
                <div className="bf-pstat-label">USDT Equivalent</div>
                <div className="bf-pstat-val" style={{ color: 'var(--bf-gold)' }}>
                  ${(p2.netBalanceUSDT || 0).toLocaleString('en-US')}
                </div>
              </div>
            </div>

            {/* Current Available Partner Balance */}
            <div className="bf-partner-balance-box">
              <div>
                <div className="bf-pbal-title">CURRENT AVAILABLE BALANCE:</div>
                <div className="bf-pbal-amount">
                  ₨ {(p2.netBalancePKR || 0).toLocaleString('en-US')}
                </div>
              </div>
              <div className="bf-pbal-usdt">
                ${(p2.netBalanceUSDT || 0).toLocaleString('en-US')} USDT
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                className="bf-btn-sm"
                onClick={() => {
                  setTxModalData({ type: 'investment', partnerName: p2.name, currency: 'PKR' });
                  setTxModalOpen(true);
                }}
              >
                <span>+ Invest Capital</span>
              </button>
              <button
                type="button"
                className="bf-btn-sm"
                onClick={() => {
                  setTxModalData({ type: 'drawing', partnerName: p2.name, currency: 'PKR' });
                  setTxModalOpen(true);
                }}
              >
                <span>💸 Draw Profit</span>
              </button>
            </div>
          </div>
        </div>

        {/* ─── 3. QUICK 1-CLICK ACTION HUB ────────────────────────── */}
        <div className="bf-actions-row">
          <button
            type="button"
            className="bf-action-btn red"
            onClick={() => {
              setTxModalData({ type: 'expense', category: 'office_food', currency: 'PKR' });
              setTxModalOpen(true);
            }}
          >
            <span>🍔</span>
            <span>+ Log Expense</span>
          </button>

          <button
            type="button"
            className="bf-action-btn green"
            onClick={() => {
              setTxModalData({ type: 'income', currency: 'USDT' });
              setTxModalOpen(true);
            }}
          >
            <span>💰</span>
            <span>+ Add Profit</span>
          </button>

          <button
            type="button"
            className="bf-action-btn gold"
            onClick={() => setP2pModalOpen(true)}
          >
            <span>🔄</span>
            <span>Binance P2P Convert</span>
          </button>

          <button
            type="button"
            className="bf-action-btn blue"
            onClick={() => {
              setTxModalData({ type: 'investment', currency: 'PKR' });
              setTxModalOpen(true);
            }}
          >
            <span>💼</span>
            <span>+ Partner Capital</span>
          </button>

          <button
            type="button"
            className="bf-action-btn"
            onClick={() => setReserveModalOpen(true)}
          >
            <span>🛡️</span>
            <span>Reinvestment Reserve</span>
          </button>

          <button
            type="button"
            className="bf-action-btn"
            onClick={handleSyncBazario}
            disabled={syncing}
          >
            <span>🔗</span>
            <span>{syncing ? 'Syncing...' : 'Sync Bazario'}</span>
          </button>
        </div>

        {/* ─── 4. TRANSACTIONS LEDGER & AUDIT TRAIL ─────────────────── */}
        <div className="bf-ledger-card">
          <div className="bf-ledger-toolbar">
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: '0 0 4px' }}>
                Financial Transactions Ledger
              </h3>
              <p style={{ fontSize: 12, color: 'var(--bf-text-dim)', margin: 0 }}>
                Editable, deletable records with automatic Bazario platform linkage.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                className="bf-search-input"
                placeholder="Search description, store, notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />

              <div className="bf-filter-chips">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'expense', label: 'Expenses' },
                  { id: 'income', label: 'Incomes' },
                  { id: 'partner', label: 'Partners' },
                  { id: 'conversion', label: 'P2P' },
                  { id: 'synced', label: 'Bazario Synced' },
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
          </div>

          <div className="bf-table-responsive">
            <table className="bf-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Wallet / Source</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTxs.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: 'var(--bf-text-dim)' }}>
                      No financial transactions found. Click "+ Log Expense" or "+ Add Profit" to record your first entry!
                    </td>
                  </tr>
                ) : (
                  filteredTxs.map((tx) => {
                    const isIncome = tx.type === 'income';
                    const isExpense = tx.type === 'expense';
                    const isUsdt = tx.currency === 'USDT' || tx.currency === 'USD';

                    return (
                      <tr key={tx._id}>
                        <td>
                          <span className={`bf-type-badge ${tx.type}`}>
                            {tx.type}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 700, color: '#fff' }}>
                            {tx.description}
                          </div>
                          {tx.notes && (
                            <div style={{ fontSize: 11, color: 'var(--bf-text-dim)' }}>
                              {tx.notes}
                            </div>
                          )}
                          {tx.partnerName && (
                            <div style={{ fontSize: 11, color: 'var(--bf-blue)', fontWeight: 600 }}>
                              Partner: {tx.partnerName}
                            </div>
                          )}
                          {tx.isAutoSynced && (
                            <div className="bf-synced-tag">
                              <span>🔗 Bazario {tx.bazarioRef?.type === 'deposit' ? 'Seller Deposit' : 'Seller Payout'}</span>
                              {tx.bazarioRef?.storeName && <span>({tx.bazarioRef.storeName})</span>}
                            </div>
                          )}
                        </td>
                        <td>
                          <div
                            style={{
                              fontWeight: 800,
                              fontSize: 14,
                              color: isIncome ? '#34d399' : isExpense ? '#fb7185' : '#fff',
                            }}
                          >
                            {isIncome ? '+' : isExpense ? '-' : ''}
                            {isUsdt
                              ? `$${Number(tx.amount).toFixed(2)} USDT`
                              : `₨ ${Number(tx.amount).toLocaleString('en-US')}`}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--bf-text-dim)' }}>
                            ≈ {isUsdt ? `₨ ${(tx.amountPKR || 0).toLocaleString('en-US')}` : `$${(tx.amountUSDT || 0).toFixed(2)} USDT`}
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: 12, color: 'var(--bf-text-muted)' }}>
                            {tx.walletSource === 'binance_usdt' && '💎 Binance USDT'}
                            {tx.walletSource === 'binance_reserve' && '🛡️ Reinvestment Reserve'}
                            {tx.walletSource === 'pkr_cash' && '💵 Office Cash Drawer'}
                            {tx.walletSource === 'pkr_bank' && '🏦 Business Bank'}
                            {tx.walletSource === 'partner_pocket' && '👤 Partner Pocket'}
                          </span>
                        </td>
                        <td style={{ color: 'var(--bf-text-muted)', fontSize: 12 }}>
                          {new Date(tx.date).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              className="bf-icon-btn"
                              style={{ width: 30, height: 30 }}
                              title="Edit transaction"
                              onClick={() => {
                                setTxModalData(tx);
                                setTxModalOpen(true);
                              }}
                            >
                              <span style={{ fontSize: 13 }}>✏️</span>
                            </button>
                            <button
                              type="button"
                              className="bf-icon-btn danger"
                              style={{ width: 30, height: 30 }}
                              title="Delete transaction"
                              onClick={() => {
                                if (window.confirm(`Delete transaction "${tx.description}"?`)) {
                                  handleDeleteTransaction(tx._id);
                                }
                              }}
                            >
                              <span style={{ fontSize: 13 }}>🗑️</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ─── 5. ANALYTICS & MONTHLY CHARTS ───────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 30 }}>
          {/* Chart 1: Monthly Revenue vs Expense */}
          <div className="bf-card">
            <h3 style={{ fontSize: 15, fontWeight: 800, color: '#fff', margin: '0 0 16px' }}>
              📊 Monthly Profit & Cashflow Trend
            </h3>
            {monthlyChartData.length === 0 ? (
              <p style={{ color: 'var(--bf-text-dim)', textAlign: 'center', padding: 20 }}>
                Not enough monthly data recorded yet.
              </p>
            ) : (
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="month" stroke="var(--bf-text-dim)" fontSize={11} />
                    <YAxis stroke="var(--bf-text-dim)" fontSize={11} />
                    <Tooltip
                      contentStyle={{ background: '#111827', borderColor: '#374151', borderRadius: 8 }}
                      formatter={(val) => `₨ ${Number(val).toLocaleString('en-US')}`}
                    />
                    <Bar dataKey="revenue" fill="#10b981" name="Inflow / Profit" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expense" fill="#f43f5e" name="Expenses" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Chart 2: Expense Category Breakdown */}
          <div className="bf-card">
            <h3 style={{ fontSize: 15, fontWeight: 800, color: '#fff', margin: '0 0 16px' }}>
              🍔 Expense Category Breakdown
            </h3>
            {expensePieData.length === 0 ? (
              <p style={{ color: 'var(--bf-text-dim)', textAlign: 'center', padding: 20 }}>
                No expenses logged in this period.
              </p>
            ) : (
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expensePieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={75}
                      innerRadius={45}
                      paddingAngle={4}
                    >
                      {expensePieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#111827', borderColor: '#374151', borderRadius: 8 }}
                      formatter={(val) => `₨ ${Number(val).toLocaleString('en-US')}`}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      formatter={(val) => <span style={{ color: '#cbd5e1', fontSize: 11 }}>{val}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ─── MOBILE BOTTOM BAR ─────────────────────────────────────── */}
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
            setTxModalData({ type: 'expense', category: 'office_food', currency: 'PKR' });
            setTxModalOpen(true);
          }}
        >
          <span style={{ fontSize: 18 }}>🍔</span>
          <span>Expense</span>
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
          onClick={() => {
            setTxModalData({ type: 'income', currency: 'USDT' });
            setTxModalOpen(true);
          }}
        >
          <span style={{ fontSize: 18 }}>💰</span>
          <span>Profit</span>
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

      {/* ─── MODALS ────────────────────────────────────────────────── */}
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
