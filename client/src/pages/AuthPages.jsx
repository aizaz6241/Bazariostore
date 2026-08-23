import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Ic from '../components/Icons.jsx';
import OtpVerificationModal from '../components/OtpVerificationModal.jsx';

function AuthShell({ title, sub, children }) {
  return (
    <div className="auth-page">
      <div className="card auth-card">
        <div className="seller-auth-brand">
          <div className="amazon-logo-seller">
            <span className="brand-prime" style={{ fontWeight: 900, letterSpacing: '-1px', color: '#0f172a' }}>Bazario</span>
            <span className="brand-hub" style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}>Customer</span>
          </div>
          <p className="seller-auth-sub">{sub || 'Manage your account, order tracking & fast checkout'}</p>
        </div>

        {/* Role / Portal Switcher Tabs */}
        <div className="login-portal-tabs">
          <Link to="/login" className="portal-tab active">
            <Ic name="user" size={15} /> Customer
          </Link>
          <Link to="/seller/login" className="portal-tab">
            <Ic name="tag" size={15} /> Seller Hub
          </Link>
          <Link to="/admin/login" className="portal-tab">
            <Ic name="shield" size={15} /> Super Admin
          </Link>
        </div>

        {children}
      </div>
    </div>
  );
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api('/user/login', { method: 'POST', body: { email, password } });
      login(d.token, d.user);
      navigate(params.get('next') || '/account');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Sign In" sub="Sign in to your customer account">
      <form onSubmit={submit} className="auth-form-clean">
        {error && <div className="alert-error"><Ic name="x" size={14} /> {error}</div>}
        <div className="field">
          <label>Email Address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoFocus
          />
        </div>
        <div className="field">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <label style={{ margin: 0 }}>Password</label>
            <Link to="/forgot-password" style={{ fontSize: 12, fontWeight: 600, color: '#2563eb' }}>Forgot password?</Link>
          </div>
          <div className="pw-wrap" style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{ paddingRight: 38 }}
            />
            <button
              type="button"
              className="pw-eye"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
            >
              <Ic name="eye" size={16} />
            </button>
          </div>
        </div>
        <button className="btn-primary btn-block btn-auth-submit" disabled={busy}>
          {busy ? 'Signing in…' : 'SIGN IN AS CUSTOMER →'}
        </button>
      </form>

      <div className="auth-links" style={{ justifyContent: 'center', marginTop: 16 }}>
        <span>New customer? <Link to="/register" style={{ fontWeight: 700, color: '#2563eb' }}>Create an account</Link></span>
      </div>

      {/* Compact Quick Portal Links */}
      <div className="auth-quick-portals">
        <span className="aqp-label">Looking for other portals?</span>
        <div className="aqp-links">
          <Link to="/seller/login" className="aqp-pill seller-pill">
            <Ic name="tag" size={13} /> Seller Central
          </Link>
          <Link to="/admin/login" className="aqp-pill admin-pill">
            <Ic name="shield" size={13} /> Super Admin
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}

export function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api('/user/register', { method: 'POST', body: form });
      if (res.requiresOtp) {
        setOtpModalOpen(true);
      } else if (res.token) {
        login(res.token, res.user);
        navigate('/account');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async (otpString) => {
    setOtpBusy(true);
    try {
      const res = await api('/user/verify-otp', {
        method: 'POST',
        body: { email: form.email, otp: otpString },
      });
      login(res.token, res.user);
      setOtpModalOpen(false);
      navigate('/account');
    } finally {
      setOtpBusy(false);
    }
  };

  const handleResendOtp = async () => {
    await api('/user/send-otp', {
      method: 'POST',
      body: { email: form.email, name: form.name },
    });
  };

  return (
    <AuthShell title="Create Account" sub="Create your customer account — save addresses and order history">
      <form onSubmit={submit} className="auth-form-clean">
        {error && <div className="alert-error"><Ic name="x" size={14} /> {error}</div>}
        <div className="field">
          <label>Full Name</label>
          <input value={form.name} onChange={set('name')} placeholder="Your full name" required autoFocus />
        </div>
        <div className="field">
          <label>Email Address (For Verification Code)</label>
          <input type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required />
        </div>
        <div className="field">
          <label>Phone Number</label>
          <input value={form.phone} onChange={set('phone')} placeholder="+1 (555) 000-0000" required />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={form.password} onChange={set('password')} placeholder="At least 6 characters" required />
        </div>
        <button className="btn-primary btn-block btn-auth-submit" disabled={busy}>
          {busy ? 'Sending Verification Code…' : 'CREATE ACCOUNT & VERIFY EMAIL →'}
        </button>
      </form>

      <div className="auth-links" style={{ justifyContent: 'center', marginTop: 16 }}>
        <span>Already have an account? <Link to="/login" style={{ fontWeight: 700, color: '#2563eb' }}>Sign In</Link></span>
      </div>

      {/* OTP Verification Modal */}
      <OtpVerificationModal
        isOpen={otpModalOpen}
        onClose={() => setOtpModalOpen(false)}
        email={form.email}
        title="Verify Customer Email"
        onVerify={handleVerifyOtp}
        onResend={handleResendOtp}
        busy={otpBusy}
      />
    </AuthShell>
  );
}

