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
