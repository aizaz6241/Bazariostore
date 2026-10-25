import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { STATUS_LABELS, STATUS_WARNINGS } from '../data.js';

/**
 * Status changes from the order list itself (one order from its row, or many ticked orders at
 * once). Every change goes through the same server route as the order page
 * (POST /orders/:id/status), so money, stock and the automatic schedule follow the same rules.
 */
export const STATUS_CHOICES = ['confirmed', 'processing', 'packed', 'out_from_warehouse', 'delivery_warehouse', 'out_for_delivery', 'delivery_failed', 'returned_to_warehouse', 'delivered', 'cancelled'];
// these move money at once: always asked first
export const MONEY_STATUSES = ['delivered', 'cancelled'];

/** the statuses an order may be moved to from here */
export const choicesFor = (current) => STATUS_CHOICES.filter((st) => st !== current && !(st === 'cancelled' && current === 'delivered'));

/** a small menu that opens under the row's Status button (fixed, so the table scroll never cuts it) */
export function StatusMenu({ anchor, current, onPick, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const r = anchor.getBoundingClientRect();
    const m = ref.current.getBoundingClientRect();
    const below = r.bottom + 6 + m.height <= window.innerHeight - 8;
    const top = below ? r.bottom + 6 : Math.max(8, r.top - 6 - m.height);
    const left = Math.min(Math.max(8, r.right - m.width), window.innerWidth - m.width - 8);
    setPos({ top, left });
  }, [anchor]);
  useEffect(() => {
    const close = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'mousedown' && (ref.current?.contains(e.target) || anchor?.contains(e.target))) return;
      onClose();
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('resize', onClose);
    // any scroll (the page scrolls inside the layout, so listen in the capture phase)
    const onScroll = (e) => !ref.current?.contains(e.target) && onClose();
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('resize', onClose);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [anchor, onClose]);
  useEffect(() => {
    ref.current?.querySelector('button')?.focus();
  }, []);

  return (
    <div className="ost-menu" ref={ref} role="menu" style={{ top: pos.top, left: pos.left }}>
      <div className="ost-menu-head">Change status to</div>
      {choicesFor(current).map((st) => (
        <button key={st} type="button" role="menuitem" className={`ost-menu-item st-${st} ${MONEY_STATUSES.includes(st) ? 'money' : ''}`} onClick={() => onPick(st)}>
          <i aria-hidden="true" />
          {STATUS_LABELS[st] || st}
          {MONEY_STATUSES.includes(st) && <small>moves money</small>}
        </button>
      ))}
    </div>
  );
}

/** in-page "are you sure?" box */
export function ConfirmBox({ title, children, confirmLabel = 'Yes, change', tone = 'dark', busy, onConfirm, onCancel }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && !busy && onCancel();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [busy, onCancel]);
  return (
    <div className="admin-modal-overlay" onClick={() => !busy && onCancel()}>
      <div className="ost-confirm" role="alertdialog" aria-modal="true" aria-labelledby="ost-confirm-t" onClick={(e) => e.stopPropagation()}>
        <h3 id="ost-confirm-t">{title}</h3>
        <div className="ost-confirm-body">{children}</div>
        <div className="ost-confirm-foot">
          <button type="button" className="ins-btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className={`ins-btn ost-go ${tone}`} onClick={onConfirm} disabled={busy} autoFocus>
            {busy || confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** what the confirm box says for a status change of `n` orders */
export function changeText(status, n) {
  const label = STATUS_LABELS[status] || status;
  const one = n === 1;
  if (status === 'delivered') return `${one ? 'The seller is' : 'Each seller is'} paid out at once (locked amount + profit). This cannot be undone.`;
  if (status === 'cancelled') return `The items go back in stock and the locked amount returns to the seller${one ? '' : 's'}.`;
  if (status === 'delivery_failed') return `${one ? 'It goes' : 'They go'} back to the warehouse this evening by itself and out for delivery again the next morning.`;
  if (status === 'confirmed') return `The seller's money for ${one ? 'this order' : 'these orders'} is locked, and the automatic delivery steps start.`;
  return `${one ? 'It' : 'They'} will be marked “${label}”, and the automatic steps continue from there.`;
}
export const needsConfirm = (status) => Boolean(STATUS_WARNINGS[status]) || MONEY_STATUSES.includes(status);

/**
 * Change many orders, 3 at a time. Returns { done, failed: [{ id, orderNumber, error }] }.
 * A failure (e.g. the seller's wallet cannot cover it) does not stop the others.
 */
export async function runStatusChanges(orders, status, onProgress) {
  const queue = [...orders];
  const failed = [];
  let done = 0;
  const worker = async () => {
    while (queue.length) {
      const o = queue.shift();
      try {
        await api(`/orders/${o._id}/status`, { method: 'POST', body: { status, note: `Status updated to ${status} by Platform Admin (order list)` } });
        done += 1;
      } catch (e) {
        failed.push({ id: o._id, orderNumber: o.orderNumber, error: e.message || 'Failed' });
      }
      onProgress?.(done + failed.length, orders.length);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return { done, failed };
}

/** the bar that appears while orders are ticked */
export function BulkBar({ count, onApply, onClear, busy }) {
  const [to, setTo] = useState('');
  return (
    <div className="ost-bulk" role="region" aria-label="Change many orders">
      <span className="ost-bulk-n"><b>{count}</b> {count === 1 ? 'order' : 'orders'} selected</span>
      <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="New status" disabled={busy}>
        <option value="">Change status to…</option>
        {STATUS_CHOICES.map((st) => (
          <option key={st} value={st}>{STATUS_LABELS[st] || st}</option>
        ))}
      </select>
      <button type="button" className="ost-bulk-go" disabled={!to || busy} onClick={() => onApply(to)}>{busy || 'Apply'}</button>
      <button type="button" className="ost-bulk-x" onClick={onClear} disabled={busy}>Clear</button>
    </div>
  );
}
