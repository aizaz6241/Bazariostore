/**
 * 💎 DIAMOND OFFERS — make the upgrade attractive with real discounts and real deadlines.
 *
 *   earned     a store with great health (90+, no penalty, never frozen) for 14 days and 15 orders
 *              confirmed in that time gets e.g. $500 off for 72 hours. Again at the earliest
 *              `cooldownDays` after the last one ended.
 *   milestone  N orders confirmed in total → e.g. $500 off / 50% off for 72 hours (once each).
 *   festival   Indian special days (Diwali, Holi, 26 Jan, 15 Aug …): dates + discount set by admins.
 *
 * The seller sees ONE offer at a time: their personal one first ("you earned it"), the one ending
 * soonest; a festival only when there is no personal one. The price shown is never higher than
 * another offer the store has right now (a cheaper festival price is used as "Diwali special +
 * your reward"). When the seller sends the upgrade request the price is LOCKED on the request for
 * `lockDays`; the admin's fee form and the partners' approval use it. Finance is not touched: the
 * real USDT that comes in is divided exactly like before.
 *
 * Every number lives in the settings (admin panel → Diamond offers). Nothing here moves money.
 */
import mongoose from 'mongoose';
import { getSetting, setSetting } from '../models/System.js';
import DiamondOffer from '../models/DiamondOffer.js';
import { DIAMOND_UPGRADE_FEE_USD, TIERS } from './sellerTier.js';
import { notify } from './notify.js';
import { emailEnabled, sendDiamondOfferEmail } from '../services/email.service.js';

const DAY = 86400000;
const KEY = 'diamondOffers';
const IST_MS = 5.5 * 3600000;

export const DEFAULT_OFFER_SETTINGS = {
  enabled: true,
  lockDays: 7,
  earned: { enabled: true, healthMin: 90, days: 14, orders: 15, discountType: 'amount', discountValue: 500, hours: 72, cooldownDays: 14 },
  milestones: [
    { key: 'm50', enabled: true, orders: 50, discountType: 'amount', discountValue: 500, hours: 72 },
    { key: 'm100', enabled: true, orders: 100, discountType: 'percent', discountValue: 50, hours: 72 },
  ],
  festivals: [
    { key: 'diwali', name: 'Diwali', emoji: '🪔', enabled: false, start: '', end: '', discountType: 'percent', discountValue: 30 },
    { key: 'republic', name: 'Republic Day', emoji: '🇮🇳', enabled: false, start: '2027-01-25', end: '2027-01-26', discountType: 'amount', discountValue: 300 },
    { key: 'holi', name: 'Holi', emoji: '🎨', enabled: false, start: '', end: '', discountType: 'percent', discountValue: 25 },
    { key: 'independence', name: 'Independence Day', emoji: '🇮🇳', enabled: false, start: '2027-08-14', end: '2027-08-15', discountType: 'amount', discountValue: 500 },
    { key: 'rakhi', name: 'Raksha Bandhan', emoji: '🪢', enabled: false, start: '', end: '', discountType: 'percent', discountValue: 20 },
    { key: 'navratri', name: 'Navratri & Dussehra', emoji: '🏹', enabled: false, start: '', end: '', discountType: 'percent', discountValue: 25 },
    { key: 'newyear', name: 'New Year', emoji: '🎉', enabled: false, start: '2026-12-31', end: '2027-01-01', discountType: 'amount', discountValue: 300 },
  ],
};

/* ───────────────────────── settings ───────────────────────── */

const clampNum = (v, min, max, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};
const dateStr = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const cleanText = (v, n) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, n);

function cleanDiscount(o, d) {
  const discountType = o?.discountType === 'percent' ? 'percent' : 'amount';
  const discountValue =
    discountType === 'percent' ? clampNum(o?.discountValue, 1, 90, d.discountValue) : clampNum(o?.discountValue, 1, DIAMOND_UPGRADE_FEE_USD - 1, d.discountValue);
  return { discountType, discountValue };
}

