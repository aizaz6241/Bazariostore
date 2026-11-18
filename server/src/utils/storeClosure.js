import mongoose from 'mongoose';
import Seller from '../models/Seller.js';
import HealthEvent from '../models/HealthEvent.js';
import { notify } from './notify.js';
import { toAdmins, toSellers } from './realtime.js';
import { warnHoursFor } from './sellerTier.js';

/**
 * STORE CLOSURE — a store asks to close; it closes after a 7-day review.
 *
 * To ask (eligibility):
 *   - the store is active (not frozen / suspended)
 *   - account health 90 or above
 *   - no late or missed order in the last 7 days (late confirmation, wallet short at the warning,
 *     missed deadline, order left unconfirmed after the deadline)
 *   - no order waiting past its warning time right now, and no delivery on hold because of the
 *     store's wallet
 *
 * Review (7 days): the store keeps taking orders and must confirm every one of them on time.
 *   - account health below 90 during the review → the review ENDS and the store is back at the
 *     requirements step (health 90+ and a clean week must be met again, then it asks again; emailed)
 *   - a late / missed order (deadline crossed) while health stays 90+ → the 7 days RESTART from
 *     that moment; the store is notified + emailed which order(s) and the new end date
 *   - a freeze / suspension during the review → the review ends (the store stays open and may
 *     ask again later; emailed)
 *   - after 7 days, as soon as no order is waiting for its confirmation → the store is CLOSED:
 *     it takes no new orders (storefront, admin "Place order", test orders). Orders already
 *     confirmed are still delivered and paid as normal; login, wallet and payouts stay.
 * An admin can approve (close at once) or reject a review with a reason (both emailed to the
 * store), or reopen a closed store. After a rejection the store can ask again only after 7 days
 * (REJECT_WAIT_DAYS); then the same process runs again. Nothing is deleted.
 */
export const REVIEW_DAYS = 7;
export const MIN_HEALTH = 90;
export const REJECT_WAIT_DAYS = 7; // after a rejection the store can ask again after this many days
const DAY = 86400000;
const H = 3600000;
export const DELAY_CODES = ['late_confirm', 'wallet_short', 'deadline_miss', 'deadline_repeat', 'deadline_third', 'extra_order', 'overdue_daily'];
const IN_PROGRESS = ['confirmed', 'processing', 'packed', 'out_from_warehouse', 'delivery_warehouse', 'shipped', 'out_for_delivery'];

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const isId = (v) => mongoose.Types.ObjectId.isValid(String(v || ''));
const Order = () => mongoose.model('Order');
const ownsOrder = (id) => ({ $or: [{ 'items.seller': id }, { seller: id }] });
const err = (status, message) => Object.assign(new Error(message), { status });

let APP = null;
const appRef = () => APP || { get: () => null };

// ─── closed stores, for the order checks (cached 30 s) ───
let closedCache = { at: 0, ids: [] };
export async function closedStoreIds() {
  if (Date.now() - closedCache.at < 30000) return closedCache.ids;
  try {
    const rows = await Seller.find({ 'storeClosure.status': 'closed' }).select('_id').lean();
    closedCache = { at: Date.now(), ids: rows.map((r) => String(r._id)) };
  } catch (e) {
    console.error('[closure] closed list:', e.message);
  }
  return closedCache.ids;
}
const forgetClosedCache = () => {
  closedCache = { at: 0, ids: [] };
};
export async function isStoreClosed(sellerId) {
  if (!isId(sellerId)) return false;
  return Boolean(await Seller.exists({ _id: oid(sellerId), 'storeClosure.status': 'closed' }));
}

