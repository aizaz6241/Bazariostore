export const PERMISSIONS = [
  'sellers',
  'products',
  'categories',
  'orders',
  'refunds',
  'discounts',
  'shipping',
  'inventory',
  'finance',
  'reports',
  'chat',
  'content',
  'settings',
  'staff',
  'audit',
  'backup',
];

export const ROLE_DEFAULTS = {
  super_admin: [...PERMISSIONS],
  admin: PERMISSIONS.filter((p) => p !== 'staff'),
  manager: ['sellers', 'products', 'categories', 'orders', 'discounts', 'shipping', 'inventory', 'reports', 'content'],
  support: ['sellers', 'orders', 'refunds', 'chat'],
  order_manager: ['sellers', 'orders', 'refunds', 'shipping'],
  inventory: ['products', 'inventory', 'reports'],
};

export const ROLE_LABELS = {
  super_admin: 'Super Admin / Owner',
  admin: 'Administrator',
  manager: 'Store Manager',
  support: 'Support Agent',
  order_manager: 'Order Fulfillment Manager',
  inventory: 'Inventory Specialist',
};

export function permsFor(admin) {
  if (admin.role === 'super_admin') return [...PERMISSIONS];
  if (admin.permissions?.length) return admin.permissions;
  return ROLE_DEFAULTS[admin.role] || [];
}

/** What each module lets a staff account do (shown on the Staff screen). */
export const PERMISSION_INFO = {
  sellers: { label: 'Sellers & Vendors', group: 'Marketplace', desc: 'Seller accounts, applications, complaints, targets, affiliate codes' },
  products: { label: 'Products & Treasury', group: 'Catalog', desc: 'Product treasury and the store catalog' },
  categories: { label: 'Categories', group: 'Catalog', desc: 'Create and edit product categories' },
  inventory: { label: 'Inventory', group: 'Catalog', desc: 'Stock levels and stock alerts' },
  orders: { label: 'Orders', group: 'Operations', desc: 'View and update orders, place orders for sellers' },
  refunds: { label: 'Refunds', group: 'Operations', desc: 'Refund requests and decisions' },
  shipping: { label: 'Shipping', group: 'Operations', desc: 'Shipping methods and rates' },
  discounts: { label: 'Discounts', group: 'Operations', desc: 'Coupons and discount codes' },
  chat: { label: 'Support Chat', group: 'Operations', desc: 'Seller support desk and team chat' },
  finance: { label: 'Finance & Payouts', group: 'Money', desc: 'USDT wallet, deposits, withdrawals, seller limits' },
  reports: { label: 'Analytics & Reports', group: 'Money', desc: 'Sales analytics and report exports' },
  content: { label: 'Store Content', group: 'System', desc: 'Storefront banners and pages' },
  settings: { label: 'Settings', group: 'System', desc: 'Store-wide settings' },
  backup: { label: 'Database Backup', group: 'System', desc: 'Create, download and restore backups' },
  audit: { label: 'Audit Log', group: 'System', desc: 'Who did what, and when' },
  staff: { label: 'Staff & Team', group: 'System', desc: 'Admin accounts, roles and permissions' },
};

/** Does this (live) admin hold the permission? A super admin holds every permission. */
export function hasPermission(admin, permission) {
  if (!permission) return true;
  if (!admin) return false;
  return admin.role === 'super_admin' || (admin.permissions || []).includes(permission);
}

/**
 * Which permission(s) let an admin see a notification (any one of them is enough).
 * null = every admin may see it (system messages).
 */
export function notificationPerms(type = '', link = '') {
  switch (type) {
    case 'deposit':
    case 'withdrawal':
      return ['finance'];
    case 'approval':
      return /wallet|withdraw|limit/i.test(link || '') ? ['finance'] : ['sellers'];
    case 'order':
    case 'payment':
    case 'customer':
      return ['orders'];
    case 'refund':
      return ['refunds'];
    case 'stock':
      return ['inventory', 'products'];
    case 'chat':
      return ['chat'];
    default:
      return null;
  }
}

const KNOWN_NOTIFICATION_TYPES = ['deposit', 'withdrawal', 'approval', 'order', 'payment', 'customer', 'refund', 'stock', 'chat'];
const WALLET_LINK = /wallet|withdraw|limit/i;

/** Mongo filter: only the notifications this admin is allowed to see ({} for a super admin). */
export function notificationFilterFor(admin) {
  if (admin?.role === 'super_admin') return {};
  const has = (p) => hasPermission(admin, p);
  const or = [{ type: { $nin: KNOWN_NOTIFICATION_TYPES } }];
  if (has('finance')) or.push({ type: { $in: ['deposit', 'withdrawal'] } }, { type: 'approval', link: WALLET_LINK });
  if (has('sellers')) or.push({ type: 'approval', link: { $not: WALLET_LINK } });
  if (has('orders')) or.push({ type: { $in: ['order', 'payment', 'customer'] } });
  if (has('refunds')) or.push({ type: 'refund' });
  if (has('inventory') || has('products')) or.push({ type: 'stock' });
  if (has('chat')) or.push({ type: 'chat' });
  return { $or: or };
}

/** Socket.io room of the admins who hold one permission (every admin is also in 'admins'). */
export const adminRoom = (permission) => `admins:${permission}`;
