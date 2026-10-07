import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import PaymentProof from '@/lib/models/PaymentProof';
import { buildLedger } from '@/lib/utils/finance';
import { submitAction } from '@/lib/utils/approvals';
import { logFinance, flushFinanceAlertsSoon } from '@/lib/utils/financeLog';
import { storeChatPicture, deleteChatPictures } from '@/lib/utils/chatMedia';

/**
 * PAYMENT PROOFS (see lib/models/PaymentProof.js).
 *
 * Nothing here changes how money is counted. The finance ledger stays the only place that
 * decides what a deposit is; this file only keeps one proof card next to each ledger deposit:
 *   - syncPaymentProofs(): makes the missing draft cards (and tells the partners)
 *   - completeProof():     a partner adds the real USDT + the INR screenshot
 *
 * The one link to the ledger: when the deposit's real USDT has not been entered yet, completing
 * the proof enters it, through exactly the same step the Finance screen uses for a first entry.
 */

// Proofs are asked for deposits from this moment on (older ones would only be a pile of drafts).
export const PROOFS_START = new Date(process.env.PAYMENT_PROOFS_START_DATE || '2026-10-06T19:00:00.000Z'); // 7 Oct 2026, 00:00 PKT
export const PROOFS_URL = '/chat?chatType=proofs';

const MAX_INLINE_SHOT = 1_600_000; // characters of a screenshot kept in the database (storage unavailable)

