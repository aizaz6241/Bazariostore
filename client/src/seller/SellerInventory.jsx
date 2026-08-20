import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { sapi, money, fmtDay } from '../api.js';
import Ic from '../components/Icons.jsx';

export default function SellerInventory() {
  const { seller } = useOutletContext();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [search, setSearch] = useState('');

  useEffect(() => {
    sapi('/sellers/products?limit=200')
      .then(setProducts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateStock = async (productId, newStock) => {
    setSaving((p) => ({ ...p, [productId]: true }));
    try {
      await sapi(`/sellers/products/${productId}`, {
        method: 'PUT',
        body: { stock: Number(newStock) },
      });
      setProducts((prev) =>
        prev.map((p) => (p._id === productId ? { ...p, stock: Number(newStock) } : p))
      );
    } catch (err) {
      alert('Failed to update: ' + err.message);
    } finally {
      setSaving((p) => ({ ...p, [productId]: false }));
    }
  };

  const filtered = products.filter((p) =>
    p.name?.toLowerCase().includes(search.toLowerCase())
  );

  const lowStock = products.filter((p) => p.stock <= 5 && p.stock > 0);
  const outOfStock = products.filter((p) => p.stock <= 0);

  return (
    <div className="seller-page">
      <div className="seller-page-header">
        <div>
          <h2>📦 Inventory Center</h2>
          <p>Monitor and update stock levels for all your products.</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="inv-summary-row">
        <div className="inv-card inv-card-total">
          <Ic name="box" size={22} />
          <div>
            <b>{products.length}</b>
            <small>Total Products</small>
          </div>
        </div>
        <div className="inv-card inv-card-low">
          <Ic name="alert" size={22} />
          <div>
            <b>{lowStock.length}</b>
            <small>Low Stock (≤5)</small>
          </div>
        </div>
        <div className="inv-card inv-card-out">
          <Ic name="x" size={22} />
          <div>
            <b>{outOfStock.length}</b>
            <small>Out of Stock</small>
          </div>
        </div>
        <div className="inv-card inv-card-ok">
          <Ic name="badgeCheck" size={22} />
          <div>
            <b>{products.filter((p) => p.stock > 5).length}</b>
            <small>Healthy Stock</small>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="inv-search-bar">
        <Ic name="search" size={16} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products by name..."
        />
      </div>

      {loading && <div className="seller-loading">Loading inventory...</div>}

      {!loading && (
        <div className="card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Price</th>
                <th>Current Stock</th>
                <th>Status</th>
                <th>Update Stock</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="text-center muted py-6">No products found.</td></tr>
              )}
              {filtered.map((p) => {
                const stockStatus = p.stock <= 0 ? 'out' : p.stock <= 5 ? 'low' : 'ok';
                return (
                  <tr key={p._id}>
                    <td>
                      <div className="inv-product-cell">
                        {p.images?.[0] && <img src={p.images[0]} alt="" className="inv-thumb" />}
                        <span>{p.name}</span>
                      </div>
                    </td>
                    <td>{money(p.price)}</td>
                    <td>
                      <span className={`stock-badge stock-${stockStatus}`}>{p.stock}</span>
                    </td>
                    <td>
                      <span className={`status-chip ${stockStatus === 'out' ? 'chip-red' : stockStatus === 'low' ? 'chip-orange' : 'chip-green'}`}>
                        {stockStatus === 'out' ? 'Out of Stock' : stockStatus === 'low' ? 'Low Stock' : 'In Stock'}
                      </span>
                    </td>
                    <td>
                      <div className="inv-update-row">
                        <input
                          type="number"
                          min={0}
                          defaultValue={p.stock}
                          className="inv-stock-input"
                          onBlur={(e) => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val) && val !== p.stock) updateStock(p._id, val);
                          }}
                        />
                        {saving[p._id] && <span className="muted-sm">Saving...</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
