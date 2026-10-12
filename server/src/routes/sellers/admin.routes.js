import mongoose from 'mongoose';
import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import Seller from '../../models/Seller.js';
import Product from '../../models/Product.js';
import Order from '../../models/Order.js';
import Withdrawal from '../../models/Withdrawal.js';
import ReferralCode from '../../models/ReferralCode.js';
import { Conversation, Message } from '../../models/Chat.js';
import { getSetting, setSetting } from '../../models/System.js';
import { authAdmin } from '../../middleware/auth.js';
import { notify } from '../../utils/notify.js';
import { audit } from '../../utils/audit.js';
import { finLog, requestApproval, sellerMoneyHistory } from '../../utils/financeLog.js';
import { rememberPassword, readPassword, encryptionOn } from '../../utils/sellerPassword.js';
import { forgetAuthCache } from '../../middleware/auth.js';
import { slugify, calculateHealthStatus } from './helpers.js';
import { adminRoom } from '../../utils/permissions.js';
import { asText } from '../../middleware/sanitize.js';
import { normalizeCode, codeFormatError, getMasterCode, resolveAffiliateCode, usageByCode } from '../../utils/affiliateCodes.js';

const router = express.Router();

// perf: the KYC file fields hold large base64 images (up to ~2-5 MB each). They are never sent in
// list responses; the admin UI loads them on demand via GET /api/sellers/:id/kyc (or GET /api/sellers/:id).
const KYC_FILE_FIELDS = [
  'idDocumentUrl',
  'idCard',
  'passportDocumentUrl',
  'passport',
  'bankStatementUrl',
  'bankStatement',
  'aadhaarFront',
  'aadhaarBack',
  'panFront',
  'panBack',
];
const SELLER_LIST_SELECT = ['-passwordHash', ...KYC_FILE_FIELDS.map((f) => `-kycDocuments.${f}`)].join(' ');

// A seller as it is sent back after an action or pushed live: WITHOUT the KYC photos and the
// password. The photos live inside the seller record (several MB for some sellers); sending them
// with every answer made "Approve" take longer than the website's 30 s limit ("Request timed
// out"), although the approval itself was already saved. The KYC screen asks for them separately.
// (`kycDocuments` is left out completely, so a screen that merges this into what it already has
// keeps the photos it is showing.)
function lightSeller(doc) {
  const o = doc && typeof doc.toObject === 'function' ? doc.toObject() : { ...(doc || {}) };
  delete o.passwordHash;
  delete o.kycDocuments;
  return o;
}

// ─── Team portal link: who a seller belongs to ───
// The team portal keeps its people in `portalmembers` and seller ownership in
// `portalsellerassignments` (same database). The finance ledger divides every deposit and
// withdrawal by that ownership, so a client seller must always have an owner.
const portalMembersCol = () => mongoose.connection.db.collection('portalmembers');
const portalAssignmentsCol = () => mongoose.connection.db.collection('portalsellerassignments');
const toObjectId = (v) => (v && mongoose.Types.ObjectId.isValid(String(v)) ? new mongoose.Types.ObjectId(String(v)) : null);

// ─── Two-person rule for the seller type ───
// "Test" takes every deposit and withdrawal of a seller out of the finance count, and
// "previous store" changes who pays its withdrawals. On a seller that is already approved, such a
// change is not applied here: it is sent to the other partner and applied by the team portal
// once approved. (A seller still waiting for registration approval has no money history, so its
// type can be set freely.)
async function isApprovedSeller(seller) {
  // A REJECTED registration was never an approved store: approving it again is a first approval
  // (welcome message, type and owner set at once). It used to count as "already approved", so the
  // seller was never told and the two-person rules for live stores applied.
  const rejectedRegistration = seller.status === 'suspended' && Boolean(seller.registrationRejectedAt);
  if (seller.status !== 'pending_approval' && !rejectedRegistration) return true;
  // put back to "pending" (or rejected) but it already has money history: still two people
  const history = await sellerMoneyHistory(seller._id);
  return !history || history.deposits > 0 || history.withdrawals > 0;
}

// A commission rate is a percentage from 0 to 100 (empty = not changed)
const badCommission = (v) => v !== undefined && v !== null && v !== '' && !(Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100);
const COMMISSION_MSG = 'Commission rate must be a number from 0 to 100.';

// One approve / reject per store at a time: two admins pressing at the same moment could both
// record an owner (two "active" assignments) and both write the deposit.
const decisionsInFlight = new Set();
function oneDecisionAtATime(req, res, next) {
  const key = String(req.params.id || '');
  if (decisionsInFlight.has(key)) return res.status(429).json({ message: 'Another admin is saving a decision for this store right now. Please wait a moment and refresh.' });
  decisionsInFlight.add(key);
  let done = false;
  const release = () => {
    if (!done) {
      done = true;
      decisionsInFlight.delete(key);
    }
  };
  res.on('finish', release);
  res.on('close', release);
  next();
}

async function askSellerFlagChange(req, seller, field, value) {
  const what =
    field === 'isTestAccount'
      ? value
        ? 'a TEST account (all its deposits and withdrawals leave the finance count)'
        : 'a CLIENT account (its deposits and withdrawals are counted)'
      : value
      ? 'a PREVIOUS-STORE seller'
      : 'a CURRENT-STORE seller';
  return requestApproval(req, {
    action: 'seller_flag',
    targetId: `${seller._id}:${field}`,
    summary: `Make seller “${seller.storeName}” ${what}`,
    details: [],
    payload: { sellerId: String(seller._id), field, value: Boolean(value) },
    sellerId: seller._id,
    storeName: seller.storeName,
  });
}

