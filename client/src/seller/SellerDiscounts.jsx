import { useEffect, useState } from 'react';
import { sapi, fmtDay } from '../api.js';
import Ic from '../components/Icons.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';

const TYPES = [
  { value: 'percentage', label: '% Percentage Off' },
  { value: 'flat', label: 'Fixed Flat Amount Off' },
];

export default function SellerDiscounts() {
  const { formatMoney, currentCurrency } = useCurrency();
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);
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
    setLoading(true);
    sapi('/sellers/coupons')
      .then(setCoupons)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const generateRandomCode = () => {
    const prefixes = ['SAVE', 'DEAL', 'FLASH', 'VIP', 'OFFER', 'SUPER'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const val = form.value ? Math.round(Number(form.value)) : '20';
    setForm((f) => ({ ...f, code: `${prefix}${val}` }));
  };

  const handleCopy = (code) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.code.trim() || !form.value) return alert('Coupon code and discount value are required');
    setSaving(true);
    try {
      await sapi('/sellers/coupons', {
        method: 'POST',
        body: {
          ...form,
          code: form.code.trim().toUpperCase(),
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
      setCoupons((prev) => prev.map((c) => (c._id === coupon._id ? { ...c, active: !c.active } : c)));
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const deleteCoupon = async (id, code) => {
    if (!confirm(`Are you sure you want to delete coupon "${code}"?`)) return;
    try {
      await sapi(`/sellers/coupons/${id}`, { method: 'DELETE' });
      setCoupons((prev) => prev.filter((c) => c._id !== id));
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const activeCount = coupons.filter((c) => c.active).length;
  const totalUses = coupons.reduce((sum, c) => sum + (c.usedCount || 0), 0);

  return (
    <div className="seller-discounts-page">
      {/* Header */}
      <div className="seller-page-header">
        <div>
          <h2>🎁 Discounts &amp; Promotional Coupons</h2>
          <p>Create promotional voucher codes, configure minimum spend limits, and boost your storefront order conversions.</p>
        </div>
        <button
          type="button"
          className="seller-btn-pri"
          onClick={() => setShowForm(!showForm)}
        >
          <Ic name={showForm ? 'x' : 'plus'} size={17} />
          {showForm ? 'Close Form' : 'Create New Coupon'}
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="discounts-kpi-grid">
        <div className="dkpi-card">
          <div className="dkpi-icon-box purple">
            <Ic name="tag" size={22} />
          </div>
          <div className="dkpi-info">
            <span className="dkpi-lbl">Total Coupons Created</span>
            <b className="dkpi-val">{coupons.length}</b>
          </div>
        </div>

        <div className="dkpi-card">
          <div className="dkpi-icon-box green">
            <Ic name="checkCircle" size={22} />
          </div>
          <div className="dkpi-info">
            <span className="dkpi-lbl">Active &amp; Redeemable</span>
            <b className="dkpi-val text-green">{activeCount}</b>
          </div>
        </div>

        <div className="dkpi-card">
          <div className="dkpi-icon-box orange">
            <Ic name="sparkle" size={22} />
          </div>
          <div className="dkpi-info">
            <span className="dkpi-lbl">Total Times Redeemed</span>
            <b className="dkpi-val">{totalUses} Uses</b>
          </div>
        </div>
      </div>

      {/* Create Coupon Card / Form */}
      {showForm && (
        <div className="seller-card coupon-creator-card">
          <div className="ccc-head">
            <div className="ccc-head-title">
              <div className="ccc-badge-icon">
                <Ic name="sparkle" size={20} />
              </div>
              <div>
                <h3>Create New Store Discount Code</h3>
                <p>Define voucher code rules, minimum purchase thresholds, and expiration schedule.</p>
              </div>
            </div>
            <button type="button" className="btn-close-card" onClick={() => setShowForm(false)}>
              <Ic name="x" size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="coupon-form-grid">
            <div className="cfg-field">
              <div className="cfg-label-row">
                <label>Coupon Code *</label>
                <button type="button" onClick={generateRandomCode} className="btn-auto-code">
                  ⚡ Suggest Code
                </button>
              </div>
              <input
                type="text"
                value={form.code}
                onChange={set('code')}
                placeholder="e.g. FLASH20"
                className="cfg-input code-style"
                required
              />
              <small className="cfg-hint">Uppercase letters and numbers only.</small>
            </div>

            <div className="cfg-field">
              <label>Discount Type *</label>
              <select value={form.type} onChange={set('type')} className="cfg-select">
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <small className="cfg-hint">Choose between percentage deduction or fixed money discount.</small>
            </div>

            <div className="cfg-field">
              <label>Discount Value * {form.type === 'percentage' ? '(%)' : `(${currentCurrency.symbol})`}</label>
              <div className="cfg-input-prefix-wrap">
                <span className="cfg-prefix">{form.type === 'percentage' ? '%' : currentCurrency.symbol}</span>
                <input
                  type="number"
                  step="any"
                  min="1"
                  value={form.value}
                  onChange={set('value')}
                  placeholder={form.type === 'percentage' ? '20' : '15.00'}
                  className="cfg-input with-prefix"
                  required
                />
              </div>
              <small className="cfg-hint">
                {form.type === 'percentage' ? 'Deducts percentage off order value' : `Fixed ${currentCurrency.code} deducted`}
              </small>
            </div>

            <div className="cfg-field">
              <label>Minimum Spend Order ({currentCurrency.symbol})</label>
              <div className="cfg-input-prefix-wrap">
                <span className="cfg-prefix">{currentCurrency.symbol}</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={form.minOrder}
                  onChange={set('minOrder')}
                  placeholder="0.00 (No minimum)"
                  className="cfg-input with-prefix"
                />
              </div>
              <small className="cfg-hint">Cart must reach this subtotal before coupon applies.</small>
            </div>

            <div className="cfg-field">
              <label>Usage Limit (Max Total Redemptions)</label>
              <input
                type="number"
                min="1"
                value={form.maxUses}
                onChange={set('maxUses')}
                placeholder="Leave blank for unlimited"
                className="cfg-input"
              />
              <small className="cfg-hint">Total number of times this coupon can be used across all buyers.</small>
            </div>

            <div className="cfg-field">
              <label>Expiry Date</label>
              <input
                type="date"
                value={form.expiresAt}
                onChange={set('expiresAt')}
                className="cfg-input"
              />
              <small className="cfg-hint">Optional expiration deadline for this promotion.</small>
            </div>

            {/* Live Coupon Badge Preview */}
            <div className="cfg-field cfg-full">
              <div className="coupon-live-ticket-preview">
                <div className="cltp-left">
                  <span className="cltp-tag">PROMOTIONAL VOUCHER PREVIEW</span>
                  <b className="cltp-code">{form.code || 'COUPONCODE'}</b>
                  <p className="cltp-desc">
                    Get {form.value ? (form.type === 'percentage' ? `${form.value}% OFF` : formatMoney(Number(form.value)) + ' OFF') : 'DISCOUNT'}{' '}
                    {form.minOrder > 0 ? `on orders above ${formatMoney(Number(form.minOrder))}` : 'on all store products'}
                  </p>
                </div>
                <div className="cltp-badge">
                  <span>{form.type === 'percentage' ? `${form.value || 0}%` : formatMoney(Number(form.value || 0))}</span>
                  <small>OFF</small>
                </div>
              </div>
            </div>

            <div className="cfg-actions cfg-full">
              <button type="button" className="btn-cancel" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button type="submit" className="seller-btn-pri" disabled={saving}>
                {saving ? 'Creating Promotion...' : 'Publish Discount Coupon'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="seller-loading-state">
          <div className="seller-spinner"></div>
          <span>Loading discount coupons...</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && coupons.length === 0 && !showForm && (
        <div className="seller-card">
          <div className="table-empty-box">
            <div className="empty-icon-circle">🎁</div>
            <h4>No Coupons Created Yet</h4>
            <p>Promotional codes help attract new buyers and boost order volumes. Create your first coupon now!</p>
            <button
              type="button"
              className="seller-btn-pri btn-sm"
              onClick={() => setShowForm(true)}
              style={{ marginTop: 8 }}
            >
              <Ic name="plus" size={15} /> Create First Coupon
            </button>
          </div>
        </div>
      )}

      {/* Coupons Table */}
      {!loading && coupons.length > 0 && (
        <div className="seller-card">
          <div className="seller-card-head">
            <h3>Active Store Coupon Codes</h3>
            <span className="badge-pill">{coupons.length} total promotions</span>
          </div>

          <div className="seller-table-wrap">
            <table className="seller-table">
              <thead>
                <tr>
                  <th>Voucher Code</th>
                  <th>Discount Offer</th>
                  <th>Min Order Spend</th>
                  <th>Usage Volume</th>
                  <th>Expiry Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => (
                  <tr key={c._id}>
                    <td>
                      <div className="coupon-code-cell">
                        <span className="ticket-icon">🎟️</span>
                        <b className="coupon-code-badge">{c.code}</b>
                        <button
                          type="button"
                          className="btn-copy-code"
                          onClick={() => handleCopy(c.code)}
                          title="Copy code to clipboard"
                        >
                          {copiedCode === c.code ? <Ic name="check" size={13} /> : <Ic name="duplicate" size={13} />}
                        </button>
                      </div>
                    </td>
                    <td>
                      <span className="discount-val-pill">
                        {c.type === 'percentage' ? `${c.value}% OFF` : `${formatMoney(c.value)} OFF`}
                      </span>
                    </td>
                    <td>
                      <b>{c.minOrder > 0 ? formatMoney(c.minOrder) : 'No Minimum'}</b>
                    </td>
                    <td>
                      <div className="usage-progress-meta">
                        <span>
                          <b>{c.usedCount || 0}</b> {c.maxUses ? `/ ${c.maxUses}` : 'uses (Unlimited)'}
                        </span>
                        {c.maxUses && (
                          <div className="usage-bar-track">
                            <div
                              className="usage-bar-fill"
                              style={{ width: `${Math.min(100, ((c.usedCount || 0) / c.maxUses) * 100)}%` }}
                            ></div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="expiry-text">
                        {c.expiresAt ? fmtDay(c.expiresAt) : 'Permanent (No Expiry)'}
                      </span>
                    </td>
                    <td>
                      <span className={`status-tag ${c.active ? 'status-delivered' : 'status-cancelled'}`}>
                        {c.active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className={`btn-icon ${c.active ? '' : 'text-green'}`}
                          onClick={() => toggleActive(c)}
                          title={c.active ? 'Disable Coupon' : 'Enable Coupon'}
                        >
                          {c.active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          className="btn-icon text-red"
                          onClick={() => deleteCoupon(c._id, c.code)}
                          title="Delete Coupon"
                        >
                          <Ic name="x" size={14} />
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
