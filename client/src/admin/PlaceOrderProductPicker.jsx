import { useEffect, useMemo, useRef, useState } from 'react';

// Product picker for the admin "Place Order on Behalf of Seller" modal.
// Default view mixes expensive and cheap products (high, low, high, low…)
// so the admin sees every price range at a glance, not one block of prices.

const SORTS = [
  { id: 'mixed', label: 'Mixed' },
  { id: 'low', label: 'Price ↑' },
  { id: 'high', label: 'Price ↓' },
  { id: 'name', label: 'A–Z' },
];

const imgOf = (p) => p?.image || p?.images?.[0]?.url || '';

function mixByPrice(list) {
  const asc = [...list].sort((a, b) => (a.price || 0) - (b.price || 0));
  const out = [];
  let lo = 0;
  let hi = asc.length - 1;
  let takeHigh = true;
  while (lo <= hi) {
    out.push(takeHigh ? asc[hi--] : asc[lo++]);
    takeHigh = !takeHigh;
  }
  return out;
}

export default function PlaceOrderProductPicker({ products = [], value, onChange, money }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('mixed');
  const listRef = useRef(null);

  const prices = products.map((p) => Number(p.price) || 0);
  const minP = prices.length ? Math.min(...prices) : 0;
  const maxP = prices.length ? Math.max(...prices) : 0;

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = term
      ? products.filter((p) => String(p.name || '').toLowerCase().includes(term))
      : products;
    if (sort === 'mixed') return mixByPrice(list);
    list = [...list];
    if (sort === 'low') list.sort((a, b) => (a.price || 0) - (b.price || 0));
    if (sort === 'high') list.sort((a, b) => (b.price || 0) - (a.price || 0));
    if (sort === 'name') list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    return list;
  }, [products, q, sort]);

  // Keep the selected product visible when the list first opens
  useEffect(() => {
    const el = listRef.current?.querySelector('[aria-checked="true"]');
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  const onKey = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const idx = shown.findIndex((p) => p._id === value);
    const next = e.key === 'ArrowDown' ? Math.min(shown.length - 1, idx + 1) : Math.max(0, idx - 1);
    if (shown[next]) {
      onChange(shown[next]._id);
      const el = listRef.current?.querySelector(`[data-id="${shown[next]._id}"]`);
      if (el) { el.focus(); el.scrollIntoView({ block: 'nearest' }); }
    }
  };

  return (
    <div className="pop-wrap">
      <div className="pop-toolbar">
        <div className="pop-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products…"
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
          />
          {q && (
            <button type="button" className="pop-clear" onClick={() => setQ('')} aria-label="Clear search">✕</button>
          )}
        </div>
        <div className="pop-sorts" role="tablist" aria-label="Sort products">
          {SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={sort === s.id}
              className={`pop-sort ${sort === s.id ? 'is-on' : ''}`}
              onClick={() => setSort(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pop-meta">
        <span>{shown.length === products.length ? `${products.length} products` : `${shown.length} of ${products.length} products`}</span>
        {products.length > 0 && <span>Range {money(minP)} – {money(maxP)}</span>}
      </div>

      <div className="pop-list" ref={listRef} role="radiogroup" aria-label="Products" onKeyDown={onKey}>
        {shown.length === 0 ? (
          <div className="pop-empty">No product matches “{q}”.</div>
        ) : (
          shown.map((p) => {
            const on = p._id === value;
            const stock = Number(p.stock) || 0;
            const img = imgOf(p);
            return (
              <button
                key={p._id}
                data-id={p._id}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on || (!value && p === shown[0]) ? 0 : -1}
                className={`pop-row ${on ? 'is-on' : ''} ${stock <= 0 ? 'is-out' : ''}`}
                onClick={() => onChange(p._id)}
                title={p.name}
              >
                <span className="pop-thumb">
                  {img ? <img src={img} alt="" loading="lazy" /> : <span>🛍️</span>}
                </span>
                <span className="pop-info">
                  <span className="pop-name">{p.name || 'Product'}</span>
                  <span className={`pop-stock ${stock > 0 ? (stock <= 5 ? 'low' : 'ok') : 'out'}`}>
                    {stock > 0 ? (stock <= 5 ? `Only ${stock} left` : `${stock} in stock`) : 'Out of stock'}
                  </span>
                </span>
                <span className="pop-price">{money(p.price)}</span>
                <span className="pop-radio" aria-hidden="true">
                  {on && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
