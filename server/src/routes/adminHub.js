import { Router } from 'express';
import mongoose from 'mongoose';
import Seller from '../models/Seller.js';
import Order from '../models/Order.js';
import Withdrawal from '../models/Withdrawal.js';
import Refund from '../models/Refund.js';
import { Conversation } from '../models/Chat.js';
import { authAdmin } from '../middleware/auth.js';
import { sellerFacts } from '../utils/chatPlaceholders.js';
import { confirmHoursFor } from '../utils/sellerTier.js';

/**
 * ADMIN HUB — things that make the admin panel quicker to use (read-only, except an admin's own
 * pinned stores):
 *   GET  /api/admin-hub/counts       how many things wait for an admin (menu badges)
 *   GET  /api/admin-hub/today        the "Today" page: everything waiting, oldest first
 *   GET  /api/admin-hub/search?q=    Ctrl + K: stores, orders, chats, payments
 *   GET  /api/admin-hub/seller/:id   the small store panel (opens from any store name)
 *   GET  /api/admin-hub/pins         this admin's pinned stores
 *   POST /api/admin-hub/pins/:id     { pinned: true|false }
 * Every answer only contains what this admin's permissions allow.
 */
const router = Router();

const H = 3600000;
const IN_PROGRESS = ['confirmed', 'processing', 'packed', 'out_from_warehouse', 'delivery_warehouse', 'shipped', 'out_for_delivery'];
const NEEDS_DECISION = ['delivery_failed', 'returned_to_warehouse'];
const LATE_DELIVERY_DAYS = 7; // the automatic lifecycle takes about 5–7 days from confirmation
const STUCK_AFTER_MS = 60 * 60 * 1000; // a next step overdue by more than an hour has not moved by itself
const WAITING_CHAT = ['seller', 'guest', 'customer'];
// previews written by the system when a chat is opened / emptied: nobody wrote anything, so these
// chats do not wait for a reply (they used to show on Today as soon as a store opened its chat)
const SYSTEM_PREVIEWS = ['', 'Conversation started', 'Live guest conversation started', '🧹 Chat cleared'];
const LIST_MAX = 8;
// when a waiting item becomes urgent (shown in red on Today)
const URGENT = {
  chatMin: 30, // chat without a reply for 30 minutes
  depositMin: 30, // deposits are approved within ~15 minutes
  withdrawalH: 24,
  confirmLeftH: 6, // less than 6 hours to the store's confirmation deadline
  healthScore: 20,
  lateExtraDays: 3, // 3 days over the usual delivery time
};

const oid = (v) => (mongoose.Types.ObjectId.isValid(String(v || '')) ? new mongoose.Types.ObjectId(String(v)) : null);
const can = (admin, p) => admin?.role === 'super_admin' || (admin?.permissions || []).includes(p);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sid = (v) => (v && v._id ? String(v._id) : v ? String(v) : '');

/** Not a real client store (test account): kept out of the counts and lists. */
const realStore = { isTestAccount: { $ne: true }, accountType: { $ne: 'test' } };

// ─── what waits for an admin (computed once for everyone, at most every 20 s) ───
let cache = { at: 0, data: null, running: null };
const CACHE_MS = 20000;

