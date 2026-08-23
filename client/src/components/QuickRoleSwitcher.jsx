import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api.js';

export default function QuickRoleSwitcher() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedSeller, setSelectedSeller] = useState('demo-seller-1@bazario.com');

  const DEMO_SELLERS = [
    { email: 'demo-seller-1@bazario.com', name: 'Apex Electronics (demo-seller-1)', icon: '📱' },
    { email: 'demo-seller-2@bazario.com', name: 'Vogue & Velvet (demo-seller-2)', icon: '👗' },
    { email: 'demo-seller-3@bazario.com', name: 'Lumina Home & Living (demo-seller-3)', icon: '🍳' },
    { email: 'demo-seller-4@bazario.com', name: 'Aura & Glow Skincare (demo-seller-4)', icon: '✨' },
    { email: 'demo-seller-5@bazario.com', name: 'Titan Pro Fitness (demo-seller-5)', icon: '🏋️' },
    { email: 'demo-seller-6@bazario.com', name: 'Chronos Timepieces (demo-seller-6)', icon: '⌚' },
  ];

  const loginAsAdmin = async () => {
    setLoading(true);
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: { email: 'admin@bazario.com', password: 'admin123' },
      });
      localStorage.setItem('ng_admin_token', data.token);
      localStorage.setItem('ng_admin', JSON.stringify(data.admin));
      localStorage.setItem('ng_admin_name', data.admin.name);
      navigate('/admin');
    } catch {
      try {
        const data2 = await api('/auth/login', {
          method: 'POST',
          body: { email: 'admin@amazon.com', password: 'admin123' },
        });
        localStorage.setItem('ng_admin_token', data2.token);
        localStorage.setItem('ng_admin', JSON.stringify(data2.admin));
        localStorage.setItem('ng_admin_name', data2.admin.name);
        navigate('/admin');
      } catch {
        // Fallback for demo without DB
        localStorage.setItem('ng_admin_token', 'demo-token');
        localStorage.setItem('ng_admin', JSON.stringify({ name: 'Super Admin', role: 'super_admin', permissions: [] }));
        navigate('/admin');
      }
    } finally {
      setLoading(false);
    }
  };

  const loginAsSeller = async (email, password = 'seller123') => {
    setLoading(true);
    try {
      const data = await api('/sellers/login', {
        method: 'POST',
        body: { email, password },
      });
      localStorage.setItem('ng_seller_token', data.token);
      localStorage.setItem('ng_seller', JSON.stringify(data.seller));
      navigate('/seller');
    } catch (err) {
      alert('Seller login failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const currentRole = location.pathname.startsWith('/admin')
    ? 'Super Admin Mode'
    : location.pathname.startsWith('/seller')
    ? 'Seller Central Mode'
    : 'Customer Storefront';

  return (
    <div className={`quick-role-bar ${collapsed ? 'collapsed' : ''}`}>
      <div className="role-bar-inner">
        <div className="role-bar-current">
          <span className="role-indicator-dot"></span>
          <span className="role-lbl">Active View: <b>{currentRole}</b></span>
        </div>

        <div className="role-quick-buttons">
          <span className="switch-hint">⚡ Switch Role:</span>
          <button
            onClick={loginAsAdmin}
            className={`role-btn admin-badge ${location.pathname.startsWith('/admin') ? 'active-role' : ''}`}
            disabled={loading}
          >
            👑 Super Admin Portal
          </button>

          <button
            onClick={() => loginAsSeller('demo-seller-1@bazario.com')}
            className={`role-btn seller-badge ${location.pathname.startsWith('/seller') ? 'active-role' : ''}`}
            disabled={loading}
            title="demo-seller-1 (Apex Electronics & Tech Hub)"
          >
            📱 Seller 1: Apex Tech
          </button>

          <button
            onClick={() => loginAsSeller('demo-seller-2@bazario.com')}
            className="role-btn seller-badge"
            disabled={loading}
            title="demo-seller-2 (Vogue & Velvet Apparel)"
          >
            👗 Seller 2: Vogue &amp; Velvet
          </button>

          {/* Quick Select for other demo sellers */}
          <select
            className="role-select"
            value={selectedSeller}
            onChange={(e) => {
              setSelectedSeller(e.target.value);
              loginAsSeller(e.target.value);
            }}
            disabled={loading}
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.2)',
              background: '#1e293b',
              color: '#f8fafc',
              cursor: 'pointer',
            }}
          >
            <option value="" disabled>More Demo Sellers...</option>
            {DEMO_SELLERS.map((s) => (
              <option key={s.email} value={s.email}>
                {s.icon} {s.name}
              </option>
            ))}
          </select>

          <button
            onClick={() => navigate('/')}
            className={`role-btn customer-badge ${!location.pathname.startsWith('/admin') && !location.pathname.startsWith('/seller') ? 'active-role' : ''}`}
          >
            🛒 Customer Storefront
          </button>
        </div>

        <button
          className="role-toggle-btn"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand Switcher' : 'Collapse Switcher'}
        >
          {collapsed ? '⚡ Demo Roles' : '✕'}
        </button>
      </div>
    </div>
  );
}
