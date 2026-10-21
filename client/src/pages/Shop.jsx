import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useContent } from '../content.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { Breadcrumb, TrustStrip } from '../components/Bits.jsx';
import VerifiedStoreBadge from '../components/VerifiedStoreBadge.jsx';
import Ic from '../components/Icons.jsx';

const PAGE_SIZE = 36;

const SORTS = [
  { value: '', label: 'Featured' },
  { value: 'popular', label: 'Best selling' },
  { value: 'rating', label: 'Top rated' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
];

function CardSkeleton() {
  return (
    <div className="pc pc-skel" aria-hidden="true">
      <div className="pc-media"><div className="sk sk-img" /></div>
      <div className="pc-body">
        <div className="sk sk-line" style={{ width: '45%' }} />
        <div className="sk sk-line" />
        <div className="sk sk-line" style={{ width: '70%' }} />
        <div className="sk sk-line" style={{ width: '35%', height: 16 }} />
        <div className="sk sk-btn" />
      </div>
    </div>
  );
}

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const { categories } = useContent();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const chipsRef = useRef(null);
  const [chipEdges, setChipEdges] = useState({ left: false, right: false });

  const category = params.get('category') || '';
  const q = params.get('q') || '';
  const label = params.get('label') || params.get('badge') || '';
  const sort = params.get('sort') || '';
  const seller = params.get('seller') || '';

  useEffect(() => {
    setLoading(true);
    setPage(1);
    const p = new URLSearchParams(params);
    if (!p.has('limit')) p.set('limit', String(PAGE_SIZE));
    p.set('page', '1');

    api('/products?' + p.toString())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setProducts(list);
        setHasMore(list.length >= PAGE_SIZE);
      })
      .catch(() => {
        setProducts([]);
        setHasMore(false);
      })
      .finally(() => setLoading(false));
  }, [params]);

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    const p = new URLSearchParams(params);
    if (!p.has('limit')) p.set('limit', String(PAGE_SIZE));
    p.set('page', String(nextPage));

    try {
      const data = await api('/products?' + p.toString());
      const nextList = Array.isArray(data) ? data : [];
      if (nextList.length === 0) {
        setHasMore(false);
      } else {
        setProducts((prev) => [...prev, ...nextList]);
        setPage(nextPage);
        setHasMore(nextList.length >= PAGE_SIZE);
      }
    } catch (_) {}
    setLoadingMore(false);
  };

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  // category pills: one scrollable row with arrows / fades on the side that can still scroll
  const updateEdges = () => {
    const el = chipsRef.current;
    if (!el) return;
    setChipEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  useEffect(() => {
    updateEdges();
    window.addEventListener('resize', updateEdges);
    return () => window.removeEventListener('resize', updateEdges);
  }, [categories]);
  // keep the selected category pill in view
  useEffect(() => {
    const box = chipsRef.current;
    const el = box?.querySelector('.sf-pill.on');
    if (box && el) {
      // only the pill row scrolls sideways; the page itself never jumps
      const target = el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2;
      box.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    }
    const t = setTimeout(updateEdges, 350);
    return () => clearTimeout(t);
  }, [category, categories]);
  const scrollChips = (dir) => chipsRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });

  const catName = categories.find((c) => c.slug === category)?.name || 'Products';
  const sellerName = products[0]?.sellerName || products[0]?.seller?.storeName;

  const title = seller && sellerName
    ? sellerName
    : q
    ? `Results for “${q}”`
    : label === 'new'
    ? 'New Arrivals'
    : label === 'sale'
    ? 'Deals & Sale'
    : category
    ? catName
    : 'All Products';

  const countText = loading
    ? 'Loading products…'
    : `${products.length}${hasMore ? '+' : ''} product${products.length === 1 ? '' : 's'}`;

  // filters that are on, each removable
  const active = [
    q && { key: 'q', text: `Search: ${q}` },
    label === 'new' && { key: params.get('label') ? 'label' : 'badge', text: 'New arrivals' },
    label === 'sale' && { key: params.get('label') ? 'label' : 'badge', text: 'On sale' },
    label && label !== 'new' && label !== 'sale' && { key: params.get('label') ? 'label' : 'badge', text: label },
    seller && !sellerName && !loading && { key: 'seller', text: 'Selected store' },
  ].filter(Boolean);

  return (
    <div className="sf">
      <div className="sf-head">
        <div className="container">
          <Breadcrumb trail={[{ label: 'Shop', to: '/shop' }, ...(category ? [{ label: catName }] : []), ...(seller && sellerName ? [{ label: sellerName }] : [])]} />

          {seller && sellerName ? (
            <div className="sf-store">
              <span className="sf-store-av">{(sellerName[0] || 'S').toUpperCase()}</span>
              <div className="sf-store-txt">
                <h1 className="sf-title">
                  <span>{title}</span>
                  <VerifiedStoreBadge variant="pill" size={14} text="Verified Store" />
                </h1>
                <p className="sf-sub">Verified marketplace merchant · {countText}</p>
              </div>
              <button type="button" onClick={() => setParam('seller', '')} className="sf-store-all">
                View all stores <Ic name="arrowRight" size={14} />
              </button>
            </div>
          ) : (
            <>
              <h1 className="sf-title"><span>{title}</span></h1>
              <p className="sf-sub">{countText}</p>
            </>
          )}
        </div>
      </div>

      <div className="sf-bar">
        <div className="container sf-bar-in">
          <div className={'sf-pills-wrap' + (chipEdges.left ? ' fade-l' : '') + (chipEdges.right ? ' fade-r' : '')}>
            {chipEdges.left && (
              <button type="button" className="sf-pills-arrow l" onClick={() => scrollChips(-1)} aria-label="Scroll categories left">
                <Ic name="chevLeft" size={16} />
              </button>
            )}
            <div className="sf-pills" ref={chipsRef} onScroll={updateEdges}>
              <button type="button" className={'sf-pill' + (!category ? ' on' : '')} onClick={() => setParam('category', '')}>All</button>
              {categories.map((c) => (
                <button
                  type="button"
                  key={c.slug}
                  className={'sf-pill' + (category === c.slug ? ' on' : '')}
                  onClick={() => setParam('category', c.slug)}
                >
                  {c.name}
                </button>
              ))}
            </div>
            {chipEdges.right && (
              <button type="button" className="sf-pills-arrow r" onClick={() => scrollChips(1)} aria-label="Scroll categories right">
                <Ic name="chevRight" size={16} />
              </button>
            )}
          </div>

          <label className="sf-sort">
            <span>Sort</span>
            <select value={sort} onChange={(e) => setParam('sort', e.target.value)}>
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <Ic name="chevDown" size={14} />
          </label>
        </div>
      </div>

      <div className="container sf-main">
        {active.length > 0 && (
          <div className="sf-active">
            {active.map((f) => (
              <button type="button" key={f.key + f.text} className="sf-active-chip" onClick={() => setParam(f.key, '')}>
                {f.text} <Ic name="x" size={13} />
              </button>
            ))}
            <Link to="/shop" className="sf-active-clear">Clear all</Link>
          </div>
        )}

        {loading ? (
          <div className="sf-grid">
            {Array.from({ length: 10 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : products.length === 0 ? (
          <div className="sf-empty">
            <span className="sf-empty-ic"><Ic name="search" size={26} /></span>
            <h3>No products found{q ? ` for “${q}”` : ''}</h3>
            <p>Try another category or a different search word.</p>
            <Link to="/shop" className="sf-btn-dark">Browse all products</Link>
          </div>
        ) : (
          <>
            <div className="sf-grid">
              {products.map((p) => (
                <ProductCard p={p} key={p._id} />
              ))}
            </div>
            {hasMore && (
              <div className="sf-more">
                <p>Showing {products.length} products</p>
                <button type="button" onClick={handleLoadMore} disabled={loadingMore} className="sf-btn-outline">
                  {loadingMore ? 'Loading…' : 'Load more products'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <TrustStrip />
    </div>
  );
}
