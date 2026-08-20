import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { sapi } from '../api.js';
import Ic from '../components/Icons.jsx';
import SellerAppModal from '../components/SellerAppModal.jsx';

export default function SellerSettings() {
  const { seller, setSeller } = useOutletContext();
  const [appModalOpen, setAppModalOpen] = useState(false);
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

  // Password change state
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState({ type: '', text: '' });
  const [showPw, setShowPw] = useState(false);

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

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwMsg({ type: '', text: '' });

    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwMsg({ type: 'error', text: 'New passwords do not match. Please recheck.' });
      return;
    }
    if (pwForm.newPassword.length < 6) {
      setPwMsg({ type: 'error', text: 'New password must be at least 6 characters long.' });
      return;
    }

    setPwSaving(true);
    try {
      const res = await sapi('/sellers/me/change-password', {
        method: 'POST',
        body: {
          currentPassword: pwForm.currentPassword,
          newPassword: pwForm.newPassword,
        },
      });
      setPwMsg({ type: 'success', text: res.message || 'Password changed successfully! ✅' });
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPwMsg({ type: 'error', text: err.message || 'Failed to change password.' });
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="seller-settings-page">
      <div className="seller-page-header">
        <div>
          <h2>⚙️ Store Settings & Profile Management</h2>
          <p>Manage your storefront branding, payout bank account, business address, and security password.</p>
        </div>
      </div>

      {msg && <div className="seller-success-alert">{msg}</div>}

      <form onSubmit={handleSave} className="seller-card settings-form" style={{ marginBottom: 24 }}>
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
                placeholder="e.g. JPMorgan Chase, Bank of America, Barclays"
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
              <span>IBAN / Routing Number</span>
              <input
                type="text"
                value={form.bankDetails?.iban || ''}
                onChange={(e) => setForm({ ...form, bankDetails: { ...form.bankDetails, iban: e.target.value } })}
                placeholder="US00CHAS000..."
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
                placeholder="Building / Suite / Street Address"
              />
            </label>
            <label>
              <span>City</span>
              <input
                type="text"
                value={form.address?.city || ''}
                onChange={(e) => setForm({ ...form, address: { ...form.address, city: e.target.value } })}
                placeholder="San Francisco, New York, London"
              />
            </label>
            <label>
              <span>State / Region</span>
              <input
                type="text"
                value={form.address?.state || ''}
                onChange={(e) => setForm({ ...form, address: { ...form.address, state: e.target.value } })}
                placeholder="California, New York, Texas"
              />
            </label>
          </div>
        </div>

        <div className="settings-footer">
          <button type="submit" className="seller-btn-pri" disabled={saving}>
            {saving ? 'Saving...' : 'Save Storefront Profile'}
          </button>
        </div>
      </form>

      {/* ─── Security & Password Change Card ────────────────────── */}
      <div className="seller-card settings-form">
        <div className="settings-section">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3>🔒 Security & Password Settings</h3>
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              style={{ background: 'transparent', border: 'none', color: '#0284c7', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <Ic name="eye" size={15} /> {showPw ? 'Hide Passwords' : 'Show Passwords'}
            </button>
          </div>

          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
            Keep your vendor account secure by updating your password regularly.
          </p>

          {pwMsg.text && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                marginBottom: 16,
                fontSize: 13,
                fontWeight: 600,
                background: pwMsg.type === 'success' ? '#dcfce7' : '#fee2e2',
                color: pwMsg.type === 'success' ? '#166534' : '#991b1b',
                border: `1px solid ${pwMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Ic name={pwMsg.type === 'success' ? 'badgeCheck' : 'alert'} size={16} />
              {pwMsg.text}
            </div>
          )}

          <form onSubmit={handlePasswordChange}>
            <div className="form-grid-2">
              <label className="full-col">
                <span>Current Account Password</span>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={pwForm.currentPassword}
                  onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                  placeholder="Enter your existing password"
                  required
                />
              </label>

              <label>
                <span>New Password</span>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={pwForm.newPassword}
                  onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                />
              </label>

              <label>
                <span>Confirm New Password</span>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={pwForm.confirmPassword}
                  onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
                  placeholder="Re-enter new password"
                  required
                  minLength={6}
                />
              </label>
            </div>

            <div className="settings-footer" style={{ marginTop: 20 }}>
              <button
                type="submit"
                className="seller-btn-pri"
                style={{ background: '#0f172a', color: '#fff' }}
                disabled={pwSaving}
              >
                <Ic name="shield" size={15} /> {pwSaving ? 'Updating Password...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ─── Mobile App & PWA Installation Card ─────────────────── */}
      <div className="seller-card settings-form" style={{ marginTop: 24 }}>
        <div className="settings-section">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3>📱 Bazario Merchant Mobile App</h3>
            <span className="app-badge-new">OFFICIAL APP</span>
          </div>

          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
            Set up the official Bazario Seller App on your Android or iPhone device for push notifications, instant order management, and live chat.
          </p>

          <div className="app-settings-grid">
            <div className="app-settings-item">
              <div className="asi-icon">🤖</div>
              <div className="asi-content">
                <b>Android Mobile App (APK &amp; PWA)</b>
                <span>1-Click direct install or standalone APK package.</span>
              </div>
              <button
                type="button"
                className="seller-btn-pri"
                style={{ padding: '8px 14px', fontSize: 12 }}
                onClick={() => setAppModalOpen(true)}
              >
                <Ic name="download" size={14} /> Android Setup
              </button>
            </div>

            <div className="app-settings-item">
              <div className="asi-icon">🍎</div>
              <div className="asi-content">
                <b>iPhone &amp; iPad (iOS Safari)</b>
                <span>Add directly to your iOS Home Screen in 2 simple taps.</span>
              </div>
              <button
                type="button"
                className="seller-btn-sec"
                style={{ padding: '8px 14px', fontSize: 12 }}
                onClick={() => setAppModalOpen(true)}
              >
                <Ic name="eye" size={14} /> iOS Guide
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Seller Central App Setup & APK Installer Modal */}
      <SellerAppModal isOpen={appModalOpen} onClose={() => setAppModalOpen(false)} />
    </div>
  );
}