/** Settings checked and filled up with the defaults (an admin typo can never give a free or negative price). */
export function normalizeSettings(raw = {}) {
  const D = DEFAULT_OFFER_SETTINGS;
  const e = raw.earned || {};
  const earned = {
    enabled: e.enabled !== undefined ? Boolean(e.enabled) : D.earned.enabled,
    healthMin: clampNum(e.healthMin, 50, 100, D.earned.healthMin),
    days: Math.round(clampNum(e.days, 3, 60, D.earned.days)),
    orders: Math.round(clampNum(e.orders, 1, 1000, D.earned.orders)),
    hours: Math.round(clampNum(e.hours, 1, 24 * 14, D.earned.hours)),
    cooldownDays: Math.round(clampNum(e.cooldownDays, 1, 90, D.earned.cooldownDays)),
    ...cleanDiscount(e, D.earned),
  };
  const ms = Array.isArray(raw.milestones) ? raw.milestones : D.milestones;
  const seenKeys = new Set();
  const milestones = ms
    .slice(0, 10)
    .map((m, i) => {
      let key = cleanText(m?.key, 30).replace(/[^a-z0-9_-]/gi, '') || `m${Math.round(Number(m?.orders) || i + 1)}`;
      while (seenKeys.has(key)) key += 'x';
      seenKeys.add(key);
      return {
        key,
        enabled: m?.enabled !== false,
        orders: Math.round(clampNum(m?.orders, 1, 100000, 50)),
        hours: Math.round(clampNum(m?.hours, 1, 24 * 14, 72)),
        ...cleanDiscount(m, { discountValue: 500 }),
      };
    })
    .sort((a, b) => a.orders - b.orders);
  const fs = Array.isArray(raw.festivals) ? raw.festivals : D.festivals;
  const festKeys = new Set();
  const festivals = fs.slice(0, 30).map((f, i) => {
    let key = cleanText(f?.key, 30).replace(/[^a-z0-9_-]/gi, '') || `f${i + 1}`;
    while (festKeys.has(key)) key += 'x';
    festKeys.add(key);
    let start = dateStr(f?.start);
    let end = dateStr(f?.end) || start;
    if (start && end && end < start) [start, end] = [end, start];
    return {
      key,
      name: cleanText(f?.name, 40) || 'Special day',
      emoji: cleanText(f?.emoji, 8) || '🎉',
      enabled: Boolean(f?.enabled) && Boolean(start),
      start,
      end,
      ...cleanDiscount(f, { discountValue: 20 }),
    };
  });
  return {
    enabled: raw.enabled !== undefined ? Boolean(raw.enabled) : D.enabled,
    lockDays: Math.round(clampNum(raw.lockDays, 1, 30, D.lockDays)),
    earned,
    milestones,
    festivals,
  };
}

let cache = { at: 0, value: null };
export async function getOfferSettings() {
  if (cache.value && Date.now() - cache.at < 60000) return cache.value;
  const raw = await getSetting(KEY, null);
  const value = normalizeSettings(raw || DEFAULT_OFFER_SETTINGS);
  cache = { at: Date.now(), value };
  return value;
}
export async function saveOfferSettings(input) {
  const value = normalizeSettings(input || {});
  await setSetting(KEY, value);
  cache = { at: Date.now(), value };
  return value;
}

/* ───────────────────────── prices ───────────────────────── */

export const REGULAR_PRICE = DIAMOND_UPGRADE_FEE_USD;
export function priceFor(d, regular = REGULAR_PRICE) {
  const off = d.discountType === 'percent' ? (regular * Number(d.discountValue)) / 100 : Number(d.discountValue);
  // never below $1 and never above the normal price
  return Math.max(1, Math.min(regular, Math.round((regular - off) * 100) / 100));
}
export const discountLabel = (d) => (d.discountType === 'percent' ? `${Number(d.discountValue)}% off` : `$${Number(d.discountValue).toLocaleString('en-US')} off`);