/** Facts about the store's orders and health (delays counted from `since`). */
async function facts(seller, since) {
  const id = seller._id;
  const now = Date.now();
  const [delays, pending, stuck] = await Promise.all([
    HealthEvent.find({ seller: id, code: { $in: DELAY_CODES }, 'waived.at': null, createdAt: { $gte: since } })
      .select('code title createdAt orderNumbers')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
    Order()
      .find({ status: 'pending', ...ownsOrder(id) })
      .select('orderNumber pendingSince createdAt seller items.seller items.itemStatus')
      .limit(200)
      .lean(),
    Order()
      .find({ status: { $in: IN_PROGRESS }, ...ownsOrder(id), 'autoIssue.reason': { $exists: true, $nin: [null, ''] } })
      .select('orderNumber autoIssue.reason')
      .limit(10)
      .lean(),
  ]);
  const sid = String(id);
  const warnH = warnHoursFor(seller);
  const waiting = [];
  for (const o of pending) {
    const mine = (o.items || []).some((it) => (it.seller ? String(it.seller) === sid : String(o.seller || '') === sid) && (!it.itemStatus || it.itemStatus === 'pending'));
    if (!mine) continue;
    const waited = (now - new Date(o.pendingSince || o.createdAt).getTime()) / H;
    waiting.push({ id: String(o._id), orderNumber: o.orderNumber, late: waited >= warnH, hours: Math.floor(waited) });
  }
  return {
    score: Number.isFinite(seller.accountHealth?.score) ? seller.accountHealth.score : 100,
    delays,
    waiting,
    late: waiting.filter((w) => w.late),
    stuck,
  };
}

const fmtDay = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const fmtWhen = (d) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST';
/** Start of the current 7-day round (a late order restarts it). */
const roundStart = (c) => new Date(c.reviewStartedAt || c.requestedAt || Date.now());

/** After a rejection: the date from which the store may ask again (null = no wait). */
export function retryAt(seller) {
  const c = seller?.storeClosure || {};
  if (c.status !== 'rejected' || !c.endedAt) return null;
  const at = new Date(new Date(c.endedAt).getTime() + REJECT_WAIT_DAYS * DAY);
  return at.getTime() > Date.now() ? at : null;
}

/** The requirements to ask for closing, each with ok + a short detail. */
export async function eligibility(seller) {
  const f = await facts(seller, new Date(Date.now() - REVIEW_DAYS * DAY));
  const wait = retryAt(seller);
  const checks = [
    ...(wait
      ? [
          {
            key: 'retryWait',
            label: `${REJECT_WAIT_DAYS} days after your last request was rejected`,
            ok: false,
            detail: `You can try again on ${fmtDay(wait)} — we keep monitoring your store until then.`,
          },
        ]
      : []),
    {
      key: 'active',
      label: 'Store is active (not frozen or suspended)',
      ok: seller.status === 'active',
      detail: seller.status === 'active' ? '' : `Your store is ${seller.status === 'frozen' ? 'frozen' : seller.status}.`,
    },
    {
      key: 'health',
      label: `Account health ${MIN_HEALTH} or above`,
      ok: f.score >= MIN_HEALTH,
      detail: `${f.score}/100`,
    },
    {
      key: 'noDelays',
      label: `No late or missed order in the last ${REVIEW_DAYS} days`,
      ok: f.delays.length === 0,
      detail: f.delays.length ? `${f.delays.length} in the last ${REVIEW_DAYS} days · last: ${f.delays[0].title} (${fmtDay(f.delays[0].createdAt)})` : '',
    },
    {
      key: 'noLate',
      label: 'No order waiting past its warning time',
      ok: f.late.length === 0,
      detail: f.late.length ? `Confirm ${f.late.map((w) => `#${w.orderNumber}`).slice(0, 5).join(', ')}` : '',
    },
    {
      key: 'noStuck',
      label: 'No delivery on hold because of your wallet',
      ok: f.stuck.length === 0,
      detail: f.stuck.length ? `${f.stuck.map((o) => `#${o.orderNumber}`).slice(0, 5).join(', ')} — deposit so they can move on` : '',
    },
  ];
  return { eligible: checks.every((c) => c.ok), checks, facts: f };
}

