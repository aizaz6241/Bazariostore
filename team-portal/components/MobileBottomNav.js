'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { useNotifications } from './NotificationManager';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Image as ImageIcon,
  Award,
  UserCheck,
  Wallet,
  Landmark,
  BarChart3,
} from 'lucide-react';

export default function MobileBottomNav() {
  const { user } = useAuth();
  const { unreadChatCount } = useNotifications();
  const pathname = usePathname();

  if (!user || pathname === '/login') return null;

  const isAdmin = user.role === 'admin';

  const navItems = [
    { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
    { href: '/chat', label: 'Chats', icon: MessageSquare },
    ...(isAdmin ? [] : [{ href: '/sellers', label: 'Sellers', icon: Users }]),
    { href: '/wallet', label: 'Wallet', icon: Wallet },
    { href: '/analytics', label: 'Analytics', icon: BarChart3 },
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
              <div className={`p-1 rounded-xl transition-all relative ${isActive ? 'bg-brand-50 scale-105' : ''}`}>
                <Icon className="w-5 h-5" />
                {item.href === '/chat' && unreadChatCount > 0 && (
                  <span className="absolute -top-1 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-emerald-600 text-white text-[10px] font-bold rounded-full ring-2 ring-white shadow-xs">
                    {unreadChatCount > 99 ? '99+' : unreadChatCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