/** Start / end of a festival in India time (00:00 of the first day … 23:59:59 of the last day). */
export function festivalWindow(f) {
  if (!f.start) return null;
  const s = Date.parse(`${f.start}T00:00:00Z`) - IST_MS;
  const e = Date.parse(`${f.end || f.start}T23:59:59Z`) - IST_MS;
  return Number.isFinite(s) && Number.isFinite(e) ? { start: new Date(s), end: new Date(e) } : null;
}
export function activeFestival(settings, now = Date.now()) {
  if (!settings.enabled) return null;
  for (const f of settings.festivals) {
    if (!f.enabled) continue;
    const w = festivalWindow(f);
    if (w && now >= w.start.getTime() && now <= w.end.getTime()) return { ...f, ...w, price: priceFor(f) };
  }
  return null;
}

/* ───────────────────────── the store's progress ───────────────────────── */

const Order = () => mongoose.model('Order');
const HealthEvent = () => mongoose.model('HealthEvent');
const Seller = () => mongoose.model('Seller');
const Withdrawal = () => mongoose.model('Withdrawal');

const confirmedCount = (sellerId, since) =>
  Order().countDocuments({
    'items.seller': sellerId,
    statusHistory: { $elemMatch: since ? { status: 'confirmed', at: { $gte: since } } : { status: 'confirmed' } },
  });

/** { sellerId → { total, recent } } for every store: orders with a confirmation (recent = since `since`). */
async function confirmedCountsByStore(since) {
  const rows = await Order().aggregate([
    { $match: { 'statusHistory.status': 'confirmed' } },
    {
      $project: {
        sellers: { $setUnion: [{ $ifNull: ['$items.seller', []] }, []] },
        lastConf: { $max: { $map: { input: { $filter: { input: '$statusHistory', cond: { $eq: ['$$this.status', 'confirmed'] } } }, in: '$$this.at' } } },
      },
    },
    { $unwind: '$sellers' },
    { $group: { _id: '$sellers', total: { $sum: 1 }, recent: { $sum: { $cond: [{ $gte: ['$lastConf', since] }, 1, 0] } } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), { total: r.total, recent: r.recent }]));
}

/** Can this store get offers at all? (active, Basic, real store, no upgrade request running) */
export function canHaveOffers(s) {
  return (
    s &&
    s.status === 'active' &&
    s.tier !== 'diamond' &&
    s.isTestAccount !== true &&
    s.accountType !== 'test' &&
    !['pending', 'awaiting_approval'].includes(s.tierRequest?.status)
  );
}

/**
 * Where the store stands for the earned reward: days in a row of great health (since the later of
 * registration, the last penalty and the last freeze), orders confirmed in the last `days` days,
 * and when the next reward can come at the earliest (cooldown after the last one).
 */
export async function earnedProgress(s, settings, counts = null) {
  const E = settings.earned;
  const now = Date.now();
  const sid = s._id;
  const [lastPenalty, orders, lastEarned] = await Promise.all([
    HealthEvent().findOne({ seller: sid, points: { $lt: 0 }, 'waived.at': null }).sort({ createdAt: -1 }).select('createdAt').lean(),
    counts ? counts.recent : confirmedCount(sid, new Date(now - E.days * DAY)),
    DiamondOffer.findOne({ seller: sid, kind: 'earned' }).sort({ createdAt: -1 }).select('endsAt claimedAt status').lean(),
  ]);
  const score = Number.isFinite(s.accountHealth?.score) ? s.accountHealth.score : 100;
  const starts = [s.createdAt, lastPenalty?.createdAt, s.frozenAt].filter(Boolean).map((d) => new Date(d).getTime());
  const since = starts.length ? Math.max(...starts) : now;
  const healthOk = score >= E.healthMin;
  const days = healthOk ? Math.max(0, Math.floor((now - since) / DAY)) : 0;
  const nextAt = lastEarned ? new Date(new Date(lastEarned.endsAt).getTime() + E.cooldownDays * DAY) : null;
  return {
    enabled: settings.enabled && E.enabled,
    healthMin: E.healthMin,
    score,
    days: Math.min(days, E.days),
    daysNeeded: E.days,
    orders: Math.min(orders, E.orders),
    ordersNeeded: E.orders,
    price: priceFor(E),
    discount: discountLabel(E),
    hours: E.hours,
    nextAt: nextAt && nextAt.getTime() > now ? nextAt : null,
    ready: healthOk && days >= E.days && orders >= E.orders && !(nextAt && nextAt.getTime() > now),
  };
}

