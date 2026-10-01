'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import WalletModal from './WalletModal';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Image as ImageIcon,
  Award,
  UserCheck,
  LogOut,
  Wallet,
  KeyRound,
  X,
  Lock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

export default function AppNavbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  // Change Password Modal State
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState({ text: '', type: '' });

  // Wallet Statement Modal State
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  if (!user || pathname === '/login') return null;

  const isAdmin = user.role === 'admin';

  const navLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/chat', label: 'Chats', icon: MessageSquare },
    { href: '/sellers', label: 'Sellers', icon: Users },
    { href: '/models', label: 'Models', icon: ImageIcon },
    { href: '/rewards', label: 'Rewards', icon: Award },
    { href: '/wallet', label: 'Wallet', icon: Wallet },
    ...(isAdmin ? [{ href: '/members', label: 'Members', icon: UserCheck }] : []),
  ];

  const handlePasswordSubmit = async (e) => {
    e?.preventDefault();
    if (!currentPassword || !newPassword) {
      setPasswordMsg({ text: 'Please fill all required fields', type: 'error' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMsg({ text: 'New password must be at least 6 characters', type: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ text: 'New passwords do not match', type: 'error' });
      return;
    }

    try {
      setPasswordLoading(true);
      setPasswordMsg({ text: '', type: '' });
      const token = localStorage.getItem('portal_token');

      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (res.ok) {
        setPasswordMsg({ text: 'Password updated successfully!', type: 'success' });
        setTimeout(() => {
          setIsPasswordModalOpen(false);
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
          setPasswordMsg({ text: '', type: '' });
        }, 1500);
      } else {
        setPasswordMsg({ text: data.message || 'Failed to update password', type: 'error' });
      }
    } catch (err) {
      setPasswordMsg({ text: 'Error connecting to server', type: 'error' });
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand & Badge */}
          <div className="flex items-center space-x-3">
            <Link href="/dashboard" className="flex items-center space-x-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-emerald-400 flex items-center justify-center text-white font-bold shadow-md shadow-brand-500/20">
                BZ
              </div>
              <div>
                <span className="font-bold text-slate-900 text-lg leading-tight block">Bazario</span>
                <span className="text-xs font-medium text-slate-500 block -mt-1">Operations Hub</span>
              </div>
            </Link>

            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider ${
                isAdmin
                  ? 'bg-purple-100 text-purple-700 border border-purple-200'
                  : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
              }`}
            >
              {isAdmin ? 'Admin' : 'Member'}
            </span>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1 lg:space-x-2">
            {navLinks.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Wallet Pill & User Menu */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Interactive Wallet Pill (Admin & Member) */}
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setIsWalletModalOpen(true)}
                className="hidden sm:flex items-center space-x-2 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/90 px-3 py-1.5 rounded-full hover:border-amber-300 hover:shadow-sm transition-all text-left group"
                title="Click to view Admin Wallet & Transaction History"
              >
                <div className="w-5 h-5 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-700 group-hover:scale-110 transition-transform">
                  <Wallet className="w-3.5 h-3.5" />
                </div>
                <div className="text-xs">
                  <span className="text-[10px] uppercase font-bold text-amber-600 block leading-none">Admin Share</span>
                  <span className="font-bold text-slate-900 leading-tight">
                    ₹{(user.wallet?.balanceINR || 0).toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">INR</span>
                  </span>
                </div>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsWalletModalOpen(true)}
                className="hidden sm:flex items-center space-x-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full hover:border-emerald-300 hover:shadow-sm transition-all text-left group"
                title="Click to view Wallet Statement & Transaction History"
              >
                <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-700 group-hover:scale-110 transition-transform">
                  <Wallet className="w-3.5 h-3.5" />
                </div>
                <div className="text-xs">
                  <span className="text-[10px] uppercase font-bold text-emerald-600 block leading-none">Wallet</span>
                  <div className="flex items-center space-x-1.5 font-bold text-slate-900 leading-tight">
                    <span>Rs {(user.wallet?.balancePKR || 0).toLocaleString()} PKR</span>
                    {(user.wallet?.balanceINR || 0) > 0 && (
                      <span className="text-emerald-700 text-[11px] font-semibold">| ₹{(user.wallet?.balanceINR || 0).toLocaleString()} INR</span>
                    )}
                  </div>
                </div>
              </button>
            )}

            {/* User Info */}
            <div className="flex items-center space-x-1.5 sm:space-x-2 pl-2 border-l border-slate-200">
              <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-semibold text-sm">
                {user.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="hidden lg:block text-left">
                <p className="text-xs font-semibold text-slate-800 leading-tight">{user.name}</p>
                <p className="text-[10px] text-slate-400">@{user.username}</p>
              </div>

              {/* Change Password Button */}
              <button
                onClick={() => {
                  setPasswordMsg({ text: '', type: '' });
                  setIsPasswordModalOpen(true);
                }}
                title="Change Password"
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <KeyRound className="w-4 h-4" />
              </button>

              {/* Logout Button */}
              <button
                onClick={logout}
                title="Logout"
                className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ─── MODAL: Change Password ─── */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200 animate-scale-up">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
                  <KeyRound className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">Change Password</h3>
              </div>
              <button
                onClick={() => setIsPasswordModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {passwordMsg.text && (
              <div
                className={`mb-4 p-3 rounded-2xl text-xs flex items-center space-x-2 ${
                  passwordMsg.type === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {passwordMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                )}
                <span>{passwordMsg.text}</span>
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  New Password (min 6 characters)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type new password"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white shadow-sm"
                >
                  {passwordLoading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: Wallet Statement & Transaction History ─── */}
      {isWalletModalOpen && (
        <WalletModal
          isOpen={isWalletModalOpen}
          onClose={() => setIsWalletModalOpen(false)}
        />
      )}
    </>
  );
}
