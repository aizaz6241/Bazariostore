'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { useNotifications } from './NotificationManager';
import { Menu, X } from 'lucide-react';
import { buildNav, isActivePath } from './navConfig';

/**
 * Phone navigation: the four everyday pages + "More".
 * "More" opens a sheet with every other page, grouped by topic (Team / Money / Insights), so the
 * bar never runs out of room again when a page is added.
 */
export default function MobileBottomNav() {
  const { user } = useAuth();
  const { unreadChatCount } = useNotifications();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => setMoreOpen(false), [pathname]);
  useEffect(() => {
    if (!moreOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setMoreOpen(false);
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [moreOpen]);

  if (!user || pathname === '/login') return null;

  const { primary, groups } = buildNav(user);
  const moreActive = groups.some((g) => g.items.some((it) => isActivePath(pathname, it.href)));
  const activeMoreItem = groups.flatMap((g) => g.items).find((it) => isActivePath(pathname, it.href));

  const tabClass = (active) =>
    `flex-1 flex flex-col items-center justify-center py-1 transition-colors ${
      active ? 'text-brand-600 font-semibold' : 'text-slate-500 hover:text-slate-800'
    }`;

  return (
    <>
      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="More pages">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl border-t border-slate-200 pb-safe max-h-[80vh] overflow-y-auto animate-sheet-up">
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <div className="w-10 h-1 rounded-full bg-slate-200 absolute left-1/2 -translate-x-1/2 top-2" />
              <h2 className="text-sm font-bold text-slate-900">More</h2>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="p-2 -mr-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-4 pb-5 space-y-4">
              {groups.map((group) => (
                <section key={group.key}>
                  <p className="px-1 mb-2 text-xs font-semibold text-slate-500">{group.label}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {group.items.map((it) => {
                      const Icon = it.icon;
                      const active = isActivePath(pathname, it.href);
                      return (
                        <Link
                          key={it.href}
                          href={it.href}
                          className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-3 text-center transition-colors ${
                            active
                              ? 'bg-slate-900 border-slate-900 text-white'
                              : 'bg-slate-50 border-slate-200/80 text-slate-700 active:bg-slate-100'
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                          <span className="text-[11px] font-semibold leading-tight">{it.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur border-t border-slate-200 pb-safe">
        <div className="flex items-center justify-around h-16 px-1">
          {primary.map((item) => {
            const Icon = item.icon;
            const isActive = isActivePath(pathname, item.href);
            return (
              <Link key={item.href} href={item.href} className={tabClass(isActive)}>
                <div className={`p-1 rounded-xl transition-all relative ${isActive ? 'bg-brand-50 scale-105' : ''}`}>
                  <Icon className="w-5 h-5" />
                  {item.href === '/chat' && unreadChatCount > 0 && (
                    <span className="absolute -top-1 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full ring-2 ring-white shadow-xs">
                      {unreadChatCount > 99 ? '99+' : unreadChatCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] mt-0.5 tracking-tight font-medium truncate max-w-full px-0.5">{item.short || item.label}</span>
              </Link>
            );
          })}
          <button type="button" onClick={() => setMoreOpen((v) => !v)} className={tabClass(moreActive || moreOpen)} aria-expanded={moreOpen}>
            <div className={`p-1 rounded-xl transition-all ${moreActive || moreOpen ? 'bg-brand-50 scale-105' : ''}`}>
              <Menu className="w-5 h-5" />
            </div>
            {/* on a page from the sheet, the tab says which page it is */}
            <span className="text-[10px] mt-0.5 tracking-tight font-medium truncate max-w-full px-0.5">
              {activeMoreItem ? activeMoreItem.label.replace('WhatsApp ', '') : 'More'}
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