/** Real numbers of the last 30 days: what the store earned at 20% and what Diamond would have paid. */
export async function lastMonthNumbers(s) {
  const since = new Date(Date.now() - 30 * DAY);
  const rows = await Withdrawal()
    .find({ seller: s._id, type: 'order_delivered_release', createdAt: { $gte: since } })
    .select('principalAmount profitAmount')
    .lean();
  const principal = rows.reduce((t, r) => t + (Number(r.principalAmount) || 0), 0);
  const earned = rows.reduce((t, r) => t + (Number(r.profitAmount) || 0), 0);
  const diamond = (principal * TIERS.diamond.profitRate) / 100;
  const r2 = (n) => Math.round(n * 100) / 100;
  return { orders: rows.length, earned: r2(earned), diamond: r2(diamond), extra: r2(Math.max(0, diamond - earned)) };
}

/* ───────────────────────── giving offers ───────────────────────── */

async function giveOffer(app, s, { kind, key, title, discount, hours }) {
  const now = new Date();
  const doc = {
    seller: s._id,
    kind,
    key,
    title,
    discountType: discount.discountType,
    discountValue: discount.discountValue,
    regular: REGULAR_PRICE,
    price: priceFor(discount),
    startsAt: now,
    endsAt: new Date(now.getTime() + hours * 3600000),
    status: 'active',
  };
  // unique (seller, key): the same reward can never be given twice, even by two server copies
  const res = await DiamondOffer.updateOne({ seller: s._id, key }, { $setOnInsert: doc }, { upsert: true });
  if (!res.upsertedCount) return null;
  const save = REGULAR_PRICE - doc.price;
  notify(app, {
    recipientType: 'seller',
    sellerId: String(s._id),
    type: 'approval',
    title: `💎 You earned $${save.toLocaleString('en-US')} off Diamond!`,
    body: `${title}: Diamond for $${doc.price.toLocaleString('en-US')} instead of $${REGULAR_PRICE.toLocaleString('en-US')} — only for ${hours} hours.`,
    link: '/seller/diamond',
  });
  if (emailEnabled && s.email) {
    sendDiamondOfferEmail({ to: s.email, name: s.ownerName || s.storeName, offer: doc, reminder: false }).catch(() => {});
  }
  return doc;
}

/**
 * Looks at one store and gives an offer when it has earned one. Milestones first (rarer), then
 * the earned reward. Only one personal offer runs at a time. Returns the new offer or null.
 */
export async function checkStore(app, s, settings, counts = null) {
  if (!settings.enabled || !canHaveOffers(s)) return null;
  const now = new Date();
  const running = await DiamondOffer.findOne({ seller: s._id, kind: { $in: ['earned', 'milestone'] }, status: 'active', endsAt: { $gt: now } }).select('_id').lean();
  if (running) return null;

  // milestones: the highest one reached is given; the lower ones reached at the same time are skipped
  const ms = settings.milestones.filter((m) => m.enabled);
  if (ms.length) {
    const given = new Set((await DiamondOffer.find({ seller: s._id, kind: 'milestone' }).select('key').lean()).map((o) => o.key.replace(/^milestone:/, '')));
    const open = ms.filter((m) => !given.has(m.key));
    if (open.length) {
      const total = counts ? counts.total : await confirmedCount(s._id, null);
      const reached = open.filter((m) => total >= m.orders);
      if (reached.length) {
        const top = reached[reached.length - 1];
        for (const m of reached.slice(0, -1)) {
          await DiamondOffer.updateOne(
            { seller: s._id, key: `milestone:${m.key}` },
            { $setOnInsert: { seller: s._id, kind: 'milestone', key: `milestone:${m.key}`, title: `${m.orders} orders`, discountType: m.discountType, discountValue: m.discountValue, regular: REGULAR_PRICE, price: priceFor(m), startsAt: now, endsAt: now, status: 'skipped' } },
            { upsert: true }
          );
        }
        return giveOffer(app, s, { kind: 'milestone', key: `milestone:${top.key}`, title: `${top.orders} orders milestone`, discount: top, hours: top.hours });
      }
    }
  }

  if (settings.earned.enabled) {
    const p = await earnedProgress(s, settings, counts);
    if (p.ready) {
      const day = new Date(now.getTime() + IST_MS).toISOString().slice(0, 10);
      return giveOffer(app, s, { kind: 'earned', key: `earned:${day}`, title: 'Your reward for great work', discount: settings.earned, hours: settings.earned.hours });
    }
  }
  return null;
}

