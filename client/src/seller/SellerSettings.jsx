import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { sapi } from '../api.js';
import Ic from '../components/Icons.jsx';
import SellerAppModal from '../components/SellerAppModal.jsx';

const INDIAN_BANKS = [
  'State Bank of India (SBI)',
  'HDFC Bank',
  'ICICI Bank',
  'Punjab National Bank (PNB)',
  'Axis Bank',
  'Bank of Baroda (BOB)',
  'Kotak Mahindra Bank',
  'Canara Bank',
  'Union Bank of India',
  'IndusInd Bank',
  'Bank of India (BOI)',
  'Central Bank of India',
  'IDBI Bank',
  'Indian Bank',
  'Yes Bank',
  'IDFC FIRST Bank',
  'Federal Bank',
  'UCO Bank',
  'Indian Overseas Bank',
  'Punjab & Sind Bank',
  'Paytm Payments Bank',
  'Airtel Payments Bank',
  'Jio Payments Bank',
  'Other Indian Scheduled Bank',
];

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
    withdrawalMethods: {
      bankTransfer: {
        enabled: false,
        accountTitle: '',
        accountNumber: '',
        bankName: 'State Bank of India (SBI)',
        ifscCode: '',
        branchName: '',
        accountType: 'Savings',
      },
      upi: { enabled: false, upiId: '', holderName: '' },
      paytm: { enabled: false, phone: '', accountName: '' },
      gpay: { enabled: false, phone: '', upiId: '', accountName: '' },
      phonepe: { enabled: false, phone: '', upiId: '', accountName: '' },
      usdt: { enabled: false, walletAddress: '', network: 'TRC-20' },
    },
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
      const wm = seller.withdrawalMethods || {};
      const legacyBank = seller.bankDetails || {};
      const isBankConfigured = Boolean(wm.bankTransfer?.accountNumber || legacyBank.accountNumber);

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
          accountTitle: legacyBank.accountTitle || '',
          accountNumber: legacyBank.accountNumber || '',
          bankName: legacyBank.bankName || '',
          iban: legacyBank.iban || '',
        },
        withdrawalMethods: {
          bankTransfer: {
            enabled: wm.bankTransfer?.enabled !== undefined ? wm.bankTransfer.enabled : isBankConfigured,
            accountTitle: wm.bankTransfer?.accountTitle || legacyBank.accountTitle || '',
            accountNumber: wm.bankTransfer?.accountNumber || legacyBank.accountNumber || '',
            bankName: wm.bankTransfer?.bankName || legacyBank.bankName || 'State Bank of India (SBI)',
            ifscCode: wm.bankTransfer?.ifscCode || legacyBank.iban || '',
            branchName: wm.bankTransfer?.branchName || '',
            accountType: wm.bankTransfer?.accountType || 'Savings',
          },
          upi: {
            enabled: Boolean(wm.upi?.enabled),
            upiId: wm.upi?.upiId || '',
            holderName: wm.upi?.holderName || '',
          },
          paytm: {
            enabled: Boolean(wm.paytm?.enabled),
            phone: wm.paytm?.phone || '',
            accountName: wm.paytm?.accountName || '',
          },
          gpay: {
            enabled: Boolean(wm.gpay?.enabled),
            phone: wm.gpay?.phone || '',
            upiId: wm.gpay?.upiId || '',
            accountName: wm.gpay?.accountName || '',
          },
          phonepe: {
            enabled: Boolean(wm.phonepe?.enabled),
            phone: wm.phonepe?.phone || '',
            upiId: wm.phonepe?.upiId || '',
            accountName: wm.phonepe?.accountName || '',
          },
          usdt: {
            enabled: Boolean(wm.usdt?.enabled),
            walletAddress: wm.usdt?.walletAddress || '',
            network: wm.usdt?.network || 'TRC-20',
          },
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

        {/* Section 2: Withdrawal Payment Methods (Indian Banks, UPI, Paytm, GPay, PhonePe, USDT) */}
        <div className="settings-card-panel">
          <div className="scp-header">
            <div className="scp-title-wrap">
              <span className="scp-icon-badge">💳</span>
              <div>
                <h3 className="scp-title">Withdrawal Payment Methods (ود ڈرا پیمنٹ میتھڈز)</h3>
                <p className="scp-desc">
                  Configure and save your Indian Bank Accounts, UPI VPAs, Paytm, GPay, and USDT wallets. When enabled, you can select these saved coordinates with 1-click on the Withdrawal page.
                </p>
              </div>
            </div>
          </div>

          <div className="scp-body">
            <div className="withdrawal-methods-config-list">
              {/* Method 1: Indian Bank Transfer */}
              <div className={`wm-method-box ${form.withdrawalMethods?.bankTransfer?.enabled ? 'active' : ''}`}>
                <div className="wm-method-head">
                  <div className="wm-title-box">
                    <span className="wm-icon">🏦</span>
                    <div>
                      <b className="wm-name">Indian Bank Transfer (NEFT / IMPS / RTGS)</b>
                      <small className="wm-sub">Direct bank account settlement across all major Indian scheduled banks.</small>
                    </div>
                  </div>
                  <label className="toggle-switch-wrap">
                    <input
                      type="checkbox"
                      checked={Boolean(form.withdrawalMethods?.bankTransfer?.enabled)}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          withdrawalMethods: {
                            ...prev.withdrawalMethods,
                            bankTransfer: {
                              ...prev.withdrawalMethods?.bankTransfer,
                              enabled: e.target.checked,
                            },
                          },
                        }))
                      }
                    />
                    <span className="toggle-slider"></span>
                    <span className="toggle-label">{form.withdrawalMethods?.bankTransfer?.enabled ? 'Active' : 'Disabled'}</span>
                  </label>
                </div>

                {form.withdrawalMethods?.bankTransfer?.enabled && (
                  <div className="wm-method-fields">
                    <div className="settings-form-grid">
                      <div className="settings-input-group">
                        <label className="sig-label">Account Holder Full Name <span className="sig-req">*</span></label>
                        <div className="sig-field-wrap">
                          <input
                            type="text"
                            value={form.withdrawalMethods?.bankTransfer?.accountTitle || ''}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                withdrawalMethods: {
                                  ...prev.withdrawalMethods,
                                  bankTransfer: { ...prev.withdrawalMethods?.bankTransfer, accountTitle: e.target.value },
                                },
                              }))
                            }
                            placeholder="Full name as printed in bank passbook"
                            className="sig-input"
                            required
                          />
                        </div>
                      </div>

                      <div className="settings-input-group">
                        <label className="sig-label">Select Indian Bank <span className="sig-req">*</span></label>
                        <div className="sig-field-wrap">
                          <select
                            value={form.withdrawalMethods?.bankTransfer?.bankName || 'State Bank of India (SBI)'}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                withdrawalMethods: {
                                  ...prev.withdrawalMethods,
                                  bankTransfer: { ...prev.withdrawalMethods?.bankTransfer, bankName: e.target.value },
                                },
                              }))
                            }
                            className="sig-select"
                            required
                          >
                            {INDIAN_BANKS.map((b) => (
                              <option key={b} value={b}>{b}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="settings-input-group">
                        <label className="sig-label">Bank Account Number <span className="sig-req">*</span></label>
                        <div className="sig-field-wrap">
                          <input
                            type="text"
                            value={form.withdrawalMethods?.bankTransfer?.accountNumber || ''}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                withdrawalMethods: {
                                  ...prev.withdrawalMethods,
                                  bankTransfer: { ...prev.withdrawalMethods?.bankTransfer, accountNumber: e.target.value },
                                },
                              }))
                            }
                            placeholder="e.g. 01234567890123"
                            className="sig-input"
                            required
                          />
                        </div>
                      </div>

                      <div className="settings-input-group">
                        <label className="sig-label">Bank IFSC Code (11 Digits) <span className="sig-req">*</span></label>
                        <div className="sig-field-wrap">
                          <input
                            type="text"
                            value={form.withdrawalMethods?.bankTransfer?.ifscCode || ''}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                withdrawalMethods: {
                                  ...prev.withdrawalMethods,
                                  bankTransfer: { ...prev.withdrawalMethods?.bankTransfer, ifscCode: e.target.value.toUpperCase() },
                                },
                              }))
                            }
                            placeholder="e.g. SBIN0001234 / HDFC0000001"
                            className="sig-input"
                            maxLength={11}
                            style={{ textTransform: 'uppercase', letterSpacing: 1 }}
                            required
                          />
                        </div>
                      </div>

                      <div className="settings-input-group">
                        <label className="sig-label">Branch Name / City</label>
                        <div className="sig-field-wrap">
                          <input
                            type="text"
                            value={form.withdrawalMethods?.bankTransfer?.branchName || ''}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                withdrawalMethods: {
                                  ...prev.withdrawalMethods,
                                  bankTransfer: { ...prev.withdrawalMethods?.bankTransfer, branchName: e.target.value },
                                },
                              }))
                            }
                            placeholder="e.g. Connaught Place / Bandra West"
                            className="sig-input"
                          />
                        </div>
                      </div>

                      <div className="settings-input-group">
                        <label className="sig-label">Account Type</label>
                        <div className="sig-field-wrap">
                          <select
                            value={form.withdrawalMethods?.bankTransfer?.accountType || 'Savings'}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                withdrawalMethods: {
                                  ...prev.withdrawalMethods,
                                  bankTransfer: { ...prev.withdrawalMethods?.bankTransfer, accountType: e.target.value },
                                },
                              }))
                            }
                            className="sig-select"
                          >
                            <option value="Savings">Savings Account</option>
                            <option value="Current">Current / Business Account</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Method 2: UPI (Unified Payments Interface) */}
              <div className={`wm-method-box ${form.withdrawalMethods?.upi?.enabled ? 'active' : ''}`}>
                <div className="wm-method-head">
                  <div className="wm-title-box">
                    <span className="wm-icon">⚡</span>
                    <div>
                      <b className="wm-name">UPI (Unified Payments Interface / VPA)</b>
                      <small className="wm-sub">Instant 24/7 IMPS settlement to any registered VPA handle (@okhdfcbank, @oksbi, @paytm, etc.).</small>
                    </div>
                  </div>
                  <label className="toggle-switch-wrap">
                    <input
                      type="checkbox"
                      checked={Boolean(form.withdrawalMethods?.upi?.enabled)}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          withdrawalMethods: {
                            ...prev.withdrawalMethods,
                            upi: {
                              ...prev.withdrawalMethods?.upi,
                              enabled: e.target.checked,
                            },
                          },
                        }))
                      }
                    />
                    <span className="toggle-slider"></span>
                    <span className="toggle-label">{form.withdrawalMethods?.upi?.enabled ? 'Active' : 'Disabled'}</span>
                  </label>
                </div>

                {form.withdrawalMethods?.upi?.enabled && (
                  <div className="wm-method-fields">
                    <div className="settings-form-grid">
                      <div className="settings-input-group">
                        <label className="sig-label">UPI ID / VPA Address <span className="sig-req">*</span></label>
                        <div className="sig-field-wrap">
                          <input
                            type="text"
                            value={form.withdrawalMethods?.upi?.upiId || ''}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                withdrawalMethods: {
                                  ...prev.withdrawalMethods,
                                  upi: { ...prev.withdrawalMethods?.upi, upiId: e.target.value },
                                },
                              }))
                            }
                            placeholder="e.g. merchant@okhdfcbank or 9876543210@paytm"
                            className="sig-input"
                            required
                          />
                        </div>
                      </div>

                      <div className="settings-input-group">
                        <label className="sig-label">Registered Name on UPI <span className="sig-req">*</span></label>
                        <div className="sig-field-wrap">
                          <input
                            type="text"
                            value={form.withdrawalMethods?.upi?.holderName || ''}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                withdrawalMethods: {
                                  ...prev.withdrawalMethods,
                                  upi: { ...prev.withdrawalMethods?.upi, holderName: e.target.value },
                                },
                              }))
                            }
                            placeholder="Full name registered on UPI app"
                            className="sig-input"
                            required
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Method 3: Paytm */}
              <div className={`wm-method-box ${form.withdrawalMethods?.paytm?.enabled ? 'active' : ''}`}>
                <div className="wm-method-head">
                  <div className="wm-title-box">
                    <span className="wm-icon">📱</span>
                    <div>
                      <b className="wm-name">Paytm Wallet &amp; Payments Bank</b>
                      <small className="wm-sub">Transfer payout to registered Paytm phone number / Payments Bank.</small>
                    </div>
                  </div>
                  <label className="toggle-switch-wrap">
                    <input
                      type="checkbox"
                      checked={Boolean(form.withdrawalMethods?.paytm?.enabled)}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          withdrawalMethods: {
                            ...prev.withdrawalMethods,
                            paytm: {
                              ...prev.withdrawalMethods?.paytm,
                              enabled: e.target.checked,
                            },
                          },
                        }))
                      }
                    />
                    <span className="toggle-slider"></span>
                    <span className="toggle-label">{form.withdrawalMethods?.paytm?.enabled ? 'Active' : 'Disabled'}</span>
                  </label>
                </div>

                {form.withdrawalMethods?.paytm?.enabled && (
                  <div className="wm-method-fields">
                    <div className="settings-form-grid">
                      <div className="settings-input-group">
                        <label className="sig-label">Paytm 10-Digit Mobile Number <span className="sig-req">*</span></label>
                        <div className="sig-field-wrap">
                          <input
                            type="tel"
                            value={form.withdrawalMethods?.paytm?.phone || ''}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                withdrawalMethods: {
                                  ...prev.withdrawalMethods,
                                  paytm: { ...prev.withdrawalMethods?.paytm, phone: e.target.value },
                                },
                              }))
                            }
                            placeholder="e.g. 9876543210"
                            className="sig-input"
                            maxLength={10}
                            required
                          />
                        </div>
                      </div>

                      <div className="settings-input-group">
                        <label className="sig-label">Paytm Account Holder Name</label>
                        <div className="sig-field-wrap">
                          <input
                            type="text"
                            value={form.withdrawalMethods?.paytm?.accountName || ''}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                withdrawalMethods: {
                                  ...prev.withdrawalMethods,
                                  paytm: { ...prev.withdrawalMethods?.paytm, accountName: e.target.value },
                                },
                              }))
                            }
                            placeholder="Name registered on Paytm"
                            className="sig-input"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Method 4: Google Pay (GPay) */}
              <div className={`wm-method-box ${form.withdrawalMethods?.gpay?.enabled ? 'active' : ''}`}>
                <div className="wm-method-head">
                  <div className="wm-title-box">
                    <span className="wm-icon">🔵</span>
                    <div>
                      <b className="wm-name">Google Pay (GPay)</b>
                      <small className="wm-sub">Direct credit to your GPay mobile number or custom Google Pay UPI handle.</small>
                    </div>
                  </div>
                  <label className="toggle-switch-wrap">
                    <input
                      type="checkbox"
                      checked={Boolean(form.withdrawalMethods?.gpay?.enabled)}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          withdrawalMethods: {
                            ...prev.withdrawalMethods,
                            gpay: {
                              ...prev.withdrawalMethods?.gpay,
                              enabled: e.target.checked,
                            },
                          },
                        }))
                      }
                    />
                    <span className="toggle-slider"></span>
                    <span className="toggle-label">{form.withdrawalMethods?.gpay?.enabled ? 'Active' : 'Disabled'}</span>
                  </label>
                </div>

                {form.withdrawalMethods?.gpay?.enabled && (
                  <div className="wm-method-fields">
                    <div className="settings-form-grid">
                      <div className="settings-input-group">
                        <label className="sig-label">GPay Mobile Number / UPI ID <span className="sig-req">*</span></label>
                        <div className="sig-field-wrap">
                          <input
                            type="text"
                            value={form.withdrawalMethods?.gpay?.phone || form.withdrawalMethods?.gpay?.upiId || ''}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                withdrawalMethods: {
                                  ...prev.withdrawalMethods,
                                  gpay: {
                                    ...prev.withdrawalMethods?.gpay,
                                    phone: e.target.value,
                                    upiId: e.target.value.includes('@') ? e.target.value : '',
                                  },
                                },
                              }))
                            }
                            placeholder="e.g. 9876543210 or yourname@oksbi"
                            className="sig-input"
                            required
                          />
                        </div>
                      </div>

                      <div className="settings-input-group">
                        <label className="sig-label">GPay Account Holder Name</label>
                        <div className="sig-field-wrap">
                          <input
                            type="text"
                            value={form.withdrawalMethods?.gpay?.accountName || ''}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                withdrawalMethods: {
                                  ...prev.withdrawalMethods,
                                  gpay: { ...prev.withdrawalMethods?.gpay, accountName: e.target.value },
                                },
                              }))
                            }
                            placeholder="Name registered on Google Pay"
                            className="sig-input"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Method 5: PhonePe */}
              <div className={`wm-method-box ${form.withdrawalMethods?.phonepe?.enabled ? 'active' : ''}`}>
                <div className="wm-method-head">
                  <div className="wm-title-box">
                    <span className="wm-icon">🟣</span>
                    <div>
                      <b className="wm-name">PhonePe</b>
                      <small className="wm-sub">Transfer to registered PhonePe mobile number or @ybl / @ibl UPI handle.</small>
                    </div>
                  </div>
                  <label className="toggle-switch-wrap">
                    <input
                      type="checkbox"
                      checked={Boolean(form.withdrawalMethods?.phonepe?.enabled)}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          withdrawalMethods: {
                            ...prev.withdrawalMethods,
                            phonepe: {
                              ...prev.withdrawalMethods?.phonepe,
                              enabled: e.target.checked,
                            },
                          },
                        }))
                      }
                    />
                    <span className="toggle-slider"></span>
                    <span className="toggle-label">{form.withdrawalMethods?.phonepe?.enabled ? 'Active' : 'Disabled'}</span>
                  </label>
                </div>

                {form.withdrawalMethods?.phonepe?.enabled && (
                  <div className="wm-method-fields">
                    <div className="settings-form-grid">
                      <div className="settings-input-group">
                        <label className="sig-label">PhonePe Mobile Number / UPI ID <span className="sig-req">*</span></label>
                        <div className="sig-field-wrap">
                          <input
                            type="text"
                            value={form.withdrawalMethods?.phonepe?.phone || form.withdrawalMethods?.phonepe?.upiId || ''}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                withdrawalMethods: {
                                  ...prev.withdrawalMethods,
                                  phonepe: {
                                    ...prev.withdrawalMethods?.phonepe,
                                    phone: e.target.value,
                                    upiId: e.target.value.includes('@') ? e.target.value : '',
                                  },
                                },
                              }))
                            }
                            placeholder="e.g. 9876543210 or yourname@ybl"
                            className="sig-input"
                            required
                          />
                        </div>
                      </div>

                      <div className="settings-input-group">
                        <label className="sig-label">PhonePe Account Holder Name</label>
                        <div className="sig-field-wrap">
                          <input
                            type="text"
                            value={form.withdrawalMethods?.phonepe?.accountName || ''}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                withdrawalMethods: {
                                  ...prev.withdrawalMethods,
                                  phonepe: { ...prev.withdrawalMethods?.phonepe, accountName: e.target.value },
                                },
                              }))
                            }
                            placeholder="Name registered on PhonePe"
                            className="sig-input"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Method 6: USDT / Crypto */}
              <div className={`wm-method-box ${form.withdrawalMethods?.usdt?.enabled ? 'active' : ''}`}>
                <div className="wm-method-head">
                  <div className="wm-title-box">
                    <span className="wm-icon">💎</span>
                    <div>
                      <b className="wm-name">USDT (Crypto Stablecoin Payout)</b>
                      <small className="wm-sub">Receive instant USDT payouts via TRC-20 (Tron) or BEP-20 (Binance Smart Chain).</small>
                    </div>
                  </div>
                  <label className="toggle-switch-wrap">
                    <input
                      type="checkbox"
                      checked={Boolean(form.withdrawalMethods?.usdt?.enabled)}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          withdrawalMethods: {
                            ...prev.withdrawalMethods,
                            usdt: {
                              ...prev.withdrawalMethods?.usdt,
                              enabled: e.target.checked,
                            },
                          },
                        }))
                      }
                    />
                    <span className="toggle-slider"></span>
                    <span className="toggle-label">{form.withdrawalMethods?.usdt?.enabled ? 'Active' : 'Disabled'}</span>
                  </label>
                </div>

                {form.withdrawalMethods?.usdt?.enabled && (
                  <div className="wm-method-fields">
                    <div className="settings-form-grid">
                      <div className="settings-input-group">
                        <label className="sig-label">USDT Receiving Address <span className="sig-req">*</span></label>
                        <div className="sig-field-wrap">
                          <input
                            type="text"
                            value={form.withdrawalMethods?.usdt?.walletAddress || ''}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                withdrawalMethods: {
                                  ...prev.withdrawalMethods,
                                  usdt: { ...prev.withdrawalMethods?.usdt, walletAddress: e.target.value },
                                },
                              }))
                            }
                            placeholder="e.g. Txxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                            className="sig-input"
                            required
                          />
                        </div>
                      </div>

                      <div className="settings-input-group">
                        <label className="sig-label">Blockchain Network <span className="sig-req">*</span></label>
                        <div className="sig-field-wrap">
                          <select
                            value={form.withdrawalMethods?.usdt?.network || 'TRC-20'}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                withdrawalMethods: {
                                  ...prev.withdrawalMethods,
                                  usdt: { ...prev.withdrawalMethods?.usdt, network: e.target.value },
                                },
                              }))
                            }
                            className="sig-select"
                            required
                          >
                            <option value="TRC-20">TRON (TRC-20) — Recommended (Fastest &amp; Low Fee)</option>
                            <option value="BEP-20">BNB Smart Chain (BEP-20)</option>
                            <option value="ERC-20">Ethereum (ERC-20)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
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
