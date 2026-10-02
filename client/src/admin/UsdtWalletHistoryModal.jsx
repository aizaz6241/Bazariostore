import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate } from '../api.js';
import Ic from '../components/Icons.jsx';

export default function UsdtWalletHistoryModal({ isOpen, onClose, initialTab = 'all' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date_desc');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({
    transactions: [],
    summary: { totalNet: 0, grossAmount: 0, helpingAmount: 0, count: 0, uniqueSellers: 0 },
    counts: { all: 0, today: 0, week: 0, month: 0 },
    globalTotals: { total: 0, today: 0, week: 0, month: 0, grossDeposits: 0, helpingAmount: 0 },
  });
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState('');

  // Sync tab with initialTab when opened
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab || 'all');
      setSearch('');
      setMethodFilter('all');
    }
  }, [isOpen, initialTab]);

  // Handle ESC key & scroll locking
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  // Fetch USDT Wallet History
  const fetchHistory = (period = activeTab) => {
    setLoading(true);
    setError('');
    api(`/analytics/usdt-wallet-history?period=${encodeURIComponent(period)}`)
      .then((res) => {
        setData({
          transactions: res.transactions || [],
          summary: res.summary || { totalNet: 0, grossAmount: 0, helpingAmount: 0, count: 0, uniqueSellers: 0 },
          counts: res.counts || { all: 0, today: 0, week: 0, month: 0 },
          globalTotals: res.globalTotals || { total: 0, today: 0, week: 0, month: 0, grossDeposits: 0, helpingAmount: 0 },
        });
      })
      .catch((err) => {
        setError(err.message || 'Failed to load USDT wallet history');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory(activeTab);
    }
  }, [isOpen, activeTab]);

  const fmtUsdt = (val) => {
    const n = Number(val || 0);
    return `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
  };

  const copyToClipboard = (text, id) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(''), 2200);
  };

  // Filter & Sort transactions client-side for ultra-fast response
  const processedTransactions = useMemo(() => {
    let list = [...(data.transactions || [])];

    // Method filter
    if (methodFilter !== 'all') {
      list = list.filter((t) => (t.method || '').toLowerCase() === methodFilter.toLowerCase());
    }

    // Search query
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (t) =>
          (t.storeName && t.storeName.toLowerCase().includes(q)) ||
          (t.ownerName && t.ownerName.toLowerCase().includes(q)) ||
          (t.email && t.email.toLowerCase().includes(q)) ||
          (t.phone && t.phone.toLowerCase().includes(q)) ||
          (t.depositRef && t.depositRef.toLowerCase().includes(q)) ||
          (t.transactionRef && t.transactionRef.toLowerCase().includes(q)) ||
          (t.method && t.method.toLowerCase().includes(q)) ||
          (t.depositNote && t.depositNote.toLowerCase().includes(q))
      );
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'date_desc') return new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt);
      if (sortBy === 'date_asc') return new Date(a.date || a.createdAt) - new Date(b.date || b.createdAt);
      if (sortBy === 'amount_desc') return (b.netUsdt || 0) - (a.netUsdt || 0);
      if (sortBy === 'amount_asc') return (a.netUsdt || 0) - (b.netUsdt || 0);
      return 0;
    });

    return list;
  }, [data.transactions, methodFilter, search, sortBy]);

  // Export filtered transactions to CSV
  const exportToCsv = () => {
    if (!processedTransactions.length) return;
    const headers = [
      'Transaction ID',
      'Date & Time',
      'Store Name',
      'Owner Name',
      'Email',
      'Phone',
      'Net USDT',
      'Gross Amount',
      'Helping Amount',
      'Payment Method',
      'Deposit Ref (UTR)',
      'Deposit Note',
      'Status',
    ];

    const rows = processedTransactions.map((t) => [
      `"${t._id}"`,
      `"${fmtDate(t.date || t.createdAt)}"`,
      `"${(t.storeName || '').replace(/"/g, '""')}"`,
      `"${(t.ownerName || '').replace(/"/g, '""')}"`,
      `"${(t.email || '').replace(/"/g, '""')}"`,
      `"${(t.phone || '').replace(/"/g, '""')}"`,
      t.netUsdt,
      t.grossAmount,
      t.helpingAmount,
      `"${(t.method || '').toUpperCase()}"`,
      `"${(t.depositRef || t.transactionRef || '').replace(/"/g, '""')}"`,
      `"${(t.depositNote || '').replace(/"/g, '""')}"`,
      `"${t.status}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `usdt_wallet_${activeTab}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getRelativeDateLabel = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return 'Today';
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return '';
  };

  if (!isOpen) return null;

  return (
    <div
      className="admin-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 99999,
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
          maxWidth: '1040px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── MODAL HEADER ─── */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e2e8f0',
            background: 'linear-gradient(135deg, #f8fafc 0%, #f0fdf4 100%)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#059669',
                flexShrink: 0,
                boxShadow: '0 2px 6px rgba(16, 185, 129, 0.15)',
              }}
            >
              <Ic name="wallet" size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: 19, fontWeight: 900, color: '#0f172a' }}>
                  USDT Wallet Breakdown &amp; History
                </h2>
                <span
                  style={{
                    background: '#ecfdf5',
                    color: '#047857',
                    border: '1px solid #a7f3d0',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 12,
                  }}
                >
                  Real Client Sellers
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#64748b' }}>
                Verified seller deposits and resulting USDT funds breakdown. Test accounts and previous store sellers are excluded.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Modal"
            style={{
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              width: 34,
              height: 34,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748b',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#0f172a';
              e.currentTarget.style.borderColor = '#94a3b8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#64748b';
              e.currentTarget.style.borderColor = '#cbd5e1';
            }}
          >
            <Ic name="x" size={18} />
          </button>
        </div>

        {/* ─── MODAL BODY (SCROLLABLE) ─── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: '#f8fafc' }}>
          {/* TOP STAT RIBBON */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: 12,
              marginBottom: 18,
            }}
          >
            {/* Net USDT Total */}
            <div
              style={{
                background: '#ffffff',
                border: '1.5px solid #a7f3d0',
                borderRadius: 12,
                padding: '12px 16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: '#047857', textTransform: 'uppercase' }}>
                Net USDT Inflow ({activeTab.toUpperCase()})
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#047857', marginTop: 2 }}>
                {fmtUsdt(data.summary.totalNet)}
              </div>
              <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>
                Available balance contribution
              </div>
            </div>

            {/* Gross Amount */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '12px 16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Gross Deposited
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                {fmtUsdt(data.summary.grossAmount)}
              </div>
              <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>
                Before helping deductions
              </div>
            </div>

            {/* Helping Amount */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '12px 16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Admin Helping
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: data.summary.helpingAmount > 0 ? '#b45309' : '#64748b',
                  marginTop: 2,
                }}
              >
                -{fmtUsdt(data.summary.helpingAmount)}
              </div>
              <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>
                Admin platform support
              </div>
            </div>

            {/* Transactions Count */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '12px 16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Deposits Count
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                {data.summary.count || 0}
              </div>
              <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>
                Approved transactions
              </div>
            </div>

            {/* Unique Sellers */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '12px 16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Active Sellers
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                {data.summary.uniqueSellers || 0}
              </div>
              <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>
                Distinct stores
              </div>
            </div>
          </div>

          {/* ─── CONTROLS: PERIOD TABS + SEARCH + EXPORT ─── */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: 12,
              padding: '14px 16px',
              border: '1px solid #e2e8f0',
              marginBottom: 16,
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            }}
          >
            {/* Timeframe Filter Tabs */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 10,
                borderBottom: '1px solid #f1f5f9',
                paddingBottom: 12,
                marginBottom: 12,
              }}
            >
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { id: 'all', label: 'All Time', count: data.counts.all },
                  { id: 'today', label: 'Today', count: data.counts.today },
                  { id: 'week', label: 'This Week', count: data.counts.week },
                  { id: 'month', label: 'This Month', count: data.counts.month },
                ].map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 8,
                        fontSize: 12.5,
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        background: isActive ? '#0f172a' : '#f1f5f9',
                        color: isActive ? '#ffffff' : '#475569',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 7,
                      }}
                    >
                      <span>{tab.label}</span>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 800,
                          padding: '1px 6px',
                          borderRadius: 10,
                          background: isActive ? '#334155' : '#e2e8f0',
                          color: isActive ? '#f8fafc' : '#64748b',
                        }}
                      >
                        {tab.count || 0}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => fetchHistory(activeTab)}
                  disabled={loading}
                  title="Refresh transactions list"
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: 8,
                    padding: '6px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#475569',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <Ic name="refresh" size={13} />
                  <span>Refresh</span>
                </button>

                <button
                  type="button"
                  onClick={exportToCsv}
                  disabled={processedTransactions.length === 0}
                  title="Export to CSV"
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#0f172a',
                    cursor: processedTransactions.length === 0 ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    opacity: processedTransactions.length === 0 ? 0.5 : 1,
                  }}
                >
                  <Ic name="download" size={14} />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            {/* Search and Secondary Filters */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Search Bar */}
              <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
                <span
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#94a3b8',
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Ic name="search" size={15} />
                </span>
                <input
                  type="text"
                  placeholder="Search store name, seller, reference/UTR, method..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 34px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 12.5,
                    color: '#0f172a',
                    outline: 'none',
                    background: '#ffffff',
                  }}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      padding: 2,
                    }}
                  >
                    <Ic name="x" size={14} />
                  </button>
                )}
              </div>

              {/* Method filter */}
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  fontSize: 12,
                  color: '#334155',
                  background: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                <option value="all">All Payment Methods</option>
                <option value="bank">Bank Transfer</option>
                <option value="upi">UPI / VPA</option>
                <option value="usdt">USDT / Crypto</option>
                <option value="paytm">Paytm</option>
                <option value="gpay">Google Pay</option>
                <option value="phonepe">PhonePe</option>
              </select>

              {/* Sort by */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  fontSize: 12,
                  color: '#334155',
                  background: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                <option value="date_desc">Newest Date First</option>
                <option value="date_asc">Oldest Date First</option>
                <option value="amount_desc">Highest USDT Amount</option>
                <option value="amount_asc">Lowest USDT Amount</option>
              </select>
            </div>
          </div>

          {/* ─── ERROR STATE ─── */}
          {error && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 10,
                padding: '12px 16px',
                color: '#b91c1c',
                fontSize: 13,
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Ic name="alert" size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* ─── LOADING STATE ─── */}
          {loading && (
            <div
              style={{
                background: '#ffffff',
                borderRadius: 12,
                padding: '40px 20px',
                textAlign: 'center',
                color: '#64748b',
                border: '1px solid #e2e8f0',
              }}
            >
              <div
                style={{
                  display: 'inline-block',
                  width: 32,
                  height: 32,
                  border: '3px solid #cbd5e1',
                  borderTopColor: '#059669',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  marginBottom: 10,
                }}
              />
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>Loading USDT transactions history…</p>
            </div>
          )}

          {/* ─── EMPTY STATE ─── */}
          {!loading && !error && processedTransactions.length === 0 && (
            <div
              style={{
                background: '#ffffff',
                borderRadius: 12,
                padding: '50px 20px',
                textAlign: 'center',
                border: '1px solid #e2e8f0',
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: '#f1f5f9',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#94a3b8',
                  marginBottom: 12,
                }}
              >
                <Ic name="wallet" size={28} />
              </div>
              <h4 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                No Transactions Found
              </h4>
              <p style={{ margin: 0, fontSize: 13, color: '#64748b', maxWidth: 440, marginInline: 'auto' }}>
                {search || methodFilter !== 'all'
                  ? 'No USDT transactions match your search or filter criteria. Try clearing filters.'
                  : `There are no approved client deposits recorded for ${
                      activeTab === 'today'
                        ? 'today'
                        : activeTab === 'week'
                        ? 'this week'
                        : activeTab === 'month'
                        ? 'this month'
                        : 'the selected timeframe'
                    }.`}
              </p>
              {(search || methodFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setMethodFilter('all');
                  }}
                  style={{
                    marginTop: 14,
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: 8,
                    padding: '6px 14px',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#0f172a',
                    cursor: 'pointer',
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          )}

          {/* ─── TRANSACTIONS LIST / TABLE ─── */}
          {!loading && !error && processedTransactions.length > 0 && (
            <div
              style={{
                background: '#ffffff',
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12.5 }}>
                  <thead>
                    <tr
                      style={{
                        background: '#f8fafc',
                        borderBottom: '1px solid #e2e8f0',
                        color: '#64748b',
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.4px',
                      }}
                    >
                      <th style={{ padding: '12px 16px' }}>Date &amp; Time</th>
                      <th style={{ padding: '12px 16px' }}>Seller &amp; Store</th>
                      <th style={{ padding: '12px 16px' }}>Net USDT Amount</th>
                      <th style={{ padding: '12px 16px' }}>Deposit Breakdown</th>
                      <th style={{ padding: '12px 16px' }}>Method &amp; Reference (UTR)</th>
                      <th style={{ padding: '12px 16px' }}>Status</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processedTransactions.map((tx, idx) => {
                      const relLabel = getRelativeDateLabel(tx.date || tx.createdAt);
                      const isEven = idx % 2 === 1;

                      return (
                        <tr
                          key={tx._id}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: isEven ? '#fafafa' : '#ffffff',
                            transition: 'background 0.1s ease',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#f0fdf4')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = isEven ? '#fafafa' : '#ffffff')}
                        >
                          {/* 1. Date & Time */}
                          <td style={{ padding: '14px 16px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>
                              {fmtDate(tx.date || tx.createdAt)}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                              {relLabel && (
                                <span
                                  style={{
                                    fontSize: 9.5,
                                    fontWeight: 800,
                                    background: relLabel === 'Today' ? '#dcfce7' : '#e0e7ff',
                                    color: relLabel === 'Today' ? '#15803d' : '#3730a3',
                                    padding: '1px 6px',
                                    borderRadius: 4,
                                    textTransform: 'uppercase',
                                  }}
                                >
                                  {relLabel}
                                </span>
                              )}
                              <span style={{ fontSize: 10.5, color: '#94a3b8' }}>
                                Ref #{String(tx._id).slice(-6)}
                              </span>
                            </div>
                          </td>

                          {/* 2. Seller & Store */}
                          <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: 20,
                                  height: 20,
                                  borderRadius: 4,
                                  background: '#e0f2fe',
                                  color: '#0369a1',
                                }}
                              >
                                <Ic name="package" size={12} />
                              </span>
                              <span style={{ fontWeight: 800, color: '#0f172a', fontSize: 13 }}>
                                {tx.storeName || 'Seller Store'}
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                              {tx.ownerName && <span>{tx.ownerName}</span>}
                              {tx.ownerName && tx.email && <span> · </span>}
                              {tx.email && <span style={{ color: '#475569' }}>{tx.email}</span>}
                            </div>
                            {tx.phone && (
                              <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 1 }}>
                                📞 {tx.phone}
                              </div>
                            )}
                          </td>

                          {/* 3. Net USDT Amount */}
                          <td style={{ padding: '14px 16px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                            <div
                              style={{
                                fontSize: 15,
                                fontWeight: 900,
                                color: '#047857',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <span>+{fmtUsdt(tx.netUsdt)}</span>
                            </div>
                            <div style={{ fontSize: 10, color: '#10b981', fontWeight: 700, marginTop: 1 }}>
                              ✓ Credited to USDT Wallet
                            </div>
                          </td>

                          {/* 4. Deposit Breakdown (Gross & Helping) */}
                          <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                            <div style={{ fontSize: 11.5, color: '#334155' }}>
                              <span>Gross: </span>
                              <b>{fmtUsdt(tx.grossAmount)}</b>
                            </div>
                            {tx.helpingAmount > 0 ? (
                              <div
                                style={{
                                  fontSize: 11,
                                  color: '#b45309',
                                  fontWeight: 600,
                                  marginTop: 2,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <span>Helping: -{fmtUsdt(tx.helpingAmount)}</span>
                                <span
                                  style={{
                                    fontSize: 9.5,
                                    background: '#fef3c7',
                                    color: '#92400e',
                                    padding: '1px 4px',
                                    borderRadius: 3,
                                  }}
                                >
                                  Subsidized
                                </span>
                              </div>
                            ) : (
                              <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2 }}>
                                No helping deduction
                              </div>
                            )}
                            {Number(tx.requestedAmount) !== Number(tx.grossAmount) && (
                              <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
                                Req: {fmtUsdt(tx.requestedAmount)}
                              </div>
                            )}
                          </td>

                          {/* 5. Method & Reference (UTR) */}
                          <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 800,
                                  padding: '2px 7px',
                                  borderRadius: 4,
                                  background:
                                    tx.method === 'usdt'
                                      ? '#ecfdf5'
                                      : tx.method === 'upi'
                                      ? '#f0fdf4'
                                      : '#f8fafc',
                                  color:
                                    tx.method === 'usdt'
                                      ? '#059669'
                                      : tx.method === 'upi'
                                      ? '#16a34a'
                                      : '#475569',
                                  border: '1px solid #e2e8f0',
                                  textTransform: 'uppercase',
                                }}
                              >
                                {tx.method === 'bank'
                                  ? '🏦 Bank'
                                  : tx.method === 'upi'
                                  ? '⚡ UPI'
                                  : tx.method === 'usdt'
                                  ? '💎 USDT'
                                  : tx.method || 'Deposit'}
                              </span>

                              {/* Reference with copy */}
                              {(tx.depositRef || tx.transactionRef) && (
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(tx.depositRef || tx.transactionRef, tx._id)}
                                  title="Click to copy Reference / UTR"
                                  style={{
                                    background: '#f1f5f9',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: 4,
                                    padding: '2px 6px',
                                    fontSize: 10.5,
                                    fontWeight: 700,
                                    color: '#1e293b',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                  }}
                                >
                                  <span>{tx.depositRef || tx.transactionRef}</span>
                                  <Ic name={copiedId === tx._id ? 'check' : 'tag'} size={11} />
                                </button>
                              )}
                            </div>

                            {/* Deposit note if any */}
                            {tx.depositNote && (
                              <div
                                style={{
                                  fontSize: 11,
                                  color: '#64748b',
                                  marginTop: 4,
                                  maxWidth: 260,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                                title={tx.depositNote}
                              >
                                📝 {tx.depositNote}
                              </div>
                            )}
                          </td>

                          {/* 6. Status */}
                          <td style={{ padding: '14px 16px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: '#ecfdf5',
                                color: '#047857',
                                border: '1px solid #a7f3d0',
                                fontSize: 11,
                                fontWeight: 800,
                                padding: '3px 8px',
                                borderRadius: 12,
                              }}
                            >
                              <span
                                style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }}
                              />
                              Approved
                            </span>
                          </td>

                          {/* 7. Action */}
                          <td style={{ padding: '14px 16px', verticalAlign: 'top', textAlign: 'right' }}>
                            <Link
                              to="/admin/withdrawals"
                              onClick={onClose}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: '#ffffff',
                                border: '1px solid #cbd5e1',
                                borderRadius: 6,
                                padding: '4px 8px',
                                fontSize: 11,
                                fontWeight: 700,
                                color: '#0f172a',
                                textDecoration: 'none',
                                transition: 'all 0.15s ease',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = '#94a3b8';
                                e.currentTarget.style.background = '#f8fafc';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = '#cbd5e1';
                                e.currentTarget.style.background = '#ffffff';
                              }}
                            >
                              <span>Payouts</span>
                              <span>→</span>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ─── MODAL FOOTER ─── */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid #e2e8f0',
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Showing</span>
            <b>{processedTransactions.length}</b>
            <span>of</span>
            <b>{data.summary.count || 0}</b>
            <span>transactions</span>
            {search && <span style={{ color: '#047857', fontWeight: 600 }}>(filtered by &quot;{search}&quot;)</span>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link
              to="/admin/withdrawals"
              onClick={onClose}
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                color: '#059669',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <span>Manage All Deposits in Finance Queue</span>
              <span>→</span>
            </Link>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: '#0f172a',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
