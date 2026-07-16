export const PERMISSIONS = [
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
];

export const ROLE_DEFAULTS = {
  super_admin: [...PERMISSIONS],
  admin: PERMISSIONS.filter((p) => p !== 'staff'),
  manager: ['products', 'categories', 'orders', 'discounts', 'shipping', 'inventory', 'reports', 'content'],
  support: ['orders', 'refunds', 'chat'],
  inventory: ['products', 'inventory', 'reports'],
};

export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  manager: 'Manager',
  support: 'Customer Support',
  inventory: 'Inventory Manager',
};

export function permsFor(admin) {
  if (admin.role === 'super_admin') return [...PERMISSIONS];
  if (admin.permissions?.length) return admin.permissions;
  return ROLE_DEFAULTS[admin.role] || [];
}
