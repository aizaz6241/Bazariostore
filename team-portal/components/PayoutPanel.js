'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveRefresh } from '@/components/LiveProvider';
import { CalendarDays, Layers, Loader2, X, Send, AlertTriangle, CheckCircle2, Info, RefreshCw } from 'lucide-react';
import { formatMoney } from '@/lib/utils/currency';
import {
  firstMonthKey,
  monthsSince,
  monthLabel,
  monthKeyOf,
  monthRange,
  addMonths,
  walletMonths,
} from '@/lib/utils/payoutMonths';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const floor2 = (n) => Math.max(0, Math.floor((Number(n) || 0) * 100 + 1e-6) / 100);
const usdt = (n) => `${Number(n) < 0 ? '-' : ''}₮${formatMoney(Math.abs(Number(n) || 0))}`;
const shortDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function Figure({ label, value, tone = 'slate', hint }) {
  const tones = {
    slate: 'text-slate-900',
    green: 'text-emerald-700',
    red: 'text-rose-600',
    blue: 'text-blue-700',
  };
  return (
    <div className="rounded-2xl bg-slate-50 border border-slate-200/80 px-3.5 py-3 min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 truncate">{label}</p>
      <p className={`text-base sm:text-lg font-extrabold mt-0.5 truncate ${tones[tone]}`}>{value}</p>
      {hint && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{hint}</p>}
    </div>
  );
}

/**
 * Payout form: pick a month (default) or the whole balance, see what is due, pay / ask for it.
 * The amount rules are the server's (never more than the wallet holds); the month is a label.
 *
 * memberId   only when a partner works on someone else's wallet
 * viewerIsAdmin, isSelf, payeeName  for the words on the screen
 */
