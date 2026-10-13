'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import AudioPlayer from './AudioPlayer';
import {
  ChevronLeft,
  MessageSquareLock,
  Loader2,
  Eye,
  X,
  Flag,
  CheckCircle2,
  Clock,
  Lock,
  UserX,
  Ban,
  Reply,
} from 'lucide-react';

/**
 * "Member Chats" (partners only) — the right side of the chat screen.
 *
 * Members cannot message each other freely: a member asks, a partner approves (and picks how
 * long the chat may stay open), then the other member accepts. Here the partners:
 *   • approve / reject the requests waiting for them
 *   • see which member chats are open (and close one)
 *   • read reports sent by members (the reported messages are copied in)
 *   • read any member <-> member chat, without the members being told
 */

const when = (d) => {
  const x = new Date(d);
  if (!d || Number.isNaN(x.getTime())) return '';
  return `${x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${x.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};
const durationLabel = (d) => (d > 0 ? `${d} day${d === 1 ? '' : 's'}` : 'Until closed');
const STATUS_TEXT = {
  pending_admin: 'Waiting for admin',
  pending_member: 'Waiting for member',
  open: 'Open',
  rejected: 'Rejected by admin',
  declined: 'Declined by member',
  cancelled: 'Cancelled',
  closed: 'Closed',
  expired: 'Time over',
};
const preview = (m) =>
  !m ? '' : m.isDeleted ? '🚫 Message deleted' : m.messageType === 'voice' ? '🎤 Voice note' : m.messageType === 'image' ? '📷 Photo' : m.text || '';

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('portal_token')}` });

