import RewardClaim from '../models/RewardClaim.js';
import Member from '../models/Member.js';
import SellerAssignment from '../models/SellerAssignment.js';
import { buildLedger } from './finance.js';

/**
 * REWARD SYSTEM (agreed 10 Oct 2026)
 *
 *  1. $300 wallet reward  -> 5,000 PKR, once per seller: when the seller's REAL deposits
 *                            (store $ minus helping, only deposits whose money reached Binance)
 *                            add up to $300.
 *  2. Daily target        -> one seller, one day (India time): ₹1L / 2L / 3L / 4L / 5L+ real INR
 *                            -> 1,000 / 2,000 / 3,000 / 4,000 / 5,000 PKR (only the top tier).
 *                            Made once the day is over.
 *  3. Weekly target       -> one seller, Monday–Sunday: ₹5 lakh+ real INR -> 5,000 PKR.
 *                            Made once the week is over.
 *
 *  - Counted from 1 Oct 2026 (the finance start) — only deposits that the finance ledger counts.
 *  - The reward goes to whoever owns the seller (member or partner); both partners pay 50 / 50.
 *  - A reward is always created as PENDING; an admin approves it and enters the PKR rate.
 *  - Each reward has a fixed key, so it can never be created twice.
 */

export const REWARD_RULES = {
  wallet300: { usd: 300, pkr: 5000 },
  daily: [
    { inr: 500000, pkr: 5000 },
    { inr: 400000, pkr: 4000 },
    { inr: 300000, pkr: 3000 },
    { inr: 200000, pkr: 2000 },
    { inr: 100000, pkr: 1000 },
  ],
  weekly: { inr: 500000, pkr: 5000 },
};

export const NEW_REWARD_TYPES = ['wallet_300', 'daily_target', 'weekly_target'];
// Rewards of the old system: never created again. Approved ones stay as they are.
export const OLD_REWARD_TYPES = ['milestone_1lakh', 'milestone_2lakh', 'milestone_3lakh', 'weekly_5lakh_sprint', 'first_seller_5orders'];

const IST = 330 * 60000; // India time
const sid = (v) => (v ? String(v) : '');
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (v) => Math.round(num(v) * 100) / 100;

