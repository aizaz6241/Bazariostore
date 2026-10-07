import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import Member from '@/lib/models/Member';
import FinanceApproval from '@/lib/models/FinanceApproval';
import FinanceSplit from '@/lib/models/FinanceSplit';
import WalletTransaction from '@/lib/models/WalletTransaction';
import RewardClaim from '@/lib/models/RewardClaim';
import { Seller } from '@/lib/models/SharedModels';
import { invalidateLedger, updateFinanceEntry, createManualEntry } from '@/lib/utils/finance';
import { getWalletData, getWalletBalancesMap, recordWalletPayout, insufficientText } from '@/lib/utils/wallet';
import { assignSeller, currentOwnerOf } from '@/lib/utils/sellerAssign';
import { logFinance, actorFromSession, flushFinanceAlertsSoon } from '@/lib/utils/financeLog';
import { ACTION_LABEL, canDecide } from '@/lib/utils/approvalRules';
import { syncEcommerceAdmins } from '@/lib/adminSync';
import { isFinancePartner } from '@/lib/partners';
import { inspectDepositFix, fixDeposit, ownerWords } from '@/lib/utils/depositFix';

/**
 * TWO-PERSON APPROVALS
 *
 *   submitAction()   -> does an action at once, or (when it is a sensitive one) stores it as a
 *                       request that another person has to approve
 *   decideApproval() -> approve / reject / cancel a request; approving carries the action out
 *   listApprovals()  -> what is waiting (and what was decided lately)
 *
 * Every action, immediate or approved, goes through performAction(), which also writes the
 * activity log with the values before and after.
 */

const sid = (v) => (v ? String(v) : '');
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const money = (v) => Number(num(v).toFixed(6)).toLocaleString('en-US', { maximumFractionDigits: 6 });
const isId = (v) => !!v && mongoose.Types.ObjectId.isValid(String(v));
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const withdrawalsCol = () => mongoose.connection.db.collection('withdrawals');

const INTERRUPTED_MS = 2 * 60 * 1000;
const samePersonId = (a, b) => !!a && !!b && String(a) === String(b);

// ───────────────────────── Snapshots (for "before" / "after") ─────────────────────────

/** The values of one ledger entry that matter for the money, as they are in the database now. */
export async function snapEntry(id, kind) {
  if (!isId(id)) return null;
  await connectDB();
  const _id = oid(id);

  if (kind === 'manual') {
    const sp = await FinanceSplit.findOne({ sourceId: _id, manual: true }).lean();
    if (!sp) return null;
    return {
      entry: 'manual',
      kind: sp.kind,
      storeName: sp.storeName,
      date: sp.date,
      usdt: sp.usdt,
      inr: sp.inr,
      pkrRate: sp.pkrRate,
      owner: sp.ownerName || '',
      shares: (sp.shares || []).map((s) => ({ name: s.name, amountUSDT: s.amountUSDT })),
      note: sp.note || '',
      createdBy: sp.createdBy || '',
    };
  }

  const split = await FinanceSplit.findOne({ sourceId: _id }).lean();
  const shares = split ? (split.shares || []).map((s) => ({ name: s.name, amountUSDT: s.amountUSDT })) : null;

  if (kind === 'bonus') {
    const c = await RewardClaim.collection.findOne({ _id });
    if (!c) return null;
    return {
      entry: 'bonus',
      title: c.title || '',
      amountPKR: num(c.amountPKR),
      pkrRate: num(c.finPkrRate),
      notCounted: c.finSkip === true,
      status: c.status,
      shares,
    };
  }

  const d = await withdrawalsCol().findOne({ _id });
  if (!d) return null;
  return {
    entry: d.type === 'deposit' ? 'deposit' : 'seller_withdrawal',
    sellerId: sid(d.seller),
    storeName: d.storeName || '',
    walletAmount: d.approvedAmount !== null && d.approvedAmount !== undefined ? num(d.approvedAmount) : num(d.amount),
    helping: num(d.helpingAmount),
    usdt: num(d.usdtAmount),
    inr: num(d.inrAmount),
    rate: num(d.binanceRate),
    pkrRate: num(d.pkrRate),
    noRealMoney: d.finSkip === true,
    confirmed: d.finConfirmed === true,
    status: d.status,
    owner: split ? split.ownerName || '' : '',
    shares,
  };
}

const kindWord = (snap) =>
  !snap ? 'entry' : snap.entry === 'deposit' ? 'deposit' : snap.entry === 'bonus' ? 'bonus' : snap.entry === 'manual' ? 'manual entry' : 'seller withdrawal';

