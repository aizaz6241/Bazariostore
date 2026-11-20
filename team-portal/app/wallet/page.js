'use client';

import React, { useState, useEffect } from 'react';
import { useLiveRefresh, LiveBadge } from '@/components/LiveProvider';
import { PayoutConfirmations } from '@/components/FinanceControls';
import PayoutPanel from '@/components/PayoutPanel';
import WalletHistory from '@/components/WalletHistory';
import {
  Wallet,
  Filter,
  TrendingUp,
  Clock,
  Shield,
  Award,
  PlusCircle,
  RefreshCw,
  Building2,
  Coins,
} from 'lucide-react';
import { formatMoney, formatUSDT, USDT_INR_RATE, USDT_PKR_RATE } from '@/lib/utils/currency';

export default function WalletPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  // Always the whole statement: the history filters by itself and adds up the balance after every line
  const period = 'all';
  const customStart = '';
  const customEnd = '';

  // Payout panel (month by month, or the whole balance)
  const [showPayoutForm, setShowPayoutForm] = useState(false);

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

      {/* ── Payout: opens right under the button, so nobody has to look for it ── */}
      {showPayoutForm && (
        <PayoutPanel
          viewerIsAdmin={isAdmin}
          isSelf
          onClose={() => setShowPayoutForm(false)}
          onDone={() => {
            setConfirmTick((n) => n + 1); // a request shows up under "Payout requests" at once
            fetchWallet(period, customStart, customEnd, true);
          }}
        />
      )}

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

      {/* ── Referral commission: only for someone who brought members (never shown to the member brought) ── */}
      {data?.referral && (
        <div className="bg-indigo-50/70 p-4 rounded-3xl border border-indigo-200 shadow-xs flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center space-x-2.5">
            <span className="text-lg">🤝</span>
            <div>
              <span className="text-sm font-bold text-indigo-900 block">Referral Commission</span>
              <span className="text-[11px] text-indigo-700/80">
                From {data.referral.members} member{data.referral.members === 1 ? '' : 's'} you brought •{' '}
                <a href="/my-members" className="underline font-semibold">see each member</a>
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs sm:text-sm min-w-0">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span className="text-slate-500">Earned ({data.referral.deposits} deposits):</span>
              <strong className="text-emerald-700">+₮{formatMoney(data.referral.earnedUSDT)}</strong>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400"></span>
              <span className="text-slate-500">Deducted ({data.referral.withdrawals} withdrawals):</span>
              <strong className="text-red-600">-₮{formatMoney(data.referral.deductedUSDT)}</strong>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-slate-500">Net:</span>
              <strong className={data.referral.netUSDT < 0 ? 'text-red-700' : 'text-indigo-900'}>
                {data.referral.netUSDT < 0 ? '-' : ''}₮{formatMoney(Math.abs(data.referral.netUSDT))}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* ── A payout someone else wrote in my name: I confirm it before it is deducted ── */}
      <PayoutConfirmations tick={confirmTick} onChanged={() => fetchWallet(period, customStart, customEnd, true)} />

      {/* ── Totals, filters and the transaction history (balance after every line) ── */}
      <WalletHistory data={data} loading={loading} />
    </div>
  );
}