const sid = (v) => (v ? String(v) : '');
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n) => Math.round(num(n) * 100) / 100;
const r6 = (n) => Math.round(num(n) * 1e6) / 1e6;
const fmt = (n) => num(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The ledger deposits that should each have a proof card: id -> { counted, ...deposit } */
export function proofDeposits(ledger) {
  const map = new Map();
  const add = (e, counted) => {
    if (e.kind !== 'deposit') return;
    if (!mongoose.Types.ObjectId.isValid(e.id)) return;
    if (new Date(e.date) < PROOFS_START) return;
    // real money only: a credit that is entirely "helping amount" brought nothing to Binance
    const realPart = num(e.walletAmount) - num(e.helping);
    if (!(num(e.usdt) > 0) && !(realPart > 0.004) && !e.manual) return;
    map.set(e.id, { ...e, counted });
  };
  (ledger.entries || []).forEach((e) => add(e, true));
  (ledger.pending || []).forEach((e) => add(e, false));
  return map;
}

function syncState() {
  if (!global.__paymentProofSync) global.__paymentProofSync = { sig: '', running: null };
  return global.__paymentProofSync;
}

/**
 * Keep one card per deposit. Cheap when nothing changed (remembers the ledger it last handled).
 * Never throws: a problem here must not disturb the screen that triggered it.
 */
export async function syncPaymentProofs(ledger, { force = false } = {}) {
  const state = syncState();
  if (!ledger) return;
  if (!force && ledger.sig && state.sig === ledger.sig) return;
  if (state.running) return state.running;

  state.running = (async () => {
    try {
      await connectDB();
      const deposits = proofDeposits(ledger);
      const existing = await PaymentProof.find({}).select('sourceId status storeName ownerId ownerName').lean();
      const byId = new Map(existing.map((p) => [sid(p.sourceId), p]));
      const created = [];

      for (const [id, e] of deposits) {
        const fields = {
          sellerId: mongoose.Types.ObjectId.isValid(e.sellerId) ? e.sellerId : null,
          storeName: e.storeName || 'Store',
          ownerId: e.owner ? sid(e.owner.id) : '',
          ownerName: e.owner ? e.owner.name || '' : '',
          ownerRole: e.owner ? (e.owner.role === 'admin' ? 'partner' : 'member') : '',
          depositAt: new Date(e.date),
          walletAmount: r2(e.walletAmount),
          helping: r2(e.helping),
        };
        const have = byId.get(id);
        if (!have) {
          // unique on sourceId: if two servers get here together, only one really inserts
          const res = await PaymentProof.updateOne(
            { sourceId: id },
            { $setOnInsert: { ...fields, sourceId: id, status: 'draft', inr: r2(e.inr), usdt: 0 } },
            { upsert: true }
          );
          if (res.upsertedCount > 0) created.push({ id, ...fields });
        } else if (have.status === 'cancelled') {
          // the deposit is back in the ledger (e.g. "no real money" was undone)
          await PaymentProof.updateOne({ sourceId: id, status: 'cancelled' }, { $set: { ...fields, status: 'draft' } });
        } else if (have.status === 'draft' && (have.storeName !== fields.storeName || sid(have.ownerId) !== fields.ownerId || have.ownerName !== fields.ownerName)) {
          // still a draft: follow the deposit (seller moved to the correct store / owner assigned)
          await PaymentProof.updateOne({ sourceId: id, status: 'draft' }, { $set: fields });
        }
      }

      // A draft whose deposit left the ledger (marked "no real money", test account, reversed)
      const gone = existing.filter((p) => p.status === 'draft' && !deposits.has(sid(p.sourceId))).map((p) => p._id);
      if (gone.length) await PaymentProof.updateMany({ _id: { $in: gone }, status: 'draft' }, { $set: { status: 'cancelled' } });

      if (created.length) await announceDrafts(created);
      state.sig = ledger.sig || '';
    } catch (e) {
      console.error('[payment-proofs] sync failed:', e.message);
    } finally {
      state.running = null;
    }
  })();
  return state.running;
}

async function announceDrafts(created) {
  try {
    const { sendPushToRole } = await import('@/lib/utils/push');
    const one = created.length === 1 ? created[0] : null;
    await sendPushToRole('admin', {
      title: one ? `🧾 Payment proof needed: ${one.storeName}` : `🧾 ${created.length} payment proofs needed`,
      body: one
        ? `${one.ownerName ? `${one.ownerName} · ` : ''}deposit of $${fmt(one.walletAmount)}. Add the real USDT, its Binance screenshot and the INR screenshot.`
        : `${created.map((c) => c.storeName).slice(0, 4).join(', ')}${created.length > 4 ? '…' : ''}. Add the real USDT, its Binance screenshot and the INR screenshot.`,
      url: PROOFS_URL,
      type: 'finance',
      sound: '/sounds/cash.wav',
      tag: `proof-${one ? one.id : Date.now()}`,
    });
  } catch (e) {
    console.error('[payment-proofs] alert failed:', e.message);
  }
}

// What the bytes of the picture really are (never what the browser claims)
function isRealImage(dataUrl) {
  const m = typeof dataUrl === 'string' ? dataUrl.match(/^data:image\/[a-z0-9.+-]+(?:;[^;,]+)*;base64,/i) : null;
  if (!m) return false;
  const b = Buffer.from(dataUrl.slice(m[0].length, m[0].length + 64), 'base64');
  if (b.length < 12) return false;
  const ascii = (from, to) => b.subarray(from, to).toString('latin1');
  return (
    (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
    (b[0] === 0x89 && ascii(1, 4) === 'PNG') ||
    (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP')
  );
}

const shotLabel = (s) => s?.url || (s?.data ? '(in database)' : '');

function shape(p, dep) {
  const hasShot = !!(p.screenshot?.url || p.screenshot?.data);
  const hasUsdtShot = !!(p.usdtScreenshot?.url || p.usdtScreenshot?.data);
  const v = new Date(p.updatedAt || 0).getTime();
  return {
    _id: sid(p._id),
    sourceId: sid(p.sourceId),
    storeName: p.storeName,
    ownerName: p.ownerName,
    ownerRole: p.ownerRole,
    depositAt: p.depositAt,
    walletAmount: p.walletAmount,
    helping: p.helping,
    status: p.status,
    usdt: p.usdt,
    inr: p.inr,
    note: p.note || '',
    // a screenshot on the file storage is a link; one kept in the database is served by the portal
    screenshot: p.screenshot?.url || (p.screenshot?.data ? `/api/proofs/${sid(p._id)}/shot?v=${new Date(p.updatedAt || 0).getTime()}` : ''),
    hasScreenshot: hasShot,
    // the Binance screenshot of the USDT received
    usdtScreenshot: p.usdtScreenshot?.url || (p.usdtScreenshot?.data ? `/api/proofs/${sid(p._id)}/shot?kind=usdt&v=${v}` : ''),
    hasUsdtScreenshot: hasUsdtShot,
    completedBy: p.completedBy?.name || '',
    completedAt: p.completedAt,
    changes: Math.max(0, (p.history || []).length - 1),
    // what the finance ledger says about this deposit right now
    ledger: dep
      ? { counted: dep.counted, usdt: num(dep.usdt), inr: num(dep.inr), reason: dep.reason || '' }
      : { counted: false, usdt: 0, inr: 0, reason: 'gone' },
  };
}

/** Cards for the group, newest deposit first. */
export async function listProofs({ status = 'all', limit = 60, before = null } = {}) {
  await connectDB();
  const ledger = await buildLedger();
  await syncPaymentProofs(ledger);
  const deposits = proofDeposits(ledger);

  const filter = { status: status === 'draft' || status === 'complete' ? status : { $in: ['draft', 'complete'] } };
  const beforeDate = before ? new Date(before) : null;
  if (beforeDate && !isNaN(beforeDate.getTime())) filter.depositAt = { $lt: beforeDate };
  const size = Math.min(Math.max(parseInt(limit, 10) || 60, 1), 200);

  const [rows, draft, complete] = await Promise.all([
    PaymentProof.find(filter).select('-screenshot.data -usdtScreenshot.data -history.note').sort({ depositAt: -1 }).limit(size + 1).lean(),
    PaymentProof.countDocuments({ status: 'draft' }),
    PaymentProof.countDocuments({ status: 'complete' }),
  ]);
  // (`-screenshot.data` hides the picture itself; whether one is kept in the database is asked separately)
  const inlineIds = async (field) =>
    new Set((await PaymentProof.find({ _id: { $in: rows.map((r) => r._id) }, [field]: { $nin: ['', null] } }).select('_id').lean()).map((r) => sid(r._id)));
  const [inline, inlineUsdt] = await Promise.all([inlineIds('screenshot.data'), inlineIds('usdtScreenshot.data')]);

  const hasMore = rows.length > size;
  return {
    counts: { draft, complete },
    hasMore,
    start: PROOFS_START,
    items: rows.slice(0, size).map((p) =>
      shape(
        {
          ...p,
          screenshot: { ...p.screenshot, data: inline.has(sid(p._id)) ? 'x' : '' },
          usdtScreenshot: { ...p.usdtScreenshot, data: inlineUsdt.has(sid(p._id)) ? 'x' : '' },
        },
        deposits.get(sid(p.sourceId))
      )
    ),
  };
}

export async function proofCounts() {
  await connectDB();
  const [draft, latest] = await Promise.all([
    PaymentProof.countDocuments({ status: 'draft' }),
    PaymentProof.findOne({ status: { $in: ['draft', 'complete'] } }).sort({ depositAt: -1 }).select('storeName status depositAt').lean(),
  ]);
  return { draft, latest: latest ? { storeName: latest.storeName, status: latest.status, depositAt: latest.depositAt } : null };
}

/**
 * A partner fills in (or corrects) a proof.
 *   first time:  real USDT (typed), its Binance screenshot and the INR screenshot are all required
 *   later:       either can be replaced; the earlier values stay in the card's history
 */
export async function completeProof({ session, id, usdtAmount, inrAmount, screenshot, usdtScreenshot, note }) {
  await connectDB();
  if (!id || !mongoose.Types.ObjectId.isValid(id)) throw new Error('Proof not found');
  const proof = await PaymentProof.findById(id);
  if (!proof || proof.status === 'cancelled') throw new Error('This proof is no longer needed (the deposit is not in the finance ledger)');

  const ledger = await buildLedger({ fresh: true });
  const dep = proofDeposits(ledger).get(sid(proof.sourceId));
  if (!dep) throw new Error('This deposit is no longer in the finance ledger');

  const first = proof.status !== 'complete';
  const hadShot = !!(proof.screenshot?.url || proof.screenshot?.data);
  const hasNewShot = typeof screenshot === 'string' && screenshot.length > 0;

  // ── the INR payment screenshot ──
  if (!hasNewShot && !hadShot) throw new Error('Add the screenshot of the INR payment');
  if (hasNewShot && !isRealImage(screenshot)) throw new Error('The screenshot must be a picture (JPG, PNG or WEBP)');

  // ── the Binance screenshot of the USDT received ──
  const hadUsdtShot = !!(proof.usdtScreenshot?.url || proof.usdtScreenshot?.data);
  const hasNewUsdtShot = typeof usdtScreenshot === 'string' && usdtScreenshot.length > 0;
  if (!hasNewUsdtShot && !hadUsdtShot) throw new Error('Add the Binance screenshot of the USDT received');
  if (hasNewUsdtShot && !isRealImage(usdtScreenshot)) throw new Error('The Binance screenshot must be a picture (JPG, PNG or WEBP)');

  // ── the real USDT ──
  // Already counted in the finance ledger: the proof carries that same amount (changing a counted
  // amount is done on the Finance screen, with the other partner's approval).
  // Not entered yet: it must be given here, and it is entered into the ledger as well.
  let usdt;
  let inr;
  if (dep.counted) {
    usdt = r6(dep.usdt);
    inr = num(dep.inr);
  } else {
    usdt = r6(usdtAmount);
    if (!(usdt > 0)) throw new Error('Enter the real USDT received (greater than 0)');
    const givenInr = inrAmount === undefined || inrAmount === null || inrAmount === '' ? null : Number(inrAmount);
    if (givenInr !== null && (!Number.isFinite(givenInr) || givenInr < 0)) throw new Error('INR amount is not valid');
    inr = givenInr !== null ? givenInr : num(dep.inr);
  }

  // Save the pictures first (nothing else has changed yet if this fails)
  const keep = async (dataUrl) => {
    const stored = await storeChatPicture(dataUrl);
    if (stored) return { url: stored.url, key: stored.key, data: '' };
    if (dataUrl.length <= MAX_INLINE_SHOT) return { url: '', key: '', data: dataUrl };
    throw new Error('The screenshot is too large to save right now. Please try again in a moment.');
  };
  let shot = null;
  let usdtShot = null;
  const dropNew = async () => {
    const keys = [shot?.key, usdtShot?.key].filter(Boolean);
    if (keys.length) await deleteChatPictures(keys);
  };
  try {
    if (hasNewShot) shot = await keep(screenshot);
    if (hasNewUsdtShot) usdtShot = await keep(usdtScreenshot);
  } catch (e) {
    await dropNew();
    throw e;
  }

  // First entry of the real amount: the same step as "enter real USDT" on the Finance screen
  if (!dep.counted) {
    try {
      const payload = { id: sid(proof.sourceId), kind: 'deposit', usdtAmount: usdt };
      if (inr > 0) payload.inrAmount = inr;
      await submitAction({ session, action: 'set_usdt', payload, gated: false });
    } catch (e) {
      await dropNew();
      throw e;
    }
  }

  const by = { id: sid(session._id), name: session.name || session.username || '' };
  const before = first ? null : { usdt: proof.usdt, inr: proof.inr, screenshot: shotLabel(proof.screenshot), usdtScreenshot: shotLabel(proof.usdtScreenshot) };

  proof.status = 'complete';
  proof.usdt = usdt;
  proof.inr = inr;
  if (shot) proof.screenshot = shot;
  if (usdtShot) proof.usdtScreenshot = usdtShot;
  if (typeof note === 'string') proof.note = note.trim().slice(0, 300);
  if (first) {
    proof.completedBy = by;
    proof.completedAt = new Date();
  }
  proof.history.push({
    at: new Date(),
    by,
    action: first ? 'added' : 'changed',
    usdt,
    inr,
    screenshotUrl: shotLabel(proof.screenshot),
    usdtScreenshotUrl: shotLabel(proof.usdtScreenshot),
    note: proof.note || '',
  });
  await proof.save();

  await logFinance({
    session,
    action: first ? 'proof.added' : 'proof.changed',
    summary: `${first ? 'Added' : 'Changed'} the payment proof of ${proof.storeName}: ₮${fmt(usdt)}${inr > 0 ? ` for ₹${fmt(inr)}` : ''}`,
    entity: 'payment_proof',
    entityId: proof._id,
    sellerId: proof.sellerId,
    storeName: proof.storeName,
    before,
    after: { usdt, inr, screenshot: shotLabel(proof.screenshot), usdtScreenshot: shotLabel(proof.usdtScreenshot), depositId: sid(proof.sourceId) },
    meta: { url: PROOFS_URL },
  });
  await flushFinanceAlertsSoon();

  // the card as the screens show it (with the ledger as it is now)
  const fresh = await buildLedger({ fresh: !dep.counted });
  return shape(proof.toObject(), proofDeposits(fresh).get(sid(proof.sourceId)));
}

/** The screenshot of a proof that is kept in the database: { mime, bytes } or null */
export async function inlineShot(id, kind = 'inr') {
  await connectDB();
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
  const field = kind === 'usdt' ? 'usdtScreenshot' : 'screenshot';
  const p = await PaymentProof.findById(id).select(`${field}.data`).lean();
  const data = p?.[field]?.data || '';
  const m = data.match(/^data:(image\/[a-z0-9.+-]+)(?:;[^;,]+)*;base64,/i);
  if (!m) return null;
  return { mime: m[1], bytes: Buffer.from(data.slice(m[0].length), 'base64') };
}
