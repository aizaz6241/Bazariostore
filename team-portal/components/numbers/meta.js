export const NUMBER_STATUS = {
  active: { label: 'Active', color: '#1baf7a' },
  banned: { label: 'Banned', color: '#dc2626' },
  replaced: { label: 'Replaced', color: '#7c3aed' },
  inactive: { label: 'Not in use', color: '#94a3b8' },
};

export const CURRENCIES = ['USD', 'USDT', 'GBP', 'EUR', 'AED', 'PKR', 'INR'];

// WhatsApp: one main phone + up to 4 linked devices
export const MAX_HOLDERS = 5;

/** "Renews in 3 days" / "Renewal overdue by 2 days", coloured by how urgent it is. */
export function renewalInfo(n) {
  if (!n?.nextRenewalAt) return null;
  const days = Math.ceil((new Date(n.nextRenewalAt).getTime() - Date.now()) / 86400000);
  if (days < 0) return { days, text: `Renewal overdue ${-days} day${days === -1 ? '' : 's'}`, color: '#dc2626' };
  if (days === 0) return { days, text: 'Renews today', color: '#dc2626' };
  if (days <= 7) return { days, text: `Renews in ${days} day${days === 1 ? '' : 's'}`, color: '#eda100' };
  return { days, text: `Renews in ${days} days`, color: '#94a3b8' };
}
