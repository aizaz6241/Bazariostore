import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import Member from '@/lib/models/Member';
import SellerAssignment from '@/lib/models/SellerAssignment';
import FinanceSplit from '@/lib/models/FinanceSplit';
import { invalidateLedger, buildLedger } from '@/lib/utils/finance';

/**
 * FIXING A DEPOSIT THAT WAS ADDED TO THE WRONG SELLER
 *
 * An admin meant to add funds to store B but picked store A. Two things are then wrong:
 *   1. store wallets: A holds money that is not its own, B is missing it
 *   2. finance ledger: the Binance USDT was divided for A's owner instead of B's owner
 *
 * Two ways to put it right (both need the other partner's approval, see approvals.js):
 *   move    -> the SAME deposit record is handed to the correct seller: the amount leaves A's
 *              store wallet, enters B's, and the ledger divides it again for B's owner. Nothing is
 *              counted twice and the Binance total does not change.
 *   reverse -> the deposit should not exist at all (typed twice, no money came): the amount leaves
 *              the store wallet and the deposit is closed, so it leaves the ledger too.
 *
 * The money is only taken back while the wrong seller still has it in the available balance.
 * Each wallet step carries a name (`walletOps`, same idea as the store server) so a retry after an
 * interruption never takes or adds the amount twice.
 */

const EPS = 1e-6;
const sid = (v) => (v ? String(v) : '');
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (v) => Math.round(num(v) * 100) / 100;
const isId = (v) => !!v && mongoose.Types.ObjectId.isValid(String(v));
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const sellersCol = () => mongoose.connection.db.collection('sellers');
const withdrawalsCol = () => mongoose.connection.db.collection('withdrawals');

const SELLER_FIELDS = { storeName: 1, wallet: 1, walletOps: 1, isTestAccount: 1, accountType: 1 };
const isTest = (s) => !!s && (s.isTestAccount === true || s.accountType === 'test');

async function ownerOf(sellerId) {
  const a = await SellerAssignment.findOne({ sellerId, status: 'active' }).sort({ createdAt: -1 }).lean();
  if (!a) return null;
  const m = await Member.findById(a.memberId).select('name role commissionLabel').lean();
  if (!m) return null;
  return { id: sid(m._id), name: m.name, role: m.role, deal: m.commissionLabel || 'pkr_1to1' };
}

export function ownerWords(owner) {
  if (!owner) return 'nobody (not assigned)';
  if (owner.role === 'admin') return `${owner.name} (partner)`;
  return `${owner.name} (${owner.deal === 'inr_50' ? '50% member' : '1:1 PKR member'})`;
}

/**
 * Reads everything about a fix and refuses what cannot be done. Used when the request is made
 * (so an impossible one is refused straight away) and again when it is carried out.
 */
