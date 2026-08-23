import { useEffect, useState } from 'react';
import { sapi, money } from '../api.js';
import Ic from '../components/Icons.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';

export default function SellerShipping() {
  const { formatMoney } = useCurrency();
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    cost: '',
    freeAbove: '',
    eta: '',
    active: true,
  });

  const load = () => {
    sapi('/sellers/shipping')
      .then(setMethods)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.cost) return alert('Name and cost are required');
    setSaving(true);
    try {
      await sapi('/sellers/shipping', {
        method: 'POST',
        body: {
          ...form,
          cost: Number(form.cost),
          freeAbove: form.freeAbove ? Number(form.freeAbove) : null,
        },
      });
      setShowForm(false);
      setForm({ name: '', description: '', cost: '', freeAbove: '', eta: '', active: true });
      load();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (method) => {
    try {
      await sapi(`/sellers/shipping/${method._id}`, {
        method: 'PUT',
        body: { active: !method.active },
      });
      setMethods((prev) => prev.map((m) => m._id === method._id ? { ...m, active: !m.active } : m));
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const deleteMethod = async (id) => {
    if (!confirm('Delete this shipping method?')) return;
    try {
      await sapi(`/sellers/shipping/${id}`, { method: 'DELETE' });
      setMethods((prev) => prev.filter((m) => m._id !== id));
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  return (
    <div className="seller-page">
      <div className="seller-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2>🚚 Shipping Settings</h2>
          <p>Configure your store's custom shipping delivery methods, regional rates, and free delivery thresholds.</p>
        </div>
        <button type="button" className="seller-btn-pri" onClick={() => setShowForm(!showForm)}>
          <Ic name={showForm ? 'x' : 'plus'} size={16} /> {showForm ? 'Close Form' : 'Add Shipping Method'}
        </button>
      </div>

      {showForm && (
        <div className="seller-card form-card mb-4" style={{ borderLeft: '4px solid #f59e0b', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 24 }}>📦</span>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Create New Shipping Method</h3>
              <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#64748b' }}>
                Set up a custom shipping tier for your customer orders.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="shipping-form-grid">
            <div className="shipping-field">
              <label>Method Name *</label>
              <input value={form.name} onChange={set('name')} placeholder="e.g. Standard Express Delivery" required />
            </div>
            <div className="shipping-field">
              <label>Description</label>
              <input value={form.description} onChange={set('description')} placeholder="e.g. Delivered via Delhivery / BlueDart / TCS" />
            </div>
            <div className="shipping-field">
              <label>Shipping Cost ($ USD) *</label>
              <input type="number" step="0.01" value={form.cost} onChange={set('cost')} placeholder="e.g. 5.00" min={0} required />
            </div>
            <div className="shipping-field">
              <label>Free Above Order Amount ($ USD)</label>
              <input type="number" step="0.01" value={form.freeAbove} onChange={set('freeAbove')} placeholder="e.g. 50.00 (leave blank to never be free)" min={0} />
            </div>
            <div className="shipping-field">
              <label>Estimated Delivery Time</label>
              <input value={form.eta} onChange={set('eta')} placeholder="e.g. 2-4 business days" />
            </div>
            <div className="shipping-field-actions">
              <button type="submit" className="seller-btn-pri" disabled={saving}>
                <Ic name="sparkle" size={15} /> {saving ? 'Saving Method...' : 'Save Shipping Method'}
              </button>
              <button type="button" className="seller-btn-sec" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading && <div className="seller-loading">Loading shipping methods...</div>}

      {!loading && methods.length === 0 && !showForm && (
        <div className="table-empty-box" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🚚</div>
          <h4 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>No Custom Shipping Methods Yet</h4>
          <p style={{ color: '#64748b', fontSize: 13, maxWidth: 440, margin: '0 auto 16px' }}>
            Platform default shipping rates will apply to your orders until you create custom delivery rates.
          </p>
          <button type="button" className="seller-btn-pri" onClick={() => setShowForm(true)}>
            <Ic name="plus" size={15} /> Add Shipping Method
          </button>
        </div>
      )}

      {methods.length > 0 && (
        <div className="seller-card">
          <div className="seller-table-wrap">
            <table className="seller-table">
              <thead>
                <tr>
                  <th>Method Name</th>
                  <th>Description</th>
                  <th>Shipping Cost</th>
                  <th>Free Above</th>
                  <th>ETA</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {methods.map((m) => (
                  <tr key={m._id}>
                    <td><b>{m.name}</b></td>
                    <td className="muted-sm">{m.description || '—'}</td>
                    <td><b style={{ color: '#16a34a', fontSize: 14 }}>{formatMoney(m.cost)}</b></td>
                    <td>{m.freeAbove ? <span className="text-green font-bold">Free over {formatMoney(m.freeAbove)}</span> : <span className="muted-sm">Never free</span>}</td>
                    <td className="muted-sm">{m.eta || '—'}</td>
                    <td>
                      <span className={`status-tag ${m.active ? 'status-delivered' : 'status-cancelled'}`}>
                        {m.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className={m.active ? 'btn-action-edit' : 'seller-btn-pri btn-sm'} onClick={() => toggleActive(m)}>
                          {m.active ? 'Disable' : 'Enable'}
                        </button>
                        <button type="button" className="btn-action-delete" onClick={() => deleteMethod(m._id)} title="Delete Method">
                          <Ic name="x" size={13} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