function entryLine(snap) {
  if (!snap) return 'Entry not found';
  if (snap.entry === 'bonus') return `Bonus “${snap.title}” — Rs ${money(snap.amountPKR)} PKR`;
  if (snap.entry === 'manual') return `Manual ${snap.kind === 'deposit' ? 'deposit' : 'seller withdrawal'} — ${snap.storeName} — ₮${money(snap.usdt)}`;
  const parts = [`${snap.entry === 'deposit' ? 'Deposit' : 'Seller withdrawal'} — ${snap.storeName}`, `store wallet $${money(snap.walletAmount)}`];
  if (snap.helping > 0) parts.push(`helping $${money(snap.helping)}`);
  parts.push(snap.usdt > 0 ? `₮${money(snap.usdt)} entered` : 'no USDT entered');
  return parts.join(' • ');
}

// ───────────────────────── Describing a request (what the approver reads) ─────────────────────────

async function describe(action, payload) {
  await connectDB();
  const p = payload || {};

  if (['skip', 'unskip', 'resplit', 'set_usdt', 'edit_usdt', 'count_bonus'].includes(action)) {
    const snap = await snapEntry(p.id, p.kind);
    if (!snap) throw new Error('Transaction not found');
    const details = [entryLine(snap)];
    let summary = '';
    if (action === 'skip') summary = `Mark this ${kindWord(snap)} as “no real money” (it will not be counted)`;
    else if (action === 'unskip') summary = `Bring this ${kindWord(snap)} back to the “not counted yet” list`;
    else if (action === 'resplit') {
      summary = `Divide this ${kindWord(snap)} again using the seller’s current owner`;
      if (snap.shares) details.push(`Now: ${snap.shares.map((s) => `${s.name} ₮${money(s.amountUSDT)}`).join(', ')}`);
    } else if (snap.entry === 'bonus') {
      summary =
        action === 'edit_usdt'
          ? `Change the PKR rate of a counted bonus from ${snap.pkrRate || '—'} to ${p.pkrRate}`
          : `Count this bonus at PKR rate ${p.pkrRate} (= ₮${money(snap.amountPKR / num(p.pkrRate))}, paid 50 / 50 by the partners)`;
    } else {
      const changes = [];
      const has = (v) => v !== undefined && v !== null && v !== '';
      if (has(p.usdtAmount) && num(p.usdtAmount) !== snap.usdt) changes.push(`USDT ${snap.usdt > 0 ? `₮${money(snap.usdt)}` : '—'} → ₮${money(p.usdtAmount)}`);
      if (has(p.inrAmount) && num(p.inrAmount) !== snap.inr) changes.push(`INR ${snap.inr > 0 ? `₹${money(snap.inr)}` : '—'} → ₹${money(p.inrAmount)}`);
      if (has(p.pkrRate) && num(p.pkrRate) !== snap.pkrRate) changes.push(`PKR rate ${snap.pkrRate || '—'} → ${p.pkrRate}`);
      summary = `${action === 'edit_usdt' ? 'Change' : 'Enter'} the real amount of a ${kindWord(snap)} (${snap.storeName}): ${changes.join(', ') || 'no change'}`;
    }
    return { summary, details, targetId: sid(p.id), sellerId: snap.sellerId || '', storeName: snap.storeName || snap.title || '' };
  }

  if (action === 'manual_create') {
    const seller = isId(p.sellerId) ? await Seller.findById(p.sellerId).select('storeName').lean() : null;
    const owner = isId(p.ownerId) ? await Member.findById(p.ownerId).select('name').lean() : null;
    const word = p.kind === 'deposit' ? 'deposit' : 'seller withdrawal';
    return {
      summary: `Add a manual ${word} of ₮${money(p.usdtAmount)} for ${seller ? seller.storeName : 'a seller'}`,
      details: [
        `Belongs to: ${owner ? owner.name : 'both partners'}`,
        `Date: ${p.date || 'today'}${num(p.inrAmount) > 0 ? ` • INR ₹${money(p.inrAmount)}` : ''}${num(p.pkrRate) > 0 ? ` • PKR rate ${p.pkrRate}` : ''}`,
        ...(p.note ? [`Note: ${p.note}`] : []),
      ],
      targetId: sid(new mongoose.Types.ObjectId()),
      sellerId: sid(p.sellerId),
      storeName: seller ? seller.storeName : '',
    };
  }

  if (action === 'manual_delete') {
    const snap = await snapEntry(p.id, 'manual');
    if (!snap) throw new Error('Manual entry not found');
    return { summary: `Delete a manual entry (${snap.storeName}, ₮${money(snap.usdt)})`, details: [entryLine(snap)], targetId: sid(p.id), sellerId: '', storeName: snap.storeName };
  }

  // A deposit that was added to the wrong seller: hand it to the correct one, or reverse it
  if (action === 'fix_deposit') {
    const x = await inspectDepositFix({ id: p.id, mode: p.mode, toSellerId: p.toSellerId });
    const amountText = `$${money(x.amount)}${x.usdt > 0 ? ` (₮${money(x.usdt)})` : ''}`;
    const details = [];
    let summary = '';
    if (p.mode === 'move') {
      summary = `Move a deposit of ${amountText} from “${x.from.storeName}” to “${x.to.storeName}” (it was added to the wrong seller)`;
      details.push(`Store wallets: $${money(x.amount)} leaves “${x.from.storeName}” and is added to “${x.to.storeName}”.`);
      details.push(
        x.counted
          ? `Finance: now divided for ${ownerWords(x.fromOwner)} → will be divided for ${ownerWords(x.toOwner)}. The Binance total does not change.`
          : `Finance: not counted yet; once counted it will be divided for ${ownerWords(x.toOwner)}.`
      );
      if (!x.toOwner) details.push('The correct seller is not assigned to anyone yet: the deposit waits on the “not counted yet” list until it is.');
    } else {
      summary = `Remove a deposit of ${amountText} added to “${x.from.storeName}” by mistake (deduct it from that seller)`;
      details.push(`Store wallet: $${money(x.amount)} is taken back from “${x.from.storeName}” and the deposit is closed.`);
      details.push(x.counted ? `Finance: ₮${money(x.usdt)} leaves the ledger (it was divided for ${ownerWords(x.fromOwner)}). Correct only if this money is already counted on another deposit (added again for the right seller), or never came.` : 'Finance: it was not counted yet, so no wallet changes.');
    }
    if (x.shares) details.push(`Now: ${x.shares.map((s) => `${s.name} ₮${money(s.amountUSDT)}`).join(', ')}`);
    if (p.note) details.push(`Note: ${p.note}`);
    return { summary, details, targetId: sid(p.id), sellerId: sid(x.from._id), storeName: x.from.storeName || '' };
  }

  if (action === 'payout') {
    const payee = isId(p.userId) ? await Member.findById(p.userId).select('name').lean() : null;
    if (!payee) throw new Error('Target user not found');
    const amount = num(p.amount);
    if (!(amount > 0)) throw new Error('Valid payout amount is required');
    if (String(p.currency || 'USDT').toUpperCase() !== 'USDT') throw new Error('Payouts are recorded in USDT (Binance) only');
    // A member asking for their own payout: the partner pays on Binance first, then approves.
    const asked = p.selfRequest === true;
    return {
      summary: asked ? `${payee.name} asks for a payout of ₮${money(amount)}` : `Record a payout of ₮${money(amount)} to ${payee.name}`,
      details: [
        ...(asked ? ['Pay it on Binance first, then approve. Approving records the payout and lowers the wallet.'] : []),
        ...(p.note ? [`Note: ${p.note}`] : []),
      ],
      targetId: `${sid(p.userId)}:${Date.now()}`,
      payeeId: sid(p.userId),
      sellerId: '',
      storeName: '',
    };
  }

  if (action === 'payout_reverse') {
    const tx = isId(p.id) ? await WalletTransaction.findById(p.id).lean() : null;
    if (!tx || tx.type !== 'debit' || tx.category !== 'payout_withdrawal') throw new Error('Payout not found');
    if (tx.reversed === true) throw new Error('This payout was already reversed');
    const payee = await Member.findById(tx.userId).select('name').lean();
    const amount = num(tx.amountUSDT) || num(tx.amount);
    const reason = String(p.reason || '').trim();
    if (reason.length < 3) throw new Error('Write the reason for reversing this payout');
    return {
      summary: `Reverse the payout of ₮${money(amount)} to ${payee ? payee.name : 'Unknown'} (recorded ${new Date(tx.date || tx.createdAt).toISOString().slice(0, 10)})`,
      details: [`Reason: ${reason}`, 'The row is kept, but it is no longer counted: the wallet and the Binance total get the amount back.'],
      targetId: sid(tx._id),
      payeeId: '',
      sellerId: '',
      storeName: '',
    };
  }

  if (action === 'assign' || action === 'reassign') {
    const [seller, target, current] = await Promise.all([
      isId(p.sellerId) ? Seller.findById(p.sellerId).select('storeName').lean() : null,
      isId(p.memberId) ? Member.findById(p.memberId).select('name').lean() : null,
      isId(p.sellerId) ? currentOwnerOf(p.sellerId) : null,
    ]);
    if (!seller) throw new Error('Seller not found');
    if (!target) throw new Error('Target member not found');
    return {
      summary: current
        ? `Move seller “${seller.storeName}” from ${current.name} to ${target.name}`
        : `Assign seller “${seller.storeName}” to ${target.name}`,
      details: current ? ['New deposits and withdrawals of this seller will be divided for the new owner.'] : [],
      targetId: sid(p.sellerId),
      sellerId: sid(p.sellerId),
      storeName: seller.storeName,
    };
  }

  if (action === 'seller_flag') {
    const seller = isId(p.sellerId) ? await Seller.findById(p.sellerId).select('storeName').lean() : null;
    if (!seller) throw new Error('Seller not found');
    const what =
      p.field === 'isTestAccount'
        ? p.value
          ? 'a TEST account (all its deposits and withdrawals leave the finance count)'
          : 'a CLIENT account (its deposits and withdrawals are counted)'
        : p.value
        ? 'a PREVIOUS-STORE seller'
        : 'a CURRENT-STORE seller';
    return { summary: `Make seller “${seller.storeName}” ${what}`, details: [], targetId: `${sid(p.sellerId)}:${p.field}`, sellerId: sid(p.sellerId), storeName: seller.storeName };
  }

  // Admin accounts (asked for on the store admin panel's Staff screen)
  if (action === 'admin_create') {
    const kind = p.financePartner ? 'FINANCE PARTNER' : `staff, role ${p.role}`;
    return { summary: `Create a new admin account “${p.name}” (${p.email}) — ${kind}`, details: [], targetId: `admin:${String(p.email || '').toLowerCase()}`, sellerId: '', storeName: '' };
  }
  if (action === 'admin_update' || action === 'admin_delete') {
    const admin = isId(p.id) ? await adminsCol().findOne({ _id: oid(p.id) }, { projection: { name: 1, email: 1 } }) : null;
    if (!admin) throw new Error('Admin account not found');
    const changes = [];
    const set = p.set || {};
    if (set.role) changes.push(`role → ${set.role}`);
    if (set.permissions) changes.push('permissions');
    if (set.active !== undefined) changes.push(set.active ? 'switch ON' : 'switch OFF');
    if (set.financePartner !== undefined) changes.push(set.financePartner ? 'make a finance partner' : 'remove as finance partner');
    if (p.passwordHash) changes.push('new password');
    return {
      summary: action === 'admin_delete' ? `Delete the admin account “${admin.name}” (${admin.email})` : `Change the admin account “${admin.name}” (${admin.email}): ${changes.join('; ') || 'no change'}`,
      details: [],
      targetId: `admin:${sid(p.id)}`,
      sellerId: '',
      storeName: '',
    };
  }

  throw new Error('Unknown action');
}

