'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, AlertTriangle, Info } from 'lucide-react';

/* Small shared pieces for the Leads and WhatsApp Numbers pages (same look as the rest of the portal). */

export async function api(path, { method = 'GET', body } = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('portal_token') : null;
  const res = await fetch(path, {
    method,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    const err = new Error(data.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const fmtInt = (n) => (Number(n) || 0).toLocaleString('en-US');
export const fmtPct = (n, digits = 1) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : `${n.toFixed(n >= 10 || n === 0 ? 0 : digits)}%`);
export const fmtMoney = (n, cur = 'USD') => `${(Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${cur}`;
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export function timeAgo(d) {
  if (!d) return '—';
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const days = Math.floor(s / 86400);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return fmtDate(d);
}

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';

/* ── Layout ── */

export function PageHeader({ icon: Icon, title, subtitle, actions }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <span className="w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Icon className="w-5 h-5" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, hint, right, children, className = '', pad = true }) {
  return (
    <section className={`bg-white rounded-3xl border border-slate-200/80 min-w-0 ${pad ? 'p-4 sm:p-6' : ''} ${className}`}>
      {(title || right) && (
        <div className={`flex flex-wrap items-start justify-between gap-x-4 gap-y-2 ${pad ? 'mb-4' : 'p-4 sm:p-6 pb-0 mb-4'}`}>
          <div className="min-w-0">
            {title && <h2 className="text-sm sm:text-base font-bold text-slate-900">{title}</h2>}
            {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({ icon: Icon, tone = 'slate', label, value, sub, onClick, active }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    violet: 'bg-violet-50 text-violet-700',
  };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`text-left bg-white rounded-3xl border p-4 sm:p-5 min-w-0 transition-colors ${
        active ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200/80'
      } ${onClick ? 'hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900' : ''}`}
    >
      <div className="flex items-center gap-2">
        {Icon && (
          <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${tones[tone]}`}>
            <Icon className="w-4 h-4" />
          </span>
        )}
        <span className="text-xs font-semibold text-slate-500 truncate">{label}</span>
      </div>
      <p className="mt-3 text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight truncate" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5 truncate">{sub}</p>}
    </Tag>
  );
}

/** Two or three choices side by side (tabs, periods). */
export function Segmented({ value, onChange, options, size = 'md', label }) {
  return (
    <div className="inline-flex p-1 rounded-2xl bg-slate-100 max-w-full overflow-x-auto" role="tablist" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
              size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'
            } ${on ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            {o.icon && <o.icon className="w-4 h-4" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A filter chip with a count. */
export function Chip({ active, onClick, children, count, tone }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
        active ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900'
      }`}
    >
      {tone && <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone }} />}
      {children}
      {count !== undefined && (
        <span className={`tabular-nums ${active ? 'text-white/70' : 'text-slate-400'}`}>{fmtInt(count)}</span>
      )}
    </button>
  );
}

export function Pill({ color = '#94a3b8', children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${className}`}
      style={{ background: `${color}1a`, color: shade(color) }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}
// darker text of the same hue, so the pill stays readable on its tint
function shade(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#334155';
  const n = parseInt(m[1], 16);
  const f = 0.62;
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r}, ${g}, ${b})`;
}

export function Avatar({ name, size = 'md', ring }) {
  const s = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs';
  return (
    <span
      title={name}
      className={`${s} rounded-full bg-slate-100 border border-white text-slate-700 font-bold flex items-center justify-center shrink-0 ${ring ? 'ring-2 ring-amber-400' : ''}`}
    >
      {initials(name)}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-14">
      {Icon && (
        <span className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mb-3">
          <Icon className="w-6 h-6" />
        </span>
      )}
      <p className="text-sm font-bold text-slate-900">{title}</p>
      {text && <p className="text-xs text-slate-500 mt-1 max-w-sm">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Banner({ tone = 'info', title, children, className = '' }) {
  const t = {
    info: { box: 'bg-blue-50 border-blue-200 text-blue-900', Icon: Info, icon: 'text-blue-600' },
    success: { box: 'bg-emerald-50 border-emerald-200 text-emerald-900', Icon: CheckCircle2, icon: 'text-emerald-600' },
    warning: { box: 'bg-amber-50 border-amber-200 text-amber-900', Icon: AlertTriangle, icon: 'text-amber-600' },
    danger: { box: 'bg-red-50 border-red-200 text-red-900', Icon: AlertTriangle, icon: 'text-red-600' },
  }[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`flex gap-3 p-3.5 rounded-2xl border ${t.box} ${className}`}>
      <t.Icon className={`w-5 h-5 shrink-0 mt-0.5 ${t.icon}`} />
      <div className="min-w-0 text-sm">
        {title && <p className="font-bold">{title}</p>}
        <div className={title ? 'mt-0.5 text-[13px] opacity-90' : ''}>{children}</div>
      </div>
    </div>
  );
}

/* ── Buttons & fields ── */

export function Button({ variant = 'primary', size = 'md', icon: Icon, children, className = '', loading, ...rest }) {
  const v = {
    primary: 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm',
    brand: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
    secondary: 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300 hover:text-slate-900',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    danger: 'bg-white text-red-600 border border-red-200 hover:bg-red-50',
  }[variant];
  const s = size === 'sm' ? 'px-3 py-1.5 text-xs rounded-xl' : 'px-4 py-2.5 text-sm rounded-2xl';
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1 ${v} ${s} ${className}`}
    >
      {loading ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : Icon ? <Icon className="w-4 h-4" /> : null}
      {children}
    </button>
  );
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-semibold text-slate-700 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400';

/* ── Overlays ── */

// Overlays are drawn straight into <body>: inside the page they would be placed relative to an
// animated (transformed) parent and start 24px down instead of covering the screen.
function Portal({ children }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? createPortal(children, document.body) : null;
}

function useEscape(open, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

export function Modal({ open, onClose, title, subtitle, children, footer, width = 'max-w-lg' }) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <Portal>
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" />
      <div className={`relative w-full ${width} bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col animate-sheet-up`}>
        <div className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 pb-3">
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900 text-base">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="p-1.5 -mr-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 sm:px-6 pb-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 sm:px-6 py-4 border-t border-slate-100 flex flex-wrap justify-end gap-2 pb-safe">{footer}</div>}
      </div>
    </div>
    </Portal>
  );
}

/** A panel that slides in from the right (bottom sheet on phones) for one item's details. */
export function Drawer({ open, onClose, title, subtitle, headerExtra, children, footer }) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <Portal>
    <div className="fixed inset-0 z-[65]" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Details'}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" />
      <aside className="absolute bottom-0 left-0 right-0 max-h-[92vh] rounded-t-3xl sm:rounded-none sm:max-h-none sm:top-0 sm:left-auto sm:w-[460px] bg-white shadow-2xl border-l border-slate-200 flex flex-col animate-drawer">
        <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-bold text-slate-900 text-lg leading-tight truncate">{title}</div>
              {subtitle && <div className="text-sm text-slate-500 mt-0.5">{subtitle}</div>}
            </div>
            <button type="button" onClick={onClose} className="p-1.5 -mr-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
          {headerExtra && <div className="mt-3">{headerExtra}</div>}
        </div>
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6">{children}</div>
        {footer && <div className="px-5 sm:px-6 py-4 border-t border-slate-100 pb-safe">{footer}</div>}
      </aside>
    </div>
    </Portal>
  );
}

/* ── Toast ── */

export function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const show = (text, tone = 'success') => {
    clearTimeout(timer.current);
    setToast({ text, tone, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), tone === 'danger' ? 6000 : 3500);
  };
  const node = toast ? (
    <Portal>
    <div className="fixed z-[80] left-1/2 -translate-x-1/2 bottom-20 lg:bottom-6 px-4 w-full max-w-md pointer-events-none">
      <div
        role="status"
        className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-sheet-up ${
          toast.tone === 'danger' ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'
        }`}
      >
        {toast.tone === 'danger' ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />}
        <span className="min-w-0">{toast.text}</span>
      </div>
    </div>
    </Portal>
  ) : null;
  return [show, node];
}

/** History list (newest first) with a dot per entry. */
export function Timeline({ items, colorOf = () => '#94a3b8' }) {
  if (!items?.length) return <p className="text-xs text-slate-400">Nothing yet.</p>;
  return (
    <ol className="relative space-y-4 before:absolute before:left-[5px] before:top-1.5 before:bottom-1.5 before:w-px before:bg-slate-200">
      {items.map((h, i) => (
        <li key={i} className="relative pl-6">
          <span className="absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full border-2 border-white" style={{ background: colorOf(h) }} />
          <p className="text-[13px] text-slate-800 leading-snug">{h.text}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {fmtDateTime(h.at)}
            {h.byName ? ` · ${h.byName}` : ''}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-slate-100 rounded-2xl ${className}`} />;
}
