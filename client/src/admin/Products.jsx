import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api.js';
import { PRODUCT_LABELS } from '../data.js';
import { Toggle, ErrorBox } from './ui.jsx';
import Ic from '../components/Icons.jsx';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api('/products/admin/list' + (q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''))
      .then(setProducts)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleActive = async (p) => {
    const updated = await api(`/products/${p._id}/active`, { method: 'PATCH' });
    setProducts((prev) => prev.map((x) => (x._id === p._id ? { ...x, active: updated.active } : x)));
  };

  const del = async (p) => {
    if (!window.confirm(`Delete "${p.name}"? Iski UploadThing images bhi delete ho jayengi.`)) return;
    try {
      await api(`/products/${p._id}`, { method: 'DELETE' });
      setProducts((prev) => prev.filter((x) => x._id !== p._id));
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <>
      <div className="admin-h1-row">
        <h1 className="admin-h1">Products</h1>
        <Link to="/admin/products/new" className="btn-primary"><Ic name="plus" size={15} /> ADD PRODUCT</Link>
      </div>

      <form className="admin-toolbar" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <div className="admin-search">
          <Ic name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or SKU…" />
        </div>
        <button className="btn-primary">SEARCH</button>
      </form>

      <ErrorBox error={error} />
      <div className="card">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th /><th>Product</th><th>SKU</th><th>Category</th><th>Price</th><th>Stock</th><th>Labels</th><th>Active</th><th /></tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p._id} className={p.active ? '' : 'row-inactive'}>
                    <td><span className="cart-thumb thumb-sm"><img src={p.image} alt="" /></span></td>
                    <td><b>{p.name}</b></td>
                    <td>{p.sku}</td>
                    <td>{p.category?.name || '—'}</td>
                    <td>{money(p.price)}</td>
                    <td>
                      <span className={p.stock <= 0 ? 'stock-out' : p.stock <= p.lowStockThreshold ? 'stock-low' : ''}>{p.stock}</span>
                    </td>
                    <td>
                      <span className="label-chips">
                        {(p.labels || []).map((l) => (
                          <em key={l} className={`lbl lbl-${PRODUCT_LABELS[l]?.cls || 'new'}`}>{PRODUCT_LABELS[l]?.text || l}</em>
                        ))}
                      </span>
                    </td>
                    <td><Toggle small on={p.active} onChange={() => toggleActive(p)} /></td>
                    <td className="row-actions">
                      <Link className="row-link" to={`/admin/products/${p._id}`}>Edit</Link>
                      <button className="row-link danger" onClick={() => del(p)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
