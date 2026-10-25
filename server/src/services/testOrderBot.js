import mongoose from 'mongoose';
import Seller from '../models/Seller.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import { MOCK_CUSTOMERS } from '../data/mockCustomers.js';
import { ownProductFilter } from '../routes/sellers/helpers.js';
import { placeSellerOrder, handleStatusUpdate } from '../routes/sellers/orders.routes.js';

/**
 * Automatic daily orders for TEST seller accounts (so the team does not have to place them one by one).
 *
 * Every day, for every test account (isTestAccount, approved, not suspended):
 *   - a day total is picked: mostly $700–1,700, sometimes $1,700–2,200, now and then up to $2,500
 *     (never below $700 or above $2,500);
 *   - it is split into 3–7 orders placed at random times between 09:00 and 22:45, each with 1–3 of
 *     the store's own products, random quantities, a random customer from data/mockCustomers.js;
 *   - the order is made exactly like the admin "Place order" form (placeSellerOrder): pending,
 *     stock reserved, the store is notified. Admins are NOT notified for each one (no flood).
 * At 23:30 every automatic test order that is still pending is confirmed (handleStatusUpdate, the
 * same confirm as the admin screen: the money moves to the processing fund). Orders the team
 * confirmed themselves are already confirmed and are left alone. Orders placed by hand are never
 * auto-confirmed (the team may be testing the 24 h / 48 h deadline on them).
 * After that the normal automatic delivery schedule moves them on (orderProgressionService).
 *
 * Times are Pakistan time (UTC+5). The plan of each day is saved in `testorderplans`, so a server
 * restart neither repeats nor loses an order. Turn it off with TEST_ORDER_BOT=off.
 */

const TZ_OFFSET_MIN = 5 * 60; // Pakistan time (no daylight saving)
const DAY_MIN = 700;
const DAY_MAX = 2500;
const START_MIN = 9 * 60; // first order not before 09:00
const END_MIN = 22 * 60 + 45; // last order not after 22:45
const CONFIRM_MIN = 23 * 60 + 30; // 23:30: still-pending automatic orders are confirmed
const MAX_LINES = 3; // usual products per order
const MAX_LINES_HARD = 5; // only when the products are cheap and the order would stay far too small
const MAX_QTY = 5; // usual quantity per product (10 for products under $50)
const RETRY_CONFIRM_MS = 60 * 60 * 1000; // a confirm that failed (e.g. wallet too low) is tried again hourly
const BOT_NAME = 'Daily test orders';

const plans = () => mongoose.connection.collection('testorderplans');
const enabled = () => String(process.env.TEST_ORDER_BOT || '').toLowerCase() !== 'off';

// ── time helpers (Pakistan time) ──
const local = (d = new Date()) => new Date(d.getTime() + TZ_OFFSET_MIN * 60000);
const dayKeyOf = (d = new Date()) => local(d).toISOString().slice(0, 10);
const minuteOfDay = (d = new Date()) => {
  const l = local(d);
  return l.getUTCHours() * 60 + l.getUTCMinutes();
};
/** The real moment of `minute` (minutes after local midnight) on local day `dayKey`. */
const atLocal = (dayKey, minute) => new Date(Date.parse(`${dayKey}T00:00:00Z`) + (minute - TZ_OFFSET_MIN) * 60000);

// ── random helpers ──
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** The day's total: mostly $700–1,700, sometimes up to $2,200, rarely up to $2,500. */
export function pickDayTarget(r = Math.random()) {
  if (r < 0.8) return Math.round(rand(DAY_MIN, 1700));
  if (r < 0.95) return Math.round(rand(1700, 2200));
  return Math.round(rand(2200, DAY_MAX));
}

/** A new day plan: the total and 3–7 order times between `fromMin` and 22:45. */
export function makeDayPlan(dayKey, fromMin) {
  const start = Math.max(START_MIN, fromMin);
  if (start > END_MIN - 10) return { target: 0, slots: [] };
  const target = pickDayTarget();
  const n = randInt(3, 7);
  const times = Array.from({ length: n }, () => randInt(start, END_MIN)).sort((a, b) => a - b);
  const slots = times.map((m) => ({ at: atLocal(dayKey, m), weight: money(rand(0.6, 1.4)), state: 'waiting', tries: 0 }));
  return { target, slots };
}