// ───────────────────────── Carrying an action out ─────────────────────────

const adminsCol = () => mongoose.connection.db.collection('admins');
const ADMIN_ROLES = ['super_admin', 'admin', 'manager', 'support', 'order_manager', 'inventory'];
const adminView = (a) => (a ? { name: a.name, email: a.email, role: a.role, active: a.active !== false, permissions: a.permissions || [], financePartner: isFinancePartner(a) } : null);

/** Create / change / delete a store admin account (approved request from the Staff screen). */
async function applyAdminChange(action, p) {
  const now = new Date();

  if (action === 'admin_create') {
    const email = String(p.email || '').toLowerCase().trim();
    if (!p.name || !/^\S+@\S+\.\S+$/.test(email) || !p.passwordHash) throw new Error('The request is incomplete');
    if (!ADMIN_ROLES.includes(p.role)) throw new Error('Unknown role');
    if (await adminsCol().findOne({ email })) throw new Error('An admin with this email already exists');
    const doc = {
      name: String(p.name).trim(),
      email,
      passwordHash: p.passwordHash,
      role: p.role,
      title: 'Administrator',
      phone: '',
      permissions: Array.isArray(p.permissions) ? p.permissions : [],
      active: true,
      financePartner: p.financePartner === true && ['super_admin', 'admin'].includes(p.role),
      pwdAt: now,
      createdAt: now,
      updatedAt: now,
      __v: 0,
    };
    const inserted = await adminsCol().insertOne(doc);
    return { before: null, after: adminView(doc), entityId: sid(inserted.insertedId) };
  }

  if (!isId(p.id)) throw new Error('Admin account not found');
  const admin = await adminsCol().findOne({ _id: oid(p.id) });
  if (!admin) throw new Error('Admin account not found');

  const activeSupers = await adminsCol().countDocuments({ role: 'super_admin', active: { $ne: false } });
  const isLastSuper = admin.role === 'super_admin' && admin.active !== false && activeSupers <= 1;

  if (action === 'admin_delete') {
    if (isLastSuper) throw new Error('The last Super Admin cannot be deleted');
    await adminsCol().deleteOne({ _id: admin._id });
    return { before: adminView(admin), after: null, entityId: sid(admin._id) };
  }

  const set = {};
  const asked = p.set || {};
  if (asked.role !== undefined) {
    if (!ADMIN_ROLES.includes(asked.role)) throw new Error('Unknown role');
    set.role = asked.role;
  }
  if (Array.isArray(asked.permissions)) set.permissions = asked.permissions;
  if (typeof asked.active === 'boolean') set.active = asked.active;
  if (typeof asked.financePartner === 'boolean') set.financePartner = asked.financePartner;
  if (isLastSuper && ((set.role && set.role !== 'super_admin') || set.active === false)) {
    throw new Error('The last Super Admin cannot be demoted or switched off');
  }
  const roleAfter = set.role || admin.role;
  if (!['super_admin', 'admin'].includes(roleAfter)) set.financePartner = false; // a staff role never shares the money
  if (p.passwordHash) {
    set.passwordHash = p.passwordHash;
    set.pwdAt = now; // older logins of that account stop working
  }
  if (Object.keys(set).length === 0) return { before: adminView(admin), after: adminView(admin), entityId: sid(admin._id) };
  set.updatedAt = now;
  await adminsCol().updateOne({ _id: admin._id }, { $set: set });
  return { before: adminView(admin), after: { ...adminView({ ...admin, ...set }), passwordChanged: Boolean(p.passwordHash) }, entityId: sid(admin._id) };
}

