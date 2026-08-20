import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Ic from '../components/Icons.jsx';

function AuthShell({ title, sub, children }) {
  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h2 className="serif">{title}</h2>
        <p className="muted-sm">{sub}</p>
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
    <AuthShell title="Sign In" sub="Choose your account portal to sign in">
      {/* Role / Portal Switcher Tabs */}
      <div className="login-portal-tabs">
        <Link to="/login" className="portal-tab active">
          <Ic name="user" size={14} /> Customer
        </Link>
        <Link to="/seller/login" className="portal-tab">
          <Ic name="store" size={14} /> Seller Hub
        </Link>
        <Link to="/admin/login" className="portal-tab">
          <Ic name="shield" size={14} /> Admin
        </Link>
      </div>

      <form onSubmit={submit}>
        {error && <div className="alert-error"><Ic name="x" size={14} /> {error}</div>}
        <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoFocus /></div>
        <div className="field"><label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></div>
        <button className="btn-primary btn-block" disabled={busy}>{busy ? 'Signing in…' : 'SIGN IN AS CUSTOMER'}</button>
      </form>
      <div className="auth-links">
        <Link to="/forgot-password">Forgot password?</Link>
        <span>New customer? <Link to="/register">Create an account</Link></span>
      </div>

      <div className="auth-role-shortcuts">
        <p className="shortcuts-lbl">Are you a Merchant or Platform Administrator?</p>
        <div className="shortcuts-grid">
          <Link to="/seller/login" className="btn-role-shortcut">
            <Ic name="store" size={14} /> Seller Central Login
          </Link>
          <Link to="/admin/login" className="btn-role-shortcut admin">
            <Ic name="shield" size={14} /> Super Admin Login
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
    <AuthShell title="Create Account" sub="Naya account banayein — order history aur addresses save karein">
      <form onSubmit={submit}>
        {error && <div className="alert-error"><Ic name="x" size={14} /> {error}</div>}
        <div className="field"><label>Full Name</label><input value={form.name} onChange={set('name')} placeholder="Your full name" autoFocus /></div>
        <div className="field"><label>Email</label><input type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" /></div>
        <div className="field"><label>Phone</label><input value={form.phone} onChange={set('phone')} placeholder="03XX XXXXXXX" /></div>
        <div className="field"><label>Password</label><input type="password" value={form.password} onChange={set('password')} placeholder="At least 6 characters" /></div>
        <button className="btn-primary btn-block" disabled={busy}>{busy ? 'Creating…' : 'CREATE ACCOUNT'}</button>
      </form>
      <div className="auth-links">
        <span>Already have an account? <Link to="/login">Login</Link></span>
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
    <AuthShell title="Forgot Password" sub="Apna email enter karein — hum reset link bhejenge">
      {result ? (
        <div className="forgot-result">
          <p className="promo-ok"><Ic name="check" size={15} /> {result.message}</p>
          {result.resetUrl && (
            <p className="muted-sm">
              {result.devNote}<br />
              <Link className="btn-primary" style={{ marginTop: 10 }} to={result.resetUrl}>OPEN RESET LINK</Link>
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={submit}>
          {error && <div className="alert-error"><Ic name="x" size={14} /> {error}</div>}
          <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoFocus /></div>
          <button className="btn-primary btn-block" disabled={busy}>{busy ? 'Sending…' : 'SEND RESET LINK'}</button>
        </form>
      )}
      <div className="auth-links"><Link to="/login">Back to login</Link></div>
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
    if (password !== confirm) return setError('Dono passwords match nahi karte');
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
    <AuthShell title="Reset Password" sub="Naya password set karein">
      <form onSubmit={submit}>
        {error && <div className="alert-error"><Ic name="x" size={14} /> {error}</div>}
        <div className="field"><label>New Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></div>
        <div className="field"><label>Confirm Password</label><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
        <button className="btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : 'RESET PASSWORD'}</button>
      </form>
    </AuthShell>
  );
}