/* ───────────────────────── the one offer the seller sees ───────────────────────── */

/**
 * The offer to show this store now (or null). Personal first, ending soonest; a festival only
 * without a personal one. The price is the lowest of the store's active offers.
 */
export async function currentOffer(s, settings) {
  if (!settings) settings = await getOfferSettings();
  if (!settings.enabled || !s || s.tier === 'diamond') return null;
  const now = new Date();
  const personal = await DiamondOffer.findOne({ seller: s._id, kind: { $in: ['earned', 'milestone'] }, status: 'active', endsAt: { $gt: now } })
    .sort({ endsAt: 1 })
    .lean();
  const fest = activeFestival(settings, now.getTime());
  if (!personal && !fest) return null;

  if (personal) {
    const out = {
      key: personal.key,
      kind: personal.kind,
      personal: true,
      title: personal.title,
      badge: personal.kind === 'milestone' ? '🏆 Milestone reward' : '🏆 Your reward',
      regular: personal.regular || REGULAR_PRICE,
      price: personal.price,
      endsAt: personal.endsAt,
      seen: Boolean(personal.seenAt),
      festival: null,
    };
    if (fest && fest.price < out.price) {
      // the festival is cheaper: the store gets that price, shown together with its reward
      out.price = fest.price;
      out.badge = `${fest.emoji} ${fest.name} special + your reward`;
      out.endsAt = new Date(Math.min(new Date(personal.endsAt).getTime(), fest.end.getTime()));
      out.festival = { key: fest.key, name: fest.name, emoji: fest.emoji };
    }
    out.save = Math.round((out.regular - out.price) * 100) / 100;
    return out;
  }
  return {
    key: `festival:${fest.key}:${fest.start}`,
    kind: 'festival',
    personal: false,
    title: `${fest.name} special`,
    badge: `${fest.emoji} ${fest.name} special`,
    regular: REGULAR_PRICE,
    price: fest.price,
    save: Math.round((REGULAR_PRICE - fest.price) * 100) / 100,
    endsAt: fest.end,
    seen: true,
    festival: { key: fest.key, name: fest.name, emoji: fest.emoji },
  };
}

/** Everything the seller's screens need: offer, progress to the reward, last-30-days numbers, locked price. */
export async function offerScreen(sellerId) {
  const s = await Seller().findById(sellerId).select('status tier tierRequest isTestAccount accountType accountHealth.score createdAt frozenAt').lean();
  if (!s) return null;
  const settings = await getOfferSettings();
  const lock = s.tierRequest?.offer?.price > 0 && s.tierRequest.offer.lockedUntil && new Date(s.tierRequest.offer.lockedUntil) > new Date() ? s.tierRequest.offer : null;
  const requested = ['pending', 'awaiting_approval'].includes(s.tierRequest?.status);
  const [offer, progress, numbers] = await Promise.all([
    // while a request runs the seller sees the locked price, not a new offer
    s.tier === 'diamond' || requested ? null : currentOffer(s, settings),
    canHaveOffers(s) && settings.enabled && settings.earned.enabled ? earnedProgress(s, settings) : null,
    s.tier === 'diamond' ? null : lastMonthNumbers(s),
  ]);
  const nextMilestone = canHaveOffers(s) ? settings.milestones.find((m) => m.enabled) : null;
  return {
    regular: REGULAR_PRICE,
    lockDays: settings.lockDays,
    offer,
    progress,
    numbers,
    locked: lock ? { title: lock.title, price: lock.price, regular: lock.regular || REGULAR_PRICE, lockedUntil: lock.lockedUntil } : null,
    milestone: nextMilestone ? { orders: nextMilestone.orders, discount: discountLabel(nextMilestone) } : null,
  };
}

