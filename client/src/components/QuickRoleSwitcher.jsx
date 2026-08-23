import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function QuickRoleSwitcher() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);

  const loginAsAdmin = async () => {
    const existingToken = localStorage.getItem('ng_admin_token');
    if (existingToken && existingToken !== 'demo-token') {
      navigate('/admin');
      return;
    }
    navigate('/admin/login');
  };

  const loginAsSeller = async () => {
    const existingToken = localStorage.getItem('ng_seller_token');
    if (existingToken) {
      navigate('/seller');
      return;
    }
    navigate('/seller/login');
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
          <span className="switch-hint">⚡ Portals:</span>
          <button
            onClick={loginAsAdmin}
            className={`role-btn admin-badge ${location.pathname.startsWith('/admin') ? 'active-role' : ''}`}
            disabled={loading}
          >
            👑 Super Admin Portal
          </button>

          <button
            onClick={loginAsSeller}
            className={`role-btn seller-badge ${location.pathname.startsWith('/seller') ? 'active-role' : ''}`}
            disabled={loading}
          >
            🏬 Seller Central
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
