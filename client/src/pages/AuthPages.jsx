import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Ic from '../components/Icons.jsx';

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
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api('/user/register', { method: 'POST', body: form });
      login(d.token, d.user);
      navigate('/account');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Create Account" sub="Create your customer account — save addresses and order history">
      <form onSubmit={submit} className="auth-form-clean">
        {error && <div className="alert-error"><Ic name="x" size={14} /> {error}</div>}
        <div className="field"><label>Full Name</label><input value={form.name} onChange={set('name')} placeholder="Your full name" required autoFocus /></div>
        <div className="field"><label>Email Address</label><input type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required /></div>
        <div className="field"><label>Phone Number</label><input value={form.phone} onChange={set('phone')} placeholder="+91 / +92 3XX XXXXXXX" required /></div>
        <div className="field"><label>Password</label><input type="password" value={form.password} onChange={set('password')} placeholder="At least 6 characters" required /></div>
        <button className="btn-primary btn-block btn-auth-submit" disabled={busy}>{busy ? 'Creating…' : 'CREATE ACCOUNT'}</button>
      </form>
      <div className="auth-links" style={{ justifyContent: 'center', marginTop: 16 }}>
        <span>Already have an account? <Link to="/login" style={{ fontWeight: 700, color: '#2563eb' }}>Sign In</Link></span>
      </div>
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
      setResult(await api('/user/forgot', { method: 'POST', body: { email } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Forgot Password" sub="Enter your registered email address to receive password reset link">
      {result ? (
        <div className="forgot-result">
          <p className="promo-ok" style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, margin: '0 0 8px 0' }}>
            <Ic name="badgeCheck" size={16} /> {result.message}
          </p>
          {result.resetUrl && (
            <p className="muted-sm" style={{ margin: 0 }}>
              {result.devNote}<br />
              <Link className="btn-primary" style={{ marginTop: 10, display: 'inline-block' }} to={result.resetUrl}>OPEN RESET LINK</Link>
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="auth-form-clean">
          {error && <div className="alert-error"><Ic name="x" size={14} /> {error}</div>}
          <div className="field"><label>Email Address</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoFocus /></div>
          <button className="btn-primary btn-block btn-auth-submit" disabled={busy}>{busy ? 'Sending…' : 'SEND RESET LINK'}</button>
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
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return setError('Passwords do not match');
    setBusy(true);
    setError('');
    try {
      const d = await api('/user/reset', { method: 'POST', body: { token: params.get('token'), password } });
      login(d.token, d.user);
      navigate('/account');
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
        <div className="field"><label>New Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus /></div>
        <div className="field"><label>Confirm Password</label><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></div>
        <button className="btn-primary btn-block btn-auth-submit" disabled={busy}>{busy ? 'Saving…' : 'RESET PASSWORD'}</button>
      </form>
    </AuthShell>
  );
}

