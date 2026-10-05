import { connectDB } from '@/lib/db';
import SellerAssignment from '@/lib/models/SellerAssignment';
import Member from '@/lib/models/Member';
import { Seller } from '@/lib/models/SharedModels';
import ChatMessage from '@/lib/models/ChatMessage';

const sid = (v) => (v ? String(v) : '');

/** Who a seller belongs to right now (null when nobody). */
export async function currentOwnerOf(sellerId) {
  await connectDB();
  const active = await SellerAssignment.findOne({ sellerId, status: 'active' }).sort({ createdAt: -1 }).lean();
  if (!active) return null;
  const m = await Member.findById(active.memberId).select('name role commissionLabel').lean();
  return { assignmentId: sid(active._id), memberId: sid(active.memberId), name: m ? m.name : 'Unknown', role: m ? m.role : '' };
}

/**
 * Give a seller to a partner / member (the previous owner, if any, is marked "transferred").
 * Same steps the Sellers page has always done; moved here so an approved request can run them too.
 * @param {{sellerId:string, memberId:string, by:{memberId:string,name:string}}} p
 */
export async function assignSeller({ sellerId, memberId, by }) {
  await connectDB();

  const [seller, targetMember] = await Promise.all([Seller.findById(sellerId), Member.findById(memberId)]);
  if (!seller) throw new Error('Seller not found');
  if (!targetMember) throw new Error('Target member not found');

  // The deal agreement is strictly configured on the Member (not the seller).
  // The assigned store automatically inherits the member's commission agreement.
  const chosenLabel = targetMember.commissionLabel || 'pkr_1to1';
  seller.commissionLabel = chosenLabel;
  await seller.save();

  // Mark any previous active assignment for this seller as transferred
  await SellerAssignment.updateMany({ sellerId: seller._id, status: 'active' }, { $set: { status: 'transferred' } });

  const assignedBy = by && by.memberId ? by.memberId : null;
  const newAssignment = await SellerAssignment.create({
    sellerId: seller._id,
    memberId: targetMember._id,
    assignedBy,
    status: 'active',
    commissionLabel: chosenLabel,
    privateNotes: {
      customName: seller.storeName,
      age: '',
      occupation: 'Merchant / Seller',
      maritalStatus: '',
      location: seller.address?.city || '',
      picture: '',
      details: `Assigned on ${new Date().toLocaleDateString()}`,
    },
  });

  // Notify the member via 1-on-1 personal chat system message
  if (assignedBy) {
    try {
      const personalConvId = [targetMember._id.toString(), String(assignedBy)].sort().join('_');
      const labelDesc =
        targetMember.role === 'admin'
          ? '🛡️ Partner Deal (75% of this store’s deposits; the other partner gets 25%)'
          : chosenLabel === 'inr_50'
          ? '50% of every deposit, in real USDT'
          : '🇵🇰 1:1 INR to PKR, paid in USDT at that day’s rate';
      await ChatMessage.create({
        chatType: 'personal',
        conversationId: `personal_${personalConvId}`,
        senderId: assignedBy,
        senderName: by.name || 'Admin',
        senderRole: 'admin',
        targetMemberId: targetMember._id,
        messageType: 'text',
        text: `💼 Store "${seller.storeName}" (${seller.ownerName}) has been officially assigned to you!\nCommission Model: ${labelDesc}.\nDeposits, withdrawals, and USDT conversions will reflect in your live wallet.`,
        readBy: [assignedBy],
      });
    } catch (chatErr) {
      console.error('Seller assign chat message error:', chatErr.message);
    }
  }

  try {
    const { sendPushToUser } = await import('@/lib/utils/push');
    sendPushToUser(targetMember._id, {
      title: `🤝 New Seller Assigned: ${seller.storeName}`,
      body: `Store "${seller.storeName}" (${seller.ownerName}) has been assigned to you. Check your sellers dashboard!`,
      url: '/sellers',
      type: 'sellers',
      sound: '/sounds/notification.wav',
      vibrate: [200, 100, 200, 100, 200],
    }).catch((e) => console.error('Seller assign push error:', e));
  } catch (pushErr) {
    console.error('Trigger seller assign push error:', pushErr);
  }

  return { seller, targetMember, assignment: newAssignment };
}