/**
 * Products and quantities for one order worth about `target` (never more than `cap`).
 * `mustReach`: the day would end below $700 — then it may go above the target (still under cap).
 */
export function buildItems(products, target, cap, mustReach = 0) {
  target = Math.max(target, mustReach); // the day must not end below $700
  const usable = products.filter((p) => p.price > 0 && p.price <= cap);
  if (!usable.length) return [];
  const lines = [];
  const used = new Set();
  let total = 0;
  const wantLines = randInt(1, MAX_LINES);
  for (let i = 0; i < MAX_LINES_HARD; i++) {
    if (i >= MAX_LINES && total >= Math.max(target * 0.6, mustReach)) break;
    const rem = target - total;
    const room = cap - total;
    let pool = usable.filter((p) => !used.has(String(p._id)) && p.price <= Math.min(rem, room));
    if (!pool.length && total === 0) pool = usable.filter((p) => p.price <= room); // at least one line
    if (!pool.length && total < mustReach) pool = usable.filter((p) => !used.has(String(p._id)) && p.price <= room);
    if (!pool.length) break;
    const p = pick(pool);
    const fit = Math.floor(Math.max(rem, p.price) / p.price);
    const qtyCap = p.price < 50 ? MAX_QTY * 2 : MAX_QTY;
    const maxQty = Math.max(1, Math.min(qtyCap, fit, Math.floor(room / p.price)));
    // the last planned line fills up to the target, earlier ones take a random part
    const last = i >= wantLines - 1;
    const qty = last ? maxQty : Math.max(1, Math.min(maxQty, randInt(1, maxQty)));
    lines.push({ p, qty });
    used.add(String(p._id));
    total += p.price * qty;
    if (last && total >= Math.max(target * 0.9, mustReach)) break;
  }
  // the store has few products: raise quantities until the day reaches $700 (still under the cap)
  for (let round = 0; total < mustReach && round < 40; round++) {
    const l = lines.find((x) => x.qty < 20 && total + x.p.price <= cap);
    if (!l) break;
    l.qty += 1;
    total += l.p.price;
  }
  return lines;
}

function customerFor(planDoc) {
  const usedIds = new Set((planDoc.slots || []).map((s) => s.customerId).filter(Boolean));
  const free = MOCK_CUSTOMERS.filter((c) => !usedIds.has(c.id));
  return pick(free.length ? free : MOCK_CUSTOMERS);
}

async function storeProducts(seller) {
  const filter = await ownProductFilter(seller);
  const all = await Product.find({ $and: [filter, { active: { $ne: false } }, { price: { $gt: 0 } }] })
    .select('_id name price image images stock')
    .lean();
  const inStock = all.filter((p) => (p.stock || 0) > 0);
  // in-stock products first; a store with none in stock still gets orders (as the admin form allows)
  return (inStock.length >= 3 ? inStock : all).map((p) => ({ ...p, price: Number(p.price) || 0 }));
}

/** Today's plan of a store (created on first use). */
async function planFor(seller, dayKey, now) {
  const _id = `${seller._id}:${dayKey}`;
  const have = await plans().findOne({ _id });
  if (have) return have;
  const fresh = makeDayPlan(dayKey, minuteOfDay(now) + 2);
  const doc = { _id, seller: seller._id, storeName: seller.storeName, day: dayKey, createdAt: now, placedTotal: 0, ...fresh };
  try {
    await plans().insertOne(doc);
    if (fresh.slots.length) console.log(`🧪 [Test orders] ${seller.storeName} ${dayKey}: ${fresh.slots.length} orders, about $${fresh.target}`);
    return doc;
  } catch (e) {
    if (e?.code === 11000) return plans().findOne({ _id }); // another run made it at the same moment
    throw e;
  }
}

