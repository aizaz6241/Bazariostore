'use client';

import '@livekit/components-styles';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LiveKitRoom, VideoConference, PreJoin, StartAudio, useParticipants, useConnectionState } from '@livekit/components-react';
import { DisconnectReason, ConnectionState } from 'livekit-client';
import { Video, Phone, Users, PhoneOff, MicOff, UserMinus, X, ArrowLeft, Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useCall } from '@/components/CallProvider';
import { elapsed } from '@/components/LiveCallBanner';

async function api(path, method = 'GET', body) {
  const token = localStorage.getItem('portal_token');
  const res = await fetch(path, {
    method,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.message || 'Something went wrong');
    e.status = res.status;
    throw e;
  }
  return data;
}

/**
 * A team meeting. Steps: get a ticket from the portal → choose microphone / camera (preview)
 * → join. Video, audio, screen sharing (computers), chat inside the meeting, and for admins:
 * mute / remove people and end the meeting for everyone.
 */
export default function CallPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { refresh } = useCall();
  const isAdmin = user?.role === 'admin';

  const [ticket, setTicket] = useState(null); // { url, token, call }
  const [error, setError] = useState(null); // { text, ended? }
  const [choices, setChoices] = useState(null); // after the pre-join screen
  const [ended, setEnded] = useState(null); // { title, text, retry } why the meeting closed for this person
  const endedByMeRef = useRef(false);
  const wakeRef = useRef(null);

  const loadTicket = useCallback(async () => {
    setError(null);
    try {
      setTicket(await api(`/api/calls/${id}/token`, 'POST'));
    } catch (e) {
      setError({ text: e.message, ended: e.status === 410 || e.status === 404, status: e.status });
    }
  }, [id]);

  useEffect(() => {
    if (user) loadTicket();
  }, [user, loadTicket]);

  // keep the screen on during the meeting
  useEffect(() => {
    if (!choices || ended) return undefined;
    let released = false;
    (async () => {
      try {
        if (navigator.wakeLock?.request) wakeRef.current = await navigator.wakeLock.request('screen');
        if (released) wakeRef.current?.release?.();
      } catch {}
    })();
    return () => {
      released = true;
      try {
        wakeRef.current?.release?.();
      } catch {}
    };
  }, [choices, ended]);

  const leave = () => {
    refresh();
    router.push('/chat');
  };

  const onDisconnected = useCallback(
    (reason) => {
      refresh();
      if (reason === DisconnectReason.ROOM_DELETED) {
        setEnded({ title: 'Meeting ended', text: endedByMeRef.current ? 'You ended the meeting for everyone.' : 'An admin ended this meeting.' });
      } else if (reason === DisconnectReason.PARTICIPANT_REMOVED) setEnded({ title: 'Removed from the meeting', text: 'An admin removed you from this meeting.' });
      else if (reason === DisconnectReason.DUPLICATE_IDENTITY) setEnded({ title: 'Joined on another device', text: 'You joined this meeting from another device, so this one was disconnected.' });
      else if (reason === DisconnectReason.CLIENT_INITIATED) router.push('/chat');
      else setEnded({ title: 'Connection lost', text: 'You were disconnected from the meeting. Check your internet and join again.', retry: true });
    },
    [refresh, router]
  );

  const call = ticket?.call;
  const audioOnly = call?.kind === 'audio';

  // ── screens before / after the meeting ──
  if (!user) return null;

  if (error || ended) {
    return (
      <FullScreen>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-sm w-full text-center">
            <span className="w-14 h-14 rounded-2xl bg-white/10 text-white flex items-center justify-center mx-auto mb-4">
              {error && !error.ended ? <ShieldAlert className="w-7 h-7" /> : <PhoneOff className="w-7 h-7" />}
            </span>
            <h1 className="text-lg font-bold text-white">{ended ? ended.title : error.ended ? 'This meeting has ended' : 'Could not join'}</h1>
            <p className="text-sm text-slate-400 mt-1.5">{ended ? ended.text : error.text}</p>
            <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
              {(ended?.retry || (error && !error.ended && error.status !== 403)) && (
                <button
                  type="button"
                  onClick={() => {
                    setEnded(null);
                    setChoices(null);
                    loadTicket();
                  }}
                  className="px-5 py-2.5 rounded-2xl bg-white text-slate-900 text-sm font-bold hover:bg-slate-100"
                >
                  Try again
                </button>
              )}
              <button type="button" onClick={leave} className="px-5 py-2.5 rounded-2xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20">
                Back to chat
              </button>
            </div>
          </div>
        </div>
      </FullScreen>
    );
  }

  if (!ticket) {
    return (
      <FullScreen>
        <div className="flex-1 flex items-center justify-center text-slate-300 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Getting the meeting ready…
        </div>
      </FullScreen>
    );
  }

  if (!choices) {
    return (
      <FullScreen>
        <TopBar call={call} onBack={leave} />
        <div className={`flex-1 overflow-y-auto flex items-center justify-center p-4 ${audioOnly ? 'bz-audio-call' : ''}`} data-lk-theme="default">
          <div className="w-full max-w-xl">
            <p className="text-center text-slate-300 text-sm mb-3">
              {audioOnly ? 'Check your microphone, then join.' : 'Check your camera and microphone, then join.'}
            </p>
            <PreJoin
              defaults={{ username: user.name, videoEnabled: !audioOnly, audioEnabled: true }}
              joinLabel="Join meeting"
              micLabel="Microphone"
              camLabel="Camera"
              persistUserChoices
              onSubmit={async (v) => {
                // a fresh ticket at the moment of joining: the meeting is checked to be still live
                try {
                  setTicket(await api(`/api/calls/${id}/token`, 'POST'));
                  setChoices({ ...v, videoEnabled: audioOnly ? false : v.videoEnabled });
                } catch (e) {
                  setError({ text: e.message, ended: e.status === 410 || e.status === 404, status: e.status });
                }
              }}
              onError={() => {}}
            />
          </div>
        </div>
      </FullScreen>
    );
  }

  return (
    <FullScreen>
      <LiveKitRoom
        serverUrl={ticket.url}
        token={ticket.token}
        connect
        audio={choices.audioEnabled ? { deviceId: choices.audioDeviceId || undefined } : false}
        video={!audioOnly && choices.videoEnabled ? { deviceId: choices.videoDeviceId || undefined } : false}
        options={{ adaptiveStream: true, dynacast: true }}
        onDisconnected={onDisconnected}
        onError={(e) => console.error('[call]', e)}
        data-lk-theme="default"
        className={`flex-1 min-h-0 flex flex-col ${audioOnly ? 'bz-audio-call' : ''}`}
      >
        <InRoomBar call={call} isAdmin={isAdmin} me={String(user._id)} callId={String(id)} onEnding={() => (endedByMeRef.current = true)} />
        <div className="flex-1 min-h-0 relative">
          <VideoConference />
          <StartAudio label="Tap here to hear the meeting" className="bz-start-audio" />
        </div>
      </LiveKitRoom>
    </FullScreen>
  );
}

