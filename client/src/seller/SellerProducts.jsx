import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOutletContext, Link } from 'react-router-dom';
import { sapi } from '../api.js';
import Ic from '../components/Icons.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';
import useLiveReload from '../useLiveReload.js';

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'hidden', label: 'Hidden' },
  { id: 'low', label: 'Low stock' },
  { id: 'out', label: 'Out of stock' },
];
const SOURCES = [
  { id: 'all', label: 'All sources' },
  { id: 'treasury', label: 'From Treasury' },
  { id: 'custom', label: 'My own products' },
];
const SORTS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'sold', label: 'Best selling' },
  { id: 'stock-low', label: 'Lowest stock' },
  { id: 'price-high', label: 'Price: high to low' },
  { id: 'price-low', label: 'Price: low to high' },
  { id: 'name', label: 'Name A–Z' },
];
const EMPTY_FORM = { name: '', brand: '', category: '', price: '', oldPrice: '', costPrice: '', stock: 20, lowStockThreshold: 5, sku: '', active: true, shortDescription: '', description: '', images: [] };
const usd = (n) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const stockState = (p) => {
  const s = Number(p.stock) || 0;
  if (s <= 0) return 'out';
  if (s <= (p.lowStockThreshold || 5)) return 'low';
  return 'ok';
};

