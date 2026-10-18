import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { sapi } from '../api.js';
import Ic from '../components/Icons.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';
import useLiveReload from '../useLiveReload.js';

const SORTS = [
  { id: 'mixed', label: 'Recommended' },
  { id: 'newest', label: 'Newest first' },
  { id: 'price-low', label: 'Price: low to high' },
  { id: 'price-high', label: 'Price: high to low' },
  { id: 'stock', label: 'Most stock' },
  { id: 'popular', label: 'Most stores selling' },
];
const VIEWS = [
  { id: 'all', label: 'All' },
  { id: 'not_added', label: 'Not in my store' },
  { id: 'added', label: 'In my store' },
];
const PAGE = 48;

export default function SellerTreasury() {
  const { formatMoney } = useCurrency();
  const { seller, isFrozen } = useOutletContext() || {};
  const isDiamond = seller?.tier === 'diamond';
  const rate = isDiamond ? 35 : 20; // what a store earns on each order (see server/src/utils/sellerTier.js)

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [cat, setCat] = useState('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('mixed');
  const [view, setView] = useState('all');
  const [visible, setVisible] = useState(PAGE);
  const [busy, setBusy] = useState(() => new Set());
  const [toast, setToast] = useState(null); // { ok, text }
  const inFlight = useRef(new Set());
  const sentinel = useRef(null);

  // the whole catalog comes once; search, category, sort and view are applied here instantly
  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    return sapi('/sellers/treasury?sort=mixed')
      .then((data) => {
        setProducts(Array.isArray(data) ? data : []);
        setLoadErr('');
      })
      .catch((e) => setLoadErr(e.message || 'Could not load the Product Treasury'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    sapi('/categories').then((d) => setCategories(Array.isArray(d) ? d : [])).catch(() => {});
  }, [load]);
  // central stock changed / a product paused: refresh quietly
  useLiveReload(['products:changed'], () => load(true), 1500);

  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [qInput]);
  useEffect(() => setVisible(PAGE), [cat, q, sort, view]);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const catId = (p) => String(p.category?._id || p.category || '');

  // products matching the search + view (before the category), for the category counts
  const base = useMemo(() => products.filter((p) => {
    if (view === 'added' && !p.isAddedToStore) return false;
    if (view === 'not_added' && p.isAddedToStore) return false;
    if (!q) return true;
    return [p.name, p.brand, p.sku, p.category?.name].some((x) => String(x || '').toLowerCase().includes(q));
  }), [products, q, view]);

  const catCounts = useMemo(() => {
    const m = new Map();
    for (const p of base) m.set(catId(p), (m.get(catId(p)) || 0) + 1);
    return m;
  }, [base]);

  const list = useMemo(() => {
    let l = cat ? base.filter((p) => catId(p) === cat) : base;
    const by = {
      'price-low': (a, b) => (a.price || 0) - (b.price || 0),
      'price-high': (a, b) => (b.price || 0) - (a.price || 0),
      stock: (a, b) => (b.stock || 0) - (a.stock || 0),
      newest: (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
      popular: (a, b) => (b.totalSellersCarrying || 0) - (a.totalSellersCarrying || 0),
    }[sort];
    if (by) l = [...l].sort(by);
    return l;
  }, [base, cat, sort]);

  const shown = list.slice(0, visible);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisible((v) => (v < list.length ? v + PAGE : v));
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [list.length, shown.length]);

  const stats = useMemo(() => {
    const added = products.filter((p) => p.isAddedToStore).length;
    const inStock = products.filter((p) => (p.stock || 0) > 0).length;
    return { total: products.length, added, available: products.length - added, inStock };
  }, [products]);

  const setBusyFor = (id, on) => setBusy((prev) => {
    const n = new Set(prev);
    if (on) n.add(id);
    else n.delete(id);
    return n;
  });

  const addToStore = async (p) => {
    if (inFlight.current.has(p._id)) return;
    inFlight.current.add(p._id);
    setBusyFor(p._id, true);
    try {
      const res = await sapi(`/sellers/treasury/${p._id}/add`, { method: 'POST' });
      setProducts((prev) => prev.map((it) => (it._id === p._id ? { ...it, isAddedToStore: true, sellerProductId: res.product?._id, totalSellersCarrying: (it.totalSellersCarrying || 0) + (it.isAddedToStore || res.alreadyExisted ? 0 : 1) } : it)));
      setToast({ ok: true, text: `“${p.name}” is now in your store.` });
    } catch (err) {
      setToast({ ok: false, text: `Could not add “${p.name}”: ${err.message}` });
    } finally {
      inFlight.current.delete(p._id);
      setBusyFor(p._id, false);
    }
  };

  const removeFromStore = async (p) => {
    if (inFlight.current.has(p._id)) return;
    inFlight.current.add(p._id);
    setBusyFor(p._id, true);
    try {
      const res = await sapi(`/sellers/treasury/${p._id}/remove`, { method: 'POST' });
      setProducts((prev) => prev.map((it) => (it._id === p._id ? { ...it, isAddedToStore: false, sellerProductId: null, totalSellersCarrying: Math.max(0, (it.totalSellersCarrying || 1) - 1) } : it)));
      setToast({ ok: true, text: res?.message || `“${p.name}” was removed from your store.` });
    } catch (err) {
      setToast({ ok: false, text: err.message });
    } finally {
      inFlight.current.delete(p._id);
      setBusyFor(p._id, false);
    }
  };

  const resetFilters = () => {
    setCat('');
    setQInput('');
    setView('all');
    setSort('mixed');
  };
  const pctAdded = stats.total ? Math.round((stats.added / stats.total) * 100) : 0;
  const catsWithItems = categories.filter((c) => catCounts.get(String(c._id)));

  return (
    <div className="tr">
      <header className="tr-head">
        <div>
          <p className="tr-eyebrow">Catalog</p>
          <h1>Product Treasury</h1>
          <p className="tr-sub">Products stocked in the Bazario warehouse. Add one to list it in your store — stock, packing and delivery are handled for you.</p>
        </div>
        <Link to="/seller/products" className="tr-btn tr-btn-ghost"><Ic name="tag" size={15} /> My store products</Link>
      </header>

      {isFrozen && (
        <div className="tr-banner"><Ic name="lock" size={17} /><span><b>Your store is frozen</b> — adding products is paused until support lifts it.</span><Link to="/seller/support">Contact support →</Link></div>
      )}

      <div className="tr-stats">
        <div className="tr-stat">
          <span>In the Treasury</span>
          <b>{stats.total.toLocaleString()}</b>
          <small>{stats.inStock.toLocaleString()} in stock now</small>
        </div>
        <div className="tr-stat">
          <span>In your store</span>
          <b>{stats.added.toLocaleString()}</b>
          <div className="tr-meter"><i style={{ width: `${Math.max(pctAdded ? 3 : 0, pctAdded)}%` }} /></div>
          <small>{pctAdded}% of the catalog</small>
        </div>
        <div className="tr-stat">
          <span>Ready to add</span>
          <b>{stats.available.toLocaleString()}</b>
          <small><button type="button" className="tr-link" onClick={() => setView('not_added')}>Show them →</button></small>
        </div>
        <div className={`tr-stat ${isDiamond ? 'is-diamond' : 'is-rate'}`}>
          <span>You earn per order</span>
          <b>{rate}%</b>
          <small>{isDiamond ? '💎 Diamond rate' : <Link to="/seller/diamond" className="tr-link">35% with Diamond →</Link>}</small>
        </div>
      </div>

      <div className="tr-toolbar">
        <label className="tr-search">
          <Ic name="search" size={16} />
          <input type="search" value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Search name, brand or SKU" aria-label="Search the Treasury" />
          {qInput && <button type="button" onClick={() => setQInput('')} aria-label="Clear search"><Ic name="x" size={14} /></button>}
        </label>
        <div className="tr-seg" role="tablist" aria-label="Show">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" role="tab" aria-selected={view === v.id} className={view === v.id ? 'on' : ''} onClick={() => setView(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
        <label className="tr-sort">
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      </div>

      {catsWithItems.length > 0 && (
        <div className="tr-cats" role="tablist" aria-label="Categories">
          <button type="button" className={cat === '' ? 'on' : ''} onClick={() => setCat('')}>All <span>{base.length}</span></button>
          {catsWithItems.map((c) => (
            <button key={c._id} type="button" className={cat === String(c._id) ? 'on' : ''} onClick={() => setCat(String(c._id))}>
              {c.name} <span>{catCounts.get(String(c._id))}</span>
            </button>
          ))}
        </div>
      )}

      {loadErr && !loading && (
        <div className="tr-banner err"><Ic name="alert" size={17} /><span>{loadErr}</span><button type="button" className="tr-link" onClick={() => load()}>Retry</button></div>
      )}

      {loading ? (
        <div className="tr-grid">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="tr-skel" />)}</div>
      ) : list.length === 0 ? (
        <div className="tr-empty">
          <span className="tr-empty-ico"><Ic name="search" size={22} /></span>
          <b>No products match</b>
          <p>Try another search, category or view.</p>
          <button type="button" className="tr-btn tr-btn-dark" onClick={resetFilters}>Reset filters</button>
        </div>
      ) : (
        <>
          <p className="tr-count">Showing <b>{shown.length.toLocaleString()}</b> of <b>{list.length.toLocaleString()}</b> products</p>
          <div className="tr-grid">
            {shown.map((p) => (
              <ProductCard
                key={p._id}
                p={p}
                rate={rate}
                isDiamond={isDiamond}
                frozen={isFrozen}
                busy={busy.has(p._id)}
                formatMoney={formatMoney}
                onAdd={() => addToStore(p)}
                onRemove={() => removeFromStore(p)}
              />
            ))}
          </div>
          <div ref={sentinel} className="tr-sentinel" />
          {visible < list.length ? (
            <div className="tr-more">
              <button type="button" className="tr-btn tr-btn-ghost" onClick={() => setVisible((v) => v + PAGE)}>Load more</button>
            </div>
          ) : (
            <p className="tr-count center">That’s everything — {list.length.toLocaleString()} products.</p>
          )}
        </>
      )}

      {toast && (
        <div className={`tr-toast ${toast.ok ? 'ok' : 'err'}`} role="status">
          <Ic name={toast.ok ? 'checkCircle' : 'alert'} size={17} />
          <span>{toast.text}</span>
          {toast.ok && <Link to="/seller/products" onClick={() => setToast(null)}>View</Link>}
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss"><Ic name="x" size={14} /></button>
        </div>
      )}
    </div>
  );
}

