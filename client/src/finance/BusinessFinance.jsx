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
  const officeExpenses = overview?.officeExpenses || {
    totalPKR: 0,
    aizazSharePKR: 0,
    abdullahSharePKR: 0,
    settlement: { status: 'settled', message: 'Hisaab Barabar: All expenses split evenly 50/50' },
  };
  const partners = overview?.partners || {};
  const p1 = partners.partner1 || {
    name: 'Aizaz',
    sharePercent: 50,
    profitShareUSDT: 0,
    profitSharePKR: 0,
    withdrawnUSDT: 0,
    withdrawnPKR: 0,
    remainingInBinanceUSDT: 0,
    remainingInBinancePKR: 0,
    officeExpenseSharePKR: 0,
  };
  const p2 = partners.partner2 || {
    name: 'Abdullah',
    sharePercent: 50,
    profitShareUSDT: 0,
    profitSharePKR: 0,
    withdrawnUSDT: 0,
    withdrawnPKR: 0,
    remainingInBinanceUSDT: 0,
    remainingInBinancePKR: 0,
    officeExpenseSharePKR: 0,
  };
  const currentRate = overview?.exchangeRate || settings?.defaultUsdtRate || 278.5;

  // Filter office expense transactions
  const officeExpenseTxs = transactions.filter(
    (tx) => tx.type === 'expense' && tx.category !== 'seller_withdrawal' && tx.category !== 'reinvestment'
  );

  // Filter transactions for full ledger table
  const filteredTxs = transactions.filter((tx) => {
    if (txTypeFilter !== 'all') {
      if (txTypeFilter === 'office_expense' && (tx.type !== 'expense' || tx.category === 'seller_withdrawal' || tx.category === 'reinvestment')) return false;
      if (txTypeFilter === 'income' && tx.type !== 'income') return false;
      if (txTypeFilter === 'drawing' && tx.type !== 'drawing') return false;
      if (txTypeFilter === 'seller_payout' && tx.category !== 'seller_withdrawal' && tx.type !== 'reserve_transfer') return false;
      if (txTypeFilter === 'conversion' && tx.type !== 'conversion') return false;
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
              <p className="bf-brand-subtitle">Aizaz & Abdullah • 50/50 Partnership</p>
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
                Opens directly like a private finance app with confidential PIN lock.
              </div>
            </div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--bf-blue)' }}>Install →</span>
        </div>

        {/* ─── 1. THE BIG PICTURE: BINANCE & 50/50 PROFIT FORMULA ──── */}
        <div className="bf-formula-row">
          {/* Card A: Total in Binance */}
          <div className="bf-card gold-accent" style={{ padding: 18 }}>
            <div className="bf-card-header">
              <span className="bf-card-label">
                <span style={{ color: 'var(--bf-gold)' }}>💎</span>
                Total in Binance USDT
              </span>
              <span className="bf-card-pill gold">Crypto Wallet</span>
            </div>
            <div className="bf-card-value" style={{ fontSize: 26, margin: '8px 0 2px' }}>
              ${(binance.totalUSDT || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              <small style={{ fontSize: 14, color: 'var(--bf-gold)', marginLeft: 4 }}>USDT</small>
            </div>
            <div className="bf-card-sub" style={{ fontSize: 12 }}>
              <span>≈ ₨ {(binance.totalPKREquivalent || 0).toLocaleString('en-US')} PKR</span>
            </div>
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="bf-btn-sm gold"
                onClick={() => {
                  setTxModalData({ type: 'income', currency: 'USDT', category: 'seller_deposit' });
                  setTxModalOpen(true);
                }}
              >
                <span>+ Add USDT / Income</span>
              </button>
            </div>
          </div>

          {/* Minus Operator */}
          <div className="bf-formula-operator">➖</div>

          {/* Card B: Seller Reinvestment Reserve */}
          <div className="bf-card" style={{ padding: 18, border: '1px solid rgba(245, 158, 11, 0.3)' }}>
            <div className="bf-card-header">
              <span className="bf-card-label">
                <span style={{ color: 'var(--bf-gold)' }}>🛡️</span>
                Seller Reserve (Reinvestment)
              </span>
              <span className="bf-card-pill" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fcd34d' }}>
                For Sellers
              </span>
            </div>
            <div className="bf-card-value" style={{ fontSize: 26, margin: '8px 0 2px', color: '#fcd34d' }}>
              ${(binance.reinvestmentReserveUSDT || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              <small style={{ fontSize: 14, color: 'var(--bf-text-dim)', marginLeft: 4 }}>USDT</small>
            </div>
            <div className="bf-card-sub" style={{ fontSize: 12 }}>
              <span>≈ ₨ {(binance.reservePKREquivalent || 0).toLocaleString('en-US')} PKR</span>
            </div>
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="bf-btn-sm"
                onClick={() => setReserveModalOpen(true)}
              >
                <span>⚙️ Adjust Reserve</span>
              </button>
            </div>
          </div>

          {/* Equals Operator */}
          <div className="bf-formula-operator">🟰</div>

          {/* Card C: Distributable Profit Pool */}
          <div className="bf-card green-accent" style={{ padding: 18 }}>
            <div className="bf-card-header">
              <span className="bf-card-label">
                <span style={{ color: 'var(--bf-green)' }}>💰</span>
                Net Profit Pool (50/50 Split)
              </span>
              <span className="bf-card-pill green">Distributable</span>
            </div>
            <div className="bf-card-value" style={{ fontSize: 26, margin: '8px 0 2px', color: '#34d399' }}>
              ${(binance.profitPoolUSDT || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              <small style={{ fontSize: 14, color: '#34d399', marginLeft: 4 }}>USDT</small>
            </div>
            <div className="bf-card-sub" style={{ fontSize: 12 }}>
              <span>≈ ₨ {(binance.profitPoolPKR || 0).toLocaleString('en-US')} PKR</span>
            </div>
            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--bf-text-dim)', fontWeight: 600 }}>
              Split: 50% Aizaz (${(p1.profitShareUSDT || 0).toFixed(2)}) • 50% Abdullah (${(p2.profitShareUSDT || 0).toFixed(2)})
            </div>
          </div>
        </div>

        {/* ─── 2. PARTNERS 50/50 SPLIT (AIZAZ & ABDULLAH) ──────────── */}
        <div className="bf-section-title">
          <span>👥 Partners 50/50 Share & Wallet Balances</span>
          <span style={{ fontSize: 12, color: 'var(--bf-text-dim)', fontWeight: 600 }}>
            Profit Split: 50% Aizaz • 50% Abdullah
          </span>
        </div>

        <div className="bf-partners-grid" style={{ marginBottom: 28 }}>
          {/* Partner 1 Card (Aizaz) */}
          <div className="bf-partner-card">
            <div className="bf-partner-header">
              <div className="bf-partner-avatar p1">
                {(p1.name || 'A')[0].toUpperCase()}
              </div>
              <div>
                <h3 className="bf-partner-name">{p1.name || 'Aizaz'} (You)</h3>
                <p className="bf-partner-role">
                  Managing Partner • <b>50% Profit Share</b>
                </p>
              </div>
            </div>

            <div className="bf-partner-stats-grid">
              <div>
                <div className="bf-pstat-label">50% Profit Share</div>
                <div className="bf-pstat-val" style={{ color: '#34d399' }}>
                  ${(p1.profitShareUSDT || 0).toLocaleString('en-US')} <small style={{ fontSize: 11, color: 'var(--bf-text-dim)' }}>USDT</small>
                </div>
                <div style={{ fontSize: 11, color: 'var(--bf-text-dim)' }}>₨ {(p1.profitSharePKR || 0).toLocaleString('en-US')}</div>
              </div>

              <div>
                <div className="bf-pstat-label">Withdrawn to Cash</div>
                <div className="bf-pstat-val" style={{ color: '#f87171' }}>
                  -${(p1.withdrawnUSDT || 0).toLocaleString('en-US')} <small style={{ fontSize: 11, color: 'var(--bf-text-dim)' }}>USDT</small>
                </div>
                <div style={{ fontSize: 11, color: 'var(--bf-text-dim)' }}>₨ {(p1.withdrawnPKR || 0).toLocaleString('en-US')}</div>
              </div>

              <div>
                <div className="bf-pstat-label">50% Office Expense</div>
                <div className="bf-pstat-val" style={{ color: '#fb923c' }}>
                  -₨ {(p1.officeExpenseSharePKR || 0).toLocaleString('en-US')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--bf-text-dim)' }}>From cash</div>
              </div>

              <div>
                <div className="bf-pstat-label">Capital Invested</div>
                <div className="bf-pstat-val">
                  ₨ {(p1.investedPKR || 0).toLocaleString('en-US')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--bf-text-dim)' }}>Initial funds</div>
              </div>
            </div>

            {/* Current Available in Binance Wallet for Aizaz */}
            <div className="bf-glow-box">
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--bf-gold)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  ⚡ STILL IN BINANCE WALLET:
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginTop: 2 }}>
                  ${(p1.remainingInBinanceUSDT || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} <small style={{ fontSize: 14, color: 'var(--bf-gold)' }}>USDT</small>
                </div>
                <div style={{ fontSize: 12, color: 'var(--bf-text-dim)', marginTop: 2 }}>
                  ≈ ₨ {(p1.remainingInBinancePKR || 0).toLocaleString('en-US')} PKR
                </div>
              </div>
              <button
                type="button"
                className="bf-btn-sm gold"
                style={{ padding: '10px 16px', fontSize: 13 }}
                onClick={() => {
                  setTxModalData({ type: 'drawing', partnerName: p1.name, currency: 'USDT', walletSource: 'binance_usdt' });
                  setTxModalOpen(true);
                }}
              >
                <span>💸 Withdraw Share</span>
              </button>
            </div>
          </div>

          {/* Partner 2 Card (Abdullah) */}
          <div className="bf-partner-card">
            <div className="bf-partner-header">
              <div className="bf-partner-avatar p2">
                {(p2.name || 'A')[0].toUpperCase()}
              </div>
              <div>
                <h3 className="bf-partner-name">{p2.name || 'Abdullah'}</h3>
                <p className="bf-partner-role">
                  Partner • <b>50% Profit Share</b>
                </p>
              </div>
            </div>

            <div className="bf-partner-stats-grid">
              <div>
                <div className="bf-pstat-label">50% Profit Share</div>
                <div className="bf-pstat-val" style={{ color: '#34d399' }}>
                  ${(p2.profitShareUSDT || 0).toLocaleString('en-US')} <small style={{ fontSize: 11, color: 'var(--bf-text-dim)' }}>USDT</small>
                </div>
                <div style={{ fontSize: 11, color: 'var(--bf-text-dim)' }}>₨ {(p2.profitSharePKR || 0).toLocaleString('en-US')}</div>
              </div>

              <div>
                <div className="bf-pstat-label">Withdrawn to Cash</div>
                <div className="bf-pstat-val" style={{ color: '#f87171' }}>
                  -${(p2.withdrawnUSDT || 0).toLocaleString('en-US')} <small style={{ fontSize: 11, color: 'var(--bf-text-dim)' }}>USDT</small>
                </div>
                <div style={{ fontSize: 11, color: 'var(--bf-text-dim)' }}>₨ {(p2.withdrawnPKR || 0).toLocaleString('en-US')}</div>
              </div>

              <div>
                <div className="bf-pstat-label">50% Office Expense</div>
                <div className="bf-pstat-val" style={{ color: '#fb923c' }}>
                  -₨ {(p2.officeExpenseSharePKR || 0).toLocaleString('en-US')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--bf-text-dim)' }}>From cash</div>
              </div>

              <div>
                <div className="bf-pstat-label">Capital Invested</div>
                <div className="bf-pstat-val">
                  ₨ {(p2.investedPKR || 0).toLocaleString('en-US')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--bf-text-dim)' }}>Initial funds</div>
              </div>
            </div>

            {/* Current Available in Binance Wallet for Abdullah */}
            <div className="bf-glow-box">
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--bf-gold)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  ⚡ STILL IN BINANCE WALLET:
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginTop: 2 }}>
                  ${(p2.remainingInBinanceUSDT || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} <small style={{ fontSize: 14, color: 'var(--bf-gold)' }}>USDT</small>
                </div>
                <div style={{ fontSize: 12, color: 'var(--bf-text-dim)', marginTop: 2 }}>
                  ≈ ₨ {(p2.remainingInBinancePKR || 0).toLocaleString('en-US')} PKR
                </div>
              </div>
              <button
                type="button"
                className="bf-btn-sm gold"
                style={{ padding: '10px 16px', fontSize: 13 }}
                onClick={() => {
                  setTxModalData({ type: 'drawing', partnerName: p2.name, currency: 'USDT', walletSource: 'binance_usdt' });
                  setTxModalOpen(true);
                }}
              >
                <span>💸 Withdraw Share</span>
              </button>
            </div>
          </div>
        </div>

        {/* ─── 3. OFFICE EXPENSES (SPLIT 50/50) ─────────────────────── */}
        <div className="bf-card" style={{ marginBottom: 28, padding: 20 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🍔</span>
                <span>Office Expenses (Split 50/50)</span>
              </h3>
              <p style={{ fontSize: 12, color: 'var(--bf-text-dim)', margin: 0 }}>
                Table, chai, biryani, internet, electricity & bills paid from cash.
              </p>
            </div>

            <button
              type="button"
              className="bf-btn-sm green"
              style={{ padding: '10px 18px', fontSize: 13 }}
              onClick={() => {
                setTxModalData({ type: 'expense', category: 'office_food', currency: 'PKR', walletSource: 'pkr_cash', paidBy: 'both_50_50' });
                setTxModalOpen(true);
              }}
            >
              <span>🍔 + Add Office Expense (Split 50/50)</span>
            </button>
          </div>

          {/* 3 Summary Chips */}
          <div className="bf-stats-strip">
            <div className="bf-stat-chip">
              <span style={{ fontSize: 11, color: 'var(--bf-text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>Total Spent</span>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginTop: 4 }}>
                ₨ {(officeExpenses.totalPKR || 0).toLocaleString('en-US')}
              </div>
            </div>
            <div className="bf-stat-chip">
              <span style={{ fontSize: 11, color: '#93c5fd', textTransform: 'uppercase', fontWeight: 600 }}>{p1.name} (50% Share)</span>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#93c5fd', marginTop: 4 }}>
                ₨ {(officeExpenses.aizazSharePKR || 0).toLocaleString('en-US')}
              </div>
            </div>
            <div className="bf-stat-chip">
              <span style={{ fontSize: 11, color: '#c084fc', textTransform: 'uppercase', fontWeight: 600 }}>{p2.name} (50% Share)</span>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#c084fc', marginTop: 4 }}>
                ₨ {(officeExpenses.abdullahSharePKR || 0).toLocaleString('en-US')}
              </div>
            </div>
          </div>

          {/* Settlement Status Banner */}
          <div className={`bf-settlement-banner ${officeExpenses.settlement?.status === 'settled' ? 'settled' : 'owes'}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>
                {officeExpenses.settlement?.status === 'settled' ? '✅' : '🤝'}
              </span>
              <span>{officeExpenses.settlement?.message}</span>
            </div>
            {officeExpenses.settlement?.status !== 'settled' && (
              <span style={{ fontSize: 11, opacity: 0.8 }}>(Adjust in next cash withdrawal)</span>
            )}
          </div>

          {/* Recent Office Expenses Compact List */}
          <div className="bf-table-responsive" style={{ maxHeight: 280, overflowY: 'auto' }}>
            <table className="bf-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Expense Item</th>
                  <th>Total PKR</th>
                  <th>{p1.name} (50%)</th>
                  <th>{p2.name} (50%)</th>
                  <th>Paid By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {officeExpenseTxs.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--bf-text-dim)' }}>
                      No office expenses logged yet. Click "+ Add Office Expense" to log table, chai, food or bills!
                    </td>
                  </tr>
                ) : (
                  officeExpenseTxs.slice(0, 10).map((tx) => {
                    const pkr = tx.amountPKR || tx.amount;
                    const half = Math.round(pkr * 0.5);
                    return (
                      <tr key={tx._id}>
                        <td style={{ fontSize: 12, color: 'var(--bf-text-muted)' }}>
                          {new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                        </td>
                        <td>
                          <div style={{ fontWeight: 700, color: '#fff' }}>{tx.description}</div>
                          {tx.notes && <div style={{ fontSize: 11, color: 'var(--bf-text-dim)' }}>{tx.notes}</div>}
                        </td>
                        <td style={{ fontWeight: 800, color: '#f87171' }}>
                          ₨ {Number(pkr).toLocaleString('en-US')}
                        </td>
                        <td style={{ color: '#93c5fd', fontWeight: 600 }}>₨ {half.toLocaleString('en-US')}</td>
                        <td style={{ color: '#c084fc', fontWeight: 600 }}>₨ {half.toLocaleString('en-US')}</td>
                        <td>
                          <span style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: 'var(--bf-gold)', fontWeight: 600 }}>
                            {tx.paidBy === 'both_50_50' ? 'Both 50/50' : tx.paidBy ? `Paid by ${tx.paidBy}` : 'Both 50/50'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              className="bf-icon-btn"
                              style={{ width: 28, height: 28 }}
                              title="Edit expense"
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
                              title="Delete expense"
                              onClick={() => {
                                if (window.confirm(`Delete expense "${tx.description}"?`)) {
                                  handleDeleteTransaction(tx._id);
                                }
                              }}
                            >
                              <span style={{ fontSize: 12 }}>🗑️</span>
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

        {/* ─── 4. REINVESTMENT / SELLER RESERVE BOX ─────────────────── */}
        <div className="bf-card" style={{ marginBottom: 28, padding: 18, border: '1px solid rgba(245, 158, 11, 0.25)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                🛡️
              </div>
              <div>
                <h4 style={{ fontSize: 15, fontWeight: 800, color: '#fff', margin: '0 0 4px' }}>
                  Bazario Seller Reserve Pool: ${(binance.reinvestmentReserveUSDT || 0).toFixed(2)} USDT
                </h4>
                <p style={{ fontSize: 12, color: 'var(--bf-text-dim)', margin: 0 }}>
                  Yeh USDT Binance mein mehfooz hain taake Bazario par jab bhi seller withdrawal request kare, usko foran Binance se payout diya ja sake.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="bf-btn-sm gold"
                onClick={() => setReserveModalOpen(true)}
              >
                <span>⚙️ Adjust Reserve Amount</span>
              </button>
              <button
                type="button"
                className="bf-btn-sm"
                onClick={handleSyncBazario}
                disabled={syncing}
              >
                <span>🔗 {syncing ? 'Syncing...' : 'Sync Bazario'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* ─── 5. QUICK 1-CLICK ACTION HUB ────────────────────────── */}
        <div className="bf-actions-row">
          <button
            type="button"
            className="bf-action-btn red"
            onClick={() => {
              setTxModalData({ type: 'expense', category: 'office_food', currency: 'PKR', paidBy: 'both_50_50' });
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
              setTxModalData({ type: 'income', currency: 'USDT', category: 'seller_deposit' });
              setTxModalOpen(true);
            }}
          >
            <span>💰</span>
            <span>+ Add Profit (USDT)</span>
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
              setTxModalData({ type: 'drawing', partnerName: p1.name, currency: 'USDT' });
              setTxModalOpen(true);
            }}
          >
            <span>💸</span>
            <span>Record Withdrawal</span>
          </button>

          <button
            type="button"
            className="bf-action-btn"
            onClick={() => setReserveModalOpen(true)}
          >
            <span>🛡️</span>
            <span>Adjust Reserve</span>
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
                  { id: 'office_expense', label: '🍔 Office Expenses' },
                  { id: 'income', label: '💰 Profit / Inflow' },
                  { id: 'drawing', label: '💸 Partner Withdrawals' },
                  { id: 'seller_payout', label: '🛡️ Seller Payouts' },
                  { id: 'conversion', label: '🔄 P2P' },
                  { id: 'synced', label: '🔗 Bazario Synced' },
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