export async function inspectDepositFix({ id, mode, toSellerId }) {
  await connectDB();
  if (!['move', 'reverse'].includes(mode)) throw new Error('Choose what to do: move to the correct seller, or reverse the deposit');
  if (!isId(id)) throw new Error('Deposit not found');

  const doc = await withdrawalsCol().findOne({ _id: oid(id) });
  if (!doc) throw new Error('Deposit not found');
  if (doc.type !== 'deposit') throw new Error('Only a deposit can be fixed this way');
  if (!['approved', 'completed'].includes(doc.status)) throw new Error('This deposit is not approved (it may already have been reversed)');

  const amount = doc.approvedAmount !== null && doc.approvedAmount !== undefined ? num(doc.approvedAmount) : num(doc.amount);
  if (!(amount > 0)) throw new Error('This deposit has no amount');
  const helping = Math.min(amount, Math.max(0, num(doc.helpingAmount)));

  const from = doc.seller ? await sellersCol().findOne({ _id: doc.seller }, { projection: SELLER_FIELDS }) : null;
  if (!from) throw new Error('The seller this deposit was added to no longer exists');

  let to = null;
  if (mode === 'move') {
    if (!isId(toSellerId)) throw new Error('Choose the correct seller');
    if (sid(toSellerId) === sid(from._id)) throw new Error('This deposit already belongs to that seller');
    to = await sellersCol().findOne({ _id: oid(toSellerId) }, { projection: SELLER_FIELDS });
    if (!to) throw new Error('The correct seller was not found');
    if (isTest(to)) throw new Error('A deposit cannot be moved to a test account');
  }

  // names of the wallet steps of THIS fix (a deposit moved twice gets new names the second time)
  const round = Array.isArray(doc.fixHistory) ? doc.fixHistory.length : 0;
  const opOut = `fix:${sid(doc._id)}:${round}:out`;
  const opIn = `fix:${sid(doc._id)}:${round}:in`;
  const outDone = Array.isArray(from.walletOps) && from.walletOps.includes(opOut);

  const available = num(from.wallet?.balance);
  if (!outDone && available < amount - EPS) {
    const locked = num(from.wallet?.processingFund);
    throw new Error(
      `“${from.storeName}” has only $${r2(available).toLocaleString('en-US')} available in the store wallet, but $${r2(amount).toLocaleString('en-US')} has to be taken back. ` +
        (locked > 0
          ? `$${r2(locked).toLocaleString('en-US')} is locked in confirmed orders (processing fund): move those orders back to Pending (or cancel them) on the store admin panel so the amount returns to the balance, then try again.`
          : 'The rest is already used or withdrawn, so this deposit cannot be taken back right now.')
    );
  }

  const [fromOwner, toOwner, split] = await Promise.all([ownerOf(from._id), to ? ownerOf(to._id) : null, FinanceSplit.findOne({ sourceId: doc._id }).lean()]);
  const countedOwner = split && split.ownerId ? { id: sid(split.ownerId), name: split.ownerName, role: split.ownerRole, deal: split.ownerDeal } : null;

  return {
    doc,
    from,
    to,
    amount,
    helping,
    usdt: num(doc.usdtAmount),
    inr: num(doc.inrAmount),
    opOut,
    opIn,
    fromOwner: countedOwner || fromOwner,
    toOwner,
    counted: !!split,
    shares: split ? (split.shares || []).map((s) => ({ name: s.name, amountUSDT: s.amountUSDT })) : null,
  };
}

/** One named wallet step. 'applied' = done now, 'already' = was done before, 'refused' = not possible. */
async function walletStep(sellerId, inc, { opId, requireBalance = null }) {
  const filter = { _id: sellerId, walletOps: { $ne: opId } };
  if (requireBalance !== null) filter['wallet.balance'] = { $gte: Number(requireBalance) - EPS };
  const res = await sellersCol().updateOne(filter, { $inc: inc, $push: { walletOps: { $each: [opId], $slice: -300 } }, $set: { updatedAt: new Date() } });
  if (res.modifiedCount === 1) return 'applied';
  const seen = await sellersCol().findOne({ _id: sellerId, walletOps: opId }, { projection: { _id: 1 } });
  return seen ? 'already' : 'refused';
}

async function undoStep(sellerId, inc, opId) {
  const back = {};
  for (const [k, v] of Object.entries(inc)) back[k] = -v;
  await sellersCol().updateOne({ _id: sellerId, walletOps: opId }, { $inc: back, $pull: { walletOps: opId }, $set: { updatedAt: new Date() } });
}

// counters that must never show below zero (old records can be out of step)
async function clampCounters(sellerId) {
  for (const f of ['totalDeposited', 'totalHelpingAmount']) {
    await sellersCol().updateOne({ _id: sellerId, [`wallet.${f}`]: { $lt: 0 } }, { $set: { [`wallet.${f}`]: 0 } });
  }
}

/**
 * Carry the fix out.
 * @returns {Promise<{ledger:object, before:object, after:object, storeName:string, sellerId:string}>}
 */
