'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Image as ImageIcon,
  Award,
  UserCheck,
  LogOut,
  Wallet,
  ShieldCheck,
  User,
} from 'lucide-react';

export default function AppNavbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user || pathname === '/login') return null;

  const isAdmin = user.role === 'admin';

  const navLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/chat', label: 'Chats', icon: MessageSquare },
    { href: '/sellers', label: 'Sellers', icon: Users },
    { href: '/models', label: 'Models', icon: ImageIcon },
    { href: '/rewards', label: 'Rewards', icon: Award },
    { href: '/members', label: 'Members', icon: UserCheck },
  ];

  return (
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
        <div className="flex items-center space-x-3">
          {/* Member Wallet Pill */}
          {!isAdmin && (
            <div className="hidden sm:flex items-center space-x-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
              <Wallet className="w-4 h-4 text-emerald-600" />
              <div className="text-xs">
                <span className="text-slate-500">Wallet: </span>
                <span className="font-bold text-emerald-700">
                  Rs {(user.wallet?.balancePKR || 0).toLocaleString()} PKR
                </span>
              </div>
            </div>
          )}

          {/* User info & Logout */}
          <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
            <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-semibold text-sm">
              {user.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="hidden lg:block text-left">
              <p className="text-xs font-semibold text-slate-800 leading-tight">{user.name}</p>
              <p className="text-[10px] text-slate-400">@{user.username}</p>
            </div>
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
  );
}
