import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext({ content: {}, categories: [], loading: true, refresh: () => {} });

export function ContentProvider({ children }) {
  const [state, setState] = useState({ content: {}, categories: [], loading: true });

  const refresh = () =>
    Promise.all([api('/content'), api('/categories')])
      .then(([content, categories]) => setState({ content: content || {}, categories: categories || [], loading: false }))
      .catch(() => setState((s) => ({ ...s, loading: false })));

  useEffect(() => {
    refresh();
  }, []);

  return <Ctx.Provider value={{ ...state, refresh }}>{children}</Ctx.Provider>;
}

export const useContent = () => useContext(Ctx);