// ─── What the sellers see on the store website after a move / reverse ───
// The wrong seller gets a "debit" line in the wallet history and a chat message, exactly like a
// Direct Debit from the admin panel; the correct seller gets a credit message. The debit line is a
// manual wallet correction with no USDT, so the finance ledger never counts it as a payout.
async function tellSellers({ doc, from, to, mode, amount, fromBalance, toBalance, by, note }) {
  const db = mongoose.connection.db;
  const now = new Date();
  const money = (n) => `$${r2(n).toLocaleString('en-US')}`;
  const line = '━━━━━━━━━━━━━━━━━━━━━━━━━';

  const sendChat = async (seller, text, preview) => {
    let conv = await db.collection('conversations').findOne({ seller: seller._id, type: { $in: ['seller', null] } });
    if (!conv) conv = await db.collection('conversations').findOne({ seller: seller._id });
    if (!conv) {
      const ins = await db.collection('conversations').insertOne({
        type: 'seller', seller: seller._id, storeName: seller.storeName || '', sellerName: seller.ownerName || '',
        sellerEmail: seller.email || '', subject: 'General Seller Support & Operations', status: 'open',
        unreadForAdmin: 0, unreadForSeller: 0, lastMessage: '', lastSender: 'admin', lastAt: now, createdAt: now, updatedAt: now,
      });
      conv = { _id: ins.insertedId };
    }
    await db.collection('messages').insertOne({
      conversation: conv._id, seller: seller._id, sender: 'admin', senderName: by || 'Admin', text,
      attachment: null, attachmentType: null, isEdited: false, isDeleted: false, isAutoReply: false, isSeen: false,
      createdAt: now, updatedAt: now,
    });
    await db.collection('conversations').updateOne(
      { _id: conv._id },
      { $set: { lastMessage: preview, lastSender: 'admin', lastAt: now, updatedAt: now }, $inc: { unreadForSeller: 1 } }
    );
  };
  const sendNote = (seller, title, body) =>
    db.collection('notifications').insertOne({
      recipientType: 'seller', seller: seller._id, type: 'withdrawal', title, body, link: '/seller/wallet', read: false, createdAt: now, updatedAt: now,
    });

  const why = mode === 'move'
    ? `This deposit was added to your store by mistake and has been moved to the correct store.`
    : `This deposit was added by mistake (no payment was received), so it has been reversed.`;

  // 1. wrong seller: a debit line in the wallet history
  await withdrawalsCol().insertOne({
    type: 'withdrawal',
    seller: from._id,
    storeName: from.storeName || '',
    amount,
    approvedAmount: amount,
    helpingAmount: 0,
    balanceAfter: fromBalance,
    isManualAdjustment: true,
    status: 'approved',
    adminNote: `Debit — ${why}${note ? ` (${note})` : ''}`,
    transactionRef: '',
    depositFixOf: doc._id,
    processedAt: now,
    processedBy: by || 'Admin',
    createdAt: now,
    updatedAt: now,
  });

  // 2. chat + notification to the wrong seller
  await sendChat(from,
    `${line}\n💸 DIRECT WALLET DEBIT (-)\n${line}\nAmount: -${money(amount)}\nNew Available Balance: ${money(fromBalance)}\nReason / Note: ${why}${note ? `\nNote: ${note}` : ''}\nProcessed By: ${by || 'Admin'}\n${line}`,
    `💸 Debit: ${money(amount)}`);
  await sendNote(from, '💳 Wallet Debited (-)', `${money(amount)} has been deducted from your wallet. ${why} Balance: ${money(fromBalance)}`);

  // 3. correct seller: told that the deposit is now in its wallet
  if (mode === 'move' && to) {
    await sendChat(to,
      `${line}\n💰 DIRECT WALLET CREDIT (+)\n${line}\nAmount: +${money(amount)}\nNew Available Balance: ${money(toBalance)}\nReason / Note: Your deposit was first added to another store by mistake; it is now in your wallet.\nProcessed By: ${by || 'Admin'}\n${line}`,
      `💰 Credit: ${money(amount)}`);
    await sendNote(to, '💳 Wallet Credited (+)', `${money(amount)} has been added to your wallet (your deposit was moved to the correct store). Balance: ${money(toBalance)}`);
  }
}

