import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const Ctx = createContext(null);

export const isValidToken = (t) => {
  return Boolean(t && typeof t === 'string' && t.trim() !== '' && t !== 'null' && t !== 'undefined' && t !== 'demo-token');
};

export function AuthProvider({ children }) {
  const getStoredUser = () => {
    try {
      const token = localStorage.getItem('ng_user_token');
      if (!isValidToken(token)) return null;
      const raw = localStorage.getItem('ng_user');
      return raw ? JSON.parse(raw) : { name: 'Customer' };
    } catch {
      return null;
    }
  };

  const getStoredSeller = () => {
    try {
      const token = localStorage.getItem('ng_seller_token');
      if (!isValidToken(token)) return null;
      const raw = localStorage.getItem('ng_seller');
      return raw ? JSON.parse(raw) : { storeName: 'Merchant Store', ownerName: 'Seller' };
    } catch {
      return null;
    }
  };

  const getStoredAdmin = () => {
    try {
      const token = localStorage.getItem('ng_admin_token');
      if (!isValidToken(token)) return null;
      const raw = localStorage.getItem('ng_admin');
      const name = localStorage.getItem('ng_admin_name');
      return raw ? JSON.parse(raw) : { name: name || 'Super Admin' };
    } catch {
      return null;
    }
  };

  const [user, setUser] = useState(getStoredUser);
  const [seller, setSeller] = useState(getStoredSeller);
  const [admin, setAdmin] = useState(getStoredAdmin);
  const [activePortal, setActivePortal] = useState(() => localStorage.getItem('ng_active_portal') || null);

  const refreshAuth = useCallback(() => {
    const u = getStoredUser();
    const s = getStoredSeller();
    const a = getStoredAdmin();
    const portal = localStorage.getItem('ng_active_portal');

    setUser(u);
    setSeller(s);
    setAdmin(a);

    // Auto-resolve active portal if stale or unset
    if (portal === 'seller' && s) {
      setActivePortal('seller');
    } else if (portal === 'admin' && a) {
      setActivePortal('admin');
    } else if (portal === 'customer' && u) {
      setActivePortal('customer');
    } else if (s) {
      setActivePortal('seller');
      localStorage.setItem('ng_active_portal', 'seller');
    } else if (a) {
      setActivePortal('admin');
      localStorage.setItem('ng_active_portal', 'admin');
    } else if (u) {
      setActivePortal('customer');
      localStorage.setItem('ng_active_portal', 'customer');
    } else {
      setActivePortal(null);
      localStorage.removeItem('ng_active_portal');
    }
  }, []);

  useEffect(() => {
    const handleStorageChange = () => {
      refreshAuth();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('auth-change', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('auth-change', handleStorageChange);
    };
  }, [refreshAuth]);

  const triggerAuthChange = () => {
    window.dispatchEvent(new Event('auth-change'));
  };

  // Customer Auth
  const login = (token, u) => {
    localStorage.setItem('ng_user_token', token);
    localStorage.setItem('ng_user', JSON.stringify(u));
    if (!localStorage.getItem('ng_active_portal') || localStorage.getItem('ng_active_portal') === 'customer') {
      localStorage.setItem('ng_active_portal', 'customer');
      setActivePortal('customer');
    }
    setUser(u);
    triggerAuthChange();
  };

  const update = (u) => {
    localStorage.setItem('ng_user', JSON.stringify(u));
    setUser(u);
    triggerAuthChange();
  };

  const logout = () => {
    localStorage.removeItem('ng_user_token');
    localStorage.removeItem('ng_user');
    if (localStorage.getItem('ng_active_portal') === 'customer') {
      localStorage.removeItem('ng_active_portal');
      setActivePortal(null);
    }
    setUser(null);
    triggerAuthChange();
  };

  // Seller Auth
  const loginSeller = (token, s) => {
    // Clear any stale admin token to prevent cross-contamination
    localStorage.removeItem('ng_admin_token');
    localStorage.removeItem('ng_admin');
    localStorage.removeItem('ng_admin_name');
    setAdmin(null);

    localStorage.setItem('ng_seller_token', token);
    localStorage.setItem('ng_seller', JSON.stringify(s));
    localStorage.setItem('ng_active_portal', 'seller');
    setSeller(s);
    setActivePortal('seller');
    triggerAuthChange();
  };

  const updateSeller = (s) => {
    localStorage.setItem('ng_seller', JSON.stringify(s));
    setSeller(s);
    triggerAuthChange();
  };

  const logoutSeller = () => {
    localStorage.removeItem('ng_seller_token');
    localStorage.removeItem('ng_seller');
    if (localStorage.getItem('ng_active_portal') === 'seller') {
      localStorage.removeItem('ng_active_portal');
      setActivePortal(null);
    }
    setSeller(null);
    triggerAuthChange();
  };

  // Admin Auth
  const loginAdmin = (token, a) => {
    // Clear any stale seller token to prevent cross-contamination
    localStorage.removeItem('ng_seller_token');
    localStorage.removeItem('ng_seller');
    setSeller(null);

    localStorage.setItem('ng_admin_token', token);
    localStorage.setItem('ng_admin', JSON.stringify(a));
    if (a?.name) localStorage.setItem('ng_admin_name', a.name);
    localStorage.setItem('ng_active_portal', 'admin');
    setAdmin(a);
    setActivePortal('admin');
    triggerAuthChange();
  };

  const logoutAdmin = () => {
    localStorage.removeItem('ng_admin_token');
    localStorage.removeItem('ng_admin');
    localStorage.removeItem('ng_admin_name');
    if (localStorage.getItem('ng_active_portal') === 'admin') {
      localStorage.removeItem('ng_active_portal');
      setActivePortal(null);
    }
    setAdmin(null);
    triggerAuthChange();
  };

  const logoutAll = () => {
    localStorage.removeItem('ng_user_token');
    localStorage.removeItem('ng_user');
    localStorage.removeItem('ng_seller_token');
    localStorage.removeItem('ng_seller');
    localStorage.removeItem('ng_admin_token');
    localStorage.removeItem('ng_admin');
    localStorage.removeItem('ng_admin_name');
    localStorage.removeItem('ng_active_portal');
    setUser(null);
    setSeller(null);
    setAdmin(null);
    setActivePortal(null);
    triggerAuthChange();
  };

  return (
    <Ctx.Provider
      value={{
        user,
        seller,
        admin,
        activePortal,
        login,
        update,
        logout,
        loginSeller,
        updateSeller,
        logoutSeller,
        loginAdmin,
        logoutAdmin,
        logoutAll,
        refreshAuth,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);


