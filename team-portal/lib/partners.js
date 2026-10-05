/**
 * Who is a finance partner (shares the Binance money, may use the team portal as an admin and
 * approves the other partner's sensitive actions).
 *
 * Set on the admin account in the store admin panel (Staff → "Finance partner").
 * Accounts made before that setting existed count as partners when they are a full admin
 * (super_admin / admin), exactly as it always worked. Staff accounts (support, orders, ...) are
 * not partners: they get no share and cannot log into this portal.
 */
export function isFinancePartner(admin) {
  if (!admin) return false;
  if (admin.financePartner === true) return true;
  if (admin.financePartner === false) return false;
  return ['super_admin', 'admin'].includes(admin.role);
}

export function isActivePartner(admin) {
  return !!admin && admin.active !== false && isFinancePartner(admin);
}