async function setSellerFlag({ sellerId, field, value }) {
  if (!isId(sellerId)) throw new Error('Seller not found');
  if (!['isTestAccount', 'isPreviousStoreSeller'].includes(field)) throw new Error('Unknown seller setting');
  const col = mongoose.connection.db.collection('sellers');
  const seller = await col.findOne({ _id: oid(sellerId) }, { projection: { storeName: 1, isTestAccount: 1, accountType: 1, isPreviousStoreSeller: 1 } });
  if (!seller) throw new Error('Seller not found');
  const before = { isTestAccount: seller.isTestAccount === true, accountType: seller.accountType || 'client', isPreviousStoreSeller: seller.isPreviousStoreSeller === true };
  const on = value === true;
  const set = field === 'isTestAccount' ? { isTestAccount: on, accountType: on ? 'test' : 'client' } : { isPreviousStoreSeller: on };
  await col.updateOne({ _id: seller._id }, { $set: { ...set, updatedAt: new Date() } });
  return { before, after: { ...before, ...set }, storeName: seller.storeName || '' };
}

/**
 * Do the action. `requester` is the person who asked for it (their name is what gets stored as
 * "by"), `approver` is set when it comes from an approved request.
 */
async function performAction(action, payload, { requester, approver = null, approvalId = '' }) {
  await connectDB();
  const p = payload || {};
  const by = requester?.name || '';
  const info = await describe(action, p);
  const out = { summary: info.summary, sellerId: info.sellerId || '', storeName: info.storeName || '', entity: 'ledger_entry', entityId: info.targetId, before: null, after: null, ledger: null, result: null };

  if (['skip', 'unskip', 'resplit', 'set_usdt', 'edit_usdt', 'count_bonus'].includes(action)) {
    const entryAction = action === 'skip' || action === 'unskip' || action === 'resplit' ? action : 'save';
    out.before = await snapEntry(p.id, p.kind);
    out.ledger = await updateFinanceEntry({ id: p.id, kind: p.kind, action: entryAction, usdtAmount: p.usdtAmount, inrAmount: p.inrAmount, pkrRate: p.pkrRate, by });
    out.after = await snapEntry(p.id, p.kind);
  } else if (action === 'manual_create') {
    out.ledger = await createManualEntry({ kind: p.kind, sellerId: p.sellerId, ownerId: p.ownerId, inrAmount: p.inrAmount, usdtAmount: p.usdtAmount, pkrRate: p.pkrRate, date: p.date, note: p.note, by });
    out.after = { kind: p.kind, usdt: num(p.usdtAmount), inr: num(p.inrAmount), pkrRate: num(p.pkrRate), date: p.date || '', note: p.note || '' };
    out.entity = 'manual_entry';
    if (p.ownerId) {
      try {
        const { sendPushToUser } = await import('@/lib/utils/push');
        sendPushToUser(p.ownerId, {
          title: `💰 Deposit / Finance Entry: ${p.kind === 'deposit' ? 'Deposit' : 'Record'}`,
          body: `An amount of Rs ${Number(p.inrAmount || 0).toLocaleString()} was recorded. Wallet balance updated.`,
          url: '/wallet',
          type: 'finance',
          sound: '/sounds/cash.wav',
          vibrate: [250, 100, 250, 100, 250],
        }).catch((e) => console.error('Finance entry push error:', e));
      } catch (pushErr) {
        console.error('Trigger finance push error:', pushErr);
      }
    }
  } else if (action === 'fix_deposit') {
    const done = await fixDeposit({ id: p.id, mode: p.mode, toSellerId: p.toSellerId, pkrRate: p.pkrRate, note: p.note, by });
    out.ledger = done.ledger;
    out.before = done.before;
    out.after = done.after;
  } else if (action === 'manual_delete') {
    out.before = await snapEntry(p.id, 'manual');
    out.ledger = await updateFinanceEntry({ id: p.id, kind: 'manual', action: 'delete', by });
    out.entity = 'manual_entry';
  } else if (action === 'payout') {
    // A request a member made for themselves is paid by the partner who approves it.
    const paidBy = p.selfRequest === true && approver ? approver.name : by;
    const tx = await recordWalletPayout({ userId: p.userId, amount: Number(p.amount), currency: 'USDT', note: p.note || '', processedBy: paidBy });
    out.result = tx;
    out.after = { payoutId: sid(tx._id), userId: sid(p.userId), amountUSDT: num(p.amount), note: p.note || '' };
    out.entity = 'payout';
    out.entityId = sid(tx._id);
    try {
      const { sendPushToUser } = await import('@/lib/utils/push');
      sendPushToUser(p.userId, {
        title: `💳 Payout Processed: ${p.amount} USDT`,
        body: `Payout has been processed by ${paidBy || 'Admin'}. Check your wallet balance.`,
        url: '/wallet',
        type: 'finance',
        sound: '/sounds/cash.wav',
        vibrate: [250, 100, 250, 100, 250],
      }).catch((e) => console.error('Payout push error:', e));
    } catch (pushErr) {
      console.error('Trigger payout push error:', pushErr);
    }
  } else if (action === 'payout_reverse') {
    const tx = await WalletTransaction.findById(p.id).lean();
    if (!tx) throw new Error('Payout not found');
    const amount = num(tx.amountUSDT) || num(tx.amount);
    out.before = { payoutId: sid(tx._id), userId: sid(tx.userId), amountUSDT: amount, note: tx.note || '', date: tx.date, counted: true };
    // only a payout that is still counted can be taken back (two clicks can never do it twice)
    const done = await WalletTransaction.updateOne(
      { _id: tx._id, type: 'debit', category: 'payout_withdrawal', reversed: { $ne: true } },
      { $set: { reversed: true, reversedAt: new Date(), reversedBy: approver ? `${by} (approved by ${approver.name})` : by, reverseReason: String(p.reason || '').trim().slice(0, 300) } }
    );
    if (!done.modifiedCount) throw new Error('This payout was already reversed');
    invalidateLedger();
    out.after = { ...out.before, counted: false, reason: String(p.reason || '').trim() };
    out.entity = 'payout';
    out.entityId = sid(tx._id);
    try {
      const { sendPushToUser } = await import('@/lib/utils/push');
      sendPushToUser(tx.userId, {
        title: `↩️ Payout reversed: ${amount} USDT`,
        body: 'A payout recorded in your wallet was taken back. The amount is in your wallet balance again.',
        url: '/wallet',
        type: 'finance',
      }).catch((e) => console.error('Payout reverse push error:', e));
    } catch (pushErr) {
      console.error('Trigger payout reverse push error:', pushErr);
    }
  } else if (action === 'assign' || action === 'reassign') {
    const current = await currentOwnerOf(p.sellerId);
    out.before = current ? { owner: current.name, ownerId: current.memberId } : { owner: '' };
    const done = await assignSeller({ sellerId: p.sellerId, memberId: p.memberId, by: { memberId: requester?.memberId || '', name: by } });
    out.result = done;
    out.after = { owner: done.targetMember.name, ownerId: sid(done.targetMember._id) };
    out.entity = 'seller';
    invalidateLedger();
  } else if (action === 'seller_flag') {
    const done = await setSellerFlag(p);
    out.before = done.before;
    out.after = done.after;
    out.entity = 'seller';
    invalidateLedger();
  } else if (action === 'admin_create' || action === 'admin_update' || action === 'admin_delete') {
    const done = await applyAdminChange(action, p);
    out.before = done.before;
    out.after = done.after;
    out.entity = 'admin';
    out.entityId = done.entityId;
    // the portal's own list of partners follows the admin accounts
    try {
      await syncEcommerceAdmins({ force: true });
    } catch (e) {
      console.error('[approvals] admin sync after change failed:', e.message);
    }
    invalidateLedger();
  } else {
    throw new Error('Unknown action');
  }

  await logFinance({
    actor: requester,
    action: `finance.${action}`,
    summary: approver ? `${info.summary} — approved by ${approver.name}` : info.summary,
    entity: out.entity,
    entityId: out.entityId,
    sellerId: out.sellerId,
    storeName: out.storeName,
    before: out.before,
    after: out.after,
    meta: approver ? { approvedBy: approver.name, approvalId: sid(approvalId) } : null,
  });

  return out;
}

