import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { sapi } from '../api.js';
import Ic from '../components/Icons.jsx';

export default function SellerSettings() {
  const { seller, setSeller } = useOutletContext();
  const [form, setForm] = useState({
    storeName: '',
    ownerName: '',
    phone: '',
    description: '',
    address: { street: '', city: '', state: '', country: '' },
    bankDetails: { accountTitle: '', accountNumber: '', bankName: '', iban: '' },
    logo: '',
    banner: '',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (seller) {
      setForm({
        storeName: seller.storeName || '',
        ownerName: seller.ownerName || '',
        phone: seller.phone || '',
        description: seller.description || '',
        address: { ...seller.address },
        bankDetails: { ...seller.bankDetails },
        logo: seller.logo || '',
        banner: seller.banner || '',
      });
    }
  }, [seller]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      const updated = await sapi('/sellers/me', {
        method: 'PUT',
        body: form,
      });
      setSeller(updated);
      setMsg('Store settings updated successfully! ✅');
    } catch (err) {
      alert('Error updating settings: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="seller-settings-page">
      <div className="seller-page-header">
        <div>
          <h2>⚙️ Store Settings & Bank Payout Details</h2>
          <p>Update your business storefront branding, contact information, and bank account for weekly payouts.</p>
        </div>
      </div>

      {msg && <div className="seller-success-alert">{msg}</div>}

      <form onSubmit={handleSave} className="seller-card settings-form">
        <div className="settings-section">
          <h3>🏬 Storefront Information</h3>
          <div className="form-grid-2">
            <label>
              <span>Store Name</span>
              <input
                type="text"
                value={form.storeName}
                onChange={(e) => setForm({ ...form, storeName: e.target.value })}
                required
              />
            </label>
            <label>
              <span>Owner Full Name</span>
              <input
                type="text"
                value={form.ownerName}
                onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                required
              />
            </label>
            <label>
              <span>Contact Phone / WhatsApp</span>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+92 300 1234567"
              />
            </label>
            <label>
              <span>Store Logo Image URL</span>
              <input
                type="text"
                value={form.logo}
                onChange={(e) => setForm({ ...form, logo: e.target.value })}
                placeholder="https://..."
              />
            </label>
            <label className="full-col">
              <span>Store Description (Shown to Customers on PDP)</span>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe your brand and authenticity guarantee..."
              />
            </label>
          </div>
        </div>

        <div className="settings-section">
          <h3>🏦 Bank Account for Weekly Payouts</h3>
          <div className="form-grid-2">
            <label>
              <span>Bank Name</span>
              <input
                type="text"
                value={form.bankDetails?.bankName || ''}
                onChange={(e) => setForm({ ...form, bankDetails: { ...form.bankDetails, bankName: e.target.value } })}
                placeholder="e.g. Meezan Bank, HBL, Bank Alfalah"
              />
            </label>
            <label>
              <span>Account Title</span>
              <input
                type="text"
                value={form.bankDetails?.accountTitle || ''}
                onChange={(e) => setForm({ ...form, bankDetails: { ...form.bankDetails, accountTitle: e.target.value } })}
                placeholder="Full account name"
              />
            </label>
            <label>
              <span>Account Number</span>
              <input
                type="text"
                value={form.bankDetails?.accountNumber || ''}
                onChange={(e) => setForm({ ...form, bankDetails: { ...form.bankDetails, accountNumber: e.target.value } })}
                placeholder="0123456789..."
              />
            </label>
            <label>
              <span>IBAN Number</span>
              <input
                type="text"
                value={form.bankDetails?.iban || ''}
                onChange={(e) => setForm({ ...form, bankDetails: { ...form.bankDetails, iban: e.target.value } })}
                placeholder="PK00MEZN000..."
              />
            </label>
          </div>
        </div>

        <div className="settings-section">
          <h3>📍 Business Address / Dispatch Hub</h3>
          <div className="form-grid-2">
            <label className="full-col">
              <span>Street Address</span>
              <input
                type="text"
                value={form.address?.street || ''}
                onChange={(e) => setForm({ ...form, address: { ...form.address, street: e.target.value } })}
                placeholder="Shop # / Plaza / Building"
              />
            </label>
            <label>
              <span>City</span>
              <input
                type="text"
                value={form.address?.city || ''}
                onChange={(e) => setForm({ ...form, address: { ...form.address, city: e.target.value } })}
                placeholder="Lahore, Karachi, Islamabad"
              />
            </label>
            <label>
              <span>State / Province</span>
              <input
                type="text"
                value={form.address?.state || ''}
                onChange={(e) => setForm({ ...form, address: { ...form.address, state: e.target.value } })}
                placeholder="Punjab, Sindh"
              />
            </label>
          </div>
        </div>

        <div className="settings-footer">
          <button type="submit" className="seller-btn-pri" disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
