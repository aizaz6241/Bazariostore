/**
 * Account health bands (same as server/src/utils/healthEngine.js):
 *   90+ Excellent · 75+ Good · 60+ Warning · 40+ At risk · below 40 Critical
 * `tier` is the older visual class used by the dashboard gauge / top-bar chip.
 */
export const HEALTH_BANDS = [
  { key: 'excellent', min: 90, label: 'Excellent', tier: 'healthy', tone: 'green', color: '#059669', desc: 'Top standing. Eligible for higher payout limits.' },
  { key: 'good', min: 75, label: 'Good', tier: 'healthy', tone: 'green', color: '#16a34a', desc: 'Good standing. Keep confirming orders on time.' },
  { key: 'warning', min: 60, label: 'Warning', tier: 'warning', tone: 'amber', color: '#d97706', desc: 'Recent issues lowered your score. It comes back as entries end.' },
  { key: 'at_risk', min: 40, label: 'At risk', tier: 'warning', tone: 'amber', color: '#ea580c', desc: 'No payout limit increase and withdrawals are reviewed until your score is 60+.' },
  { key: 'critical', min: 0, label: 'Critical', tier: 'freeze', tone: 'red', color: '#dc2626', desc: 'Your store is under account review. Confirm every order on time to recover.' },
];

export const bandOf = (score) => {
  const s = Number.isFinite(Number(score)) ? Number(score) : 100;
  return HEALTH_BANDS.find((b) => s >= b.min) || HEALTH_BANDS[HEALTH_BANDS.length - 1];
};

export const MONITOR_NAME = 'Bazario Account Monitoring';
