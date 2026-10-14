'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Video, Phone } from 'lucide-react';
import { useCall } from './CallProvider';

export function elapsed(since) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** A strip under the top bar on every page while a team meeting is live: one tap to join. */
export default function LiveCallBanner() {
  const { active } = useCall();
  const pathname = usePathname();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [active]);

  // (the chat has its own Join button and card, and a full-height layout: no strip there)
  if (!active || pathname?.startsWith('/call/') || pathname === '/login' || pathname === '/chat') return null;
  const Icon = active.kind === 'audio' ? Phone : Video;
  return (
    <div className="sticky top-16 z-30 bg-emerald-600 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-3">
        <span className="relative flex w-2.5 h-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-white" />
        </span>
        <Icon className="w-4 h-4 shrink-0" />
        <p className="text-xs sm:text-sm font-semibold min-w-0 truncate">
          {active.title} is live
          <span className="font-normal text-emerald-100">
            {' '}
            · {active.startedByName} · {elapsed(active.startedAt)}
            {active.inCall ? ` · ${active.inCall} in the call` : ''}
          </span>
        </p>
        <Link
          href={`/call/${active.id}`}
          className="ml-auto shrink-0 px-3.5 py-1.5 rounded-xl bg-white text-emerald-700 text-xs sm:text-sm font-bold hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          Join
        </Link>
      </div>
    </div>
  );
}
