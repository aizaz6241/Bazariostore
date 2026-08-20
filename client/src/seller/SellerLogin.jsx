import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import Ic from '../components/Icons.jsx';

export default function SellerLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const data = await api('/sellers/login', {
        method: 'POST',
        body: { email, password },
      });
      localStorage.setItem('ng_seller_token', data.token);
      localStorage.setItem('ng_seller', JSON.stringify(data.seller));
      navigate('/seller');
    } catch (e) {
      setErr(e.message || 'Login failed. Please check your email and password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="seller-auth-page">
      <div className="seller-auth-box">
        <div className="seller-auth-brand">
          <div className="amazon-logo-seller">
            <span className="brand-prime" style={{ fontWeight: 900, letterSpacing: '-1px' }}>Bazario</span>
            <span className="brand-hub">Seller Central</span>
          </div>
          <p className="seller-auth-sub">Manage your products, orders, revenue &amp; growth</p>
        </div>

        {/* Role / Portal Switcher Tabs */}
        <div className="login-portal-tabs" style={{ marginBottom: 20 }}>
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

        {err && <div className="seller-auth-error"><Ic name="shield" size={16} /> {err}</div>}

        <form onSubmit={submit} className="seller-auth-form">
          <label>
            <span>Business Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@business.com"
              required
              autoComplete="email"
            />
          </label>

          <label>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </label>

          <button type="submit" className="seller-auth-btn" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In to Seller Central'}
          </button>
        </form>

        <div className="seller-auth-footer">
          <p>Don't have a seller account? Contact the platform administrator to get your vendor account onboarded.</p>
          <div className="seller-auth-links" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <Link to="/">← Back to Store</Link>
            <Link to="/admin/login" style={{ color: '#2563eb', fontWeight: 600 }}>👑 Admin Login →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