/** The seller sent the upgrade request: lock the price of the offer they see now. */
export async function lockOfferForRequest(s) {
  const settings = await getOfferSettings();
  const offer = await currentOffer(s, settings);
  if (!offer || !(offer.price < REGULAR_PRICE)) return null;
  const now = new Date();
  const lock = {
    key: offer.key,
    kind: offer.kind,
    title: offer.badge.replace(/^🏆\s*/, ''),
    price: offer.price,
    regular: offer.regular,
    lockedUntil: new Date(now.getTime() + settings.lockDays * DAY),
  };
  if (offer.personal) await DiamondOffer.updateOne({ seller: s._id, key: offer.key }, { $set: { status: 'claimed', claimedAt: now } });
  else {
    await DiamondOffer.updateOne(
      { seller: s._id, key: offer.key },
      { $set: { status: 'claimed', claimedAt: now }, $setOnInsert: { kind: 'festival', title: offer.title, regular: offer.regular, price: offer.price, startsAt: now, endsAt: offer.endsAt } },
      { upsert: true }
    );
  }
  return lock;
}

/** The request was closed without an upgrade: a personal offer whose time has not run out comes back. */
export async function releaseLockedOffer(s) {
  const key = s?.tierRequest?.offer?.key;
  if (!key) return;
  await DiamondOffer.updateOne({ seller: s._id, key, status: 'claimed', endsAt: { $gt: new Date() } }, { $set: { status: 'active', claimedAt: null } });
}

/** The fee for the admin's form / the approval: the locked offer price while it is valid, else the normal price. */
export function feeForRequest(s) {
  const o = s?.tierRequest?.offer;
  if (o?.price > 0 && o.price <= REGULAR_PRICE && o.lockedUntil && new Date(o.lockedUntil) > new Date()) return { fee: o.price, offer: o };
  return { fee: REGULAR_PRICE, offer: null };
}

export async function markSeen(sellerId, key) {
  await DiamondOffer.updateOne({ seller: sellerId, key: String(key || ''), seenAt: null }, { $set: { seenAt: new Date() } });
}

/* ───────────────────────── the background check ───────────────────────── */

/**
 * Every 30 minutes: ends offers whose time ran out, reminds 24 hours before the end, tells stores
 * about a festival once, and gives the earned / milestone offers. Small queries only.
 */