/** Review progress (for the store's page and the admin tab). */
async function reviewProgress(seller) {
  const c = seller.storeClosure || {};
  if (c.status !== 'review' || !c.requestedAt) return null;
  const start = roundStart(c);
  const f = await facts(seller, start);
  const ordersInReview = await Order().countDocuments({ ...ownsOrder(seller._id), createdAt: { $gte: new Date(c.requestedAt) } });
  const endsAt = new Date(c.reviewEndsAt || start.getTime() + REVIEW_DAYS * DAY);
  const total = REVIEW_DAYS * DAY;
  const done = Math.min(total, Math.max(0, Date.now() - start.getTime()));
  return {
    endsAt,
    day: Math.min(REVIEW_DAYS, Math.floor(done / DAY) + 1),
    days: REVIEW_DAYS,
    progress: Math.round((done / total) * 100),
    ordersInReview,
    waiting: f.waiting.length,
    late: f.late.length,
    delays: f.delays.length,
    score: f.score,
    frozen: seller.status !== 'active',
    startedAt: start,
    restarts: c.restarts || 0,
    lastRestartAt: c.lastRestartAt || null,
    lastRestartNote: c.lastRestartNote || '',
    // after the 7 days the store closes as soon as nothing is waiting for its confirmation
    waitingForOrders: Date.now() >= endsAt.getTime() && f.waiting.length > 0,
  };
}

const SELECT = 'storeName ownerName email status tier tierSince isTestAccount accountType accountHealth.score storeClosure';

/** Everything the store's "Close store" page needs. */
export async function closureOverview(sellerId) {
  if (!isId(sellerId)) return null;
  const seller = await Seller.findById(sellerId).select(SELECT).lean();
  if (!seller) return null;
  const c = seller.storeClosure || {};
  const status = c.status || 'none';
  const elig = await eligibility(seller);
  return {
    status,
    reason: c.reason || '',
    requestedAt: c.requestedAt || null,
    reviewEndsAt: c.reviewEndsAt || null,
    closedAt: c.closedAt || null,
    endedAt: c.endedAt || null,
    endNote: c.endNote || '',
    reviewDays: REVIEW_DAYS,
    minHealth: MIN_HEALTH,
    eligible: elig.eligible && !['review', 'closed'].includes(status),
    retryAt: retryAt(seller),
    rejectWaitDays: REJECT_WAIT_DAYS,
    checks: elig.checks,
    review: await reviewProgress(seller),
  };
}

const historyPush = (status, by, note = '') => ({ $push: { 'storeClosure.history': { $each: [{ status, at: new Date(), by, note: String(note || '').slice(0, 300) }], $slice: -20 } } });
const changed = (sellerId) => {
  forgetClosedCache();
  toAdmins('sellers', 'closure:changed', { sellerId: String(sellerId) });
  toSellers([sellerId], 'closure:changed', { sellerId: String(sellerId) });
};

/** The store asks to close (only when every requirement is met). */
export async function applyForClosure(sellerId, reason = '') {
  const seller = await Seller.findById(sellerId).select(SELECT).lean();
  if (!seller) throw err(404, 'Store not found');
  const status = seller.storeClosure?.status || 'none';
  if (status === 'review') throw err(400, 'Your store is already in the closing review.');
  if (status === 'closed') throw err(400, 'Your store is already closed.');
  const elig = await eligibility(seller);
  if (!elig.eligible) throw err(400, 'Your store does not meet every requirement yet. See the list on this page.');
  const now = new Date();
  const ends = new Date(now.getTime() + REVIEW_DAYS * DAY);
  const r = await Seller.updateOne(
    { _id: seller._id, 'storeClosure.status': { $nin: ['review', 'closed'] } },
    {
      $set: {
        'storeClosure.status': 'review',
        'storeClosure.reason': String(reason || '').trim().slice(0, 500),
        'storeClosure.requestedAt': now,
        'storeClosure.reviewEndsAt': ends,
        'storeClosure.reviewStartedAt': now,
        'storeClosure.restarts': 0,
        'storeClosure.lastRestartAt': null,
        'storeClosure.lastRestartNote': '',
        'storeClosure.closedAt': null,
        'storeClosure.endedAt': null,
        'storeClosure.endNote': '',
        'storeClosure.by': 'store',
      },
      ...historyPush('review', 'store', reason),
    }
  );
  if (!r.modifiedCount) throw err(400, 'Your store is already in the closing review.');
  notify(appRef(), {
    recipientType: 'admin',
    type: 'approval',
    title: `🏁 Store closure request: ${seller.storeName}`,
    body: `${seller.storeName} asked to close the store. The 7-day review has started (ends ${fmtDay(ends)}).${reason ? ` Reason: ${String(reason).slice(0, 140)}` : ''}`,
    link: '/admin/applications?tab=closures',
  });
  notify(appRef(), {
    recipientType: 'seller',
    sellerId: String(seller._id),
    type: 'system',
    title: '🏁 Store closing review started',
    body: `Your 7-day closing review has started (ends ${fmtDay(ends)}). Keep confirming every order on time — a late or missed order restarts the 7 days. After the review your store closes and takes no new orders.`,
    link: '/seller/close-store',
    push: false,
  });
  changed(seller._id);
  return closureOverview(seller._id);
}

