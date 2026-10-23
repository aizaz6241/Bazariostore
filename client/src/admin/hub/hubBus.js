/**
 * Small shared helpers of the admin "hub" features: the store quick-view panel, Ctrl + K search,
 * recently opened stores and the counts that feed the menu badges. Pages talk to the panel and
 * the search through window events, so a page only needs `peekSeller(id)`.
 */
export const PEEK_EVENT = 'bazario:peek-seller';
export const SEARCH_EVENT = 'bazario:open-search';
export const HUB_REFRESH_EVENT = 'bazario:hub-refresh';

const isId = (v) => /^[a-f0-9]{24}$/i.test(String(v || ''));
export const idOf = (v) => {
  const x = v && typeof v === 'object' ? v._id || v.id || '' : v;
  return isId(x) ? String(x) : '';
};

/** Open the store quick-view panel. */
export function peekSeller(id, name = '') {
  const sid = idOf(id);
  if (!sid) return;
  window.dispatchEvent(new CustomEvent(PEEK_EVENT, { detail: { id: sid, name } }));
}

/** Open the Ctrl + K search. */
export function openSearch() {
  window.dispatchEvent(new CustomEvent(SEARCH_EVENT));
}

/** Something changed (an action was done): menu badges and the Today page reload. */
export function refreshHub() {
  window.dispatchEvent(new CustomEvent(HUB_REFRESH_EVENT));
}

/** The admin stored at login (role / permissions), for showing or hiding a control. */
export function storedAdmin() {
  try {
    return JSON.parse(localStorage.getItem('ng_admin') || 'null') || {};
  } catch {
    return {};
  }
}
export const adminCan = (perm) => {
  const a = storedAdmin();
  return a.role === 'super_admin' || (a.permissions || []).includes(perm);
};

// ─── recently opened stores (this browser only) ───
const RECENT_KEY = 'bz_admin_recent_stores';
export function recentStores() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list.filter((s) => isId(s?.id)).slice(0, 8) : [];
  } catch {
    return [];
  }
}
export function rememberStore(store) {
  if (!store || !isId(store.id) || !store.storeName) return;
  try {
    const list = recentStores().filter((s) => s.id !== store.id);
    list.unshift({ id: store.id, storeName: store.storeName, ownerName: store.ownerName || '', at: Date.now() });
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
  } catch {}
}

// ─── links ───
export const profilePath = (id, tab = '') => `/admin/sellers?open=${idOf(id)}${tab ? `&tab=${tab}` : ''}`;
export const chatPath = (conversationId) => `/admin/chat?c=${conversationId}`;
export const orderPath = (id) => `/admin/orders/${id}`;

// ─── small formatting ───
export const usd = (n) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export function ago(d) {
  const t = new Date(d).getTime();
  if (!t) return '';
  const m = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`;
  return `${Math.floor(m / 1440)}d`;
}
export const initialsOf = (name) => {
  const parts = String(name || '').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || 'S') + (parts[1]?.[0] || '')).toUpperCase();
};
export const STATUS_LABELS = {
  pending: 'Waiting for confirmation',
  confirmed: 'Confirmed',
  processing: 'Processing',
  packed: 'Packed',
  out_from_warehouse: 'Left the warehouse',
  delivery_warehouse: 'At delivery hub',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivery_failed: 'Delivery failed',
  returned_to_warehouse: 'Returned to warehouse',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};