export default function PayoutPanel({ memberId = null, viewerIsAdmin = false, isSelf = true, payeeName = '', onClose, onDone }) {
  const boxRef = useRef(null);
  const amountRef = useRef(null);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [mode, setMode] = useState('month'); // 'month' | 'all'
  const [monthKey, setMonthKey] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  const load = useCallback(
    async (silent = false) => {
      try {
        if (!silent) {
          setLoading(true);
          setLoadError('');
        }
        const token = localStorage.getItem('portal_token');
        let url = '/api/wallet?period=all';
        if (memberId) url += `&memberId=${encodeURIComponent(memberId)}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message || 'Could not load the wallet');
        setWallet(json);
      } catch (e) {
        if (!silent) setLoadError(e.message || 'Could not load the wallet');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [memberId]
  );

  useEffect(() => {
    load();
  }, [load]);

  // A deposit / withdrawal / payout elsewhere changes what is due: keep the numbers live
  useLiveRefresh(() => load(true));

  // Open right where the eye is: scroll the panel into view
  useEffect(() => {
    const t = setTimeout(() => boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    return () => clearTimeout(t);
  }, []);

  const firstKey = useMemo(() => firstMonthKey(wallet?.financeStart), [wallet?.financeStart]);
  const months = useMemo(() => monthsSince(firstKey), [firstKey]);
  const byMonth = useMemo(() => walletMonths(wallet?.transactions, firstKey), [wallet, firstKey]);
  const thisMonth = monthKeyOf(new Date());

  // Default: the month that just ended (paid on the 1st–2nd), else the running month
  useEffect(() => {
    if (!wallet || monthKey) return;
    const prev = addMonths(thisMonth, -1);
    setMonthKey(months.includes(prev) ? prev : months[0]);
  }, [wallet, months, monthKey, thisMonth]);

  const balances = wallet?.balances || {};
  const available = r2(balances.availableUSDT ?? balances.balanceUSDT ?? 0);
  const m = byMonth.get(monthKey) || { earned: 0, deducted: 0, paid: 0, net: 0, left: 0, payouts: [] };
  const suggested = mode === 'month' ? floor2(Math.min(m.left, available)) : floor2(available);

  // Every time the month or the type changes, the amount is filled in again
  const [filledFor, setFilledFor] = useState('');
  useEffect(() => {
    if (!wallet || (mode === 'month' && !monthKey)) return;
    const k = `${mode}:${monthKey}`;
    if (filledFor === k) return;
    setFilledFor(k);
    setAmount(suggested > 0 ? String(suggested) : '');
  }, [wallet, mode, monthKey, suggested, filledFor]);

  const pickMode = (next) => {
    setMode(next);
    setMsg({ text: '', type: '' });
  };
  const pickMonth = (next) => {
    setMonthKey(next);
    setMsg({ text: '', type: '' });
  };

  const value = Number(amount);
  const overWallet = value > available + 0.004;
  const overMonth = mode === 'month' && value > m.left + 0.004 && !overWallet;
  const running = mode === 'month' && monthKey === thisMonth;
  const range = monthKey ? monthRange(monthKey) : null;
  const iAmPaying = viewerIsAdmin; // a partner records; a member asks
  const title = viewerIsAdmin ? (isSelf ? 'Record my payout' : `Record payout${payeeName ? ` for ${payeeName}` : ''}`) : 'Request a payout';

  const submit = async (e) => {
    e?.preventDefault();
    if (!(value > 0)) {
      setMsg({ text: 'Enter the amount to pay (more than 0).', type: 'error' });
      amountRef.current?.focus();
      return;
    }
    if (overWallet) {
      setMsg({ text: `The wallet can give at most ${usdt(available)} right now.`, type: 'error' });
      return;
    }
    try {
      setSending(true);
      setMsg({ text: '', type: '' });
      const token = localStorage.getItem('portal_token');
      const res = await fetch('/api/wallet/payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...(memberId ? { userId: memberId } : {}),
          amount: r2(value),
          currency: 'USDT',
          note: note.trim(),
          forMonth: mode === 'month' ? monthKey : '',
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'The payout could not be saved');
      setMsg({ text: json.pendingApproval ? json.message : 'Payout recorded. The wallet is updated.', type: 'success' });
      setNote('');
      setAmount('');
      onDone?.(json);
      setTimeout(() => onClose?.(), json.pendingApproval ? 5000 : 2500);
      await load(true);
      setFilledFor(''); // fill the amount again from the new numbers
    } catch (err) {
      setMsg({ text: err.message || 'Network error', type: 'error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      ref={boxRef}
      className="scroll-mt-24 bg-white rounded-3xl border-2 border-amber-300 shadow-lg shadow-amber-500/10 overflow-hidden animate-scale-up"
    >
      {/* Head */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200/70">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
            <Send className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h3 className="font-extrabold text-slate-900 text-sm sm:text-base truncate">{title}</h3>
            <p className="text-[11px] text-slate-500">
              {iAmPaying
                ? isSelf
                  ? 'Recorded at once and taken from your wallet.'
                  : 'Saved as a request: recorded after the other partner approves or the person confirms.'
                : 'An admin pays you on Binance and approves it. Nothing is taken from your wallet before that.'}
            </p>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close payout" className="p-2 rounded-xl text-slate-500 hover:bg-white hover:text-slate-900 transition">
          <X className="w-5 h-5" />
        </button>
      </div>

      {loading && !wallet ? (
        <div className="p-10 flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin text-amber-600" /> Working out what is due…
        </div>
      ) : loadError && !wallet ? (
        <div className="p-5 flex items-center justify-between gap-3 text-sm text-red-700 bg-red-50">
          <span>{loadError}</span>
          <button type="button" onClick={() => load()} className="px-3 py-1.5 rounded-xl bg-white border border-red-200 text-xs font-bold">
            Try again
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="p-5 space-y-4">
          {/* Monthly / Overall */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex p-1 rounded-2xl bg-slate-100" role="tablist" aria-label="Payout type">
              {[
                { id: 'month', label: 'Monthly', icon: CalendarDays },
                { id: 'all', label: 'Overall', icon: Layers },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === t.id}
                  onClick={() => pickMode(t.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    mode === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <t.icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              ))}
            </div>

            {mode === 'month' && (
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={monthKey}
                  onChange={(e) => pickMonth(e.target.value)}
                  aria-label="Month"
                  className="px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {months.map((k) => (
                    <option key={k} value={k}>
                      {monthLabel(k)}
                      {k === thisMonth ? ' (running)' : ''}
                    </option>
                  ))}
                </select>
                {range && (
                  <span className="text-xs text-slate-500">
                    {shortDate(range.from)} – {shortDate(range.to)}
                  </span>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => load()}
              className="ml-auto p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              title="Update the numbers"
              aria-label="Update the numbers"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* What is due */}
          {mode === 'month' ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <Figure label="Earned in month" value={usdt(m.earned)} tone="green" hint="Deposit shares + bonuses" />
              <Figure label="Deducted" value={usdt(m.deducted)} tone="red" hint="Seller withdrawals + bonus costs" />
              <Figure label="Already paid" value={usdt(m.paid)} tone="blue" hint={`${m.payouts.length} payout${m.payouts.length === 1 ? '' : 's'} for this month`} />
              <Figure label="Left for this month" value={usdt(m.left)} hint={`Net ${usdt(m.net)}`} />
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
              <Figure label="Total earned" value={usdt(balances.totalEarnedUSDT)} tone="green" />
              <Figure label="Total deducted + paid" value={usdt(balances.totalWithdrawnUSDT)} tone="red" />
              <Figure label="In the wallet now" value={usdt(balances.balanceUSDT)} />
            </div>
          )}

          {/* Small notes that matter */}
          <div className="space-y-1.5">
            {running && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {monthLabel(monthKey)} is still running: its amount can still go up or down until the month ends.
              </p>
            )}
            {mode === 'month' && m.payouts.length > 0 && (
              <p className="text-[11px] text-slate-500 px-1">
                Paid for {monthLabel(monthKey)}:{' '}
                {m.payouts.map((p, i) => (
                  <span key={p.id || i}>
                    {i > 0 ? ', ' : ''}
                    <strong className="text-slate-700">{usdt(p.amount)}</strong> on {shortDate(p.date)}
                    {p.gift ? ' (device gift)' : ''}
                    {p.auto && !p.gift ? '*' : ''}
                  </span>
                ))}
                {m.payouts.some((p) => p.auto && !p.gift) && (
                  <span className="block text-slate-400 mt-0.5">* an older payout without a month: one made on the 1st–10th counts for the month before.</span>
                )}
              </p>
            )}
            {mode === 'month' && m.left > available + 0.004 && (
              <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex gap-2">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                The wallet holds less than this month's amount right now ({usdt(available)} can be taken)
                {(balances.heldForMembersUSDT || 0) > 0 ? ': part of it is with members who are in minus.' : ': later withdrawals or reserve moves lowered it.'}{' '}
                The amount below is capped to what can really be paid.
              </p>
            )}
          </div>

          {/* Amount + note + send */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Can be taken now</p>
                <p className="text-sm font-extrabold text-slate-900">{usdt(available)}</p>
              </div>
              {suggested > 0 && Math.abs(value - suggested) > 0.004 && (
                <button
                  type="button"
                  onClick={() => setAmount(String(suggested))}
                  className="text-xs font-bold text-amber-700 hover:text-amber-900 underline underline-offset-2"
                >
                  Use {usdt(suggested)}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              <label className="sm:col-span-2 block">
                <span className="block text-xs font-bold text-slate-700 mb-1">Amount (₮ USDT)</span>
                <input
                  ref={amountRef}
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className={`w-full px-3 py-2.5 rounded-xl bg-white border text-lg font-extrabold focus:outline-none focus:ring-2 ${
                    overWallet ? 'border-red-400 focus:ring-red-400' : 'border-slate-300 focus:ring-amber-500'
                  }`}
                />
              </label>
              <label className="sm:col-span-3 block">
                <span className="block text-xs font-bold text-slate-700 mb-1">
                  {viewerIsAdmin ? 'Note / Binance TXID' : 'Your Binance Pay ID / note'}
                </span>
                <input
                  type="text"
                  maxLength={300}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={viewerIsAdmin ? 'e.g. Binance TXID 991288' : 'e.g. Binance Pay ID 123456789'}
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </label>
            </div>

            {overWallet && <p className="text-xs font-semibold text-red-600">More than the wallet can give: at most {usdt(available)}.</p>}
            {overMonth && (
              <p className="text-xs font-semibold text-amber-700">
                This is {usdt(r2(value - m.left))} more than what is left for {monthLabel(monthKey)}. It is allowed (it comes from the wallet), but check it once.
              </p>
            )}

            {msg.text && (
              <div
                className={`px-3 py-2.5 rounded-xl text-xs font-semibold flex items-start gap-2 ${
                  msg.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                }`}
              >
                {msg.type === 'error' ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
                <span>{msg.text}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={sending || overWallet || !(value > 0)}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-extrabold transition flex items-center justify-center gap-2 shadow-sm"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>
                {viewerIsAdmin ? 'Confirm payout' : 'Send request'}
                {value > 0 ? ` · ${usdt(value)}` : ''}
                {mode === 'month' && monthKey ? ` · ${monthLabel(monthKey, true)}` : ''}
              </span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
