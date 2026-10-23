import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import Ic from '../../components/Icons.jsx';
import { SEARCH_EVENT, HUB_REFRESH_EVENT, STATUS_LABELS, adminCan, ago, chatPath, initialsOf, orderPath, peekSeller, recentStores, usd } from './hubBus.js';

/**
 * Ctrl + K (or ⌘ K, or the 🔍 button): one box to reach anything — a store (by name, owner, email
 * or phone), an order (182 / ORD-182 / customer), a support chat, a payment by its UTR, or a page.
 * Empty box: pinned stores, recently opened stores and the main pages.
 */
export default function CommandPalette({ pages = [] }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [pins, setPins] = useState([]);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const seq = useRef(0);

  // open: Ctrl / ⌘ + K anywhere, or the search button (event)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && String(e.key).toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(SEARCH_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(SEARCH_EVENT, onOpen);
    };
  }, []);

  // pinned stores, when the box opens (and after a pin changed)
  useEffect(() => {
    if (!open || !adminCan('sellers')) return undefined;
    const loadPins = () =>
      api('/admin-hub/pins')
        .then((d) => setPins(Array.isArray(d) ? d : []))
        .catch(() => {});
    loadPins();
    window.addEventListener(HUB_REFRESH_EVENT, loadPins);
    return () => window.removeEventListener(HUB_REFRESH_EVENT, loadPins);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQ('');
      setRes(null);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // search as you type
  useEffect(() => {
    const t = q.trim();
    if (!open || t.length < 2) {
      setRes(null);
      setLoading(false);
      return undefined;
    }
    const my = ++seq.current;
    setLoading(true);
    const timer = setTimeout(() => {
      api(`/admin-hub/search?q=${encodeURIComponent(t)}`)
        .then((d) => my === seq.current && setRes(d))
        .catch(() => my === seq.current && setRes({ sellers: [], orders: [], chats: [], payments: [] }))
        .finally(() => my === seq.current && setLoading(false));
    }, 220);
    return () => clearTimeout(timer);
  }, [q, open]);

  const close = () => setOpen(false);
  const go = (path) => {
    close();
    navigate(path);
  };
  const peek = (id, name) => {
    close();
    peekSeller(id, name);
  };

  // everything shown, as one list (arrow keys move through it)
  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    const pageItems = pages
      .filter((p) => !t || p.label.toLowerCase().includes(t))
      .slice(0, t ? 4 : 8)
      .map((p) => ({ key: `p:${p.to}`, icon: p.icon, title: p.label, sub: 'Page', run: () => go(p.to) }));
    if (t.length < 2) {
      const out = [];
      if (pins.length) out.push({ title: '⭐ Pinned stores', items: pins.map((s) => ({ key: `pin:${s.id}`, av: s.storeName, title: s.storeName, sub: `${s.ownerName || ''}${s.tier === 'Diamond' ? ' · 💎 Diamond' : ''}`, run: () => peek(s.id, s.storeName) })) });
      const recent = recentStores().filter((r) => !pins.some((p) => p.id === r.id));
      if (recent.length && adminCan('sellers')) out.push({ title: 'Recently opened', items: recent.map((s) => ({ key: `rec:${s.id}`, av: s.storeName, title: s.storeName, sub: s.ownerName || '', run: () => peek(s.id, s.storeName) })) });
      if (pageItems.length) out.push({ title: 'Go to', items: pageItems });
      return out;
    }
    const r = res || {};
    const out = [];
    if (r.sellers?.length)
      out.push({
        title: 'Stores',
        items: r.sellers.map((s) => ({
          key: `s:${s.id}`,
          av: s.storeName,
          title: s.storeName,
          sub: [s.ownerName, s.email, s.tier === 'Diamond' ? '💎 Diamond' : '', s.status !== 'active' ? s.status : '', s.test ? 'test' : ''].filter(Boolean).join(' · '),
          right: usd(s.balance),
          run: () => peek(s.id, s.storeName),
        })),
      });
    if (r.orders?.length)
      out.push({
        title: 'Orders',
        items: r.orders.map((o) => ({
          key: `o:${o.id}`,
          icon: 'box',
          title: `#${o.orderNumber}`,
          sub: [o.storeName, o.customer, STATUS_LABELS[o.status] || o.status].filter(Boolean).join(' · '),
          right: usd(o.total),
          run: () => go(orderPath(o.id)),
        })),
      });
    if (r.chats?.length)
      out.push({
        title: 'Support chats',
        items: r.chats.map((c) => ({ key: `c:${c.id}`, icon: 'chat', title: c.name, sub: c.lastMessage || (c.guest ? 'Guest' : 'Store chat'), right: c.at ? ago(c.at) : '', run: () => go(chatPath(c.id)) })),
      });
    if (r.payments?.length)
      out.push({
        title: 'Payments (UTR / reference)',
        items: r.payments.map((p) => ({
          key: `w:${p.id}`,
          icon: 'banknote',
          title: `${p.kind === 'deposit' ? '↓ Deposit' : '↑ Withdrawal'} ${usd(p.amount)} · ${p.storeName}`,
          sub: `${p.ref} · ${p.status}`,
          right: p.at ? ago(p.at) : '',
          run: () => go(`/admin/withdrawals?q=${encodeURIComponent(p.ref)}`),
        })),
      });
    if (pageItems.length) out.push({ title: 'Pages', items: pageItems });
    return out;
  }, [q, res, pins, pages]); // eslint-disable-line react-hooks/exhaustive-deps

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  useEffect(() => setActive(0), [q, res]);
  useEffect(() => {
    listRef.current?.querySelector('[data-active="1"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(flat.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      flat[active]?.run();
    }
  };

  let n = -1;
  const t = q.trim();
  return (
    <div className="hub-cmd-overlay" onMouseDown={close}>
      <div className="hub-cmd" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Search">
        <div className="hub-cmd-input">
          <Ic name="search" size={18} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search a store, order (182), chat, UTR or page…"
            aria-label="Search"
          />
          {loading && <span className="hub-spin" />}
          <kbd onClick={close}>Esc</kbd>
        </div>
        <div className="hub-cmd-list" ref={listRef}>
          {t.length >= 2 && !loading && res && !flat.length && <div className="hub-cmd-empty">Nothing found for “{t}”.</div>}
          {t.length === 1 && <div className="hub-cmd-empty">Type one more letter…</div>}
          {groups.map((g) => (
            <div key={g.title} className="hub-cmd-group">
              <div className="hub-cmd-gtitle">{g.title}</div>
              {g.items.map((it) => {
                n += 1;
                const idx = n;
                return (
                  <button
                    key={it.key}
                    type="button"
                    data-active={idx === active ? '1' : '0'}
                    className={`hub-cmd-item ${idx === active ? 'on' : ''}`}
                    onMouseMove={() => idx !== active && setActive(idx)}
                    onClick={it.run}
                  >
                    {it.av ? <span className="hub-cmd-av">{initialsOf(it.av)}</span> : <span className="hub-cmd-ico"><Ic name={it.icon || 'chevRight'} size={16} /></span>}
                    <span className="hub-cmd-txt">
                      <b>{it.title}</b>
                      {it.sub && <small>{it.sub}</small>}
                    </span>
                    {it.right && <em>{it.right}</em>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="hub-cmd-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span><kbd>Enter</kbd> open</span>
          <span><kbd>Ctrl</kbd><kbd>K</kbd> open / close</span>
        </div>
      </div>
    </div>
  );
}
