import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getAuthSession } from '@/lib/auth';
import RewardClaim from '@/lib/models/RewardClaim';
import Member from '@/lib/models/Member';
import { logFinance, flushFinanceAlertsSoon } from '@/lib/utils/financeLog';

export const dynamic = 'force-dynamic';

// PATCH /api/rewards/:id — fix a WAITING reward before it is approved: give it to another person
// and/or change the amount. Nothing has been counted yet, so one admin can do it (it is logged).
export async function PATCH(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden. Admin access required.' }, { status: 403 });
    }
    const { id } = params;
    if (!mongoose.Types.ObjectId.isValid(String(id))) return NextResponse.json({ message: 'Reward not found' }, { status: 404 });
    const body = await req.json().catch(() => ({}));
    const note = String(body.note || '').trim().slice(0, 300);

    const claim = await RewardClaim.findById(id);
    if (!claim) return NextResponse.json({ message: 'Reward not found' }, { status: 404 });

    // a device gift that was approved: mark it handed over
    if (body.giftDelivered === true) {
      if (claim.rewardType !== 'device_gift' || claim.status !== 'approved') return NextResponse.json({ message: 'Only an approved device gift can be marked as handed over' }, { status: 400 });
      if (claim.gift?.status === 'delivered') return NextResponse.json({ message: 'Already marked as handed over' }, { status: 400 });
      claim.gift = { ...(claim.gift?.toObject ? claim.gift.toObject() : claim.gift || {}), status: 'delivered', deliveredAt: new Date() };
      claim.history = [...(claim.history || []), { at: new Date(), by: session.name || '', action: 'gift delivered', note }];
      await claim.save();
      await logFinance({ session, action: 'bonus.gift_delivered', summary: `Handed over the gift “${claim.title}”`, entity: 'bonus', entityId: claim._id });
      await flushFinanceAlertsSoon();
      return NextResponse.json({ message: 'Marked as handed over.', claim });
    }

    if (claim.status !== 'pending') {
      return NextResponse.json(
        { message: claim.status === 'approved' ? 'This reward is already approved. Use “Take back” or “Move to another person”.' : 'This reward is closed.' },
        { status: 400 }
      );
    }

    const before = { memberId: String(claim.memberId), amountPKR: claim.amountPKR };
    const after = { ...before };
    const words = [];

    if (body.memberId && String(body.memberId) !== String(claim.memberId)) {
      if (!mongoose.Types.ObjectId.isValid(String(body.memberId))) return NextResponse.json({ message: 'Person not found' }, { status: 404 });
      const [from, to] = await Promise.all([Member.findById(claim.memberId).select('name').lean(), Member.findById(body.memberId).select('name').lean()]);
      if (!to) return NextResponse.json({ message: 'Person not found' }, { status: 404 });
      claim.memberId = to._id;
      after.memberId = String(to._id);
      words.push(`person ${from?.name || '?'} → ${to.name}`);
    }
    if (body.amountPKR !== undefined && body.amountPKR !== null && body.amountPKR !== '') {
      const amt = Math.round(Number(body.amountPKR));
      if (!Number.isFinite(amt) || amt < 1) return NextResponse.json({ message: 'Enter a valid amount (PKR)' }, { status: 400 });
      const isGift = claim.rewardType === 'device_gift';
      if (amt !== claim.amountPKR || (isGift && claim.gift?.costEntered !== true)) {
        words.push(isGift ? `purchase cost Rs ${amt.toLocaleString()}` : `amount Rs ${claim.amountPKR.toLocaleString()} → Rs ${amt.toLocaleString()}`);
        claim.amountPKR = amt;
        after.amountPKR = amt;
        if (isGift) {
          // the real price of the device that was bought (approval needs it)
          claim.gift = { ...(claim.gift?.toObject ? claim.gift.toObject() : claim.gift || {}), costEntered: true, status: 'purchased', purchasedAt: new Date() };
        }
      }
    }
    if (!words.length) return NextResponse.json({ message: 'Nothing changed' }, { status: 400 });

    claim.history = [...(claim.history || []), { at: new Date(), by: session.name || '', action: 'edited', note, from: before, to: after }];
    await claim.save();

    await logFinance({
      session,
      action: 'bonus.edited',
      summary: `Changed the waiting reward “${claim.title}”: ${words.join(', ')}${note ? ` (${note})` : ''}`,
      entity: 'bonus',
      entityId: claim._id,
      before,
      after,
    });
    await flushFinanceAlertsSoon();

    return NextResponse.json({ message: `Reward updated: ${words.join(', ')}`, claim });
  } catch (err) {
    console.error('Edit reward error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
