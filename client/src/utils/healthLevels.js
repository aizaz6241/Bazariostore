/**
 * Store levels (same as server/src/utils/healthEngine.js): perfect weeks IN A ROW at 100/100.
 * Bronze 2 · Silver 4 · Gold 8 · Platinum 12. Any penalty drops the store one level.
 */
export const LEVELS = [
  { key: 'starter', weeks: 0, label: 'Starter', icon: '🌱' },
  { key: 'bronze', weeks: 2, label: 'Bronze', icon: '🥉' },
  { key: 'silver', weeks: 4, label: 'Silver', icon: '🥈' },
  { key: 'gold', weeks: 8, label: 'Gold', icon: '🥇' },
  { key: 'platinum', weeks: 12, label: 'Platinum', icon: '💠' },
];
export const levelOf = (weeks) => [...LEVELS].reverse().find((l) => (Number(weeks) || 0) >= l.weeks) || LEVELS[0];
export const levelByKey = (key) => LEVELS.find((l) => l.key === key) || LEVELS[0];