export default function SellerProducts() {
  const { seller, isFrozen } = useOutletContext() || {};
  const isDiamond = seller?.tier === 'diamond';
  const rate = isDiamond ? 35 : 20; // a store's earning on each delivered order
  const { formatMoney } = useCurrency();

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState('all');
  const [sort, setSort] = useState('newest');
  const [toast, setToast] = useState(null);
  const [editor, setEditor] = useState(null); // null | { product?: object }
  const [removing, setRemoving] = useState(null); // product being confirmed for removal
  const [busy, setBusy] = useState(() => new Set());

  const loadProducts = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    return sapi('/sellers/products')
      .then((data) => {
        setProducts(Array.isArray(data) ? data : []);
        setLoadErr('');
      })
      .catch((e) => setLoadErr(e.message || 'Could not load your products'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadProducts();
    sapi('/categories').then((d) => setCategories(Array.isArray(d) ? d : [])).catch(() => {});
  }, [loadProducts]);
  // stock sold through orders, or a Treasury product paused by the platform, shows by itself
  useLiveReload(['products:changed', 'order:new', 'order:update'], () => loadProducts(true), 1500);

  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [qInput]);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const stats = useMemo(() => {
    let active = 0, low = 0, out = 0, sold = 0, units = 0, value = 0, treasury = 0;
    for (const p of products) {
      if (p.active !== false) active++;
      const st = stockState(p);
      if (st === 'low') low++;
      if (st === 'out') out++;
      sold += Number(p.sold) || 0;
      if (!p.treasuryProduct) { units += Number(p.stock) || 0; value += (Number(p.stock) || 0) * (Number(p.price) || 0); }
      if (p.treasuryProduct) treasury++;
    }
    return { total: products.length, active, hidden: products.length - active, low, out, sold, units, value, treasury };
  }, [products]);

  const counts = useMemo(() => ({ all: stats.total, active: stats.active, hidden: stats.hidden, low: stats.low, out: stats.out }), [stats]);

  const list = useMemo(() => {
    let l = products.filter((p) => {
      if (source === 'treasury' && !p.treasuryProduct) return false;
      if (source === 'custom' && p.treasuryProduct) return false;
      if (status === 'active' && p.active === false) return false;
      if (status === 'hidden' && p.active !== false) return false;
      if (status === 'low' && stockState(p) !== 'low') return false;
      if (status === 'out' && stockState(p) !== 'out') return false;
      if (!q) return true;
      return [p.name, p.sku, p.brand, p.category?.name].some((x) => String(x || '').toLowerCase().includes(q));
    });
    const by = {
      newest: (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
      sold: (a, b) => (b.sold || 0) - (a.sold || 0),
      'stock-low': (a, b) => (a.stock || 0) - (b.stock || 0),
      'price-high': (a, b) => (b.price || 0) - (a.price || 0),
      'price-low': (a, b) => (a.price || 0) - (b.price || 0),
      name: (a, b) => String(a.name || '').localeCompare(String(b.name || '')),
    }[sort];
    return by ? [...l].sort(by) : l;
  }, [products, q, status, source, sort]);

  const setBusyFor = (id, on) => setBusy((prev) => {
    const n = new Set(prev);
    if (on) n.add(id);
    else n.delete(id);
    return n;
  });

  const toggleActive = async (p) => {
    if (busy.has(p._id)) return;
    const next = p.active === false;
    if (next && p.pausedByTreasury) {
      setToast({ ok: false, text: 'This Treasury product is paused by the platform and cannot be switched on right now.' });
      return;
    }
    setBusyFor(p._id, true);
    setProducts((prev) => prev.map((x) => (x._id === p._id ? { ...x, active: next } : x)));
    try {
      await sapi(`/sellers/products/${p._id}`, { method: 'PUT', body: { active: next } });
      setToast({ ok: true, text: next ? `“${p.name}” is visible in your store again.` : `“${p.name}” is hidden from customers.` });
    } catch (err) {
      setProducts((prev) => prev.map((x) => (x._id === p._id ? { ...x, active: !next } : x)));
      setToast({ ok: false, text: err.message });
    } finally {
      setBusyFor(p._id, false);
    }
  };

  const confirmRemove = async () => {
    const p = removing;
    if (!p) return;
    setBusyFor(p._id, true);
    try {
      await sapi(`/sellers/products/${p._id}`, { method: 'DELETE' });
      setProducts((prev) => prev.filter((x) => x._id !== p._id));
      setToast({ ok: true, text: `“${p.name}” was removed from your store.` });
      setRemoving(null);
    } catch (err) {
      setToast({ ok: false, text: err.message });
      setRemoving(null);
    } finally {
      setBusyFor(p._id, false);
    }
  };

  const canRemove = (p) => !p.treasuryProduct || isDiamond;
  const resetFilters = () => { setQInput(''); setStatus('all'); setSource('all'); setSort('newest'); };

  return (
    <div className="pp">
      <header className="pp-head">
        <div>
          <p className="pp-eyebrow">Catalog</p>
          <h1>My Store Products</h1>
          <p className="pp-sub">Everything customers can buy from your store. Add more from the Product Treasury or list your own products.</p>
        </div>
        <div className="pp-head-actions">
          <Link to="/seller/treasury" className="pp-btn pp-btn-ghost"><Ic name="sparkle" size={15} /> Browse Treasury</Link>
          <button type="button" className="pp-btn pp-btn-dark" onClick={() => setEditor({})} disabled={isFrozen}><Ic name="plus" size={15} /> Add own product</button>
        </div>
      </header>

      {isFrozen && <div className="pp-banner"><Ic name="lock" size={17} /><span><b>Your store is frozen</b> — product changes are paused until support lifts it.</span><Link to="/seller/support">Contact support →</Link></div>}

      <div className="pp-stats">
        <div className="pp-stat"><span>Products</span><b>{stats.total}</b><small>{stats.treasury} from Treasury · {stats.total - stats.treasury} own</small></div>
        <div className="pp-stat"><span>Live in store</span><b className="t-green">{stats.active}</b><small>{stats.hidden ? `${stats.hidden} hidden` : 'All visible'}</small></div>
        <button type="button" className={`pp-stat ${stats.low + stats.out ? 'attn' : ''}`} onClick={() => setStatus(stats.out ? 'out' : 'low')}>
          <span>Need stock</span><b className={stats.low + stats.out ? 't-amber' : ''}>{stats.low + stats.out}</b><small>{stats.low} low · {stats.out} out of stock</small>
        </button>
        <div className="pp-stat"><span>Units sold</span><b>{stats.sold.toLocaleString()}</b><small>All time</small></div>
        <div className="pp-stat rate"><span>You earn per sale</span><b>{rate}%</b><small>{isDiamond ? '💎 Diamond rate' : <Link to="/seller/diamond">35% with Diamond →</Link>}</small></div>
      </div>

      <div className="pp-toolbar">
        <label className="pp-search">
          <Ic name="search" size={16} />
          <input type="search" value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Search name, SKU, brand or category" aria-label="Search products" />
          {qInput && <button type="button" onClick={() => setQInput('')} aria-label="Clear"><Ic name="x" size={14} /></button>}
        </label>
        <select className="pp-select" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source">{SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <select className="pp-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">{SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
      </div>
      <div className="pp-chips" role="tablist" aria-label="Filter">
        {STATUS_FILTERS.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={status === f.id} className={`${status === f.id ? 'on' : ''} ${(f.id === 'low' || f.id === 'out') && counts[f.id] ? 'warn' : ''}`} onClick={() => setStatus(f.id)}>
            {f.label} <span>{counts[f.id]}</span>
          </button>
        ))}
      </div>

      {loadErr && !loading && <div className="pp-banner err"><Ic name="alert" size={17} /><span>{loadErr}</span><button type="button" className="pp-link" onClick={() => loadProducts()}>Retry</button></div>}

      <section className="pp-card">
        {loading ? (
          <div className="pp-skel-list">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="pp-skel" />)}</div>
        ) : products.length === 0 ? (
          <div className="pp-empty">
            <span className="pp-empty-ico"><Ic name="package" size={22} /></span>
            <b>Your store has no products yet</b>
            <p>Add products from the Product Treasury in one tap, or list your own.</p>
            <div className="pp-empty-actions">
              <Link to="/seller/treasury" className="pp-btn pp-btn-primary"><Ic name="sparkle" size={15} /> Browse Treasury</Link>
              <button type="button" className="pp-btn pp-btn-ghost" onClick={() => setEditor({})}>Add own product</button>
            </div>
          </div>
        ) : list.length === 0 ? (
          <div className="pp-empty">
            <span className="pp-empty-ico"><Ic name="search" size={22} /></span>
            <b>No products match</b>
            <p>Try another search or filter.</p>
            <button type="button" className="pp-btn pp-btn-ghost" onClick={resetFilters}>Reset filters</button>
          </div>
        ) : (
          <>
            <table className="pp-table">
              <thead>
                <tr><th>Product</th><th className="r">Price</th><th className="r">You earn</th><th>Stock</th><th className="r">Sold</th><th>Visible</th><th className="r" aria-label="Actions" /></tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p._id} className={p.active === false ? 'is-hidden' : ''}>
                    <td><ProductCell p={p} /></td>
                    <td className="r"><b>{formatMoney(p.price)}</b>{p.oldPrice > p.price && <s className="pp-old">{formatMoney(p.oldPrice)}</s>}</td>
                    <td className="r"><span className="pp-earn">+{formatMoney(((Number(p.price) || 0) * rate) / 100)}</span></td>
                    <td><StockBadge p={p} /></td>
                    <td className="r tabular">{(p.sold || 0).toLocaleString()}</td>
                    <td><Toggle on={p.active !== false} disabled={busy.has(p._id) || isFrozen} onChange={() => toggleActive(p)} label={p.active !== false ? 'Visible' : 'Hidden'} /></td>
                    <td className="r">
                      <div className="pp-actions">
                        <button type="button" className="pp-btn pp-btn-ghost sm" onClick={() => setEditor({ product: p })} disabled={isFrozen}><Ic name="edit" size={14} /> Edit</button>
                        {canRemove(p) ? (
                          <button type="button" className="pp-icon-btn danger" onClick={() => setRemoving(p)} disabled={isFrozen || busy.has(p._id)} title={p.treasuryProduct ? 'Remove from my store (Diamond)' : 'Delete product'} aria-label="Remove"><Ic name="trash" size={15} /></button>
                        ) : (
                          <Link to="/seller/diamond" className="pp-icon-btn" title="Only Diamond stores can remove Treasury products" aria-label="Diamond only"><Ic name="lock" size={14} /></Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="pp-cards">
              {list.map((p) => (
                <li key={p._id} className={p.active === false ? 'is-hidden' : ''}>
                  <ProductCell p={p} />
                  <div className="pp-c-grid">
                    <div><span>Price</span><b>{formatMoney(p.price)}</b></div>
                    <div><span>You earn</span><b className="t-green">+{formatMoney(((Number(p.price) || 0) * rate) / 100)}</b></div>
                    <div><span>Sold</span><b>{(p.sold || 0).toLocaleString()}</b></div>
                  </div>
                  <div className="pp-c-foot">
                    <StockBadge p={p} />
                    <Toggle on={p.active !== false} disabled={busy.has(p._id) || isFrozen} onChange={() => toggleActive(p)} label={p.active !== false ? 'Visible' : 'Hidden'} />
                  </div>
                  <div className="pp-c-actions">
                    <button type="button" className="pp-btn pp-btn-ghost sm" onClick={() => setEditor({ product: p })} disabled={isFrozen}><Ic name="edit" size={14} /> Edit</button>
                    {canRemove(p) ? (
                      <button type="button" className="pp-btn pp-btn-ghost sm danger" onClick={() => setRemoving(p)} disabled={isFrozen}><Ic name="trash" size={14} /> Remove</button>
                    ) : (
                      <Link to="/seller/diamond" className="pp-btn pp-btn-ghost sm"><Ic name="lock" size={13} /> Diamond to remove</Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <p className="pp-count">Showing {list.length} of {products.length} products</p>
          </>
        )}
      </section>

      {editor && (
        <ProductEditor
          product={editor.product}
          categories={categories}
          rate={rate}
          formatMoney={formatMoney}
          onClose={() => setEditor(null)}
          onSaved={(msg) => { setEditor(null); setToast({ ok: true, text: msg }); loadProducts(true); }}
        />
      )}

      {removing && (
        <Dialog onClose={() => setRemoving(null)}>
          <div className="pp-confirm">
            <span className="pp-confirm-ico"><Ic name="trash" size={22} /></span>
            <h3>Remove “{removing.name}”?</h3>
            <p>{removing.treasuryProduct ? 'It will no longer be listed in your store. You can add it again from the Product Treasury any time.' : 'This deletes your product listing. This cannot be undone.'} Products with orders still running cannot be removed until those orders are finished.</p>
            <div className="pp-dialog-actions">
              <button type="button" className="pp-btn pp-btn-ghost" onClick={() => setRemoving(null)} disabled={busy.has(removing._id)}>Cancel</button>
              <button type="button" className="pp-btn pp-btn-danger" onClick={confirmRemove} disabled={busy.has(removing._id)}>{busy.has(removing._id) ? 'Removing…' : 'Remove'}</button>
            </div>
          </div>
        </Dialog>
      )}

      {toast && (
        <div className={`pp-toast ${toast.ok ? 'ok' : 'err'}`} role="status">
          <Ic name={toast.ok ? 'checkCircle' : 'alert'} size={17} />
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss"><Ic name="x" size={14} /></button>
        </div>
      )}
    </div>
  );
}

function ProductCell({ p }) {
  const img = p.images?.[0]?.url || p.image || '/img/products/serum.svg';
  return (
    <div className="pp-prod">
      <img src={img} alt="" loading="lazy" />
      <div className="pp-prod-txt">
        <b title={p.name}>{p.name}</b>
        <small>{p.category?.name || 'Uncategorized'}{p.sku ? <> · <span className="mono">{p.sku}</span></> : null}</small>
        <div className="pp-tags">
          {p.treasuryProduct ? <span className="pp-tag blue">Treasury</span> : <span className="pp-tag slate">Own product</span>}
          {p.pausedByTreasury && <span className="pp-tag amber">Paused by platform</span>}
        </div>
      </div>
    </div>
  );
}

function StockBadge({ p }) {
  const st = stockState(p);
  const n = Number(p.stock) || 0;
  return (
    <div className="pp-stock">
      <span className={`pp-stock-badge ${st}`}>{st === 'out' ? 'Out of stock' : `${n.toLocaleString()} ${st === 'low' ? 'left' : 'in stock'}`}</span>
      {p.treasuryProduct && <small>Central warehouse</small>}
    </div>
  );
}

function Toggle({ on, disabled, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`pp-toggle ${on ? 'on' : ''}`} onClick={onChange} disabled={disabled}>
      <span className="pp-toggle-track"><i /></span>
      <span className="pp-toggle-lbl">{label}</span>
    </button>
  );
}

function Dialog({ onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="pp-dialog-root" role="dialog" aria-modal="true">
      <button type="button" className="pp-dialog-bg" onClick={onClose} aria-label="Close" tabIndex={-1} />
      <div className={`pp-dialog ${wide ? 'wide' : ''}`}>{children}</div>
    </div>,
    document.body
  );
}

/** Add / edit drawer. Prices are US dollars (the store's wallet currency). */
function ProductEditor({ product, categories, rate, formatMoney, onClose, onSaved }) {
  const isTreasury = Boolean(product?.treasuryProduct);
  const [form, setForm] = useState(() => (product
    ? {
        name: product.name || '', brand: product.brand || '', category: product.category?._id || product.category || '', price: product.price ?? '', oldPrice: product.oldPrice || '',
        costPrice: product.costs?.purchase || '', stock: product.stock ?? 0, lowStockThreshold: product.lowStockThreshold || 5, sku: product.sku || '', active: product.active !== false,
        shortDescription: product.shortDescription || '', description: product.description || '', images: product.images?.length ? product.images : product.image ? [{ url: product.image }] : [],
      }
    : { ...EMPTY_FORM, category: categories[0]?._id || '', sku: `SKU-${Date.now().toString(36).toUpperCase()}` }));
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [shown, setShown] = useState(false);
  const fileRef = useRef(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', onKey);
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { cancelAnimationFrame(id); document.removeEventListener('keydown', onKey); document.body.style.overflow = before; };
  }, [onClose, saving]);

  const price = Number(form.price) || 0;
  const old = Number(form.oldPrice) || 0;
  const discount = old > price && price > 0 ? Math.round(((old - price) / old) * 100) : 0;
  const earn = (price * rate) / 100;

  const upload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    setErr('');
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      const res = await sapi('/uploads', { method: 'POST', body: fd });
      const list = Array.isArray(res) ? res : [res];
      setForm((f) => ({ ...f, images: [...f.images, ...list.filter((x) => x?.url).map((x) => ({ url: x.url, key: x.key }))] }));
    } catch (er) {
      setErr(`Upload failed: ${er.message}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const addUrl = () => {
    const u = urlInput.trim();
    if (!/^https?:\/\//i.test(u)) { setErr('Paste a full image link starting with https://'); return; }
    setForm((f) => ({ ...f, images: [...f.images, { url: u }] }));
    setUrlInput('');
    setErr('');
  };
  const moveCover = (i) => setForm((f) => { const c = [...f.images]; const [x] = c.splice(i, 1); return { ...f, images: [x, ...c] }; });
  const dropImg = (i) => setForm((f) => ({ ...f, images: f.images.filter((_, j) => j !== i) }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setErr('Enter a product name.');
    if (!form.category) return setErr('Choose a category.');
    if (!(price > 0)) return setErr('Enter a selling price above $0.');
    if (old && old <= price) return setErr('The compare-at price must be higher than the selling price (or leave it empty).');
    if (!form.images.length) return setErr('Add at least one photo.');
    setSaving(true);
    setErr('');
    try {
      const payload = {
        name: form.name.trim(), brand: form.brand.trim(), category: form.category, sku: form.sku.trim(), active: form.active,
        shortDescription: form.shortDescription, description: form.description,
        price, oldPrice: old > price ? old : '', costPrice: Number(form.costPrice) || 0,
        lowStockThreshold: Number(form.lowStockThreshold) || 5,
        images: form.images, image: form.images[0]?.url || '',
      };
      // stock is managed by Bazario (warehouse / admin Inventory): never sent from the store
      if (product) await sapi(`/sellers/products/${product._id}`, { method: 'PUT', body: payload });
      else await sapi('/sellers/products', { method: 'POST', body: payload });
      onSaved(product ? `“${payload.name}” was saved.` : `“${payload.name}” is now listed in your store.`);
    } catch (er) {
      setErr(er.message || 'Could not save the product');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="pp-drawer-root" role="dialog" aria-modal="true" aria-label={product ? 'Edit product' : 'Add product'}>
      <button type="button" className={`pp-drawer-bg ${shown ? 'on' : ''}`} onClick={() => !saving && onClose()} aria-label="Close" tabIndex={-1} />
      <form className={`pp-drawer ${shown ? 'on' : ''}`} onSubmit={save}>
        <header className="pp-dr-head">
          <div>
            <p className="pp-eyebrow">{product ? (isTreasury ? 'Treasury product' : 'Your product') : 'New product'}</p>
            <h2>{product ? 'Edit product' : 'Add your own product'}</h2>
          </div>
          <button type="button" className="pp-icon-btn plain" onClick={onClose} aria-label="Close" disabled={saving}><Ic name="x" size={18} /></button>
        </header>

        <div className="pp-dr-body">
          {isTreasury && <div className="pp-note"><Ic name="sparkle" size={15} /><p>This product comes from the Product Treasury. Its stock is the central warehouse stock and updates by itself.</p></div>}

          <section className="pp-sec">
            <h3>Photos</h3>
            <div className="pp-gallery">
              {form.images.map((img, i) => (
                <div key={`${img.url}-${i}`} className={`pp-ph ${i === 0 ? 'cover' : ''}`}>
                  <img src={img.url} alt="" />
                  {i === 0 ? <span className="pp-ph-cover">Cover</span> : <button type="button" className="pp-ph-set" onClick={() => moveCover(i)}>Make cover</button>}
                  <button type="button" className="pp-ph-x" onClick={() => dropImg(i)} aria-label="Remove photo"><Ic name="x" size={12} /></button>
                </div>
              ))}
              <button type="button" className="pp-ph-add" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <Ic name="image" size={20} /><span>{uploading ? 'Uploading…' : 'Upload'}</span>
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={upload} />
            <div className="pp-url">
              <input className="pp-input" type="url" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="…or paste an image link (https://…)" />
              <button type="button" className="pp-btn pp-btn-ghost" onClick={addUrl} disabled={!urlInput.trim()}>Add</button>
            </div>
          </section>

          <section className="pp-sec">
            <h3>Details</h3>
            <label className="pp-field"><span>Product name <em>*</em></span><input className="pp-input" value={form.name} onChange={set('name')} placeholder="What customers will search for" /></label>
            <div className="pp-row">
              <label className="pp-field"><span>Category <em>*</em></span>
                <select className="pp-input" value={form.category} onChange={set('category')}><option value="">Choose…</option>{categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select>
              </label>
              <label className="pp-field"><span>Brand</span><input className="pp-input" value={form.brand} onChange={set('brand')} placeholder="Optional" /></label>
            </div>
            <label className="pp-field"><span>Short highlight</span><input className="pp-input" value={form.shortDescription} onChange={set('shortDescription')} placeholder="One line shown under the name" maxLength={160} /></label>
            <label className="pp-field"><span>Description</span><textarea className="pp-input" rows={5} value={form.description} onChange={set('description')} placeholder="Features, what is in the box, sizes, care…" /></label>
          </section>

          <section className="pp-sec">
            <h3>Price <small>in US dollars</small></h3>
            <div className="pp-row">
              <label className="pp-field"><span>Selling price <em>*</em></span><div className="pp-money"><em>$</em><input type="number" step="0.01" min="0" value={form.price} onChange={set('price')} placeholder="0.00" /></div></label>
              <label className="pp-field"><span>Compare-at price {discount > 0 && <b className="pp-off">−{discount}%</b>}</span><div className="pp-money"><em>$</em><input type="number" step="0.01" min="0" value={form.oldPrice} onChange={set('oldPrice')} placeholder="Optional" /></div></label>
            </div>
            <div className="pp-earnbox">
              <div><span>Customer pays</span><b>{usd(price)}</b><small>{formatMoney(price)}</small></div>
              <div><span>You earn per sale ({rate}%)</span><b className="t-green">+{usd(earn)}</b><small>paid with the order amount on delivery</small></div>
            </div>
            {!isTreasury && (
              <label className="pp-field"><span>Your cost per unit <small>(private, optional — for your own records)</small></span><div className="pp-money"><em>$</em><input type="number" step="0.01" min="0" value={form.costPrice} onChange={set('costPrice')} placeholder="0.00" /></div></label>
            )}
          </section>

          <section className="pp-sec">
            <h3>Stock</h3>
            <div className="pp-row">
              <label className="pp-field"><span>{isTreasury ? 'Warehouse stock' : 'Units in stock'}</span><input className="pp-input" type="number" value={product ? form.stock : ''} placeholder={product ? '' : 'Set by Bazario'} disabled readOnly /><small className="pp-hint">Stock is managed by the Bazario warehouse team.</small></label>
              <label className="pp-field"><span>Low-stock alert at</span><input className="pp-input" type="number" min="1" value={form.lowStockThreshold} onChange={set('lowStockThreshold')} /></label>
            </div>
            <div className="pp-row">
              <label className="pp-field"><span>SKU</span><input className="pp-input mono" value={form.sku} onChange={set('sku')} placeholder="Your product code" /></label>
              <label className="pp-field pp-visible"><span>Visible in store</span>
                <span className="pp-switch-row"><input type="checkbox" checked={form.active} onChange={set('active')} disabled={product?.pausedByTreasury} /> {form.active ? 'Customers can see and buy it' : 'Hidden from customers'}</span>
              </label>
            </div>
          </section>
        </div>

        <footer className="pp-dr-foot">
          {err && <div className="pp-err"><Ic name="alert" size={15} /><span>{err}</span></div>}
          <div className="pp-dr-btns">
            <button type="button" className="pp-btn pp-btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="pp-btn pp-btn-primary" disabled={saving || uploading}>{saving ? 'Saving…' : product ? 'Save changes' : 'Publish product'}</button>
          </div>
        </footer>
      </form>
    </div>,
    document.body
  );
}
