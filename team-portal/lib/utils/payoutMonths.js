/**
 * Months for payouts (pure functions: no database, no React — used by the server and the screens).
 *
 * Payouts are paid once a month: on 1–2 December the team is paid for November. A payout can
 * carry the month it is for ("forMonth": "2026-11"). This is only a label: it never changes an
 * amount, a balance or a check. The wallet balance stays the one and only limit for a payout.
 *
 * Payouts recorded before months existed carry no label. They are counted for a month like this:
 *   - a device gift: the month it was given (the gift is earned and taken out in that same month);
 *   - a payout made on the 1st–10th: the month before (paid on 1 Nov → it was for October);
 *   - any other day: its own month.
 * Months are the viewer's own calendar months (the same days the Analytics screen uses).
 */

export const MONTH_KEY_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const OLD_PAYOUT_LAST_DAY = 10; // an unlabelled payout on day 1..10 was for the month before

export function isMonthKey(key) {
  return typeof key === 'string' && MONTH_KEY_RE.test(key);
}

/** "2026-11" for a date, in the local calendar. */
export function monthKeyOf(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** "2026-11" → "November 2026" (no time zone involved). */
export function monthLabel(key, short = false) {
  if (!isMonthKey(key)) return '';
  const [y, m] = key.split('-').map(Number);
  const name = NAMES[m - 1];
  return `${short ? name.slice(0, 3) : name} ${y}`;
}

export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** First and last moment of a month, in the local calendar. */
export function monthRange(key) {
  const [y, m] = key.split('-').map(Number);
  return { from: new Date(y, m - 1, 1, 0, 0, 0, 0), to: new Date(y, m, 0, 23, 59, 59, 999) };
}

/**
 * The first month of the books. The finance start is midnight in India (30 Sep 18:30 UTC), which
 * is still 30 September in Pakistan: half a day later is safely inside the first real month.
 */
export function firstMonthKey(financeStart) {
  const t = new Date(financeStart).getTime();
  return Number.isFinite(t) ? monthKeyOf(t + 12 * 3600 * 1000) : monthKeyOf(new Date());
}

/** Month of a money movement; anything before the first month counts in the first month. */
export function movementMonthKey(date, firstKey) {
  const k = monthKeyOf(date);
  return firstKey && k < firstKey ? firstKey : k;
}

/** Months from the first month up to now, newest first. */
export function monthsSince(firstKey, now = new Date()) {
  const last = monthKeyOf(now);
  const out = [];
  for (let k = last; k >= firstKey && out.length < 120; k = addMonths(k, -1)) out.push(k);
  return out.length ? out : [last];
}

/**
 * Which month a payout counts for: its label, or (old payouts without one) the rule above.
 * Returns { key, auto } — auto = true when the month was worked out, not chosen.
 */
export function payoutMonthKey({ date, forMonth, gift }, firstKey) {
  if (isMonthKey(forMonth)) return { key: forMonth, auto: false };
  const d = new Date(date);
  let key = monthKeyOf(d);
  if (!gift && d.getDate() <= OLD_PAYOUT_LAST_DAY) key = addMonths(key, -1);
  if (firstKey && key < firstKey) key = firstKey;
  return { key, auto: true };
}

/**
 * Server check for the month sent with a payout: '' (no month — an "overall" payout) or a real
 * month that is not in the future. A day of slack because the team's calendar runs ahead of UTC.
 */
export function cleanForMonth(value) {
  if (value === undefined || value === null || value === '') return '';
  const key = String(value).trim();
  if (!isMonthKey(key)) throw new Error('Choose a valid month for this payout');
  const latest = monthKeyOf(new Date(Date.now() + 24 * 3600 * 1000));
  if (key > latest) throw new Error('A payout cannot be for a month that has not started yet');
  if (key < '2026-01') throw new Error('Choose a valid month for this payout');
  return key;
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Month by month for one wallet, from its statement (all time; GET /api/wallet?period=all).
 *   earned   = share of deposits + milestone bonuses in that month
 *   deducted = share of seller withdrawals + bonus costs in that month
 *   paid     = payouts counted for that month (its label, or the rule above)
 *   left     = what is still to pay for that month (never below 0)
 * Reserve moves are left out: they move the balance but are neither earned nor paid.
 * Display only: the wallet balance on the server is what limits a payout.
 */
export function walletMonths(transactions, firstKey) {
  const map = new Map();
  const at = (key) => {
    if (!map.has(key)) map.set(key, { key, earned: 0, deducted: 0, paid: 0, payouts: [] });
    return map.get(key);
  };
  for (const tx of transactions || []) {
    if ((tx.currency || 'USDT') !== 'USDT') continue;
    const cat = String(tx.category || '');
    if (cat.startsWith('reserve_') || cat === 'payout_reversed' || tx.type === 'activity') continue;
    const amount = Number(tx.amount) || 0;
    if (!(amount > 0)) continue;
    if (cat === 'payout_withdrawal') {
      const { key, auto } = payoutMonthKey({ date: tx.date, forMonth: tx.forMonth, gift: tx.gift }, firstKey);
      const m = at(key);
      m.paid += amount;
      m.payouts.push({ id: tx.id, date: tx.date, amount, auto, gift: tx.gift === true });
    } else if (tx.type === 'credit') {
      at(movementMonthKey(tx.date, firstKey)).earned += amount;
    } else if (tx.type === 'debit') {
      at(movementMonthKey(tx.date, firstKey)).deducted += amount;
    }
  }
  for (const m of map.values()) {
    m.earned = round2(m.earned);
    m.deducted = round2(m.deducted);
    m.paid = round2(m.paid);
    m.net = round2(m.earned - m.deducted);
    m.left = round2(Math.max(0, m.net - m.paid));
    m.payouts.sort((a, b) => new Date(a.date) - new Date(b.date));
  }
  return map;
}
