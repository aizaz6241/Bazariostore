import mongoose from 'mongoose';
import HealthEvent from '../models/HealthEvent.js';
import Seller from '../models/Seller.js';
import Withdrawal from '../models/Withdrawal.js';
import { notify } from './notify.js';
import { toAdmins, toSellers } from './realtime.js';
import { walletApply } from './wallet.js';
import { confirmHoursFor, warnHoursFor } from './sellerTier.js';

/**
 * ACCOUNT HEALTH ENGINE (points ledger, like a driving licence)
 *
 *   score = 100 + points of the active lines (between 0 and 100)
 *   every line ends by itself after 14–21 days → the score comes back on its own
 *   good behaviour adds points too (on-time streaks, clean weeks)
 *
 * Fairness:
 *   - no deadline penalty (and no freeze) while the store has a deposit waiting for OUR approval
 *     that covers the order: the delay is ours, not the store's
 *   - several orders missed within 24 hours count as ONE incident (one bad day does not end a store)
 *   - no penalty while the store is suspended; an admin can waive any line (with a reason)
 *
 * Bands: 90+ Excellent · 75+ Good · 60+ Warning · 40+ At risk · below 40 Critical
 *   At risk / Critical: no payout limit increase; withdrawals are flagged for review;
 *   Critical: listed on the admin Today page for review. Suspension is never automatic.
 *
 * Stores only ever see "Bazario Account Monitoring" as the source of a line.
 */

export const MONITOR_NAME = 'Bazario Account Monitoring';

/** Default rules; a super admin can change points and days (collection `healthrules`). */
export const DEFAULT_RULES = {
  late_confirm: { points: -5, days: 14, title: 'Order confirmed late', help: 'Confirmed after the warning time (but before the deadline).' },
  wallet_short: { points: -8, days: 14, title: 'Order waiting — wallet balance too low', help: 'An order reached its warning time and the wallet could not cover it (once a day).' },
  deadline_miss: { points: -20, days: 21, title: 'Confirmation deadline missed', help: 'An order was not confirmed by its deadline. The store is frozen too.' },
  deadline_repeat: { points: -30, days: 21, title: 'Confirmation deadline missed again', help: 'A second missed deadline within the repeat window.' },
  deadline_third: { points: -40, days: 21, title: 'Deadlines missed repeatedly', help: 'A third (or later) missed deadline within the repeat window.' },
  extra_order: { points: -5, days: 21, title: 'Another order missed in the same incident', help: 'Each extra order missed together with the first one.' },
  overdue_daily: { points: -10, days: 21, title: 'Order still not confirmed after the deadline', help: 'Every 24 hours an order stays unconfirmed after its deadline.' },
  order_issue: { points: -10, days: 21, title: 'Order cancelled / refunded because of the store', help: 'Added on review when the store caused a cancellation or refund.' },
  deposit_rejected: { points: -25, days: 21, title: 'Deposit request rejected', help: 'A deposit was rejected (wrong or invalid payment proof).' },
  duplicate_proof: { points: -50, days: 21, title: 'Payment reference already used', help: 'A deposit used a UTR / reference that was already credited before.' },
  policy: { points: -20, days: 21, title: 'Policy violation', help: 'Added on review for a breach of the seller policy (−10 to −40).' },
  streak_bonus: { points: 3, days: 14, title: 'Orders confirmed on time', help: 'Every 10 orders in a row confirmed before the warning time.' },
  clean_week: { points: 2, days: 14, title: 'Clean week', help: 'A week with order activity and no violation.' },
  manual: { points: 0, days: 21, title: 'Account review', help: 'Adjustment after an account review.' },
  opening: { points: 0, days: 21, title: 'Previous health record', help: 'The score from before this monitoring system; it ends by itself.' },
};
// bonusCap: reward points that count at the same time (more rewards never hide penalties)
// perfectBonus*: a store that keeps 100/100 for `perfectBonusDays` days in a row (with at least
// `perfectBonusMinOrders` orders confirmed in that time) gets `perfectBonusAmount` $ in its wallet
export const DEFAULT_SETTINGS = {
  repeatWindowDays: 21,
  incidentWindowHours: 24,
  streakSize: 10,
  bonusCap: 10,
  perfectBonusAmount: 50,
  perfectBonusDays: 7,
  perfectBonusMinOrders: 1,
};
const EDITABLE = ['late_confirm', 'wallet_short', 'deadline_miss', 'deadline_repeat', 'deadline_third', 'extra_order', 'overdue_daily', 'order_issue', 'deposit_rejected', 'duplicate_proof', 'policy', 'streak_bonus', 'clean_week'];

export const BANDS = [
  { key: 'excellent', min: 90, label: 'Excellent', status: 'healthy' },
  { key: 'good', min: 75, label: 'Good', status: 'healthy' },
  { key: 'warning', min: 60, label: 'Warning', status: 'at_risk' },
  { key: 'at_risk', min: 40, label: 'At risk', status: 'at_risk' },
  { key: 'critical', min: 0, label: 'Critical', status: 'critical_risk' },
];
export const bandOf = (score) => BANDS.find((b) => (Number(score) || 0) >= b.min) || BANDS[BANDS.length - 1];
/** Below this, no payout-limit increase and withdrawals are flagged (At risk and Critical). */
export const LIMIT_MIN_SCORE = 60;

const DAY = 86400000;

/**
 * LEVELS — perfect weeks IN A ROW (a full bonus week at 100/100 with the needed confirmed orders).
 * Status only (a badge and a title), no money. A penalty drops the store ONE level (at most once a
 * day); a week with no orders is neutral (it neither counts nor breaks the run).
 * Counted from PROGRAM_START: the weeks before this feature are filled in once from the store's
 * record (no money is paid for those weeks).
 */
export const PROGRAM_START = new Date('2026-10-01T00:00:00.000Z');
export const LEVELS = [
  { key: 'starter', weeks: 0, label: 'Starter', icon: '🌱' },
  { key: 'bronze', weeks: 2, label: 'Bronze', icon: '🥉' },
  { key: 'silver', weeks: 4, label: 'Silver', icon: '🥈' },
  { key: 'gold', weeks: 8, label: 'Gold', icon: '🥇' },
  { key: 'platinum', weeks: 12, label: 'Platinum', icon: '💠' },
];
export const levelOf = (weeks) => [...LEVELS].reverse().find((l) => (Number(weeks) || 0) >= l.weeks) || LEVELS[0];
export const nextLevelOf = (weeks) => LEVELS.find((l) => l.weeks > (Number(weeks) || 0)) || null;
/** The run after a penalty: the start of the level below (Silver 6 weeks → Bronze 2 weeks). */
export const dropOneLevel = (weeks) => {
  const i = LEVELS.indexOf(levelOf(weeks));
  return i <= 0 ? 0 : LEVELS[i - 1].weeks;
};
const lvName = (l) => `${l.icon} ${l.label}`;
export function levelInfo(ah = {}) {
  const weeks = Number(ah.perfectWeeks) || 0;
  const cur = levelOf(weeks);
  const next = nextLevelOf(weeks);
  const dropTo = levelOf(dropOneLevel(weeks));
  return {
    key: cur.key,
    label: cur.label,
    icon: cur.icon,
    weeks,
    best: Math.max(weeks, Number(ah.bestPerfectWeeks) || 0),
    total: Number(ah.totalPerfectWeeks) || 0,
    next: next ? { key: next.key, label: next.label, icon: next.icon, weeks: next.weeks, need: next.weeks - weeks } : null,
    dropTo: weeks > 0 ? { key: dropTo.key, label: dropTo.label, icon: dropTo.icon, weeks: dropOneLevel(weeks) } : null,
    levels: LEVELS,
  };
}

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const isId = (v) => mongoose.Types.ObjectId.isValid(String(v || ''));
const active = (now = new Date()) => ({ 'waived.at': null, expiresAt: { $gt: now } });

