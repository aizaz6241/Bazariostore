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
  const [msg, setMsg] = useState({ type: '', text: '' });

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
        address: {
          street: seller.address?.street || '',
          city: seller.address?.city || '',
          state: seller.address?.state || '',
          country: seller.address?.country || '',
        },
        bankDetails: {
          accountTitle: seller.bankDetails?.accountTitle || '',
          accountNumber: seller.bankDetails?.accountNumber || '',
          bankName: seller.bankDetails?.bankName || '',
          iban: seller.bankDetails?.iban || '',
        },
        logo: seller.logo || '',
        banner: seller.banner || '',
      });
    }
  }, [seller]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg({ type: '', text: '' });
    try {
      const updated = await sapi('/sellers/me', {
        method: 'PUT',
        body: form,
      });
      setSeller(updated);
      setMsg({ type: 'success', text: 'Store profile & banking settings updated successfully! ✅' });
      setTimeout(() => setMsg({ type: '', text: '' }), 5000);
    } catch (err) {
      setMsg({ type: 'error', text: 'Failed to update settings: ' + err.message });
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
      setTimeout(() => setPwMsg({ type: '', text: '' }), 5000);
    } catch (err) {
      setPwMsg({ type: 'error', text: err.message || 'Failed to change password.' });
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="seller-settings-page-wrap">
      {/* Top Banner Header */}
      <div className="settings-hero-header">
        <div className="shh-left">
          <div className="shh-icon-box">
            <Ic name="gear" size={24} stroke={2} />
          </div>
          <div>
            <h1 className="shh-title">Store Profile & Settings</h1>
            <p className="shh-subtitle">
              Manage your merchant storefront details, payout bank accounts, warehouse dispatch location, and password security.
            </p>
          </div>
        </div>
        <div className="shh-badge-box">
          <span className="shh-status-pill">
            <span className="shh-online-dot"></span>
            {seller?.storeName || 'Active Merchant'}
          </span>
        </div>
      </div>

      {/* Global Alerts */}
      {msg.text && (
        <div className={`settings-alert-banner ${msg.type === 'success' ? 'alert-success' : 'alert-danger'}`}>
          <Ic name={msg.type === 'success' ? 'badgeCheck' : 'alert'} size={18} />
          <span>{msg.text}</span>
        </div>
      )}

      {/* Main Profile Form */}
      <form onSubmit={handleSave} className="settings-main-form">
        {/* Section 1: Storefront Branding */}
        <div className="settings-card-panel">
          <div className="scp-header">
            <div className="scp-title-wrap">
              <span className="scp-icon-badge">🏬</span>
              <div>
                <h3 className="scp-title">Storefront Branding & Identity</h3>
                <p className="scp-desc">How your business name and authenticity details appear to customers across Bazario.</p>
              </div>
            </div>
          </div>

          <div className="scp-body">
            {/* Live Logo Preview if available */}
            {form.logo && (
              <div className="settings-logo-preview-box">
                <img src={form.logo} alt="Store Logo" className="slp-img" onError={(e) => (e.target.style.display = 'none')} />
                <div>
                  <b className="slp-name">{form.storeName || 'Your Store'}</b>
                  <small className="slp-sub">Live storefront logo badge preview</small>
                </div>
              </div>
            )}

            <div className="settings-form-grid">
              <div className="settings-input-group">
                <label className="sig-label">
                  Store Display Name <span className="sig-req">*</span>
                </label>
                <div className="sig-field-wrap">
                  <input
                    type="text"
                    value={form.storeName}
                    onChange={(e) => setForm({ ...form, storeName: e.target.value })}
                    placeholder="e.g. Nayab Glow Official"
                    className="sig-input"
                    required
                  />
                </div>
                <span className="sig-hint">This name is shown on product cards, invoices, and customer receipts.</span>
              </div>

              <div className="settings-input-group">
                <label className="sig-label">
                  Owner / Representative Full Name <span className="sig-req">*</span>
                </label>
                <div className="sig-field-wrap">
                  <input
                    type="text"
                    value={form.ownerName}
                    onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                    placeholder="e.g. Aizaz Ahmad"
                    className="sig-input"
                    required
                  />
                </div>
                <span className="sig-hint">Used for official account verification and Super Admin communication.</span>
              </div>

              <div className="settings-input-group">
                <label className="sig-label">Contact Phone / WhatsApp</label>
                <div className="sig-field-wrap">
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+92 300 1234567"
                    className="sig-input"
                  />
                </div>
                <span className="sig-hint">Used by the dispatch courier team for parcel coordination.</span>
              </div>

              <div className="settings-input-group">
                <label className="sig-label">Store Logo Image Link (URL)</label>
                <div className="sig-field-wrap">
                  <input
                    type="text"
                    value={form.logo}
                    onChange={(e) => setForm({ ...form, logo: e.target.value })}
                    placeholder="https://..."
                    className="sig-input"
                  />
                </div>
                <span className="sig-hint">Square image recommended (200x200 PNG or JPEG).</span>
              </div>

              <div className="settings-input-group full-width">
                <label className="sig-label">Store Description & Guarantee</label>
                <div className="sig-field-wrap">
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Tell buyers about your product quality, genuine packaging, and dispatch speed..."
                    className="sig-textarea"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Payout Banking */}
        <div className="settings-card-panel">
          <div className="scp-header">
            <div className="scp-title-wrap">
              <span className="scp-icon-badge">🏦</span>
              <div>
                <h3 className="scp-title">Bank Account for Weekly Payouts</h3>
                <p className="scp-desc">Withdrawals and order profits are transferred to these registered bank coordinates.</p>
              </div>
            </div>
          </div>

          <div className="scp-body">
            <div className="settings-form-grid">
              <div className="settings-input-group">
                <label className="sig-label">Bank Name</label>
                <div className="sig-field-wrap">
                  <input
                    type="text"
                    value={form.bankDetails?.bankName || ''}
                    onChange={(e) => setForm({ ...form, bankDetails: { ...form.bankDetails, bankName: e.target.value } })}
                    placeholder="e.g. JPMorgan Chase, Bank of America, HBL, Meezan"
                    className="sig-input"
                  />
                </div>
              </div>

              <div className="settings-input-group">
                <label className="sig-label">Account Title / Beneficiary Name</label>
                <div className="sig-field-wrap">
                  <input
                    type="text"
                    value={form.bankDetails?.accountTitle || ''}
                    onChange={(e) => setForm({ ...form, bankDetails: { ...form.bankDetails, accountTitle: e.target.value } })}
                    placeholder="Full account name exactly as in bank"
                    className="sig-input"
                  />
                </div>
              </div>

              <div className="settings-input-group">
                <label className="sig-label">Account Number</label>
                <div className="sig-field-wrap">
                  <input
                    type="text"
                    value={form.bankDetails?.accountNumber || ''}
                    onChange={(e) => setForm({ ...form, bankDetails: { ...form.bankDetails, accountNumber: e.target.value } })}
                    placeholder="01234567890123"
                    className="sig-input"
                  />
                </div>
              </div>

              <div className="settings-input-group">
                <label className="sig-label">IBAN / Routing Code</label>
                <div className="sig-field-wrap">
                  <input
                    type="text"
                    value={form.bankDetails?.iban || ''}
                    onChange={(e) => setForm({ ...form, bankDetails: { ...form.bankDetails, iban: e.target.value } })}
                    placeholder="US00CHAS000123456789..."
                    className="sig-input"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Dispatch Warehouse Address */}
        <div className="settings-card-panel">
          <div className="scp-header">
            <div className="scp-title-wrap">
              <span className="scp-icon-badge">📍</span>
              <div>
                <h3 className="scp-title">Business Dispatch Address & Hub</h3>
                <p className="scp-desc">Origin pickup address for courier delivery and returned package handling.</p>
              </div>
            </div>
          </div>

          <div className="scp-body">
            <div className="settings-form-grid">
              <div className="settings-input-group full-width">
                <label className="sig-label">Street Address / Suite</label>
                <div className="sig-field-wrap">
                  <input
                    type="text"
                    value={form.address?.street || ''}
                    onChange={(e) => setForm({ ...form, address: { ...form.address, street: e.target.value } })}
                    placeholder="Warehouse / Building / Street Address"
                    className="sig-input"
                  />
                </div>
              </div>

              <div className="settings-input-group">
                <label className="sig-label">City</label>
                <div className="sig-field-wrap">
                  <input
                    type="text"
                    value={form.address?.city || ''}
                    onChange={(e) => setForm({ ...form, address: { ...form.address, city: e.target.value } })}
                    placeholder="e.g. Lahore, Karachi, San Francisco"
                    className="sig-input"
                  />
                </div>
              </div>

              <div className="settings-input-group">
                <label className="sig-label">State / Region / Province</label>
                <div className="sig-field-wrap">
                  <input
                    type="text"
                    value={form.address?.state || ''}
                    onChange={(e) => setForm({ ...form, address: { ...form.address, state: e.target.value } })}
                    placeholder="e.g. Punjab, Sindh, California"
                    className="sig-input"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Form Save Button */}
          <div className="scp-footer">
            <button type="submit" className="settings-save-btn" disabled={saving}>
              {saving ? (
                <>
                  <span className="btn-spinner" /> Saving Changes...
                </>
              ) : (
                <>
                  <Ic name="badgeCheck" size={17} /> Save Storefront & Banking Settings
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Section 4: Security & Password Management */}
      <div className="settings-card-panel">
        <div className="scp-header">
          <div className="scp-title-wrap">
            <span className="scp-icon-badge">🔒</span>
            <div>
              <h3 className="scp-title">Security & Password Management</h3>
              <p className="scp-desc">Protect your vendor account credentials by choosing a strong password.</p>
            </div>
          </div>
          <button
            type="button"
            className="settings-pw-toggle-btn"
            onClick={() => setShowPw(!showPw)}
            title={showPw ? 'Hide password characters' : 'Show password characters'}
          >
            <Ic name="eye" size={15} />
            <span>{showPw ? 'Hide Passwords' : 'Show Passwords'}</span>
          </button>
        </div>

        <div className="scp-body">
          {pwMsg.text && (
            <div className={`settings-alert-banner ${pwMsg.type === 'success' ? 'alert-success' : 'alert-danger'}`}>
              <Ic name={pwMsg.type === 'success' ? 'badgeCheck' : 'alert'} size={17} />
              <span>{pwMsg.text}</span>
            </div>
          )}

          <form onSubmit={handlePasswordChange}>
            <div className="settings-form-grid">
              <div className="settings-input-group full-width">
                <label className="sig-label">
                  Current Password <span className="sig-req">*</span>
                </label>
                <div className="sig-field-wrap">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={pwForm.currentPassword}
                    onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                    placeholder="Enter your current password"
                    className="sig-input"
                    required
                  />
                </div>
              </div>

              <div className="settings-input-group">
                <label className="sig-label">
                  New Password <span className="sig-req">*</span>
                </label>
                <div className="sig-field-wrap">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={pwForm.newPassword}
                    onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                    placeholder="Minimum 6 characters"
                    className="sig-input"
                    required
                    minLength={6}
                  />
                </div>
              </div>

              <div className="settings-input-group">
                <label className="sig-label">
                  Confirm New Password <span className="sig-req">*</span>
                </label>
                <div className="sig-field-wrap">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={pwForm.confirmPassword}
                    onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
                    placeholder="Re-enter new password"
                    className="sig-input"
                    required
                    minLength={6}
                  />
                </div>
              </div>
            </div>

            <div className="scp-footer">
              <button type="submit" className="settings-pw-btn" disabled={pwSaving}>
                {pwSaving ? (
                  <>
                    <span className="btn-spinner" /> Updating Password...
                  </>
                ) : (
                  <>
                    <Ic name="shield" size={16} /> Update Account Password
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Section 5: Mobile App Setup */}
      <div className="settings-card-panel">
        <div className="scp-header">
          <div className="scp-title-wrap">
            <span className="scp-icon-badge">📱</span>
            <div>
              <h3 className="scp-title">Official Merchant Mobile App</h3>
              <p className="scp-desc">Install the Bazario Merchant App on your phone for instant order dispatch and push alerts.</p>
            </div>
          </div>
          <span className="app-badge-official">OFFICIAL PWA & APK</span>
        </div>

        <div className="scp-body">
          <div className="app-settings-grid-new">
            <div className="app-card-item">
              <div className="aci-top">
                <div className="aci-os-icon">🤖</div>
                <div className="aci-info">
                  <b className="aci-title">Android Phone & Tablet</b>
                  <p className="aci-desc">Instant 1-tap installation directly from browser or download standalone APK.</p>
                </div>
              </div>
              <button type="button" className="aci-btn aci-btn-android" onClick={() => setAppModalOpen(true)}>
                <Ic name="download" size={15} /> Android Setup & Install
              </button>
            </div>

            <div className="app-card-item">
              <div className="aci-top">
                <div className="aci-os-icon">🍎</div>
                <div className="aci-info">
                  <b className="aci-title">Apple iPhone & iPad (iOS Safari)</b>
                  <p className="aci-desc">Add directly to your iPhone Home Screen for a native standalone app experience.</p>
                </div>
              </div>
              <button type="button" className="aci-btn aci-btn-ios" onClick={() => setAppModalOpen(true)}>
                <Ic name="eye" size={15} /> View 2-Step iOS Guide
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Guide */}
      <SellerAppModal isOpen={appModalOpen} onClose={() => setAppModalOpen(false)} />
    </div>
  );
}
