'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Video, Phone, PhoneOff, Loader2 } from 'lucide-react';
import { useCall } from './CallProvider';

/**
 * Team chat header: "Join" while a meeting is live; for admins, start a video / voice meeting.
 */
export function CallHeaderButtons({ isAdmin }) {
  const { active, configured, loaded, refresh } = useCall();
  const router = useRouter();
  const [busy, setBusy] = useState('');

  if (active) {
    return (
      <Link
        href={`/call/${active.id}`}
        className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center space-x-1.5 text-xs font-bold"
        title="Join the live meeting"
      >
        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
        {active.kind === 'audio' ? <Phone className="w-4 h-4" /> : <Video className="w-4 h-4" />}
        <span>Join</span>
      </Link>
    );
  }
  if (!isAdmin || !loaded) return null;

  const start = async (kind) => {
    if (!configured) {
      alert('Calls are not set up yet. The LiveKit keys must be added to the server settings first.');
      return;
    }
    if (!window.confirm(kind === 'audio' ? 'Start a team voice call? Everybody will be notified.' : 'Start a team video meeting? Everybody will be notified.')) return;
    setBusy(kind);
    try {
      const token = localStorage.getItem('portal_token');
      const res = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ kind }),
      });
      const data = await res.json().catch(() => ({}));
      const id = data.call?.id || data.active?.id;
      if (id) {
        refresh();
        router.push(`/call/${id}`);
      } else {
        alert(data.message || 'Could not start the meeting.');
      }
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setBusy('');
    }
  };

  const cls =
    'p-2 rounded-xl bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white transition flex items-center space-x-1.5 text-xs font-medium disabled:opacity-40';
  return (
    <>
      <button type="button" onClick={() => start('audio')} disabled={!!busy} className={cls} title="Start a team voice call">
        {busy === 'audio' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
        <span className="hidden lg:inline">Voice call</span>
      </button>
      <button type="button" onClick={() => start('video')} disabled={!!busy} className={cls} title="Start a team video meeting">
        {busy === 'video' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
        <span className="hidden lg:inline">Video meeting</span>
      </button>
    </>
  );
}

/** The "meeting started" card in the team chat: Join while live, a summary afterwards. */
export function CallCard({ msg, time }) {
  const { active } = useCall();
  const live = active && String(active.id) === String(msg.callId);
  const audio = /^📞/.test(msg.text || '');
  return (
    <div className="mx-auto w-full max-w-sm my-3">
      <div className={`rounded-2xl border p-3.5 flex items-center gap-3 ${live ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
        <span className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${live ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
          {live ? audio ? <Phone className="w-5 h-5" /> : <Video className="w-5 h-5" /> : <PhoneOff className="w-5 h-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-900">{String(msg.text || '').replace(/^(📞|📹)\s*/, '')}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {live ? `Live now${active.inCall ? ` · ${active.inCall} in the call` : ''}` : 'Meeting'} · {time}
          </p>
        </div>
        {live && (
          <Link href={`/call/${active.id}`} className="shrink-0 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">
            Join
          </Link>
        )}
      </div>
    </div>
  );
}
