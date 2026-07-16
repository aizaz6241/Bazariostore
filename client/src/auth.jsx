import { createContext, useContext, useState } from 'react';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ng_user') || 'null');
    } catch {
      return null;
    }
  });

  const login = (token, u) => {
    localStorage.setItem('ng_user_token', token);
    localStorage.setItem('ng_user', JSON.stringify(u));
    setUser(u);
  };

  const update = (u) => {
    localStorage.setItem('ng_user', JSON.stringify(u));
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem('ng_user_token');
    localStorage.removeItem('ng_user');
    setUser(null);
  };

  return <Ctx.Provider value={{ user, login, logout, update }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
