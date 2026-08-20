import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useContent } from '../content.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { Breadcrumb, TrustStrip } from '../components/Bits.jsx';

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const { categories } = useContent();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const category = params.get('category') || '';
  const q = params.get('q') || '';
  const label = params.get('label') || params.get('badge') || '';
  const sort = params.get('sort') || '';
  const seller = params.get('seller') || '';

  useEffect(() => {
    setLoading(true);
    api('/products?' + params.toString())
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [params]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  const catName = categories.find((c) => c.slug === category)?.name || 'Products';
  const sellerName = products[0]?.sellerName || products[0]?.seller?.storeName;

  const title = seller && sellerName
    ? `Storefront: ${sellerName}`
    : q
    ? `Search results for "${q}"`
    : label === 'new'
    ? 'New Arrivals'
    : label === 'sale'
    ? 'Deals & Sale'
    : category
    ? catName
    : 'All Marketplace Products';

  return (
    <>
      <div className="page-head">
        <div className="container">
          <Breadcrumb trail={[{ label: 'Shop', to: '/shop' }, ...(category ? [{ label: catName }] : []), ...(seller && sellerName ? [{ label: sellerName }] : [])]} />
          <h1 className="page-title">{title}</h1>
          {seller && sellerName && (
            <p className="seller-shop-subtitle">
              Verified Marketplace Merchant • Fast Prime Dispatch • Authentic Products Guarantee
            </p>
          )}
        </div>
      </div>

      <div className="container section-sm">
        {seller && (
          <div className="seller-filter-alert">
            <span>Showing products exclusively from <b>{sellerName || 'this seller'}</b></span>
            <button onClick={() => setParam('seller', '')} className="btn-clear-filter">✕ View All Marketplace Sellers</button>
          </div>
        )}

        <div className="shop-chips">
          <button className={'chip' + (!category ? ' chip-on' : '')} onClick={() => setParam('category', '')}>All Categories</button>
          {categories.map((c) => (
            <button
              key={c.slug}
              className={'chip' + (category === c.slug ? ' chip-on' : '')}
              onClick={() => setParam('category', c.slug)}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="shop-toolbar">
          <span>{loading ? 'Loading…' : `Showing ${products.length} product${products.length === 1 ? '' : 's'}`}</span>
          <label>
            Sort by:{' '}
            <select value={sort} onChange={(e) => setParam('sort', e.target.value)}>
              <option value="">Featured / Newest</option>
              <option value="popular">Best Selling</option>
              <option value="rating">Highest Customer Rating</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
            </select>
          </label>
        </div>

        {!loading && products.length === 0 ? (
          <div className="empty-box">
            <p>No products found{q ? ` for "${q}"` : ''}.</p>
            <Link to="/shop" className="btn-primary">VIEW ALL PRODUCTS</Link>
          </div>
        ) : (
          <div className="pgrid pgrid-4">
            {products.map((p) => (
              <ProductCard p={p} key={p._id} />
            ))}
          </div>
        )}
      </div>
      <TrustStrip />
    </>
  );
}