export async function offerSweep(app) {
  if (mongoose.connection.readyState !== 1) return;
  const settings = await getOfferSettings();
  const now = new Date();
  await DiamondOffer.updateMany({ status: 'active', endsAt: { $lte: now } }, { $set: { status: 'expired' } });
  if (!settings.enabled) return;

  // 24 hours left on a personal offer: one reminder
  const soon = await DiamondOffer.find({
    kind: { $in: ['earned', 'milestone'] },
    status: 'active',
    remindedAt: null,
    endsAt: { $gt: now, $lte: new Date(now.getTime() + DAY) },
    startsAt: { $lte: new Date(now.getTime() - 12 * 3600000) }, // not for an offer that is only a few hours old
  })
    .limit(200)
    .lean();
  for (const o of soon) {
    const claimed = await DiamondOffer.updateOne({ _id: o._id, remindedAt: null }, { $set: { remindedAt: now } });
    if (!claimed.modifiedCount) continue;
    const s = await Seller().findById(o.seller).select('email ownerName storeName status tier tierRequest isTestAccount accountType').lean();
    if (!canHaveOffers(s)) continue;
    notify(app, {
      recipientType: 'seller',
      sellerId: String(s._id),
      type: 'system',
      title: '⏳ Your Diamond offer ends tomorrow',
      body: `Diamond for $${o.price.toLocaleString('en-US')} instead of $${(o.regular || REGULAR_PRICE).toLocaleString('en-US')} — less than 24 hours left.`,
      link: '/seller/diamond',
    });
    if (emailEnabled && s.email) sendDiamondOfferEmail({ to: s.email, name: s.ownerName || s.storeName, offer: o, reminder: true }).catch(() => {});
  }

  const stores = await Seller()
    .find({ status: 'active', tier: { $ne: 'diamond' }, isTestAccount: { $ne: true }, accountType: { $ne: 'test' }, 'tierRequest.status': { $nin: ['pending', 'awaiting_approval'] } })
    .select('email ownerName storeName status tier tierRequest isTestAccount accountType accountHealth.score createdAt frozenAt')
    .limit(2000)
    .lean();

  // a festival started: every store is told once (in the app; no email, to keep the daily email quota)
  const fest = activeFestival(settings, now.getTime());
  if (fest) {
    const key = `festival:${fest.key}:${fest.start}`;
    const told = new Set((await DiamondOffer.find({ key }).select('seller').lean()).map((o) => String(o.seller)));
    for (const s of stores) {
      if (told.has(String(s._id))) continue;
      const r = await DiamondOffer.updateOne(
        { seller: s._id, key },
        { $setOnInsert: { seller: s._id, kind: 'festival', key, title: `${fest.name} special`, discountType: fest.discountType, discountValue: fest.discountValue, regular: REGULAR_PRICE, price: fest.price, startsAt: now, endsAt: fest.end, status: 'active', seenAt: now } },
        { upsert: true }
      );
      if (r.upsertedCount) {
        notify(app, {
          recipientType: 'seller',
          sellerId: String(s._id),
          type: 'system',
          title: `${fest.emoji} ${fest.name} special: ${discountLabel(fest)} Diamond`,
          body: `Diamond for $${fest.price.toLocaleString('en-US')} instead of $${REGULAR_PRICE.toLocaleString('en-US')} until ${fest.end.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' })}.`,
          link: '/seller/diamond',
        });
      }
    }
  }

  // orders confirmed per store (in total, and in the reward window), counted by the database in
  // one go instead of two queries per store
  const counts = await confirmedCountsByStore(new Date(now.getTime() - settings.earned.days * DAY));
  for (const s of stores) {
    try {
      await checkStore(app, s, settings, counts.get(String(s._id)) || { total: 0, recent: 0 });
    } catch (e) {
      console.error('[diamond offers] store check:', e.message);
    }
  }
}

let timer = null;
export function startOfferSweep(app) {
  if (timer) return;
  const run = () => offerSweep(app).catch((e) => console.error('[diamond offers] sweep:', e.message));
  setTimeout(run, 3 * 60 * 1000);
  timer = setInterval(run, 30 * 60 * 1000);
}

/** Admin results: offers given / requests sent with an offer / stores upgraded after an offer. */
export async function offerResults() {
  const since = new Date(Date.now() - 90 * DAY);
  const rows = await DiamondOffer.aggregate([
    { $match: { createdAt: { $gte: since }, status: { $ne: 'skipped' } } },
    { $group: { _id: '$kind', given: { $sum: 1 }, claimed: { $sum: { $cond: [{ $eq: ['$status', 'claimed'] }, 1, 0] } }, sellers: { $addToSet: { $cond: [{ $eq: ['$status', 'claimed'] }, '$seller', null] } } } },
  ]);
  const out = { days: 90, earned: { given: 0, claimed: 0, upgraded: 0 }, milestone: { given: 0, claimed: 0, upgraded: 0 }, festival: { given: 0, claimed: 0, upgraded: 0 } };
  for (const r of rows) {
    const ids = r.sellers.filter(Boolean);
    const upgraded = ids.length ? await Seller().countDocuments({ _id: { $in: ids }, tier: 'diamond' }) : 0;
    if (out[r._id]) out[r._id] = { given: r.given, claimed: r.claimed, upgraded };
  }
  return out;
}
