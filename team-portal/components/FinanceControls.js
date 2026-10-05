'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Check, X, Clock, History, ChevronDown, ChevronRight, Loader2, Undo2, FlaskConical } from 'lucide-react';

/**
 * Screens of the two-person approval system and the finance activity log:
 *   <ApprovalsPanel />      what is waiting for a second person (+ last decisions)
 *   <ActivityLog />         every finance action, newest first, read-only
 *   <HiddenEntries />       entries marked "no real money" (still visible, can be brought back)
 *   <ExcludedTestSellers /> money movements of test accounts (never counted, always listed)
 *   <PayoutConfirmations /> for the Wallet page: payouts written in my name, waiting for me
 */

const fmt = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const when = (d) =>
  d
    ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';
const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('portal_token')}` });

/** Loads the approvals list. `tick` changes whenever the page wants a reload. */
export function useApprovals(enabled, tick) {
  const [approvals, setApprovals] = useState(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/finance/approvals', { headers: authHeaders(), cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setApprovals(json);
    } catch (e) {
      /* keep what is on screen */
    }
  }, []);
  useEffect(() => {
    if (enabled) load();
  }, [enabled, tick, load]);
  return { approvals, setApprovals, reloadApprovals: load };
}

async function sendDecision(id, decision, note = '') {
  const res = await fetch('/api/finance/approvals', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ id, decision, note }) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || 'Could not save the decision');
  return json;
}

const STATUS_STYLE = {
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-600',
};

export function ApprovalsPanel({ approvals, onChanged }) {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [showRecent, setShowRecent] = useState(false);

  if (!approvals) return null;
  const pending = approvals.pending || [];
  const recent = approvals.recent || [];
  if (pending.length === 0 && recent.length === 0) return null;

  const decide = async (a, decision) => {
    if (decision === 'approve' && !window.confirm(`Approve this?\n\n${a.summary}\n\nIt will be applied to the ledger now.`)) return;
    let note = '';
    if (decision === 'reject') {
      note = window.prompt('Reason for rejecting (optional):', '');
      if (note === null) return;
    }
    try {
      setBusy(a.id);
      setMsg({ text: '', bad: false });
      const json = await sendDecision(a.id, decision, note);
      setMsg({ text: json.message, bad: false });
      onChanged?.(json.approvals);
    } catch (e) {
      setMsg({ text: e.message, bad: true });
      onChanged?.();
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="bg-indigo-50/70 rounded-3xl border border-indigo-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-indigo-200 flex flex-wrap items-center justify-between gap-2">
        <div className="font-bold text-indigo-950 text-sm flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          <span>Waiting for approval ({pending.length})</span>
          {approvals.waitingForMe > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold">{approvals.waitingForMe} for you</span>
          )}
        </div>
        <span className="text-[11px] text-indigo-900/70">Nothing below is applied until the other partner approves it.</span>
      </div>

      {msg.text && (
        <div className={`px-5 py-2.5 text-xs font-semibold border-b ${msg.bad ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>
          {msg.text}
        </div>
      )}

      {pending.length === 0 && <div className="px-5 py-4 text-xs text-indigo-900/70">Nothing is waiting.</div>}

      <div className="divide-y divide-indigo-100">
        {pending.map((a) => (
          <div key={a.id} className="px-5 py-3 text-xs flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="px-2 py-0.5 rounded-full bg-white border border-indigo-200 text-indigo-800 text-[10px] font-bold">{a.label}</span>
                <span className="text-slate-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {when(a.createdAt)}
                </span>
                <span className="text-slate-500">
                  asked by <b className="text-slate-800">{a.requestedBy}</b>
                  {a.source === 'admin-panel' ? ' (store admin panel)' : ''}
                </span>
              </div>
              <div className="font-bold text-slate-900 mt-1.5">{a.summary}</div>
              {(a.details || []).map((line, i) => (
                <div key={i} className="text-[11px] text-slate-600 mt-0.5">
                  {line}
                </div>
              ))}
              {a.lastError && <div className="text-[11px] text-red-700 mt-1 font-semibold">Last try failed: {a.lastError}</div>}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              {a.canApprove && (
                <>
                  <button
                    disabled={busy === a.id}
                    onClick={() => decide(a, 'approve')}
                    className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1 disabled:opacity-60"
                  >
                    {busy === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
                  </button>
                  <button
                    disabled={busy === a.id}
                    onClick={() => decide(a, 'reject')}
                    className="px-3 py-2 rounded-xl bg-white border border-red-300 text-red-700 font-bold flex items-center gap-1 disabled:opacity-60"
                  >
                    <X className="w-3.5 h-3.5" /> Reject
                  </button>
                </>
              )}
              {a.canCancel && (
                <>
                  <span className="text-[11px] text-indigo-900/70 mr-1">Waiting for the other partner</span>
                  <button
                    disabled={busy === a.id}
                    onClick={() => decide(a, 'cancel')}
                    className="px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 font-bold disabled:opacity-60"
                  >
                    Cancel request
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {recent.length > 0 && (
        <div className="border-t border-indigo-200">
          <button onClick={() => setShowRecent(!showRecent)} className="w-full px-5 py-2.5 text-left text-[11px] font-bold text-indigo-900 flex items-center gap-1">
            {showRecent ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />} Last decisions ({recent.length})
          </button>
          {showRecent && (
            <div className="divide-y divide-indigo-100 bg-white/60">
              {recent.map((a) => (
                <div key={a.id} className="px-5 py-2.5 text-[11px] flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[9px] ${STATUS_STYLE[a.status] || 'bg-slate-100 text-slate-600'}`}>{a.status}</span>
                  <span className="text-slate-800 font-semibold">{a.summary}</span>
                  <span className="text-slate-500">
                    asked by {a.requestedBy} • {a.status} by {a.decidedBy || '—'} • {when(a.decidedAt)}
                    {a.decisionNote ? ` • “${a.decisionNote}”` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Small tag for a row that has a request waiting. */
export function WaitingTag({ approval }) {
  if (!approval) return null;
  return (
    <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-bold inline-flex items-center gap-1" title={approval.summary}>
      <ShieldCheck className="w-3 h-3" /> Waiting for approval: {approval.label} (asked by {approval.requestedBy})
    </span>
  );
}

export function HiddenEntries({ rows, busyId, onBringBack }) {
  const [open, setOpen] = useState(false);
  if (!rows || rows.length === 0) return null;
  return (
    <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full px-5 py-4 text-left font-bold text-slate-900 text-sm flex items-center gap-2">
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <span>Marked “no real money” / not counted ({rows.length})</span>
        <span className="text-[11px] font-normal text-slate-500">approved by both partners or marked before approvals existed</span>
      </button>
      {open && (
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {[...rows].reverse().map((row) => (
            <div key={row.id} className="px-5 py-3 text-xs flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <b className="text-slate-900">{row.storeName}</b>
                <span className="text-slate-500">{row.kind === 'deposit' ? 'Deposit' : row.kind === 'bonus' ? 'Milestone bonus' : 'Seller withdrawal'}</span>
                <span className="text-slate-500">{day(row.date)}</span>
                {row.kind === 'bonus' ? (
                  <span className="text-slate-500">Rs {fmt(row.amountPKR, 0)} PKR</span>
                ) : (
                  <span className="text-slate-500">
                    Store wallet: ${fmt(row.walletAmount)}
                    {row.helping > 0 ? ` (helping $${fmt(row.helping)})` : ''}
                    {row.usdt > 0 ? ` • ₮${fmt(row.usdt)} entered` : ''}
                  </span>
                )}
                {row.editedBy && (
                  <span className="text-slate-400">
                    marked by {row.editedBy}
                    {row.editedAt ? ` • ${when(row.editedAt)}` : ''}
                  </span>
                )}
              </div>
              <button
                disabled={busyId === row.id}
                onClick={() => onBringBack(row)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center gap-1 disabled:opacity-60"
                title="Put it back in the “not counted yet” list"
              >
                <Undo2 className="w-3.5 h-3.5" /> Bring back
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExcludedTestSellers({ rows }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div className="p-4 rounded-3xl border border-slate-200 bg-white text-xs text-slate-700">
      <div className="font-bold text-slate-900 flex items-center gap-2">
        <FlaskConical className="w-4 h-4 text-slate-500" />
        <span>Test accounts with wallet activity (never counted)</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {rows.map((x) => (
          <span key={x.sellerId} className="px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200">
            <b>{x.storeName}</b>: {x.deposits} {x.deposits === 1 ? 'deposit' : 'deposits'} (${fmt(x.depositUSD)})
            {x.withdrawals > 0 ? `, ${x.withdrawals} withdrawals ($${fmt(x.withdrawalUSD)})` : ''}
            {x.usdt > 0 ? ` • ₮${fmt(x.usdt)} USDT typed` : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

function ValueBox({ title, value }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex-1 min-w-[220px]">
      <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">{title}</div>
      <pre className="p-2.5 rounded-xl bg-slate-900 text-slate-100 text-[10px] leading-relaxed overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

export function ActivityLog({ tick }) {
  const [rows, setRows] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async (before = null) => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch(`/api/finance/log?limit=30${before ? `&before=${encodeURIComponent(before)}` : ''}`, { headers: authHeaders(), cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to load the activity log');
      setRows((prev) => (before ? [...prev, ...json.rows] : json.rows));
      setHasMore(json.hasMore === true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [tick, load]);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
        <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
          <History className="w-4 h-4 text-slate-500" />
          <span>Activity log</span>
        </div>
        <span className="text-[11px] text-slate-500">Every finance action from this portal and the store admin panel. It cannot be edited or deleted.</span>
      </div>
      {error && <div className="px-5 py-2.5 text-xs font-semibold text-red-700 bg-red-50">{error}</div>}
      {rows.length === 0 && !loading && <div className="px-5 py-6 text-xs text-slate-400">Nothing recorded yet. Actions done from now on appear here.</div>}
      <div className="divide-y divide-slate-100">
        {rows.map((r) => {
          const hasValues = r.before !== null || r.after !== null;
          const isOpen = open === r.id;
          return (
            <div key={r.id} className="px-5 py-2.5 text-xs">
              <div
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${hasValues ? 'cursor-pointer' : ''}`}
                onClick={() => hasValues && setOpen(isOpen ? '' : r.id)}
              >
                {hasValues ? (
                  isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                ) : (
                  <span className="w-3.5" />
                )}
                <span className="text-slate-500 whitespace-nowrap">{when(r.at)}</span>
                <b className="text-slate-900">{r.actor?.name || 'System'}</b>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${r.source === 'admin-panel' ? 'bg-amber-50 text-amber-800' : 'bg-indigo-50 text-indigo-700'}`}>
                  {r.source === 'admin-panel' ? 'Store admin' : 'Portal'}
                </span>
                <span className="text-slate-700 flex-1 min-w-[200px]">{r.summary || r.action}</span>
              </div>
              {isOpen && (
                <div className="mt-2 ml-6 flex flex-wrap gap-3">
                  <ValueBox title="Before" value={r.before} />
                  <ValueBox title="After" value={r.after} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {(hasMore || loading) && (
        <div className="px-5 py-3 border-t border-slate-100">
          <button
            disabled={loading}
            onClick={() => rows.length > 0 && load(rows[rows.length - 1].at)}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold disabled:opacity-60"
          >
            {loading ? 'Loading…' : 'Show older'}
          </button>
        </div>
      )}
    </div>
  );
}

/** Wallet page: a payout somebody wrote in my name. I confirm that I received it, or say I did not. */
export function PayoutConfirmations({ tick, onChanged }) {
  const { approvals, setApprovals } = useApprovals(true, tick);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState({ text: '', bad: false });

  const mine = (approvals?.pending || []).filter((a) => a.action === 'payout' && a.payeeIsMe && a.canApprove);
  if (mine.length === 0 && !msg.text) return null;

  const decide = async (a, decision) => {
    try {
      setBusy(a.id);
      setMsg({ text: '', bad: false });
      const json = await sendDecision(a.id, decision, decision === 'reject' ? 'Not received' : '');
      setApprovals(json.approvals);
      setMsg({ text: json.message, bad: false });
      onChanged?.();
    } catch (e) {
      setMsg({ text: e.message, bad: true });
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="bg-indigo-50 rounded-3xl border border-indigo-200 p-4 text-xs space-y-2">
      <div className="font-bold text-indigo-950 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4" /> Payouts waiting for confirmation
      </div>
      {msg.text && <div className={`font-semibold ${msg.bad ? 'text-red-700' : 'text-emerald-800'}`}>{msg.text}</div>}
      {mine.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 bg-white rounded-2xl border border-indigo-100 px-3 py-2.5">
          <div>
            <div className="font-bold text-slate-900">{a.summary}</div>
            <div className="text-[11px] text-slate-500">
              written by {a.requestedBy} • {when(a.createdAt)}
              {(a.details || []).length > 0 ? ` • ${a.details.join(' • ')}` : ''}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button disabled={busy === a.id} onClick={() => decide(a, 'approve')} className="px-3 py-2 rounded-xl bg-emerald-600 text-white font-bold disabled:opacity-60">
              Yes, received
            </button>
            <button disabled={busy === a.id} onClick={() => decide(a, 'reject')} className="px-3 py-2 rounded-xl bg-white border border-red-300 text-red-700 font-bold disabled:opacity-60">
              Not received
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