// GET /api/sellers/team/members?sellerId=... — people a seller can be assigned to (+ current owner)
router.get('/team/members', authAdmin('sellers'), async (req, res) => {
  try {
    const docs = await portalMembersCol()
      .find({ active: { $ne: false } })
      .project({ name: 1, username: 1, role: 1, commissionLabel: 1 })
      .toArray();

    const members = docs
      .map((m) => ({
        _id: String(m._id),
        name: m.name || m.username || 'Member',
        role: m.role === 'admin' ? 'partner' : 'member',
        deal: m.role === 'admin' ? 'partner' : m.commissionLabel || 'pkr_1to1',
      }))
      .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'partner' ? -1 : 1));

    let assignedMemberId = '';
    const sellerOid = toObjectId(req.query.sellerId);
    if (sellerOid) {
      const current = await portalAssignmentsCol().findOne({ sellerId: sellerOid, status: 'active' });
      if (current && members.some((m) => m._id === String(current.memberId))) assignedMemberId = String(current.memberId);
    }

    res.json({ members, assignedMemberId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sellers/analytics/overview?scope=client|all&days=30
// Numbers for the charts on top of the admin Sellers page: wallet totals, pending orders (real
// money still in flight), wallet movements per day, sales trend and the top stores.
// scope=client (default) leaves out test accounts and previous-store sellers, so the totals are real money.
const OPEN_ORDER_EXCLUDE = ['delivered', 'cancelled', 'refunded'];
const WALLET_MOVE_TYPES = ['deposit', 'withdrawal', 'order_processing_lock', 'order_delivered_release', 'order_cancelled_release', 'adjustment'];

router.get('/analytics/overview', authAdmin('sellers'), async (req, res) => {
  try {
    const scope = req.query.scope === 'all' ? 'all' : 'client';
    const days = Math.min(90, Math.max(7, parseInt(req.query.days, 10) || 30));
    const now = new Date();
    const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));

    const sellerFilter = { status: { $ne: 'pending_approval' } };
    if (scope === 'client') {
      sellerFilter.isTestAccount = { $ne: true };
      sellerFilter.isPreviousStoreSeller = { $ne: true };
    }

    const sellers = await Seller.find(sellerFilter).select('storeName status wallet accountHealth warning createdAt').lean();
    const sellerIds = sellers.map((s) => s._id);
    const inScope = new Map(sellers.map((s) => [String(s._id), s]));

    const [orders, moves] = await Promise.all([
      Order.find({
        $or: [{ createdAt: { $gte: since } }, { status: { $nin: OPEN_ORDER_EXCLUDE } }],
        $and: [{ $or: [{ seller: { $in: sellerIds } }, { 'items.seller': { $in: sellerIds } }] }],
      })
        .select('status seller createdAt items.seller items.price items.qty items.lockedAmount items.processingLocked items.profitAmount')
        .lean(),
      Withdrawal.find({
        seller: { $in: sellerIds },
        type: { $in: WALLET_MOVE_TYPES },
        $or: [{ createdAt: { $gte: since } }, { processedAt: { $gte: since } }, { status: { $in: ['pending', 'processing'] } }],
      })
        .select('type status amount approvedAmount createdAt processedAt seller')
        .lean(),
    ]);

    // ── Day buckets for the trend charts
    const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
    const dayList = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since.getTime() + i * 86400000);
      dayList.push({ key: dayKey(d), label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) });
    }
    const salesByDay = new Map(dayList.map((d) => [d.key, { label: d.label, sales: 0, orders: 0 }]));
    const movesByDay = new Map(
      dayList.map((d) => [d.key, { label: d.label, deposits: 0, withdrawals: 0, locked: 0, released: 0, refunded: 0, adjustments: 0 }])
    );

    // ── Orders: pending value per status, age buckets, per-store numbers
    const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const pendingByStatus = new Map();
    const aging = [
      { label: '< 24h', maxH: 24, count: 0, amount: 0 },
      { label: '1–3 days', maxH: 72, count: 0, amount: 0 },
      { label: '3–7 days', maxH: 168, count: 0, amount: 0 },
      { label: '7+ days', maxH: Infinity, count: 0, amount: 0 },
    ];
    const perStore = new Map();
    const storeStat = (id) => {
      let st = perStore.get(id);
      if (!st) {
        st = { sales: 0, orders: 0, pendingAmount: 0, pendingOrders: 0 };
        perStore.set(id, st);
      }
      return st;
    };
    const pending = { orders: 0, amount: 0, locked: 0, expectedProfit: 0 };

    orders.forEach((ord) => {
      const ordSeller = ord.seller ? String(ord.seller) : '';
      const st = (ord.status || '').toLowerCase();
      const isOpen = !OPEN_ORDER_EXCLUDE.includes(st);
      const inWindow = new Date(ord.createdAt) >= since;
      const ageH = (now - new Date(ord.createdAt)) / 3600000;

      // value of this order that belongs to each in-scope store
      const shares = new Map();
      (ord.items || []).forEach((it) => {
        const sid = it.seller ? String(it.seller) : ordSeller;
        if (!inScope.has(sid)) return;
        const sh = shares.get(sid) || { value: 0, locked: 0, profit: 0 };
        sh.value += (it.price || 0) * (it.qty || 1);
        if (it.processingLocked) {
          sh.locked += it.lockedAmount || 0;
          sh.profit += it.profitAmount || 0;
        }
        shares.set(sid, sh);
      });
      if (!shares.size) return;

      let orderValue = 0;
      shares.forEach((sh, sid) => {
        orderValue += sh.value;
        const ss = storeStat(sid);
        if (inWindow && st !== 'cancelled' && st !== 'refunded') {
          ss.sales += sh.value;
          ss.orders += 1;
        }
        if (isOpen) {
          ss.pendingAmount += sh.value;
          ss.pendingOrders += 1;
          pending.locked += sh.locked;
          pending.expectedProfit += sh.profit;
        }
      });

      if (inWindow && st !== 'cancelled' && st !== 'refunded') {
        const day = salesByDay.get(dayKey(ord.createdAt));
        if (day) {
          day.sales += orderValue;
          day.orders += 1;
        }
      }

      if (isOpen) {
        pending.orders += 1;
        pending.amount += orderValue;
        const ps = pendingByStatus.get(st) || { status: st, count: 0, amount: 0 };
        ps.count += 1;
        ps.amount += orderValue;
        pendingByStatus.set(st, ps);
        const bucket = aging.find((b) => ageH < b.maxH);
        bucket.count += 1;
        bucket.amount += orderValue;
      }
    });

    // ── Wallet movements: settled lines per day, open requests separately
    const requests = { deposits: { count: 0, amount: 0 }, withdrawals: { count: 0, amount: 0 } };
    const totalsInWindow = { deposits: 0, withdrawals: 0, locked: 0, released: 0, refunded: 0, adjustments: 0 };
    const moveField = {
      deposit: 'deposits',
      withdrawal: 'withdrawals',
      order_processing_lock: 'locked',
      order_delivered_release: 'released',
      order_cancelled_release: 'refunded',
      adjustment: 'adjustments',
    };
    moves.forEach((m) => {
      const amt = m.approvedAmount !== null && m.approvedAmount !== undefined ? Number(m.approvedAmount) || 0 : Number(m.amount) || 0;
      if (m.status === 'pending' || m.status === 'processing') {
        if (m.type === 'deposit') {
          requests.deposits.count += 1;
          requests.deposits.amount += amt;
        } else if (m.type === 'withdrawal') {
          requests.withdrawals.count += 1;
          requests.withdrawals.amount += amt;
        }
        return;
      }
      if (!['approved', 'completed'].includes(m.status)) return;
      const when = m.processedAt || m.createdAt;
      if (new Date(when) < since) return;
      const field = moveField[m.type];
      const day = movesByDay.get(dayKey(when));
      if (day) day[field] += amt;
      totalsInWindow[field] += amt;
    });

    // ── Wallet totals and seller mix
    const wallet = { balance: 0, processingFund: 0, totalEarned: 0, totalProfitEarned: 0, totalDeposited: 0, totalWithdrawn: 0, securityDeposit: 0 };
    const health = { healthy: 0, watch: 0, atRisk: 0, critical: 0 };
    const status = { active: 0, frozen: 0, suspended: 0, warned: 0 };
    sellers.forEach((s) => {
      Object.keys(wallet).forEach((k) => {
        wallet[k] += Number(s.wallet?.[k]) || 0;
      });
      const score = s.accountHealth?.score ?? 100;
      if (score >= 80) health.healthy += 1;
      else if (score >= 31) health.watch += 1;
      else if (score > 20) health.atRisk += 1;
      else health.critical += 1;
      if (status[s.status] !== undefined) status[s.status] += 1;
      if (s.warning?.active) status.warned += 1;
    });

    const storeRows = sellers.map((s) => {
      const st = perStore.get(String(s._id)) || { sales: 0, orders: 0, pendingAmount: 0, pendingOrders: 0 };
      return {
        _id: s._id,
        storeName: s.storeName || 'Store',
        sales: round(st.sales),
        orders: st.orders,
        pendingAmount: round(st.pendingAmount),
        pendingOrders: st.pendingOrders,
        balance: round(s.wallet?.balance),
        processingFund: round(s.wallet?.processingFund),
      };
    });
    const top = (key) =>
      [...storeRows]
        .filter((r) => r[key] > 0)
        .sort((a, b) => b[key] - a[key])
        .slice(0, 8);

    const roundObj = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round(v)]));

    res.json({
      scope,
      days,
      sellerCount: sellers.length,
      newSellers: sellers.filter((s) => new Date(s.createdAt) >= since).length,
      wallet: roundObj(wallet),
      pending: roundObj(pending),
      pendingByStatus: [...pendingByStatus.values()].map((p) => ({ ...p, amount: round(p.amount) })).sort((a, b) => b.amount - a.amount),
      aging: aging.map(({ label, count, amount }) => ({ label, count, amount: round(amount) })),
      requests: {
        deposits: { ...requests.deposits, amount: round(requests.deposits.amount) },
        withdrawals: { ...requests.withdrawals, amount: round(requests.withdrawals.amount) },
      },
      moveTotals: roundObj(totalsInWindow),
      movesTrend: [...movesByDay.values()].map((d) => ({ ...roundObj({ ...d, label: 0 }), label: d.label })),
      salesTrend: [...salesByDay.values()].map((d) => ({ label: d.label, sales: round(d.sales), orders: d.orders })),
      health,
      status,
      topBySales: top('sales'),
      topByPending: top('pendingAmount'),
      topByBalance: top('balance'),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sellers (Admin list all sellers)
router.get('/', authAdmin('sellers'), async (req, res) => {
  try {
    // A handful of queries in parallel instead of 1 + 2 per seller
    const hasDoc = (a, b) =>
      Seller.find({
        $or: [{ [`kycDocuments.${a}`]: { $nin: ['', null] } }, { [`kycDocuments.${b}`]: { $nin: ['', null] } }],
      })
        .select('_id')
        .lean();

    const hasSingleDoc = (field) =>
      Seller.find({ [`kycDocuments.${field}`]: { $nin: ['', null] } })
        .select('_id')
        .lean();

    const [sellers, withAadhaarFront, withAadhaarBack, withPanFront, withPanBack, withId, withPassport, withBank, productCounts, allOrders] = await Promise.all([
      Seller.find().select(SELLER_LIST_SELECT).sort({ createdAt: -1 }),
      hasSingleDoc('aadhaarFront'),
      hasSingleDoc('aadhaarBack'),
      hasSingleDoc('panFront'),
      hasSingleDoc('panBack'),
      hasDoc('idCard', 'idDocumentUrl'),
      hasDoc('passport', 'passportDocumentUrl'),
      hasDoc('bankStatement', 'bankStatementUrl'),
      Product.aggregate([{ $group: { _id: '$seller', n: { $sum: 1 } } }]),
      orderStatsBySeller(),
    ]);

    const idSet = (rows) => new Set(rows.map((r) => String(r._id)));
    const kycAadhaarFrontSet = idSet(withAadhaarFront);
    const kycAadhaarBackSet = idSet(withAadhaarBack);
    const kycPanFrontSet = idSet(withPanFront);
    const kycPanBackSet = idSet(withPanBack);
    const kycIdSet = idSet(withId);
    const kycPassportSet = idSet(withPassport);
    const kycBankSet = idSet(withBank);
    const productCountMap = new Map(productCounts.map((p) => [String(p._id), p.n]));

    const statsMap = new Map(allOrders.map((r) => [String(r._id), r]));

    const enriched = sellers.map((s) => {
      const id = s._id.toString();
      const agg = statsMap.get(id) || { orderCount: 0, pendingOrders: 0, sales: 0 };
      return {
        ...s.toObject(),
        // never sent with a list; an admin looks one up with GET /api/sellers/:id/password
        plainPassword: '',
        // Tells the UI which documents exist without shipping the files themselves
        kycAvailable: {
          aadhaarFront: kycAadhaarFrontSet.has(id) || kycIdSet.has(id),
          aadhaarBack: kycAadhaarBackSet.has(id),
          panFront: kycPanFrontSet.has(id) || kycPassportSet.has(id),
          panBack: kycPanBackSet.has(id),
          idCard: kycIdSet.has(id) || kycAadhaarFrontSet.has(id),
          passport: kycPassportSet.has(id) || kycPanFrontSet.has(id),
          bankStatement: kycBankSet.has(id),
        },
        productCount: productCountMap.get(id) || 0,
        orderCount: agg.orderCount,
        pendingOrders: agg.pendingOrders,
        lifetimeSales: agg.sales,
      };
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * Per seller: how many orders involve the store, how many are still open, and its lifetime sales
 * (its own lines of every order that was not cancelled; a line without a seller belongs to the
 * order's seller). Counted by the database: the list used to load EVERY order into the server on
 * each visit to the Sellers / Complaints page, which grew slower with every order.
 */
function orderStatsBySeller() {
  return Order.aggregate([
    {
      $project: {
        status: { $toLower: { $ifNull: ['$status', ''] } },
        involved: {
          $setUnion: [
            { $cond: [{ $ifNull: ['$seller', false] }, ['$seller'], []] },
            { $filter: { input: { $ifNull: ['$items.seller', []] }, cond: { $ne: ['$$this', null] } } },
          ],
        },
        lines: {
          $map: {
            input: { $ifNull: ['$items', []] },
            as: 'it',
            in: {
              s: { $ifNull: ['$$it.seller', '$seller'] },
              v: { $multiply: [{ $ifNull: ['$$it.price', 0] }, { $cond: [{ $gt: [{ $ifNull: ['$$it.qty', 0] }, 0] }, '$$it.qty', 1] }] },
            },
          },
        },
      },
    },
    { $unwind: '$involved' },
    {
      $project: {
        pending: { $cond: [{ $in: ['$status', ['delivered', 'cancelled', 'refunded']] }, 0, 1] },
        sales: {
          $cond: [
            { $eq: ['$status', 'cancelled'] },
            0,
            { $sum: { $map: { input: { $filter: { input: '$lines', cond: { $eq: ['$$this.s', '$involved'] } } }, in: '$$this.v' } } },
          ],
        },
        involved: 1,
      },
    },
    { $group: { _id: '$involved', orderCount: { $sum: 1 }, pendingOrders: { $sum: '$pending' }, sales: { $sum: '$sales' } } },
  ]);
}

// GET /api/sellers/:id/kyc (Admin loads one seller's KYC documents on demand)
router.get('/:id/kyc', authAdmin('sellers'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return next();
    }
    // ?doc=aadhaarFront (or aadhaarBack / panFront / panBack / idCard / passport / bankStatement):
    // only that ONE picture is read and sent. Sending every picture (and their old duplicate
    // copies) at once was several MB per click, and on a slow connection the preview timed out.
    const PICK = {
      aadhaarFront: ['aadhaarFront', 'idCard', 'idDocumentUrl'],
      aadhaarBack: ['aadhaarBack'],
      panFront: ['panFront', 'passport', 'passportDocumentUrl'],
      panBack: ['panBack'],
      idCard: ['idCard', 'idDocumentUrl', 'aadhaarFront'],
      passport: ['passport', 'passportDocumentUrl', 'panFront'],
      bankStatement: ['bankStatement', 'bankStatementUrl'],
    };
    const one = typeof req.query.doc === 'string' && PICK[req.query.doc] ? req.query.doc : '';
    if (one) {
      const fields = PICK[one];
      const doc = await Seller.findById(req.params.id)
        .select(fields.map((f) => `kycDocuments.${f}`).join(' '))
        .lean();
      if (!doc) return res.status(404).json({ message: 'Seller not found' });
      const k = doc.kycDocuments || {};
      const value = fields.map((f) => k[f]).find((v) => typeof v === 'string' && v) || '';
      return res.json({ _id: doc._id, doc: one, kycDocuments: { [one]: value } });
    }

    const seller = await Seller.findById(req.params.id).select('kycDocuments storeName ownerName').lean();
    if (!seller) return res.status(404).json({ message: 'Seller not found' });
    const kyc = seller.kycDocuments || {};
    // every picture once (the legacy duplicate fields are left out when they hold the same picture)
    const normalizedKyc = {
      idDocumentType: kyc.idDocumentType || '',
      uploadedAt: kyc.uploadedAt || null,
      aadhaarFront: kyc.aadhaarFront || kyc.idCard || kyc.idDocumentUrl || '',
      aadhaarBack: kyc.aadhaarBack || '',
      panFront: kyc.panFront || kyc.passport || kyc.passportDocumentUrl || '',
      panBack: kyc.panBack || '',
      bankStatement: kyc.bankStatement || kyc.bankStatementUrl || '',
    };
    const legacyId = kyc.idCard || kyc.idDocumentUrl || '';
    const legacyPassport = kyc.passport || kyc.passportDocumentUrl || '';
    if (legacyId && legacyId !== normalizedKyc.aadhaarFront) normalizedKyc.idCard = legacyId;
    if (legacyPassport && legacyPassport !== normalizedKyc.panFront) normalizedKyc.passport = legacyPassport;
    res.json({ _id: seller._id, kycDocuments: normalizedKyc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers (Admin creates a new seller credentials)
router.post('/', authAdmin('sellers'), async (req, res) => {
  try {
    const { storeName, ownerName, email, password, phone, commissionRate, city, isTestAccount, accountType, isPreviousStoreSeller } = req.body;
    if (!storeName || !ownerName || !email || !password) {
      return res.status(400).json({ message: 'Store name, owner name, email, and password are required' });
    }
    if (badCommission(commissionRate)) return res.status(400).json({ message: COMMISSION_MSG });

    const existing = await Seller.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(400).json({ message: 'A seller with this email already exists' });

    let baseSlug = slugify(storeName);
    let storeSlug = baseSlug;
    let counter = 1;
    while (await Seller.findOne({ storeSlug })) {
      storeSlug = `${baseSlug}-${counter++}`;
    }

    const isTest = Boolean(isTestAccount || accountType === 'test');
    const isPrev = Boolean(isPreviousStoreSeller);
    const passwordHash = await bcrypt.hash(password, 10);
    const seller = new Seller({
      storeName,
      ownerName,
      email: email.toLowerCase().trim(),
      passwordHash,
      phone: phone || '',
      storeSlug,
      commissionRate: commissionRate !== undefined && commissionRate !== null && commissionRate !== '' ? Number(commissionRate) : 10,
      address: { city: city || 'New York' },
      isTestAccount: isTest,
      accountType: isTest ? 'test' : 'client',
      isPreviousStoreSeller: isPrev,
      status: 'active',
      verified: true,
    });

    rememberPassword(seller, password);
    await seller.save();

    audit(req, 'create', 'seller', seller._id, `Created seller: ${storeName} (${email})`);
    await finLog(req, {
      action: 'seller.created',
      summary: `Created seller “${storeName}” as a ${isTest ? 'TEST' : 'client'} account${isPrev ? ' (previous store)' : ''}`,
      entity: 'seller',
      entityId: seller._id,
      sellerId: seller._id,
      storeName,
      after: { isTestAccount: isTest, isPreviousStoreSeller: isPrev, email: seller.email },
    });

    const safeSeller = seller.toObject();
    delete safeSeller.passwordHash;
    res.status(201).json(safeSeller);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sellers/:id/password — the saved copy of ONE seller's password, for telling a seller
// who forgot it. Passwords are no longer sent with seller lists or profiles; they are looked up
// here one at a time, by a full admin, and every look is written to the audit log and the
// finance activity log (both partners can see who looked at whose password, and when).
router.get('/:id/password', authAdmin('sellers'), async (req, res) => {
  try {
    if (!['super_admin', 'admin'].includes(req.admin.role)) {
      return res.status(403).json({ message: 'Only an Administrator or the Super Admin can view a seller password.' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Seller not found' });
    const raw = await Seller.collection.findOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { projection: { storeName: 1, email: 1, plainPassword: 1, passwordEnc: 1 } }
    );
    if (!raw) return res.status(404).json({ message: 'Seller not found' });

    const found = readPassword(raw);
    audit(req, 'view_password', 'seller', raw._id, `Viewed the saved password of ${raw.storeName} (${raw.email})`);
    await finLog(req, { action: 'seller.password_viewed', summary: `Looked at the saved password of seller “${raw.storeName}”`, entity: 'seller', entityId: raw._id, sellerId: raw._id, storeName: raw.storeName });

    const why = {
      none: 'No copy is saved for this seller yet. It is saved the next time the seller logs in, or you can set a new password.',
      no_key: 'The saved copy is encrypted and SELLER_PASSWORD_KEY is not set on the server, so it cannot be shown. You can set a new password.',
      other_key: 'The saved copy was encrypted with a different SELLER_PASSWORD_KEY, so it cannot be shown. You can set a new password.',
      damaged: 'The saved copy could not be read. You can set a new password.',
      format: 'The saved copy could not be read. You can set a new password.',
    };
    res.json({ password: found.password, available: Boolean(found.password), encrypted: encryptionOn(), message: found.password ? '' : why[found.note] || why.none });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/:id/reset-password (Admin resets seller password)
router.post('/:id/reset-password', authAdmin('sellers'), async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters long' });
    }
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    seller.passwordHash = await bcrypt.hash(newPassword, 10);
    rememberPassword(seller, newPassword);
    seller.pwdAt = new Date(); // the seller's older logins stop working
    await seller.save();
    forgetAuthCache('seller', seller._id);

    audit(req, 'reset_password', 'seller', seller._id, `Admin reset password for vendor: ${seller.storeName} (${seller.email})`);
    await finLog(req, { action: 'seller.password_reset', summary: `Set a new password for seller “${seller.storeName}”`, entity: 'seller', entityId: seller._id, sellerId: seller._id, storeName: seller.storeName });
    res.json({ ok: true, message: `Password reset successfully for ${seller.storeName}!` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/:id/freeze (Admin freezes/suspends or unfreezes seller account with reason)
router.post('/:id/freeze', authAdmin('sellers'), async (req, res) => {
  try {
    const { status = 'frozen' } = req.body || {};
    const reason = String(req.body?.reason || '').trim().slice(0, 1000);
    if (!['active', 'frozen', 'suspended'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Use: active, frozen, or suspended' });
    }

    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });
    // a registration still waiting (or rejected) is decided under New Applications, not here:
    // "active" from this screen used to approve it without the approval steps
    if (seller.status === 'pending_approval' || seller.registrationRejectedAt) {
      return res.status(400).json({ message: 'This store registration is not approved. Use New Applications to approve or reject it.' });
    }

    seller.status = status;
    if (status === 'active') {
      // only the restriction is lifted: "verified" (documents checked) is not touched here.
      // It used to be set on every unfreeze, giving unchecked stores the verified badge.
      seller.freezeReason = '';
      seller.frozenAt = null;
      seller.frozenBy = '';
    } else {
      seller.freezeReason = reason || 'Account restricted by platform administrator due to policy compliance review.';
      seller.frozenAt = new Date();
      seller.frozenBy = req.admin.name || 'Super Admin';
    }

    await seller.save();
    forgetAuthCache('seller', seller._id); // a suspension applies to the next request at once

    const isRestricted = status !== 'active';
    const statusLabel = status === 'frozen' ? 'FROZEN' : status === 'suspended' ? 'SUSPENDED' : 'UNFROZEN / ACTIVE';

    // Auto-send official Chat notice to seller
    try {
      let conv = await Conversation.findOne({ seller: seller._id });
      if (!conv) {
        conv = await Conversation.create({
          seller: seller._id,
          storeName: seller.storeName,
          sellerName: seller.ownerName,
          sellerEmail: seller.email,
          subject: 'Account Compliance & Status Notice',
          status: 'open',
          lastAt: new Date(),
        });
      }

      const msgText = isRestricted
        ? `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `⛔ ACCOUNT RESTRICTION NOTICE\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Status: ACCOUNT ${statusLabel}\n` +
          `Reason: ${seller.freezeReason}\n` +
          `Action Taken By: ${req.admin.name || 'Platform Admin'}\n` +
          `Date: ${new Date().toLocaleString('en-IN')}\n\n` +
          `Please contact platform support to resolve this suspension.\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━`
        : `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `✅ ACCOUNT RESTRICTION LIFTED\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Status: ACCOUNT ACTIVE & FULL ACCESS RESTORED\n` +
          `Action Taken By: ${req.admin.name || 'Platform Admin'}\n` +
          `You can now add products and process withdrawals normally.\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━`;

      const msg = await Message.create({
        conversation: conv._id,
        seller: seller._id,
        sender: 'admin',
        senderName: req.admin.name || 'Platform Compliance',
        text: msgText,
      });

      conv.lastMessage = isRestricted ? `⛔ Account ${statusLabel}: ${seller.freezeReason}` : `✅ Account Active`;
      conv.lastSender = 'admin';
      conv.lastAt = new Date();
      conv.unreadForSeller = (conv.unreadForSeller || 0) + 1;
      await conv.save();

      const io = req.app.get('io');
      if (io) {
        io.to(`seller:${seller._id}`).emit('message:new', msg);
        io.to(`seller:${seller._id}`).emit('seller:status_update', { seller: lightSeller(seller) });
      }
    } catch (chatErr) {
      console.error('Chat freeze error:', chatErr.message);
    }

    // Live Notification
    notify(req.app, {
      recipientType: 'seller',
      sellerId: seller._id,
      type: isRestricted ? 'withdrawal' : 'approval',
      title: isRestricted ? `⛔ Account ${statusLabel}` : `✅ Account Restored to Active`,
      body: isRestricted ? `Reason: ${seller.freezeReason}` : `Your account restrictions have been cleared.`,
      link: '/seller',
    });

    audit(req, 'update', 'seller_status', seller._id, `Set status to ${status} for ${seller.storeName}. Reason: ${reason}`);

    res.json({
      message: `Seller account ${status === 'active' ? 'unfrozen & activated' : 'set to ' + status} successfully`,
      seller: lightSeller(seller),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/:id/warn (Admin issues or clears an official warning announcement banner)
router.post('/:id/warn', authAdmin('sellers'), async (req, res) => {
  try {
    const { active: activeRaw = true, level: levelRaw = 'warning' } = req.body || {};
    const active = activeRaw === true || activeRaw === 'true';
    const message = String(req.body?.message || '').slice(0, 1000);
    const level = ['info', 'warning', 'critical'].includes(levelRaw) ? levelRaw : 'warning';
    if (active && !message.trim()) return res.status(400).json({ message: 'A warning message is required' });

    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    seller.warning = {
      active: Boolean(active),
      message: active ? message.trim() : '',
      level,
      issuedAt: active ? new Date() : null,
      issuedBy: active ? req.admin.name || 'Platform Compliance Desk' : '',
    };

    await seller.save();

    if (active && message.trim()) {
      // Auto-send chat warning message
      try {
        let conv = await Conversation.findOne({ seller: seller._id });
        if (!conv) {
          conv = await Conversation.create({
            seller: seller._id,
            storeName: seller.storeName,
            sellerName: seller.ownerName,
            sellerEmail: seller.email,
            subject: 'Official Compliance Warning',
            status: 'open',
            lastAt: new Date(),
          });
        }

        const msgText =
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `⚠️ OFFICIAL SELLER WARNING (${level.toUpperCase()})\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Notice: ${message.trim()}\n` +
          `Severity: ${level.toUpperCase()}\n` +
          `Issued By: ${req.admin.name || 'Platform Compliance Desk'}\n` +
          `Date: ${new Date().toLocaleString('en-IN')}\n\n` +
          `Note: This notice is displayed on your portal announcement bar. Please take immediate action to avoid account freeze.\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━`;

        const msg = await Message.create({
          conversation: conv._id,
          seller: seller._id,
          sender: 'admin',
          senderName: req.admin.name || 'Platform Compliance',
          text: msgText,
        });

        conv.lastMessage = `⚠️ Warning (${level}): ${message.trim()}`;
        conv.lastSender = 'admin';
        conv.lastAt = new Date();
        conv.unreadForSeller = (conv.unreadForSeller || 0) + 1;
        await conv.save();

        const io = req.app.get('io');
        if (io) {
          io.to(`seller:${seller._id}`).emit('message:new', msg);
          io.to(`seller:${seller._id}`).emit('seller:warning_update', { warning: seller.warning });
        }
      } catch (chatErr) {
        console.error('Chat warning error:', chatErr.message);
      }

      // Live toast notification
      notify(req.app, {
        recipientType: 'seller',
        sellerId: seller._id,
        type: 'withdrawal',
        title: `⚠️ Official Seller Warning (${level.toUpperCase()})`,
        body: message.trim(),
        link: '/seller',
      });
    }

    // cleared: the seller's banner goes away now (it used to stay until a page reload)
    if (!active) req.app.get('io')?.to(`seller:${seller._id}`).emit('seller:warning_update', { warning: seller.warning });

    audit(req, 'update', 'seller_warning', seller._id, `${active ? 'Issued warning' : 'Cleared warning'} for ${seller.storeName}`);

    res.json({
      message: active ? 'Official warning issued to seller successfully' : 'Warning cleared successfully',
      seller: lightSeller(seller),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/:id/health (Admin adjusts Seller Account Health score 0-100)
router.post('/:id/health', authAdmin('sellers'), async (req, res) => {
  try {
    const { score, notifySeller = true } = req.body || {};
    const reason = String(req.body?.reason || 'Manual score adjustment by Administrator').slice(0, 500);
    const numScore = Math.max(0, Math.min(100, Math.round(Number(score))));
    if (score === '' || score === null || score === undefined || isNaN(numScore)) {
      return res.status(400).json({ message: 'Valid health score between 0 and 100 is required' });
    }

    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    if (!seller.accountHealth) {
      seller.accountHealth = {
        score: 100,
        status: 'healthy',
        history: [],
      };
    }

    const previousScore = seller.accountHealth.score !== undefined ? seller.accountHealth.score : 100;
    const delta = numScore - previousScore;
    const newStatus = calculateHealthStatus(numScore);

    seller.accountHealth.score = numScore;
    seller.accountHealth.status = newStatus;
    seller.accountHealth.lastEvaluatedAt = new Date();

    if (!Array.isArray(seller.accountHealth.history)) {
      seller.accountHealth.history = [];
    }

    seller.accountHealth.history.unshift({
      previousScore,
      newScore: numScore,
      delta,
      reason: reason.trim() || 'Health score evaluated by Platform Compliance',
      changedBy: req.admin.name || 'Platform Administrator',
      createdAt: new Date(),
    });

    // Keep history trimmed to last 50 entries
    if (seller.accountHealth.history.length > 50) {
      seller.accountHealth.history = seller.accountHealth.history.slice(0, 50);
    }

    await seller.save();

    // Broadcast live health update
    const io = req.app.get('io');
    if (io) {
      io.to(`seller:${seller._id}`).emit('seller:health_update', { accountHealth: seller.accountHealth });
      io.to(adminRoom('sellers')).emit('seller:health_update', { sellerId: seller._id, accountHealth: seller.accountHealth });
    }

    if (notifySeller) {
      const tierLabel = numScore >= 80 ? 'Healthy (Good Standing)' : numScore >= 31 ? 'At Risk (Action Needed)' : numScore > 20 ? 'Critical (Freeze Alert)' : 'Critical (Suspension Alert)';
      notify(req.app, {
        recipientType: 'seller',
        sellerId: seller._id,
        type: numScore < 80 ? 'withdrawal' : 'approval',
        title: `🛡️ Account Health Updated: ${numScore}/100`,
        body: `Rating: ${tierLabel}. Reason: ${reason.trim() || 'Score adjusted by Platform Compliance'}`,
        link: '/seller',
      });
    }

    audit(req, 'update', 'seller_health', seller._id, `Updated account health for ${seller.storeName} from ${previousScore} to ${numScore}. Reason: ${reason}`);

    res.json({
      message: `Account health updated to ${numScore}/100 successfully`,
      seller: lightSeller(seller),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// AFFILIATE / REFERRAL CODES MANAGEMENT ROUTES
// (rules live in utils/affiliateCodes.js: CAPITALS, 3-32 chars, a seller may only register with
//  the master code or an ACTIVE custom code)
// ─────────────────────────────────────────────────────────────

const cleanRate = (v) => {
  if (v === undefined || v === null || v === '') return { value: null };
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) return { error: 'Commission must be a number between 0 and 100' };
  return { value: Math.round(n * 100) / 100 };
};
const cleanBonus = (v) => {
  if (v === undefined || v === null || v === '') return { value: 0 };
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1000000) return { error: 'Welcome bonus must be a positive number' };
  return { value: Math.round(n * 100) / 100 };
};
const isDuplicateKey = (err) => err?.code === 11000;

// For an admin (approve / edit seller) a code must exist; a switched-off code is still allowed
// because the seller may have registered while it was active. Returns an error text or ''.
async function adminAffiliateError(code) {
  if (!code) return '';
  const r = await resolveAffiliateCode(code);
  if (r.ok || r.reason === 'inactive') return '';
  return `Affiliate code "${code}" does not exist. Correct it (see Affiliate Codes) or clear the field.`;
}

// GET /api/sellers/master-affiliate or /api/sellers/master-referral (Get platform master affiliate code)
router.get(['/master-affiliate', '/master-referral'], authAdmin('sellers'), async (req, res) => {
  try {
    const code = await getMasterCode();
    res.json({ masterReferralCode: code, masterAffiliateCode: code });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/master-affiliate or /api/sellers/master-referral (Update platform master affiliate code)
router.post(['/master-affiliate', '/master-referral'], authAdmin('sellers'), async (req, res) => {
  try {
    const cleanCode = normalizeCode(req.body?.code);
    const formatErr = codeFormatError(cleanCode);
    if (formatErr) return res.status(400).json({ message: formatErr });
    const existing = await ReferralCode.findOne({ code: cleanCode }).lean();
    // a FORMER master code (kept as an inactive record when it was replaced) may become the master
    // again; any other custom code keeps its own settings and cannot be turned into the master
    const isFormerMaster = existing && existing.description === 'Former master affiliate code';
    if (existing && !isFormerMaster) {
      return res.status(400).json({ message: `"${cleanCode}" is already a custom affiliate code. Pick a different master code.` });
    }
    const previous = await getMasterCode();
    await setSetting('master_affiliate_code', cleanCode);
    await setSetting('master_referral_code', cleanCode);
    // it is the master now, not a custom code (its sellers count under the master again)
    if (isFormerMaster) await ReferralCode.deleteOne({ _id: existing._id });
    // The old master code stays known (switched off): sellers who joined with it keep counting
    // under it and can still be approved, but nobody new can register with it.
    if (previous && previous !== cleanCode) {
      await ReferralCode.updateOne(
        { code: previous },
        { $setOnInsert: { code: previous, description: 'Former master affiliate code', status: 'inactive', createdBy: req.admin?.name || 'Admin' } },
        { upsert: true }
      ).catch(() => {});
    }
    audit(req, 'update', 'system_setting', null, `Updated master affiliate code from ${previous} to ${cleanCode}`);
    res.json({
      message: 'Master affiliate code updated successfully',
      masterReferralCode: cleanCode,
      masterAffiliateCode: cleanCode,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sellers/affiliates or /api/sellers/referrals
// Admin lists every affiliate code with live usage (approved / pending / rejected), a 12-week
// sign-up trend, and the codes sellers used that match no code at all (typos from before the check).
router.get(['/affiliates', '/referrals'], authAdmin('sellers'), async (req, res) => {
  try {
    const WEEKS = 12;
    const weekStart = (d) => {
      const x = new Date(d);
      x.setUTCHours(0, 0, 0, 0);
      x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
      return x;
    };
    const firstWeek = weekStart(new Date());
    firstWeek.setUTCDate(firstWeek.getUTCDate() - 7 * (WEEKS - 1));

    const [masterCode, customCodes, usage, totalSellers, recentSellers] = await Promise.all([
      getMasterCode(),
      ReferralCode.find().sort({ createdAt: -1 }).lean(),
      usageByCode(Seller),
      Seller.countDocuments(),
      Seller.find({ createdAt: { $gte: firstWeek } }).select('createdAt securityDeposit.referralCode').lean(),
    ]);

    const empty = { total: 0, active: 0, pending: 0, rejected: 0, other: 0, last: null };
    const statsOf = (code) => usage.get(code) || empty;
    const masterStats = statsOf(masterCode);

    const enrichedCodes = customCodes.map((rc) => {
      const st = statsOf(normalizeCode(rc.code));
      return {
        ...rc,
        usageCount: st.total,
        approvedCount: st.active,
        pendingCount: st.pending,
        rejectedCount: st.rejected,
        lastUsedAt: st.last,
      };
    });

    const known = new Set([masterCode, ...customCodes.map((rc) => normalizeCode(rc.code))]);
    const unknownCodes = [...usage.entries()]
      .filter(([code]) => !known.has(code))
      .map(([code, st]) => ({ code, count: st.total, lastUsedAt: st.last }))
      .sort((a, b) => b.count - a.count);

    // weekly sign-ups: with a known code, with an unknown code, without a code
    const trend = [];
    for (let i = 0; i < WEEKS; i++) {
      const d = new Date(firstWeek);
      d.setUTCDate(d.getUTCDate() + 7 * i);
      trend.push({ week: d.toISOString().slice(0, 10), withCode: 0, unknownCode: 0, direct: 0 });
    }
    for (const s of recentSellers) {
      const idx = Math.floor((weekStart(s.createdAt) - firstWeek) / (7 * 24 * 3600 * 1000));
      if (idx < 0 || idx >= WEEKS) continue;
      const code = normalizeCode(s.securityDeposit?.referralCode);
      if (!code) trend[idx].direct += 1;
      else if (known.has(code)) trend[idx].withCode += 1;
      else trend[idx].unknownCode += 1;
    }

    const viaCodes = masterStats.total + enrichedCodes.reduce((t, c) => t + c.usageCount, 0);
    res.json({
      masterReferralCode: masterCode,
      masterAffiliateCode: masterCode,
      masterUsageCount: masterStats.total,
      masterStats: { approved: masterStats.active, pending: masterStats.pending, rejected: masterStats.rejected, lastUsedAt: masterStats.last },
      referralCodes: enrichedCodes,
      affiliateCodes: enrichedCodes,
      unknownCodes,
      trend,
      totals: {
        sellers: totalSellers,
        viaCodes,
        unknown: unknownCodes.reduce((t, c) => t + c.count, 0),
        activeCodes: enrichedCodes.filter((c) => c.status === 'active').length + 1,
        inactiveCodes: enrichedCodes.filter((c) => c.status !== 'active').length,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/affiliates or /api/sellers/referrals (Admin creates a new custom affiliate code)
router.post(['/affiliates', '/referrals'], authAdmin('sellers'), async (req, res) => {
  try {
    const { code, description, commissionRate, bonusAmount, status } = req.body || {};
    const cleanCode = normalizeCode(code);
    const formatErr = codeFormatError(cleanCode);
    if (formatErr) return res.status(400).json({ message: formatErr });
    if (cleanCode === (await getMasterCode())) {
      return res.status(400).json({ message: `"${cleanCode}" is the master affiliate code already` });
    }
    const rate = cleanRate(commissionRate);
    if (rate.error) return res.status(400).json({ message: rate.error });
    const bonus = cleanBonus(bonusAmount);
    if (bonus.error) return res.status(400).json({ message: bonus.error });

    if (await ReferralCode.exists({ code: cleanCode })) {
      return res.status(400).json({ message: `Affiliate code "${cleanCode}" already exists` });
    }

    const newCode = new ReferralCode({
      code: cleanCode,
      description: asText(description, 200).trim(),
      commissionRate: rate.value,
      bonusAmount: bonus.value,
      status: status === 'inactive' ? 'inactive' : 'active',
      createdBy: req.admin?.name || 'Admin',
    });
    try {
      await newCode.save();
    } catch (err) {
      // two admins creating the same code at the same moment
      if (isDuplicateKey(err)) return res.status(400).json({ message: `Affiliate code "${cleanCode}" already exists` });
      throw err;
    }

    audit(req, 'create', 'referral_code', newCode._id, `Created affiliate code: ${cleanCode}`);

    res.status(201).json({
      message: `Affiliate code "${cleanCode}" created successfully! 🎉`,
      referralCode: newCode,
      affiliateCode: newCode,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/affiliates/bulk (Admin generates several codes at once: PREFIX-XXXXXX)
router.post('/affiliates/bulk', authAdmin('sellers'), async (req, res) => {
  try {
    const { prefix, count, description, commissionRate, bonusAmount, status } = req.body || {};
    const cleanPrefix = normalizeCode(prefix).replace(/[-_]+$/, '');
    if (cleanPrefix && !/^[A-Z0-9][A-Z0-9_-]{0,15}$/.test(cleanPrefix)) {
      return res.status(400).json({ message: 'Prefix can be up to 16 letters, numbers, "-" or "_"' });
    }
    const n = Math.floor(Number(count));
    if (!Number.isFinite(n) || n < 1 || n > 50) return res.status(400).json({ message: 'You can generate between 1 and 50 codes at a time' });
    const rate = cleanRate(commissionRate);
    if (rate.error) return res.status(400).json({ message: rate.error });
    const bonus = cleanBonus(bonusAmount);
    if (bonus.error) return res.status(400).json({ message: bonus.error });

    const masterCode = await getMasterCode();
    const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I: easy to read out loud
    const randomPart = () => Array.from(crypto.randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join('');
    const wanted = new Set();
    let guard = 0;
    while (wanted.size < n && guard++ < n * 20) {
      const c = cleanPrefix ? `${cleanPrefix}-${randomPart()}` : randomPart();
      if (c !== masterCode) wanted.add(c);
    }
    const taken = new Set((await ReferralCode.find({ code: { $in: [...wanted] } }).select('code').lean()).map((r) => r.code));
    const docs = [...wanted]
      .filter((c) => !taken.has(c))
      .map((c) => ({
        code: c,
        description: asText(description, 200).trim(),
        commissionRate: rate.value,
        bonusAmount: bonus.value,
        status: status === 'inactive' ? 'inactive' : 'active',
        createdBy: req.admin?.name || 'Admin',
      }));

    let created = [];
    try {
      created = await ReferralCode.insertMany(docs, { ordered: false });
    } catch (err) {
      // a code created by someone else in between is skipped, the rest are kept
      if (!isDuplicateKey(err) && !err?.writeErrors) throw err;
      created = err.insertedDocs || [];
    }
    audit(req, 'create', 'referral_code', null, `Generated ${created.length} affiliate codes${cleanPrefix ? ` (prefix ${cleanPrefix})` : ''}`);
    res.status(201).json({
      message: `${created.length} affiliate code${created.length === 1 ? '' : 's'} generated`,
      codes: created.map((c) => c.code),
      affiliateCodes: created,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/sellers/affiliates/:id (Admin edits description / commission / bonus / status).
// The code itself is not renamed: sellers who already used it keep pointing to it.
router.patch(['/affiliates/:id', '/referrals/:id'], authAdmin('sellers'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Affiliate code not found' });
    const rc = await ReferralCode.findById(req.params.id);
    if (!rc) return res.status(404).json({ message: 'Affiliate code not found' });
    const { description, commissionRate, bonusAmount, status } = req.body || {};
    if (description !== undefined) rc.description = asText(description, 200).trim();
    if (commissionRate !== undefined) {
      const rate = cleanRate(commissionRate);
      if (rate.error) return res.status(400).json({ message: rate.error });
      rc.commissionRate = rate.value;
    }
    if (bonusAmount !== undefined) {
      const bonus = cleanBonus(bonusAmount);
      if (bonus.error) return res.status(400).json({ message: bonus.error });
      rc.bonusAmount = bonus.value;
    }
    if (status !== undefined) rc.status = status === 'inactive' ? 'inactive' : 'active';
    await rc.save();
    audit(req, 'update', 'referral_code', rc._id, `Edited affiliate code: ${rc.code}`);
    res.json({ ok: true, message: `Affiliate code "${rc.code}" updated.`, referralCode: rc, affiliateCode: rc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/sellers/affiliates/:id or /api/sellers/referrals/:id (Admin deletes an affiliate code)
router.delete(['/affiliates/:id', '/referrals/:id'], authAdmin('sellers'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Affiliate code not found' });
    const rc = await ReferralCode.findById(req.params.id);
    if (!rc) return res.status(404).json({ message: 'Affiliate code not found' });

    // A code sellers joined with stays: deleting it made their code "unknown", and waiting
    // applications with it could no longer be approved ("code does not exist") without losing
    // which partner brought them. Switching it off stops new sign-ups and keeps the history.
    const used = (await usageByCode(Seller)).get(normalizeCode(rc.code));
    if (used && used.total > 0) {
      return res.status(400).json({
        code: 'CODE_IN_USE',
        usedBy: used.total,
        message: `"${rc.code}" was used by ${used.total} seller(s), so it cannot be deleted. Set it to Inactive instead: no new sign-ups, history kept.`,
      });
    }

    await ReferralCode.findByIdAndDelete(req.params.id);
    audit(req, 'delete', 'referral_code', req.params.id, `Deleted affiliate code: ${rc.code}`);

    res.json({ ok: true, message: `Affiliate code "${rc.code}" deleted successfully.` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/sellers/affiliates/:id/toggle or /api/sellers/referrals/:id/toggle (Admin toggles active / inactive)
router.patch(['/affiliates/:id/toggle', '/referrals/:id/toggle'], authAdmin('sellers'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Affiliate code not found' });
    const rc = await ReferralCode.findById(req.params.id);
    if (!rc) return res.status(404).json({ message: 'Affiliate code not found' });

    rc.status = rc.status === 'active' ? 'inactive' : 'active';
    await rc.save();

    audit(req, 'update', 'referral_code', rc._id, `Set status to ${rc.status} for ${rc.code}`);

    res.json({
      ok: true,
      message: `Affiliate code "${rc.code}" is now ${rc.status.toUpperCase()}.`,
      referralCode: rc,
      affiliateCode: rc,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sellers/:id (Admin views single seller + full dashboard stats / Impersonation)
router.get('/:id', authAdmin('sellers'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return next();
    }
    // perf: callers that do not show KYC documents pass ?kyc=0 to skip the base64 images
    const sellerSelect = req.query.kyc === '0' ? SELLER_LIST_SELECT : '-passwordHash';
    // Only what the profile shows. Whole orders and products (and the KYC pictures) made this
    // answer several MB; building it kept the small server busy for seconds, and every other
    // request (chat messages, the shop) waited behind it.
    const [seller, products, orders] = await Promise.all([
      Seller.findById(req.params.id).select(sellerSelect),
      Product.find({ seller: req.params.id })
        .select('name slug price oldPrice stock image images active sold treasuryProduct category createdAt')
        .populate('category', 'name slug')
        .lean(),
      Order.find({
        $or: [{ 'items.seller': req.params.id }, { seller: req.params.id }],
      })
        .select('orderNumber status total createdAt seller shippingAddress.fullName items.seller items.name items.price items.qty items.costPrice items.itemStatus')
        .sort({ createdAt: -1 })
        .lean(),
    ]);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    let grossRevenue = 0;
    let totalCost = 0;
    let totalItemsSold = 0;

    let pendingOrders = 0;
    let deliveredOrders = 0;
    let cancelledOrders = 0;

    orders.forEach((ord) => {
      const st = (ord.status || '').toLowerCase();
      if (!['delivered', 'cancelled', 'refunded'].includes(st)) {
        pendingOrders += 1;
      } else if (st === 'delivered') {
        deliveredOrders += 1;
      } else if (st === 'cancelled') {
        cancelledOrders += 1;
      }
      if (ord.status !== 'cancelled') {
        const sellerItems = ord.items.filter(
          (it) => (it.seller && it.seller.toString() === seller._id.toString()) || (!it.seller && ord.seller && ord.seller.toString() === seller._id.toString())
        );
        sellerItems.forEach((it) => {
          grossRevenue += (it.price || 0) * (it.qty || 1);
          totalCost += (it.costPrice || 0) * (it.qty || 1);
          totalItemsSold += it.qty || 1;
        });
      }
    });

    const commissionPercent = seller.commissionRate || 10;
    const platformCommission = (grossRevenue * commissionPercent) / 100;
    const netProfit = grossRevenue - totalCost - platformCommission;

    const safeSeller = seller.toObject();
    if (!safeSeller.plainPassword) {
      safeSeller.plainPassword = '';
    }

    res.json({
      seller: safeSeller,
      stats: {
        grossRevenue,
        netProfit: Math.max(0, netProfit),
        platformCommission,
        totalCost,
        totalOrders: orders.length,
        pendingOrders,
        deliveredOrders,
        cancelledOrders,
        totalItemsSold,
        totalProducts: products.length,
      },
      products,
      orders,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/sellers/:id (Admin updates seller: commission, status, security deposit, password reset)
router.put('/:id', authAdmin('sellers'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return next();
    }
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const {
      storeName,
      ownerName,
      email,
      password,
      phone,
      commissionRate,
      status,
      address,
      securityDepositAmount,
      securityDepositPaid,
      referralCode,
      note,
      isTestAccount,
      accountType,
      isPreviousStoreSeller,
    } = req.body;

    let cleanReferral;
    if (referralCode !== undefined) {
      cleanReferral = normalizeCode(referralCode);
      // the seller's current code may stay as it is (even an old one); a new one must exist
      if (cleanReferral !== normalizeCode(seller.securityDeposit?.referralCode)) {
        const referralErr = await adminAffiliateError(cleanReferral);
        if (referralErr) return res.status(400).json({ code: 'INVALID_AFFILIATE_CODE', message: referralErr });
      }
    }

    // Checked before anything is changed below (the status can be edited in this same request)
    const twoPeopleForType = await isApprovedSeller(seller);

    if (storeName) seller.storeName = storeName;
    if (ownerName) seller.ownerName = ownerName;
    if (email) seller.email = email.toLowerCase().trim();
    if (phone !== undefined) seller.phone = phone;
    if (badCommission(commissionRate)) return res.status(400).json({ message: COMMISSION_MSG });
    if (commissionRate !== undefined && commissionRate !== null && commissionRate !== '') seller.commissionRate = Number(commissionRate);
    if (status) seller.status = status;
    if (address) seller.address = { ...seller.address, ...address };

    // Seller type (test / previous store): on an approved seller a change waits for the other partner
    const approvalNotices = [];
    const typeAtStart = { isTestAccount: Boolean(seller.isTestAccount), isPreviousStoreSeller: Boolean(seller.isPreviousStoreSeller) };
    const wantsTest = isTestAccount !== undefined ? Boolean(isTestAccount) : accountType !== undefined ? accountType === 'test' : undefined;
    if (wantsTest !== undefined) {
      if (wantsTest !== Boolean(seller.isTestAccount) && twoPeopleForType) {
        const asked = await askSellerFlagChange(req, seller, 'isTestAccount', wantsTest);
        approvalNotices.push(`Account type (test / client) was not changed yet. ${asked.message}`);
      } else {
        seller.isTestAccount = wantsTest;
        seller.accountType = wantsTest ? 'test' : 'client';
      }
    }

    if (isPreviousStoreSeller !== undefined) {
      if (Boolean(isPreviousStoreSeller) !== Boolean(seller.isPreviousStoreSeller) && twoPeopleForType) {
        const asked = await askSellerFlagChange(req, seller, 'isPreviousStoreSeller', Boolean(isPreviousStoreSeller));
        approvalNotices.push(`Previous-store setting was not changed yet. ${asked.message}`);
      } else {
        seller.isPreviousStoreSeller = Boolean(isPreviousStoreSeller);
      }
    }

    if (securityDepositAmount !== undefined || securityDepositPaid !== undefined || referralCode !== undefined) {
      const isPaid = securityDepositPaid !== undefined ? Boolean(securityDepositPaid) : Boolean(seller.securityDeposit?.paid);
      const depAmt = securityDepositAmount !== undefined ? Number(securityDepositAmount) : (seller.securityDeposit?.amount || 0);
      const cleanAmt = isPaid ? Math.max(0, depAmt) : 0;

      seller.securityDeposit = {
        paid: isPaid,
        amount: cleanAmt,
        paidAt: isPaid ? (seller.securityDeposit?.paidAt || new Date()) : null,
        referralCode: cleanReferral !== undefined ? cleanReferral : (seller.securityDeposit?.referralCode || ''),
        note: note !== undefined ? (note || '').trim() : (seller.securityDeposit?.note || ''),
      };

      seller.wallet = seller.wallet || {};
      seller.wallet.securityDeposit = cleanAmt;
    }

    if (req.body.withdrawalLimit) {
      const wl = req.body.withdrawalLimit;
      seller.withdrawalLimit = seller.withdrawalLimit || {};
      if (wl.maxAmount !== undefined) seller.withdrawalLimit.maxAmount = Math.max(1, Number(wl.maxAmount));
      if (wl.minAmount !== undefined) seller.withdrawalLimit.minAmount = Math.max(1, Number(wl.minAmount));
      if (wl.requiredWithdrawalsForIncrease !== undefined) seller.withdrawalLimit.requiredWithdrawalsForIncrease = Math.max(1, Number(wl.requiredWithdrawalsForIncrease));
      if (wl.successfulWithdrawalCount !== undefined) seller.withdrawalLimit.successfulWithdrawalCount = Math.max(0, Number(wl.successfulWithdrawalCount));
      if (wl.upgradeFee !== undefined) seller.withdrawalLimit.upgradeFee = Math.max(0, Number(wl.upgradeFee));
      if (wl.currentTierName) seller.withdrawalLimit.currentTierName = wl.currentTierName.trim();
      seller.markModified('withdrawalLimit');
    }

    if (password) {
      if (typeof password !== 'string' || password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters long' });
      seller.passwordHash = await bcrypt.hash(password, 10);
      rememberPassword(seller, password);
      seller.pwdAt = new Date(); // the seller's older logins stop working
      forgetAuthCache('seller', seller._id);
      await finLog(req, { action: 'seller.password_reset', summary: `Set a new password for seller “${seller.storeName}”`, entity: 'seller', entityId: seller._id, sellerId: seller._id, storeName: seller.storeName });
    }

    await seller.save();
    audit(req, 'update', 'seller', seller._id, `Updated seller: ${seller.storeName}`);
    if (approvalNotices.length === 0 && (wantsTest !== undefined || isPreviousStoreSeller !== undefined) && (typeAtStart.isTestAccount !== Boolean(seller.isTestAccount) || typeAtStart.isPreviousStoreSeller !== Boolean(seller.isPreviousStoreSeller))) {
      await finLog(req, {
        action: 'seller.type_set',
        summary: `Set the type of seller “${seller.storeName}” (still waiting for registration approval): ${seller.isTestAccount ? 'TEST' : 'client'}${seller.isPreviousStoreSeller ? ', previous store' : ''}`,
        entity: 'seller',
        entityId: seller._id,
        sellerId: seller._id,
        storeName: seller.storeName,
        before: typeAtStart,
        after: { isTestAccount: Boolean(seller.isTestAccount), isPreviousStoreSeller: Boolean(seller.isPreviousStoreSeller) },
      });
    }

    const safeSeller = lightSeller(seller);

    const io = req.app.get('io');
    if (io) {
      io.to(`seller:${seller._id}`).emit('seller:status_update', { seller: safeSeller });
      io.to(`seller:${seller._id}`).emit('wallet:update', { wallet: seller.wallet, sellerId: seller._id, withdrawalLimit: seller.withdrawalLimit });
      io.to(`seller:${seller._id}`).emit('seller:limit_update', { sellerId: seller._id, withdrawalLimit: seller.withdrawalLimit });
      io.to('sellers').emit('seller:status_update', { seller: safeSeller });
    }

    // Only for the admin screen: tells it that a type change is waiting for the other partner
    if (approvalNotices.length > 0) safeSeller._approvalNotice = approvalNotices.join(' ');

    res.json(safeSeller);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/:id/withdrawal-limit (Admin updates withdrawal limits and banking tier)
router.post('/:id/withdrawal-limit', authAdmin('finance'), async (req, res) => {
  try {
    const { maxAmount, minAmount, requiredWithdrawalsForIncrease, successfulWithdrawalCount, upgradeFee, currentTierName } = req.body || {};
    // every number must really be a number (a typo used to end in a 500 "server error")
    const given = { maxAmount, minAmount, requiredWithdrawalsForIncrease, successfulWithdrawalCount, upgradeFee };
    for (const [field, v] of Object.entries(given)) {
      if (v !== undefined && !(Number.isFinite(Number(v)) && Number(v) >= 0)) {
        return res.status(400).json({ message: `Please enter a valid number (0 or more) for ${field}.` });
      }
    }
    if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) return res.status(404).json({ message: 'Seller not found' });
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    // the minimum payout can never be above the maximum (the seller could not withdraw at all);
    // checked against the values that will be saved, including the ones not sent now
    const nextMax = maxAmount !== undefined ? Math.max(1, Number(maxAmount)) : Number(seller.withdrawalLimit?.maxAmount ?? 500);
    const nextMin = minAmount !== undefined ? Math.max(1, Number(minAmount)) : Number(seller.withdrawalLimit?.minAmount ?? 10);
    if (nextMin > nextMax) return res.status(400).json({ message: `The minimum payout ($${nextMin}) cannot be more than the maximum ($${nextMax}).` });

    seller.withdrawalLimit = seller.withdrawalLimit || {};

    if (maxAmount !== undefined) seller.withdrawalLimit.maxAmount = Math.max(1, Number(maxAmount));
    if (minAmount !== undefined) seller.withdrawalLimit.minAmount = Math.max(1, Number(minAmount));
    if (requiredWithdrawalsForIncrease !== undefined) seller.withdrawalLimit.requiredWithdrawalsForIncrease = Math.max(1, Number(requiredWithdrawalsForIncrease));
    if (successfulWithdrawalCount !== undefined) seller.withdrawalLimit.successfulWithdrawalCount = Math.max(0, Number(successfulWithdrawalCount));
    if (upgradeFee !== undefined) seller.withdrawalLimit.upgradeFee = Math.max(0, Number(upgradeFee));
    if (typeof currentTierName === 'string' && currentTierName.trim()) seller.withdrawalLimit.currentTierName = currentTierName.trim().slice(0, 120);

    seller.markModified('withdrawalLimit');
    await seller.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`seller:${seller._id}`).emit('seller:limit_update', { sellerId: seller._id, withdrawalLimit: seller.withdrawalLimit });
      io.to(`seller:${seller._id}`).emit('wallet:update', { sellerId: seller._id, withdrawalLimit: seller.withdrawalLimit });
      // only this seller and the admins are told (it used to go to every connected visitor)
      io.to(`seller:${seller._id}`).emit('limit:update', { sellerId: seller._id, withdrawalLimit: seller.withdrawalLimit });
      io.to(adminRoom('finance')).emit('seller:limit_update', { sellerId: seller._id, withdrawalLimit: seller.withdrawalLimit });
      io.to(adminRoom('finance')).emit('wallet:update', { sellerId: seller._id, withdrawalLimit: seller.withdrawalLimit });
      io.to(adminRoom('finance')).emit('limit:update', { sellerId: seller._id, withdrawalLimit: seller.withdrawalLimit });
    }

    notify(req.app, {
      recipientType: 'seller',
      sellerId: seller._id,
      type: 'approval',
      title: '💼 Withdrawal Limit Updated',
      body: `Your store withdrawal limit has been updated to $${(seller.withdrawalLimit.maxAmount || 500).toLocaleString('en-US')} (${seller.withdrawalLimit.currentTierName || 'Standard Tier'}) by Platform Administration.`,
      link: '/seller/wallet?tab=withdraw',
    });

    audit(req, 'update', 'seller_limit', seller._id, `Updated withdrawal limits for ${seller.storeName}: Max $${seller.withdrawalLimit.maxAmount}, Req ${seller.withdrawalLimit.requiredWithdrawalsForIncrease}, Completed ${seller.withdrawalLimit.successfulWithdrawalCount}, Tier: ${seller.withdrawalLimit.currentTierName}`);

    res.json({
      message: 'Withdrawal limit settings updated successfully',
      withdrawalLimit: seller.withdrawalLimit,
      seller: lightSeller(seller),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// POST /api/sellers/:id/approve (Admin approves a pending seller registration)
router.post('/:id/approve', authAdmin('sellers'), oneDecisionAtATime, async (req, res) => {
  try {
    const { securityDepositPaid, securityDepositAmount, referralCode, assignedReferralCode, commissionRate, note, isTestAccount, accountType, isPreviousStoreSeller, assignedMemberId } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) return res.status(404).json({ message: 'Seller not found' });
    if (badCommission(commissionRate)) return res.status(400).json({ message: COMMISSION_MSG });
    // the KYC photos are not needed to approve (and are MBs): left in the database
    const seller = await Seller.findById(req.params.id).select(SELLER_LIST_SELECT);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });
    // Saving this form makes the store "active": a store frozen or suspended for compliance is
    // managed on the Complaints page, never switched on from here (the button was only hidden).
    if (seller.status === 'frozen' || (seller.status === 'suspended' && !seller.registrationRejectedAt)) {
      return res.status(400).json({ message: `This store is ${seller.status}. Lift that on the Complaints page; it is not changed from New Applications.` });
    }

    // Was this seller already approved before? Then this is an edit, not a first approval: its
    // type and its owner cannot be changed here by one person (see the two-person rule above).
    const wasApproved = await isApprovedSeller(seller);
    const approvalNotices = [];
    const typeBefore = { isTestAccount: Boolean(seller.isTestAccount), isPreviousStoreSeller: Boolean(seller.isPreviousStoreSeller) };

    // A client seller must belong to a partner or a team member, otherwise its money cannot be divided.
    // (Test accounts are outside the finance ledger, so they do not need an owner.)
    const askedTest = isTestAccount !== undefined
      ? Boolean(isTestAccount)
      : accountType !== undefined
      ? accountType === 'test'
      : Boolean(seller.isTestAccount);
    const willBeTest = wasApproved ? Boolean(seller.isTestAccount) : askedTest;

    let ownerMember = null;
    const ownerOid = toObjectId(assignedMemberId);
    if (ownerOid) {
      ownerMember = await portalMembersCol().findOne({ _id: ownerOid, active: { $ne: false } });
      if (!ownerMember) return res.status(400).json({ message: 'Selected team member was not found. Please choose again.' });
    } else if (!willBeTest) {
      const alreadyAssigned = await portalAssignmentsCol().findOne({ sellerId: seller._id, status: 'active' });
      if (!alreadyAssigned) {
        return res.status(400).json({ message: 'Assign this seller to a partner or team member before approving (Assigned To is required).' });
      }
    }

    const isPaid = Boolean(securityDepositPaid);
    const depAmt = isPaid ? Math.max(0, Number(securityDepositAmount) || 0) : 0;
    // The code typed in the approve form wins, even when it was cleared (empty = no code)
    const finalReferral = normalizeCode(
      assignedReferralCode !== undefined ? assignedReferralCode : referralCode !== undefined ? referralCode : seller.securityDeposit?.referralCode
    );
    // a first approval must carry a real code; an already approved seller may keep the one it has
    const keepsOldCode = wasApproved && finalReferral === normalizeCode(seller.securityDeposit?.referralCode);
    const referralErr = keepsOldCode ? '' : await adminAffiliateError(finalReferral);
    if (referralErr) return res.status(400).json({ code: 'INVALID_AFFILIATE_CODE', message: referralErr });

    seller.status = 'active';
    seller.registrationRejectedAt = undefined;
    if (!wasApproved) {
      seller.verified = true; // approving a registration is what verifies a store
      // a re-approved (earlier rejected) registration no longer carries the rejection
      seller.freezeReason = '';
      seller.frozenAt = null;
      seller.frozenBy = '';
    }
    if (commissionRate !== undefined && commissionRate !== null && commissionRate !== '') seller.commissionRate = Number(commissionRate);

    if (wasApproved) {
      if (askedTest !== typeBefore.isTestAccount) {
        const asked = await askSellerFlagChange(req, seller, 'isTestAccount', askedTest);
        approvalNotices.push(`Account type (test / client) was not changed yet. ${asked.message}`);
      }
      if (isPreviousStoreSeller !== undefined && Boolean(isPreviousStoreSeller) !== typeBefore.isPreviousStoreSeller) {
        const asked = await askSellerFlagChange(req, seller, 'isPreviousStoreSeller', Boolean(isPreviousStoreSeller));
        approvalNotices.push(`Previous-store setting was not changed yet. ${asked.message}`);
      }
    } else {
      if (isTestAccount !== undefined) {
        seller.isTestAccount = Boolean(isTestAccount);
        seller.accountType = seller.isTestAccount ? 'test' : 'client';
      } else if (accountType !== undefined) {
        seller.accountType = accountType === 'test' ? 'test' : 'client';
        seller.isTestAccount = seller.accountType === 'test';
      }

      if (isPreviousStoreSeller !== undefined) {
        seller.isPreviousStoreSeller = Boolean(isPreviousStoreSeller);
      }
    }

    const wasPaid = Boolean(seller.securityDeposit?.paid);
    seller.securityDeposit = {
      paid: isPaid,
      amount: depAmt,
      // the date it was paid, kept on later edits (it used to become "now" on every save)
      paidAt: isPaid ? (wasPaid && seller.securityDeposit?.paidAt ? seller.securityDeposit.paidAt : new Date()) : null,
      referralCode: finalReferral,
      note: (note || '').trim(),
    };

    seller.wallet = seller.wallet || {};
    seller.wallet.securityDeposit = depAmt;

    await seller.save();

    // Record who this seller belongs to (team portal assignment)
    if (ownerMember) {
      const assignments = portalAssignmentsCol();
      const current = await assignments.findOne({ sellerId: seller._id, status: 'active' });
      // A seller stays with its owner for good once its first deposit has come in
      const hasDeposit =
        current && String(current.memberId) !== String(ownerMember._id)
          ? await Withdrawal.exists({ seller: seller._id, type: 'deposit', status: { $in: ['approved', 'completed'] } })
          : null;
      if (hasDeposit) {
        approvalNotices.push('The owner (Assigned To) was not changed: this seller already has deposits, so it stays with its current owner.');
      } else if (current && String(current.memberId) !== String(ownerMember._id) && wasApproved) {
        // Moving an approved seller to another owner changes who earns from it: two people
        const previousOwner = await portalMembersCol().findOne({ _id: current.memberId }).catch(() => null);
        const asked = await requestApproval(req, {
          action: 'reassign',
          targetId: String(seller._id),
          summary: `Move seller “${seller.storeName}” from ${previousOwner ? previousOwner.name : 'its current owner'} to ${ownerMember.name}`,
          details: ['New deposits and withdrawals of this seller will be divided for the new owner.'],
          payload: { sellerId: String(seller._id), memberId: String(ownerMember._id) },
          sellerId: seller._id,
          storeName: seller.storeName,
        });
        approvalNotices.push(`The owner (Assigned To) was not changed yet. ${asked.message}`);
      } else if (!current || String(current.memberId) !== String(ownerMember._id)) {
        const now = new Date();
        const deal = ownerMember.commissionLabel || 'pkr_1to1';
        const adminOid = toObjectId(req.admin.id);
        const approver = adminOid ? await portalMembersCol().findOne({ ecommerceAdminId: adminOid }).catch(() => null) : null;

        await assignments.updateMany(
          { sellerId: seller._id, status: 'active' },
          { $set: { status: 'transferred', updatedAt: now } }
        );
        await assignments.insertOne({
          sellerId: seller._id,
          memberId: ownerMember._id,
          assignedBy: approver ? approver._id : null,
          status: 'active',
          commissionLabel: deal,
          privateNotes: {
            customName: seller.storeName,
            age: '',
            occupation: 'Merchant / Seller',
            maritalStatus: '',
            location: seller.address?.city || '',
            picture: '',
            details: `Assigned on ${now.toLocaleDateString()} (seller approval)`,
            updatedAt: now,
          },
          createdAt: now,
          updatedAt: now,
          __v: 0,
        });
        await Seller.collection.updateOne({ _id: seller._id }, { $set: { commissionLabel: deal } });
        audit(req, 'update', 'seller', seller._id, `Assigned ${seller.storeName} to ${ownerMember.name}`);
        await finLog(req, {
          action: 'seller.assigned',
          summary: `Assigned seller “${seller.storeName}” to ${ownerMember.name} (seller approval screen)`,
          entity: 'seller',
          entityId: seller._id,
          sellerId: seller._id,
          storeName: seller.storeName,
          before: { ownerId: current ? String(current.memberId) : '' },
          after: { owner: ownerMember.name, ownerId: String(ownerMember._id), deal },
        });
      }
    }

    // Security deposit line in the wallet history: created once, and kept in step when the deposit
    // is edited later (it used to keep the first amount for good, so the history and the profile
    // disagreed; a deposit set back to "not paid" stayed in the history as paid)
    try {
      const existingLedger = await Withdrawal.findOne({ seller: seller._id, depositRef: 'INITIAL_SECURITY_DEPOSIT' });
      if (existingLedger) {
        const nowPaid = isPaid && depAmt > 0;
        const changed = nowPaid !== (existingLedger.status === 'approved') || (nowPaid && Number(existingLedger.amount) !== depAmt);
        if (changed) {
          existingLedger.amount = nowPaid ? depAmt : existingLedger.amount;
          existingLedger.approvedAmount = nowPaid ? depAmt : 0;
          existingLedger.status = nowPaid ? 'approved' : 'rejected';
          existingLedger.adminNote = nowPaid
            ? `Security deposit set to $${depAmt} by ${req.admin.name || 'admin'}`
            : `Security deposit marked NOT paid by ${req.admin.name || 'admin'}`;
          existingLedger.processedAt = new Date();
          await existingLedger.save();
        }
      }
    } catch (ledgerErr) {
      console.error('Security deposit ledger update error:', ledgerErr.message);
    }
    if (isPaid && depAmt > 0) {
      try {
        const existingLedger = await Withdrawal.findOne({
          seller: seller._id,
          depositRef: 'INITIAL_SECURITY_DEPOSIT',
        });
        if (!existingLedger) {
          await Withdrawal.create({
            seller: seller._id,
            storeName: seller.storeName,
            type: 'adjustment',
            amount: depAmt,
            approvedAmount: depAmt,
            status: 'approved',
            depositRef: 'INITIAL_SECURITY_DEPOSIT',
            depositNote: `🛡️ Verified Registration Security Deposit (${finalReferral ? `Referral: ${finalReferral}` : 'Merchant Guarantee Collateral'})`,
            isManualAdjustment: true,
            balanceAfter: seller.wallet.balance || 0,
            processedAt: new Date(),
            processedBy: req.admin.name || 'Platform Administrator',
          });
        }
      } catch (ledgerErr) {
        console.error('Security deposit ledger creation error:', ledgerErr.message);
      }
    }

    // Auto-send welcome chat announcement — only the FIRST time (pressing Approve again on an
    // approved seller, e.g. after a timeout, must not send the welcome message again)
    if (!wasApproved) try {
      let conv = await Conversation.findOne({ seller: seller._id });
      if (!conv) {
        conv = await Conversation.create({
          seller: seller._id,
          storeName: seller.storeName,
          sellerName: seller.ownerName,
          sellerEmail: seller.email,
          subject: 'Merchant Account Verified & Approved',
          status: 'open',
          lastAt: new Date(),
        });
      }

      const welcomeMsg =
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🎉 MERCHANT ACCOUNT APPROVED & ACTIVATED!\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Store: ${seller.storeName}\n` +
        `Owner: ${seller.ownerName}\n` +
        (isPaid ? `Security Deposit: $${depAmt.toLocaleString('en-US')} (Verified & Active in Wallet)\n` : `Onboarding: Referral Approved (${finalReferral || 'Master Referral'})\n`) +
        `Commission Rate: ${seller.commissionRate}%\n` +
        `Status: ACTIVE & FULLY VERIFIED\n\n` +
        `Welcome to Bazario Merchant Central! You can now add products and fulfill customer orders.\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━`;

      const msg = await Message.create({
        conversation: conv._id,
        seller: seller._id,
        sender: 'admin',
        senderName: req.admin.name || 'Platform Verification Team',
        text: welcomeMsg,
      });

      conv.lastMessage = `🎉 Account Approved & Activated!`;
      conv.lastSender = 'admin';
      conv.lastAt = new Date();
      conv.unreadForSeller = 1;
      await conv.save();

      const io = req.app.get('io');
      if (io) {
        io.to(`seller:${seller._id}`).emit('message:new', msg);
        io.to(`seller:${seller._id}`).emit('seller:status_update', { seller: lightSeller(seller) });
        io.to(`seller:${seller._id}`).emit('wallet:update', { wallet: seller.wallet, sellerId: seller._id });
      }
    } catch (chatErr) {
      console.error('Approval chat error:', chatErr.message);
    }

    if (!wasApproved) notify(req.app, {
      recipientType: 'seller',
      sellerId: seller._id,
      type: 'approval',
      title: '🎉 Merchant Account Approved!',
      body: `Your store ${seller.storeName} is now active. You can start listing products and fulfilling orders.`,
      link: '/seller',
    });

    audit(req, 'approve', 'seller_registration', seller._id, `Approved seller ${seller.storeName} (Security Deposit: $${depAmt}, Referral: ${finalReferral || 'None'})`);
    await finLog(req, {
      action: wasApproved ? 'seller.updated' : 'seller.approved',
      summary: `${wasApproved ? 'Saved the approval details of' : 'Approved'} seller “${seller.storeName}” as a ${seller.isTestAccount ? 'TEST' : 'client'} account${seller.isPreviousStoreSeller ? ' (previous store)' : ''}${ownerMember && !approvalNotices.some((n) => n.startsWith('The owner')) ? `, owner ${ownerMember.name}` : ''}, security deposit $${depAmt}`,
      entity: 'seller',
      entityId: seller._id,
      sellerId: seller._id,
      storeName: seller.storeName,
      before: typeBefore,
      after: { isTestAccount: Boolean(seller.isTestAccount), isPreviousStoreSeller: Boolean(seller.isPreviousStoreSeller), securityDeposit: depAmt, securityDepositPaid: isPaid },
    });

    const safe = lightSeller(seller);
    res.json({
      message: `Seller ${seller.storeName} approved and activated successfully! ✅${approvalNotices.length ? ` ${approvalNotices.join(' ')}` : ''}`,
      pendingApproval: approvalNotices.length > 0,
      seller: safe,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/:id/reject (Admin rejects a pending seller registration)
router.post('/:id/reject', authAdmin('sellers'), oneDecisionAtATime, async (req, res) => {
  try {
    const { reason, isTestAccount, accountType } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) return res.status(404).json({ message: 'Seller not found' });
    const seller = await Seller.findById(req.params.id).select(SELLER_LIST_SELECT);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    // Only a registration is rejected here. An approved store (or one with money history) is
    // restricted on the Complaints page; rejecting it used to lock it out and hide it from there.
    const wasApproved = await isApprovedSeller(seller);
    if (wasApproved) {
      return res.status(400).json({ message: 'This store is already approved (or has wallet history). Use the Complaints page to freeze or suspend it.' });
    }

    seller.status = 'suspended';
    seller.registrationRejectedAt = new Date();
    seller.freezeReason = reason || 'KYC verification or document review rejected by platform administrator.';

    if (!wasApproved) {
      if (isTestAccount !== undefined) {
        seller.isTestAccount = Boolean(isTestAccount);
        seller.accountType = seller.isTestAccount ? 'test' : 'client';
      } else if (accountType !== undefined) {
        seller.accountType = accountType === 'test' ? 'test' : 'client';
        seller.isTestAccount = seller.accountType === 'test';
      }
    }

    await seller.save();

    audit(req, 'reject', 'seller_registration', seller._id, `Rejected registration for ${seller.storeName}. Reason: ${reason}`);

    res.json({ message: `Registration for ${seller.storeName} rejected.`, seller: lightSeller(seller) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/sellers/:id/toggle-test (Quick toggle Test Account vs Client Account)
router.patch('/:id/toggle-test', authAdmin('sellers'), async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    if (await isApprovedSeller(seller)) {
      const asked = await askSellerFlagChange(req, seller, 'isTestAccount', !seller.isTestAccount);
      return res.json({ ok: true, pendingApproval: true, message: asked.message, seller: lightSeller(seller) });
    }

    seller.isTestAccount = !seller.isTestAccount;
    seller.accountType = seller.isTestAccount ? 'test' : 'client';
    await seller.save();

    audit(req, 'update', 'seller', seller._id, `Toggled account type to ${seller.accountType} (${seller.isTestAccount ? 'Test' : 'Client'}) for ${seller.storeName}`);
    await finLog(req, {
      action: 'seller.type_set',
      summary: `Set seller “${seller.storeName}” (still waiting for registration approval) to a ${seller.isTestAccount ? 'TEST' : 'client'} account`,
      entity: 'seller',
      entityId: seller._id,
      sellerId: seller._id,
      storeName: seller.storeName,
      after: { isTestAccount: Boolean(seller.isTestAccount) },
    });

    const safe = lightSeller(seller);

    const io = req.app.get('io');
    if (io) {
      io.to(adminRoom('sellers')).emit('seller:status_update', { seller: safe });
    }

    res.json({
      ok: true,
      message: `Store "${seller.storeName}" is now set to ${seller.isTestAccount ? '🧪 TEST ACCOUNT' : '👤 CLIENT ACCOUNT'}.`,
      seller: safe,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/sellers/:id/toggle-previous-store (Quick toggle Previous Store Seller)
router.patch('/:id/toggle-previous-store', authAdmin('sellers'), async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    if (await isApprovedSeller(seller)) {
      const asked = await askSellerFlagChange(req, seller, 'isPreviousStoreSeller', !seller.isPreviousStoreSeller);
      return res.json({ ok: true, pendingApproval: true, message: asked.message, seller: lightSeller(seller) });
    }

    seller.isPreviousStoreSeller = !seller.isPreviousStoreSeller;
    await seller.save();

    audit(req, 'update', 'seller', seller._id, `Toggled previous store seller status to ${seller.isPreviousStoreSeller} for ${seller.storeName}`);
    await finLog(req, {
      action: 'seller.type_set',
      summary: `Set seller “${seller.storeName}” (still waiting for registration approval) to a ${seller.isPreviousStoreSeller ? 'PREVIOUS-STORE' : 'current-store'} seller`,
      entity: 'seller',
      entityId: seller._id,
      sellerId: seller._id,
      storeName: seller.storeName,
      after: { isPreviousStoreSeller: Boolean(seller.isPreviousStoreSeller) },
    });

    const safe = lightSeller(seller);

    const io = req.app.get('io');
    if (io) {
      io.to(adminRoom('sellers')).emit('seller:status_update', { seller: safe });
    }

    res.json({
      ok: true,
      message: `Store "${seller.storeName}" is now ${seller.isPreviousStoreSeller ? 'labeled as 🏛️ PREVIOUS STORE SELLER' : 'set to ✨ CURRENT STORE SELLER'}.`,
      seller: safe,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/:id/targets (Admin assigns a target & bonus to a seller)
router.post('/:id/targets', authAdmin('sellers'), async (req, res) => {
  try {
    const { title, targetOrders, targetOrderCount, bonusAmount, durationDays, adminNote, description } = req.body || {};
    const rawOrders = Number(targetOrders || targetOrderCount || 0);
    // whole orders only (8.5 used to become 8 without a word)
    if (!Number.isInteger(rawOrders)) return res.status(400).json({ message: 'Target orders must be a whole number (e.g. 8 or 10)' });
    const finalOrderCount = rawOrders;
    const finalBonus = Math.round(Number(bonusAmount || 0) * 100) / 100;
    const days = durationDays === null || durationDays === undefined || durationDays === '' ? 0 : Number(durationDays);

    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ message: 'Target milestone title is required' });
    }
    if (!Number.isFinite(finalOrderCount) || finalOrderCount < 1) {
      return res.status(400).json({ message: 'Target orders must be a whole number of at least 1' });
    }
    if (!Number.isFinite(finalBonus) || finalBonus <= 0) {
      return res.status(400).json({ message: 'Bonus amount must be more than 0' });
    }
    // the title must not promise another number of orders than the goal (a seller was sent
    // "Process 10 Orders Milestone" with the goal "Deliver 8 Orders")
    const namedOrders = [...String(title || '').matchAll(/(\d+)\s*(?:delivered\s+)?orders?\b/gi)].map((m) => Number(m[1]));
    if (namedOrders.length && !namedOrders.includes(finalOrderCount)) {
      return res.status(400).json({ message: `The title mentions ${namedOrders.join(', ')} orders but the goal is ${finalOrderCount} delivered orders. Make them match.` });
    }
    if (!Number.isFinite(days) || days < 0) {
      return res.status(400).json({ message: 'Duration must be a positive number of days (or empty for no expiry)' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Seller not found' });

    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });
    if (seller.status === 'pending_approval') {
      return res.status(400).json({ message: 'This seller is not approved yet. Approve the application before assigning a target.' });
    }

    seller.targets = seller.targets || [];
    const expiresAt = days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;

    const note = String(description || adminNote || '').trim().slice(0, 500);
    const newTarget = {
      title: title.trim().slice(0, 120),
      targetOrders: finalOrderCount,
      currentOrders: 0,
      bonusAmount: finalBonus,
      status: 'active',
      createdAt: new Date(),
      expiresAt,
      adminNote: note,
    };

    seller.targets.unshift(newTarget);
    seller.markModified('targets');
    await seller.save();

    // Auto-send chat notice
    try {
      let conv = await Conversation.findOne({ seller: seller._id });
      if (!conv) {
        conv = await Conversation.create({
          seller: seller._id,
          storeName: seller.storeName,
          sellerName: seller.ownerName,
          sellerEmail: seller.email,
          subject: 'Store Milestone & Bonus Target',
          status: 'open',
          lastAt: new Date(),
        });
      }

      const msgText =
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🎯 NEW PERFORMANCE TARGET & BONUS UNLOCKED!\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Target: ${newTarget.title}\n` +
        `Goal: Process & Deliver ${newTarget.targetOrders} Orders\n` +
        `Bonus Reward: $${newTarget.bonusAmount.toLocaleString('en-US')} Cash Bonus\n` +
        (expiresAt ? `Valid Until: ${expiresAt.toLocaleDateString('en-IN')}\n` : 'Duration: No Expiry\n') +
        (newTarget.adminNote ? `Note: ${newTarget.adminNote}\n` : '') +
        `Complete the target orders to receive an instant cash bonus credited directly to your wallet!\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━`;

      const msg = await Message.create({
        conversation: conv._id,
        seller: seller._id,
        sender: 'admin',
        senderName: req.admin.name || 'Platform Growth Desk',
        text: msgText,
      });

      conv.lastMessage = `🎯 New Target: Process ${newTarget.targetOrders} Orders for $${newTarget.bonusAmount} Bonus`;
      conv.lastSender = 'admin';
      conv.lastAt = new Date();
      conv.unreadForSeller = (conv.unreadForSeller || 0) + 1;
      await conv.save();

      req.app.get('io')?.to(`seller:${seller._id}`).emit('message:new', msg);
      req.app.get('io')?.to(`seller:${seller._id}`).emit('seller:targets_update', { targets: seller.targets });
    } catch (chatErr) {
      console.error('Target chat error:', chatErr.message);
    }

    notify(req.app, {
      recipientType: 'seller',
      sellerId: seller._id,
      type: 'approval',
      title: `🎯 New Sales Target: Earn $${newTarget.bonusAmount} Bonus!`,
      body: `Deliver ${newTarget.targetOrders} orders to unlock $${newTarget.bonusAmount} in bonus wallet credits.`,
      link: '/seller',
    });

    audit(req, 'create', 'seller_target', seller._id, `Assigned target "${title}" (${finalOrderCount} orders -> $${finalBonus} bonus) for ${seller.storeName}`);

    res.status(201).json({ message: `Target assigned to ${seller.storeName} successfully! 🎯`, targets: seller.targets });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sellers/targets/all (Admin lists all active targets across sellers)
router.get('/targets/all', authAdmin('sellers'), async (req, res) => {
  try {
    const sellers = await Seller.find({ 'targets.0': { $exists: true } })
      .select('storeName ownerName email status isTestAccount targets')
      .lean();

    const now = Date.now();
    const allTargets = [];
    sellers.forEach((s) => {
      (s.targets || []).forEach((t) => {
        const target = t.targetOrders || 0;
        const current = t.currentOrders || 0;
        // an active target past its deadline is shown as expired (it is closed for good on the next delivery)
        let status = t.status || 'active';
        if (status === 'active' && t.expiresAt && new Date(t.expiresAt).getTime() < now) status = 'expired';
        allTargets.push({
          _id: t._id,
          targetId: t._id,
          sellerId: s._id,
          storeName: s.storeName,
          ownerName: s.ownerName,
          email: s.email,
          sellerStatus: s.status,
          isTestAccount: Boolean(s.isTestAccount),
          title: t.title,
          targetOrders: target,
          currentOrders: current,
          bonusAmount: t.bonusAmount || 0,
          status,
          createdAt: t.createdAt,
          expiresAt: t.expiresAt,
          completedAt: t.completedAt,
          adminNote: t.adminNote || '',
          description: t.adminNote || '',
        });
      });
    });
    allTargets.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    res.json({ targets: allTargets });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/sellers/:id/targets/:targetId (Admin removes a target)
router.delete('/:id/targets/:targetId', authAdmin('sellers'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Seller not found' });
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const removed = (seller.targets || []).find((t) => t._id?.toString() === req.params.targetId);
    if (!removed) return res.status(404).json({ message: 'Target not found (it may already be removed)' });
    seller.targets = (seller.targets || []).filter((t) => t._id?.toString() !== req.params.targetId);
    seller.markModified('targets');
    await seller.save();
    audit(req, 'delete', 'seller_target', seller._id, `Removed target "${removed.title}" (${removed.currentOrders || 0}/${removed.targetOrders} orders, status ${removed.status}) from ${seller.storeName}`);

    req.app.get('io')?.to(`seller:${seller._id}`).emit('seller:targets_update', { targets: seller.targets });
    res.json({ message: 'Target removed successfully', targets: seller.targets });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/sellers/:id (Admin deletes a seller)
router.delete('/:id', authAdmin('sellers'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return next();
    }
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const storeName = seller.storeName;
    const email = seller.email;

    // A seller that has approved deposits or withdrawals is part of the accounts: deleting it
    // would also delete those records. It can be suspended instead; the history stays.
    const history = await sellerMoneyHistory(seller._id);
    if (!history || history.deposits > 0 || history.withdrawals > 0) {
      await finLog(req, {
        action: 'seller.delete_blocked',
        summary: `Tried to delete seller “${storeName}”, refused because it has wallet history`,
        entity: 'seller',
        entityId: seller._id,
        sellerId: seller._id,
        storeName,
        before: history,
      });
      return res.status(400).json({
        message: history
          ? `“${storeName}” has ${history.deposits} approved deposit(s) and ${history.withdrawals} withdrawal(s). A seller with wallet history cannot be deleted, because its records are part of the accounts. Suspend the account instead.`
          : 'Could not check this seller’s wallet history. Please try again.',
      });
    }

    await Seller.findByIdAndDelete(req.params.id);

    // Also remove or clean up products, transactions, and chat conversations associated with deleted seller
    await Product.deleteMany({ seller: req.params.id }).catch(() => {});
    await Withdrawal.deleteMany({ seller: req.params.id }).catch(() => {});
    await Conversation.deleteMany({ seller: req.params.id }).catch(() => {});

    audit(req, 'delete', 'seller', req.params.id, `Deleted seller: ${storeName} (${email})`);
    await finLog(req, {
      action: 'seller.deleted',
      summary: `Deleted seller “${storeName}” (${email}). It had no approved deposits or withdrawals.`,
      entity: 'seller',
      entityId: req.params.id,
      sellerId: req.params.id,
      storeName,
      before: {
        email,
        status: seller.status,
        isTestAccount: Boolean(seller.isTestAccount),
        isPreviousStoreSeller: Boolean(seller.isPreviousStoreSeller),
        walletBalance: seller.wallet?.balance || 0,
        totalDeposited: seller.wallet?.totalDeposited || 0,
      },
    });

    const io = req.app.get('io');
    if (io) {
      io.to(adminRoom('sellers')).emit('seller:deleted', { sellerId: req.params.id, storeName });
    }

    res.json({ ok: true, message: `Seller "${storeName}" and all associated records deleted successfully.` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;