/** Place one due slot of a plan. */
async function placeSlot(app, seller, plan, index, now) {
  // claim the slot (two server copies / overlapping runs can't both place it)
  const claimed = await plans().findOneAndUpdate(
    { _id: plan._id, [`slots.${index}.state`]: 'waiting' },
    { $set: { [`slots.${index}.state`]: 'placing', [`slots.${index}.claimedAt`]: now } },
    { returnDocument: 'after' }
  );
  const doc = claimed?.value !== undefined ? claimed.value : claimed;
  if (!doc) return;

  const slotKey = `${plan._id}#${index}`;
  const setSlot = (fields) => plans().updateOne({ _id: plan._id }, { $set: Object.fromEntries(Object.entries(fields).map(([k, v]) => [`slots.${index}.${k}`, v])) });
  try {
    const slots = doc.slots;
    const placed = Number(doc.placedTotal) || 0;
    const restWeight = slots.slice(index).filter((s) => s.state === 'waiting' || s.state === 'placing').reduce((a, s) => a + (s.weight || 1), 0) || 1;
    const isLast = slots.slice(index + 1).every((s) => s.state !== 'waiting');
    const remaining = Math.max(0, doc.target - placed);
    const target = isLast ? remaining : (remaining * (slots[index].weight || 1)) / restWeight;
    // the day may end a little above its own total (a product's price rarely fits exactly), never above $2,500
    const mustReach = isLast ? Math.max(0, DAY_MIN - placed) : 0;
    const cap = (mustReach > 0 ? DAY_MAX : Math.min(DAY_MAX, Math.max(doc.target * 1.1, DAY_MIN))) - placed;

    const products = await storeProducts(seller);
    const lines = cap > 0 ? buildItems(products, Math.max(1, target), cap, mustReach) : [];
    if (!lines.length) {
      await setSlot({ state: 'skipped', note: products.length ? 'No product fits the amount left today' : 'The store has no products' });
      return;
    }

    const c = customerFor(doc);
    const out = await placeSellerOrder(
      { app, admin: { id: '', name: BOT_NAME, email: '' } },
      {
        sellerId: String(seller._id),
        items: lines.map(({ p, qty }) => ({ productId: String(p._id), name: p.name, price: p.price, qty, image: p.image || p.images?.[0]?.url || '' })),
        customer: { name: c.name, phone: c.phone, email: c.email },
        shippingAddress: { fullName: c.name, street: c.street, city: c.city, state: c.state, postalCode: c.zip || '', country: c.country || 'United States' },
        paymentMethod: 'cod',
        shippingCost: 0,
        adminNotes: 'Automatic daily test order',
      },
      { quiet: true, extra: { autoTestOrder: true, autoTestSlot: slotKey } }
    );
    if (out.status !== 201) throw new Error(out.json?.message || `status ${out.status}`);
    const total = money(out.order.total);
    await plans().updateOne(
      { _id: plan._id },
      {
        $set: { [`slots.${index}.state`]: 'placed', [`slots.${index}.orderId`]: out.order._id, [`slots.${index}.orderNumber`]: out.order.orderNumber, [`slots.${index}.total`]: total, [`slots.${index}.customerId`]: c.id },
        $inc: { placedTotal: total },
      }
    );
  } catch (e) {
    const tries = (Number(doc.slots[index].tries) || 0) + 1;
    console.error(`🧪 [Test orders] ${seller.storeName}: could not place an order (${tries}/3):`, e.message);
    await setSlot({ state: tries >= 3 ? 'failed' : 'waiting', tries, note: String(e.message || e).slice(0, 200) });
  }
}

/** A slot left "placing" by a restart: placed if its order exists, otherwise tried again. */
async function recoverSlot(plan, index) {
  const slotKey = `${plan._id}#${index}`;
  const order = await Order.findOne({ autoTestSlot: slotKey }).select('_id orderNumber total').lean();
  if (order) {
    await plans().updateOne(
      { _id: plan._id, [`slots.${index}.state`]: 'placing' },
      { $set: { [`slots.${index}.state`]: 'placed', [`slots.${index}.orderId`]: order._id, [`slots.${index}.orderNumber`]: order.orderNumber, [`slots.${index}.total`]: money(order.total) }, $inc: { placedTotal: money(order.total) } }
    );
  } else {
    await plans().updateOne({ _id: plan._id, [`slots.${index}.state`]: 'placing' }, { $set: { [`slots.${index}.state`]: 'waiting' } });
  }
}

