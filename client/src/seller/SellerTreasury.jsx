import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { sapi, money } from '../api.js';
import Ic from '../components/Icons.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';
import '../styles/seller/treasury.css';

export default function SellerTreasury() {
  const { formatMoney } = useCurrency();
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCat, setSelectedCat] = useState('');
  const [q, setQ] = useState('');
  const [storeFilter, setStoreFilter] = useState('all'); // 'all' | 'not_added' | 'added'
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  const loadTreasury = () => {
    setLoading(true);
    let url = '/sellers/treasury?';
    const params = new URLSearchParams();
    if (selectedCat) params.append('category', selectedCat);
    if (q.trim()) params.append('q', q.trim());
    url += params.toString();

    sapi(url)
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    sapi('/categories')
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadTreasury();
  }, [selectedCat]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadTreasury();
  };

  // 1-Click Add to Store
  const handleAddToStore = async (p, e) => {
    if (e) e.stopPropagation();
    setActionLoadingId(p._id);

    try {
      const res = await sapi(`/sellers/treasury/${p._id}/add`, { method: 'POST' });
      setProducts((prev) =>
        prev.map((item) =>
          item._id === p._id
            ? {
                ...item,
                isAddedToStore: true,
                sellerProductId: res.product?._id,
                totalSellersCarrying: (item.totalSellersCarrying || 0) + (item.isAddedToStore ? 0 : 1),
              }
            : item
        )
      );
      showToast(`🎉 "${p.name}" has been added to your store!`);
    } catch (err) {
      alert('Could not add to store: ' + err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  // 1-Click Remove from Store
  const handleRemoveFromStore = async (p, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Remove "${p.name}" from your store catalog?`)) return;

    setActionLoadingId(p._id);
    try {
      await sapi(`/sellers/treasury/${p._id}/remove`, { method: 'POST' });
      setProducts((prev) =>
        prev.map((item) =>
          item._id === p._id
            ? {
                ...item,
                isAddedToStore: false,
                sellerProductId: null,
                totalSellersCarrying: Math.max(0, (item.totalSellersCarrying || 1) - 1),
              }
            : item
        )
      );
      showToast(`Removed "${p.name}" from your store.`);
    } catch (err) {
      alert('Could not remove product: ' + err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filter products by search and store status, and ALWAYS sort unadded on top & added to bottom
  const filteredProducts = products
    .filter((p) => {
      if (q.trim()) {
        const matchQ =
          p.name?.toLowerCase().includes(q.toLowerCase()) ||
          p.brand?.toLowerCase().includes(q.toLowerCase()) ||
          p.sku?.toLowerCase().includes(q.toLowerCase());
        if (!matchQ) return false;
      }
      if (storeFilter === 'added') return p.isAddedToStore;
      if (storeFilter === 'not_added') return !p.isAddedToStore;
      return true;
    })
    .sort((a, b) => {
      // Unadded products are ALWAYS on top, already added products are pushed to the bottom
      if (a.isAddedToStore !== b.isAddedToStore) {
        return a.isAddedToStore ? 1 : -1;
      }
      return 0;
    });


  const totalInTreasury = products.length;
  const inMyStoreCount = products.filter((p) => p.isAddedToStore).length;

  return (
    <div className="seller-treasury-page">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="treasury-toast-banner">
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage('')}
            className="treasury-toast-close"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="seller-page-header treasury-hero-banner">
        <div className="treasury-hero-left">
          <div className="treasury-hero-badge">
            ✨ MASTER PRODUCT TREASURY
          </div>
          <h2 className="treasury-hero-title">
            Browse & Import Products to Your Store
          </h2>
          <p className="treasury-hero-desc">
            All products are stocked centrally in Bazario warehouse. Click <b>"Add to Store"</b> to instantly list them in your catalog. Central stock automatically syncs across all orders!
          </p>
        </div>

        <div className="treasury-hero-stats">
          <div className="treasury-stat-box">
            <div className="treasury-stat-lbl">Master Catalog</div>
            <div className="treasury-stat-val val-blue">{totalInTreasury} Items</div>
          </div>

          <div className="treasury-stat-box">
            <div className="treasury-stat-lbl">In Your Store</div>
            <div className="treasury-stat-val val-green">{inMyStoreCount} Items</div>
          </div>

          <Link to="/seller/products" className="treasury-my-prods-link">
            My Products →
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="seller-treasury-toolbar">
        <div className="treasury-search-row">
          <form onSubmit={handleSearchSubmit} className="treasury-search-form">
            <div className="treasury-input-wrap">
              <span className="search-icon"><Ic name="search" size={16} /></span>
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search title, brand, or SKU…"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ('')}
                  className="treasury-clear-search-btn"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
            <button type="submit" className="treasury-search-btn">
              <Ic name="search" size={15} />
              <span>Search</span>
            </button>
          </form>

          {/* Store Filter Tabs */}
          <div className="treasury-store-filter-tabs">
            <button
              type="button"
              onClick={() => setStoreFilter('not_added')}
              className={`treasury-store-tab ${storeFilter === 'not_added' ? 'active' : ''}`}
            >
              <span className="tab-label-full">Available to Add</span>
              <span className="tab-label-short">Available</span>
              <span className="tab-count-badge">({products.filter((p) => !p.isAddedToStore).length})</span>
            </button>

            <button
              type="button"
              onClick={() => setStoreFilter('all')}
              className={`treasury-store-tab ${storeFilter === 'all' ? 'active' : ''}`}
            >
              <span className="tab-label-full">All Products</span>
              <span className="tab-label-short">All</span>
              <span className="tab-count-badge">({products.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setStoreFilter('added')}
              className={`treasury-store-tab ${storeFilter === 'added' ? 'active' : ''}`}
            >
              <span className="tab-label-full">In My Store</span>
              <span className="tab-label-short">In Store</span>
              <span className="tab-count-badge">({inMyStoreCount})</span>
            </button>
          </div>
        </div>

        {/* Category Pills Bar */}
        <div className="treasury-category-pills">
          <button
            onClick={() => setSelectedCat('')}
            className={`treasury-cat-pill ${selectedCat === '' ? 'active' : ''}`}
          >
            All Categories
          </button>
          {categories.map((c) => (
            <button
              key={c._id}
              onClick={() => setSelectedCat(c._id)}
              className={`treasury-cat-pill ${selectedCat === c._id ? 'active' : ''}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Master Products Cards Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
          <p style={{ fontSize: '15px', fontWeight: 600 }}>Loading products from Product Treasury…</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 24px', borderRadius: '12px' }}>
          <div style={{ fontSize: '48px', marginBottom: '14px' }}>🔍</div>
          <h3 style={{ margin: '0 0 8px', color: '#0f172a' }}>No products found</h3>
          <p className="muted" style={{ margin: '0 0 16px' }}>
            Try changing the category, search keywords, or filter tab.
          </p>
          <button
            onClick={() => {
              setSelectedCat('');
              setQ('');
              setStoreFilter('all');
            }}
            className="seller-btn-pri"
          >
            Reset All Filters
          </button>
        </div>
      ) : (
        <div className="seller-treasury-grid">
          {filteredProducts.map((p) => {
            const isAdded = p.isAddedToStore;
            const isLoading = actionLoadingId === p._id;
            const stockQty = p.stock || 0;
            const isOutOfStock = stockQty <= 0;
            const margin =
              p.price > 0 && p.costPrice > 0
                ? Math.round(((p.price - p.costPrice) / p.price) * 100)
                : 20;
            const estProfit = Math.max(0, (p.price || 0) - (p.costPrice || 0));

            return (
              <div
                key={p._id}
                className={`seller-treasury-card ${isAdded ? 'is-added' : ''}`}
              >
                {/* Image & Badges Container */}
                <div className="treasury-card-img-box">
                  <img
                    src={p.image || p.images?.[0]?.url || '/img/products/serum.svg'}
                    alt={p.name}
                    loading="lazy"
                  />

                  {/* Stock Pill */}
                  <div className="treasury-stock-pill">
                    📦 {stockQty.toLocaleString()}
                  </div>

                  {/* Top Action Button or In-Store Badge */}
                  <div className="treasury-top-action-wrap">
                    {!isAdded ? (
                      <button
                        type="button"
                        className="treasury-top-add-btn"
                        onClick={(e) => handleAddToStore(p, e)}
                        disabled={isLoading || isOutOfStock}
                        title="Add to Store"
                      >
                        <Ic name="plus" size={13} />
                        <span>{isLoading ? 'Adding…' : 'Add to Store'}</span>
                      </button>
                    ) : (
                      <div className="treasury-in-store-tag">
                        ✓ In Store
                      </div>
                    )}
                  </div>

                  {/* Desktop Hover Overlay */}
                  <div className="treasury-hover-action-overlay">
                    {!isAdded ? (
                      <button
                        type="button"
                        className="btn-hover-add-store"
                        onClick={(e) => handleAddToStore(p, e)}
                        disabled={isLoading || isOutOfStock}
                      >
                        <Ic name="plus" size={17} />
                        {isLoading ? 'Adding…' : 'Add to Store'}
                      </button>
                    ) : (
                      <>
                        <Link
                          to="/seller/products"
                          className="btn-hover-view-store"
                          onClick={(e) => e.stopPropagation()}
                        >
                          ✓ View in Store
                        </Link>
                        <button
                          type="button"
                          className="btn-hover-remove-store"
                          onClick={(e) => handleRemoveFromStore(p, e)}
                          disabled={isLoading}
                        >
                          {isLoading ? 'Removing…' : 'Remove from Store'}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Card Body Details */}
                <div className="treasury-card-body">
                  <div className="treasury-card-meta">
                    <span className="treasury-card-brand">{p.brand || p.category?.name || 'General'}</span>
                    <span className="treasury-sku-text">SKU: {p.sku || 'N/A'}</span>
                  </div>

                  <h3 className="treasury-card-title" title={p.name}>
                    {p.name}
                  </h3>

                  <div className="treasury-card-pricing">
                    <div className="treasury-price-box">
                      <span className="treasury-retail-price">{formatMoney(p.price)}</span>
                      <span className="treasury-cost-price">Cost: {formatMoney(p.costPrice || 0)}</span>
                    </div>
                    <div className="treasury-margin-badge">
                      +{formatMoney(estProfit)} ({margin}%)
                    </div>
                  </div>
                </div>

                {/* Bottom Action Button Bar */}
                <div className="treasury-card-bottom-actions">
                  {!isAdded ? (
                    <button
                      type="button"
                      className="treasury-btn-bottom-add"
                      onClick={(e) => handleAddToStore(p, e)}
                      disabled={isLoading || isOutOfStock}
                    >
                      <Ic name="plus" size={15} />
                      {isLoading ? 'Adding…' : 'Add to Store'}
                    </button>
                  ) : (
                    <div className="treasury-bottom-added-group">
                      <Link
                        to="/seller/products"
                        className="treasury-btn-bottom-view"
                        onClick={(e) => e.stopPropagation()}
                      >
                        ✓ In Store
                      </Link>
                      <button
                        type="button"
                        className="treasury-btn-bottom-remove"
                        onClick={(e) => handleRemoveFromStore(p, e)}
                        disabled={isLoading}
                        title="Remove product from your store"
                      >
                        {isLoading ? '…' : 'Remove'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
