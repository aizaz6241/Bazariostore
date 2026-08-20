import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import Ic from '../components/Icons.jsx';

export default function SellerLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotModalOpen, setForgotModalOpen] = useState(false);

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

        {err && (
          <div className="seller-auth-error">
            <Ic name="shield" size={16} />
            <span>{err}</span>
          </div>
        )}

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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span>Password</span>
              <button
                type="button"
                onClick={() => setForgotModalOpen(true)}
                style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
              >
                Forgot password?
              </button>
            </div>
            <div style={{ position: 'relative' }}>
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
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                }}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                <Ic name="eye" size={16} />
              </button>
            </div>
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

      {/* Forgot Password Modal */}
      {forgotModalOpen && (
        <div className="admin-modal-overlay" onClick={() => setForgotModalOpen(false)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>🔑</span>
                <h3>Seller Password Recovery</h3>
              </div>
              <button onClick={() => setForgotModalOpen(false)} className="close-btn"><Ic name="x" size={20} /></button>
            </div>

            <div style={{ padding: '4px 0 16px 0', fontSize: 13.5, color: '#334155', lineHeight: 1.6 }}>
              <p style={{ marginTop: 0 }}>
                Agar aap apna <b>Seller Login Password</b> bhool gaye hain, to <b>Super Admin</b> aapka password foran reset kar sakta hai.
              </p>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', margin: '14px 0' }}>
                <b style={{ color: '#0f172a', display: 'block', marginBottom: 6 }}>🔒 Super Admin Password Reset Steps:</b>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#475569' }}>
                  <li>Super Admin panel mein <b>Multi-Vendor Seller Management</b> (`/admin/sellers`) open karein.</li>
                  <li>Aapke store ke samne <b>"Reset Password"</b> button par click karein.</li>
                  <li>Naya password enter ya generate karke save karein.</li>
                </ol>
              </div>

              <p style={{ margin: '10px 0 0 0', fontSize: 12.5, color: '#64748b' }}>
                📞 Support Email: <code>admin@bazario.com</code> | Help Desk 24/7
              </p>
            </div>

            <div className="modal-bottom-actions">
              <button type="button" onClick={() => setForgotModalOpen(false)} className="btn-primary" style={{ width: '100%' }}>
                Got It, Thanks!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
