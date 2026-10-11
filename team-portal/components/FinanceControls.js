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
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
};

// one colour per kind of request, so a long list is easy to scan
const ACTION_TONE = (action) => {
  if (['payout', 'payout_reverse'].includes(action)) return { bar: 'bg-sky-500', chip: 'bg-sky-50 text-sky-800 border-sky-200' };
  if (['reserve_add', 'reserve_take'].includes(action)) return { bar: 'bg-violet-500', chip: 'bg-violet-50 text-violet-800 border-violet-200' };
  if (['bonus_reverse', 'bonus_move', 'count_bonus'].includes(action)) return { bar: 'bg-amber-500', chip: 'bg-amber-50 text-amber-800 border-amber-200' };
  if (['admin_create', 'admin_update', 'admin_delete', 'member_create'].includes(action)) return { bar: 'bg-slate-700', chip: 'bg-slate-100 text-slate-800 border-slate-300' };
  if (['skip', 'manual_delete', 'fix_deposit'].includes(action)) return { bar: 'bg-red-500', chip: 'bg-red-50 text-red-800 border-red-200' };
  return { bar: 'bg-indigo-500', chip: 'bg-indigo-50 text-indigo-800 border-indigo-200' };
};

export function ApprovalsPanel({ approvals, onChanged }) {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [view, setView] = useState('');

  if (!approvals) return null;
  const pending = approvals.pending || [];
  const recent = approvals.recent || [];
  if (pending.length === 0 && recent.length === 0) return null;

  const forMe = pending.filter((a) => a.canApprove);
  const mine = pending.filter((a) => a.canCancel);
  const others = pending.filter((a) => !a.canApprove && !a.canCancel);
  const tabs = [
    { key: 'forme', label: 'Needs your approval', list: forMe, accent: true },
    { key: 'mine', label: 'Sent by you', list: mine },
    ...(others.length ? [{ key: 'others', label: 'Other waiting', list: others }] : []),
    { key: 'decided', label: 'Decided', list: recent },
  ];
  const current = view || (forMe.length ? 'forme' : mine.length ? 'mine' : others.length ? 'others' : 'decided');
  const shown = tabs.find((t) => t.key === current) || tabs[0];

  const decide = async (a, decision) => {
    if (decision === 'approve' && !window.confirm(`Approve this?\n\n${a.summary}\n\nIt will be applied to the ledger now.`)) return;
    if (decision === 'cancel' && !window.confirm(`Cancel your request?\n\n${a.summary}`)) return;
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
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
        <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-indigo-600" />
          <span>Approvals</span>
          {forMe.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold">{forMe.length} waiting for you</span>
          )}
        </div>
        <span className="text-[11px] text-slate-500">A request changes nothing until the other partner approves it.</span>
      </div>

      <div className="px-4 sm:px-5 pt-3 flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition ${
              current === t.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t.label}
            <span
              className={`text-[10px] px-1.5 rounded-full ${
                current === t.key ? 'bg-white/20 text-white' : t.accent && t.list.length ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500'
              }`}
            >
              {t.list.length}
            </span>
          </button>
        ))}
      </div>

      {msg.text && (
        <div className={`mx-4 sm:mx-5 mt-3 px-3 py-2 rounded-xl text-xs font-semibold ${msg.bad ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>{msg.text}</div>
      )}

      <div className="p-4 sm:p-5 space-y-2">
        {shown.list.length === 0 && (
          <div className="text-xs text-slate-400 py-4 text-center">
            {current === 'forme' ? 'Nothing is waiting for you.' : current === 'mine' ? 'You have no request waiting.' : 'Nothing here.'}
          </div>
        )}

        {current !== 'decided' &&
          shown.list.map((a) => {
            const tone = ACTION_TONE(a.action);
            return (
              <div key={a.id} className="relative rounded-xl border border-slate-200 bg-white overflow-hidden">
                <span className={`absolute left-0 top-0 bottom-0 w-1 ${tone.bar}`} />
                <div className="pl-4 pr-3 py-3 flex flex-col md:flex-row md:items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${tone.chip}`}>{a.label}</span>
                      {a.source === 'admin-panel' && <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 text-[9px] font-bold uppercase">Store admin</span>}
                    </div>
                    <div className="font-semibold text-slate-900 text-[13px] mt-1.5 leading-snug">{a.summary}</div>
                    {(a.details || []).map((line, i) => (
                      <div key={i} className="text-[11px] text-slate-500 mt-0.5">
                        {line}
                      </div>
                    ))}
                    {a.action === 'payout' && typeof a.walletNow === 'number' && (
                      <div className={`text-[11px] mt-1 font-semibold ${a.walletNow + 0.005 < a.amount ? 'text-red-700' : 'text-slate-600'}`}>
                        Wallet now: ₮{a.walletNow.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                        {a.walletNow + 0.005 < a.amount ? ' — less than this payout. Do not send the money: it cannot be recorded.' : ''}
                      </div>
                    )}
                    <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {when(a.createdAt)} · asked by <b className="text-slate-600">{a.requestedBy}</b>
                    </div>
                    {a.lastError && <div className="text-[11px] text-red-700 mt-1 font-semibold">Last try failed: {a.lastError}</div>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {a.canApprove && (
                      <>
                        <button
                          disabled={busy === a.id}
                          onClick={() => decide(a, 'approve')}
                          className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-60"
                        >
                          {busy === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
                        </button>
                        <button
                          disabled={busy === a.id}
                          onClick={() => decide(a, 'reject')}
                          className="px-3 py-2 rounded-lg bg-white border border-red-200 text-red-700 text-xs font-bold flex items-center gap-1 disabled:opacity-60 hover:bg-red-50"
                        >
                          <X className="w-3.5 h-3.5" /> Reject
                        </button>
                      </>
                    )}
                    {a.canCancel && (
                      <>
                        <span className="text-[11px] text-slate-400 mr-1 hidden sm:inline">Waiting for the other partner</span>
                        <button
                          disabled={busy === a.id}
                          onClick={() => decide(a, 'cancel')}
                          className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-bold disabled:opacity-60 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

        {current === 'decided' && shown.list.length > 0 && (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {shown.list.map((a) => (
              <div key={a.id} className="px-3 py-2.5 text-xs flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                <span className={`self-start sm:self-auto px-2 py-0.5 rounded-full border font-bold uppercase text-[9px] shrink-0 ${STATUS_STYLE[a.status] || STATUS_STYLE.cancelled}`}>{a.status}</span>
                <span className="text-slate-800 font-semibold flex-1 min-w-0">{a.summary}</span>
                <span className="text-[11px] text-slate-400 shrink-0">
                  {a.requestedBy} → {a.status} by {a.decidedBy || '—'} · {when(a.decidedAt)}
                  {a.decisionNote ? ` · “${a.decisionNote}”` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
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

// "before / after" of a log line as readable rows (only what changed), instead of raw JSON
function flatten(value, prefix = '', out = {}) {
  if (value === null || value === undefined) return out;
  if (typeof value !== 'object' || value instanceof Date) {
    out[prefix || 'value'] = value;
    return out;
  }
  if (Array.isArray(value)) {
    if (value.length && value.every((v) => v && typeof v === 'object' && 'name' in v)) {
      value.forEach((v, i) => {
        const label = `${prefix ? `${prefix} · ` : ''}${v.name || i + 1}`;
        const rest = { ...v };
        delete rest.name;
        flatten(rest, label, out);
      });
      return out;
    }
    out[prefix || 'list'] = value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ');
    return out;
  }
  for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix} · ${k}` : k, out);
  return out;
}
const showValue = (v) => {
  if (v === undefined) return '—';
  if (v === null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'number') return v.toLocaleString('en-US', { maximumFractionDigits: 6 });
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return when(v);
  return String(v);
};

function ChangeTable({ before, after }) {
  const b = flatten(before);
  const a = flatten(after);
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  const rows = keys.filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]) || before === null || after === null);
  if (!rows.length) return <div className="text-[11px] text-slate-400">No values changed.</div>;
  return (
    <div className="rounded-xl border border-slate-200 overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead className="bg-slate-50 text-slate-400">
          <tr>
            <th className="text-left font-semibold px-3 py-1.5">What</th>
            {before !== null && <th className="text-left font-semibold px-3 py-1.5">Before</th>}
            {after !== null && <th className="text-left font-semibold px-3 py-1.5">After</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((k) => (
            <tr key={k}>
              <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{k}</td>
              {before !== null && <td className="px-3 py-1.5 text-slate-500 line-through decoration-slate-300">{showValue(b[k])}</td>}
              {after !== null && <td className="px-3 py-1.5 text-slate-900 font-semibold">{showValue(a[k])}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const LOG_OPEN_KEY = 'portal_finance_log_open';

export function ActivityLog({ tick, defaultOpen = false }) {
  const [rows, setRows] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState('');
  const [error, setError] = useState('');
  // closed by default; the choice is remembered on this device
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (defaultOpen) {
      setExpanded(true);
      return;
    }
    try {
      setExpanded(localStorage.getItem(LOG_OPEN_KEY) === '1');
    } catch (e) {}
  }, [defaultOpen]);
  const toggle = () => {
    setExpanded((v) => {
      try {
        localStorage.setItem(LOG_OPEN_KEY, v ? '0' : '1');
      } catch (e) {}
      return !v;
    });
  };

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

  const q = search.trim().toLowerCase();
  const shown = rows.filter((r) => {
    if (filter === 'portal' && r.source === 'admin-panel') return false;
    if (filter === 'store' && r.source !== 'admin-panel') return false;
    if (filter === 'approvals' && !String(r.action || '').startsWith('approval.') && !r.meta?.approvedBy) return false;
    if (q && !`${r.summary || ''} ${r.actor?.name || ''} ${r.action || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
  // grouped by day, newest first
  const groups = [];
  for (const r of shown) {
    const key = day(r.at);
    const g = groups[groups.length - 1];
    if (g && g.key === key) g.rows.push(r);
    else groups.push({ key, rows: [r] });
  }
  const today = day(new Date());
  const todayCount = rows.filter((r) => day(r.at) === today).length;
  const latest = rows[0];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <button type="button" onClick={toggle} className="w-full px-4 sm:px-5 py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50 transition" aria-expanded={expanded}>
        <div className="min-w-0">
          <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <span>Activity log</span>
            {todayCount > 0 && <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">{todayCount} today</span>}
          </div>
          {!expanded && latest && (
            <div className="text-[11px] text-slate-400 truncate mt-0.5">
              Last: {when(latest.at)} · {latest.actor?.name || 'System'} — {latest.summary || latest.action}
            </div>
          )}
          {expanded && <div className="text-[11px] text-slate-400 mt-0.5">Every finance action from this portal and the store admin panel. It cannot be edited or deleted.</div>}
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-100">
          <div className="px-4 sm:px-5 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 bg-slate-50/60">
            <div className="flex gap-1 overflow-x-auto">
              {[
                { key: 'all', label: 'All' },
                { key: 'portal', label: 'Portal' },
                { key: 'store', label: 'Store admin' },
                { key: 'approvals', label: 'Approvals' },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border whitespace-nowrap ${filter === f.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search store, person, action"
              className="sm:ml-auto px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs sm:w-64"
            />
          </div>
          {error && <div className="px-5 py-2.5 text-xs font-semibold text-red-700 bg-red-50">{error}</div>}
          {shown.length === 0 && !loading && <div className="px-5 py-6 text-xs text-slate-400">Nothing to show.</div>}
          {groups.map((g) => (
            <div key={g.key}>
              <div className="px-4 sm:px-5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 border-y border-slate-100">
                {g.key === today ? 'Today' : g.key}
              </div>
              <div className="divide-y divide-slate-100">
                {g.rows.map((r) => {
                  const hasValues = r.before !== null || r.after !== null;
                  const isOpen = open === r.id;
                  return (
                    <div key={r.id} className="px-4 sm:px-5 py-2 text-xs">
                      <div
                        className={`flex items-start gap-2 ${hasValues ? 'cursor-pointer' : ''}`}
                        onClick={() => hasValues && setOpen(isOpen ? '' : r.id)}
                      >
                        <span className="w-3.5 pt-0.5 shrink-0">
                          {hasValues && (isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />)}
                        </span>
                        <span className="text-slate-400 whitespace-nowrap w-11 shrink-0 pt-px">
                          {new Date(r.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="text-slate-800">{r.summary || r.action}</span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <b className="text-[11px] text-slate-500">{r.actor?.name || 'System'}</b>
                            <span className={`px-1.5 py-px rounded text-[9px] font-bold uppercase ${r.source === 'admin-panel' ? 'bg-amber-50 text-amber-800' : 'bg-indigo-50 text-indigo-700'}`}>
                              {r.source === 'admin-panel' ? 'Store admin' : 'Portal'}
                            </span>
                          </div>
                        </div>
                      </div>
                      {isOpen && (
                        <div className="mt-2 ml-6 sm:ml-16">
                          <ChangeTable before={r.before} after={r.after} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
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
      )}
    </div>
  );
}

/** Wallet page: a payout somebody wrote in my name. I confirm that I received it, or say I did not. */
export function PayoutConfirmations({ tick, onChanged }) {
  const { approvals, setApprovals } = useApprovals(true, tick);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState({ text: '', bad: false });

  const forMe = (approvals?.pending || []).filter((a) => a.action === 'payout' && a.payeeIsMe);
  // written by a partner in my name: I confirm that the money arrived
  const mine = forMe.filter((a) => a.canApprove);
  // asked for by me: waiting until a partner has paid it and approves
  const asked = forMe.filter((a) => !a.canApprove);
  // what was decided about my own requests lately
  const decided = (approvals?.recent || []).filter((a) => a.action === 'payout' && a.payeeIsMe && a.selfRequest);
  if (mine.length === 0 && asked.length === 0 && decided.length === 0 && !msg.text) return null;

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
        <ShieldCheck className="w-4 h-4" /> {mine.length > 0 ? 'Payouts waiting for confirmation' : 'Payout requests'}
      </div>
      {msg.text && <div className={`font-semibold ${msg.bad ? 'text-red-700' : 'text-emerald-800'}`}>{msg.text}</div>}
      {asked.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 bg-white rounded-2xl border border-amber-200 px-3 py-2.5">
          <div>
            <div className="font-bold text-slate-900">
              {a.selfRequest ? `Payout request of ₮${Number(a.amount || 0).toLocaleString('en-US', { maximumFractionDigits: 6 })}` : a.summary}
            </div>
            <div className="text-[11px] text-slate-500">
              <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold mr-1">Waiting for admin approval</span>
              sent {when(a.createdAt)} • nothing is deducted until it is approved
            </div>
          </div>
          {a.canCancel && (
            <button disabled={busy === a.id} onClick={() => decide(a, 'cancel')} className="px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 font-bold disabled:opacity-60">
              Cancel request
            </button>
          )}
        </div>
      ))}
      {decided.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center gap-2 bg-white/70 rounded-2xl border border-indigo-100 px-3 py-2 text-[11px]">
          <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[9px] ${STATUS_STYLE[a.status] || 'bg-slate-100 text-slate-600'}`}>
            {a.status === 'approved' ? 'paid' : 'not approved'}
          </span>
          <span className="font-semibold text-slate-800">Payout request of ₮{Number(a.amount || 0).toLocaleString('en-US', { maximumFractionDigits: 6 })}</span>
          <span className="text-slate-500">
            {a.decidedBy ? `by ${a.decidedBy} • ` : ''}
            {when(a.decidedAt)}
            {a.decisionNote ? ` • “${a.decisionNote}”` : ''}
          </span>
        </div>
      ))}
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