/** The store withdraws its request during the review. */
export async function cancelClosure(sellerId) {
  const r = await Seller.updateOne(
    { _id: oid(sellerId), 'storeClosure.status': 'review' },
    { $set: { 'storeClosure.status': 'cancelled', 'storeClosure.endedAt': new Date(), 'storeClosure.endNote': 'Withdrawn by the store', 'storeClosure.by': 'store' }, ...historyPush('cancelled', 'store') }
  );
  if (!r.modifiedCount) throw err(400, 'There is no closing review to cancel.');
  const s = await Seller.findById(sellerId).select('storeName').lean();
  notify(appRef(), {
    recipientType: 'admin',
    type: 'approval',
    title: `Store closure withdrawn: ${s?.storeName || 'store'}`,
    body: `${s?.storeName || 'The store'} cancelled its closing request. The store stays open.`,
    link: '/admin/applications?tab=closures',
  });
  changed(sellerId);
  return closureOverview(sellerId);
}

async function closeNow(seller, by, note) {
  const now = new Date();
  const r = await Seller.updateOne(
    { _id: seller._id, 'storeClosure.status': 'review' },
    { $set: { 'storeClosure.status': 'closed', 'storeClosure.closedAt': now, 'storeClosure.endNote': String(note || '').slice(0, 300), 'storeClosure.by': by }, ...historyPush('closed', by, note) }
  );
  if (!r.modifiedCount) return false;
  notify(appRef(), {
    recipientType: 'seller',
    sellerId: String(seller._id),
    type: 'system',
    title: by === 'system' ? '🏁 Your store is now closed' : '✅ Store closing request approved — your store is now closed',
    body: `${by === 'system' ? 'Your 7-day closing review is complete.' : 'Your request to close the store has been approved.'} Your store takes no new orders from now on. Orders already confirmed are still delivered and paid. You can still log in to see your orders, wallet and payouts.`,
    link: '/seller/close-store',
    email: true,
  });
  notify(appRef(), {
    recipientType: 'admin',
    type: 'approval',
    title: `🏁 Store closed: ${seller.storeName}`,
    body: by === 'system' ? `${seller.storeName} passed its 7-day review and is now closed (no new orders).` : `${seller.storeName} was closed by ${by}.`,
    link: '/admin/applications?tab=closures',
  });
  changed(seller._id);
  return true;
}

async function failReview(seller, why) {
  const r = await Seller.updateOne(
    { _id: seller._id, 'storeClosure.status': 'review' },
    { $set: { 'storeClosure.status': 'failed', 'storeClosure.endedAt': new Date(), 'storeClosure.endNote': why, 'storeClosure.by': 'system' }, ...historyPush('failed', 'system', why) }
  );
  if (!r.modifiedCount) return false;
  notify(appRef(), {
    recipientType: 'seller',
    sellerId: String(seller._id),
    type: 'compliance',
    title: 'Store closing review ended',
    body: `Your closing review ended: ${why} Your store stays open and is back at the requirements step. When every requirement is met again (account health ${MIN_HEALTH}+ and no late or missed order for ${REVIEW_DAYS} days), you can ask to close again.`,
    link: '/seller/close-store',
    email: true,
  });
  notify(appRef(), {
    recipientType: 'admin',
    type: 'approval',
    title: `Store closure review failed: ${seller.storeName}`,
    body: why,
    link: '/admin/applications?tab=closures',
  });
  changed(seller._id);
  return true;
}

/**
 * A late / missed order during the review → the 7 days start again from that moment.
 * The store gets a notification + email with the order(s), the reason and the new end date.
 */
