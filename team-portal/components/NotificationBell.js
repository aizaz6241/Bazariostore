'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useNotifications } from './NotificationManager';
import { Bell, X, CheckCheck, CheckCircle2, Volume2, VolumeX, MessageSquare, Wallet, Landmark, Settings2, ChevronDown } from 'lucide-react';

/**
 * The bell in the top bar.
 *
 * Shows the recent notifications (what each alert was about), newest first. Tapping one opens
 * exactly that screen (a chat alert opens that conversation) and marks it as read. Unread ones
 * are bold with a green dot, and the bell carries their number.
 * The push / sound settings that used to be the whole menu sit folded at the bottom.
 */

function timeAgo(at) {
  const t = new Date(at).getTime();
  if (!at || Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Where a tap leads, in words (so the row says what will open)
function destinationLabel(n) {
  const url = n.url || '';
  if (url.startsWith('/chat?chatType=proofs') || url.startsWith('/chat?chatType=myproofs')) return 'Opens Payment Proofs';
  if (url.startsWith('/chat')) return n.groupKey === 'chat:materials' ? 'Opens Materials group' : 'Opens the chat';
  if (url.startsWith('/wallet')) return 'Opens Wallet';
  if (url.startsWith('/finance')) return 'Opens Finance';
  if (url.startsWith('/sellers')) return 'Opens Sellers';
  if (url.startsWith('/rewards')) return 'Opens Rewards';
  if (url.startsWith('/members')) return 'Opens Members';
  if (url.startsWith('/analytics')) return 'Opens Analytics';
  return 'Opens Dashboard';
}

function TypeIcon({ n }) {
  const url = n.url || '';
  const isChat = n.type === 'chat' || url.startsWith('/chat');
  const isFinance = url.startsWith('/finance');
  const isMoney = n.type === 'finance' || url.startsWith('/wallet');
  const Icon = isChat ? MessageSquare : isFinance ? Landmark : isMoney ? Wallet : Bell;
  const tone = isChat ? 'bg-emerald-50 text-emerald-700' : isFinance || isMoney ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600';
  return (
    <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>
      <Icon className="w-4 h-4" />
    </span>
  );
}

export default function NotificationBell() {
  const {
    permission,
    soundEnabled,
    setSoundEnabled,
    enableNotifications,
    sendTestPush,
    notifications,
    unreadNotificationCount,
    refreshNotifications,
    openNotification,
    markAllNotificationsRead,
  } = useNotifications();
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const boxRef = useRef(null);
  const pathname = usePathname();

  // Fresh list every time the bell is opened
  useEffect(() => {
    if (open) refreshNotifications();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close when the person taps elsewhere, presses Escape, or moves to another screen
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const pushOn = permission === 'granted';
  const unread = unreadNotificationCount;

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={unread > 0 ? `${unread} unread notification${unread === 1 ? '' : 's'}` : 'Notifications'}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className={`p-2 rounded-lg transition-all relative ${
          open ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
        }`}
      >
        <Bell className={`w-[18px] h-[18px] ${pushOn ? 'text-slate-700' : 'text-amber-500'}`} />
        {unread > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-600 text-white text-[10px] font-bold rounded-full ring-2 ring-white">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : (
          !pushOn && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white" />
        )}
      </button>

      {open && (
        <div className="fixed left-2 right-2 top-[68px] sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden flex flex-col max-h-[calc(100vh-150px)] sm:max-h-[560px]">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 shrink-0">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 leading-tight">Notifications</p>
              <p className="text-[11px] text-slate-500 leading-tight mt-0.5">{unread > 0 ? `${unread} unread` : 'All caught up'}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {unread > 0 && (
                <button
                  onClick={markAllNotificationsRead}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-emerald-700 hover:bg-emerald-50 transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Mark all as read</span>
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100" title="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Recent notifications */}
          <div className="overflow-y-auto flex-1 min-h-0">
            {notifications.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <Bell className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-700 mt-2">No notifications yet</p>
                <p className="text-[11px] text-slate-500 mt-1">New messages, deposits, payouts and bonuses will show here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {notifications.map((n) => {
                  const isUnread = !n.readAt;
                  return (
                    <li key={n._id}>
                      <button
                        onClick={() => {
                          setOpen(false);
                          openNotification(n);
                        }}
                        className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
                          isUnread ? 'bg-emerald-50/60 hover:bg-emerald-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <TypeIcon n={n} />
                        <span className="flex-1 min-w-0">
                          <span className="flex items-start justify-between gap-2">
                            <span className={`text-xs leading-snug break-words ${isUnread ? 'font-bold text-slate-900' : 'font-medium text-slate-600'}`}>
                              {n.title}
                              {isUnread && n.count > 1 && <span className="font-semibold text-emerald-700"> · {n.count} new</span>}
                            </span>
                            {isUnread && <span className="mt-1 w-2 h-2 rounded-full bg-emerald-600 shrink-0" aria-label="Unread" />}
                          </span>
                          {n.body && (
                            <span className={`block text-[11px] leading-snug mt-0.5 line-clamp-2 break-words ${isUnread ? 'text-slate-700' : 'text-slate-500'}`}>
                              {n.body}
                            </span>
                          )}
                          <span className="block text-[10px] text-slate-400 mt-1">
                            {timeAgo(n.lastAt)} · {destinationLabel(n)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Alerts & sound settings (folded) */}
          <div className="border-t border-slate-100 shrink-0">
            <button
              onClick={() => setShowSettings((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
              aria-expanded={showSettings}
            >
              <span className="flex items-center gap-1.5">
                <Settings2 className="w-3.5 h-3.5" />
                Alerts &amp; sounds
                {!pushOn && <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px]">Off on this device</span>}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
            </button>

            {showSettings && (
              <div className="px-4 pb-3.5 space-y-2">
                {!pushOn ? (
                  <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200">
                    <p className="text-[11px] text-amber-800 font-medium leading-relaxed">
                      Phone notifications are not turned on for this device. On iPhone, first add the app to the Home Screen and open it from there.
                    </p>
                    <button
                      onClick={() => {
                        enableNotifications();
                        setOpen(false);
                      }}
                      className="mt-2 w-full py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg text-xs font-bold shadow hover:from-emerald-500 hover:to-teal-500"
                    >
                      Turn on notifications
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-2 bg-emerald-50/70 border border-emerald-200/60 rounded-xl">
                    <span className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Phone notifications are on
                    </span>
                  </div>
                )}

                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className="w-full flex items-center justify-between p-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-left"
                >
                  <span className="flex items-center gap-2">
                    {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-600" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
                    <span className="text-xs font-medium text-slate-700">Notification sounds</span>
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${soundEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {soundEnabled ? 'ON' : 'OFF'}
                  </span>
                </button>

                <div className="flex gap-1.5">
                  <button
                    onClick={() => sendTestPush('message')}
                    className="flex-1 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold transition-colors"
                    title="Send a test chat alert to this device"
                  >
                    Test chat alert
                  </button>
                  <button
                    onClick={() => sendTestPush('money')}
                    className="flex-1 py-1.5 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/70 rounded-lg text-[11px] font-semibold transition-colors"
                    title="Send a test money alert to this device"
                  >
                    Test money alert
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
