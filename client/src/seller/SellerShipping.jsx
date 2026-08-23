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
      <div className="seller-page-header">
        <div>
          <h2>🚚 Shipping Settings</h2>
          <p>Configure your store's shipping methods and delivery rates.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <Ic name="plus" size={16} /> Add Shipping Method
        </button>
      </div>

      {showForm && (
        <div className="card form-card mb-4">
          <h3>New Shipping Method</h3>
          <form onSubmit={handleSubmit} className="form-grid">
            <div className="field">
              <label>Method Name *</label>
              <input value={form.name} onChange={set('name')} placeholder="e.g. Standard Delivery" />
            </div>
            <div className="field">
              <label>Description</label>
              <input value={form.description} onChange={set('description')} placeholder="e.g. Delivered via Delhivery / BlueDart" />
            </div>
            <div className="field">
              <label>Shipping Cost ($ USD) *</label>
              <input type="number" step="0.01" value={form.cost} onChange={set('cost')} placeholder="e.g. 5.00" min={0} />
            </div>
            <div className="field">
              <label>Free Above Order Amount ($ USD)</label>
              <input type="number" step="0.01" value={form.freeAbove} onChange={set('freeAbove')} placeholder="e.g. 50.00 — leave blank to never be free" min={0} />
            </div>
            <div className="field">
              <label>Estimated Delivery Time</label>
              <input value={form.eta} onChange={set('eta')} placeholder="e.g. 3-5 business days" />
            </div>
            <div className="field field-full" style={{ display: 'flex', gap: 12 }}>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Method'}
              </button>
              <button type="button" className="btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading && <div className="seller-loading">Loading shipping methods...</div>}

      {!loading && methods.length === 0 && !showForm && (
        <div className="empty-box">
          <Ic name="truck" size={44} stroke={1.2} />
          <p>No shipping methods yet. Add your delivery options!</p>
          <p className="muted-sm">Platform default shipping will apply until you add your own.</p>
        </div>
      )}

      {methods.length > 0 && (
        <div className="card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Cost</th>
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
                  <td><b>{formatMoney(m.cost)}</b></td>
                  <td>{m.freeAbove ? formatMoney(m.freeAbove) : 'Never free'}</td>
                  <td className="muted-sm">{m.eta || '—'}</td>
                  <td>
                    <span className={`status-chip ${m.active ? 'chip-green' : 'chip-red'}`}>
                      {m.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn-sm" onClick={() => toggleActive(m)}>
                        {m.active ? 'Disable' : 'Enable'}
                      </button>
                      <button className="btn-sm btn-danger" onClick={() => deleteMethod(m._id)}>
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
