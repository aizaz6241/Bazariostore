import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api.js';
import { Toggle, ErrorBox } from './ui.jsx';
import Ic from '../components/Icons.jsx';

export default function AdminTreasury() {
  const [products, setProducts] = useState([]);
  const [summary, setSummary] = useState({
    totalProducts: 0,
    activeProducts: 0,
    outOfStockProducts: 0,
    totalStockUnits: 0,
  });
  const [categories, setCategories] = useState([]);
  const [selectedCat, setSelectedCat] = useState('');
  const [q, setQ] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Quick Restock Modal state
  const [restockModal, setRestockModal] = useState(null); // { product, delta: '', newStock: '', mode: 'add' }
  const [restocking, setRestocking] = useState(false);

  // View Sellers Modal state
  const [sellersModal, setSellersModal] = useState(null); // { product, sellers: [], loading: false }

  const loadData = () => {
    setLoading(true);
    let url = '/treasury?';
    const params = new URLSearchParams();
    if (q.trim()) params.append('q', q.trim());
    if (selectedCat) params.append('category', selectedCat);
    if (sortBy) params.append('sort', sortBy);
    url += params.toString();

    api(url)
      .then((res) => {
        setProducts(res.products || []);
        if (res.summary) setSummary(res.summary);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    api('/categories/admin/list')
      .then((cats) => setCategories(cats || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadData();
  }, [selectedCat, sortBy]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadData();
  };

  const toggleActive = async (p) => {
    try {
      const updated = await api(`/treasury/${p._id}/active`, { method: 'PATCH' });
      setProducts((prev) =>
        prev.map((x) => (x._id === p._id ? { ...x, active: updated.active } : x))
      );
    } catch (e) {
      alert(e.message);
    }
  };

  const deleteProduct = async (p) => {
    if (
      !window.confirm(
        `Are you sure you want to delete "${p.name}" from Treasury? This master product will be removed from the central catalog.`
      )
    )
      return;
    try {
      await api(`/treasury/${p._id}`, { method: 'DELETE' });
      setProducts((prev) => prev.filter((x) => x._id !== p._id));
      setSummary((prev) => ({
        ...prev,
        totalProducts: Math.max(0, prev.totalProducts - 1),
        totalStockUnits: Math.max(0, prev.totalStockUnits - (p.stock || 0)),
      }));
    } catch (e) {
      setError(e.message);
    }
  };

  const openRestock = (p) => {
    setRestockModal({
      product: p,
      mode: 'add',
      delta: 100,
      newStock: p.stock || 0,
      note: 'Central warehouse restock',
    });
  };

  const submitRestock = async (e) => {
    e.preventDefault();
    if (!restockModal) return;
    setRestocking(true);
    try {
      const payload =
        restockModal.mode === 'add'
          ? { delta: Number(restockModal.delta), note: restockModal.note }
          : { newStock: Number(restockModal.newStock), note: restockModal.note };

      const updated = await api(`/treasury/${restockModal.product._id}/restock`, {
        method: 'POST',
        body: payload,
      });

      setProducts((prev) =>
        prev.map((x) => (x._id === updated._id ? { ...x, stock: updated.stock } : x))
      );
      setRestockModal(null);
      loadData();
    } catch (err) {
      alert('Restock failed: ' + err.message);
    } finally {
      setRestocking(false);
    }
  };

  const viewSellers = (p) => {
    setSellersModal({ product: p, sellers: [], loading: true });
    api(`/treasury/${p._id}`)
      .then((data) => {
        setSellersModal({ product: p, sellers: data.sellers || [], loading: false });
      })
      .catch((err) => {
        alert(err.message);
        setSellersModal(null);
      });
  };

  return (
    <div className="admin-treasury-page">
      {/* Top Header Row */}
      <div className="admin-h1-row">
        <div>
          <h1 className="admin-h1">📦 Product Treasury (Master Catalog)</h1>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: '13.5px' }}>
            Master product collection with central warehouse stock. Sellers browse and import these items directly into their storefronts.
          </p>
        </div>
        <Link to="/admin/treasury/new" className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <Ic name="plus" size={15} /> ADD MASTER PRODUCT
        </Link>
      </div>

      {/* KPI Stats Overview */}
      <div className="treasury-kpi-grid">
        <div className="treasury-kpi-card">
          <div className="treasury-kpi-icon blue">📦</div>
          <div className="treasury-kpi-info">
            <div className="treasury-kpi-val">{summary.totalProducts.toLocaleString()}</div>
            <div className="treasury-kpi-lbl">Master Products</div>
          </div>
        </div>

        <div className="treasury-kpi-card">
          <div className="treasury-kpi-icon green">🏭</div>
          <div className="treasury-kpi-info">
            <div className="treasury-kpi-val">{summary.totalStockUnits.toLocaleString()}</div>
            <div className="treasury-kpi-lbl">Warehouse Units</div>
          </div>
        </div>

        <div className="treasury-kpi-card">
          <div className="treasury-kpi-icon purple">⚡</div>
          <div className="treasury-kpi-info">
            <div className="treasury-kpi-val">{summary.activeProducts.toLocaleString()}</div>
            <div className="treasury-kpi-lbl">Active In Catalog</div>
          </div>
        </div>

        <div className="treasury-kpi-card">
          <div className="treasury-kpi-icon amber">⚠️</div>
          <div className="treasury-kpi-info">
            <div className="treasury-kpi-val">{summary.outOfStockProducts.toLocaleString()}</div>
            <div className="treasury-kpi-lbl">Out of Stock</div>
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="treasury-filter-card">
        <div className="treasury-filter-left">
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '8px', flex: '1 1 300px' }}>
            <div className="treasury-search-box">
              <span className="treasury-search-icon"><Ic name="search" size={16} /></span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by title, SKU, brand…"
              />
            </div>
            <button type="submit" className="btn-primary" style={{ padding: '0 16px', height: '40px' }}>
              Search
            </button>
          </form>

          <select
            className="treasury-select"
            value={selectedCat}
            onChange={(e) => setSelectedCat(e.target.value)}
          >
            <option value="">All Categories ({categories.length})</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            className="treasury-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="">Sort: Newest First</option>
            <option value="stock-desc">Stock: High to Low</option>
            <option value="stock-asc">Stock: Low to High</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="name">Product Name (A-Z)</option>
          </select>
        </div>

        <div className="treasury-filter-stats">
          Total: <b style={{ color: '#0f172a' }}>{products.length}</b> items
        </div>
      </div>

      <ErrorBox error={error} />

      {/* Main Treasury Products Table */}
      <div className="treasury-table-container">
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
            <p style={{ fontSize: '15px', fontWeight: 600 }}>Loading master products from Treasury…</p>
          </div>
        ) : products.length === 0 ? (
          <div style={{ padding: '56px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '44px', marginBottom: '14px' }}>📦</div>
            <h3 style={{ margin: '0 0 8px', color: '#0f172a', fontSize: '18px' }}>No master products found</h3>
            <p className="muted" style={{ margin: '0 0 20px', fontSize: '14px' }}>
              Add master products so sellers can browse the treasury and list them in their stores.
            </p>
            <Link to="/admin/treasury/new" className="btn-treasury-add">
              + Add First Master Product
            </Link>
          </div>
        ) : (
          <div className="treasury-table-scroll">
            <table className="treasury-table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>Image</th>
                  <th>Product Title & SKU</th>
                  <th>Category</th>
                  <th>Retail Price</th>
                  <th>Wholesale Cost</th>
                  <th>Central Stock</th>
                  <th>Listed by</th>
                  <th>Active</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const isOut = (p.stock || 0) <= 0;
                  const isLow = !isOut && (p.stock || 0) <= (p.lowStockThreshold || 10);
                  const margin =
                    p.price > 0 && p.costPrice > 0
                      ? Math.round(((p.price - p.costPrice) / p.price) * 100)
                      : null;

                  return (
                    <tr key={p._id} className={p.active ? '' : 'row-inactive'}>
                      <td>
                        <img
                          src={p.image || p.images?.[0]?.url || '/img/products/serum.svg'}
                          alt=""
                          className="treasury-prod-thumb"
                        />
                      </td>

                      <td>
                        <div className="treasury-prod-meta">
                          <span className="treasury-prod-name" title={p.name}>
                            {p.name}
                          </span>
                          <span className="treasury-prod-sub">
                            <span className="treasury-sku-chip">{p.sku || 'N/A'}</span>
                            {p.brand && <span>• {p.brand}</span>}
                          </span>
                        </div>
                      </td>

                      <td>
                        <span className="treasury-cat-badge">
                          {p.category?.name || 'General'}
                        </span>
                      </td>

                      <td>
                        <b style={{ color: '#0f172a', fontSize: '13.5px' }}>{money(p.price)}</b>
                        {p.oldPrice && (
                          <div style={{ fontSize: '11px', color: '#94a3b8', textDecoration: 'line-through' }}>
                            {money(p.oldPrice)}
                          </div>
                        )}
                      </td>

                      <td>
                        <span style={{ color: '#334155', fontWeight: 600 }}>{money(p.costPrice || 0)}</span>
                        {margin !== null && (
                          <div style={{ marginTop: '2px' }}>
                            <span className="treasury-margin-pill">+{margin}%</span>
                          </div>
                        )}
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className={`treasury-stock-badge ${isOut ? 'out' : isLow ? 'low' : 'ok'}`}>
                            {(p.stock || 0).toLocaleString()} units
                          </span>
                          <button
                            className="btn-quick-restock"
                            onClick={() => openRestock(p)}
                            title="Quick Stock Adjustment"
                          >
                            + Stock
                          </button>
                        </div>
                      </td>

                      <td>
                        <button
                          className="treasury-sellers-btn"
                          onClick={() => viewSellers(p)}
                        >
                          🏪 {p.sellersCount} {p.sellersCount === 1 ? 'Seller' : 'Sellers'}
                        </button>
                      </td>

                      <td>
                        <Toggle small on={p.active} onChange={() => toggleActive(p)} />
                      </td>

                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Link
                          to={`/admin/treasury/${p._id}`}
                          style={{ marginRight: '10px', color: '#2563eb', fontWeight: 700, fontSize: '12.5px', textDecoration: 'none' }}
                        >
                          Edit
                        </Link>
                        <button
                          onClick={() => deleteProduct(p)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 700, fontSize: '12.5px' }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Restock Modal */}
      {restockModal && (
        <div className="treasury-modal-backdrop" onClick={() => setRestockModal(null)}>
          <div className="treasury-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="treasury-modal-head">
              <h3>📦 Adjust Central Stock</h3>
              <button className="treasury-modal-close" onClick={() => setRestockModal(null)}>✕</button>
            </div>

            <form onSubmit={submitRestock}>
              <div className="treasury-modal-body">
                <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>{restockModal.product.name}</div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                    Current Central Stock: <b style={{ color: '#059669', fontSize: '13px' }}>{restockModal.product.stock?.toLocaleString()} units</b>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setRestockModal({ ...restockModal, mode: 'add' })}
                    style={{
                      flex: 1,
                      padding: '9px',
                      borderRadius: '8px',
                      border: '1.5px solid',
                      borderColor: restockModal.mode === 'add' ? '#2563eb' : '#cbd5e1',
                      background: restockModal.mode === 'add' ? '#eff6ff' : '#fff',
                      color: restockModal.mode === 'add' ? '#1d4ed8' : '#475569',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    + Add / Remove Units
                  </button>
                  <button
                    type="button"
                    onClick={() => setRestockModal({ ...restockModal, mode: 'set' })}
                    style={{
                      flex: 1,
                      padding: '9px',
                      borderRadius: '8px',
                      border: '1.5px solid',
                      borderColor: restockModal.mode === 'set' ? '#2563eb' : '#cbd5e1',
                      background: restockModal.mode === 'set' ? '#eff6ff' : '#fff',
                      color: restockModal.mode === 'set' ? '#1d4ed8' : '#475569',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    Set Total Stock
                  </button>
                </div>

                {restockModal.mode === 'add' ? (
                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '6px', color: '#334155' }}>
                      Units to Add (or negative to decrease):
                    </label>
                    <input
                      type="number"
                      value={restockModal.delta}
                      onChange={(e) => setRestockModal({ ...restockModal, delta: e.target.value })}
                      placeholder="e.g. 500 or -50"
                      required
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '14.5px',
                        fontWeight: 600,
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                      {[50, 100, 250, 500, 1000].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setRestockModal({ ...restockModal, delta: num })}
                          style={{
                            padding: '4px 10px',
                            background: '#f1f5f9',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            color: '#1e293b',
                            cursor: 'pointer',
                          }}
                        >
                          +{num}
                        </button>
                      ))}
                    </div>
                    {restockModal.delta && (
                      <div style={{ fontSize: '12px', color: '#059669', fontWeight: 600, marginTop: '8px' }}>
                        → Resulting Stock: {(Number(restockModal.product.stock || 0) + Number(restockModal.delta || 0)).toLocaleString()} units
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '6px', color: '#334155' }}>
                      Exact Central Stock Count:
                    </label>
                    <input
                      type="number"
                      value={restockModal.newStock}
                      onChange={(e) => setRestockModal({ ...restockModal, newStock: e.target.value })}
                      required
                      min="0"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '14.5px',
                        fontWeight: 600,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '6px', color: '#334155' }}>
                    Reason / Restock Note (Optional):
                  </label>
                  <input
                    type="text"
                    value={restockModal.note || ''}
                    onChange={(e) => setRestockModal({ ...restockModal, note: e.target.value })}
                    placeholder="e.g. Supplier container shipment received"
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div className="treasury-modal-footer">
                <button
                  type="button"
                  onClick={() => setRestockModal(null)}
                  className="btn-treasury-refresh"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={restocking}
                  className="btn-treasury-add"
                >
                  {restocking ? 'Saving…' : 'Save & Sync Warehouse'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Listing Sellers Modal */}
      {sellersModal && (
        <div className="treasury-modal-backdrop" onClick={() => setSellersModal(null)}>
          <div className="treasury-modal-card" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
            <div className="treasury-modal-head">
              <div>
                <h3>🏪 Active Sellers Offering This Product</h3>
                <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748b' }}>
                  {sellersModal.product.name}
                </p>
              </div>
              <button className="treasury-modal-close" onClick={() => setSellersModal(null)}>✕</button>
            </div>

            <div className="treasury-modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {sellersModal.loading ? (
                <p style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '13.5px' }}>
                  Loading sellers list…
                </p>
              ) : sellersModal.sellers.length === 0 ? (
                <div style={{ padding: '36px 20px', textAlign: 'center', color: '#64748b' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>🏬</div>
                  <p style={{ margin: 0, fontSize: '13.5px', fontWeight: 600 }}>No sellers have listed this product yet.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {sellersModal.sellers.map((s) => (
                    <div
                      key={s._id}
                      style={{
                        padding: '12px 16px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        background: '#f8fafc',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '13.5px' }}>
                          {s.sellerName || s.seller?.storeName || 'Seller Store'}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                          Owner: {s.seller?.ownerName || '—'} • {s.seller?.email || '—'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 800, color: '#2563eb', fontSize: '14.5px' }}>{money(s.price)}</div>
                        <div style={{ fontSize: '11px', color: '#059669', fontWeight: 700, marginTop: '2px' }}>
                          Stock: {s.stock} (Synced)
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="treasury-modal-footer">
              <button onClick={() => setSellersModal(null)} className="btn-treasury-refresh">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