async function placeDueOrders(app, now) {
  const dayKey = dayKeyOf(now);
  const nowMin = minuteOfDay(now);
  const sellers = await Seller.find({ isTestAccount: true, status: { $in: ['active', 'frozen'] }, registrationRejectedAt: null })
    .select('_id storeName storeSlug status')
    .lean();
  for (const seller of sellers) {
    try {
      const plan = await planFor(seller, dayKey, now);
      for (let i = 0; i < (plan.slots || []).length; i++) {
        const s = plan.slots[i];
        if (s.state === 'placing' && now - new Date(s.claimedAt || 0) > 10 * 60000) await recoverSlot(plan, i);
        if (s.state !== 'waiting' || new Date(s.at) > now) continue;
        if (nowMin > END_MIN + 30) {
          // the server was off until too late in the evening: this one is not placed any more
          await plans().updateOne({ _id: plan._id, [`slots.${i}.state`]: 'waiting' }, { $set: { [`slots.${i}.state`]: 'missed' } });
          continue;
        }
        const latest = await plans().findOne({ _id: plan._id });
        await placeSlot(app, seller, latest, i, now);
      }
    } catch (e) {
      console.error(`🧪 [Test orders] ${seller.storeName}:`, e.message);
    }
  }
}

// ── 23:30 auto-confirm ──
const confirmTried = new Map(); // orderId -> last try (ms)

/** The latest 23:30 (Pakistan time) that has already passed. */
export function lastConfirmMoment(now = new Date()) {
  const today = atLocal(dayKeyOf(now), CONFIRM_MIN);
  return today <= now ? today : new Date(today.getTime() - 86400000);
}

async function confirmOne(app, order) {
  let code = 200;
  let body = null;
  const res = {
    status(c) {
      code = c;
      return this;
    },
    json(b) {
      body = b;
      return this;
    },
  };
  const req = {
    app,
    admin: { id: '', name: BOT_NAME, role: 'admin', permissions: ['orders'] },
    params: { id: String(order._id) },
    body: { status: 'confirmed', note: 'Confirmed automatically at 11:30 PM (daily test orders)' },
    query: {},
  };
  await handleStatusUpdate(req, res);
  if (code >= 400 || !body?.ok) throw new Error(body?.message || `status ${code}`);
}

async function confirmPendingOrders(app, now) {
  const cutoff = lastConfirmMoment(now);
  const today = dayKeyOf(now);
  const pastConfirmTime = minuteOfDay(now) >= CONFIRM_MIN;
  // due: its planned day is over, or it is today and 23:30 has passed
  const isDue = (o) => {
    const day = /:(\d{4}-\d{2}-\d{2})#/.exec(o.autoTestSlot || '')?.[1];
    if (!day) return new Date(o.createdAt) < cutoff;
    return day < today || (day === today && pastConfirmTime);
  };
  const pending = (await Order.find({ autoTestOrder: true, status: 'pending' }).select('_id orderNumber seller autoTestSlot createdAt').limit(500).lean()).filter(isDue);
  for (const o of pending) {
    const key = String(o._id);
    const last = confirmTried.get(key) || 0;
    if (Date.now() - last < RETRY_CONFIRM_MS) continue;
    confirmTried.set(key, Date.now());
    try {
      // only while the store is still a test account
      const s = await Seller.findById(o.seller).select('isTestAccount').lean();
      if (!s?.isTestAccount) continue;
      const fresh = await Order.findById(o._id).select('status').lean();
      if (fresh?.status !== 'pending') continue; // the team confirmed it meanwhile
      await confirmOne(app, o);
      confirmTried.delete(key);
    } catch (e) {
      console.error(`🧪 [Test orders] #${o.orderNumber} could not be confirmed (tries again in 1 h):`, e.message);
    }
  }
  if (confirmTried.size > 5000) confirmTried.clear();
}

let running = false;

/** One run (every 5 minutes from index.js). */
export async function runTestOrderBot(app, now = new Date()) {
  if (!enabled() || running || mongoose.connection.readyState !== 1) return;
  running = true;
  try {
    await placeDueOrders(app, now);
    await confirmPendingOrders(app, now);
  } catch (e) {
    console.error('🧪 [Test orders] run failed:', e.message);
  } finally {
    running = false;
  }
}

export const TEST_ORDER_RULES = { DAY_MIN, DAY_MAX, START_MIN, END_MIN, CONFIRM_MIN, TZ_OFFSET_MIN };