let APP = null;
export const setHealthApp = (app) => {
  APP = app;
};
const appRef = () => APP || { get: () => null };

// ─── rules (defaults + super admin changes), cached for a minute ───
let rulesCache = { at: 0, rules: null, settings: null };
export async function getRules() {
  if (rulesCache.rules && Date.now() - rulesCache.at < 60000) return rulesCache;
  const rules = JSON.parse(JSON.stringify(DEFAULT_RULES));
  const settings = { ...DEFAULT_SETTINGS };
  try {
    const doc = mongoose.connection.readyState === 1 ? await mongoose.connection.collection('healthrules').findOne({ _id: 'rules' }) : null;
    for (const [code, v] of Object.entries(doc?.rules || {})) {
      if (!rules[code] || !EDITABLE.includes(code)) continue;
      if (Number.isFinite(v?.points)) rules[code].points = v.points;
      if (Number.isFinite(v?.days)) rules[code].days = v.days;
    }
    for (const k of Object.keys(DEFAULT_SETTINGS)) if (Number.isFinite(doc?.settings?.[k])) settings[k] = doc.settings[k];
    rulesCache = { at: Date.now(), rules, settings, updatedAt: doc?.updatedAt || null, updatedBy: doc?.updatedBy || '' };
  } catch (e) {
    console.error('[health] rules:', e.message);
    rulesCache = { at: Date.now(), rules, settings };
  }
  return rulesCache;
}

/** Super admin: change points / days of the rules. */
export async function saveRules(input, admin) {
  const set = {};
  for (const code of EDITABLE) {
    const v = input?.rules?.[code];
    if (!v) continue;
    const base = DEFAULT_RULES[code];
    const positive = base.points > 0;
    const points = Math.round(Number(v.points));
    const days = Math.round(Number(v.days));
    if (!Number.isFinite(points) || !Number.isFinite(days)) continue;
    if (positive ? points < 0 || points > 20 : points > 0 || points < -60) throw Object.assign(new Error(`Points for “${base.title}” are out of range.`), { status: 400 });
    if (days < 1 || days > 90) throw Object.assign(new Error(`Days for “${base.title}” must be 1–90.`), { status: 400 });
    set[`rules.${code}`] = { points, days };
  }
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    const n = Math.round(Number(input?.settings?.[k]));
    if (!Number.isFinite(n)) continue;
    const ok =
      k === 'streakSize' ? n >= 3 && n <= 50
      : k === 'incidentWindowHours' ? n >= 1 && n <= 72
      : k === 'bonusCap' ? n >= 0 && n <= 30
      : k === 'perfectBonusAmount' ? n >= 0 && n <= 1000
      : k === 'perfectBonusDays' ? n >= 1 && n <= 60
      : k === 'perfectBonusMinOrders' ? n >= 0 && n <= 100
      : n >= 1 && n <= 90;
    if (!ok) throw Object.assign(new Error(`Setting ${k} is out of range.`), { status: 400 });
    set[`settings.${k}`] = n;
  }
  await mongoose.connection.collection('healthrules').updateOne({ _id: 'rules' }, { $set: { ...set, updatedAt: new Date(), updatedBy: admin?.name || '' } }, { upsert: true });
  rulesCache = { at: 0 };
  return getRules();
}

// ─── migration: the old score becomes one "previous record" line that ends by itself ───
async function ensureOpening(sellerId) {
  const s = await Seller.findOne({ _id: oid(sellerId), 'accountHealth.engine': { $ne: 2 } }).select('accountHealth.score').lean();
  if (!s) return;
  const score = Number.isFinite(s.accountHealth?.score) ? s.accountHealth.score : 100;
  if (score < 100) {
    const { rules } = await getRules();
    const days = rules.opening.days;
    await HealthEvent.updateOne(
      { key: `opening:${sellerId}` },
      {
        $setOnInsert: {
          seller: oid(sellerId),
          code: 'opening',
          points: score - 100,
          title: rules.opening.title,
          detail: 'Your score from before the new account monitoring. It is removed automatically.',
          key: `opening:${sellerId}`,
          source: 'system',
          expiresAt: new Date(Date.now() + days * DAY),
        },
      },
      { upsert: true }
    );
  }
  await Seller.updateOne({ _id: oid(sellerId) }, { $set: { 'accountHealth.engine': 2 } });
}

const REWARD_CODES = ['streak_bonus', 'clean_week'];
/**
 * 100 + active points. Penalties and admin adjustments count in full; earned rewards (streaks,
 * clean weeks) only up to `bonusCap` together, so a busy store cannot "bank" points that hide
 * its penalties.
 */
export function rawScore(lines, settings) {
  let rewards = 0;
  let other = 0;
  for (const l of lines) {
    const p = Number(l.points) || 0;
    if (p > 0 && REWARD_CODES.includes(l.code)) rewards += p;
    else other += p;
  }
  return 100 + other + Math.min(settings?.bonusCap ?? DEFAULT_SETTINGS.bonusCap, rewards);
}

/**
 * Work the score out again from the active lines and store it on the seller (with a history line
 * when it changed). Live update to the store's screens and the admin panel.
 */
