'use client';

import React, { useMemo, useState } from 'react';
import {
  Check,
  X,
  Clock,
  Loader2,
  Search,
  Inbox,
  Send,
  Hourglass,
  History,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  Wallet,
  Landmark,
  Gift,
  Users,
  FileText,
} from 'lucide-react';
import { sendDecision, STATUS_STYLE } from '@/components/FinanceControls';

/**
 * The partners' approvals list (page: /approvals). Same API and the same rules as before
 * (POST /api/finance/approvals decides; the server checks who may decide). Only the screen is new.
 */

const when = (d) =>
  d ? new Date(d).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : '';

function ago(d) {
  if (!d) return '';
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const days = Math.floor(s / 86400);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

// The kinds of requests, for the filter chips and the colour of each card
const GROUPS = [
  { key: 'payout', label: 'Payouts', icon: Wallet, actions: ['payout', 'payout_reverse'], bar: 'bg-sky-500', chip: 'bg-sky-50 text-sky-800 border-sky-200' },
  { key: 'reserve', label: 'Reserve', icon: Landmark, actions: ['reserve_add', 'reserve_take'], bar: 'bg-violet-500', chip: 'bg-violet-50 text-violet-800 border-violet-200' },
  { key: 'bonus', label: 'Rewards', icon: Gift, actions: ['bonus_reverse', 'bonus_move', 'count_bonus'], bar: 'bg-amber-500', chip: 'bg-amber-50 text-amber-800 border-amber-200' },
  { key: 'team', label: 'Team & admins', icon: Users, actions: ['admin_create', 'admin_update', 'admin_delete', 'member_create', 'reassign', 'seller_flag'], bar: 'bg-slate-700', chip: 'bg-slate-100 text-slate-800 border-slate-300' },
  { key: 'entries', label: 'Ledger entries', icon: FileText, actions: null, bar: 'bg-indigo-500', chip: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
];
const RISKY = ['skip', 'manual_delete', 'fix_deposit', 'admin_delete'];
const groupOf = (action) => GROUPS.find((g) => g.actions && g.actions.includes(action)) || GROUPS[GROUPS.length - 1];

const money = (n) => `₮${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const DECIDED_PAGE = 10;

function RequestCard({ a, busy, onDecide }) {
  const g = groupOf(a.action);
  const risky = RISKY.includes(a.action);
  const [open, setOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const details = a.details || [];
  const short = details.slice(0, 2);
  const more = details.length - short.length;
  const walletShort = a.action === 'payout' && typeof a.walletNow === 'number' && a.walletNow + 0.005 < a.amount;

  return (
    <article className="relative bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${risky ? 'bg-red-500' : g.bar}`} />
      <div className="pl-4 pr-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${risky ? 'bg-red-50 text-red-800 border-red-200' : g.chip}`}>{a.label}</span>
              {a.source === 'admin-panel' && <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 text-[9px] font-bold uppercase">Store admin</span>}
              {a.selfRequest && <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-800 text-[9px] font-bold uppercase">Member asked</span>}
            </div>
            <h3 className="font-bold text-slate-900 text-sm mt-2 leading-snug">{a.summary}</h3>
          </div>
          {a.action === 'payout' && a.amount > 0 && (
            <div className="text-right shrink-0">
              <p className="text-lg font-black text-slate-900 tabular-nums">{money(a.amount)}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">USDT</p>
            </div>
          )}
        </div>

        {details.length > 0 && (
          <div className="mt-2 space-y-0.5">
            {(open ? details : short).map((line, i) => (
              <p key={i} className="text-xs text-slate-600 leading-relaxed">
                {line}
              </p>
            ))}
            {more > 0 && (
              <button type="button" onClick={() => setOpen(!open)} className="text-[11px] font-bold text-indigo-700 inline-flex items-center gap-0.5 mt-0.5">
                {open ? 'Less' : `${more} more line${more === 1 ? '' : 's'}`}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
        )}

        {a.action === 'payout' && typeof a.walletNow === 'number' && (
          <div
            className={`mt-2.5 px-3 py-2 rounded-xl text-xs font-semibold flex items-start gap-2 ${
              walletShort ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-slate-50 text-slate-600 border border-slate-200'
            }`}
          >
            <Wallet className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Wallet now: {money(a.walletNow)}
              {walletShort ? ' — less than this payout. Do not send the money: it cannot be recorded.' : ''}
            </span>
          </div>
        )}
        {a.lastError && (
          <div className="mt-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-semibold flex gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Last try failed: {a.lastError}
          </div>
        )}

        <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-[11px] text-slate-400 flex items-center gap-1 flex-1 min-w-0">
            <Clock className="w-3 h-3 shrink-0" />
            <span className="truncate">
              {ago(a.createdAt)} · {when(a.createdAt)} · by <b className="text-slate-600">{a.requestedBy}</b>
            </span>
          </p>

          {a.canApprove && !rejecting && (
            <div className="grid grid-cols-2 sm:flex gap-2 shrink-0">
              <button
                type="button"
                disabled={busy}
                onClick={() => onDecide(a, 'approve')}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60 shadow-sm"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Approve
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setRejecting(true)}
                className="px-4 py-2.5 rounded-xl bg-white border border-red-200 text-red-700 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60 hover:bg-red-50"
              >
                <X className="w-4 h-4" /> Reject
              </button>
            </div>
          )}
          {a.canCancel && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-1 rounded-lg flex items-center gap-1">
                <Hourglass className="w-3 h-3" /> Waiting for the other partner
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onDecide(a, 'cancel')}
                className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold disabled:opacity-60 hover:bg-slate-50"
              >
                Cancel request
              </button>
            </div>
          )}
        </div>

        {rejecting && (
          <div className="mt-3 p-3 rounded-xl bg-red-50/60 border border-red-200 space-y-2">
            <label className="block text-xs font-bold text-red-800">Reason for rejecting (optional)</label>
            <input
              autoFocus
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Amount is wrong"
              className="w-full px-3 py-2 rounded-xl bg-white border border-red-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const ok = await onDecide(a, 'reject', reason.trim());
                  if (ok) setRejecting(false);
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-60"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />} Reject request
              </button>
              <button type="button" onClick={() => setRejecting(false)} className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold">
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

export default function ApprovalsBoard({ approvals, onChanged }) {
  const [view, setView] = useState('');
  const [group, setGroup] = useState('all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [decidedShown, setDecidedShown] = useState(DECIDED_PAGE);

  const pending = approvals?.pending || [];
  const recent = approvals?.recent || [];
  const forMe = pending.filter((a) => a.canApprove);
  const mine = pending.filter((a) => a.canCancel);
  const others = pending.filter((a) => !a.canApprove && !a.canCancel);

  const tabs = [
    { key: 'forme', label: 'Waiting for you', short: 'For you', icon: Inbox, list: forMe, tone: 'indigo' },
    { key: 'mine', label: 'Sent by you', short: 'Sent', icon: Send, list: mine, tone: 'amber' },
    ...(others.length ? [{ key: 'others', label: 'Other waiting', short: 'Other', icon: Hourglass, list: others, tone: 'slate' }] : []),
    { key: 'decided', label: 'Decided', short: 'Decided', icon: History, list: recent, tone: 'slate' },
  ];
  // Opens on what needs me; never on a long "Decided" list unless nothing else is waiting
  const current = view || (forMe.length ? 'forme' : mine.length ? 'mine' : others.length ? 'others' : 'decided');
  const tab = tabs.find((t) => t.key === current) || tabs[0];

  const counts = useMemo(() => {
    const c = {};
    for (const a of tab.list) c[groupOf(a.action).key] = (c[groupOf(a.action).key] || 0) + 1;
    return c;
  }, [tab]);

  const list = tab.list.filter((a) => {
    if (group !== 'all' && groupOf(a.action).key !== group) return false;
    if (q.trim()) {
      const hay = `${a.summary} ${a.label} ${(a.details || []).join(' ')} ${a.requestedBy} ${a.decidedBy || ''}`.toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  });

  const decide = async (a, decision, note = '') => {
    if (decision === 'approve' && !window.confirm(`Approve this?\n\n${a.summary}\n\nIt will be applied to the ledger now.`)) return false;
    if (decision === 'cancel' && !window.confirm(`Cancel your request?\n\n${a.summary}`)) return false;
    try {
      setBusy(a.id);
      setMsg({ text: '', bad: false });
      const json = await sendDecision(a.id, decision, note);
      setMsg({ text: json.message, bad: false });
      onChanged?.(json.approvals);
      return true;
    } catch (e) {
      setMsg({ text: e.message, bad: true });
      onChanged?.();
      return false;
    } finally {
      setBusy('');
    }
  };

  const toneOn = {
    indigo: 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20',
    amber: 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20',
    slate: 'bg-slate-900 text-white border-slate-900 shadow-md',
  };

  return (
    <div className="space-y-4">
      {/* Tabs as big tiles: the count is the first thing the eye sees */}
      <div className={`grid gap-2.5 ${tabs.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
        {tabs.map((t) => {
          const on = current === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setView(t.key);
                setGroup('all');
                setDecidedShown(DECIDED_PAGE);
              }}
              className={`text-left rounded-2xl border px-3.5 py-3 transition-all ${on ? toneOn[t.tone] : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <t.icon className={`w-4 h-4 ${on ? 'text-white/90' : 'text-slate-400'}`} />
                {t.key === 'forme' && t.list.length > 0 && !on && <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />}
              </div>
              <p className={`text-2xl font-black mt-1.5 tabular-nums ${on ? 'text-white' : 'text-slate-900'}`}>{t.list.length}</p>
              <p className={`text-[11px] font-bold truncate ${on ? 'text-white/85' : 'text-slate-500'}`}>
                <span className="sm:hidden">{t.short}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </p>
            </button>
          );
        })}
      </div>

      {/* Filter by kind + search */}
      <div className="bg-white rounded-2xl border border-slate-200 p-2.5 flex flex-col sm:flex-row gap-2.5 sm:items-center">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-0.5 px-0.5">
          {[{ key: 'all', label: 'All' }, ...GROUPS].map((gr) => {
            const n = gr.key === 'all' ? tab.list.length : counts[gr.key] || 0;
            if (gr.key !== 'all' && n === 0) return null;
            const on = group === gr.key;
            return (
              <button
                key={gr.key}
                type="button"
                onClick={() => setGroup(gr.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition ${
                  on ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {gr.icon && <gr.icon className="w-3.5 h-3.5" />}
                {gr.label}
                <span className={`text-[10px] px-1.5 rounded-full ${on ? 'bg-white/20' : 'bg-white text-slate-500'}`}>{n}</span>
              </button>
            );
          })}
        </div>
        <div className="relative sm:ml-auto sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, store, amount…"
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
          />
        </div>
      </div>

      {msg.text && (
        <div
          className={`px-4 py-3 rounded-2xl text-xs font-semibold flex items-start gap-2 ${
            msg.bad ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          }`}
        >
          {msg.bad ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
          <span className="flex-1">{msg.text}</span>
          <button type="button" onClick={() => setMsg({ text: '', bad: false })} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* The list */}
      {list.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 py-14 px-6 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
          <p className="text-sm font-bold text-slate-900 mt-3">
            {q || group !== 'all' ? 'Nothing matches this filter' : current === 'forme' ? 'All clear — nothing is waiting for you' : current === 'mine' ? 'You have no request waiting' : 'Nothing here yet'}
          </p>
          <p className="text-xs text-slate-500 mt-1">A request changes nothing until the other partner approves it.</p>
        </div>
      ) : current !== 'decided' ? (
        <div className="space-y-3">
          {list.map((a) => (
            <RequestCard key={a.id} a={a} busy={busy === a.id} onDecide={decide} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {list.slice(0, decidedShown).map((a) => {
            const g = groupOf(a.action);
            return (
              <div key={a.id} className="px-4 py-3 flex items-start gap-3">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${g.bar}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`px-2 py-0.5 rounded-full border font-bold uppercase text-[9px] ${STATUS_STYLE[a.status] || STATUS_STYLE.cancelled}`}>{a.status}</span>
                    <span className="text-[10px] font-bold text-slate-400">{a.label}</span>
                  </div>
                  <p className="text-[13px] font-semibold text-slate-800 mt-1 leading-snug">{a.summary}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Asked by {a.requestedBy} · {a.status} by {a.decidedBy || '—'} · {when(a.decidedAt)}
                    {a.decisionNote ? ` · “${a.decisionNote}”` : ''}
                  </p>
                </div>
                {a.amount > 0 && <span className="text-sm font-bold text-slate-700 tabular-nums shrink-0">{money(a.amount)}</span>}
              </div>
            );
          })}
          {list.length > decidedShown && (
            <button
              type="button"
              onClick={() => setDecidedShown((n) => n + DECIDED_PAGE)}
              className="w-full py-3 text-xs font-bold text-indigo-700 hover:bg-indigo-50 flex items-center justify-center gap-1"
            >
              Show {Math.min(DECIDED_PAGE, list.length - decidedShown)} more <ChevronDown className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
