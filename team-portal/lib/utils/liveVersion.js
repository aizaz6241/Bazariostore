import crypto from 'crypto';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import Member from '@/lib/models/Member';
import SellerAssignment from '@/lib/models/SellerAssignment';
import FinanceSplit from '@/lib/models/FinanceSplit';
import WalletTransaction from '@/lib/models/WalletTransaction';
import RewardClaim from '@/lib/models/RewardClaim';

/**
 * LIVE VERSION — a cheap fingerprint of everything the money screens are built from.
 *
 * The seller website (admin panel on Render) and this portal (Vercel) are two separate apps that
 * share one database. When an admin approves a deposit, adds funds directly or adjusts a wallet
 * over there, nothing tells this app. So instead of trusting a timer, we ask the database a few
 * tiny "count / sum / latest change" questions and hash the answers:
 *
 *   full   -> changes when ANY input of the finance ledger changes (used to decide whether the
 *             cached ledger is still correct)
 *   stable -> the same, minus the collection the ledger itself writes to while it is being built
 *             (locked splits), so building the ledger never looks like "new data"
 *
 * The answers are remembered for a moment per server instance, so many open tabs asking at the
 * same time cost one database round trip.
 */

const MEMO_MS = 1500;

function store() {
  if (!global.__liveVersion) global.__liveVersion = { at: 0, value: null, pending: null };
  return global.__liveVersion;
}

export function forgetLiveVersion() {
  const s = store();
  s.at = 0;
  s.value = null;
}

export const hashOf = (value) => crypto.createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 16);

const stamp = (d) => (d ? new Date(d).getTime() : 0);
const n2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
// Group rows come back in no fixed order: sort them so the same data always gives the same hash.
const ordered = (rows) => rows.map((r) => JSON.stringify(r)).sort();

async function readParts() {
  await connectDB();
  const db = mongoose.connection.db;

  const [withdrawals, sellers, splits, payouts, claims, assignments, members, approvals, logs] = await Promise.all([
    // Seller deposits / withdrawals: status changes, direct "add funds", adjustments, edited amounts
    db
      .collection('withdrawals')
      .aggregate([
        { $match: { type: { $in: ['deposit', 'withdrawal'] } } },
        {
          $group: {
            _id: { type: '$type', status: '$status', skip: '$finSkip' },
            n: { $sum: 1 },
            amount: { $sum: '$amount' },
            approved: { $sum: '$approvedAmount' },
            helping: { $sum: '$helpingAmount' },
            usdt: { $sum: '$usdtAmount' },
            inr: { $sum: '$inrAmount' },
            pkr: { $sum: '$pkrRate' },
            updated: { $max: '$updatedAt' },
            edited: { $max: '$finEditedAt' },
          },
        },
      ])
      .toArray(),
    // Store wallets (what sellers hold / are waiting to withdraw) and which stores count
    db
      .collection('sellers')
      .aggregate([
        {
          $group: {
            _id: { test: '$isTestAccount', type: '$accountType', previous: '$isPreviousStoreSeller' },
            n: { $sum: 1 },
            balance: { $sum: '$wallet.balance' },
            pendingDeposit: { $sum: '$wallet.pendingDeposit' },
            pendingWithdrawal: { $sum: '$wallet.pendingWithdrawal' },
            deposited: { $sum: '$wallet.totalDeposited' },
            withdrawn: { $sum: '$wallet.totalWithdrawn' },
          },
        },
      ])
      .toArray(),
    FinanceSplit.collection
      .aggregate([{ $group: { _id: '$manual', n: { $sum: 1 }, usdt: { $sum: '$usdt' }, updated: { $max: '$updatedAt' } } }])
      .toArray(),
    WalletTransaction.collection
      .aggregate([{ $group: { _id: '$type', n: { $sum: 1 }, amount: { $sum: '$amount' }, updated: { $max: '$updatedAt' } } }])
      .toArray(),
    RewardClaim.collection
      .aggregate([
        {
          $group: {
            _id: { status: '$status', skip: '$finSkip' },
            n: { $sum: 1 },
            pkr: { $sum: '$amountPKR' },
            rate: { $sum: '$finPkrRate' },
            updated: { $max: '$updatedAt' },
            edited: { $max: '$finEditedAt' },
          },
        },
      ])
      .toArray(),
    SellerAssignment.collection
      .aggregate([{ $group: { _id: '$status', n: { $sum: 1 }, updated: { $max: '$updatedAt' } } }])
      .toArray(),
    // Not `updatedAt` here: the ledger writes wallet numbers onto members, and a login touches them too.
    Member.find({}).select('name role active commissionLabel').lean(),
    // Two-person approvals (asked / approved / rejected) and the activity log, so the Finance
    // screen of the other partner shows a new request without a reload
    db
      .collection('portalfinanceapprovals')
      .aggregate([{ $group: { _id: '$status', n: { $sum: 1 }, updated: { $max: '$updatedAt' } } }])
      .toArray(),
    db
      .collection('portalfinancelogs')
      .aggregate([{ $group: { _id: null, n: { $sum: 1 }, last: { $max: '$at' } } }])
      .toArray(),
  ]);

  const stableParts = {
    withdrawals: ordered(
      withdrawals.map((r) => [
        r._id?.type || '',
        r._id?.status || '',
        r._id?.skip === true,
        r.n,
        n2(r.amount),
        n2(r.approved),
        n2(r.helping),
        Math.round((Number(r.usdt) || 0) * 1e6),
        n2(r.inr),
        n2(r.pkr),
        stamp(r.updated),
        stamp(r.edited),
      ])
    ),
    sellers: ordered(
      sellers.map((r) => [
        r._id?.test === true,
        r._id?.type || '',
        r._id?.previous === true,
        r.n,
        n2(r.balance),
        n2(r.pendingDeposit),
        n2(r.pendingWithdrawal),
        n2(r.deposited),
        n2(r.withdrawn),
      ])
    ),
    payouts: ordered(payouts.map((r) => [r._id || '', r.n, n2(r.amount), stamp(r.updated)])),
    claims: ordered(
      claims.map((r) => [r._id?.status || '', r._id?.skip === true, r.n, n2(r.pkr), n2(r.rate), stamp(r.updated), stamp(r.edited)])
    ),
    assignments: ordered(assignments.map((r) => [r._id || '', r.n, stamp(r.updated)])),
    members: members
      .map((m) => `${m._id}:${m.role}:${m.active !== false}:${m.commissionLabel || ''}:${m.name || ''}`)
      .sort(),
    approvals: ordered(approvals.map((r) => [r._id || '', r.n, stamp(r.updated)])),
    logs: logs.map((r) => [r.n, stamp(r.last)]),
  };

  const splitParts = ordered(splits.map((r) => [r._id === true, r.n, Math.round((Number(r.usdt) || 0) * 1e6), stamp(r.updated)]));

  const stable = hashOf(stableParts);
  return { stable, full: hashOf([stable, splitParts]) };
}

/**
 * @returns {Promise<{ full: string, stable: string }>}
 */
export async function getLiveVersion({ force = false } = {}) {
  const s = store();
  if (!force && s.value && Date.now() - s.at < MEMO_MS) return s.value;
  if (!force && s.pending) return s.pending;

  const run = readParts()
    .then((value) => {
      s.value = value;
      s.at = Date.now();
      return value;
    })
    .finally(() => {
      if (s.pending === run) s.pending = null;
    });
  s.pending = run;
  return run;
}