export async function recomputeHealth(sellerId, { reason = '' } = {}) {
  if (!isId(sellerId)) return null;
  await ensureOpening(sellerId);
  const now = new Date();
  const lines = await HealthEvent.find({ seller: oid(sellerId), ...active(now) }).select('code points expiresAt').lean();
  const { settings } = await getRules();
  const score = clamp(rawScore(lines, settings));
  const nextChangeAt = lines.length ? new Date(Math.min(...lines.map((l) => new Date(l.expiresAt).getTime()))) : null;

  const seller = await Seller.findById(sellerId).select('status accountHealth.score accountHealth.band accountHealth.perfectSince').lean();
  if (!seller) return null;
  const prev = Number.isFinite(seller.accountHealth?.score) ? seller.accountHealth.score : 100;
  const band = bandOf(score);
  const status = seller.status === 'frozen' ? 'frozen' : seller.status === 'suspended' ? 'suspended' : band.status;

  const update = {
    $set: {
      'accountHealth.score': score,
      'accountHealth.band': band.key,
      'accountHealth.status': status,
      'accountHealth.lastEvaluatedAt': now,
      'accountHealth.nextChangeAt': nextChangeAt,
      'accountHealth.engine': 2,
    },
  };
  // perfect-health bonus timer: runs while the store is active at 100/100, stops below 100
  if (score === 100 && seller.status === 'active') {
    if (!seller.accountHealth?.perfectSince) update.$set['accountHealth.perfectSince'] = now;
  } else if (seller.accountHealth?.perfectSince) {
    update.$set['accountHealth.perfectSince'] = null;
  }
  if (prev !== score) {
    update.$push = {
      'accountHealth.history': {
        $each: [{ previousScore: prev, newScore: score, delta: score - prev, reason: reason || 'Account review', changedBy: MONITOR_NAME, createdAt: now }],
        $position: 0,
        $slice: 50,
      },
    };
  }
  await Seller.updateOne({ _id: oid(sellerId) }, update);
  const fresh = await Seller.findById(sellerId).select('accountHealth').lean();
  toSellers([sellerId], 'seller:health_update', { accountHealth: fresh?.accountHealth });
  toAdmins('sellers', 'seller:health_update', { sellerId: String(sellerId), accountHealth: fresh?.accountHealth });
  if (prev !== score) toAdmins('sellers', 'sellers:changed', { sellerId: String(sellerId) });
  return { score, prev, band: band.key, bandChanged: bandOf(prev).key !== band.key, nextChangeAt };
}

/** Send the store's fresh account health to its screens (after a level / bonus change). */
async function emitHealth(sellerId) {
  const fresh = await Seller.findById(sellerId).select('accountHealth').lean();
  toSellers([sellerId], 'seller:health_update', { accountHealth: fresh?.accountHealth });
  toAdmins('sellers', 'seller:health_update', { sellerId: String(sellerId), accountHealth: fresh?.accountHealth });
}

/**
 * Add one line. `key` makes it happen once per real event. Returns the line (null when the same
 * key was already there, or when the store is suspended / a test account and `force` is not set).
 */