async function orderAttention(now) {
  const nowMs = now.getTime();
  // 1. waiting for the store to confirm, from 24 h (Basic warning) on
  const pending = await Order.find({
    status: 'pending',
    $or: [{ pendingSince: { $lt: new Date(nowMs - 24 * H) } }, { pendingSince: null, createdAt: { $lt: new Date(nowMs - 24 * H) } }],
  })
    .select('orderNumber createdAt pendingSince seller items.seller items.sellerName items.itemStatus items.price items.qty total')
    .sort({ createdAt: 1 })
    .limit(300)
    .lean();
  const ids = new Set();
  for (const o of pending) for (const it of o.items || []) if (it.seller) ids.add(String(it.seller));
  for (const o of pending) if (o.seller) ids.add(String(o.seller));
  const sellers = ids.size ? await Seller.find({ _id: { $in: [...ids] } }).select('storeName tier status isTestAccount accountType wallet.balance').lean() : [];
  const byId = new Map(sellers.map((s) => [String(s._id), s]));
  // deposits waiting for our approval, per store (the store is not penalised while one covers it)
  const waitingDep = new Map();
  if (ids.size) {
    const deps = await Withdrawal.find({ seller: { $in: [...ids].map(oid).filter(Boolean) }, type: 'deposit', status: { $in: ['pending', 'processing'] } })
      .select('seller amount')
      .lean();
    for (const d of deps) waitingDep.set(sid(d.seller), (waitingDep.get(sid(d.seller)) || 0) + (Number(d.amount) || 0));
  }
  // the store an item belongs to (old items without a seller belong to the order's seller)
  const ownerOf = (o, it) => sid(it.seller) || sid(o.seller);

  const confirm = [];
  for (const o of pending) {
    const waitingSince = new Date(o.pendingSince || o.createdAt).getTime();
    const hours = (nowMs - waitingSince) / H;
    const storeIds = [...new Set((o.items || []).filter((it) => !it.itemStatus || it.itemStatus === 'pending').map((it) => ownerOf(o, it)).filter(Boolean))];
    for (const id of storeIds) {
      const s = byId.get(id);
      if (!s || s.isTestAccount || s.accountType === 'test' || s.status === 'suspended') continue;
      const limitH = confirmHoursFor(s);
      if (hours < limitH - 24) continue; // not at the warning yet (Diamond)
      const value = (o.items || [])
        .filter((it) => ownerOf(o, it) === id && (!it.itemStatus || it.itemStatus === 'pending'))
        .reduce((t, it) => t + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
      const balance = Number(s.wallet?.balance) || 0;
      const hoursLeft = Math.round((limitH - hours) * 10) / 10;
      confirm.push({
        id: String(o._id),
        orderNumber: o.orderNumber,
        sellerId: id,
        storeName: s.storeName,
        storeStatus: s.status,
        value: r2(value),
        hoursLeft,
        // the store's wallet cannot cover it (it must deposit first); a deposit waiting for us covers it
        short: balance + 0.01 < value,
        depositWaiting: (waitingDep.get(id) || 0) > 0,
        at: new Date(waitingSince),
        urgent: hoursLeft < URGENT.confirmLeftH,
      });
    }
  }
  confirm.sort((a, b) => a.hoursLeft - b.hoursLeft);

  // 2. the courier could not deliver / came back: only an admin moves these on
  const decision = await Order.find({ status: { $in: NEEDS_DECISION } })
    .select('orderNumber status updatedAt seller items.seller items.sellerName total statusHistory')
    .sort({ updatedAt: 1 })
    .limit(200)
    .lean();

  // 3. on the way: the next automatic step is overdue (it did not move by itself), or the order
  //    is taking longer than the usual delivery time
  //    (two separate reads: many old orders on the way used to push the stuck ones out of the list)
  const MOVING_FIELDS = 'orderNumber status nextStatus nextStatusAt createdAt seller items.seller items.sellerName total statusHistory';
  const [stuckRaw, oldRaw] = await Promise.all([
    Order.find({ status: { $in: IN_PROGRESS }, nextStatusAt: { $ne: null, $lt: new Date(nowMs - STUCK_AFTER_MS) } })
      .select(MOVING_FIELDS)
      .sort({ nextStatusAt: 1 })
      .limit(300)
      .lean(),
    Order.find({ status: { $in: IN_PROGRESS }, createdAt: { $lt: new Date(nowMs - LATE_DELIVERY_DAYS * 24 * H) } })
      .select(MOVING_FIELDS)
      .sort({ createdAt: 1 })
      .limit(400)
      .lean(),
  ]);
  const seen = new Set();
  const moving = [...stuckRaw, ...oldRaw].filter((o) => !seen.has(String(o._id)) && seen.add(String(o._id)));

  const storeOf = (o) => {
    const it = (o.items || []).find((x) => x.seller || x.sellerName) || {};
    return { sellerId: sid(it.seller) || sid(o.seller), storeName: it.sellerName || '' };
  };
  const lastAt = (o, status) => {
    const h = (o.statusHistory || []).filter((x) => x.status === status);
    return h.length ? new Date(h[h.length - 1].at) : null;
  };
  const confirmedAt = (o) => {
    const h = (o.statusHistory || []).find((x) => x.status === 'confirmed');
    return h ? new Date(h.at) : new Date(o.createdAt);
  };

  const decisionList = decision.map((o) => ({
    id: String(o._id),
    orderNumber: o.orderNumber,
    status: o.status,
    ...storeOf(o),
    value: r2(o.total),
    at: lastAt(o, o.status) || o.updatedAt,
    urgent: true,
  }));

  const stuck = [];
  const late = [];
  for (const o of moving) {
    const base = { id: String(o._id), orderNumber: o.orderNumber, status: o.status, ...storeOf(o), value: r2(o.total) };
    if (o.nextStatusAt && new Date(o.nextStatusAt).getTime() < nowMs - STUCK_AFTER_MS) {
      stuck.push({ ...base, nextStatus: o.nextStatus, at: o.nextStatusAt, hoursOver: Math.round(((nowMs - new Date(o.nextStatusAt).getTime()) / H) * 10) / 10, urgent: true });
      continue;
    }
    const since = confirmedAt(o);
    const days = (nowMs - since.getTime()) / (24 * H);
    if (days >= LATE_DELIVERY_DAYS) late.push({ ...base, at: since, days: Math.floor(days), urgent: days >= LATE_DELIVERY_DAYS + URGENT.lateExtraDays });
  }
  stuck.sort((a, b) => b.hoursOver - a.hoursOver);
  late.sort((a, b) => b.days - a.days);

  // store names (the current name, not the one saved on the order) and test stores, which are
  // kept out like on the confirmation list
  const listed = [...decisionList, ...stuck, ...late];
  const storeIds = [...new Set(listed.map((x) => x.sellerId).filter(Boolean))].map(oid).filter(Boolean);
  const stores = storeIds.length ? await Seller.find({ _id: { $in: storeIds } }).select('storeName isTestAccount accountType').lean() : [];
  const storeById = new Map(stores.map((s) => [String(s._id), s]));
  const isTest = (x) => {
    const s = storeById.get(x.sellerId);
    return Boolean(s && (s.isTestAccount || s.accountType === 'test'));
  };
  for (const x of listed) {
    const s = storeById.get(x.sellerId);
    x.storeName = s?.storeName || x.storeName || 'Bazario Direct';
  }

  return { confirm, decision: decisionList.filter((x) => !isTest(x)), stuck: stuck.filter((x) => !isTest(x)), late: late.filter((x) => !isTest(x)) };
}

async function computeAll() {
  const now = new Date();
  const [deposits, withdrawals, limitReqs, applications, diamond, refunds, chats, orders, critical] = await Promise.all([
    Withdrawal.find({ type: 'deposit', status: { $in: ['pending', 'processing'] } })
      .select('seller storeName amount createdAt status depositRef')
      .sort({ createdAt: 1 })
      .limit(200)
      .lean(),
    Withdrawal.find({ type: 'withdrawal', status: { $in: ['pending', 'processing'] } })
      .select('seller storeName amount createdAt status method')
      .sort({ createdAt: 1 })
      .limit(200)
      .lean(),
    Seller.find({ 'withdrawalLimit.pendingIncreaseRequest.status': { $in: ['pending', 'accepted_by_seller'] } })
      .select('storeName withdrawalLimit.pendingIncreaseRequest')
      .lean(),
    Seller.find({ status: 'pending_approval', registrationRejectedAt: null }).select('storeName ownerName createdAt').sort({ createdAt: 1 }).lean(),
    Seller.find({ 'tierRequest.status': { $in: ['pending', 'awaiting_approval'] } })
      .select('storeName ownerName tierRequest')
      .lean(),
    Refund.find({ status: 'requested' }).select('order orderNumber amount createdAt seller customer.name').sort({ createdAt: 1 }).limit(200).lean().catch(() => []),
    Conversation.find({ type: { $ne: 'internal' }, status: { $ne: 'resolved' }, lastSender: { $in: WAITING_CHAT }, lastMessage: { $nin: SYSTEM_PREVIEWS } })
      .select('seller storeName name isGuest type lastMessage lastAt unreadForAdmin')
      .sort({ lastAt: 1 })
      .limit(300)
      .lean(),
    orderAttention(now),
    // account monitoring: stores below 40 (Critical) wait for an admin review
    Seller.find({ 'accountHealth.score': { $lt: 40 }, status: { $in: ['active', 'frozen'] }, ...realStore })
      .select('storeName status accountHealth.score accountHealth.lastEvaluatedAt')
      .sort({ 'accountHealth.score': 1 })
      .limit(100)
      .lean(),
  ]);

  // store names of the refund requests
  const refundStores = [...new Set(refunds.map((r) => sid(r.seller)).filter(Boolean))].map(oid).filter(Boolean);
  const refundNames = refundStores.length ? new Map((await Seller.find({ _id: { $in: refundStores } }).select('storeName').lean()).map((s) => [String(s._id), s.storeName])) : new Map();

  const nowMs = now.getTime();
  const olderThan = (d, ms) => Boolean(d) && nowMs - new Date(d).getTime() > ms;
  const money = (list, kind) =>
    list.map((w) => ({
      id: String(w._id),
      kind,
      sellerId: sid(w.seller),
      storeName: w.storeName || 'Store',
      amount: r2(w.amount),
      at: w.createdAt,
      status: w.status,
      ref: w.depositRef || '',
      urgent: olderThan(w.createdAt, kind === 'deposit' ? URGENT.depositMin * 60000 : URGENT.withdrawalH * H),
    }));

  return {
    at: now,
    deposits: money(deposits, 'deposit'),
    withdrawals: money(withdrawals, 'withdrawal'),
    limitRequests: limitReqs.map((s) => ({
      sellerId: String(s._id),
      storeName: s.storeName,
      status: s.withdrawalLimit?.pendingIncreaseRequest?.status,
      requested: s.withdrawalLimit?.pendingIncreaseRequest?.requestedLimit || null,
      at: s.withdrawalLimit?.pendingIncreaseRequest?.sellerAcceptedAt || s.withdrawalLimit?.pendingIncreaseRequest?.createdAt || null,
    })),
    applications: applications.map((s) => ({ sellerId: String(s._id), storeName: s.storeName, ownerName: s.ownerName, at: s.createdAt })),
    diamond: diamond.map((s) => ({ sellerId: String(s._id), storeName: s.storeName, status: s.tierRequest?.status, at: s.tierRequest?.requestedAt || null })),
    criticalHealth: critical.map((s) => ({
      sellerId: String(s._id),
      storeName: s.storeName,
      status: s.status,
      score: s.accountHealth?.score ?? 0,
      at: s.accountHealth?.lastEvaluatedAt || null,
      urgent: (s.accountHealth?.score ?? 0) < URGENT.healthScore,
    })),
    refunds: refunds.map((r) => ({
      id: String(r._id),
      orderId: sid(r.order),
      orderNumber: r.orderNumber || '',
      sellerId: sid(r.seller),
      storeName: refundNames.get(sid(r.seller)) || '',
      customer: r.customer?.name || '',
      amount: r2(r.amount),
      at: r.createdAt,
    })),
    chats: chats.map((c) => ({
      id: String(c._id),
      sellerId: sid(c.seller),
      name: c.storeName || c.name || (c.isGuest || c.type === 'guest' ? 'Guest visitor' : 'Store'),
      guest: Boolean(c.isGuest || c.type === 'guest'),
      lastMessage: String(c.lastMessage || '').slice(0, 120),
      at: c.lastAt,
      unread: c.unreadForAdmin || 0,
      urgent: olderThan(c.lastAt, URGENT.chatMin * 60000),
    })),
    orders,
  };
}

async function allData({ fresh = false } = {}) {
  if (!fresh && cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;
  if (cache.running) return cache.running;
  cache.running = computeAll()
    .then((data) => {
      cache = { at: Date.now(), data, running: null };
      return data;
    })
    .catch((e) => {
      cache.running = null;
      throw e;
    });
  return cache.running;
}

/** Only the parts this admin may see. */
function forAdmin(admin, d) {
  const out = {};
  if (can(admin, 'finance')) Object.assign(out, { deposits: d.deposits, withdrawals: d.withdrawals, limitRequests: d.limitRequests });
  if (can(admin, 'sellers')) Object.assign(out, { applications: d.applications, diamond: d.diamond, criticalHealth: d.criticalHealth });
  if (can(admin, 'refunds')) out.refunds = d.refunds;
  if (can(admin, 'chat')) out.chats = d.chats;
  if (can(admin, 'orders')) out.orders = d.orders;
  return out;
}

function countsOf(v) {
  const n = (a) => (Array.isArray(a) ? a.length : 0);
  const c = {
    deposits: n(v.deposits),
    withdrawals: n(v.withdrawals),
    limitRequests: n(v.limitRequests),
    applications: n(v.applications),
    diamond: n(v.diamond),
    criticalHealth: n(v.criticalHealth),
    refunds: n(v.refunds),
    chats: n(v.chats),
    ordersConfirm: n(v.orders?.confirm),
    ordersDecision: n(v.orders?.decision),
    ordersStuck: n(v.orders?.stuck),
    ordersLate: n(v.orders?.late),
  };
  // how many of each are urgent (same rules as the red rows on Today)
  const u = (a) => (Array.isArray(a) ? a.filter((x) => x.urgent).length : 0);
  c.urgent = {
    chats: u(v.chats),
    deposits: u(v.deposits),
    withdrawals: u(v.withdrawals),
    criticalHealth: u(v.criticalHealth),
    ordersConfirm: u(v.orders?.confirm),
    ordersDecision: u(v.orders?.decision),
    ordersStuck: u(v.orders?.stuck),
    ordersLate: u(v.orders?.late),
  };
  c.urgent.total = Object.values(c.urgent).reduce((t, x) => t + x, 0);
  c.payouts = c.deposits + c.withdrawals + c.limitRequests;
  c.orders = c.ordersConfirm + c.ordersDecision + c.ordersStuck + c.ordersLate;
  c.total = c.payouts + c.applications + c.diamond + c.criticalHealth + c.refunds + c.chats + c.orders;
  return c;
}

// GET /api/admin-hub/counts
router.get('/counts', authAdmin(), async (req, res) => {
  try {
    const d = await allData();
    res.json({ counts: countsOf(forAdmin(req.admin, d)), at: d.at });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admin-hub/today[?fresh=1]
router.get('/today', authAdmin(), async (req, res) => {
  try {
    const d = await allData({ fresh: req.query.fresh === '1' });
    const v = forAdmin(req.admin, d);
    const top = (a) => (Array.isArray(a) ? a.slice(0, LIST_MAX) : undefined);
    res.json({
      at: d.at,
      counts: countsOf(v),
      lists: {
        deposits: top(v.deposits),
        withdrawals: top(v.withdrawals),
        limitRequests: top(v.limitRequests),
        applications: top(v.applications),
        diamond: top(v.diamond),
        criticalHealth: top(v.criticalHealth),
        refunds: top(v.refunds),
        chats: top(v.chats),
        ordersConfirm: top(v.orders?.confirm),
        ordersDecision: top(v.orders?.decision),
        ordersStuck: top(v.orders?.stuck),
        ordersLate: top(v.orders?.late),
      },
      rules: { lateDeliveryDays: LATE_DELIVERY_DAYS, stuckAfterMinutes: STUCK_AFTER_MS / 60000, urgent: URGENT },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admin-hub/search?q=
router.get('/search', authAdmin(), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 60);
    if (q.length < 2) return res.json({ sellers: [], orders: [], chats: [], payments: [] });
    const rx = new RegExp(escapeRx(q), 'i');
    const digits = /^#?(?:ord[-\s#]*)?(\d{1,8})$/i.exec(q);
    const admin = req.admin;
    const jobs = {};

    if (can(admin, 'sellers')) {
      jobs.sellers = Seller.find({ $or: [{ storeName: rx }, { ownerName: rx }, { email: rx }, { phone: rx }] })
        .select('storeName ownerName email phone status tier isTestAccount accountType wallet.balance')
        .sort({ updatedAt: -1 })
        .limit(8)
        .lean()
        .then((list) =>
          list.map((s) => ({
            id: String(s._id),
            storeName: s.storeName,
            ownerName: s.ownerName,
            email: s.email,
            status: s.status,
            tier: s.tier === 'diamond' ? 'Diamond' : 'Basic',
            test: Boolean(s.isTestAccount || s.accountType === 'test'),
            balance: r2(s.wallet?.balance),
          }))
        );
    }
    if (can(admin, 'orders')) {
      const filter = digits
        ? { orderNumber: new RegExp(`(^|\\D)0*${digits[1]}$`, 'i') }
        : { $or: [{ orderNumber: rx }, { 'shippingAddress.fullName': rx }, { 'contact.phone': rx }, { 'contact.email': rx }, { 'items.sellerName': rx }] };
      jobs.orders = Order.find(filter)
        .select('orderNumber status total createdAt items.sellerName shippingAddress.fullName')
        .sort({ createdAt: -1 })
        .limit(8)
        .lean()
        .then((list) =>
          list.map((o) => ({
            id: String(o._id),
            orderNumber: o.orderNumber,
            status: o.status,
            total: r2(o.total),
            storeName: (o.items || []).find((i) => i.sellerName)?.sellerName || '',
            customer: o.shippingAddress?.fullName || '',
            at: o.createdAt,
          }))
        );
    }
    if (can(admin, 'chat')) {
      jobs.chats = Conversation.find({ type: { $ne: 'internal' }, $or: [{ storeName: rx }, { name: rx }, { email: rx }, { sellerEmail: rx }, { sellerName: rx }] })
        .select('storeName name isGuest type lastMessage lastAt status')
        .sort({ lastAt: -1 })
        .limit(6)
        .lean()
        .then((list) =>
          list.map((c) => ({
            id: String(c._id),
            name: c.storeName || c.name || 'Guest visitor',
            guest: Boolean(c.isGuest || c.type === 'guest'),
            lastMessage: String(c.lastMessage || '').slice(0, 90),
            at: c.lastAt,
            status: c.status,
          }))
        );
    }
    if (can(admin, 'finance') && q.length >= 4) {
      jobs.payments = Withdrawal.find({ type: { $in: ['deposit', 'withdrawal'] }, $or: [{ depositRef: rx }, { transactionRef: rx }] })
        .select('type storeName amount status depositRef transactionRef createdAt seller')
        .sort({ createdAt: -1 })
        .limit(6)
        .lean()
        .then((list) =>
          list.map((w) => ({
            id: String(w._id),
            kind: w.type,
            sellerId: sid(w.seller),
            storeName: w.storeName || '',
            amount: r2(w.amount),
            status: w.status,
            ref: w.depositRef || w.transactionRef || '',
            at: w.createdAt,
          }))
        );
    }

    const keys = Object.keys(jobs);
    const values = await Promise.all(keys.map((k) => jobs[k].catch(() => [])));
    const out = { sellers: [], orders: [], chats: [], payments: [] };
    keys.forEach((k, i) => (out[k] = values[i]));
    res.json(out);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admin-hub/seller/:id — the small store panel
router.get('/seller/:id', authAdmin('sellers'), async (req, res) => {
  try {
    const id = oid(req.params.id);
    if (!id) return res.status(404).json({ message: 'Store not found' });
    const [facts, conv, payments, me] = await Promise.all([
      sellerFacts(id, { withOrders: true }),
      Conversation.findOne({ seller: id, type: { $ne: 'internal' } }).select('_id status lastAt lastSender').sort({ lastAt: -1 }).lean(),
      can(req.admin, 'finance')
        ? Withdrawal.find({ seller: id, type: { $in: ['deposit', 'withdrawal'] }, status: { $in: ['pending', 'processing'] } })
            .select('type amount createdAt')
            .lean()
        : [],
      mongoose.connection.collection('admins').findOne({ _id: oid(req.admin.id) }, { projection: { pinnedSellers: 1 } }),
    ]);
    if (!facts) return res.status(404).json({ message: 'Store not found' });
    if (!can(req.admin, 'finance')) {
      // money of the store stays with finance; the rest is seller work
      delete facts.lastDeposit;
    }
    res.json({
      ...facts,
      conversationId: conv && can(req.admin, 'chat') ? String(conv._id) : '',
      chatWaiting: Boolean(conv && conv.status !== 'resolved' && WAITING_CHAT.includes(conv.lastSender)),
      pendingPayments: payments.map((p) => ({ kind: p.type, amount: r2(p.amount), at: p.createdAt })),
      pinned: (me?.pinnedSellers || []).map(String).includes(String(id)),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admin-hub/pins — this admin's pinned stores
router.get('/pins', authAdmin('sellers'), async (req, res) => {
  try {
    const me = await mongoose.connection.collection('admins').findOne({ _id: oid(req.admin.id) }, { projection: { pinnedSellers: 1 } });
    const ids = (me?.pinnedSellers || []).filter(Boolean);
    if (!ids.length) return res.json([]);
    const list = await Seller.find({ _id: { $in: ids } }).select('storeName ownerName status tier').lean();
    const byId = new Map(list.map((s) => [String(s._id), s]));
    res.json(
      ids
        .map((x) => byId.get(String(x)))
        .filter(Boolean)
        .map((s) => ({ id: String(s._id), storeName: s.storeName, ownerName: s.ownerName, status: s.status, tier: s.tier === 'diamond' ? 'Diamond' : 'Basic' }))
    );
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/admin-hub/pins/:id  { pinned }
router.post('/pins/:id', authAdmin('sellers'), async (req, res) => {
  try {
    const id = oid(req.params.id);
    if (!id || !(await Seller.exists({ _id: id }))) return res.status(404).json({ message: 'Store not found' });
    const admins = mongoose.connection.collection('admins');
    const me = oid(req.admin.id);
    if (req.body?.pinned === false) {
      await admins.updateOne({ _id: me }, { $pull: { pinnedSellers: id } });
    } else {
      const doc = await admins.findOne({ _id: me }, { projection: { pinnedSellers: 1 } });
      if ((doc?.pinnedSellers || []).length >= 30 && !(doc.pinnedSellers || []).map(String).includes(String(id))) {
        return res.status(400).json({ message: 'You can pin up to 30 stores. Unpin one first.' });
      }
      await admins.updateOne({ _id: me }, { $addToSet: { pinnedSellers: id } });
    }
    res.json({ ok: true, pinned: req.body?.pinned !== false });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