// ───────────────────────── Public API ─────────────────────────

/**
 * @param {object} p
 * @param {object} p.session   the logged-in portal member
 * @param {string} p.action
 * @param {object} p.payload
 * @param {boolean} p.gated    true -> store as a request for another person to approve
 * @returns {Promise<{pending:boolean, message:string, approval?:object, ledger?:object, result?:any}>}
 */
export async function submitAction({ session, action, payload, gated }) {
  await connectDB();
  const requester = actorFromSession(session);

  if (!gated) {
    const done = await performAction(action, payload, { requester });
    await flushFinanceAlertsSoon();
    return { pending: false, message: done.summary, ledger: done.ledger, result: done.result };
  }

  const info = await describe(action, payload);

  const waiting = await FinanceApproval.findOne({ action, targetId: info.targetId, status: { $in: ['pending', 'processing'] } }).lean();
  if (waiting) {
    return {
      pending: true,
      message: `This is already waiting for approval (asked by ${waiting.requestedBy?.name || 'someone'}). Cancel that request first if you want to change it.`,
      approval: waiting,
    };
  }

  const approval = await FinanceApproval.create({
    action,
    targetId: info.targetId,
    summary: info.summary,
    details: info.details || [],
    payload: payload || {},
    payeeId: info.payeeId || '',
    source: 'portal',
    requestedBy: requester,
    status: 'pending',
  });

  await logFinance({
    actor: requester,
    action: 'approval.requested',
    summary: `Asked for approval: ${info.summary}`,
    entity: 'approval',
    entityId: approval._id,
    sellerId: info.sellerId || '',
    storeName: info.storeName || '',
    after: { action, payload: payload || {} },
    meta: { needsApproval: true, approvalId: sid(approval._id) },
  });
  await flushFinanceAlertsSoon();

  const who = action === 'payout' && session.role !== 'admin' ? 'a partner' : 'the other partner';
  return { pending: true, message: `Sent for approval. Nothing has changed yet: ${who} has to approve it first.`, approval: approval.toObject() };
}

