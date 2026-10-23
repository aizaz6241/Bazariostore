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
  products: '/seller/products',
  treasury: '/seller/treasury',
  refunds: '/seller/refunds',
  discounts: '/seller/discounts',
  shipping: '/seller/shipping',
  analytics: '/seller/analytics',
  settings: '/seller/settings',
  dashboard: '/seller',
};

const safeId = (v) => (/^[a-f0-9]{24}$/i.test(String(v || '')) ? String(v) : '');

/** Where a shortcut button takes the seller ('' = nowhere / unknown). */
export function shortcutPath(action) {
  if (!action) return '';
  if (action.kind === 'page') return SHORTCUT_PAGE_PATHS[action.key] || '';
  if (action.kind === 'order' && safeId(action.refId)) return `/seller/orders?open=${safeId(action.refId)}`;
  if (action.kind === 'product' && safeId(action.refId)) return `/seller/products?highlight=${safeId(action.refId)}`;
  return '';
}
