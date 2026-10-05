'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Users,
  Award,
  Clock,
  ArrowRight,
  ShieldCheck,
  MessageSquare,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Gift,
  HelpCircle,
  Trophy,
  BarChart3,
  Calendar,
} from 'lucide-react';
import WalletModal from '@/components/WalletModal';

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [weeklyProgress, setWeeklyProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [walletModalConfig, setWalletModalConfig] = useState(null);

  const isAdmin = user?.role === 'admin';

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('portal_token');
      const headers = { Authorization: `Bearer ${token}` };

      const [statsRes, rewardsRes] = await Promise.all([
        fetch('/api/stats', { headers }),
        fetch('/api/rewards', { headers }),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (rewardsRes.ok) {
        const rewardsData = await rewardsRes.json();
        setWeeklyProgress(rewardsData.weeklyProgress);
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white/10 text-emerald-400 border border-white/10 uppercase tracking-wider">
                {isAdmin ? 'Management Control' : 'Agent Operations'}
              </span>
              <span className="text-xs text-slate-400">1:1 INR → PKR Currency Rule Active</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold mt-2 tracking-tight">
              Welcome back, {user?.name}! 👋
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
              {isAdmin
                ? 'Supervise team members, assign new seller stores, monitor deposit milestones, and approve bonus disbursements.'
                : 'Manage your assigned ecommerce sellers, track live INR deposits and withdrawals, and hit your 5 Lakh weekly bonus sprint!'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/chat"
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs sm:text-sm flex items-center space-x-1.5 transition shadow-lg shadow-emerald-500/25"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Team Chat</span>
            </Link>

            {isAdmin ? (
              <Link
                href="/rewards"
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white font-semibold text-xs sm:text-sm flex items-center space-x-1.5 transition"
              >
                <Award className="w-4 h-4 text-amber-400" />
                <span>Pending Approvals</span>
              </Link>
            ) : (
              <Link
                href="/sellers"
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white font-semibold text-xs sm:text-sm flex items-center space-x-1.5 transition"
              >
                <Users className="w-4 h-4" />
                <span>My Clients</span>
              </Link>
            )}
          </div>
        </div>

        {/* Decorative backdrop shapes */}
        <div className="absolute right-0 top-0 -mt-12 -mr-12 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/2 bottom-0 -mb-12 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* ─── ADMIN: Operational Wallet & Profit Share Card ─── */}
      {isAdmin && (
        <div className="bg-gradient-to-br from-amber-600 via-amber-700 to-orange-800 rounded-3xl p-5 sm:p-7 text-white shadow-xl shadow-amber-700/20 relative overflow-hidden">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white/20 text-white flex items-center gap-1.5 uppercase tracking-wider">
                  <Wallet className="w-3.5 h-3.5" />
                  <span>Admin Profit Pool & Personal Share</span>
                </span>
                <span className="text-xs bg-amber-950/40 border border-amber-300/30 text-amber-200 px-2 py-0.5 rounded-full">
                  75% own sellers • 25% others
                </span>
              </div>

              <div className="mt-3 flex items-baseline gap-2 flex-wrap">
                <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
                  ₮{((stats?.adminWallet?.balanceUSDT ?? user?.wallet?.balanceUSDT ?? (stats?.adminWallet?.balanceINR ?? user?.wallet?.balanceINR ?? 0) / 90)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h2>
                <span className="text-lg font-bold text-emerald-300">USDT</span>
                <span className="text-xs text-amber-100/90 ml-1">
                  real Binance USDT
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-white/20 text-xs">
                <div>
                  <p className="text-amber-100/80 text-[10px] uppercase font-bold">Total Earned (Gross)</p>
                  <p className="text-base font-extrabold text-white">
                    ₮{(stats?.adminWallet?.totalEarnedUSDT ?? user?.wallet?.totalEarnedUSDT ?? 0).toLocaleString()} USDT
                  </p>
                </div>
                <div>
                  <p className="text-amber-100/80 text-[10px] uppercase font-bold">Total Payouts / Withdrawn</p>
                  <p className="text-base font-extrabold text-white">
                    ₮{(stats?.adminWallet?.totalWithdrawnUSDT ?? user?.wallet?.totalWithdrawnUSDT ?? 0).toLocaleString()} USDT
                  </p>
                </div>
                <div>
                  <p className="text-amber-100/80 text-[10px] uppercase font-bold">Platform Total Deposits</p>
                  <p className="text-base font-extrabold text-white">
                    ${(stats?.totalDepositsINR || 0).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-amber-100/80 text-[10px] uppercase font-bold">Commission Rules</p>
                  <p className="text-xs font-semibold text-amber-100">
                    50% Split + 1:1 Margin Share
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 self-start md:self-auto shrink-0">
              <button
                type="button"
                onClick={() => setWalletModalConfig({ isOpen: true, title: 'My Admin Profit Wallet' })}
                className="px-4 py-2.5 rounded-2xl bg-white text-slate-900 hover:bg-amber-50 font-bold text-xs sm:text-sm flex items-center justify-center space-x-2 transition shadow-md active:scale-95"
              >
                <Wallet className="w-4 h-4 text-amber-600" />
                <span>View Statement & Filters</span>
              </button>
            </div>
          </div>

          {/* Background decoration */}
          <div className="absolute right-0 bottom-0 -mb-10 -mr-10 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        </div>
      )}

      {/* Main KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        {isAdmin ? (
          <>
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Members</span>
                <Users className="w-4 h-4 text-purple-600" />
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                {stats?.totalMembers ?? '...'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Active team operators</p>
            </div>

            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Sellers</span>
                <ShieldCheck className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                {stats?.totalSellers ?? '...'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Registered stores on platform</p>
            </div>

            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Deposits</span>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-xl sm:text-2xl font-extrabold text-emerald-600">
                ${(stats?.totalDepositsINR || 0).toLocaleString()}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Store wallet deposits ($)</p>
            </div>

            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Pending Claims</span>
                <Award className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-amber-600">
                {stats?.pendingClaimsCount ?? 0}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Awaiting admin approval</p>
            </div>
          </>
        ) : (
          <>
            {/* Member Primary Wallet Card */}
            <div className="col-span-2 bg-gradient-to-br from-emerald-600 to-brand-700 rounded-3xl p-5 sm:p-6 text-white shadow-lg shadow-emerald-600/20 relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-100 flex items-center space-x-1.5">
                    <Wallet className="w-4 h-4 text-emerald-200" />
                    <span>My Wallet Balance</span>
                  </span>
                  <span className="text-[11px] bg-white/20 px-2 py-0.5 rounded-full text-white font-medium">
                    Real Binance USDT
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-baseline gap-2 sm:gap-3">
                  <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
                    ₮{((stats?.walletBalanceUSDT ?? user?.wallet?.balanceUSDT ?? (((stats?.walletBalancePKR || user?.wallet?.balancePKR || 0) / 280) + ((stats?.walletBalanceINR || user?.wallet?.balanceINR || 0) / 90)))).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="text-base sm:text-lg font-normal opacity-90 ml-1.5">USDT</span>
                  </h2>
                  <div className="bg-white/20 border border-white/25 rounded-2xl px-3 py-1 flex items-baseline gap-1 text-white text-xs">
                    <span>Real Binance USDT</span>
                  </div>
                </div>

                {/* Sub-breakdown */}
                <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/20 text-xs">
                  <div>
                    <p className="text-emerald-100/80 text-[10px]">Deposits (+)</p>
                    <p className="font-bold text-white text-xs sm:text-sm">
                      ${(stats?.totalDepositsINR || 0).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-emerald-100/80 text-[10px]">Withdrawals (-)</p>
                    <p className="font-bold text-white text-xs sm:text-sm">
                      ${(stats?.totalWithdrawalsINR || 0).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-emerald-100/80 text-[10px]">Bonuses (+)</p>
                    <p className="font-bold text-amber-200 text-xs sm:text-sm">
                      Rs {(stats?.totalBonusesPKR || 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* View Statement Action */}
              <button
                type="button"
                onClick={() => setWalletModalConfig({ isOpen: true, title: 'My Wallet Statement' })}
                className="mt-4 w-full py-2.5 px-3 rounded-2xl bg-white/15 hover:bg-white/25 text-white font-semibold text-xs flex items-center justify-center space-x-1.5 transition border border-white/20 active:scale-95 shadow-sm"
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>View Full Statement & Transaction History</span>
              </button>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider">Assigned Clients</span>
                <Users className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-3xl font-extrabold text-slate-900">
                  {stats?.totalAssignedSellers ?? 0}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">Sellers mapped to your account</p>
              </div>
              <Link
                href="/sellers"
                className="mt-3 text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center space-x-1"
              >
                <span>View clients</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider">Pending Orders</span>
                <Clock className="w-4 h-4 text-amber-500" />
              </div>
              <div>
                <p className="text-3xl font-extrabold text-amber-600">
                  {stats?.pendingOrdersCount ?? 0}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">Orders awaiting fulfillment</p>
              </div>
              <Link
                href="/sellers"
                className="mt-3 text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center space-x-1"
              >
                <span>Track stores</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </>
        )}
      </div>

      {/* ─── ADMIN: Staff Analytics & Performance Hub ─── */}
      {isAdmin && stats?.staffAnalytics && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
                <BarChart3 className="w-5 h-5 text-brand-600" />
                <span>Staff Analytics & Performance Hub</span>
              </h2>
              <p className="text-xs text-slate-500">
                Comparative ranking across deposits, withdrawals, earned wallet balance, and active seller clients.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="text-xs px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold flex items-center gap-1">
                <Wallet className="w-3.5 h-3.5" />
                <span>Total Staff Wallets: Rs. {(stats.staffAnalytics.totalStaffEarningsPKR || 0).toLocaleString()} PKR</span>
              </span>
            </div>
          </div>

          {/* 4 Champion Pillar Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* 1. Most Deposits Champion */}
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50/50 rounded-2xl p-4 border border-emerald-200/80 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Most Deposits</span>
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600 text-white font-bold">
                  Top Volume
                </span>
              </div>
              <p className="text-base font-extrabold text-slate-900 mt-2 truncate">
                {stats.staffAnalytics.topDepositor?.name || 'No members yet'}
              </p>
              <p className="text-lg font-black text-emerald-600">
                ${(stats.staffAnalytics.topDepositor?.totalDepositsINR || 0).toLocaleString()}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {stats.staffAnalytics.topDepositor?.assignedSellersCount || 0} stores assigned
              </p>
            </div>

            {/* 2. Most Withdrawals Champion */}
            <div className="bg-gradient-to-br from-slate-50 to-blue-50/50 rounded-2xl p-4 border border-slate-200/80 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                  <TrendingDown className="w-3.5 h-3.5 text-blue-600" />
                  <span>Most Withdrawals</span>
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-white font-bold">
                  High Payout
                </span>
              </div>
              <p className="text-base font-extrabold text-slate-900 mt-2 truncate">
                {stats.staffAnalytics.topWithdrawer?.name || 'No members yet'}
              </p>
              <p className="text-lg font-black text-slate-700">
                ${(stats.staffAnalytics.topWithdrawer?.totalWithdrawalsINR || 0).toLocaleString()}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Processed client payouts
              </p>
            </div>

            {/* 3. Highest Amount Earned Champion */}
            <div className="bg-gradient-to-br from-amber-50 to-yellow-50/50 rounded-2xl p-4 border border-amber-200/80 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1">
                  <Wallet className="w-3.5 h-3.5 text-amber-600" />
                  <span>Highest Earned</span>
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500 text-white font-bold">
                  Top Wallet
                </span>
              </div>
              <p className="text-base font-extrabold text-slate-900 mt-2 truncate">
                {stats.staffAnalytics.topEarner?.name || 'No members yet'}
              </p>
              <p className="text-lg font-black text-amber-600">
                Rs. {(stats.staffAnalytics.topEarner?.walletBalancePKR || 0).toLocaleString()} PKR
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Includes Rs. {(stats.staffAnalytics.topEarner?.totalBonusesPKR || 0).toLocaleString()} bonus
              </p>
            </div>

            {/* 4. Most Sellers Managed */}
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50/50 rounded-2xl p-4 border border-purple-200/80 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-purple-600" />
                  <span>Most Sellers</span>
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-600 text-white font-bold">
                  Portfolio Lead
                </span>
              </div>
              <p className="text-base font-extrabold text-slate-900 mt-2 truncate">
                {stats.staffAnalytics.topSellerManager?.name || 'No members yet'}
              </p>
              <p className="text-lg font-black text-purple-700">
                {stats.staffAnalytics.topSellerManager?.assignedSellersCount || 0} Stores
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Active client accounts
              </p>
            </div>
          </div>

          {/* Comparative Staff Table */}
          {stats.staffAnalytics.staffList?.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Staff Performance & Member Wallet Overview
                </h3>
                <Link
                  href="/members"
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
                >
                  <span>Manage All Members</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/50 border-b border-slate-200 text-slate-500 uppercase font-bold text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Member Name</th>
                      <th className="py-3 px-4 text-center">Stores</th>
                      <th className="py-3 px-4 text-right">Deposited</th>
                      <th className="py-3 px-4 text-right">Withdrawn</th>
                      <th className="py-3 px-4 text-right">Net Volume</th>
                      <th className="py-3 px-4 text-right">Bonuses</th>
                      <th className="py-3 px-4 text-right">Member Wallet (Earned PKR)</th>
                      <th className="py-3 px-4 text-center">Orders</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {stats.staffAnalytics.staffList.map((staff, idx) => (
                      <tr key={staff._id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center space-x-2">
                            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px] flex items-center justify-center shrink-0">
                              #{idx + 1}
                            </span>
                            <div>
                              <div className="font-bold text-slate-900 text-xs sm:text-sm">
                                {staff.name}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                @{staff.username}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4 text-center font-bold text-slate-800">
                          {staff.assignedSellersCount}
                        </td>

                        <td className="py-3 px-4 text-right font-bold text-emerald-600">
                          ${(staff.totalDepositsINR || 0).toLocaleString()}
                        </td>

                        <td className="py-3 px-4 text-right text-slate-600">
                          ${(staff.totalWithdrawalsINR || 0).toLocaleString()}
                        </td>

                        <td className="py-3 px-4 text-right font-semibold text-slate-800">
                          ${(staff.netVolumeINR || 0).toLocaleString()}
                        </td>

                        <td className="py-3 px-4 text-right font-semibold text-amber-600">
                          Rs. {(staff.totalBonusesPKR || 0).toLocaleString()}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setWalletModalConfig({
                                isOpen: true,
                                memberId: staff._id,
                                title: `${staff.name}'s Financial Statement`,
                              })
                            }
                            className="inline-flex flex-col items-end px-2.5 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-extrabold text-xs transition group cursor-pointer"
                            title="Click to view full financial statement & transactions"
                          >
                            <span>Rs. {(staff.walletBalancePKR || 0).toLocaleString()} PKR</span>
                            {(staff.walletBalanceINR || 0) > 0 && (
                              <span className="text-[10px] text-emerald-700 font-bold">
                                + ₹{(staff.walletBalanceINR || 0).toLocaleString()} INR (50% Split)
                              </span>
                            )}
                          </button>
                        </td>

                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              staff.pendingOrdersCount > 0
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {staff.pendingOrdersCount}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Weekly Sprint Progress Card (For Members) */}
      {!isAdmin && weeklyProgress && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                🏆
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                  Weekly Sprint Target: ₹5 Lakh Combined Volume
                </h3>
                <p className="text-xs text-slate-500">
                  Hit ₹500,000 INR across all your sellers this week to earn an extra{' '}
                  <span className="font-semibold text-emerald-600">5,000 PKR Weekend Bonus</span>!
                </p>
              </div>
            </div>

            <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-amber-100 text-amber-800 self-start sm:self-auto">
              {weeklyProgress.percentage}% Achieved
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden p-0.5 border border-slate-200">
            <div
              className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full rounded-full transition-all duration-700 shadow-sm"
              style={{ width: `${weeklyProgress.percentage}%` }}
            />
          </div>

          <div className="flex justify-between items-center mt-2.5 text-xs text-slate-500 font-medium">
            <span>Current: ₹{weeklyProgress.currentINR.toLocaleString()} INR</span>
            <span>
              {weeklyProgress.remainingINR > 0
                ? `₹${weeklyProgress.remainingINR.toLocaleString()} INR remaining`
                : '🎉 Target Reached! Claim queued for admin approval.'}
            </span>
            <span className="font-bold text-slate-700">Goal: ₹500,000 INR</span>
          </div>
        </div>
      )}

      {/* Quick Access Modules Navigation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Chat Module */}
        <Link
          href="/chat"
          className="group bg-white p-5 rounded-3xl border border-slate-200/80 hover:border-emerald-300 hover:shadow-md transition-all flex items-start space-x-4"
        >
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h4 className="font-bold text-slate-900 group-hover:text-emerald-700 transition">
              Live Communications
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              WhatsApp-style group discussion and secure 1-on-1 personal chat with voice notes & pictures.
            </p>
          </div>
        </Link>

        {/* Models Module */}
        <Link
          href="/models"
          className="group bg-white p-5 rounded-3xl border border-slate-200/80 hover:border-purple-300 hover:shadow-md transition-all flex items-start space-x-4"
        >
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 group-hover:bg-purple-600 group-hover:text-white transition-colors">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h4 className="font-bold text-slate-900 group-hover:text-purple-700 transition">
              Model Profiles & Photos
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Access full model biographies, age, location, and download unlimited high-resolution pictures.
            </p>
          </div>
        </Link>

        {/* Rewards Module */}
        <Link
          href="/rewards"
          className="group bg-white p-5 rounded-3xl border border-slate-200/80 hover:border-amber-300 hover:shadow-md transition-all flex items-start space-x-4"
        >
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 group-hover:bg-amber-600 group-hover:text-white transition-colors">
            <Award className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h4 className="font-bold text-slate-900 group-hover:text-amber-700 transition">
              Rewards & Bonus Tracker
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Track 1L, 2L, 3L deposit milestones, 5 orders starter awards, and admin approval logs.
            </p>
          </div>
        </Link>
      </div>

      {/* Financial Rules Explainer Alert */}
      <div className="bg-slate-100/70 border border-slate-200 rounded-2xl p-4 text-xs text-slate-600 flex items-start space-x-3">
        <HelpCircle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-slate-800">Operational Currency Rule:</p>
          <p>
            Whenever a client seller deposits funds in Indian Rupees (INR), the identical numerical value is
            credited to the agent's account in Pakistani Rupees (PKR) for 1:1 stores. For stores labeled with 50% INR Split,
            the member earns 50% in INR directly, and the remaining 50% is shared equally among active admins.
          </p>
        </div>
      </div>

      {/* ─── MODAL: Wallet Statement & Transaction History ─── */}
      {walletModalConfig && (
        <WalletModal
          isOpen={!!walletModalConfig}
          onClose={() => setWalletModalConfig(null)}
          memberId={walletModalConfig.memberId || null}
          title={walletModalConfig.title || null}
        />
      )}
    </div>
  );
}