function FullScreen({ children }) {
  // covers the portal's top / bottom bars: a meeting uses the whole screen
  return <div className="fixed inset-0 z-[90] bg-[#111] flex flex-col pb-safe">{children}</div>;
}

function TopBar({ call, onBack, children }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const Icon = call?.kind === 'audio' ? Phone : Video;
  return (
    <div className="h-14 shrink-0 px-3 sm:px-5 flex items-center gap-3 bg-slate-950 border-b border-white/10 text-white">
      {onBack && (
        <button type="button" onClick={onBack} className="p-2 -ml-1 rounded-xl text-slate-300 hover:text-white hover:bg-white/10" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
      )}
      <span className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold truncate">{call?.title || 'Team meeting'}</p>
        <p className="text-[11px] text-slate-400 truncate">
          Started by {call?.startedByName} · {call?.startedAt ? elapsed(call.startedAt) : ''}
        </p>
      </div>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  );
}

/** Inside the room: who is here, and the admin controls. */
function InRoomBar({ call, isAdmin, me, callId, onEnding }) {
  const participants = useParticipants();
  const state = useConnectionState();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');

  const say = (t) => {
    setNote(t);
    setTimeout(() => setNote(''), 3500);
  };

  const act = async (key, path, body, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(key);
    try {
      const r = await api(path, 'POST', body);
      say(r.message);
    } catch (e) {
      say(e.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <TopBar call={call}>
        {state === ConnectionState.Reconnecting && (
          <span className="text-[11px] font-semibold text-amber-300 flex items-center gap-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Reconnecting…
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ${open ? 'bg-white text-slate-900' : 'bg-white/10 text-white hover:bg-white/20'}`}
          aria-expanded={open}
          aria-label="People in the meeting"
        >
          <Users className="w-4 h-4" /> {participants.length}
        </button>
        {isAdmin && (
          <button
            type="button"
            disabled={busy === 'end'}
            onClick={() => {
              if (!window.confirm('End this meeting for everyone?')) return;
              onEnding?.();
              act('end', `/api/calls/${callId}/end`, {});
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold disabled:opacity-50"
          >
            <PhoneOff className="w-4 h-4" />
            <span className="hidden sm:inline">End for everyone</span>
          </button>
        )}
      </TopBar>

      {note && (
        <div className="absolute left-1/2 -translate-x-1/2 top-16 z-[95] px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-semibold shadow-lg">{note}</div>
      )}

      {open && (
        <div className="absolute right-2 sm:right-4 top-16 z-[95] w-[min(320px,calc(100vw-16px))] max-h-[60vh] overflow-y-auto rounded-2xl bg-slate-900 border border-white/10 shadow-2xl text-white">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <p className="text-sm font-bold">In the meeting ({participants.length})</p>
            <button type="button" onClick={() => setOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-white" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
          <ul className="py-1">
            {participants.map((p) => {
              const role = (() => {
                try {
                  return JSON.parse(p.metadata || '{}').role;
                } catch {
                  return '';
                }
              })();
              const self = p.identity === me;
              return (
                <li key={p.identity} className="flex items-center gap-3 px-4 py-2">
                  <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold shrink-0">
                    {(p.name || '?').charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">
                      {p.name || 'Member'}
                      {self ? ' (you)' : ''}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {role === 'admin' ? 'Admin' : 'Member'}
                      {p.isMicrophoneEnabled ? '' : ' · muted'}
                      {p.isScreenShareEnabled ? ' · sharing screen' : ''}
                    </p>
                  </div>
                  {isAdmin && !self && (
                    <>
                      {p.isMicrophoneEnabled && (
                        <button
                          type="button"
                          title="Switch his microphone off"
                          aria-label={`Mute ${p.name}`}
                          disabled={!!busy}
                          onClick={() => act(`m-${p.identity}`, `/api/calls/${callId}/remove`, { identity: p.identity, mute: true })}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                        >
                          <MicOff className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        title="Remove from the meeting"
                        aria-label={`Remove ${p.name}`}
                        disabled={!!busy}
                        onClick={() => act(`r-${p.identity}`, `/api/calls/${callId}/remove`, { identity: p.identity }, `Remove ${p.name} from this meeting? He will not be able to join it again.`)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-white/10"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
