'use client';

import React, { useState, useEffect } from 'react';
import { useLiveRefresh, LiveBadge } from '@/components/LiveProvider';
import { PayoutConfirmations } from '@/components/FinanceControls';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  Filter,
  TrendingUp,
  Clock,
  Shield,
  Award,
  DollarSign,
  PlusCircle,
  Loader2,
  RefreshCw,
  Search,
  Building2,
  Coins,
  X,
} from 'lucide-react';
import { formatMoney, formatUSDT, USDT_INR_RATE, USDT_PKR_RATE } from '@/lib/utils/currency';

export default function WalletPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [period, setPeriod] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [searchTx, setSearchTx] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all', 'earnings', 'client_activity', 'payouts'
  const [currencyFilter, setCurrencyFilter] = useState('all'); // 'all', 'USDT', 'INR', 'PKR'

  // Payout / Withdrawal Drawer Form state
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutCurrency, setPayoutCurrency] = useState('USDT');
  const [payoutNote, setPayoutNote] = useState('');
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutMsg, setPayoutMsg] = useState({ text: '', type: '' });

  const fetchWallet = async (selectedPeriod = period, start = customStart, end = customEnd, silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
        setErrorMsg('');
      }
      const token = localStorage.getItem('portal_token');
      let url = `/api/wallet?period=${selectedPeriod}`;
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
        if (silent) return;
        const errJson = await res.json().catch(() => ({}));
        setErrorMsg(errJson.message || 'Failed to load wallet statement');
      }
    } catch (err) {
      if (silent) return;
      setErrorMsg('Network error connecting to financial service');
      console.error('Fetch wallet error:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchWallet(period, customStart, customEnd);
  }, [period]);

  // New deposit shares, seller withdrawals and payouts appear by themselves
  const [confirmTick, setConfirmTick] = useState(0);
  useLiveRefresh(() => {
    fetchWallet(period, customStart, customEnd, true);
    setConfirmTick((n) => n + 1);
  });

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
          amount: Number(payoutAmount),
          currency: payoutCurrency,
          note: payoutNote.trim(),
        }),
      });

      if (res.ok) {
        const okData = await res.json().catch(() => ({}));
        // A payout written for someone else waits for a second person: say so instead of "recorded"
        setPayoutMsg({ text: okData.pendingApproval ? okData.message : 'Payout recorded successfully!', type: 'success' });
        setPayoutAmount('');
        setPayoutNote('');
        setTimeout(() => setShowPayoutForm(false), okData.pendingApproval ? 4000 : 1500);
        setConfirmTick((n) => n + 1); // the request shows up under "Payout requests" at once
        fetchWallet();
      } else {
        const errData = await res.json();
        setPayoutMsg({ text: errData.message || 'Failed to record payout', type: 'error' });
      }
    } catch (err) {
      setPayoutMsg({ text: 'Network error recording payout', type: 'error' });
    } finally {
      setPayoutLoading(false);
    }
  };

  const user = data?.user || {};
  const isAdmin = user.role === 'admin';
  const is50Inr = user.commissionLabel === 'inr_50';
  const balances = data?.balances || {
    balanceUSDT: 0,
    balanceINR: 0,
    balancePKR: 0,
    totalEarnedUSDT: 0,
    totalEarnedINR: 0,
    totalEarnedPKR: 0,
    totalWithdrawnUSDT: 0,
    totalWithdrawnINR: 0,
    totalWithdrawnPKR: 0,
    totalClientDepositsINR: 0,
    totalClientWithdrawalsINR: 0,
    totalClientDepositsUSDT: 0,
    totalClientWithdrawalsUSDT: 0,
  };
  const periodTotals = data?.periodTotals || {
    earnedUSDT: 0,
    withdrawnUSDT: 0,
    netUSDT: 0,
    earnedINR: 0,
    withdrawnINR: 0,
    netINR: 0,
    earnedPKR: 0,
    withdrawnPKR: 0,
    netPKR: 0,
    count: 0,
  };

  // Filter transactions
  const transactions = (data?.transactions || []).filter((tx) => {
    if (searchTx.trim()) {
      const q = searchTx.toLowerCase();
      const matchDesc = tx.description?.toLowerCase().includes(q);
      const matchStore = tx.storeName?.toLowerCase().includes(q);
      const matchRef = tx.sourceRef?.toLowerCase().includes(q);
      const matchDetails = tx.details?.toLowerCase().includes(q);
      if (!matchDesc && !matchStore && !matchRef && !matchDetails) return false;
    }

    if (typeFilter === 'earnings') {
      if (tx.type !== 'credit' || String(tx.category || '').startsWith('reserve_')) return false;
    } else if (typeFilter === 'client_activity') {
      if (tx.category === 'payout_reversed') return false;
      if (!tx.isClientActivity && tx.type !== 'activity' && !tx.category?.startsWith('commission')) return false;
    } else if (typeFilter === 'payouts') {
      if (tx.type !== 'debit' && tx.category !== 'payout_reversed') return false;
      if (tx.category === 'reserve_to') return false;
    }

    if (currencyFilter !== 'all') {
      if (currencyFilter === 'USDT' && tx.currency !== 'USDT' && !tx.amountUSDT) return false;
      if (currencyFilter === 'INR' && tx.currency !== 'INR') return false;
      if (currencyFilter === 'PKR' && tx.currency !== 'PKR') return false;
    }

    return true;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ── Top Header Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Financial Statement & Wallet
            </h1>
            {isAdmin ? (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                🛡️ Partner Account (75% own sellers • 25% others)
              </span>
            ) : (
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                  is50Inr
                    ? 'bg-purple-100 text-purple-800 border-purple-200'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                }`}
              >
                {is50Inr ? '50% Member Deal' : '🇵🇰 1:1 PKR Fixed Deal'}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 flex items-center space-x-2 flex-wrap">
            <span>
              Real-time ledger connected with client store deposits and withdrawals.
            </span>
            <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-xs">
              Real Binance USDT • each deposit at its actual rate
            </span>
          </p>
        </div>

        <div className="flex items-center space-x-2 self-start sm:self-auto shrink-0">
          <LiveBadge />
          <button
            onClick={() => fetchWallet()}
            disabled={loading}
            className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition flex items-center space-x-1.5 text-xs shadow-xs"
            title="Refresh financial data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={() => setShowPayoutForm(!showPayoutForm)}
            className="px-4 py-2.5 rounded-2xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition flex items-center space-x-1.5 shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{showPayoutForm ? 'Close Payout' : isAdmin ? 'Record Payout / Withdraw' : 'Request Payout'}</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between text-xs text-red-700 animate-fade-in">
          <span className="font-semibold">{errorMsg}</span>
          <button
            onClick={() => fetchWallet()}
            className="px-3 py-1 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Top Balance Showcase Cards (Hero USDT + Native Breakdown) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* HERO CARD: USDT Available Balance */}
        <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl shadow-slate-950/20 relative overflow-hidden flex flex-col justify-between border border-slate-800">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Your Share (₮ USDT)</span>
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                Binance P2P
              </span>
            </div>

            <div className="mt-3">
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
                {formatUSDT(balances.balanceUSDT)}
              </h2>
              {(balances.heldForMembersUSDT || 0) > 0 ? (
                <p className="text-xs text-amber-200 mt-1">
                  This is your full share. You can take out <strong>{formatUSDT(balances.availableUSDT)}</strong> now:{' '}
                  {formatUSDT(balances.heldForMembersUSDT)} of your share is with members who are in minus and comes back from their next
                  deposits.
                </p>
              ) : (
              <p className="text-xs text-slate-300 mt-1 flex items-center gap-2">
                <span>Your share of the USDT held in Binance. Can go below zero and settles from the next deposits.</span>
              </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-300/90 mt-5 pt-4 border-t border-white/10">
            <span>Earned: <strong className="text-emerald-400">₮{formatMoney(balances.totalEarnedUSDT)}</strong></span>
            <span>Deducted: <strong className="text-red-400">₮{formatMoney(balances.totalWithdrawnUSDT)}</strong></span>
            {Math.abs(balances.reserveNetUSDT || 0) > 0.004 && (
              <span>
                Reserve: <strong className="text-indigo-300">{balances.reserveNetUSDT > 0 ? '+' : '-'}₮{formatMoney(Math.abs(balances.reserveNetUSDT))}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Seller withdrawals share card */}
        <div className="bg-gradient-to-br from-purple-700 via-indigo-700 to-indigo-800 rounded-3xl p-6 text-white shadow-xl shadow-indigo-600/15 relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-200 flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-300"></span>
                <span>Your Share of Seller Withdrawals (₮)</span>
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/20 text-white font-semibold">
                {isAdmin ? '75% own • 25% others' : '50% of your sellers'}
              </span>
            </div>

            <div className="mt-3">
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
                ₮{formatMoney(balances.totalSellerWithdrawUSDT)}
                <span className="text-sm sm:text-base font-normal text-purple-200 ml-2">USDT</span>
              </h2>
              <p className="text-xs text-purple-200/80 mt-1">
                Already taken out of your balance when sellers were paid
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-purple-200/90 mt-5 pt-4 border-t border-white/15">
            <span>Earned from deposits: <strong>₮{formatMoney(balances.totalEarnedUSDT)}</strong></span>
            <span>Payouts taken: <strong>₮{formatMoney(balances.totalPayoutUSDT)}</strong></span>
          </div>
        </div>

        {/* PKR Wallet Card */}
        <div className="bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 rounded-3xl p-6 text-white shadow-xl shadow-emerald-600/15 relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-200 flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-white"></span>
                <span>Milestone Bonuses (Rs)</span>
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/20 text-white font-semibold">
                Reference only
              </span>
            </div>

            <div className="mt-3">
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
                Rs {formatMoney(balances.totalEarnedPKR)}
                <span className="text-sm sm:text-base font-normal text-emerald-200 ml-2">PKR</span>
              </h2>
              <p className="text-xs text-emerald-200/80 mt-1">
                Paid in USDT inside your balance
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-emerald-200/90 mt-5 pt-4 border-t border-white/15">
            <span>In USDT: <strong>₮{formatMoney(balances.totalBonusUSDT)}</strong></span>
            <span>Bonus cost paid: <strong>₮{formatMoney(balances.totalBonusCostUSDT)}</strong></span>
          </div>
        </div>
      </div>

      {/* ── Assigned Stores Client Activity Bar (Volume) ── */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center space-x-2.5">
          <Building2 className="w-5 h-5 text-slate-500" />
          <span className="text-sm font-bold text-slate-800">Assigned Stores Volume Overview:</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs sm:text-sm min-w-0">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span className="text-slate-500">Client Deposits:</span>
            <strong className="text-emerald-700">
              ₹{formatMoney(balances.totalClientDepositsINR, 0)} INR
            </strong>
            <span className="text-slate-400 font-medium">
              (₮{formatMoney(balances.totalClientDepositsUSDT)} USDT)
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400"></span>
            <span className="text-slate-500">Client Withdrawals:</span>
            <strong className="text-slate-800">
              ₮{formatMoney(balances.totalClientWithdrawalsUSDT)} USDT
            </strong>
          </div>
        </div>
      </div>

      {/* ── A payout someone else wrote in my name: I confirm it before it is deducted ── */}
      <PayoutConfirmations tick={confirmTick} onChanged={() => fetchWallet(period, customStart, customEnd, true)} />

      {/* ── Record Payout Drawer Form ── */}
      {showPayoutForm && (
        <div className="bg-amber-50/80 border border-amber-200 p-5 rounded-3xl space-y-3 animate-scale-up shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-amber-900 text-sm sm:text-base flex items-center space-x-2">
              <DollarSign className="w-4 h-4 text-amber-600" />
              <span>{isAdmin ? 'Record Official Wallet Payout / Withdrawal' : 'Request a Payout'}</span>
            </h3>
            <button onClick={() => setShowPayoutForm(false)} className="text-amber-700 hover:text-amber-900">
              <X className="w-5 h-5" />
            </button>
          </div>

          {!isAdmin && (
            <p className="text-[11px] text-amber-900/80 font-medium">
              This sends a request to the admins. An admin pays you on Binance and approves it; only then is the amount
              taken from your wallet. Nothing changes until it is approved.
            </p>
          )}

          {payoutMsg.text && (
            <div className={`p-3 rounded-xl text-xs font-semibold ${payoutMsg.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'}`}>
              {payoutMsg.text}
            </div>
          )}

          <form onSubmit={handlePayoutSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Amount</label>
              <input
                type="number"
                min="1"
                step="any"
                required
                placeholder="e.g. 500"
                value={payoutAmount}
                onChange={(e) => setPayoutAmount(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-white border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Currency</label>
              <select
                value={payoutCurrency}
                onChange={(e) => setPayoutCurrency(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-white border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 font-semibold"
              >
                <option value="USDT">₮ USDT (Binance)</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {isAdmin ? 'Payout Note / Receipt / Method' : 'Where to send it (your Binance ID / note)'}
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder={isAdmin ? 'e.g. Binance TXID / Bank Transfer UTR: 991288' : 'e.g. Binance Pay ID 123456789'}
                  value={payoutNote}
                  onChange={(e) => setPayoutNote(e.target.value)}
                  className="flex-1 p-2.5 rounded-xl bg-white border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  type="submit"
                  disabled={payoutLoading}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shrink-0 transition flex items-center space-x-1"
                >
                  {payoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>{isAdmin ? 'Confirm Payout' : 'Send Request'}</span>}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ── Period Filter Bar ── */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-1.5 sm:space-x-2 overflow-x-auto pb-1 sm:pb-0 w-full sm:w-auto">
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
                className={`px-4 py-2 rounded-2xl text-xs sm:text-sm font-bold transition whitespace-nowrap ${
                  period === item.key
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="text-xs font-bold text-slate-500">View:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="max-w-full min-w-0 p-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-none"
            >
              <option value="all">All Statements & Activity</option>
              <option value="earnings">Commissions & Pool Shares</option>
              <option value="client_activity">Store Client Activity (Deposits & Withdrawals)</option>
              <option value="payouts">Payout Withdrawals Only</option>
            </select>

            <span className="text-xs font-bold text-slate-500">Currency:</span>
            <select
              value={currencyFilter}
              onChange={(e) => setCurrencyFilter(e.target.value)}
              className="p-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-none"
            >
              <option value="all">All Currencies</option>
              <option value="USDT">₮ USDT Only</option>
            </select>
          </div>
        </div>

        {/* Custom Date Range Picker */}
        {period === 'custom' && (
          <form onSubmit={handleApplyCustom} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex flex-wrap items-center gap-3 animate-fade-in text-xs">
            <span className="font-bold text-slate-700">Custom Date Range:</span>
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400">From:</span>
              <input
                type="date"
                required
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="p-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400">To:</span>
              <input
                type="date"
                required
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="p-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition shadow-xs"
            >
              Apply Filter
            </button>
          </form>
        )}
      </div>

      {/* ── Period Summary Metrics ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Period Net (USDT)</span>
          <p className="text-xl sm:text-2xl font-black text-emerald-600 mt-1">
            {periodTotals.netUSDT >= 0 ? '+' : ''}₮{formatMoney(periodTotals.netUSDT)}
          </p>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Period Earned (USDT)</span>
          <p className="text-xl sm:text-2xl font-black text-purple-700 mt-1">
            +₮{formatMoney(periodTotals.earnedUSDT)}
          </p>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Period Deducted (USDT)</span>
          <p className="text-xl sm:text-2xl font-black text-teal-700 mt-1">
            -₮{formatMoney(periodTotals.withdrawnUSDT)}
          </p>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Filtered Entries</span>
          <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
            {transactions.length} {transactions.length === 1 ? 'entry' : 'entries'}
          </p>
        </div>
      </div>

      {/* ── Search Bar ── */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchTx}
          onChange={(e) => setSearchTx(e.target.value)}
          placeholder="Search transactions by store, UTR or description..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
        />
      </div>

      {/* ── Transactions Ledger ── */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-20 text-center text-slate-400 text-xs flex flex-col items-center justify-center space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            <span>Loading financial statement...</span>
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-20 text-center p-6">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="font-bold text-slate-700 text-base">No transactions found</p>
            <p className="text-xs text-slate-400 mt-1">
              No deposits, commissions, client activity, or payouts match the selected filter ({period}).
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto divide-y divide-slate-100">
            {transactions.map((tx) => {
              const isCredit = tx.type === 'credit';
              const isDebit = tx.type === 'debit';
              const isActivity = tx.type === 'activity' || tx.isClientActivity;
              const isINR = tx.currency === 'INR';
              const isPKR = tx.currency === 'PKR';
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
                  className={`p-4 sm:p-4.5 transition flex items-center justify-between gap-3 text-xs ${
                    isActivity ? 'bg-slate-50/50 hover:bg-slate-100/60' : 'hover:bg-slate-50/80'
                  }`}
                >
                  {/* Left: Direction Icon & Details */}
                  <div className="flex items-center space-x-3.5 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                        isCredit
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                          : isDebit
                          ? 'bg-red-50 text-red-600 border border-red-100'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {isCredit ? (
                        <ArrowDownLeft className="w-5 h-5" />
                      ) : isDebit ? (
                        <ArrowUpRight className="w-5 h-5" />
                      ) : (
                        <Building2 className="w-5 h-5" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center space-x-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                          {tx.description}
                        </span>

                        {/* Commission Model / Type Badge */}
                        {tx.category === 'admin_personal_handler' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                            🛡️ Personal Handler (50% INR)
                          </span>
                        )}
                        {tx.category === 'admin_pool_share' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                            🤝 Admin Pool (25% Split)
                          </span>
                        )}
                        {tx.category === 'commission_inr_50' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700">
                            🇮🇳 50% INR Commission
                          </span>
                        )}
                        {tx.category === 'commission_pkr_1to1' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                            🇵🇰 1:1 PKR Earning
                          </span>
                        )}
                        {tx.category === 'admin_share_inr_50' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
                            🇮🇳 Admin 50-50 Split
                          </span>
                        )}
                        {tx.category === 'admin_share_pkr_1to1' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                            💼 Admin Profit
                          </span>
                        )}
                        {tx.category === 'client_withdrawal' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
                            🛒 Client Withdrawal ({tx.status || 'Processed'})
                          </span>
                        )}
                        {tx.category === 'bonus_reward' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            🎁 Milestone Bonus
                          </span>
                        )}
                        {tx.category === 'payout_withdrawal' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                            💸 Payout Withdrawal
                          </span>
                        )}
                        {tx.category === 'payout_reversed' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                            ↩️ Payout reversed — not counted
                          </span>
                        )}
                        {tx.category === 'reserve_to' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                            🏦 To reserve pool
                          </span>
                        )}
                        {tx.category === 'reserve_from' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                            🏦 Back from reserve pool
                          </span>
                        )}
                        {tx.category === 'reserve_return' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                            🏦 Reserve money came back — not your share
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-500 mt-1 flex items-center space-x-2 flex-wrap">
                        <span>{formattedDate}</span>
                        {tx.storeName && (
                          <span>• Store: <strong className="text-slate-700">{tx.storeName}</strong></span>
                        )}
                        {tx.sourceRef && (
                          <span className="text-slate-400">• Ref: {tx.sourceRef}</span>
                        )}
                        {tx.details && (
                          <span className="text-slate-400">• {tx.details}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Dual Currency (Hero USDT + Native) */}
                  <div className="text-right shrink-0">
                    <div
                      className={`text-sm sm:text-base font-black ${
                        tx.category === 'payout_reversed'
                          ? 'text-slate-400 line-through'
                          : isCredit
                          ? 'text-emerald-600'
                          : isDebit
                          ? 'text-red-600'
                          : 'text-amber-700'
                      }`}
                    >
                      {tx.category === 'payout_reversed' ? '' : isCredit ? '+' : isDebit ? '-' : '🛒 '}
                      {formatUSDT(tx.amountUSDT)}
                    </div>
                    <div className="text-[11px] font-bold text-slate-500">
                      {isINR ? '₹' : isPKR ? 'Rs ' : '₮'}
                      {formatMoney(tx.amount)} {tx.currency}
                    </div>
                    {tx.sellerINR > 0 && (
                      <div className="text-[10px] font-semibold text-slate-500">
                        Seller {tx.type === 'credit' ? 'paid' : 'took'} ₹{Number(tx.sellerINR).toLocaleString('en-US', { maximumFractionDigits: 0 })} INR
                      </div>
                    )}
                    <span className="text-[10px] text-slate-400 capitalize">
                      {tx.category === 'payout_reversed' ? 'Reversed (not counted)' : tx.category === 'reserve_return' ? 'Reserve money back (not a share)' : tx.category === 'reserve_from' ? 'Back from reserve' : tx.category === 'reserve_to' ? 'Moved to reserve' : isCredit ? 'Credit (Inflow)' : tx.category === 'seller_withdrawal_share' ? 'Debit (Seller withdrawal)' : isDebit ? 'Debit (Payout)' : 'Client Store Outflow'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
