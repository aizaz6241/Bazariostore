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
  Wallet,
  Landmark,
} from 'lucide-react';

export default function MobileBottomNav() {
  const { user } = useAuth();
  const pathname = usePathname();

  if (!user || pathname === '/login') return null;

  const isAdmin = user.role === 'admin';

  const navItems = [
    { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
    { href: '/chat', label: 'Chats', icon: MessageSquare },
    ...(isAdmin ? [] : [{ href: '/sellers', label: 'Sellers', icon: Users }]),
    { href: '/wallet', label: 'Wallet', icon: Wallet },
    { href: '/rewards', label: 'Rewards', icon: Award },
    ...(isAdmin ? [{ href: '/members', label: 'Members', icon: UserCheck }] : []),
    ...(isAdmin ? [{ href: '/finance', label: 'Finance', icon: Landmark }] : []),
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur border-t border-slate-200 pb-safe">
      <div className="flex items-center justify-around h-16 px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-colors ${
                isActive ? 'text-brand-600 font-semibold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className={`p-1 rounded-xl transition-all ${isActive ? 'bg-brand-50 scale-105' : ''}`}>
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
