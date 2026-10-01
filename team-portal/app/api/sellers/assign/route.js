import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import SellerAssignment from '@/lib/models/SellerAssignment';
import Member from '@/lib/models/Member';
import { Seller } from '@/lib/models/SharedModels';
import ChatMessage from '@/lib/models/ChatMessage';

export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden. Admin access required.' }, { status: 403 });
    }

    const { sellerId, memberId, commissionLabel } = await req.json();

    if (!sellerId || !memberId) {
      return NextResponse.json({ message: 'Seller ID and Member ID are required' }, { status: 400 });
    }

    const [seller, targetMember] = await Promise.all([
      Seller.findById(sellerId),
      Member.findById(memberId),
    ]);

    if (!seller) return NextResponse.json({ message: 'Seller not found' }, { status: 404 });
    if (!targetMember) return NextResponse.json({ message: 'Target member not found' }, { status: 404 });

    // The deal agreement is strictly configured on the Member (not the seller).
    // The assigned store automatically inherits the member's commission agreement.
    const chosenLabel = targetMember.commissionLabel || 'pkr_1to1';
    seller.commissionLabel = chosenLabel;
    await seller.save();

    // Mark any previous active assignment for this seller as transferred
    await SellerAssignment.updateMany(
      { sellerId: seller._id, status: 'active' },
      { $set: { status: 'transferred' } }
    );

    // Create new assignment
    const newAssignment = await SellerAssignment.create({
      sellerId: seller._id,
      memberId: targetMember._id,
      assignedBy: session._id,
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
    const personalConvId = [targetMember._id.toString(), session._id.toString()].sort().join('_');
    const labelDesc = chosenLabel === 'inr_50' ? '🇮🇳 50% INR Commission' : '🇵🇰 1:1 INR to PKR Commission';
    await ChatMessage.create({
      chatType: 'personal',
      conversationId: `personal_${personalConvId}`,
      senderId: session._id,
      senderName: session.name,
      senderRole: 'admin',
      targetMemberId: targetMember._id,
      messageType: 'text',
      text: `💼 Store "${seller.storeName}" (${seller.ownerName}) has been officially assigned to you!\nCommission Model: ${labelDesc}.\nDeposits and performance will reflect in your live wallet.`,
      readBy: [session._id],
    });

    return NextResponse.json({
      message: `Seller "${seller.storeName}" successfully assigned to ${targetMember.name}`,
      assignment: newAssignment,
    });
  } catch (err) {
    console.error('Assign seller error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
