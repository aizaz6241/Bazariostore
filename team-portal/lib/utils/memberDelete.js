import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { forgetSessions } from '@/lib/auth';
import Member from '@/lib/models/Member';
import SellerAssignment from '@/lib/models/SellerAssignment';
import FinanceSplit from '@/lib/models/FinanceSplit';
import RewardClaim from '@/lib/models/RewardClaim';
import Lead from '@/lib/models/Lead';
import WaNumber from '@/lib/models/WaNumber';
import PushSubscription from '@/lib/models/PushSubscription';
import { logFinance } from '@/lib/utils/financeLog';

/**
 * Deleting a team member from the Members page (one, or many at once).
 *
 * Two ways, chosen automatically:
 *  - CLEAN member (no money history, not in a referral): erased completely, as before.
 *  - Member WITH money or referral history (finance shares, payouts, rewards, wallet not zero,
 *    a referrer, or a referred member): his account is CLOSED and hidden everywhere, but his
 *    record stays so the finance (old deposits, shares, payouts, referral commissions) stays
 *    exactly right. He can no longer log in.
 *
 * Either way:
 *  - his stores become unassigned (assign them again on the Sellers page);
 *  - his open leads go back to "not given to anyone"; converted leads keep their history;
 *  - he is taken off the WhatsApp numbers he held;
 *  - his phone/push notifications stop.
 * Referral effects (no extra step needed, the ledger already works this way):
 *  - deleting a REFERRER: the members he brought get their full 100% from now on
 *    (commission already earned stays in his history);
 *  - deleting a REFERRED member: his referrer stops earning from him from now on
 *    (commission already earned stays).
 */

const sid = (v) => (v ? String(v) : '');
const fail = (message) => Object.assign(new Error(message), { expected: true });

export async function removeMember({ session, id }) {
  await connectDB();
  if (!mongoose.Types.ObjectId.isValid(sid(id))) throw fail('Member not found.');
  if (sid(session._id) === sid(id)) throw fail('You cannot delete your own account.');

  const member = await Member.findById(id);
  if (!member || member.deletedAt) throw fail('Member not found (maybe already deleted).');
  if (member.role === 'admin' && member.ecommerceAdminId) {
    throw fail(`“${member.name}” is a partner account and cannot be deleted from here.`);
  }

  const idStr = sid(member._id);
  const [hasShares, referredCount, hasPayouts, hasRewards, sellerCount] = await Promise.all([
    FinanceSplit.exists({ $or: [{ 'shares.userId': member._id }, { ownerId: member._id }] }),
    Member.countDocuments({ referredBy: member._id }),
    mongoose.connection.db
      .collection('portalwallettransactions')
      .findOne({ userId: { $in: [member._id, idStr] } }, { projection: { _id: 1 } }),
    RewardClaim.exists({ memberId: member._id }),
    SellerAssignment.countDocuments({ memberId: member._id, status: 'active' }),
  ]);
  const w = member.wallet || {};
  const walletNotZero = [w.balanceUSDT, w.balancePKR, w.balanceINR].some((v) => Math.abs(Number(v) || 0) >= 0.01);
  const referrer = member.referredBy ? await Member.findById(member.referredBy).select('name').lean() : null;
  const keepRecord = !!(hasShares || hasPayouts || hasRewards || walletNotZero || referredCount > 0 || member.referredBy);

  const now = new Date();
  const byName = session.name || 'Admin';

  // 1. Stores: no longer his (old splits stay locked to him, so finance history is unchanged)
  if (keepRecord) {
    await SellerAssignment.updateMany({ memberId: member._id, status: 'active' }, { $set: { status: 'archived' } });
  } else {
    await SellerAssignment.deleteMany({ memberId: member._id });
  }

  // 2. Open leads back to the pool, so nobody is told "this lead belongs to someone else"
  const leadsRes = await Lead.updateMany(
    { memberId: member._id, status: { $ne: 'converted' } },
    {
      $set: { memberId: null, memberName: '', assignedAt: null, assignedBy: null, waNumberId: null, lastActivityAt: now },
      $push: {
        history: {
          $each: [{ at: now, type: 'unassigned', by: session._id, byName, text: `Taken back from ${member.name} (member deleted)` }],
          $slice: -80,
        },
      },
    }
  );

  // 3. WhatsApp numbers he held
  const numbersRes = await WaNumber.updateMany(
    { 'holders.memberId': member._id },
    {
      $pull: { holders: { memberId: member._id } },
      $push: {
        history: {
          $each: [{ at: now, type: 'unlinked', by: session._id, byName, memberId: member._id, text: `Removed from ${member.name} (member deleted)` }],
          $slice: -200,
        },
      },
    }
  );

  // 4. No more notifications to his phone
  await PushSubscription.deleteMany({ memberId: member._id }).catch(() => {});

  // 5. The account itself
  if (keepRecord) {
    member.active = false;
    member.deletedAt = now;
    member.deletedBy = session._id;
    member.deletedByName = byName;
    await member.save();
  } else {
    await Member.deleteOne({ _id: member._id });
  }
  forgetSessions(member._id);

  const notes = [];
  if (sellerCount) notes.push(`${sellerCount} ${sellerCount === 1 ? 'store' : 'stores'} unassigned`);
  if (referredCount) notes.push(`he had brought ${referredCount} ${referredCount === 1 ? 'member' : 'members'} — they now keep their full 100%`);
  if (referrer) notes.push(`he was brought by ${referrer.name} — ${referrer.name} stops earning from him`);
  if (leadsRes.modifiedCount) notes.push(`${leadsRes.modifiedCount} open ${leadsRes.modifiedCount === 1 ? 'lead' : 'leads'} taken back`);
  if (numbersRes.modifiedCount) notes.push(`removed from ${numbersRes.modifiedCount} WhatsApp ${numbersRes.modifiedCount === 1 ? 'number' : 'numbers'}`);
  if (keepRecord) notes.push('money history kept in finance');

  await logFinance({
    session,
    action: 'member.deleted',
    summary: `Deleted ${member.role === 'admin' ? 'admin' : 'member'} “${member.name}”${notes.length ? ` (${notes.join('; ')})` : ''}`,
    entity: 'member',
    entityId: member._id,
    before: {
      name: member.name,
      username: member.username,
      role: member.role,
      deal: member.commissionLabel || 'pkr_1to1',
      walletUSDT: Number(w.balanceUSDT) || 0,
      activeSellers: sellerCount,
      referredBy: referrer ? referrer.name : '',
      referralPct: member.referredBy ? Number(member.referralPct) || 0 : 0,
      broughtMembers: referredCount,
    },
    after: { mode: keepRecord ? 'closed (history kept)' : 'erased' },
  });

  return {
    id: idStr,
    name: member.name,
    mode: keepRecord ? 'closed' : 'erased',
    sellers: sellerCount,
    leads: leadsRes.modifiedCount || 0,
    numbers: numbersRes.modifiedCount || 0,
    broughtMembers: referredCount,
    referrer: referrer ? referrer.name : '',
  };
}
