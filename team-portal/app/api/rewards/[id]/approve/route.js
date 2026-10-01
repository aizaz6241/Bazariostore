import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import RewardClaim from '@/lib/models/RewardClaim';
import Member from '@/lib/models/Member';
import ChatMessage from '@/lib/models/ChatMessage';

export async function POST(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden. Admin access required.' }, { status: 403 });
    }

    const { id } = params;
    const body = await req.json().catch(() => ({}));

    const claim = await RewardClaim.findById(id).populate('memberId');
    if (!claim) {
      return NextResponse.json({ message: 'Reward claim not found' }, { status: 404 });
    }

    if (claim.status === 'approved') {
      return NextResponse.json({ message: 'This reward has already been approved' }, { status: 400 });
    }

    const targetMember = await Member.findById(claim.memberId._id);
    if (!targetMember) {
      return NextResponse.json({ message: 'Member not found' }, { status: 404 });
    }

    // 1. Mark claim approved
    claim.status = 'approved';
    claim.adminNote = body.adminNote || 'Approved by Admin';
    claim.approvedBy = session._id;
    claim.approvedAt = new Date();
    await claim.save();

    // 2. Credit Member Wallet in PKR
    targetMember.wallet = targetMember.wallet || {};
    targetMember.wallet.balancePKR = (targetMember.wallet.balancePKR || 0) + claim.amountPKR;
    targetMember.wallet.totalBonusesPKR = (targetMember.wallet.totalBonusesPKR || 0) + claim.amountPKR;
    await targetMember.save();

    // 3. Post Automatic Public Announcement in Group Chat
    const celebrationMsg =
      `🎉 ━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🏆 BONUS AWARD ANNOUNCEMENT 🏆\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Congratulations to @${targetMember.name}!\n` +
      `💰 Bonus Amount: Rs ${claim.amountPKR.toLocaleString()} PKR\n` +
      `📌 Reason: ${claim.title}\n` +
      (body.adminNote ? `💬 Admin Note: ${body.adminNote}\n` : '') +
      `Keep up the fantastic work! 🚀\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━`;

    await ChatMessage.create({
      chatType: 'group',
      conversationId: 'main_group',
      senderId: session._id,
      senderName: 'System (Admin)',
      senderRole: 'admin',
      messageType: 'system_bonus',
      text: celebrationMsg,
      bonusMetadata: {
        amountPKR: claim.amountPKR,
        reason: claim.title,
        recipientMemberName: targetMember.name,
        recipientMemberId: targetMember._id,
      },
    });

    // 4. Send 1-on-1 Personal Message to Member
    const personalConvId = [targetMember._id.toString(), session._id.toString()].sort().join('_');
    await ChatMessage.create({
      chatType: 'personal',
      conversationId: `personal_${personalConvId}`,
      senderId: session._id,
      senderName: session.name,
      senderRole: 'admin',
      targetMemberId: targetMember._id,
      messageType: 'system_bonus',
      text: `🎁 Your bonus claim of Rs ${claim.amountPKR.toLocaleString()} PKR for "${claim.title}" has been APPROVED! It has been credited to your wallet balance.`,
    });

    return NextResponse.json({
      message: 'Reward claim approved and credited successfully',
      claim,
      newWalletBalancePKR: targetMember.wallet.balancePKR,
    });
  } catch (err) {
    console.error('Approve reward error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
