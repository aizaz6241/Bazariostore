import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const getStoredUser = () => {
    try {
      const token = localStorage.getItem('ng_user_token');
      if (!token || token === 'null' || token === 'undefined') return null;
      const parsed = JSON.parse(localStorage.getItem('ng_user') || 'null');
      return parsed || { name: 'Customer' };
    } catch {
      return { name: 'Customer' };
    }
  };

  const getStoredSeller = () => {
    try {
      const token = localStorage.getItem('ng_seller_token');
      if (!token || token === 'null' || token === 'undefined') return null;
      const parsed = JSON.parse(localStorage.getItem('ng_seller') || 'null');
      return parsed || { storeName: 'Merchant Store', ownerName: 'Seller' };
    } catch {
      return { storeName: 'Merchant Store', ownerName: 'Seller' };
    }
  };

  const getStoredAdmin = () => {
    try {
      const token = localStorage.getItem('ng_admin_token');
      if (!token || token === 'null' || token === 'undefined') return null;
      const parsed = JSON.parse(localStorage.getItem('ng_admin') || 'null');
      return (
        parsed || {
          name: localStorage.getItem('ng_admin_name') || 'Super Admin',
        }
      );
    } catch {
      return { name: 'Super Admin' };
    }
  };

  const [user, setUser] = useState(getStoredUser);
  const [seller, setSeller] = useState(getStoredSeller);
  const [admin, setAdmin] = useState(getStoredAdmin);

  const refreshAuth = useCallback(() => {
    setUser(getStoredUser());
    setSeller(getStoredSeller());
    setAdmin(getStoredAdmin());
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
    setUser(null);
    triggerAuthChange();
  };

  // Seller Auth
  const loginSeller = (token, s) => {
    localStorage.setItem('ng_seller_token', token);
    localStorage.setItem('ng_seller', JSON.stringify(s));
    setSeller(s);
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
    setSeller(null);
    triggerAuthChange();
  };

  // Admin Auth
  const loginAdmin = (token, a) => {
    localStorage.setItem('ng_admin_token', token);
    localStorage.setItem('ng_admin', JSON.stringify(a));
    if (a?.name) localStorage.setItem('ng_admin_name', a.name);
    setAdmin(a);
    triggerAuthChange();
  };

  const logoutAdmin = () => {
    localStorage.removeItem('ng_admin_token');
    localStorage.removeItem('ng_admin');
    localStorage.removeItem('ng_admin_name');
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
    setUser(null);
    setSeller(null);
    setAdmin(null);
    triggerAuthChange();
  };

  return (
    <Ctx.Provider
      value={{
        user,
        seller,
        admin,
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

