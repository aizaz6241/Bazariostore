'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  Filter,
  TrendingUp,
  TrendingDown,
  Clock,
  Shield,
  Award,
  DollarSign,
  PlusCircle,
  Loader2,
  RefreshCw,
  Search,
  CheckCircle2,
} from 'lucide-react';

export default function WalletModal({ isOpen, onClose, memberId = null, title = null }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('all'); // 'today', 'yesterday', 'week', 'month', 'custom', 'all'
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [searchTx, setSearchTx] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('all'); // 'all', 'INR', 'PKR'

  // Payout / Withdrawal Modal state
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutCurrency, setPayoutCurrency] = useState('PKR');
  const [payoutNote, setPayoutNote] = useState('');
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutMsg, setPayoutMsg] = useState({ text: '', type: '' });

  const fetchWallet = async (selectedPeriod = period, start = customStart, end = customEnd) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('portal_token');
      let url = `/api/wallet?period=${selectedPeriod}`;
      if (memberId) url += `&memberId=${memberId}`;
      if (selectedPeriod === 'custom') {
        if (start) url += `&startDate=${start}`;
        if (end) url += `&endDate=${end}`;
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        console.error('Failed to load wallet data');
      }
    } catch (err) {
      console.error('Fetch wallet statement error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchWallet(period, customStart, customEnd);
    }
  }, [isOpen, memberId, period]);

  // Handle period change
  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
    if (newPeriod !== 'custom') {
      fetchWallet(newPeriod);
    }
  };

  const handleApplyCustom = (e) => {
    e?.preventDefault();
    if (!customStart && !customEnd) return;
    fetchWallet('custom', customStart, customEnd);
  };

  // Submit Payout / Withdrawal
  const handlePayoutSubmit = async (e) => {
    e?.preventDefault();
    if (!payoutAmount || Number(payoutAmount) <= 0) {
      setPayoutMsg({ text: 'Please enter a valid payout amount', type: 'error' });
      return;
    }

    try {
      setPayoutLoading(true);
      setPayoutMsg({ text: '', type: '' });
      const token = localStorage.getItem('portal_token');

      const res = await fetch('/api/wallet/payout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: memberId || data?.user?._id,
          amount: Number(payoutAmount),
          currency: payoutCurrency,
          note: payoutNote.trim(),
        }),
      });

      if (res.ok) {
        setPayoutMsg({ text: 'Payout recorded and deducted from wallet!', type: 'success' });
        setPayoutAmount('');
        setPayoutNote('');
        setTimeout(() => {
          setShowPayoutForm(false);
          setPayoutMsg({ text: '', type: '' });
          fetchWallet();
        }, 1200);
      } else {
        const errJson = await res.json();
        setPayoutMsg({ text: errJson.message || 'Failed to record payout', type: 'error' });
      }
    } catch (err) {
      setPayoutMsg({ text: 'Network error recording payout', type: 'error' });
    } finally {
      setPayoutLoading(false);
    }
  };

  if (!isOpen) return null;

  const isAdmin = data?.user?.role === 'admin';
  const balances = data?.balances || { balanceINR: 0, balancePKR: 0, totalEarnedINR: 0, totalEarnedPKR: 0 };
  const periodTotals = data?.periodTotals || { earnedINR: 0, earnedPKR: 0, withdrawnINR: 0, withdrawnPKR: 0, netINR: 0, netPKR: 0 };
  const transactions = (data?.transactions || []).filter((tx) => {
    if (currencyFilter !== 'all' && tx.currency !== currencyFilter) return false;
    if (!searchTx.trim()) return true;
    const q = searchTx.toLowerCase().trim();
    return (
      tx.description?.toLowerCase().includes(q) ||
      tx.storeName?.toLowerCase().includes(q) ||
      tx.sourceRef?.toLowerCase().includes(q) ||
      tx.details?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-[999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-scale-up">
        {/* ── Header ── */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white flex items-center justify-center font-bold shadow-md shadow-emerald-500/20">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-extrabold text-base sm:text-lg leading-tight">
                {title || (isAdmin ? 'Admin Profit & Operations Wallet' : `${data?.user?.name || 'Member'} Wallet Statement`)}
              </h2>
              <p className="text-xs text-slate-300">
                {isAdmin
                  ? `Live Admin Pool • Shared 50-50 across ${data?.activeAdminsCount || 2} active Admins`
                  : 'Client Store Commissions, 50% INR Splits & Approved Milestone Bonuses'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => fetchWallet()}
              disabled={loading}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Refresh statement"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5 bg-slate-50/50">
          {/* ── 1. Top Balance Showcase Cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* INR Wallet Card (Indian Rupees) */}
            <div className="bg-gradient-to-br from-purple-700 via-indigo-700 to-indigo-800 rounded-3xl p-5 text-white shadow-lg shadow-indigo-600/15 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-purple-200 flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>INR Balance (₹)</span>
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/20 text-white font-semibold">
                  {isAdmin ? '50% Admin Split' : '50% INR Stores'}
                </span>
              </div>

              <div className="mt-2.5">
                <h3 className="text-2xl sm:text-3xl font-black tracking-tight">
                  ₹{balances.balanceINR.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  <span className="text-xs sm:text-sm font-normal text-purple-200 ml-1.5">INR</span>
                </h3>
              </div>

              <div className="flex items-center justify-between text-[11px] text-purple-200/90 mt-3 pt-3 border-t border-white/15">
                <span>Earned: <strong>₹{balances.totalEarnedINR.toLocaleString()}</strong></span>
                <span>Withdrawn: <strong>₹{balances.totalWithdrawnINR.toLocaleString()}</strong></span>
              </div>
            </div>

            {/* PKR Wallet Card (Pakistani Rupees) */}
            <div className="bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 rounded-3xl p-5 text-white shadow-lg shadow-emerald-600/15 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-200 flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
                  <span>PKR Balance (Rs)</span>
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/20 text-white font-semibold">
                  1 INR = 1 PKR + Rewards
                </span>
              </div>

              <div className="mt-2.5">
                <h3 className="text-2xl sm:text-3xl font-black tracking-tight">
                  Rs {balances.balancePKR.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  <span className="text-xs sm:text-sm font-normal text-emerald-200 ml-1.5">PKR</span>
                </h3>
              </div>

              <div className="flex items-center justify-between text-[11px] text-emerald-200/90 mt-3 pt-3 border-t border-white/15">
                <span>Earned: <strong>Rs {balances.totalEarnedPKR.toLocaleString()}</strong></span>
                <span>Withdrawn: <strong>Rs {balances.totalWithdrawnPKR.toLocaleString()}</strong></span>
              </div>
            </div>
          </div>

          {/* ── 2. Time Range Filter Buttons (Daily, Weekly, Monthly, Custom) ── */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center space-x-1 sm:space-x-1.5 overflow-x-auto pb-1 sm:pb-0 w-full sm:w-auto">
                {[
                  { key: 'today', label: 'Today (Daily)' },
                  { key: 'yesterday', label: 'Yesterday' },
                  { key: 'week', label: 'This Week' },
                  { key: 'month', label: 'This Month' },
                  { key: 'all', label: 'All Time' },
                  { key: 'custom', label: 'Custom Range 🗓️' },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => handlePeriodChange(item.key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                      period === item.key
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Action: Record Payout / Withdrawal */}
              <button
                onClick={() => setShowPayoutForm(!showPayoutForm)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition flex items-center space-x-1 shadow-xs ml-auto"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>{showPayoutForm ? 'Close Payout' : 'Record Payout / Withdraw'}</span>
              </button>
            </div>

            {/* Custom Date Range Picker */}
            {period === 'custom' && (
              <form onSubmit={handleApplyCustom} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center gap-2.5 animate-fade-in text-xs">
                <span className="font-bold text-slate-700">Custom Date Range:</span>
                <div className="flex items-center space-x-1.5">
                  <span className="text-slate-400">From:</span>
                  <input
                    type="date"
                    required
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="p-1.5 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-slate-400">To:</span>
                  <input
                    type="date"
                    required
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="p-1.5 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition"
                >
                  Apply Filter
                </button>
              </form>
            )}
          </div>

          {/* ── 3. Record Payout Drawer Form ── */}
          {showPayoutForm && (
            <div className="bg-amber-50/70 border border-amber-200 p-4 rounded-2xl space-y-3 animate-scale-up">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-amber-900 text-xs sm:text-sm flex items-center space-x-1.5">
                  <DollarSign className="w-4 h-4 text-amber-600" />
                  <span>Record Official Payout / Withdrawal</span>
                </h4>
                <button onClick={() => setShowPayoutForm(false)} className="text-amber-700 hover:text-amber-900">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {payoutMsg.text && (
                <div className={`p-2.5 rounded-xl text-xs font-semibold ${payoutMsg.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'}`}>
                  {payoutMsg.text}
                </div>
              )}

              <form onSubmit={handlePayoutSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Amount</label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    placeholder="e.g. 50000"
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(e.target.value)}
                    className="w-full p-2 rounded-xl bg-white border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Currency</label>
                  <select
                    value={payoutCurrency}
                    onChange={(e) => setPayoutCurrency(e.target.value)}
                    className="w-full p-2 rounded-xl bg-white border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 font-semibold"
                  >
                    <option value="PKR">PKR (Rs)</option>
                    <option value="INR">INR (₹)</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Payout Note / Receipt / Method</label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      placeholder="e.g. Bank Transfer UTR: 991288 or Cash in Hand"
                      value={payoutNote}
                      onChange={(e) => setPayoutNote(e.target.value)}
                      className="flex-1 p-2 rounded-xl bg-white border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <button
                      type="submit"
                      disabled={payoutLoading}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shrink-0 transition flex items-center space-x-1"
                    >
                      {payoutLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Confirm</span>}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* ── 4. Period Financial Summary Pills ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-white p-3 rounded-2xl border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Period Inflow (INR)</span>
              <p className="text-base sm:text-lg font-black text-purple-700 mt-0.5">
                +₹{periodTotals.earnedINR.toLocaleString()}
              </p>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Period Inflow (PKR)</span>
              <p className="text-base sm:text-lg font-black text-emerald-600 mt-0.5">
                +Rs {periodTotals.earnedPKR.toLocaleString()}
              </p>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Payouts Withdrawn</span>
              <p className="text-base sm:text-lg font-black text-red-600 mt-0.5">
                {periodTotals.withdrawnINR > 0 ? `-₹${periodTotals.withdrawnINR.toLocaleString()} ` : ''}
                {periodTotals.withdrawnPKR > 0 ? `-Rs ${periodTotals.withdrawnPKR.toLocaleString()}` : ''}
                {periodTotals.withdrawnINR === 0 && periodTotals.withdrawnPKR === 0 ? '0' : ''}
              </p>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Transactions in Range</span>
              <p className="text-base sm:text-lg font-black text-slate-900 mt-0.5">
                {periodTotals.count} {periodTotals.count === 1 ? 'entry' : 'entries'}
              </p>
            </div>
          </div>

          {/* ── 5. Search & Currency Filter for Ledger ── */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTx}
                onChange={(e) => setSearchTx(e.target.value)}
                placeholder="Search transactions by store, UTR or description..."
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center space-x-1.5">
              <span className="text-[11px] font-bold text-slate-500">Currency:</span>
              <select
                value={currencyFilter}
                onChange={(e) => setCurrencyFilter(e.target.value)}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-none"
              >
                <option value="all">All Currencies</option>
                <option value="INR">INR (₹) Only</option>
                <option value="PKR">PKR (Rs) Only</option>
              </select>
            </div>
          </div>

          {/* ── 6. Transactions Ledger ── */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            {loading ? (
              <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                <span>Loading financial ledger...</span>
              </div>
            ) : transactions.length === 0 ? (
              <div className="py-16 text-center p-6">
                <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="font-bold text-slate-700 text-sm">No transactions found</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  No deposits, commissions, or payouts match the selected period filter ({period}).
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto divide-y divide-slate-100">
                {transactions.map((tx) => {
                  const isCredit = tx.type === 'credit';
                  const isINR = tx.currency === 'INR';
                  const formattedDate = new Date(tx.date).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={tx.id}
                      className="p-3.5 hover:bg-slate-50/80 transition flex items-center justify-between gap-3 text-xs"
                    >
                      {/* Left: Direction Icon & Details */}
                      <div className="flex items-center space-x-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${
                            isCredit
                              ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                              : 'bg-red-50 text-red-600 border border-red-100'
                          }`}
                        >
                          {isCredit ? (
                            <ArrowDownLeft className="w-4 h-4" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center space-x-1.5 flex-wrap">
                            <span className="font-bold text-slate-900 truncate">
                              {tx.description}
                            </span>
                            {/* Commission Model / Type Badge */}
                            {tx.category === 'commission_inr_50' && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-700">
                                🇮🇳 50% INR
                              </span>
                            )}
                            {tx.category === 'admin_share_inr_50' && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-100 text-indigo-700">
                                🇮🇳 Admin 50-50 Split
                              </span>
                            )}
                            {tx.category === 'commission_pkr_1to1' && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700">
                                🇵🇰 1:1 PKR
                              </span>
                            )}
                            {tx.category === 'admin_share_pkr_1to1' && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-700">
                                💼 Admin Share
                              </span>
                            )}
                            {tx.category === 'bonus_reward' && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800">
                                🎁 Bonus
                              </span>
                            )}
                            {tx.category === 'payout_withdrawal' && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700">
                                💸 Payout
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center space-x-2 flex-wrap">
                            <span>{formattedDate}</span>
                            {tx.storeName && (
                              <span>• Store: <strong className="text-slate-700">{tx.storeName}</strong></span>
                            )}
                            {tx.sourceRef && (
                              <span className="text-slate-400">• Ref: {tx.sourceRef}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Amount in large bold */}
                      <div className="text-right shrink-0">
                        <div
                          className={`text-sm sm:text-base font-black ${
                            isCredit
                              ? isINR
                                ? 'text-purple-700'
                                : 'text-emerald-600'
                              : 'text-red-600'
                          }`}
                        >
                          {isCredit ? '+' : '-'}
                          {isINR ? '₹' : 'Rs '}
                          {tx.amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}{' '}
                          <span className="text-[10px] font-bold text-slate-400 uppercase">
                            {tx.currency}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 capitalize">
                          {isCredit ? 'Credit (Inflow)' : 'Debit (Payout)'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-3 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>Click any period to dynamically recalculate statement totals.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