/**
 * approve / reject / cancel.
 * @returns {Promise<{message:string, ledger?:object}>}
 */
export async function decideApproval({ id, decision, session, note = '' }) {
  await connectDB();
  if (!isId(id)) throw new Error('Request not found');
  const viewer = actorFromSession(session);

  const approval = await FinanceApproval.findById(id).lean();
  if (!approval) throw new Error('Request not found');

  const allowed = canDecide({ approval, viewer, decision });
  if (!allowed.ok) throw new Error(allowed.reason);

  const cleanNote = String(note || '').trim().slice(0, 300);

  if (decision === 'reject' || decision === 'cancel') {
    const status = decision === 'reject' ? 'rejected' : 'cancelled';
    const closed = await FinanceApproval.findOneAndUpdate(
      { _id: approval._id, status: 'pending' },
      { $set: { status, decidedBy: viewer, decidedAt: new Date(), decisionNote: cleanNote } },
      { new: true }
    );
    if (!closed) throw new Error('This request is already closed');
    await logFinance({
      actor: viewer,
      action: `approval.${status}`,
      summary: `${decision === 'reject' ? 'Rejected' : 'Cancelled'}: ${approval.summary}${cleanNote ? ` (${cleanNote})` : ''}`,
      entity: 'approval',
      entityId: approval._id,
      meta: { approvalId: sid(approval._id), requestedBy: approval.requestedBy?.name || '' },
    });
    await flushFinanceAlertsSoon();
    // a member whose payout request was turned down hears about it
    if (decision === 'reject' && approval.action === 'payout' && approval.payeeId && !samePersonId(approval.payeeId, viewer.memberId)) {
      try {
        const { sendPushToUser } = await import('@/lib/utils/push');
        sendPushToUser(approval.payeeId, {
          title: 'Payout request not approved',
          body: cleanNote ? `Reason: ${cleanNote}` : 'Your payout request was not approved. Nothing was deducted from your wallet.',
          url: '/wallet',
          type: 'finance',
        }).catch((e) => console.error('Payout reject push error:', e));
      } catch (pushErr) {
        console.error('Trigger payout reject push error:', pushErr);
      }
    }
    return { message: decision === 'reject' ? 'Request rejected. Nothing was changed.' : 'Request cancelled.' };
  }

  // approve: take the request first so two clicks can never run it twice
  const taken = await FinanceApproval.findOneAndUpdate({ _id: approval._id, status: 'pending' }, { $set: { status: 'processing', lastError: '' } }, { new: true });
  if (!taken) throw new Error('This request is already closed or is being processed');

  try {
    const done = await performAction(approval.action, approval.payload, { requester: approval.requestedBy, approver: viewer, approvalId: approval._id });
    await FinanceApproval.updateOne({ _id: approval._id }, { $set: { status: 'approved', decidedBy: viewer, decidedAt: new Date(), decisionNote: cleanNote } });
    await flushFinanceAlertsSoon();
    return { message: `Approved and applied: ${approval.summary}`, ledger: done.ledger };
  } catch (err) {
    await FinanceApproval.updateOne({ _id: approval._id, status: 'processing' }, { $set: { status: 'pending', lastError: String(err.message || err).slice(0, 300) } });
    throw new Error(`Could not apply this request: ${err.message}`);
  }
}