function ProductCard({ p, rate, isDiamond, frozen, busy, formatMoney, onAdd, onRemove }) {
  const stock = Math.max(0, Number(p.stock) || 0);
  const low = stock > 0 && stock <= (p.lowStockThreshold || 10);
  const out = stock <= 0;
  const earn = ((Number(p.price) || 0) * rate) / 100;
  const img = p.image || p.images?.[0]?.url || '/img/products/serum.svg';
  const off = p.oldPrice && p.oldPrice > p.price ? Math.round(((p.oldPrice - p.price) / p.oldPrice) * 100) : 0;
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <article className={`tr-card ${p.isAddedToStore ? 'is-added' : ''} ${out ? 'is-out' : ''}`}>
      <div className="tr-media">
        <img src={img} alt="" loading="lazy" />
        {p.isAddedToStore && <span className="tr-added"><Ic name="check" size={12} /> In your store</span>}
        {off > 0 && <span className="tr-off">−{off}%</span>}
        <span className={`tr-stock ${out ? 'out' : low ? 'low' : ''}`}>{out ? 'Out of stock' : low ? `Only ${stock} left` : `${stock.toLocaleString()} in stock`}</span>
      </div>
      <div className="tr-body">
        <span className="tr-meta">{p.category?.name || p.brand || 'General'}{p.brand && p.category?.name ? ` · ${p.brand}` : ''}</span>
        <h3 title={p.name}>{p.name}</h3>
        <div className="tr-price">
          <b>{formatMoney(p.price)}</b>
          {off > 0 && <s>{formatMoney(p.oldPrice)}</s>}
        </div>
        <div className="tr-earn">
          <span>You earn</span>
          <b>+{formatMoney(earn)} <small>({rate}%)</small></b>
        </div>
        <div className="tr-foot-meta">
          <span title="Stores already selling this product"><Ic name="users" size={12} /> {p.totalSellersCarrying || 0} store{(p.totalSellersCarrying || 0) === 1 ? '' : 's'}</span>
          {p.sku && <span className="mono" title="SKU">{p.sku}</span>}
        </div>
      </div>
      <div className="tr-actions">
        {!p.isAddedToStore ? (
          <button type="button" className="tr-btn tr-btn-primary full" onClick={onAdd} disabled={busy || out || frozen} title={out ? 'Out of stock in the warehouse' : frozen ? 'Paused while your store is frozen' : ''}>
            {busy ? 'Adding…' : out ? 'Out of stock' : <><Ic name="plus" size={15} /> Add to store</>}
          </button>
        ) : confirmRemove ? (
          <div className="tr-confirm">
            <span>Remove?</span>
            <button type="button" className="tr-btn tr-btn-ghost sm" onClick={() => setConfirmRemove(false)} disabled={busy}>No</button>
            <button type="button" className="tr-btn tr-btn-danger sm" onClick={async () => { await onRemove(); setConfirmRemove(false); }} disabled={busy}>{busy ? '…' : 'Remove'}</button>
          </div>
        ) : (
          <div className="tr-added-actions">
            <Link to="/seller/products" className="tr-btn tr-btn-ghost full"><Ic name="checkCircle" size={15} /> In your store</Link>
            {isDiamond && !frozen && (
              <button type="button" className="tr-icon-btn" onClick={() => setConfirmRemove(true)} title="Remove from my store (Diamond)" aria-label="Remove from my store"><Ic name="trash" size={15} /></button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