/** "YYYY-MM-DD" of a date in India time */
export function dayKey(d) {
  return new Date(new Date(d).getTime() + IST).toISOString().slice(0, 10);
}
/** "YYYY-MM-DD" of the Monday (India time) of the week of a date */
export function weekKey(d) {
  const t = new Date(new Date(d).getTime() + IST);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
}
const addDays = (key, n) => {
  const t = new Date(`${key}T00:00:00.000Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const fmtINR = (v) => `₹${Math.round(num(v)).toLocaleString('en-IN')}`;
const tierFor = (inr) => REWARD_RULES.daily.find((t) => num(inr) >= t.inr) || null;

/**
 * Works out, from the ledger deposits, what every seller has reached. Pure (no database).
 * @param {object[]} deposits  ledger entries of kind "deposit" (date, sellerId, storeName, walletAmount, helping, inr)
 * @param {Date} now
 */
export function computeRewardFacts(deposits, now = new Date()) {
  const today = dayKey(now);
  const thisWeek = weekKey(now);
  const bySeller = new Map();
  const sorted = [...deposits].sort((a, b) => new Date(a.date) - new Date(b.date));
  for (const e of sorted) {
    const id = sid(e.sellerId);
    if (!id) continue;
    if (!bySeller.has(id)) bySeller.set(id, { sellerId: id, storeName: e.storeName || '', realUSD: 0, crossedAt: null, crossedUSD: 0, crossedOwner: '', days: new Map(), weeks: new Map(), dayOwner: new Map(), weekOwner: new Map() });
    const s = bySeller.get(id);
    const real = Math.max(0, num(e.walletAmount) - num(e.helping));
    s.realUSD = r2(s.realUSD + real);
    if (!s.crossedAt && s.realUSD >= REWARD_RULES.wallet300.usd) {
      s.crossedAt = new Date(e.date);
      s.crossedUSD = s.realUSD;
      s.crossedOwner = sid(e.owner?.id);
    }
    const inr = num(e.inr);
    const dk = dayKey(e.date);
    const wk = weekKey(e.date);
    s.days.set(dk, num(s.days.get(dk)) + inr);
    s.weeks.set(wk, num(s.weeks.get(wk)) + inr);
    // whoever owned the seller when the money came (the last deposit of that day / week decides)
    if (e.owner?.id) {
      s.dayOwner.set(dk, sid(e.owner.id));
      s.weekOwner.set(wk, sid(e.owner.id));
    }
  }

  const out = [];
  for (const s of bySeller.values()) {
    const due = [];
    if (s.crossedAt) {
      due.push({
        rewardType: 'wallet_300',
        key: `wallet300_${s.sellerId}`,
        amountPKR: REWARD_RULES.wallet300.pkr,
        title: `$300 wallet reward — ${s.storeName}`,
        description: `${s.storeName} reached $${s.crossedUSD.toFixed(2)} of real deposits (helping not counted) on ${dayKey(s.crossedAt)}.`,
        periodKey: dayKey(s.crossedAt),
        ownerId: s.crossedOwner,
      });
    }
    for (const [d, inr] of s.days) {
      if (d >= today) continue; // only finished days
      const tier = tierFor(inr);
      if (!tier) continue;
      due.push({
        rewardType: 'daily_target',
        key: `daily_${s.sellerId}_${d}`,
        amountPKR: tier.pkr,
        title: `Daily target ${fmtINR(tier.inr)}+ — ${s.storeName} (${d})`,
        description: `${s.storeName} deposited ${fmtINR(inr)} real INR on ${d} (India time).`,
        periodKey: d,
        ownerId: s.dayOwner.get(d) || '',
      });
    }
    for (const [w, inr] of s.weeks) {
      if (w >= thisWeek) continue; // only finished weeks (Monday–Sunday)
      if (inr < REWARD_RULES.weekly.inr) continue;
      due.push({
        rewardType: 'weekly_target',
        key: `weekly_${s.sellerId}_${w}`,
        amountPKR: REWARD_RULES.weekly.pkr,
        title: `Weekly target ₹5 lakh — ${s.storeName} (week of ${w})`,
        description: `${s.storeName} deposited ${fmtINR(inr)} real INR in the week ${w} – ${addDays(w, 6)}.`,
        periodKey: w,
        ownerId: s.weekOwner.get(w) || '',
      });
    }
    out.push({
      sellerId: s.sellerId,
      storeName: s.storeName,
      realUSD: s.realUSD,
      wallet300At: s.crossedAt,
      todayINR: num(s.days.get(today)),
      weekINR: num(s.weeks.get(thisWeek)),
      due,
    });
  }
  return out;
}

let lastRun = 0;
let running = null;
let lastFacts = [];

/**
 * Creates the PENDING claims that are due (never twice) and returns every seller's progress.
 * Runs at most once a minute unless forced.
 */
export async function evaluateRewards({ force = false } = {}) {
  if (running) return running;
  if (!force && Date.now() - lastRun < 60 * 1000) return lastFacts;
  running = (async () => {
    try {
      // Old system: pending claims of the old kinds are closed (approved ones are never touched)
      await RewardClaim.updateMany(
        { status: 'pending', rewardType: { $in: OLD_REWARD_TYPES } },
        { $set: { status: 'rejected', rejectedAt: new Date(), adminNote: 'Old reward system (replaced on 10 Oct 2026)' } }
      );

      const ledger = await buildLedger();
      const deposits = (ledger.entries || []).filter((e) => e.kind === 'deposit' && e.sellerId);
      const facts = computeRewardFacts(deposits);

      const sellerIds = facts.map((f) => f.sellerId);
      const [assigns, oldPaid] = await Promise.all([
        SellerAssignment.find({ sellerId: { $in: sellerIds }, status: 'active' }).select('sellerId memberId').lean(),
        // the old "first seller 5 orders" 5,000 counts as this seller's $300 reward
        RewardClaim.find({ rewardType: 'first_seller_5orders', status: 'approved', sellerId: { $in: sellerIds } }).select('sellerId').lean(),
      ]);
      const ownerOf = new Map(assigns.map((a) => [sid(a.sellerId), sid(a.memberId)]));
      const paidOld = new Set(oldPaid.map((c) => sid(c.sellerId)));
      const depositOwners = facts.flatMap((f) => f.due.map((d) => d.ownerId)).filter(Boolean);
      const owners = await Member.find({ _id: { $in: [...new Set([...ownerOf.values(), ...depositOwners])] } }).select('name role active').lean();
      const ownerDoc = new Map(owners.map((m) => [sid(m._id), m]));

      const created = [];
      const dueKeys = new Set();
      for (const f of facts) {
        const ownerId = ownerOf.get(f.sellerId);
        f.ownerId = ownerId || '';
        f.ownerName = ownerDoc.get(ownerId)?.name || '';
        f.wallet300PaidBefore = paidOld.has(f.sellerId);
        for (const d of f.due) {
          if (d.rewardType === 'wallet_300' && paidOld.has(f.sellerId)) continue;
          dueKeys.add(d.key);
          // the reward goes to whoever owned the seller when the money came (not who owns it today)
          const holder = (d.ownerId && ownerDoc.get(d.ownerId) ? d.ownerId : '') || (ownerDoc.get(ownerId) ? ownerId : '');
          if (!holder) continue; // no owner yet: made once the deposit has an owner
          d.holder = holder;
        }
      }

      const allDue = facts.flatMap((f) => f.due.filter((d) => d.holder).map((d) => ({ ...d, sellerId: f.sellerId, storeName: f.storeName })));
      const existing = await RewardClaim.find({ rewardType: { $in: NEW_REWARD_TYPES } }).lean();
      const byKey = new Map(existing.map((c) => [c.claimKey, c]));
      const topupsOf = new Map();
      for (const c of existing) {
        if (c.topupOf) topupsOf.set(c.topupOf, num(topupsOf.get(c.topupOf)) + (['approved', 'pending'].includes(c.status) ? num(c.amountPKR) : 0));
      }
      const extraKeys = new Set(existing.filter((c) => c.topupOf).map((c) => c.claimKey));
      const nameOf = (id) => ownerDoc.get(id)?.name || '';

      for (const d of allDue) {
        const have = byKey.get(d.key);
        if (!have) {
          const res = await RewardClaim.updateOne(
            { claimKey: d.key },
            {
              $setOnInsert: {
                memberId: d.holder,
                sellerId: d.sellerId,
                rewardType: d.rewardType,
                title: d.title,
                amountPKR: d.amountPKR,
                description: d.description,
                periodKey: d.periodKey,
                status: 'pending',
                claimKey: d.key,
                autoCreated: true,
              },
            },
            { upsert: true }
          );
          if (res.upsertedCount) created.push({ ...d, ownerId: d.holder, ownerName: nameOf(d.holder) });
          continue;
        }
        // Closed by this check earlier but due again (e.g. the deposit came back): open it again.
        // A reward an ADMIN declined is never reopened.
        if (have.status === 'rejected' && have.closedBySystem) {
          await RewardClaim.updateOne(
            { _id: have._id, status: 'rejected' },
            {
              $set: { status: 'pending', closedBySystem: false, amountPKR: d.amountPKR, title: d.title, description: d.description, adminNote: '' },
              $push: { history: { at: new Date(), by: 'system', action: 'reopened', note: 'due again' } },
            }
          );
          created.push({ ...d, ownerId: sid(have.memberId), ownerName: nameOf(sid(have.memberId)) });
          continue;
        }
        // A day's total went up later (a deposit of that day was counted afterwards)
        const paidSoFar = num(have.amountPKR) + num(topupsOf.get(d.key));
        if (have.status === 'pending' && num(have.amountPKR) !== d.amountPKR) {
          await RewardClaim.updateOne(
            { _id: have._id, status: 'pending' },
            {
              $set: { amountPKR: d.amountPKR, title: d.title, description: d.description, warning: '' },
              $push: { history: { at: new Date(), by: 'system', action: 'amount updated', note: 'the deposits of that period changed', from: { amountPKR: have.amountPKR }, to: { amountPKR: d.amountPKR } } },
            }
          );
        } else if (have.status === 'approved' && d.amountPKR > paidSoFar) {
          const extraKey = `${d.key}_upto${d.amountPKR}`;
          if (!extraKeys.has(extraKey)) {
            const res = await RewardClaim.updateOne(
              { claimKey: extraKey },
              {
                $setOnInsert: {
                  memberId: have.memberId,
                  sellerId: d.sellerId,
                  rewardType: d.rewardType,
                  title: `${d.title} (top-up)`,
                  amountPKR: d.amountPKR - paidSoFar,
                  description: `${d.description} Rs ${paidSoFar.toLocaleString()} was already given; this is the difference.`,
                  periodKey: d.periodKey,
                  status: 'pending',
                  claimKey: extraKey,
                  topupOf: d.key,
                  autoCreated: true,
                },
              },
              { upsert: true }
            );
            if (res.upsertedCount) created.push({ ...d, amountPKR: d.amountPKR - paidSoFar, ownerId: sid(have.memberId), ownerName: nameOf(sid(have.memberId)) });
          }
        }
        if (have.warning && have.status !== 'reversed') await RewardClaim.updateOne({ _id: have._id }, { $set: { warning: '' } });
      }

      // Safety: only when the finance ledger is complete (two partners), never on a half-built one
      const ledgerSound = ledger.partnersOk !== false && deposits.length > 0;
      // A reward that is no longer due (deposit moved to another seller, reversed, or taken out of
      // the count): a waiting one is closed; an approved one is flagged for the admins to check.
      for (const c of (ledgerSound ? existing : [])) {
        if (!c.autoCreated) continue;
        const key = c.topupOf || c.claimKey;
        if (dueKeys.has(key) || !c.sellerId) continue;
        if (c.status === 'pending') {
          await RewardClaim.updateOne(
            { _id: c._id, status: 'pending' },
            {
              $set: { status: 'rejected', closedBySystem: true, rejectedAt: new Date(), adminNote: 'No longer due: the deposits changed (moved, reversed or not counted)' },
              $push: { history: { at: new Date(), by: 'system', action: 'closed', note: 'no longer due' } },
            }
          );
        } else if (c.status === 'approved' && !c.warning) {
          await RewardClaim.updateOne({ _id: c._id }, { $set: { warning: 'The deposits behind this reward changed and it is no longer due. Check it — use “Take back” if it was given by mistake.' } });
        }
      }

      if (created.length) {
        try {
          const { sendPushToUser, sendPushToRole } = await import('./push.js');
          for (const c of created) {
            sendPushToUser(c.ownerId, {
              title: `🏆 Reward earned: Rs ${c.amountPKR.toLocaleString()} PKR`,
              body: `${c.title}. Waiting for admin approval.`,
              url: '/rewards',
              type: 'finance',
            }).catch(() => {});
          }
          sendPushToRole('admin', {
            title: `🏆 ${created.length} new reward${created.length > 1 ? 's' : ''} to approve`,
            body: created.map((c) => `${c.ownerName}: Rs ${c.amountPKR.toLocaleString()} (${c.storeName})`).join(' • ').slice(0, 180),
            url: '/rewards',
            type: 'finance',
          }).catch(() => {});
        } catch (e) {
          console.error('[rewards] notify failed', e?.message);
        }
      }

      lastFacts = facts;
      lastRun = Date.now();
      return facts;
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Kept for older callers: rewards are checked for everyone at once now. */
export async function evaluateMemberMilestones() {
  return evaluateRewards();
}
