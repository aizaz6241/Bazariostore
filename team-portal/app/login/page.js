'use client';

import React, { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Lock, User, ArrowRight, ShieldCheck, Sparkles, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter username and password');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await login(username.trim(), password.trim());
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (user, pass) => {
    setUsername(user);
    setPassword(pass);
    try {
      setLoading(true);
      setError('');
      // Auto-trigger seed if necessary
      await fetch('/api/seed', { method: 'POST' }).catch(() => {});
      await login(user, pass);
    } catch (err) {
      setError(err.message || 'Quick login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-200/50 p-6 sm:p-8">
        {/* Brand header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-brand-600 to-emerald-400 flex items-center justify-center text-white font-bold text-2xl mx-auto shadow-lg shadow-brand-500/25">
            BZ
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-4 tracking-tight">Team Portal</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Ecommerce Call Center, Clients & Finance Management
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. admin or member1"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold text-sm flex items-center justify-center space-x-2 transition active:scale-[0.99] disabled:opacity-60 shadow-md shadow-slate-900/10"
          >
            <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Quick Demo Access Bar */}
        <div className="mt-8 pt-6 border-t border-slate-100">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-center mb-3">
            Quick One-Click Demo Access
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQuickLogin('admin', 'admin123')}
              disabled={loading}
              className="py-2.5 px-3 bg-purple-50 hover:bg-purple-100/80 border border-purple-200 text-purple-800 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
              <span>Super Admin</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('member1', 'member123')}
              disabled={loading}
              className="py-2.5 px-3 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Member 1</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
