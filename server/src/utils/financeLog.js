import mongoose from 'mongoose';

/**
 * Finance activity log + two-person approval requests, written from the store admin panel.
 *
 * Both live in the team portal's collections (same database):
 *   portalfinancelogs       one line per action that touches money or who it belongs to (append-only)
 *   portalfinanceapprovals  sensitive changes waiting for the other partner
 *
 * The team portal shows them on its Finance screen, sends the alerts, and carries an approved
 * request out. Nothing here ever throws into the caller: a logging problem must not break the
 * action itself.
 */

const logsCol = () => mongoose.connection.db.collection('portalfinancelogs');
const approvalsCol = () => mongoose.connection.db.collection('portalfinanceapprovals');

// Same start as the team portal's ledger (lib/utils/finance.js): 1 October 2026, 00:00 India time.
export const FINANCE_START = new Date(process.env.FINANCE_START_DATE || '2026-09-30T18:30:00.000Z');

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function finActor(req) {
  const a = (req && req.admin) || {};
  return {
    memberId: '',
    adminId: a.id ? String(a.id) : '',
    name: a.name || 'Admin',
    email: a.email || '',
    role: a.role || '',
  };
}

/** Add one line to the finance activity log. */
export async function finLog(req, { action, summary = '', entity = '', entityId = '', sellerId = '', storeName = '', before = null, after = null, meta = null }) {
  try {
    const now = new Date();
    await logsCol().insertOne({
      at: now,
      source: 'admin-panel',
      actor: finActor(req),
      action,
      summary: String(summary || '').slice(0, 500),
      entity,
      entityId: entityId ? String(entityId) : '',
      sellerId: sellerId ? String(sellerId) : '',
      storeName: storeName || '',
      before,
      after,
      meta,
      pushed: false,
      createdAt: now,
    });
  } catch (e) {
    console.error('finance log failed:', e.message);
  }
}

/**
 * Store a sensitive change as a request for the other partner (it is applied by the team portal
 * when approved). One waiting request per action + target.
 * @returns {Promise<{ok:boolean, already:boolean, message:string}>}
 */
export async function requestApproval(req, { action, targetId, summary, details = [], payload = {}, logPayload = null, sellerId = '', storeName = '' }) {
  const target = String(targetId || '');
  const waiting = await approvalsCol().findOne({ action, targetId: target, status: { $in: ['pending', 'processing'] } });
  if (waiting) {
    return {
      ok: true,
      already: true,
      message: `This is already waiting for approval (asked by ${waiting.requestedBy?.name || 'someone'}). Open Finance on the team portal to see it.`,
    };
  }

  const now = new Date();
  const actor = finActor(req);
  const inserted = await approvalsCol().insertOne({
    action,
    targetId: target,
    summary,
    details,
    payload,
    payeeId: '',
    source: 'admin-panel',
    requestedBy: actor,
    status: 'pending',
    decidedBy: null,
    decidedAt: null,
    decisionNote: '',
    lastError: '',
    createdAt: now,
    updatedAt: now,
  });

  await finLog(req, {
    action: 'approval.requested',
    summary: `Asked for approval: ${summary}`,
    entity: 'approval',
    entityId: inserted.insertedId,
    sellerId,
    storeName,
    // `logPayload` lets a caller keep something out of the log (for example a password hash)
    after: { action, payload: logPayload || payload },
    meta: { needsApproval: true, approvalId: String(inserted.insertedId) },
  });

  return {
    ok: true,
    already: false,
    id: String(inserted.insertedId),
    message: 'Sent for approval. Nothing has changed yet: the other partner has to approve it on the team portal (Finance).',
  };
}

/**
 * Is this deposit / withdrawal counted in the team portal's USDT ledger right now?
 * (approved, after the finance start, real USDT entered, not marked "no real money", not one of
 * the old auto-filled 90-rate records)
 */
export function isLedgerCounted(doc) {
  if (!doc) return false;
  if (!['approved', 'completed'].includes(doc.status)) return false;
  if (doc.finSkip === true) return false;
  const when = new Date(doc.processedAt || doc.createdAt || 0);
  if (when < FINANCE_START) return false;
  if (!(num(doc.usdtAmount) > 0)) return false;
  if (doc.finConfirmed !== true && num(doc.binanceRate) === 90) {
    const gross = doc.approvedAmount !== null && doc.approvedAmount !== undefined ? num(doc.approvedAmount) : num(doc.amount);
    if (Math.abs(num(doc.inrAmount) - gross * 83.5) <= 1) return false;
  }
  return true;
}

/** Does this seller have approved deposits or withdrawals? (its history matters for the accounts) */
export async function sellerMoneyHistory(sellerId) {
  try {
    const col = mongoose.connection.db.collection('withdrawals');
    const rows = await col
      .find({ seller: new mongoose.Types.ObjectId(String(sellerId)), type: { $in: ['deposit', 'withdrawal'] }, status: { $in: ['approved', 'completed'] } })
      .project({ type: 1, amount: 1, approvedAmount: 1, usdtAmount: 1 })
      .toArray();
    const out = { deposits: 0, depositUSD: 0, withdrawals: 0, withdrawalUSD: 0, usdt: 0 };
    for (const r of rows) {
      const gross = r.approvedAmount !== null && r.approvedAmount !== undefined ? num(r.approvedAmount) : num(r.amount);
      if (r.type === 'deposit') {
        out.deposits += 1;
        out.depositUSD += gross;
      } else {
        out.withdrawals += 1;
        out.withdrawalUSD += gross;
      }
      out.usdt += num(r.usdtAmount);
    }
    return out;
  } catch (e) {
    console.error('seller money history failed:', e.message);
    return null;
  }
}