function shape(a, viewer) {
  const base = { ...a, status: a.status === 'processing' ? 'pending' : a.status };
  return {
    id: sid(a._id),
    action: a.action,
    label: ACTION_LABEL[a.action] || a.action,
    targetId: a.targetId || '',
    entryId: a.payload && a.payload.id ? sid(a.payload.id) : '',
    summary: a.summary || '',
    details: a.details || [],
    source: a.source || 'portal',
    requestedBy: a.requestedBy?.name || 'Unknown',
    createdAt: a.createdAt,
    status: base.status,
    decidedBy: a.decidedBy?.name || '',
    decidedAt: a.decidedAt || null,
    decisionNote: a.decisionNote || '',
    lastError: a.lastError || '',
    payeeIsMe: !!a.payeeId && String(a.payeeId) === String(viewer.memberId),
    amount: a.action === 'payout' ? num(a.payload?.amount) : 0,
    selfRequest: a.action === 'payout' && a.payload?.selfRequest === true,
    canApprove: canDecide({ approval: base, viewer, decision: 'approve' }).ok,
    canCancel: canDecide({ approval: base, viewer, decision: 'cancel' }).ok,
  };
}

/**
 * Partners see everything that is waiting plus the last decisions. A member only sees payouts
 * written in their name that wait for their confirmation.
 */
