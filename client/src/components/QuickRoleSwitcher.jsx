import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api.js';

export default function QuickRoleSwitcher() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);

  const loginAsAdmin = async () => {
    setLoading(true);
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: { email: 'admin@amazon.com', password: 'admin123' },
      });
      localStorage.setItem('ng_admin_token', data.token);
      localStorage.setItem('ng_admin', JSON.stringify(data.admin));
      localStorage.setItem('ng_admin_name', data.admin.name);
      navigate('/admin');
    } catch {
      // Fallback for demo without DB
      localStorage.setItem('ng_admin_token', 'demo-token');
      localStorage.setItem('ng_admin', JSON.stringify({ name: 'Super Admin', role: 'super_admin', permissions: [] }));
      navigate('/admin');
    } finally {
      setLoading(false);
    }
  };

  const loginAsSeller = async (email, password) => {
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
            onClick={() => loginAsSeller('seller1@tech.com', 'seller123')}
            className={`role-btn seller-badge ${location.pathname.startsWith('/seller') ? 'active-role' : ''}`}
            disabled={loading}
          >
            📱 Seller: TechZone
          </button>
          <button
            onClick={() => loginAsSeller('seller2@fashion.com', 'seller123')}
            className={`role-btn seller-badge`}
            disabled={loading}
          >
            👗 Seller: Urban Vogue
          </button>
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