export default function MemberChatsPane({ visible, onBack, onCounts }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('requests');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [days, setDays] = useState({}); // request id -> chosen duration
  const [viewing, setViewing] = useState(null); // { conversationId, title }
  const onCountsRef = useRef(onCounts);
  onCountsRef.current = onCounts;

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/requests', { headers: authHeaders(), cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Could not load');
      setData(json);
      setError('');
      onCountsRef.current?.({ pending: (json.pending || []).length, reports: (json.reports || []).filter((r) => r.status === 'open').length });
    } catch (e) {
      setError(e.message || 'Could not load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    load();
    const t = setInterval(() => {
      if (!document.hidden) load();
    }, 15000);
    return () => clearInterval(t);
  }, [visible, load]);

  const act = async (id, body, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/chat/requests/${id}`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) alert(json.message || 'Could not save');
      await load();
    } finally {
      setBusy('');
    }
  };

  const markReport = async (id, action) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/chat/reports/${id}`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) alert((await res.json().catch(() => ({}))).message || 'Could not save');
      await load();
    } finally {
      setBusy('');
    }
  };

  const pending = data?.pending || [];
  const live = [...(data?.open || []), ...(data?.waiting || [])];
  const reports = data?.reports || [];
  const openReports = reports.filter((r) => r.status === 'open');
  const conversations = data?.conversations || [];
  const history = data?.history || [];
  const blocks = data?.blocks || [];

  const tabs = [
    { key: 'requests', label: 'Requests', n: pending.length },
    { key: 'open', label: 'Open chats', n: live.length },
    { key: 'reports', label: 'Reports', n: openReports.length },
    { key: 'all', label: 'All chats', n: 0 },
    { key: 'history', label: 'History', n: 0 },
  ];

  const viewBtn = (conversationId, title) => (
    <button
      type="button"
      onClick={() => setViewing({ conversationId, title })}
      className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1"
    >
      <Eye className="w-3.5 h-3.5" /> Read chat
    </button>
  );

  return (
    <div className="flex-1 flex flex-col bg-slate-50/60 min-w-0 relative">
      <div className="bg-slate-900 text-white px-4 py-3 sm:px-6 flex items-center gap-3 shrink-0">
        <button onClick={onBack} className="md:hidden p-1.5 -ml-1 text-slate-300 hover:text-white rounded-xl hover:bg-slate-800 transition" title="Back to all chats">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-rose-500 to-pink-600 flex items-center justify-center shrink-0">
          <MessageSquareLock className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xs sm:text-sm font-bold truncate">Member Chats</h2>
          <p className="text-[10px] text-slate-400 truncate">Members chat with each other only with your approval • Partners only</p>
        </div>
      </div>

      <div className="flex gap-1.5 px-3 py-2 bg-white border-b border-slate-200 overflow-x-auto shrink-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap flex items-center gap-1.5 ${
              tab === t.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t.label}
            {t.n > 0 && <span className={`px-1.5 rounded-full text-[10px] ${tab === t.key ? 'bg-white text-slate-900' : 'bg-rose-500 text-white'}`}>{t.n}</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3">
        {loading && !data ? (
          <div className="flex items-center justify-center py-16 text-slate-400 text-xs gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : error && !data ? (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs">{error}</div>
        ) : tab === 'requests' ? (
          pending.length === 0 ? (
            <Empty text="No chat requests waiting for you." />
          ) : (
            pending.map((p) => (
              <div key={p._id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-slate-900">
                    {p.requesterName} <span className="text-slate-400 font-normal">wants to chat with</span> {p.targetName}
                  </p>
                  <span className="text-[10px] text-slate-400 shrink-0">{when(p.createdAt)}</span>
                </div>
                <p className="text-xs text-slate-700 bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                  <span className="text-slate-400">About: </span>“{p.reason}”
                </p>
                <div>
                  <p className="text-[11px] font-semibold text-slate-500 mb-1.5">If approved, the chat stays open for:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[1, 3, 7, 0].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDays((prev) => ({ ...prev, [p._id]: d }))}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border ${
                          (days[p._id] ?? 1) === d ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {durationLabel(d)}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">After you approve, {p.targetName} still has to accept. If {p.targetName} declines, the chat does not open.</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy === p._id}
                    onClick={() => act(p._id, { action: 'approve', durationDays: days[p._id] ?? 1 })}
                    className="flex-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50"
                  >
                    {busy === p._id ? 'Saving…' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    disabled={busy === p._id}
                    onClick={() => {
                      const note = window.prompt(`Reject ${p.requesterName}'s request?\n\nOptional note for ${p.requesterName} (leave empty for none):`, '');
                      if (note === null) return;
                      act(p._id, { action: 'reject', note });
                    }}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-700 text-slate-700 text-xs font-bold disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))
          )
        ) : tab === 'open' ? (
          live.length === 0 ? (
            <Empty text="No member chats are open right now." />
          ) : (
            live.map((p) => (
              <div key={p._id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-slate-900">
                    {p.requesterName} ↔ {p.targetName}
                  </p>
                  <StatusPill status={p.status} />
                </div>
                <p className="text-xs text-slate-600">“{p.reason}”</p>
                <p className="text-[11px] text-slate-400">
                  {p.viaReferral ? 'Sent by the member’s referrer (no admin step)' : p.adminName ? `Approved by ${p.adminName}` : ''}
                  {p.status === 'open' ? ` • ${p.expiresAt ? `closes ${when(p.expiresAt)}` : 'open until closed'}` : ` • ${durationLabel(p.durationDays)}`}
                </p>
                <div className="flex gap-2 pt-1">
                  {viewBtn(p.conversationId, `${p.requesterName} ↔ ${p.targetName}`)}
                  <button
                    type="button"
                    disabled={busy === p._id}
                    onClick={() => act(p._id, { action: 'close' }, `Close the chat between ${p.requesterName} and ${p.targetName}?\n\nThey can still read old messages but cannot send new ones. To talk again they need a new request.`)}
                    className="px-2.5 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-[11px] font-bold flex items-center gap-1 disabled:opacity-50"
                  >
                    <Lock className="w-3.5 h-3.5" /> {p.status === 'open' ? 'Close chat' : 'Cancel request'}
                  </button>
                </div>
              </div>
            ))
          )
        ) : tab === 'reports' ? (
          reports.length === 0 ? (
            <Empty text="No reports." />
          ) : (
            reports.map((r) => (
              <div key={r._id} className={`bg-white rounded-2xl border p-4 shadow-xs space-y-2 ${r.status === 'open' ? 'border-rose-300' : 'border-slate-200 opacity-80'}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <Flag className="w-4 h-4 text-rose-500" /> {r.reporterName} reported {r.reportedName}
                  </p>
                  <span className="text-[10px] text-slate-400 shrink-0">{when(r.createdAt)}</span>
                </div>
                {r.note && <p className="text-xs text-slate-700">“{r.note}”</p>}
                <div className="space-y-1.5 bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                  {(r.messages || []).map((m, i) => (
                    <div key={i} className="text-xs">
                      <span className="font-bold text-slate-800">{m.senderName}</span>
                      <span className="text-[10px] text-slate-400 ml-1.5">{when(m.sentAt)}</span>
                      <p className="text-slate-700 whitespace-pre-wrap break-words">
                        {m.messageType === 'image' ? (m.mediaLink ? <img src={m.mediaLink} alt="" className="max-h-40 rounded-lg mt-1" /> : '📷 Photo') : m.messageType === 'voice' ? '🎤 Voice note (open the chat to listen)' : m.text}
                        {m.messageType === 'image' && m.text ? <span className="block">{m.text}</span> : null}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 pt-1 items-center">
                  {viewBtn(r.conversationId, `${r.reporterName} ↔ ${r.reportedName}`)}
                  {r.status === 'open' ? (
                    <button
                      type="button"
                      disabled={busy === r._id}
                      onClick={() => markReport(r._id, 'reviewed')}
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-bold flex items-center gap-1 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Mark as reviewed
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-400">
                      Reviewed by {r.reviewedByName} • {when(r.reviewedAt)}{' '}
                      <button type="button" className="underline" onClick={() => markReport(r._id, 'reopen')}>
                        reopen
                      </button>
                    </span>
                  )}
                </div>
              </div>
            ))
          )
        ) : tab === 'all' ? (
          conversations.length === 0 ? (
            <Empty text="No chats between members yet." />
          ) : (
            <>
              <p className="text-[11px] text-slate-500 px-1">Every chat between two members, newest first. Reading a chat here is never shown to the members.</p>
              {conversations.map((c) => (
                <div key={c.conversationId} className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {c.members.map((m) => m.name).join(' ↔ ')}
                      {c.open && <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 font-bold">OPEN</span>}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {c.lastMessage?.senderName}: {preview(c.lastMessage)} • {when(c.lastMessage?.createdAt)}
                    </p>
                  </div>
                  {viewBtn(c.conversationId, c.members.map((m) => m.name).join(' ↔ '))}
                </div>
              ))}
            </>
          )
        ) : (
          <>
            {blocks.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs space-y-1.5">
                <p className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                  <UserX className="w-3.5 h-3.5" /> Blocks
                </p>
                {blocks.map((b) => (
                  <p key={b._id} className="text-xs text-slate-700">
                    <b>{b.blockerName}</b> blocked <b>{b.blockedName}</b> <span className="text-slate-400">• {when(b.at)}</span>
                  </p>
                ))}
              </div>
            )}
            {history.length === 0 ? (
              <Empty text="Nothing here yet." />
            ) : (
              history.map((p) => (
                <div key={p._id} className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-slate-900">
                      {p.requesterName} → {p.targetName}
                    </p>
                    <StatusPill status={p.status} />
                  </div>
                  <p className="text-[11px] text-slate-600">“{p.reason}”</p>
                  <p className="text-[10px] text-slate-400">
                    Asked {when(p.createdAt)}
                    {p.adminName ? ` • ${p.status === 'rejected' ? 'rejected' : 'approved'} by ${p.adminName}` : ''}
                    {p.adminNote ? ` (“${p.adminNote}”)` : ''}
                    {p.closedAt ? ` • ended ${when(p.closedAt)}${p.closeReason === 'blocked' ? ' (blocked)' : p.closedByName && p.closeReason === 'admin' ? ` by ${p.closedByName}` : ''}` : ''}
                  </p>
                </div>
              ))
            )}
          </>
        )}
      </div>

      {viewing && <ChatReader conversationId={viewing.conversationId} title={viewing.title} onClose={() => setViewing(null)} />}
    </div>
  );
}

function Empty({ text }) {
  return <div className="py-16 text-center text-xs text-slate-400">{text}</div>;
}

function StatusPill({ status }) {
  const color =
    status === 'open'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'pending_admin' || status === 'pending_member'
      ? 'bg-amber-100 text-amber-700'
      : 'bg-slate-100 text-slate-600';
  return <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase shrink-0 ${color}`}>{STATUS_TEXT[status] || status}</span>;
}

/** Read-only view of a chat between two members (nothing is marked as read). */
function ChatReader({ conversationId, title, onClose }) {
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [media, setMedia] = useState({});
  const boxRef = useRef(null);
  const firstRef = useRef(true);
  const asked = useRef(new Set());

  const url = (extra = '') => `/api/chat?chatType=watch&conversationId=${encodeURIComponent(conversationId)}${extra}`;

  const loadNewest = useCallback(async () => {
    try {
      const res = await fetch(url(), { headers: authHeaders(), cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Could not load');
      setMessages((prev) => {
        const byId = new Map(prev.map((m) => [m._id, m]));
        (json.messages || []).forEach((m) => byId.set(m._id, m));
        return [...byId.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      });
      if (firstRef.current) setHasMore(!!json.hasMore);
    } catch (e) {
      // keep what is on screen
    } finally {
      setLoading(false);
    }
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadNewest();
    const t = setInterval(() => {
      if (!document.hidden) loadNewest();
    }, 5000);
    return () => clearInterval(t);
  }, [loadNewest]);

  useEffect(() => {
    if (firstRef.current && messages.length > 0 && boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
      firstRef.current = false;
    }
    // pictures / short voice notes kept inside the message are fetched separately
    const need = messages
      .filter((m) => (m.messageType === 'image' || m.messageType === 'voice') && !m.isDeleted && !m.mediaLink && !asked.current.has(m._id))
      .slice(-4)
      .map((m) => m._id);
    if (need.length > 0) {
      need.forEach((id) => asked.current.add(id));
      fetch(`/api/chat/media?ids=${need.join(',')}`, { headers: authHeaders() })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => j?.media && setMedia((prev) => ({ ...prev, ...j.media })))
        .catch(() => {});
    }
  }, [messages]);

  const loadOlder = async () => {
    const oldest = messages[0];
    if (!oldest) return;
    const res = await fetch(url(`&before=${new Date(oldest.createdAt).getTime()}`), { headers: authHeaders() });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return;
    const el = boxRef.current;
    const keep = el ? el.scrollHeight - el.scrollTop : 0;
    setHasMore(!!json.hasMore);
    setMessages((prev) => {
      const have = new Set(prev.map((m) => m._id));
      return [...(json.messages || []).filter((m) => !have.has(m._id)), ...prev];
    });
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - keep;
    });
  };

  return (
    <div className="absolute inset-0 z-30 bg-white flex flex-col">
      <div className="bg-slate-900 text-white px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={onClose} className="p-1.5 -ml-1 text-slate-300 hover:text-white rounded-xl hover:bg-slate-800" title="Close">
          <X className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h3 className="text-xs sm:text-sm font-bold truncate">{title}</h3>
          <p className="text-[10px] text-slate-400 truncate">Read only • the members are not told that you read this</p>
        </div>
      </div>
      <div ref={boxRef} className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-slate-50/60">
        {hasMore && (
          <div className="flex justify-center">
            <button type="button" onClick={loadOlder} className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Load earlier messages
            </button>
          </div>
        )}
        {loading && messages.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-slate-400 text-xs gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : messages.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400">No messages in this chat.</div>
        ) : (
          messages.map((m) =>
            String(m.messageType).startsWith('system') ? (
              <div key={m._id} className="mx-auto max-w-md bg-blue-50 border border-blue-200 text-blue-900 p-2.5 rounded-2xl text-[11px] text-center whitespace-pre-wrap">
                {m.text}
                <span className="block text-[10px] text-blue-500 mt-0.5">{when(m.createdAt)}</span>
              </div>
            ) : (
              <div key={m._id} className="bg-white border border-slate-200 rounded-2xl px-3 py-2 max-w-[85%] shadow-xs">
                <p className="text-[11px] font-bold text-slate-800">
                  {m.senderName} <span className="font-normal text-slate-400">• {when(m.createdAt)}</span>
                  {m.isEdited && !m.isDeleted && <span className="font-normal italic text-slate-400"> (edited)</span>}
                </p>
                {m.replyTo && (
                  <div className="mt-1 mb-1 pl-2 border-l-2 border-emerald-500 text-[11px] text-slate-500 flex items-center gap-1">
                    <Reply className="w-3 h-3" />
                    <span className="truncate">
                      {m.replyTo.senderName}: {m.replyTo.deleted ? 'This message was deleted' : m.replyTo.messageType === 'image' ? `📷 ${m.replyTo.text || 'Photo'}` : m.replyTo.messageType === 'voice' ? '🎤 Voice message' : m.replyTo.text}
                    </span>
                  </div>
                )}
                {m.isDeleted ? (
                  <p className="text-xs italic text-slate-400 flex items-center gap-1">
                    <Ban className="w-3 h-3" /> This message was deleted
                  </p>
                ) : m.messageType === 'image' ? (
                  <>
                    {m.mediaLink || media[m._id] ? <img src={m.mediaLink || media[m._id]} alt="" className="max-h-60 rounded-xl mt-1" /> : <p className="text-xs text-slate-400">📷 Loading photo…</p>}
                    {m.text && <p className="text-xs whitespace-pre-wrap break-words mt-1">{m.text}</p>}
                  </>
                ) : m.messageType === 'voice' ? (
                  m.mediaLink || media[m._id] ? (
                    <>
                      <AudioPlayer src={m.mediaLink || media[m._id]} duration={m.audioDuration} />
                      {m.voiceEffect === 'hacker' && <p className="text-[10px] font-bold text-violet-700 mt-1">🎭 Voice changed</p>}
                    </>
                  ) : (
                    <p className="text-xs text-slate-400">🎤 Loading voice note…</p>
                  )
                ) : (
                  <p className="text-xs whitespace-pre-wrap break-words text-slate-900">{m.text}</p>
                )}
              </div>
            )
          )
        )}
      </div>
    </div>
  );
}
