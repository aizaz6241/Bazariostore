/**
 * Support shortcut buttons in the seller chat (server: server/src/utils/chatShortcuts.js).
 * The link is built HERE from the button's kind + key / id, so a message can only ever open a page
 * of the seller panel itself (never an outside link). Keep the page keys in step with the server.
 */
export const SHORTCUT_PAGE_PATHS = {
  diamond: '/seller/diamond',
  deposit: '/seller/wallet?tab=deposit',
  withdraw: '/seller/wallet?tab=withdraw',
  wallet: '/seller/wallet',
  orders: '/seller/orders',
  health: '/seller/health',
  products: '/seller/products',
  treasury: '/seller/treasury',
  refunds: '/seller/refunds',
  discounts: '/seller/discounts',
  shipping: '/seller/shipping',
  analytics: '/seller/analytics',
  settings: '/seller/settings',
  dashboard: '/seller',
  closeStore: '/seller/close-store',
};

const safeId = (v) => (/^[a-f0-9]{24}$/i.test(String(v || '')) ? String(v) : '');

/** Where a shortcut button takes the seller ('' = nowhere / unknown). */
export function shortcutPath(action) {
  if (!action) return '';
  if (action.kind === 'page') {
    const base = SHORTCUT_PAGE_PATHS[action.key] || '';
    // a deposit button can carry the amount to fill in
    const amt = Number(action.amount);
    if (base && action.key === 'deposit' && amt > 0 && amt <= 1000000) return `${base}&amount=${Math.round(amt * 100) / 100}`;
    return base;
  }
  if (action.kind === 'order' && safeId(action.refId)) return `/seller/orders?open=${safeId(action.refId)}`;
  if (action.kind === 'product' && safeId(action.refId)) return `/seller/products?highlight=${safeId(action.refId)}`;
  return '';
}

/** Where the same button takes an ADMIN in the admin panel ('' = nowhere): an order or a product. */
export function adminShortcutPath(action) {
  if (!action) return '';
  if (action.kind === 'order' && safeId(action.refId)) return `/admin/orders/${safeId(action.refId)}`;
  if (action.kind === 'product' && safeId(action.refId)) return `/admin/products/${safeId(action.refId)}`;
  return '';
}

/** All buttons of a message (a message can carry several; `action` alone in older ones). */
export const messageActions = (msg) =>
  Array.isArray(msg?.actions) && msg.actions.length ? msg.actions : msg?.action && msg.action.label ? [msg.action] : [];
