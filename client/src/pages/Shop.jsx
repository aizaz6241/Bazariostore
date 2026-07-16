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
  const title = q
    ? `Search results for "${q}"`
    : label === 'new'
      ? 'New Arrivals'
      : label === 'sale'
        ? 'Offers & Sale'
        : category
          ? catName
          : 'All Products';

  return (
    <>
      <div className="page-head">
        <div className="container">
          <Breadcrumb trail={[{ label: 'Shop', to: '/shop' }, ...(category ? [{ label: catName }] : [])]} />
          <h1 className="page-title">{title}</h1>
        </div>
      </div>

      <div className="container section-sm">
        <div className="shop-chips">
          <button className={'chip' + (!category ? ' chip-on' : '')} onClick={() => setParam('category', '')}>All</button>
          {categories.map((c) => (
            <button
              key={c.slug}
              className={'chip' + (category === c.slug ? ' chip-on' : '')}
              onClick={() => setParam('category', c.slug)}
            >
              {c.name.replace(' Products', '').replace(' (Perfumes)', '')}
            </button>
          ))}
        </div>

        <div className="shop-toolbar">
          <span>{loading ? 'Loading…' : `Showing ${products.length} product${products.length === 1 ? '' : 's'}`}</span>
          <label>
            Sort by:{' '}
            <select value={sort} onChange={(e) => setParam('sort', e.target.value)}>
              <option value="">Newest</option>
              <option value="popular">Best Selling</option>
              <option value="rating">Top Rated</option>
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