export function Forgot() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api('/user/forgot', { method: 'POST', body: { email } });
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Forgot Password" sub="Enter your registered email address to receive password reset link & OTP code">
      {result ? (
        <div className="forgot-result">
          <div className="alert-success" style={{ marginBottom: 14 }}>
            <Ic name="checkCircle" size={16} />
            <span>{result.message}</span>
          </div>
          <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.5, margin: '0 0 16px' }}>
            We've dispatched an email to <b>{email}</b> containing a secure 1-click password reset link and a 6-digit recovery code.
          </p>
          <Link
            to={`/reset-password?email=${encodeURIComponent(email)}`}
            className="btn-primary btn-block"
            style={{ textAlign: 'center', textDecoration: 'none' }}
          >
            ENTER 6-DIGIT CODE TO RESET PASSWORD →
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="auth-form-clean">
          {error && <div className="alert-error"><Ic name="x" size={14} /> {error}</div>}
          <div className="field">
            <label>Registered Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>
          <button className="btn-primary btn-block btn-auth-submit" disabled={busy}>
            {busy ? 'Sending Reset Email…' : 'SEND PASSWORD RECOVERY EMAIL →'}
          </button>
        </form>
      )}
      <div className="auth-links" style={{ justifyContent: 'center', marginTop: 16 }}>
        <Link to="/login" style={{ fontWeight: 700, color: '#2563eb' }}>← Back to login</Link>
      </div>
    </AuthShell>
  );
}

export function Reset() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const urlToken = params.get('token') || '';
  const urlEmail = params.get('email') || '';

  const [email, setEmail] = useState(urlEmail);
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return setError('Passwords do not match');
    setBusy(true);
    setError('');
    try {
      const payload = {
        password,
        ...(urlToken ? { token: urlToken } : { email: email.trim(), otp: otp.trim() }),
      };
      const d = await api('/user/reset', { method: 'POST', body: payload });
      setSuccess(d.message || 'Password reset successfully!');
      setTimeout(() => {
        if (d.token) login(d.token, d.user);
        navigate('/account');
      }, 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Reset Password" sub="Set a new secure password for your customer account">
      <form onSubmit={submit} className="auth-form-clean">
        {error && <div className="alert-error"><Ic name="x" size={14} /> {error}</div>}
        {success && <div className="alert-success"><Ic name="checkCircle" size={14} /> {success}</div>}

        {!urlToken && (
          <>
            <div className="field">
              <label>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="field">
              <label>6-Digit Recovery Code (From Email)</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="e.g. 749201"
                required
              />
            </div>
          </>
        )}

        <div className="field">
          <label>New Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            required
            autoFocus
          />
        </div>
        <div className="field">
          <label>Confirm New Password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter new password"
            required
          />
        </div>
        <button className="btn-primary btn-block btn-auth-submit" disabled={busy}>
          {busy ? 'Updating Password…' : 'UPDATE PASSWORD & SIGN IN →'}
        </button>
      </form>
    </AuthShell>
  );
}


