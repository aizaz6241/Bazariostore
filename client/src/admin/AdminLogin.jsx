import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import Ic from '../components/Icons.jsx';

export default function AdminLogin() {
  const navigate = useNavigate();
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
      const { token, admin } = await api('/auth/login', {
        method: 'POST',
        body: { email: email.trim(), password },
      });
      localStorage.setItem('ng_admin_token', token);
      localStorage.setItem('ng_admin', JSON.stringify(admin));
      localStorage.setItem('ng_admin_name', admin.name);
      navigate('/admin');
    } catch (err) {
      setError(err.message || 'Login failed. Please check your admin credentials.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="card auth-card">
        {/* Brand & Badge */}
        <div className="seller-auth-brand">
          <div className="amazon-logo-seller">
            <span className="brand-prime" style={{ fontWeight: 900, letterSpacing: '-1px', color: '#0f172a' }}>Bazario</span>
            <span className="brand-hub" style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>Super Admin</span>
          </div>
          <p className="seller-auth-sub">Platform control, multi-vendor governance &amp; finance</p>
        </div>

        {/* Role / Portal Switcher Tabs */}
        <div className="login-portal-tabs">
          <Link to="/login" className="portal-tab">
            <Ic name="user" size={15} /> Customer
          </Link>
          <Link to="/seller/login" className="portal-tab">
            <Ic name="tag" size={15} /> Seller Hub
          </Link>
          <Link to="/admin/login" className="portal-tab active">
            <Ic name="shield" size={15} /> Super Admin
          </Link>
        </div>

        {error && (
          <div className="alert-error" style={{ marginBottom: 16 }}>
            <Ic name="shield" size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={submit} className="auth-form-clean">
          <div className="field">
            <label>Super Admin Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@bazario.com"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label>Master Password</label>
            <div className="pw-wrap" style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
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

          <button className="btn-primary btn-block btn-auth-submit" disabled={busy}>
            {busy ? 'Verifying credentials…' : 'SIGN IN AS SUPER ADMIN →'}
          </button>
        </form>

        <div className="auth-links" style={{ justifyContent: 'center', marginTop: 16 }}>
          <span style={{ fontSize: 12.5, color: '#64748b' }}>
            Authorized personnel only. All access is logged and audited.
          </span>
        </div>

        {/* Compact Quick Portal Links */}
        <div className="auth-quick-portals">
          <span className="aqp-label">Looking for other portals?</span>
          <div className="aqp-links">
            <Link to="/login" className="aqp-pill customer-pill">
              <Ic name="user" size={13} /> Customer Sign In
            </Link>
            <Link to="/seller/login" className="aqp-pill seller-pill">
              <Ic name="tag" size={13} /> Seller Central
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
