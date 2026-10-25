import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from './insights.jsx';

/**
 * Store filter of the admin Orders page: search by name / owner / email, each store with its
 * initials, Diamond / Basic, and how many orders are pending or late right now. Stores opened
 * recently come first. Keys: ↑ ↓ Enter, Esc closes.
 */
const RECENT_KEY = 'admin.orders.recentStores';
const readRecent = () => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.slice(0, 5) : [];
  } catch {
    return [];
  }
};
const saveRecent = (id) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecent().filter((x) => x !== id)].slice(0, 5)));
  } catch {
    /* storage blocked: nothing remembered */
  }
};

function Counts({ c }) {
  if (!c || (!c.pending && !c.late && !c.isTest)) return null;
  return (
    <span className="opk-counts">
      {c.pending > 0 && <span className="opk-pill warn" title="Pending">{c.pending} pending</span>}
      {c.late > 0 && <span className="opk-pill bad" title="Not delivered after 7 days">{c.late} late</span>}
      {c.isTest && <span className="opk-pill test">Test</span>}
    </span>
  );
}

export default function OrdersStorePicker({ sellers, counts, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const box = useRef(null);
  const input = useRef(null);
  const listRef = useRef(null);
  const byId = useMemo(() => new Map(sellers.map((s) => [String(s._id), s])), [sellers]);
  const chosen = value ? byId.get(String(value)) : null;

  const items = useMemo(() => {
    const t = q.trim().toLowerCase();
    const recent = t ? [] : readRecent().filter((id) => byId.has(id));
    const rest = sellers
      .filter((s) => !recent.includes(String(s._id)))
      .filter((s) => !t || `${s.storeName} ${s.ownerName} ${s.email || ''}`.toLowerCase().includes(t))
      // stores with late / pending orders first, then by name
      .sort((a, b) => {
        const ca = counts?.get(String(a._id));
        const cb = counts?.get(String(b._id));
        return (cb?.late || 0) - (ca?.late || 0) || (cb?.pending || 0) - (ca?.pending || 0) || String(a.storeName).localeCompare(String(b.storeName));
      });
    const list = [];
    if (!t) list.push({ all: true });
    recent.forEach((id) => list.push({ s: byId.get(id), recent: true }));
    rest.forEach((s) => list.push({ s }));
    return list;
  }, [q, sellers, counts, byId, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    setTimeout(() => input.current?.focus(), 0);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  useEffect(() => setHi(0), [q, open]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [hi]);

  const pick = (it) => {
    if (!it) return;
    const id = it.all ? '' : String(it.s._id);
    if (id) saveRecent(id);
    onChange(id);
    setOpen(false);
    setQ('');
  };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(items.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(items[hi]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  const firstPlain = items.findIndex((it) => it.s && !it.recent);
  return (
    <div className="opk" ref={box}>
      <button type="button" className={`opk-btn ${chosen ? 'is-set' : ''}`} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        {chosen ? (
          <>
            <Avatar name={chosen.storeName} size={24} />
            <span className="opk-btn-name">{chosen.storeName}</span>
            {chosen.tier === 'diamond' && <span className="opk-tier dia">💎</span>}
          </>
        ) : (
          <>
            <span className="opk-all-ic" aria-hidden="true">🏪</span>
            <span className="opk-btn-name">All stores <em>({sellers.length})</em></span>
          </>
        )}
        <span className="opk-caret" aria-hidden="true">▾</span>
      </button>
      {chosen && (
        <button type="button" className="opk-clear" onClick={() => onChange('')} aria-label="Show all stores" title="Show all stores">✕</button>
      )}

      {open && (
        <div className="opk-pop" role="dialog" aria-label="Choose a store">
          <div className="opk-search">
            <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search store, owner or email…" aria-label="Search stores" />
          </div>
          <ul className="opk-list" role="listbox" ref={listRef}>
            {items.length === 0 && <li className="opk-empty">No store matches “{q}”.</li>}
            {items.map((it, i) => {
              const head = it.recent && (i === 0 || !items[i - 1].recent) ? 'Recently opened' : !q && i === firstPlain ? 'All stores' : null;
              const s = it.s;
              const c = s ? counts?.get(String(s._id)) : null;
              const selected = it.all ? !value : String(value) === String(s._id);
              return (
                <li key={it.all ? 'all' : `${it.recent ? 'r' : 'a'}-${s._id}`} role="presentation">
                  {head && <div className="opk-head">{head}</div>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    data-i={i}
                    className={`opk-item ${i === hi ? 'hi' : ''} ${selected ? 'sel' : ''}`}
                    onMouseEnter={() => setHi(i)}
                    onClick={() => pick(it)}
                  >
                    {it.all ? (
                      <>
                        <span className="opk-all-ic big" aria-hidden="true">🏪</span>
                        <span className="opk-main"><b>All stores</b><small>{sellers.length} stores</small></span>
                      </>
                    ) : (
                      <>
                        <Avatar name={s.storeName} size={32} />
                        <span className="opk-main">
                          <b>
                            <span className="opk-name">{s.storeName}</span>
                            <span className={`opk-tier ${s.tier === 'diamond' ? 'dia' : ''}`}>{s.tier === 'diamond' ? '💎 Diamond' : 'Basic'}</span>
                          </b>
                          <small>{s.ownerName || s.email || '—'}{s.status && s.status !== 'active' ? ` · ${s.status}` : ''}</small>
                        </span>
                        <Counts c={c} />
                      </>
                    )}
                    {selected && <span className="opk-check" aria-hidden="true">✓</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
