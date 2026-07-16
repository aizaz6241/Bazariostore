import { useEffect, useState } from 'react';
import { api, money, fmtDay } from '../api.js';
import { Modal, Toggle, ErrorBox, F } from './ui.jsx';
import Ic from '../components/Icons.jsx';

const TYPES = [
  { key: 'percentage', label: 'Percentage Discount (%)' },
  { key: 'fixed', label: 'Fixed Discount (Rs)' },
  { key: 'bxgy', label: 'Buy X Get Y Free' },
  { key: 'free_shipping', label: 'Free Shipping' },
];

const EMPTY = {
  name: '', code: '', type: 'percentage', value: 10, buyQty: 2, getQty: 1,
  scope: 'all', categories: [], products: [], minPurchase: 0,
  startsAt: '', endsAt: '', usageLimit: 0, active: true,
};

export default function Discounts() {
  const [discounts, setDiscounts] = useState([]);
  const [cats, setCats] = useState([]);
  const [products, setProducts] = useState([]);
  const [edit, setEdit] = useState(null);
  const [error, setError] = useState('');

  const load = () => api('/discounts').then(setDiscounts).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    api('/categories/admin/list').then(setCats).catch(() => {});
    api('/products/admin/list').then(setProducts).catch(() => {});
  }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      const body = {
        ...edit,
        value: Number(edit.value) || 0,
        buyQty: Number(edit.buyQty) || 0,
        getQty: Number(edit.getQty) || 0,
        minPurchase: Number(edit.minPurchase) || 0,
        usageLimit: Number(edit.usageLimit) || 0,
        startsAt: edit.startsAt || null,
        endsAt: edit.endsAt || null,
        categories: (edit.categories || []).map((c) => c._id || c),
        products: (edit.products || []).map((p) => p._id || p),
      };
      if (edit._id) await api(`/discounts/${edit._id}`, { method: 'PUT', body });
      else await api('/discounts', { method: 'POST', body });
      setEdit(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggle = async (d) => {
    await api(`/discounts/${d._id}/active`, { method: 'PATCH' });
    load();
  };
  const del = async (d) => {
    if (!window.confirm(`Delete discount "${d.name}"?`)) return;
    await api(`/discounts/${d._id}`, { method: 'DELETE' });
    load();
  };

  const describe = (d) => {
    if (d.type === 'percentage') return `${d.value}% off`;
    if (d.type === 'fixed') return `${money(d.value)} off`;
    if (d.type === 'bxgy') return `Buy ${d.buyQty} Get ${d.getQty} Free`;
    return 'Free Shipping';
  };

  const multiToggle = (k, id) => {
    const cur = (edit[k] || []).map((x) => x._id || x);
    setEdit({ ...edit, [k]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };

  return (
    <>
      <div className="admin-h1-row">
        <h1 className="admin-h1">Discounts & Coupons</h1>
        <button className="btn-primary" onClick={() => setEdit({ ...EMPTY })}><Ic name="plus" size={15} /> CREATE DISCOUNT</button>
      </div>
      <p className="muted-sm">Bina code wale discounts checkout par khud-ba-khud apply hotay hain jab conditions poori hon; code wale coupons customer enter karta hai.</p>
      <ErrorBox error={error} />

      <div className="card">
        <table className="admin-table">
          <thead>
            <tr><th>Name</th><th>Code</th><th>Type</th><th>Scope</th><th>Min Purchase</th><th>Window</th><th>Used</th><th>Active</th><th /></tr>
          </thead>
          <tbody>
            {discounts.map((d) => (
              <tr key={d._id} className={d.active ? '' : 'row-inactive'}>
                <td><b>{d.name}</b><br /><small className="muted">{describe(d)}</small></td>
                <td>{d.code ? <span className="pay-chip">{d.code}</span> : <small className="muted">automatic</small>}</td>
                <td>{TYPES.find((t) => t.key === d.type)?.label.split(' (')[0]}</td>
                <td>{d.scope === 'all' ? 'All products' : d.scope === 'category' ? `${d.categories.length} categories` : `${d.products.length} products`}</td>
                <td>{d.minPurchase ? money(d.minPurchase) : '—'}</td>
                <td>{d.startsAt || d.endsAt ? `${d.startsAt ? fmtDay(d.startsAt) : '…'} → ${d.endsAt ? fmtDay(d.endsAt) : '…'}` : 'Always'}</td>
                <td>{d.usedCount}{d.usageLimit ? `/${d.usageLimit}` : ''}</td>
                <td><Toggle small on={d.active} onChange={() => toggle(d)} /></td>
                <td className="row-actions">
                  <button className="row-link" onClick={() => setEdit({ ...EMPTY, ...d, startsAt: d.startsAt?.slice(0, 10) || '', endsAt: d.endsAt?.slice(0, 10) || '' })}>Edit</button>
                  <button className="row-link danger" onClick={() => del(d)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <Modal title={edit._id ? 'Edit Discount' : 'Create Discount'} onClose={() => setEdit(null)} wide>
          <form onSubmit={save}>
            <div className="form-grid">
              <F label="Name *"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required /></F>
              <F label="Coupon Code (khali = automatic discount)"><input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} placeholder="e.g. GLOW20" /></F>
              <F label="Type">
                <select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>
                  {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </F>
              {['percentage', 'fixed'].includes(edit.type) && (
                <F label={edit.type === 'percentage' ? 'Percent (%)' : 'Amount (Rs)'}>
                  <input type="number" value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} />
                </F>
              )}
              {edit.type === 'bxgy' && (
                <>
                  <F label="Buy Quantity (X)"><input type="number" value={edit.buyQty} onChange={(e) => setEdit({ ...edit, buyQty: e.target.value })} /></F>
                  <F label="Get Free (Y)"><input type="number" value={edit.getQty} onChange={(e) => setEdit({ ...edit, getQty: e.target.value })} /></F>
                </>
              )}
              <F label="Minimum Purchase (Rs)"><input type="number" value={edit.minPurchase} onChange={(e) => setEdit({ ...edit, minPurchase: e.target.value })} /></F>
              <F label="Usage Limit (0 = unlimited)"><input type="number" value={edit.usageLimit} onChange={(e) => setEdit({ ...edit, usageLimit: e.target.value })} /></F>
              <F label="Starts"><input type="date" value={edit.startsAt} onChange={(e) => setEdit({ ...edit, startsAt: e.target.value })} /></F>
              <F label="Ends"><input type="date" value={edit.endsAt} onChange={(e) => setEdit({ ...edit, endsAt: e.target.value })} /></F>
              <F label="Applies To">
                <select value={edit.scope} onChange={(e) => setEdit({ ...edit, scope: e.target.value })}>
                  <option value="all">All products</option>
                  <option value="category">Specific categories</option>
                  <option value="product">Specific products</option>
                </select>
              </F>
            </div>

            {edit.scope === 'category' && (
              <div className="picker-box">
                {cats.map((c) => {
                  const on = (edit.categories || []).map((x) => x._id || x).includes(c._id);
                  return (
                    <button type="button" key={c._id} className={'chip' + (on ? ' chip-on' : '')} onClick={() => multiToggle('categories', c._id)}>
                      {c.name}
                    </button>
                  );
                })}
              </div>
            )}
            {edit.scope === 'product' && (
              <div className="picker-box picker-scroll">
                {products.map((pr) => {
                  const on = (edit.products || []).map((x) => x._id || x).includes(pr._id);
                  return (
                    <button type="button" key={pr._id} className={'chip' + (on ? ' chip-on' : '')} onClick={() => multiToggle('products', pr._id)}>
                      {pr.name}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="form-actions">
              <button className="btn-primary">SAVE DISCOUNT</button>
              <button type="button" className="btn-outline" onClick={() => setEdit(null)}>CANCEL</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
