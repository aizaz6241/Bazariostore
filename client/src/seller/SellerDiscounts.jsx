import { useEffect, useState } from 'react';
import { sapi, money, fmtDay } from '../api.js';
import Ic from '../components/Icons.jsx';

const TYPES = [
  { value: 'percentage', label: '% Percentage Off' },
  { value: 'flat', label: '₹ Flat Amount Off' },
];

export default function SellerDiscounts() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: '',
    type: 'percentage',
    value: '',
    minOrder: '',
    maxUses: '',
    expiresAt: '',
    active: true,
  });

  const load = () => {
    sapi('/sellers/coupons')
      .then(setCoupons)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.code || !form.value) return alert('Code and discount value are required');
    setSaving(true);
    try {
      await sapi('/sellers/coupons', {
        method: 'POST',
        body: {
          ...form,
          value: Number(form.value),
          minOrder: form.minOrder ? Number(form.minOrder) : 0,
          maxUses: form.maxUses ? Number(form.maxUses) : null,
        },
      });
      setShowForm(false);
      setForm({ code: '', type: 'percentage', value: '', minOrder: '', maxUses: '', expiresAt: '', active: true });
      load();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (coupon) => {
    try {
      await sapi(`/sellers/coupons/${coupon._id}`, {
        method: 'PUT',
        body: { active: !coupon.active },
      });
      setCoupons((prev) => prev.map((c) => c._id === coupon._id ? { ...c, active: !c.active } : c));
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const deleteCoupon = async (id) => {
    if (!confirm('Delete this coupon?')) return;
    try {
      await sapi(`/sellers/coupons/${id}`, { method: 'DELETE' });
      setCoupons((prev) => prev.filter((c) => c._id !== id));
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  return (
    <div className="seller-page">
      <div className="seller-page-header">
        <div>
          <h2>🎁 Discounts & Coupons</h2>
          <p>Create promotional coupon codes for your store products.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <Ic name="plus" size={16} /> Create Coupon
        </button>
      </div>

      {showForm && (
        <div className="card form-card mb-4">
          <h3>New Coupon Code</h3>
          <form onSubmit={handleSubmit} className="form-grid">
            <div className="field">
              <label>Coupon Code *</label>
              <input value={form.code} onChange={set('code')} placeholder="e.g. SAVE20" style={{ textTransform: 'uppercase' }} />
            </div>
            <div className="field">
              <label>Discount Type *</label>
              <select value={form.type} onChange={set('type')}>
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Discount Value * {form.type === 'percentage' ? '(%)' : '(₹)'}</label>
              <input type="number" value={form.value} onChange={set('value')} placeholder={form.type === 'percentage' ? '20' : '100'} />
            </div>
            <div className="field">
              <label>Minimum Order Amount (₹)</label>
              <input type="number" value={form.minOrder} onChange={set('minOrder')} placeholder="0 = no minimum" />
            </div>
            <div className="field">
              <label>Max Uses (leave blank = unlimited)</label>
              <input type="number" value={form.maxUses} onChange={set('maxUses')} placeholder="e.g. 100" />
            </div>
            <div className="field">
              <label>Expiry Date</label>
              <input type="date" value={form.expiresAt} onChange={set('expiresAt')} />
            </div>
            <div className="field field-full" style={{ display: 'flex', gap: 12 }}>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Creating...' : 'Create Coupon'}
              </button>
              <button type="button" className="btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading && <div className="seller-loading">Loading coupons...</div>}

      {!loading && coupons.length === 0 && !showForm && (
        <div className="empty-box">
          <Ic name="gift" size={44} stroke={1.2} />
          <p>No coupons yet. Create your first discount code!</p>
        </div>
      )}

      {coupons.length > 0 && (
        <div className="card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Type</th>
                <th>Value</th>
                <th>Min Order</th>
                <th>Uses</th>
                <th>Expiry</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c._id}>
                  <td><b className="code-chip">{c.code}</b></td>
                  <td>{c.type === 'percentage' ? 'Percentage' : 'Flat'}</td>
                  <td><b>{c.type === 'percentage' ? `${c.value}%` : money(c.value)}</b></td>
                  <td>{c.minOrder > 0 ? money(c.minOrder) : '—'}</td>
                  <td>{c.usedCount || 0}{c.maxUses ? ` / ${c.maxUses}` : ''}</td>
                  <td>{c.expiresAt ? fmtDay(c.expiresAt) : 'No expiry'}</td>
                  <td>
                    <span className={`status-chip ${c.active ? 'chip-green' : 'chip-red'}`}>
                      {c.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn-sm" onClick={() => toggleActive(c)}>
                        {c.active ? 'Disable' : 'Enable'}
                      </button>
                      <button className="btn-sm btn-danger" onClick={() => deleteCoupon(c._id)}>
                        <Ic name="x" size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
