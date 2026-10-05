import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext({ content: {}, categories: [], loading: true, refresh: () => {} });

export function ContentProvider({ children }) {
  const [state, setState] = useState(() => {
    try {
      const cachedContent = sessionStorage.getItem('bazario_cached_content');
      const cachedCategories = sessionStorage.getItem('bazario_cached_categories');
      if (cachedContent && cachedCategories) {
        return {
          content: JSON.parse(cachedContent),
          categories: JSON.parse(cachedCategories),
          loading: false,
        };
      }
    } catch (_) {}
    return { content: {}, categories: [], loading: true };
  });

  const refresh = () =>
    Promise.all([api('/content'), api('/categories')])
      .then(([content, categories]) => {
        setState({ content: content || {}, categories: categories || [], loading: false });
        try {
          sessionStorage.setItem('bazario_cached_content', JSON.stringify(content || {}));
          sessionStorage.setItem('bazario_cached_categories', JSON.stringify(categories || []));
        } catch (_) {}
      })
      .catch(() => setState((s) => ({ ...s, loading: false })));

  useEffect(() => {
    refresh();
  }, []);

  return <Ctx.Provider value={{ ...state, refresh }}>{children}</Ctx.Provider>;
}

export const useContent = () => useContext(Ctx);
