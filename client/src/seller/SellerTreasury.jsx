import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { sapi, money } from '../api.js';
import Ic from '../components/Icons.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';

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
        <div
          style={{
            position: 'fixed',
            bottom: '30px',
            right: '30px',
            background: '#0f172a',
            color: '#fff',
            padding: '14px 22px',
            borderRadius: '10px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13.5px',
            fontWeight: 600,
            borderLeft: '4px solid #10b981',
          }}
        >
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage('')}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '16px' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="seller-page-header" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', color: '#fff', padding: '24px 28px', borderRadius: '16px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.08)' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', padding: '3px 10px', borderRadius: '20px', fontSize: '11.5px', fontWeight: 700, marginBottom: '8px', border: '1px solid rgba(96, 165, 250, 0.3)' }}>
            ✨ MASTER PRODUCT TREASURY
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 900, margin: '0 0 6px', color: '#f8fafc', letterSpacing: '-0.5px' }}>
            Browse & Import Products to Your Store
          </h2>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '13.5px', maxWidth: '640px', lineHeight: 1.45 }}>
            All products are stocked centrally in Bazario warehouse. Click <b>"Add to Store"</b> to instantly list them in your catalog. Central stock automatically syncs across all orders!
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ background: 'rgba(255, 255, 255, 0.08)', padding: '10px 16px', borderRadius: '10px', textAlign: 'center', border: '1px solid rgba(255, 255, 255, 0.12)' }}>
            <div style={{ fontSize: '10.5px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
              Master Catalog
            </div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#38bdf8' }}>{totalInTreasury} Items</div>
          </div>

          <div style={{ background: 'rgba(255, 255, 255, 0.08)', padding: '10px 16px', borderRadius: '10px', textAlign: 'center', border: '1px solid rgba(255, 255, 255, 0.12)' }}>
            <div style={{ fontSize: '10.5px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
              In Your Store
            </div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#4ade80' }}>{inMyStoreCount} Items</div>
          </div>

          <Link
            to="/seller/products"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 16px',
              background: '#ffffff',
              color: '#0f172a',
              borderRadius: '8px',
              fontWeight: 700,
              textDecoration: 'none',
              fontSize: '13px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            }}
          >
            My Products →
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="seller-treasury-toolbar">
        <div className="treasury-search-row">
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '10px', flex: '1 1 300px' }}>
            <div className="treasury-input-wrap">
              <span className="search-icon"><Ic name="search" size={17} /></span>
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by title, brand, or SKU..."
              />
            </div>
            <button type="submit" className="seller-btn-pri" style={{ padding: '0 18px', height: '42px' }}>
              Search
            </button>
          </form>

          {/* Store Filter Tabs */}
          <div style={{ display: 'flex', gap: '6px', background: '#f1f5f9', padding: '4px', borderRadius: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setStoreFilter('not_added')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: storeFilter === 'not_added' ? '#fff' : 'transparent',
                color: storeFilter === 'not_added' ? '#0f172a' : '#64748b',
                fontWeight: storeFilter === 'not_added' ? 700 : 500,
                fontSize: '12.5px',
                cursor: 'pointer',
                boxShadow: storeFilter === 'not_added' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              Available to Add ({products.filter((p) => !p.isAddedToStore).length})
            </button>

            <button
              onClick={() => setStoreFilter('all')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: storeFilter === 'all' ? '#fff' : 'transparent',
                color: storeFilter === 'all' ? '#0f172a' : '#64748b',
                fontWeight: storeFilter === 'all' ? 700 : 500,
                fontSize: '12.5px',
                cursor: 'pointer',
                boxShadow: storeFilter === 'all' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              All Products ({products.length})
            </button>

            <button
              onClick={() => setStoreFilter('added')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: storeFilter === 'added' ? '#fff' : 'transparent',
                color: storeFilter === 'added' ? '#0f172a' : '#64748b',
                fontWeight: storeFilter === 'added' ? 700 : 500,
                fontSize: '12.5px',
                cursor: 'pointer',
                boxShadow: storeFilter === 'added' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              In My Store ({inMyStoreCount})
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
                    📦 {stockQty.toLocaleString()} in Warehouse
                  </div>

                  {/* In Store Tag */}
                  {isAdded && (
                    <div className="treasury-in-store-tag">
                      ✓ Added to Store
                    </div>
                  )}

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
                  {isAdded && (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: '#ecfdf5',
                        color: '#047857',
                        border: '1px solid #a7f3d0',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 800,
                        marginBottom: '6px',
                        alignSelf: 'flex-start',
                        boxShadow: '0 1px 2px rgba(16, 185, 129, 0.1)',
                      }}
                    >
                      ✓ Already in Store
                    </div>
                  )}

                  <div className="treasury-card-meta">
                    <span className="treasury-card-brand">{p.brand || p.category?.name || 'General'}</span>
                    <span style={{ fontFamily: 'monospace' }}>SKU: {p.sku || 'N/A'}</span>
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

                {/* Mobile Direct Add / Remove Button (Visible on Touch/Mobile Screens) */}
                <div className="treasury-mobile-add-btn">
                  {!isAdded ? (
                    <button
                      type="button"
                      onClick={(e) => handleAddToStore(p, e)}
                      disabled={isLoading || isOutOfStock}
                      style={{
                        width: '100%',
                        padding: '10px',
                        background: isOutOfStock ? '#94a3b8' : '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 700,
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <Ic name="plus" size={16} />
                      {isLoading ? 'Adding…' : 'Add to Store'}
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
                      <Link
                        to="/seller/products"
                        style={{
                          flex: 1,
                          padding: '5px 3px',
                          background: '#ecfdf5',
                          color: '#065f46',
                          border: '1px solid #a7f3d0',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 800,
                          textAlign: 'center',
                          textDecoration: 'none',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        ✓ In Store
                      </Link>
                      <button
                        type="button"
                        onClick={(e) => handleRemoveFromStore(p, e)}
                        disabled={isLoading}
                        title="Remove product from your store"
                        style={{
                          padding: '5px 5px',
                          background: '#fef2f2',
                          color: '#b91c1c',
                          border: '1px solid #fca5a5',
                          borderRadius: '4px',
                          fontSize: '9.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
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