async function restartReview(seller, delays) {
  const c = seller.storeClosure || {};
  const latest = delays.reduce((m, d) => Math.max(m, new Date(d.createdAt).getTime()), 0);
  // start just after the newest late event, so the same event never restarts it twice
  const start = new Date(Math.max(latest + 1, roundStart(c).getTime() + 1));
  const ends = new Date(start.getTime() + REVIEW_DAYS * DAY);
  const nums = [...new Set(delays.flatMap((d) => (d.orderNumbers || []).map((n) => `#${n}`)))].slice(0, 6);
  const what = [...new Set(delays.map((d) => d.title).filter(Boolean))].slice(0, 3).join(', ') || 'An order was late';
  const why = `${what}${nums.length ? ` (order ${nums.join(', ')})` : ''} on ${fmtWhen(latest || Date.now())}.`;
  const r = await Seller.updateOne(
    { _id: seller._id, 'storeClosure.status': 'review', 'storeClosure.reviewStartedAt': c.reviewStartedAt || null },
    {
      $set: {
        'storeClosure.reviewStartedAt': start,
        'storeClosure.reviewEndsAt': ends,
        'storeClosure.lastRestartAt': new Date(),
        'storeClosure.lastRestartNote': why,
        'storeClosure.by': 'system',
      },
      $inc: { 'storeClosure.restarts': 1 },
      ...historyPush('restarted', 'system', why),
    }
  );
  if (!r.modifiedCount) return false;
  notify(appRef(), {
    recipientType: 'seller',
    sellerId: String(seller._id),
    type: 'compliance',
    title: '⏱ Your 7-day closing review has restarted',
    body: `An order deadline was crossed during your closing review: ${why} Your 7-day review has started again from ${fmtDay(start)} and now ends on ${fmtDay(ends)}. Confirm every order before its deadline so the 7 days can finish and your store can close.`,
    link: '/seller/close-store',
    email: true,
  });
  notify(appRef(), {
    recipientType: 'admin',
    type: 'approval',
    title: `⏱ Closing review restarted: ${seller.storeName}`,
    body: `${why} The 7 days restarted (now ends ${fmtDay(ends)}).`,
    link: '/admin/applications?tab=closures',
  });
  changed(seller._id);
  return true;
}

/** Admin: reject a review, close at once, or reopen a closed store. */
export async function adminClosureAction(sellerId, action, admin, note = '') {
  if (!isId(sellerId)) throw err(404, 'Store not found');
  const seller = await Seller.findById(sellerId).select(SELECT).lean();
  if (!seller) throw err(404, 'Store not found');
  const status = seller.storeClosure?.status || 'none';
  const by = admin?.name || 'Admin';
  const text = String(note || '').trim().slice(0, 300);
  if (action === 'reject') {
    if (status !== 'review') throw err(400, 'This store is not in a closing review.');
    if (!text) throw err(400, 'Write the reason (the store sees it).');
    await Seller.updateOne(
      { _id: seller._id, 'storeClosure.status': 'review' },
      { $set: { 'storeClosure.status': 'rejected', 'storeClosure.endedAt': new Date(), 'storeClosure.endNote': text, 'storeClosure.by': by }, ...historyPush('rejected', by, text) }
    );
    notify(appRef(), {
      recipientType: 'seller',
      sellerId: String(seller._id),
      type: 'compliance',
      title: 'Store closing request rejected',
      body: `Your request to close the store was rejected. Reason: ${text} Your store stays open and keeps getting orders. You can try again in ${REJECT_WAIT_DAYS} days (from ${fmtDay(Date.now() + REJECT_WAIT_DAYS * DAY)}) — until then we keep monitoring your store, and the requirements must be met again.`,
      link: '/seller/close-store',
      email: true,
    });
    changed(seller._id);
  } else if (action === 'close') {
    if (status !== 'review') throw err(400, 'Only a store in the closing review can be closed here.');
    await closeNow(seller, by, text || 'Approved by admin');
  } else if (action === 'reopen') {
    if (status !== 'closed') throw err(400, 'This store is not closed.');
    await Seller.updateOne(
      { _id: seller._id, 'storeClosure.status': 'closed' },
      { $set: { 'storeClosure.status': 'none', 'storeClosure.endNote': text || 'Reopened by admin', 'storeClosure.by': by }, ...historyPush('reopened', by, text) }
    );
    notify(appRef(), {
      recipientType: 'seller',
      sellerId: String(seller._id),
      type: 'approval',
      title: '✅ Your store is open again',
      body: 'Your store has been reopened and can take new orders again.',
      link: '/seller',
    });
    changed(seller._id);
  } else {
    throw err(400, 'Unknown action');
  }
  return adminClosureRow(await Seller.findById(sellerId).select(SELECT).lean());
}