export async function fixDeposit({ id, mode, toSellerId, pkrRate, note = '', by = '' }) {
  const info = await inspectDepositFix({ id, mode, toSellerId });
  const { doc, from, to, amount, helping, opOut, opIn } = info;
  const cleanNote = String(note || '').trim().slice(0, 300);

  const out = { 'wallet.balance': -amount, 'wallet.totalDeposited': -amount };
  if (helping > 0) out['wallet.totalHelpingAmount'] = -helping;
  const inn = { 'wallet.balance': amount, 'wallet.totalDeposited': amount };
  if (helping > 0) inn['wallet.totalHelpingAmount'] = helping;

  // 1. take the amount back from the wrong seller (only while it is still in the balance)
  const took = await walletStep(from._id, out, { opId: opOut, requireBalance: amount });
  if (took === 'refused') {
    throw new Error(`“${from.storeName}” no longer has $${r2(amount).toLocaleString('en-US')} available in the store wallet, so the deposit cannot be taken back right now.`);
  }

  // 2. give it to the correct seller
  let gave = '';
  if (mode === 'move') {
    gave = await walletStep(to._id, inn, { opId: opIn });
    if (gave === 'refused') {
      if (took === 'applied') await undoStep(from._id, out, opOut);
      throw new Error('The correct seller was not found');
    }
  }

  // 3. the deposit record itself
  const now = new Date();
  const [fromNow, toNow] = await Promise.all([
    sellersCol().findOne({ _id: from._id }, { projection: { wallet: 1 } }),
    to ? sellersCol().findOne({ _id: to._id }, { projection: { wallet: 1 } }) : null,
  ]);
  const history = {
    at: now,
    by,
    mode,
    fromSeller: from._id,
    fromStore: from.storeName || '',
    toSeller: to ? to._id : null,
    toStore: to ? to.storeName || '' : '',
    amount,
    helping,
    usdt: info.usdt,
    note: cleanNote,
  };
  const set = { updatedAt: now, finEditedBy: by, finEditedAt: now };
  if (mode === 'move') {
    set.seller = to._id;
    set.storeName = to.storeName || '';
    set.balanceAfter = num(toNow?.wallet?.balance);
    set.movedFromStore = from.storeName || '';
    const rate = Number(pkrRate);
    if (Number.isFinite(rate) && rate > 0) set.pkrRate = rate;
  } else {
    set.status = 'rejected';
    set.reversed = true;
    set.reversedAt = now;
    set.reversedBy = by;
    set.adminNote = `Reversed: this deposit was added by mistake${cleanNote ? ` (${cleanNote})` : ''}`;
  }

  const res = await withdrawalsCol().updateOne(
    { _id: doc._id, seller: from._id, status: { $in: ['approved', 'completed'] } },
    { $set: set, $push: { fixHistory: history } }
  );
  if (res.modifiedCount !== 1) {
    // somebody changed the deposit in the meantime: put the wallets back as they were
    if (gave === 'applied') await undoStep(to._id, inn, opIn);
    if (took === 'applied') await undoStep(from._id, out, opOut);
    throw new Error('This deposit was changed by someone else in the meantime. Nothing was moved; please try again.');
  }

  await clampCounters(from._id);

  // The sellers are told on the store website (history line + chat). Never blocks the fix itself.
  try {
    await tellSellers({
      doc, from, to, mode, amount, by, note: cleanNote,
      fromBalance: num(fromNow?.wallet?.balance),
      toBalance: num(toNow?.wallet?.balance),
    });
  } catch (e) {
    console.error('deposit fix: seller notice failed', e?.message);
  }

  // 4. the ledger divides it again for the correct owner (or drops it, when reversed)
  await FinanceSplit.deleteOne({ sourceId: doc._id });
  invalidateLedger();
  const ledger = await buildLedger({ fresh: true });

  const before = {
    deposit: `$${r2(amount)}${info.usdt > 0 ? ` • ₮${info.usdt}` : ''}`,
    seller: from.storeName || '',
    dividedFor: info.counted ? ownerWords(info.fromOwner) : 'not counted yet',
    shares: info.shares,
    walletBalance: { [from.storeName || 'from']: r2(from.wallet?.balance), ...(to ? { [to.storeName || 'to']: r2(to.wallet?.balance) } : {}) },
  };
  const entry = ledger.entries.find((e) => e.id === sid(doc._id));
  const after = {
    action: mode === 'move' ? 'moved to the correct seller' : 'reversed (deposit closed)',
    seller: to ? to.storeName || '' : '',
    dividedFor: mode === 'move' ? (entry ? ownerWords(entry.owner) : 'waiting on the “not counted yet” list') : 'removed from the ledger',
    shares: entry ? entry.shares.map((s) => ({ name: s.name, amountUSDT: s.amountUSDT })) : null,
    walletBalance: { [from.storeName || 'from']: r2(fromNow?.wallet?.balance), ...(to ? { [to.storeName || 'to']: r2(toNow?.wallet?.balance) } : {}) },
    note: cleanNote,
  };

  return { ledger, before, after, storeName: (to || from).storeName || '', sellerId: sid((to || from)._id) };
}