export async function listApprovals({ session }) {
  await connectDB();
  const viewer = actorFromSession(session);

  // A request left half-way (server stopped in the middle) goes back to "waiting".
  try {
    await FinanceApproval.updateMany(
      { status: 'processing', updatedAt: { $lt: new Date(Date.now() - INTERRUPTED_MS) } },
      { $set: { status: 'pending', lastError: 'This request was interrupted. Check the ledger to see whether it was already applied before approving it again.' } }
    );
  } catch (e) {
    console.error('[approvals] recovery failed:', e.message);
  }

  if (session.role !== 'admin') {
    // A member sees only payouts in their own name: the ones they asked for (waiting for a
    // partner), the ones a partner wrote (waiting for their "received"), and what was decided
    // about them lately.
    const [mine, decided] = await Promise.all([
      FinanceApproval.find({ status: { $in: ['pending', 'processing'] }, action: 'payout', payeeId: viewer.memberId }).sort({ createdAt: -1 }).limit(20).lean(),
      FinanceApproval.find({
        status: { $in: ['approved', 'rejected'] },
        action: 'payout',
        payeeId: viewer.memberId,
        decidedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      })
        .sort({ decidedAt: -1 })
        .limit(5)
        .lean(),
    ]);
    const shaped = mine.map((a) => shape(a, viewer));
    return { pending: shaped, recent: decided.map((a) => shape(a, viewer)), waitingForMe: shaped.filter((a) => a.canApprove).length };
  }

  const [pending, recent] = await Promise.all([
    FinanceApproval.find({ status: { $in: ['pending', 'processing'] } }).sort({ createdAt: -1 }).limit(100).lean(),
    FinanceApproval.find({ status: { $in: ['approved', 'rejected', 'cancelled'] } }).sort({ decidedAt: -1 }).limit(15).lean(),
  ]);
  const shapedPending = pending.map((a) => shape(a, viewer));
  // For a payout that is waiting: what that wallet holds right now, so nobody sends money that
  // can no longer be recorded (the wallet may have gone down since the request was made).
  if (shapedPending.some((a) => a.action === 'payout')) {
    try {
      const wallets = await getWalletBalancesMap();
      pending.forEach((a, i) => {
        if (a.action !== 'payout' || !a.payeeId) return;
        const w = wallets.get(String(a.payeeId));
        shapedPending[i].walletNow = w ? num(w.availableUSDT ?? w.balanceUSDT) : 0;
      });
    } catch (e) {
      console.error('[approvals] wallet lookup failed:', e.message);
    }
  }
  return {
    pending: shapedPending,
    recent: recent.map((a) => shape(a, viewer)),
    waitingForMe: shapedPending.filter((a) => a.canApprove).length,
  };
}

/** Wallet balance check for a payout request, so an impossible one is refused straight away. */
export async function assertPayoutPossible({ userId, amount }) {
  await connectDB();
  // One request at a time per person: otherwise several requests, each within the balance, could
  // together ask for more than the wallet holds.
  const waiting = await FinanceApproval.findOne({ action: 'payout', payeeId: sid(userId), status: { $in: ['pending', 'processing'] } }).lean();
  if (waiting) {
    throw new Error(`A payout of ₮${money(waiting.payload?.amount)} is already waiting for approval for this wallet. Cancel it first to ask for a different amount.`);
  }
  invalidateLedger();
  const wallet = await getWalletData({ userId });
  const available = wallet?.balances?.availableUSDT ?? wallet?.balances?.balanceUSDT ?? 0;
  if (Number(amount) > available) {
    throw new Error(insufficientText(amount, wallet?.balances));
  }
}
