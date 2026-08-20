import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import Ic from '../components/Icons.jsx';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token, admin } = await api('/auth/login', {
        method: 'POST',
        body: { email: email.trim(), password },
      });
      localStorage.setItem('ng_admin_token', token);
      localStorage.setItem('ng_admin', JSON.stringify(admin));
      localStorage.setItem('ng_admin_name', admin.name);
      navigate('/admin');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-login-page">
      <form className="card admin-login-card" onSubmit={submit}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 28, fontWeight: 900, color: '#f59e0b', letterSpacing: '-1px' }}>Bazario</span>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 2, marginTop: 2 }}>SUPER ADMIN CONTROL PANEL</div>
        </div>

        {/* Role / Portal Switcher Tabs */}
        <div className="login-portal-tabs" style={{ marginBottom: 18 }}>
          <Link to="/login" className="portal-tab">
            <Ic name="user" size={14} /> Customer
          </Link>
          <Link to="/seller/login" className="portal-tab">
            <Ic name="store" size={14} /> Seller Hub
          </Link>
          <Link to="/admin/login" className="portal-tab active">
            <Ic name="shield" size={14} /> Admin
          </Link>
        </div>

        <p className="muted-sm" style={{ textAlign: 'center', marginBottom: 18 }}>Sign in with super administrator credentials</p>
        {error && <div className="alert-error"><Ic name="x" size={14} /> {error}</div>}
        <div className="field">
          <label>Admin Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@bazario.com"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
          />
        </div>
        <div className="field">
          <label>Password</label>
          <div className="pw-wrap">
            <input
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              autoCapitalize="none"
            />
            <button type="button" className="pw-eye" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
              <Ic name="eye" size={17} />
            </button>
          </div>
        </div>
        <button className="btn-primary btn-block" disabled={busy}>{busy ? 'Signing in…' : 'SIGN IN AS SUPER ADMIN'}</button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, borderTop: '1px solid #334155', paddingTop: 14, fontSize: 12 }}>
          <Link to="/" style={{ color: '#94a3b8', textDecoration: 'none' }}>← Back to Store</Link>
          <Link to="/seller/login" style={{ color: '#f59e0b', textDecoration: 'none', fontWeight: 600 }}>🏬 Seller Central →</Link>
        </div>
      </form>
    </div>
  );
}