export async function addHealthEvent({
  sellerId,
  code,
  points,
  days,
  title,
  detail = '',
  key,
  orderId = null,
  orderNumber = '',
  admin = null,
  note = '',
  notifySeller = true,
  force = false,
}) {
  if (!isId(sellerId)) return null;
  const { rules } = await getRules();
  const rule = rules[code] || rules.manual;
  const pts = Math.round(Number(points ?? rule.points));
  const d = Math.max(1, Math.round(Number(days ?? rule.days) || 21));
  if (!pts) return null;
  const before = await Seller.findById(sellerId).select('status isTestAccount accountType accountHealth.perfectSince accountHealth.perfectWeeks accountHealth.levelDroppedAt').lean();
  if (!before) return null;
  if (!force && before.status === 'suspended') return null;
  await ensureOpening(sellerId);

  const doc = {
    seller: oid(sellerId),
    code,
    points: pts,
    title: String(title || rule.title).slice(0, 160),
    detail: String(detail || '').slice(0, 500),
    orderNumbers: orderNumber ? [String(orderNumber)] : undefined,
    orderId: orderId && isId(orderId) ? oid(orderId) : null,
    source: admin ? 'admin' : 'system',
    adminId: admin ? String(admin.id || '') : '',
    adminName: admin ? String(admin.name || '') : '',
    note: String(note || '').slice(0, 500),
    expiresAt: new Date(Date.now() + d * DAY),
  };
  let line;
  if (key) {
    const r = await HealthEvent.updateOne({ key }, { $setOnInsert: { ...doc, key } }, { upsert: true });
    if (!r.upsertedCount) return null;
    line = await HealthEvent.findOne({ key }).lean();
  } else {
    line = (await HealthEvent.create(doc)).toObject();
  }

  const res = await recomputeHealth(sellerId, { reason: `${line.title}${line.orderNumbers?.length ? ` (#${line.orderNumbers.join(', #')})` : ''}` });
  // a penalty always restarts the perfect-health bonus week (even when rewards keep the score at
  // 100) and drops the store one level (at most once in 24 hours: one bad day = one level)
  let lost = '';
  if (pts < 0) {
    const ah = before.accountHealth || {};
    const set = { 'accountHealth.perfectSince': res?.score === 100 ? new Date() : null };
    try {
      const { settings } = await getRules();
      const amount = Number(settings.perfectBonusAmount) || 0;
      const bonusDays = Number(settings.perfectBonusDays) || 7;
      if (amount > 0 && ah.perfectSince && before.status === 'active') {
        const day = Math.min(bonusDays, Math.floor((Date.now() - new Date(ah.perfectSince).getTime()) / DAY) + 1);
        lost += ` Your $${amount} bonus week restarted (you were on day ${day} of ${bonusDays}).`;
      }
      const weeks = Number(ah.perfectWeeks) || 0;
      const droppedRecently = ah.levelDroppedAt && Date.now() - new Date(ah.levelDroppedAt).getTime() < DAY;
      if (weeks > 0 && !droppedRecently) {
        const to = dropOneLevel(weeks);
        set['accountHealth.perfectWeeks'] = to;
        set['accountHealth.levelDroppedAt'] = new Date();
        await HealthEvent.updateOne({ _id: line._id }, { $set: { weeksBefore: weeks } });
        lost +=
          levelOf(weeks).key !== levelOf(to).key
            ? ` Level: ${lvName(levelOf(weeks))} → ${lvName(levelOf(to))}.`
            : ` Your run of perfect weeks restarted (${weeks} → ${to}).`;
      }
    } catch (e) {
      console.error('[health] level drop:', e.message);
    }
    await Seller.updateOne({ _id: oid(sellerId) }, { $set: set });
    if (set['accountHealth.perfectWeeks'] !== undefined) await emitHealth(sellerId);
  }
  if (notifySeller) {
    notify(appRef(), {
      recipientType: 'seller',
      sellerId: String(sellerId),
      type: pts < 0 ? 'compliance' : 'approval',
      title: `🛡️ Account health ${pts > 0 ? `+${pts}` : pts}: ${line.title}`,
      body: `${line.detail ? `${line.detail} ` : ''}Score now ${res?.score ?? '—'}/100.${lost} — ${MONITOR_NAME}`,
      link: '/seller/health',
    });
  }
  return { line, ...res };
}

/** Admin: take a line back (it stays in the history as "removed after review"). */
export async function waiveHealthEvent(eventId, admin, reason) {
  if (!isId(eventId)) throw Object.assign(new Error('Entry not found'), { status: 404 });
  const line = await HealthEvent.findOneAndUpdate(
    { _id: oid(eventId), 'waived.at': null },
    { $set: { waived: { at: new Date(), by: admin?.name || 'Admin', byId: String(admin?.id || ''), reason: String(reason || '').slice(0, 300) } } },
    { new: true }
  ).lean();
  if (!line) throw Object.assign(new Error('This entry was already removed.'), { status: 400 });
  const res = await recomputeHealth(line.seller, { reason: `Removed after review: ${line.title}` });
  // this entry dropped the store's level: give the run back (only when nothing else went wrong since)
  if (line.points < 0 && Number(line.weeksBefore) > 0) {
    const other = await HealthEvent.exists({
      seller: line.seller,
      _id: { $ne: line._id },
      points: { $lt: 0 },
      code: { $ne: 'opening' },
      'waived.at': null,
      createdAt: { $gte: line.createdAt },
    });
    if (!other) {
      await Seller.updateOne({ _id: line.seller, 'accountHealth.perfectWeeks': { $lt: line.weeksBefore } }, { $set: { 'accountHealth.perfectWeeks': line.weeksBefore } });
      await emitHealth(line.seller);
    }
  }
  if (line.points < 0) {
    notify(appRef(), {
      recipientType: 'seller',
      sellerId: String(line.seller),
      type: 'approval',
      title: `🛡️ Account health: entry removed`,
      body: `“${line.title}” was removed after review. Score now ${res?.score ?? '—'}/100. — ${MONITOR_NAME}`,
      link: '/seller/health',
    });
  }
  return { line, ...res };
}

/** Admin's old "set the score to X" becomes one adjustment line for the difference. */
export async function setScoreAsAdjustment(sellerId, target, admin, reason, days) {
  const now = await recomputeHealth(sellerId);
  const goal = clamp(target);
  if (now && now.score === goal) return { score: goal, unchanged: true };
  // from the RAW total (it can be above 100 when bonus points are active), so the score really
  // lands on the number the admin chose
  const lines = await HealthEvent.find({ seller: oid(sellerId), ...active() }).select('code points').lean();
  const raw = rawScore(lines, (await getRules()).settings);
  const diff = goal - (goal === 100 ? Math.min(raw, 100) : raw);
  if (!diff) return { score: now?.score ?? goal, unchanged: true };
  return addHealthEvent({
    sellerId,
    code: 'manual',
    points: diff,
    days,
    title: diff < 0 ? 'Account review' : 'Account review — score improved',
    detail: String(reason || '').slice(0, 300),
    admin,
    note: reason,
    force: true,
  });
}

// ─── rules used by the order / wallet code ───

/** Waiting deposits (not yet approved by us) that, with the balance, cover `needed`. */
export async function depositWaitingCovers(sellerId, needed) {
  const [s, pending] = await Promise.all([
    Seller.findById(sellerId).select('wallet.balance').lean(),
    Withdrawal.find({ seller: oid(sellerId), type: 'deposit', status: { $in: ['pending', 'processing'] } }).select('amount').lean(),
  ]);
  const waiting = pending.reduce((t, w) => t + (Number(w.amount) || 0), 0);
  if (!waiting) return false;
  return (Number(s?.wallet?.balance) || 0) + waiting >= (Number(needed) || 0) - 0.01;
}

/**
 * A store missed an order's confirmation deadline. Several misses within the incident window are
 * one incident (the order numbers are added to it). A miss within the repeat window of an earlier
 * incident costs more.
 */
export async function recordDeadlineMiss(sellerId, order, hours) {
  const { settings } = await getRules();
  const now = Date.now();
  const sid = oid(sellerId);
  const orderNumber = String(order?.orderNumber || '');
  const DEADLINE_CODES = ['deadline_miss', 'deadline_repeat', 'deadline_third'];
  await Seller.updateOne({ _id: sid }, { $set: { 'accountHealth.onTimeStreak': 0 } });

  // another order of the same incident (within the incident window): −5 for each extra order
  const same = await HealthEvent.findOne({
    seller: sid,
    code: { $in: DEADLINE_CODES },
    'waived.at': null,
    createdAt: { $gt: new Date(now - settings.incidentWindowHours * 3600000) },
  })
    .sort({ createdAt: -1 })
    .lean();
  if (same) {
    if (orderNumber) await HealthEvent.updateOne({ _id: same._id }, { $addToSet: { orderNumbers: orderNumber } });
    const r = await addHealthEvent({
      sellerId,
      code: 'extra_order',
      key: `extra_order:${sellerId}:${order?._id}`,
      orderId: order?._id,
      orderNumber,
      detail: `Order #${orderNumber} was not confirmed within ${hours} hours either.`,
    });
    return { grouped: true, ...(r || (await recomputeHealth(sellerId))) };
  }

  // the ladder: 1st incident in the repeat window −20, 2nd −30, 3rd and later −40
  const earlier = await HealthEvent.countDocuments({
    seller: sid,
    code: { $in: DEADLINE_CODES },
    'waived.at': null,
    createdAt: { $gt: new Date(now - settings.repeatWindowDays * DAY) },
  });
  const code = earlier >= 2 ? 'deadline_third' : earlier === 1 ? 'deadline_repeat' : 'deadline_miss';
  return addHealthEvent({
    sellerId,
    code,
    key: `deadline:${sellerId}:${order?._id}`,
    orderId: order?._id,
    orderNumber,
    detail: `Order #${orderNumber} was not confirmed within ${hours} hours.${earlier ? ` This is missed deadline number ${earlier + 1} in the last ${settings.repeatWindowDays} days.` : ''}`,
  });
}

/** An order is still not confirmed 24 h, 48 h … after its deadline: −10 for every full day. */
export async function recordOverdue(sellerId, order, daysOver) {
  if (!(daysOver >= 1)) return null;
  return addHealthEvent({
    sellerId,
    code: 'overdue_daily',
    key: `overdue:${sellerId}:${order?._id}:${daysOver}`,
    orderId: order?._id,
    orderNumber: order?.orderNumber,
    detail: `Order #${order?.orderNumber} is still not confirmed, ${daysOver} day${daysOver > 1 ? 's' : ''} after its deadline. Confirm it or contact support.`,
  });
}

/** A store confirmed an order: on time → streak (+ bonus every N), after the warning → small penalty. */
export async function recordConfirmation(sellerId, order, { waitedHours, warnHours }) {
  try {
    const { settings } = await getRules();
    if (waitedHours >= warnHours) {
      await Seller.updateOne({ _id: oid(sellerId) }, { $set: { 'accountHealth.onTimeStreak': 0 } });
      return addHealthEvent({
        sellerId,
        code: 'late_confirm',
        key: `late_confirm:${sellerId}:${order._id}`,
        orderId: order._id,
        orderNumber: order.orderNumber,
        detail: `Order #${order.orderNumber} was confirmed after ${Math.floor(waitedHours)} hours (the warning time is ${warnHours} hours).`,
      });
    }
    const s = await Seller.findOneAndUpdate({ _id: oid(sellerId) }, { $inc: { 'accountHealth.onTimeStreak': 1 } }, { new: true }).select('accountHealth.onTimeStreak').lean();
    const streak = s?.accountHealth?.onTimeStreak || 0;
    if (streak > 0 && streak % settings.streakSize === 0) {
      return addHealthEvent({
        sellerId,
        code: 'streak_bonus',
        key: `streak:${sellerId}:${order._id}`,
        orderId: order._id,
        detail: `${settings.streakSize} orders in a row confirmed on time. Keep it up!`,
      });
    }
  } catch (e) {
    console.error('[health] confirmation:', e.message);
  }
  return null;
}

// ─── background: lines that ended, clean-week rewards, first migration ───
let lastCleanWeekRun = 0;
const isoWeek = (d) => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y0) / DAY + 1) / 7)).padStart(2, '0')}`;
};

export async function cleanWeekRewards() {
  const Order = mongoose.model('Order');
  const now = new Date();
  const since = new Date(now.getTime() - 7 * DAY);
  // stores that confirmed orders this week
  const busy = await Order.distinct('items.seller', { statusHistory: { $elemMatch: { status: 'confirmed', at: { $gte: since } } } });
  if (!busy.length) return;
  const bad = new Set(
    (await HealthEvent.distinct('seller', { points: { $lt: 0 }, code: { $ne: 'opening' }, createdAt: { $gte: since }, 'waived.at': null })).map(String)
  );
  const sellers = await Seller.find({ _id: { $in: busy }, status: 'active', isTestAccount: { $ne: true }, createdAt: { $lt: since } }).select('_id').lean();
  const week = isoWeek(now);
  for (const s of sellers) {
    const id = String(s._id);
    if (bad.has(id)) continue;
    await addHealthEvent({ sellerId: id, code: 'clean_week', key: `clean_week:${id}:${week}`, detail: 'A full week of orders without any violation.' });
  }
}

/**
 * PERFECT HEALTH BONUS: a store that stays at 100/100 for N days in a row (default 7) — no penalty
 * at all in that time, store active, at least M orders confirmed (default 1, so a store doing
 * nothing is not paid) — gets $X (default 50) in its wallet, as a proper wallet line. The next
 * week starts at once. Paid once per week: the week is claimed first (in one database step), and
 * the wallet step carries the week's id, so a second server or a retry can never pay twice.
 * The same full week also counts for the store's LEVEL (even when the bonus amount is set to 0).
 */
const confirmedBetween = (sellerId, from, to) => {
  const at = { $gte: from };
  if (to) at.$lt = to;
  return mongoose.model('Order').countDocuments({ 'items.seller': sellerId, statusHistory: { $elemMatch: { status: 'confirmed', at } } });
};

export async function perfectHealthBonuses() {
  const { settings } = await getRules();
  const amount = Number(settings.perfectBonusAmount) || 0;
  const days = Number(settings.perfectBonusDays) || 7;
  const minOrders = Number(settings.perfectBonusMinOrders) || 0;
  const now = new Date();
  // stores already at 100 (e.g. before this feature) start their week now
  await Seller.updateMany(
    {
      status: 'active',
      isTestAccount: { $ne: true },
      accountType: { $ne: 'test' },
      $or: [{ 'accountHealth.score': 100 }, { 'accountHealth.score': { $exists: false } }],
      'accountHealth.perfectSince': null,
    },
    { $set: { 'accountHealth.perfectSince': now } }
  );

  const due = await Seller.find({
    status: 'active',
    isTestAccount: { $ne: true },
    accountType: { $ne: 'test' },
    'accountHealth.score': 100,
    'accountHealth.perfectSince': { $ne: null, $lte: new Date(now.getTime() - days * DAY) },
  })
    .select('storeName accountHealth.perfectSince')
    .limit(500)
    .lean();
  for (const s of due) {
    const since = new Date(s.accountHealth.perfectSince);
    // claim this week (the next one starts now); only the request that claims it pays
    const claimed = await Seller.updateOne(
      { _id: s._id, 'accountHealth.perfectSince': since, 'accountHealth.score': 100, status: 'active' },
      { $set: { 'accountHealth.perfectSince': now } }
    );
    if (!claimed.modifiedCount) continue;

    // no penalty in the week (a cushion of rewards can hide a small one from the score)
    const penalty = await HealthEvent.exists({ seller: s._id, points: { $lt: 0 }, createdAt: { $gte: since }, 'waived.at': null });
    if (penalty) continue;
    const orders = await confirmedBetween(s._id, since);
    if (orders < minOrders) {
      // a week without orders: no bonus, and neutral for the level (the run is kept)
      if (amount > 0) {
        notify(appRef(), {
          recipientType: 'seller',
          sellerId: String(s._id),
          type: 'system',
          title: '🛡️ Perfect health week — no bonus this time',
          body: `Your score stayed 100/100 for ${days} days, but the bonus needs at least ${minOrders} confirmed order${minOrders > 1 ? 's' : ''} in that week. A new week has started. — ${MONITOR_NAME}`,
          link: '/seller/health',
        });
      }
      continue;
    }

    // a perfect week: +1 to the run (level)
    const after = await Seller.findOneAndUpdate(
      { _id: s._id },
      { $inc: { 'accountHealth.perfectWeeks': 1, 'accountHealth.totalPerfectWeeks': 1 } },
      { new: true }
    )
      .select('accountHealth.perfectWeeks')
      .lean();
    const weeks = Number(after?.accountHealth?.perfectWeeks) || 1;
    await Seller.updateOne({ _id: s._id }, { $max: { 'accountHealth.bestPerfectWeeks': weeks } });
    const lvNow = levelOf(weeks);
    const levelUp = lvNow.key !== levelOf(weeks - 1).key;
    const next = nextLevelOf(weeks);
    const nextTxt = levelUp
      ? ` You reached ${lvName(lvNow)} level!`
      : next
        ? ` ${next.weeks - weeks} more perfect week${next.weeks - weeks > 1 ? 's' : ''} to ${lvName(next)}.`
        : '';

    let paidAmount = 0;
    if (amount > 0) {
      const weekId = `health_bonus:${s._id}:${since.toISOString()}`;
      const paid = await walletApply(s._id, { balance: amount, totalEarned: amount }, { opId: weekId, extraInc: { 'accountHealth.perfectBonusTotal': amount, 'accountHealth.perfectBonusCount': 1 } });
      if (paid && !paid.already) {
        paidAmount = amount;
        await Seller.updateOne({ _id: s._id }, { $set: { 'accountHealth.lastPerfectBonusAt': now } });
        try {
          await Withdrawal.create({
            type: 'adjustment',
            seller: s._id,
            storeName: s.storeName,
            amount,
            approvedAmount: amount,
            balanceAfter: paid.wallet.balance,
            isManualAdjustment: true,
            status: 'approved',
            adminNote: `🛡️ Perfect Health Bonus: ${days} days at 100/100 (${since.toISOString().slice(0, 10)} → ${now.toISOString().slice(0, 10)}, ${orders} order${orders > 1 ? 's' : ''} confirmed)`,
            processedAt: now,
            processedBy: MONITOR_NAME,
          });
        } catch (e) {
          // the money has already moved correctly; a missing history line must not undo or repeat it
          console.error('[health] bonus ledger line:', e.message);
        }
        toSellers([s._id], 'wallet:update', { type: 'health_bonus', amount, balance: paid.wallet.balance });
        toAdmins('finance', 'withdrawal:changed', { sellerId: String(s._id) });
      }
    }

    if (paidAmount || levelUp) {
      await Seller.updateOne(
        { _id: s._id },
        { $set: { 'accountHealth.pendingCelebration': { kind: levelUp ? 'level' : 'bonus', amount: paidAmount, level: lvNow.key, weeks, at: now } } }
      );
    }
    if (paidAmount) {
      notify(appRef(), {
        recipientType: 'seller',
        sellerId: String(s._id),
        type: 'approval',
        title: `🏆 Perfect Health Bonus: +$${paidAmount} added to your wallet`,
        body: `Your account health stayed 100/100 for ${days} days. $${paidAmount} has been added to your balance.${nextTxt} Your next bonus week has started. — ${MONITOR_NAME}`,
        link: '/seller/health',
      });
    } else if (levelUp) {
      notify(appRef(), {
        recipientType: 'seller',
        sellerId: String(s._id),
        type: 'approval',
        title: `${lvNow.icon} New level: ${lvNow.label}`,
        body: `${weeks} perfect weeks in a row — you are now ${lvName(lvNow)}. Any penalty drops you one level, so keep every order on time. — ${MONITOR_NAME}`,
        link: '/seller/health',
      });
    }
    await emitHealth(s._id);
  }
}

/**
 * Levels from PROGRAM_START (1 Oct 2026), filled in ONCE per store from its record: the time since
 * then (or since the store opened) in 7-day blocks — a block with any score drop is a penalty
 * (one level down), a clean block with the needed confirmed orders is a perfect week, a block
 * without orders is neutral. No money for these weeks; the store just starts on its real level.
 */
export async function backfillLevels(limit = 50) {
  const { settings } = await getRules();
  const minOrders = Number(settings.perfectBonusMinOrders) || 0;
  const now = Date.now();
  const list = await Seller.find({ 'accountHealth.levelsBackfilled': { $ne: true } })
    .select('createdAt isTestAccount accountType accountHealth.history')
    .limit(limit)
    .lean();
  for (const s of list) {
    let weeks = 0;
    let best = 0;
    let total = 0;
    const test = s.isTestAccount === true || s.accountType === 'test';
    if (!test) {
      const start = Math.max(PROGRAM_START.getTime(), new Date(s.createdAt || now).getTime());
      const drops = (s.accountHealth?.history || []).filter((h) => Number(h.delta) < 0 && h.createdAt).map((h) => new Date(h.createdAt).getTime());
      const lines = await HealthEvent.find({ seller: s._id, points: { $lt: 0 }, code: { $ne: 'opening' }, 'waived.at': null, createdAt: { $gte: new Date(start) } })
        .select('createdAt')
        .lean();
      const bad = [...drops, ...lines.map((l) => new Date(l.createdAt).getTime())];
      for (let a = start; a + 7 * DAY <= now; a += 7 * DAY) {
        const b = a + 7 * DAY;
        if (bad.some((t) => t >= a && t < b)) {
          weeks = dropOneLevel(weeks);
          continue;
        }
        const orders = await confirmedBetween(s._id, new Date(a), new Date(b));
        if (orders >= minOrders && (minOrders > 0 || orders > 0)) {
          weeks += 1;
          total += 1;
          best = Math.max(best, weeks);
        }
      }
    }
    const r = await Seller.updateOne(
      { _id: s._id, 'accountHealth.levelsBackfilled': { $ne: true } },
      {
        $set: { 'accountHealth.levelsBackfilled': true },
        $inc: { 'accountHealth.perfectWeeks': weeks, 'accountHealth.totalPerfectWeeks': total },
        $max: { 'accountHealth.bestPerfectWeeks': best },
      }
    );
    if (r.modifiedCount && weeks > 0) {
      const lv = levelOf(weeks);
      if (lv.key !== 'starter') {
        await Seller.updateOne(
          { _id: s._id, 'accountHealth.pendingCelebration': null },
          { $set: { 'accountHealth.pendingCelebration': { kind: 'level', amount: 0, level: lv.key, weeks, at: new Date(), since: PROGRAM_START } } }
        );
        notify(appRef(), {
          recipientType: 'seller',
          sellerId: String(s._id),
          type: 'approval',
          title: `${lv.icon} Your store level: ${lv.label}`,
          body: `${weeks} perfect weeks in a row on your record since 1 October. Keep your account health at 100/100 to climb higher — any penalty drops you one level. — ${MONITOR_NAME}`,
          link: '/seller/health',
        });
      }
      await emitHealth(s._id);
    }
  }
}

/** "1 day left" — once per bonus week, on its last day (only when something is to be won). */
export async function weekNudges() {
  const { settings } = await getRules();
  const amount = Number(settings.perfectBonusAmount) || 0;
  const days = Number(settings.perfectBonusDays) || 7;
  const minOrders = Number(settings.perfectBonusMinOrders) || 0;
  if (days < 2) return;
  const now = Date.now();
  const list = await Seller.find({
    status: 'active',
    isTestAccount: { $ne: true },
    accountType: { $ne: 'test' },
    'accountHealth.score': 100,
    'accountHealth.perfectSince': { $gt: new Date(now - days * DAY), $lte: new Date(now - (days - 1) * DAY) },
  })
    .select('accountHealth.perfectSince accountHealth.perfectWeeks accountHealth.weekNudgedFor')
    .limit(500)
    .lean();
  for (const s of list) {
    const key = new Date(s.accountHealth.perfectSince).toISOString();
    if (s.accountHealth.weekNudgedFor === key) continue;
    const claimed = await Seller.updateOne({ _id: s._id, 'accountHealth.weekNudgedFor': { $ne: key } }, { $set: { 'accountHealth.weekNudgedFor': key } });
    if (!claimed.modifiedCount) continue;
    const weeks = Number(s.accountHealth.perfectWeeks) || 0;
    const next = nextLevelOf(weeks);
    const levelNear = next && next.weeks - weeks === 1;
    if (amount <= 0 && !levelNear) continue;
    const orders = minOrders > 0 ? await confirmedBetween(s._id, new Date(s.accountHealth.perfectSince)) : 0;
    const needOrders = orders < minOrders;
    notify(appRef(), {
      recipientType: 'seller',
      sellerId: String(s._id),
      type: 'system',
      title: amount > 0 ? `⏳ 1 day left — $${amount} bonus tomorrow` : `⏳ 1 day left — ${lvName(next)} tomorrow`,
      body:
        `Your perfect week ends in about 24 hours. Keep 100/100: confirm every order before its warning time and keep your wallet covered.` +
        (needOrders ? ` You still need ${minOrders - orders} confirmed order${minOrders - orders > 1 ? 's' : ''} this week.` : '') +
        (amount > 0 ? ` $${amount} goes straight to your wallet.` : '') +
        (levelNear ? ` This week also makes you ${lvName(next)}.` : '') +
        ` — ${MONITOR_NAME}`,
      link: '/seller/health',
    });
  }
}

/**
 * STANDING — anonymous: "top X% of stores" and "Y% of stores are at 100/100". Never names, never
 * the number of stores. Only with at least 5 active stores. Cached for 10 minutes.
 */
let standingCache = { at: 0, list: null };
async function standingList() {
  if (standingCache.list && Date.now() - standingCache.at < 10 * 60000) return standingCache.list;
  const rows = await Seller.find({ status: 'active', isTestAccount: { $ne: true }, accountType: { $ne: 'test' } })
    .select('accountHealth.score accountHealth.perfectWeeks')
    .lean();
  standingCache = {
    at: Date.now(),
    list: rows.map((r) => ({ id: String(r._id), score: Number.isFinite(r.accountHealth?.score) ? r.accountHealth.score : 100, weeks: Number(r.accountHealth?.perfectWeeks) || 0 })),
  };
  return standingCache.list;
}
export async function standingOf(sellerId, score, weeks) {
  const list = await standingList();
  if (list.length < 5) return null;
  const id = String(sellerId);
  const others = list.filter((x) => x.id !== id);
  const total = others.length + 1;
  const better = others.filter((x) => x.score > score || (x.score === score && x.weeks > weeks)).length;
  return {
    topPct: Math.max(1, Math.ceil(((better + 1) / total) * 100)),
    pctAt100: Math.round((list.filter((x) => x.score === 100).length / list.length) * 100),
  };
}

/** Where the store stands for the perfect-health bonus (for its screens). */
export async function perfectBonusStatus(seller, settings) {
  const amount = Number(settings.perfectBonusAmount) || 0;
  const days = Number(settings.perfectBonusDays) || 7;
  const since = seller.accountHealth?.perfectSince ? new Date(seller.accountHealth.perfectSince) : null;
  const score = seller.accountHealth?.score ?? 100;
  let orders = 0;
  if (since) {
    orders = await mongoose.model('Order').countDocuments({ 'items.seller': seller._id, statusHistory: { $elemMatch: { status: 'confirmed', at: { $gte: since } } } });
  }
  const endsAt = since ? new Date(since.getTime() + days * DAY) : null;
  const doneMs = since ? Math.min(days * DAY, Date.now() - since.getTime()) : 0;
  const recent = await Withdrawal.find({ seller: seller._id, type: 'adjustment', processedBy: MONITOR_NAME })
    .select('amount processedAt createdAt')
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();
  return {
    enabled: amount > 0,
    amount,
    days,
    minOrders: Number(settings.perfectBonusMinOrders) || 0,
    running: Boolean(since) && score === 100 && seller.status === 'active',
    since,
    endsAt,
    progress: since ? Math.round((doneMs / (days * DAY)) * 100) : 0,
    ordersInWeek: orders,
    totalEarned: Number(seller.accountHealth?.perfectBonusTotal) || 0,
    count: Number(seller.accountHealth?.perfectBonusCount) || 0,
    lastAt: seller.accountHealth?.lastPerfectBonusAt || null,
    recent: recent.map((r) => ({ amount: r.amount, at: r.processedAt || r.createdAt })),
  };
}

export async function healthSweep() {
  if (mongoose.connection.readyState !== 1) return;
  try {
    // 1. lines that ended: work those scores out again (and tell the store when its band went up)
    const due = await Seller.find({ 'accountHealth.nextChangeAt': { $ne: null, $lte: new Date() } }).select('_id accountHealth.score').limit(500).lean();
    for (const s of due) {
      const before = bandOf(s.accountHealth?.score ?? 100);
      const r = await recomputeHealth(s._id, { reason: 'An earlier entry ended' });
      if (r && r.bandChanged && BANDS.indexOf(bandOf(r.score)) < BANDS.indexOf(before)) {
        notify(appRef(), {
          recipientType: 'seller',
          sellerId: String(s._id),
          type: 'approval',
          title: `🛡️ Account health back to ${bandOf(r.score).label} (${r.score}/100)`,
          body: `An earlier entry has ended and your score went up. — ${MONITOR_NAME}`,
          link: '/seller/health',
        });
      }
    }
    // 2. first run on this system: every store with a score under 100 gets its "previous record"
    //    line, so its old points start to end too
    const old = await Seller.find({ 'accountHealth.engine': { $ne: 2 }, 'accountHealth.score': { $lt: 100 } }).select('_id').limit(500).lean();
    for (const s of old) await recomputeHealth(s._id, { reason: 'Moved to the new account monitoring' });
    // 3. levels since 1 Oct (once per store), perfect-health bonus (stores at 100 get their timer;
    //    full weeks are paid and counted), "1 day left" reminders
    await backfillLevels();
    await perfectHealthBonuses();
    await weekNudges();
    // 4. clean-week rewards, once a day
    if (Date.now() - lastCleanWeekRun > DAY) {
      lastCleanWeekRun = Date.now();
      await cleanWeekRewards();
    }
  } catch (e) {
    console.error('[health] sweep failed:', e.message);
  }
}

export function startHealthMonitor(app) {
  setHealthApp(app);
  const t = setInterval(healthSweep, 15 * 60 * 1000);
  t.unref?.();
  setTimeout(healthSweep, 45000).unref?.();
}

// ─── for the screens ───
export function publicLine(l) {
  const now = Date.now();
  const ended = l.waived?.at ? 'removed' : new Date(l.expiresAt).getTime() <= now ? 'ended' : 'active';
  return {
    id: String(l._id),
    code: l.code,
    points: l.points,
    title: l.title,
    detail: l.detail,
    orderNumbers: l.orderNumbers || [],
    createdAt: l.createdAt,
    expiresAt: l.expiresAt,
    state: ended,
    source: MONITOR_NAME,
  };
}

export async function healthOverview(sellerId, { admin = false } = {}) {
  await recomputeHealth(sellerId);
  const [seller, lines, { rules, settings }] = await Promise.all([
    Seller.findById(sellerId)
      .select(
        'storeName status accountHealth.score accountHealth.band accountHealth.nextChangeAt accountHealth.onTimeStreak accountHealth.perfectSince accountHealth.perfectBonusTotal accountHealth.perfectBonusCount accountHealth.lastPerfectBonusAt accountHealth.perfectWeeks accountHealth.bestPerfectWeeks accountHealth.totalPerfectWeeks'
      )
      .lean(),
    HealthEvent.find({ seller: oid(sellerId) }).sort({ createdAt: -1 }).limit(admin ? 200 : 60).lean(),
    getRules(),
  ]);
  if (!seller) return null;
  const score = seller.accountHealth?.score ?? 100;
  const band = bandOf(score);
  const next = BANDS[BANDS.indexOf(band) - 1] || null;
  const now = Date.now();
  const activeLines = lines.filter((l) => !l.waived?.at && new Date(l.expiresAt).getTime() > now);
  // points back on each future day (what the score will be when lines end, with nothing new)
  const upcoming = activeLines
    .filter((l) => l.points < 0)
    .sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt))
    .slice(0, 5)
    .map((l) => ({ at: l.expiresAt, points: -l.points, title: l.title }));
  return {
    storeName: seller.storeName,
    score,
    band: band.key,
    bandLabel: band.label,
    nextBand: next ? { key: next.key, label: next.label, min: next.min, need: next.min - score } : null,
    nextChangeAt: seller.accountHealth?.nextChangeAt || null,
    onTimeStreak: seller.accountHealth?.onTimeStreak || 0,
    streakSize: settings.streakSize,
    limitMinScore: LIMIT_MIN_SCORE,
    bands: BANDS.map(({ key, min, label }) => ({ key, min, label })),
    rules: Object.entries(rules)
      .filter(([code]) => EDITABLE.includes(code))
      .map(([code, r]) => ({ code, points: r.points, days: r.days, title: r.title, help: r.help })),
    settings,
    upcoming,
    perfectBonus: await perfectBonusStatus(seller, settings),
    level: levelInfo(seller.accountHealth),
    levelsSince: PROGRAM_START,
    standing: seller.status === 'active' ? await standingOf(seller._id, score, Number(seller.accountHealth?.perfectWeeks) || 0).catch(() => null) : null,
    lines: lines.map((l) =>
      admin
        ? {
            ...publicLine(l),
            source: l.source,
            adminName: l.adminName,
            note: l.note,
            waived: l.waived?.at ? l.waived : null,
          }
        : publicLine(l)
    ),
  };
}

/**
 * AT STAKE — what the store can lose right now, for the banner on its dashboard and orders page:
 * each waiting order with its warning time and deadline, the wallet shortfall, the points a missed
 * deadline would cost, the running bonus week and the level.
 */
const DEADLINE_CODES_ALL = ['deadline_miss', 'deadline_repeat', 'deadline_third'];
export async function atStake(sellerId) {
  if (!isId(sellerId)) return null;
  const sid = String(sellerId);
  const seller = await Seller.findById(sellerId).select('status tier tierSince wallet.balance accountHealth.score accountHealth.perfectSince accountHealth.perfectWeeks').lean();
  if (!seller) return null;
  const empty = { orders: [], count: 0 };
  if (seller.status === 'suspended') return empty;
  const { rules, settings } = await getRules();
  const warnH = warnHoursFor(seller);
  const confirmH = confirmHoursFor(seller);
  const now = Date.now();

  const raw = await mongoose
    .model('Order')
    .find({ status: 'pending', $or: [{ 'items.seller': seller._id }, { seller: seller._id }] })
    .select('orderNumber seller items.seller items.itemStatus items.price items.qty pendingSince createdAt')
    .sort({ createdAt: 1 })
    .limit(50)
    .lean();
  const orders = [];
  for (const o of raw) {
    const mine = (o.items || []).filter(
      (it) => (it.seller ? String(it.seller) === sid : String(o.seller || '') === sid) && (!it.itemStatus || it.itemStatus === 'pending')
    );
    if (!mine.length) continue;
    const value = Math.round(mine.reduce((t, it) => t + (Number(it.price) || 0) * (Number(it.qty) || 1), 0) * 100) / 100;
    const since = new Date(o.pendingSince || o.createdAt).getTime();
    const warnAt = since + warnH * 3600000;
    const deadlineAt = since + confirmH * 3600000;
    const stage = now < warnAt ? 'ok' : now < deadlineAt ? 'warning' : 'overdue';
    let nextHit = null;
    if (stage === 'overdue') {
      const daysOver = Math.floor((now - deadlineAt) / DAY);
      nextHit = new Date(deadlineAt + (daysOver + 1) * DAY);
    }
    orders.push({ id: String(o._id), orderNumber: o.orderNumber, value, warnAt: new Date(warnAt), deadlineAt: new Date(deadlineAt), stage, nextHit });
  }
  if (!orders.length) return empty;

  const [waitingDocs, earlier] = await Promise.all([
    Withdrawal.find({ seller: seller._id, type: 'deposit', status: { $in: ['pending', 'processing'] } }).select('amount').lean(),
    HealthEvent.countDocuments({ seller: seller._id, code: { $in: DEADLINE_CODES_ALL }, 'waived.at': null, createdAt: { $gt: new Date(now - settings.repeatWindowDays * DAY) } }),
  ]);
  const waiting = Math.round(waitingDocs.reduce((t, w) => t + (Number(w.amount) || 0), 0) * 100) / 100;
  const balance = Number(seller.wallet?.balance) || 0;
  const need = Math.round(orders.reduce((t, o) => t + o.value, 0) * 100) / 100;
  const shortBy = Math.max(0, Math.ceil((need - balance - waiting) * 100) / 100);
  const ladder = earlier >= 2 ? rules.deadline_third : earlier === 1 ? rules.deadline_repeat : rules.deadline_miss;

  // what each order costs if nothing is done
  for (const o of orders) {
    o.risk =
      o.stage === 'ok'
        ? { points: rules.late_confirm.points, at: o.warnAt, what: 'late' }
        : o.stage === 'warning'
          ? { points: ladder.points, at: o.deadlineAt, what: 'deadline', freeze: true }
          : { points: rules.overdue_daily.points, at: o.nextHit, what: 'overdue' };
  }
  const open = orders.filter((o) => o.stage !== 'overdue');
  const overdue = orders.filter((o) => o.stage === 'overdue');
  let pointsAtRisk = 0;
  if (open.length) pointsAtRisk += ladder.points + rules.extra_order.points * (open.length - 1);
  pointsAtRisk += rules.overdue_daily.points * overdue.length;
  if (shortBy > 0 && orders.some((o) => o.stage === 'ok')) pointsAtRisk += rules.wallet_short.points;
  const score = Number.isFinite(seller.accountHealth?.score) ? seller.accountHealth.score : 100;

  const amount = Number(settings.perfectBonusAmount) || 0;
  const days = Number(settings.perfectBonusDays) || 7;
  const since = seller.accountHealth?.perfectSince ? new Date(seller.accountHealth.perfectSince).getTime() : 0;
  const bonus =
    amount > 0 && since && score === 100 && seller.status === 'active'
      ? { amount, days, day: Math.min(days, Math.floor((now - since) / DAY) + 1), endsAt: new Date(since + days * DAY) }
      : null;
  const weeks = Number(seller.accountHealth?.perfectWeeks) || 0;
  const level = weeks > 0 ? { ...levelInfo(seller.accountHealth), levels: undefined } : null;

  return {
    orders,
    count: orders.length,
    value: need,
    balance: Math.round(balance * 100) / 100,
    waitingDeposits: waiting,
    shortBy,
    pointsAtRisk,
    score,
    scoreIfMissed: Math.max(0, score + pointsAtRisk),
    freeze: open.length > 0,
    warnHours: warnH,
    confirmHours: confirmH,
    bonus,
    level,
  };
}

/** The store saw its celebration (bonus / level up): clear it. */
export async function clearCelebration(sellerId) {
  if (!isId(sellerId)) return;
  const r = await Seller.updateOne({ _id: oid(sellerId), 'accountHealth.pendingCelebration': { $ne: null } }, { $set: { 'accountHealth.pendingCelebration': null } });
  if (r.modifiedCount) await emitHealth(sellerId);
}
