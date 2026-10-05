import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import RewardClaim from '@/lib/models/RewardClaim';
import Member from '@/lib/models/Member';
import ChatMessage from '@/lib/models/ChatMessage';
import { sendPushToUser, sendPushToAllExcept } from '@/lib/utils/push';
import { logFinance, flushFinanceAlertsSoon } from '@/lib/utils/financeLog';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden. Admin access required.' }, { status: 403 });
    }

    const { memberId, amountPKR, reason } = await req.json();

    if (!memberId || !amountPKR || Number(amountPKR) <= 0) {
      return NextResponse.json({ message: 'Valid member and bonus amount are required' }, { status: 400 });
    }

    const targetMember = await Member.findById(memberId);
    if (!targetMember) {
      return NextResponse.json({ message: 'Member not found' }, { status: 404 });
    }

    const numAmount = Number(amountPKR);
    const cleanReason = reason || 'Admin Special Performance Bonus';

    // 1. Create approved claim record
    const claim = await RewardClaim.create({
      memberId: targetMember._id,
      rewardType: 'custom_bonus',
      title: `Bonus: ${cleanReason}`,
      amountPKR: numAmount,
      description: cleanReason,
      status: 'approved',
      adminNote: cleanReason,
      approvedBy: session._id,
      approvedAt: new Date(),
    });

    await logFinance({
      session,
      action: 'bonus.granted',
      summary: `Gave a bonus of Rs ${numAmount.toLocaleString('en-US')} PKR to ${targetMember.name} (${cleanReason}). It is paid 50 / 50 by the partners once it is counted.`,
      entity: 'bonus',
      entityId: claim._id,
      after: { member: targetMember.name, amountPKR: numAmount, reason: cleanReason },
    });
    await flushFinanceAlertsSoon();

    // 2. Credit Member Wallet in PKR
    targetMember.wallet = targetMember.wallet || {};
    targetMember.wallet.balancePKR = (targetMember.wallet.balancePKR || 0) + numAmount;
    targetMember.wallet.totalBonusesPKR = (targetMember.wallet.totalBonusesPKR || 0) + numAmount;
    await targetMember.save();

    // 3. Post Announcement in Group Chat
    const celebrationMsg =
      `🎉 ━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🌟 SPECIAL BONUS AWARDED 🌟\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Recipient: @${targetMember.name}\n` +
      `💰 Amount: Rs ${numAmount.toLocaleString()} PKR\n` +
      `📌 Reason: ${cleanReason}\n` +
      `Awarded by: ${session.name}\n` +
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
        amountPKR: numAmount,
        reason: cleanReason,
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
      text: `🎁 You have received an instant bonus of Rs ${numAmount.toLocaleString()} PKR!\nReason: ${cleanReason}\nYour wallet balance is updated.`,
    });

    // 5. Send Push Notification to Member with Cash Sound
    try {
      sendPushToUser(targetMember._id, {
        title: `🎁 Special Bonus: Rs ${numAmount.toLocaleString()} PKR`,
        body: `You received Rs ${numAmount.toLocaleString()} PKR bonus for "${cleanReason}"!`,
        url: '/wallet',
        type: 'finance',
        sound: '/sounds/cash.wav',
        vibrate: [250, 100, 250, 100, 250],
      }).catch((e) => console.error('Bonus push error:', e));

      sendPushToAllExcept(session._id, {
        title: `🌟 Special Bonus Awarded!`,
        body: `@${targetMember.name} was awarded Rs ${numAmount.toLocaleString()} PKR bonus!`,
        url: '/chat',
        type: 'chat',
        sound: '/sounds/cash.wav',
      }).catch((e) => console.error('Bonus announce error:', e));
    } catch (pushErr) {
      console.error('Trigger bonus push error:', pushErr);
    }

    return NextResponse.json({
      message: `Bonus of Rs ${numAmount.toLocaleString()} PKR awarded to ${targetMember.name}`,
      claim,
      newWalletBalancePKR: targetMember.wallet.balancePKR,
    }, { status: 201 });
  } catch (err) {
    console.error('Award bonus error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
