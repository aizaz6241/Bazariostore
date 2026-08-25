import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Ic from '../components/Icons.jsx';
import OtpVerificationModal from '../components/OtpVerificationModal.jsx';

export default function SellerLogin() {
  const navigate = useNavigate();
  const { loginSeller } = useAuth();
  const [params] = useSearchParams();
  const urlResetToken = params.get('resetToken') || '';
  const urlEmail = params.get('email') || '';

  const [mode, setMode] = useState('login'); // 'login' | 'register'
  
  // Login State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Registration OTP State
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);

  // Forgot Password Modal State
  const [forgotModalOpen, setForgotModalOpen] = useState(Boolean(urlResetToken));
  const [forgotStep, setForgotStep] = useState(urlResetToken ? 'reset' : 'request'); // 'request' | 'reset'
  const [forgotEmail, setForgotEmail] = useState(urlEmail);
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotErr, setForgotErr] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  // Register State
  const [regForm, setRegForm] = useState({
    storeName: '',
    ownerName: '',
    email: '',
    phone: '',
    password: '',
    referralCode: '',
    idDocument: '',
    passportDocument: '',
    bankStatementDocument: '',
    description: '',
  });

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setSuccessMsg('');
    setLoading(true);
    try {
      const data = await api('/sellers/login', {
        method: 'POST',
        body: { email: email.trim(), password },
      });
      loginSeller(data.token, data.seller);
      navigate('/seller');
    } catch (e) {
      setErr(e.message || 'Login failed. Please check your business email and password.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (field) => (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      return alert('File size exceeds 5MB limit.');
    }
    const reader = new FileReader();
    reader.onload = () => {
      setRegForm((prev) => ({ ...prev, [field]: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setErr('');
    setSuccessMsg('');
    setLoading(true);
    try {
      // Step 1: Send OTP to verify business email
      await api('/sellers/send-otp', {
        method: 'POST',
        body: { email: regForm.email, ownerName: regForm.ownerName },
      });
      setOtpModalOpen(true);
    } catch (e) {
      setErr(e.message || 'Failed to send verification code. Please check your email.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySellerOtp = async (otpString) => {
    setOtpBusy(true);
    try {
      // Step 2: Verify OTP
      await api('/sellers/verify-otp', {
        method: 'POST',
        body: { email: regForm.email, otp: otpString },
      });

      // Step 3: Complete registration with verified OTP
      const res = await api('/sellers/register', {
        method: 'POST',
        body: { ...regForm, otp: otpString },
      });

      setOtpModalOpen(false);
      setSuccessMsg(res?.message || '🎉 Application submitted successfully! Platform Admin will review your KYC documents and approve your account.');
      setMode('login');
      setRegForm({
        storeName: '',
        ownerName: '',
        email: '',
        phone: '',
        password: '',
        referralCode: '',
        idDocument: '',
        passportDocument: '',
        bankStatementDocument: '',
        description: '',
      });
    } finally {
      setOtpBusy(false);
    }
  };

  const handleResendSellerOtp = async () => {
    await api('/sellers/send-otp', {
      method: 'POST',
      body: { email: regForm.email, ownerName: regForm.ownerName },
    });
  };

  const handleSendRecoveryEmail = async (e) => {
    e.preventDefault();
    setForgotErr('');
    setForgotSuccess('');
    setForgotBusy(true);
    try {
      const res = await api('/sellers/forgot-password', {
        method: 'POST',
        body: { email: forgotEmail.trim() },
      });
      setForgotSuccess(res.message || 'Recovery instructions sent!');
      setForgotStep('reset');
    } catch (err) {
      setForgotErr(err.message || 'Failed to send recovery email.');
    } finally {
      setForgotBusy(false);
    }
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    if (forgotNewPassword !== forgotConfirmPassword) {
      return setForgotErr('Passwords do not match');
    }
    setForgotErr('');
    setForgotSuccess('');
    setForgotBusy(true);
    try {
      const payload = {
        password: forgotNewPassword,
        ...(urlResetToken ? { token: urlResetToken } : { email: forgotEmail.trim(), otp: forgotOtp.trim() }),
      };
      const res = await api('/sellers/reset-password', {
        method: 'POST',
        body: payload,
      });
      setForgotSuccess(res.message || 'Password updated successfully! You can now log in.');
      setTimeout(() => {
        setForgotModalOpen(false);
        setMode('login');
        setEmail(forgotEmail);
      }, 1500);
    } catch (err) {
      setForgotErr(err.message || 'Failed to reset password.');
    } finally {
      setForgotBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="card auth-card" style={{ maxWidth: mode === 'register' ? 560 : 440 }}>
        {/* Brand & Badge */}
        <div className="seller-auth-brand">
          <div className="amazon-logo-seller">
            <span className="brand-prime" style={{ fontWeight: 900, letterSpacing: '-1px', color: '#0f172a' }}>Bazario</span>
            <span className="brand-hub" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>Seller Hub</span>
          </div>
          <p className="seller-auth-sub">Manage your products, orders, payouts &amp; store growth</p>
        </div>

        {/* Role / Portal Switcher Tabs */}
        <div className="login-portal-tabs">
          <Link to="/login" className="portal-tab">
            <Ic name="user" size={15} /> Customer
          </Link>
          <Link to="/seller/login" className="portal-tab active">
            <Ic name="tag" size={15} /> Seller Hub
          </Link>
          <Link to="/admin/login" className="portal-tab">
            <Ic name="shield" size={15} /> Super Admin
          </Link>
        </div>

        {/* Login / Register Toggle */}
        <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 8, padding: 3, marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => { setMode('login'); setErr(''); }}
            style={{
              flex: 1,
              padding: '8px 12px',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              background: mode === 'login' ? '#ffffff' : 'transparent',
              color: mode === 'login' ? '#0f172a' : '#64748b',
              boxShadow: mode === 'login' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            🔑 Merchant Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setErr(''); }}
            style={{
              flex: 1,
              padding: '8px 12px',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              background: mode === 'register' ? '#ffffff' : 'transparent',
              color: mode === 'register' ? '#0f172a' : '#64748b',
              boxShadow: mode === 'register' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            📝 Register as Seller
          </button>
        </div>

        {successMsg && (
          <div className="alert-success" style={{ marginBottom: 16 }}>
            <Ic name="checkCircle" size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {err && (
          <div className="alert-error" style={{ marginBottom: 16 }}>
            <Ic name="shield" size={16} />
            <span>{err}</span>
          </div>
        )}

        {mode === 'login' ? (
          <form onSubmit={submit} className="auth-form-clean">
            <div className="field">
              <label>Business Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seller@yourstore.com"
                required
                autoFocus
                autoComplete="email"
              />
            </div>

            <div className="field">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <label style={{ margin: 0 }}>Password</label>
                <button
                  type="button"
                  onClick={() => setForgotModalOpen(true)}
                  style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}
                >
                  Forgot password?
                </button>
              </div>
              <div className="pw-wrap" style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  className="pw-eye"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Ic name="eye" size={16} />
                </button>
              </div>
            </div>

            <button type="submit" className="btn-primary btn-block btn-auth-submit" disabled={loading}>
              {loading ? 'Signing in…' : 'SIGN IN TO SELLER CENTRAL →'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="auth-form-clean">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field">
                <label>Store / Business Name *</label>
                <input
                  type="text"
                  value={regForm.storeName}
                  onChange={(e) => setRegForm({ ...regForm, storeName: e.target.value })}
                  placeholder="e.g. Apex Electronics"
                  required
                />
              </div>
              <div className="field">
                <label>Owner Full Name *</label>
                <input
                  type="text"
                  value={regForm.ownerName}
                  onChange={(e) => setRegForm({ ...regForm, ownerName: e.target.value })}
                  placeholder="e.g. John Doe"
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field">
                <label>Business Email *</label>
                <input
                  type="email"
                  value={regForm.email}
                  onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                  placeholder="owner@domain.com"
                  required
                />
              </div>
              <div className="field">
                <label>Phone / WhatsApp *</label>
                <input
                  type="text"
                  value={regForm.phone}
                  onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                  placeholder="+91 9876543210"
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field">
                <label>Account Password *</label>
                <input
                  type="password"
                  value={regForm.password}
                  onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                  placeholder="Min 6 characters"
                  minLength={6}
                  required
                />
              </div>
              <div className="field">
                <label>Admin Referral Code (Optional)</label>
                <input
                  type="text"
                  value={regForm.referralCode}
                  onChange={(e) => setRegForm({ ...regForm, referralCode: e.target.value.toUpperCase() })}
                  placeholder="e.g. BAZARIO2026"
                />
              </div>
            </div>

            {/* KYC Documents Upload Section */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
              <b style={{ fontSize: 12.5, color: '#0f172a', display: 'block', marginBottom: 8 }}>
                📑 KYC &amp; Verification Documents (ID / Passport / Bank Statement)
              </b>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4, fontWeight: 700 }}>1. National ID / Aadhaar / DL</label>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleFileUpload('idDocument')}
                    style={{ fontSize: 11, width: '100%' }}
                  />
                  {regForm.idDocument && <small style={{ color: '#16a34a', display: 'block', fontWeight: 700, marginTop: 2 }}>✓ ID Attached</small>}
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4, fontWeight: 700 }}>2. Passport / Address Proof</label>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleFileUpload('passportDocument')}
                    style={{ fontSize: 11, width: '100%' }}
                  />
                  {regForm.passportDocument && <small style={{ color: '#16a34a', display: 'block', fontWeight: 700, marginTop: 2 }}>✓ Passport Attached</small>}
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4, fontWeight: 700 }}>3. Bank Statement / Proof</label>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleFileUpload('bankStatementDocument')}
                    style={{ fontSize: 11, width: '100%' }}
                  />
                  {regForm.bankStatementDocument && <small style={{ color: '#16a34a', display: 'block', fontWeight: 700, marginTop: 2 }}>✓ Statement Attached</small>}
                </div>
              </div>
            </div>

            <button type="submit" className="btn-primary btn-block btn-auth-submit" disabled={loading}>
              {loading ? 'Submitting Application…' : 'SUBMIT SELLER REGISTRATION →'}
            </button>
          </form>
        )}

        <div className="auth-links" style={{ justifyContent: 'center', marginTop: 16, textAlign: 'center' }}>
          <span style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.4 }}>
            Questions about onboarding? Chat with our 24/7 Support.
          </span>
        </div>

        {/* Compact Quick Portal Links */}
        <div className="auth-quick-portals">
          <span className="aqp-label">Looking for other portals?</span>
          <div className="aqp-links">
            <Link to="/login" className="aqp-pill customer-pill">
              <Ic name="user" size={13} /> Customer Sign In
            </Link>
            <Link to="/admin/login" className="aqp-pill admin-pill">
              <Ic name="shield" size={13} /> Super Admin
            </Link>
          </div>
        </div>
      </div>

      {/* Interactive Seller Password Recovery Modal */}
      {forgotModalOpen && (
        <div className="seller-modal-overlay" onClick={() => setForgotModalOpen(false)} style={{ zIndex: 9999 }}>
          <div className="seller-modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, padding: '24px 26px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 12, borderBottom: '1.5px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 22 }}>🔑</span>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: '#0f172a' }}>
                  {forgotStep === 'request' ? 'Seller Password Recovery' : 'Set New Seller Password'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setForgotModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}
              >
                <Ic name="x" size={18} />
              </button>
            </div>

            {forgotErr && (
              <div className="alert-error" style={{ marginBottom: 14 }}>
                <Ic name="shield" size={15} />
                <span>{forgotErr}</span>
              </div>
            )}

            {forgotSuccess && (
              <div className="alert-success" style={{ marginBottom: 14 }}>
                <Ic name="checkCircle" size={15} />
                <span>{forgotSuccess}</span>
              </div>
            )}

            {forgotStep === 'request' ? (
              <form onSubmit={handleSendRecoveryEmail} className="auth-form-clean">
                <p style={{ fontSize: 13, color: '#475569', marginTop: 0, lineHeight: 1.5 }}>
                  Enter your registered business email address. We will send a secure 6-digit recovery code and reset link.
                </p>
                <div className="field">
                  <label>Business Email Address *</label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="seller@yourstore.com"
                    required
                    autoFocus
                  />
                </div>
                <button type="submit" className="btn-primary btn-block btn-auth-submit" disabled={forgotBusy}>
                  {forgotBusy ? 'Sending Recovery Email…' : 'SEND 6-DIGIT RECOVERY CODE →'}
                </button>
                <div style={{ textAlign: 'center', marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={() => setForgotStep('reset')}
                    style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Already have a 6-digit code? Click here to reset →
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleResetPasswordSubmit} className="auth-form-clean">
                {!urlResetToken && (
                  <>
                    <div className="field">
                      <label>Business Email Address *</label>
                      <input
                        type="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="seller@yourstore.com"
                        required
                      />
                    </div>
                    <div className="field">
                      <label>6-Digit Verification Code (From Email) *</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={forgotOtp}
                        onChange={(e) => setForgotOtp(e.target.value)}
                        placeholder="e.g. 849201"
                        required
                        autoFocus
                      />
                    </div>
                  </>
                )}

                <div className="field">
                  <label>New Password *</label>
                  <input
                    type="password"
                    value={forgotNewPassword}
                    onChange={(e) => setForgotNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    minLength={6}
                    required
                  />
                </div>

                <div className="field">
                  <label>Confirm New Password *</label>
                  <input
                    type="password"
                    value={forgotConfirmPassword}
                    onChange={(e) => setForgotConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    minLength={6}
                    required
                  />
                </div>

                <button type="submit" className="btn-primary btn-block btn-auth-submit" disabled={forgotBusy}>
                  {forgotBusy ? 'Updating Password…' : 'RESET SELLER PASSWORD & SIGN IN →'}
                </button>

                <div style={{ textAlign: 'center', marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={() => setForgotStep('request')}
                    style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    ← Back to request code
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Seller Registration OTP Verification Modal */}
      <OtpVerificationModal
        isOpen={otpModalOpen}
        onClose={() => setOtpModalOpen(false)}
        email={regForm.email}
        title="Verify Business Email"
        subtitle="To secure your merchant account, please enter the 6-digit code sent to"
        onVerify={handleVerifySellerOtp}
        onResend={handleResendSellerOtp}
        busy={otpBusy}
      />
    </div>
  );
}
