import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

const CartCtx = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ng_cart') || '[]');
    } catch {
      return [];
    }
  });
  const [toast, setToast] = useState('');
  const toastTimer = useRef();

  useEffect(() => {
    localStorage.setItem('ng_cart', JSON.stringify(items));
  }, [items]);

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  };

  const add = (product, qty = 1, size = '', variant = '') => {
    const price = size && product.sizes?.length ? product.sizes.find((s) => s.label === size)?.price ?? product.price : product.price;
    const key = product._id + '|' + (size || '') + '|' + (variant || '');
    setItems((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) return prev.map((i) => (i.key === key ? { ...i, qty: Math.min(20, i.qty + qty) } : i));
      return [
        ...prev,
        {
          key,
          id: product._id,
          slug: product.slug,
          name: product.name,
          image: product.image,
          price,
          size: size || '',
          variant: variant || '',
          qty,
        },
      ];
    });
    showToast('Added to cart');
  };

  const setQty = (key, qty) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, qty: Math.max(1, Math.min(20, qty)) } : i)));
  const remove = (key) => setItems((prev) => prev.filter((i) => i.key !== key));
  const clear = () => setItems([]);

  const subtotal = useMemo(() => items.reduce((s, i) => s + i.price * i.qty, 0), [items]);
  const count = useMemo(() => items.reduce((s, i) => s + i.qty, 0), [items]);

  return (
    <CartCtx.Provider value={{ items, add, setQty, remove, clear, subtotal, count, toast, showToast }}>
      {children}
    </CartCtx.Provider>
  );
}

export const useCart = () => useContext(CartCtx);