/** One row of the admin "Store closures" tab. */
async function adminClosureRow(s) {
  if (!s) return null;
  const c = s.storeClosure || {};
  return {
    sellerId: String(s._id),
    storeName: s.storeName,
    ownerName: s.ownerName,
    email: s.email,
    storeStatus: s.status,
    tier: s.tier === 'diamond' ? 'Diamond' : 'Basic',
    test: Boolean(s.isTestAccount || s.accountType === 'test'),
    health: s.accountHealth?.score ?? 100,
    status: c.status || 'none',
    reason: c.reason || '',
    requestedAt: c.requestedAt || null,
    reviewEndsAt: c.reviewEndsAt || null,
    closedAt: c.closedAt || null,
    endedAt: c.endedAt || null,
    endNote: c.endNote || '',
    by: c.by || '',
    history: (c.history || []).slice(-8).reverse(),
    review: await reviewProgress(s),
  };
}

/** Admin list: requests in review first, then closed, then ended ones. */
export async function adminClosureList({ status = 'all' } = {}) {
  const want = ['review', 'closed', 'failed', 'cancelled', 'rejected'];
  const filter = { 'storeClosure.status': status !== 'all' && want.includes(status) ? status : { $in: want } };
  const rows = await Seller.find(filter).select(SELECT).sort({ 'storeClosure.requestedAt': -1 }).limit(300).lean();
  const order = { review: 0, closed: 1, failed: 2, rejected: 3, cancelled: 4 };
  const list = await Promise.all(rows.map(adminClosureRow));
  list.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0));
  const counts = {};
  for (const r of list) counts[r.status] = (counts[r.status] || 0) + 1;
  return { list, counts };
}

/**
 * Every 10 minutes: a freeze / suspension or health below 90 ends the review (back to the
 * requirements); a late / missed order with health still 90+ restarts the 7 days; a review whose 7 days are over closes as soon as no order waits for the store's
 * confirmation.
 */
let running = false;
export async function closureSweep() {
  if (running || mongoose.connection.readyState !== 1) return;
  running = true;
  try {
    const list = await Seller.find({ 'storeClosure.status': 'review' }).select(SELECT).limit(500).lean();
    for (const s of list) {
      try {
        const c = s.storeClosure;
        const f = await facts(s, roundStart(c));
        if (s.status !== 'active') {
          await failReview(s, `The store was ${s.status === 'frozen' ? 'frozen' : s.status} during the review.`);
          continue;
        }
        // health below 90 → the review ends; the store goes back to the requirements step
        if (f.score < MIN_HEALTH) {
          const d = f.delays[0];
          const what = d ? ` after a late / missed order (${d.title}${d.orderNumbers?.length ? ` #${d.orderNumbers[0]}` : ''})` : '';
          await failReview(s, `Your account health fell to ${f.score}/100${what} — it must be ${MIN_HEALTH} or above.`);
          continue;
        }
        // a late / missed order (deadline crossed) while health stays 90+ → the 7 days start again
        if (f.delays.length) {
          await restartReview(s, f.delays);
          continue;
        }
        const ends = new Date(c.reviewEndsAt || roundStart(c).getTime() + REVIEW_DAYS * DAY);
        if (Date.now() >= ends.getTime() && f.waiting.length === 0) await closeNow(s, 'system', 'Passed the 7-day review');
      } catch (e) {
        console.error('[closure] sweep store:', e.message);
      }
    }
  } catch (e) {
    console.error('[closure] sweep failed:', e.message);
  } finally {
    running = false;
  }
}

export function startClosureMonitor(app) {
  APP = app;
  const t = setInterval(closureSweep, 10 * 60 * 1000);
  t.unref?.();
  setTimeout(closureSweep, 60000).unref?.();
}
export const setClosureApp = (app) => {
  APP = app;
};
