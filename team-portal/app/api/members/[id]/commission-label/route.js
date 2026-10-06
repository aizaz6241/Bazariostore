import { NextResponse } from 'next/server';
import { getAuthSession, forgetSessions } from '@/lib/auth';
import Member from '@/lib/models/Member';
import SellerAssignment from '@/lib/models/SellerAssignment';
import { logFinance, flushFinanceAlertsSoon } from '@/lib/utils/financeLog';

export const dynamic = 'force-dynamic';

export async function PUT(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden. Admin access required.' }, { status: 403 });
    }

    const { id } = params;
    const body = await req.json();
    const { commissionLabel } = body;

    if (!['inr_50', 'pkr_1to1'].includes(commissionLabel)) {
      return NextResponse.json(
        { message: 'Invalid commission agreement. Allowed values: inr_50, pkr_1to1' },
        { status: 400 }
      );
    }

    const member = await Member.findById(id);
    if (!member) {
      return NextResponse.json({ message: 'Member not found' }, { status: 404 });
    }

    const previousLabel = member.commissionLabel || 'pkr_1to1';
    member.commissionLabel = commissionLabel;
    await member.save();
    forgetSessions(member._id);

    if (previousLabel !== commissionLabel) {
      await logFinance({
        session,
        action: 'member.updated',
        summary: `Member “${member.name}”: deal changed to ${commissionLabel === 'inr_50' ? '50% member' : '1:1 PKR member'}`,
        entity: 'member',
        entityId: member._id,
        before: { deal: previousLabel },
        after: { deal: commissionLabel },
      });
      await flushFinanceAlertsSoon();
    }

    // Sync all active store assignments for this member
    await SellerAssignment.updateMany(
      { memberId: member._id, status: 'active' },
      { $set: { commissionLabel } }
    );

    const safeMember = member.toObject();
    delete safeMember.passwordHash;

    return NextResponse.json({
      message: `Member "${member.name}" commission agreement updated to ${
        commissionLabel === 'inr_50' ? '50% INR Split Deal' : '1:1 PKR Fixed Deal'
      }`,
      member: safeMember,
      commissionLabel,
    });
  } catch (err) {
    console.error('Update member commission label error:', err);
    return NextResponse.json({ message: err.message || 'Failed to update commission label' }, { status: 500 });
  }
}
