import { NextResponse } from 'next/server';
import { getAuthSession, hashPassword, forgetSessions } from '@/lib/auth';
import Member from '@/lib/models/Member';
import SellerAssignment from '@/lib/models/SellerAssignment';
import mongoose from 'mongoose';
import { logFinance, flushFinanceAlertsSoon } from '@/lib/utils/financeLog';

export const dynamic = 'force-dynamic';

// PATCH /api/members/[id] — Admin edits member password, name, phone, or status
export async function PATCH(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden. Admin access required.' }, { status: 403 });
    }

    const { id } = params;
    const body = await req.json();
    const { password, name, phone, active, commissionLabel } = body;

    const member = await Member.findById(id);
    if (!member) {
      return NextResponse.json({ message: 'Member not found' }, { status: 404 });
    }

    const isSelf = session._id.toString() === member._id.toString();
    const changes = [];
    const beforeState = { active: member.active !== false, commissionLabel: member.commissionLabel || 'pkr_1to1', name: member.name };

    // A partner's login belongs to that partner only: nobody else can change the password or
    // switch the account off from here (otherwise one partner could log in as the other).
    if (member.role === 'admin' && !isSelf && (password || active !== undefined)) {
      return NextResponse.json(
        { message: 'A partner’s password and status can only be changed by that partner (or from Staff in the store admin panel).' },
        { status: 403 }
      );
    }

    // 1. Password update
    if (password) {
      changes.push('password changed');
      if (password.length < 6) {
        return NextResponse.json({ message: 'Password must be at least 6 characters long' }, { status: 400 });
      }
      const newHash = await hashPassword(password);
      member.passwordHash = newHash;

      // If updating an admin, also sync to ecommerce 'admins' collection
      if (member.role === 'admin') {
        try {
          const db = mongoose.connection.db;
          const query = member.ecommerceAdminId
            ? { _id: member.ecommerceAdminId }
            : {
                $or: [
                  { email: member.email || `${member.username}@bazario.com` },
                  { name: member.name },
                ],
              };
          await db.collection('admins').updateOne(
            query,
            { $set: { passwordHash: newHash, updatedAt: new Date() } }
          );
        } catch (syncErr) {
          console.error('Failed to sync admin password in ecommerce db:', syncErr.message);
        }
      }
    }

    // 2. Name update
    if (name && name.trim()) {
      member.name = name.trim();
    }

    // 3. Phone update
    if (phone !== undefined) {
      member.phone = phone.trim();
    }

    // 4. Status toggle
    if (active !== undefined) {
      if (Boolean(active) !== beforeState.active) changes.push(Boolean(active) ? 'account switched on' : 'account switched off');
      member.active = Boolean(active);
    }

    // 5. Commission Agreement Label (Deal between Admin and Member: 'pkr_1to1' or 'inr_50')
    if (commissionLabel && ['inr_50', 'pkr_1to1'].includes(commissionLabel)) {
      if (commissionLabel !== beforeState.commissionLabel) changes.push(`deal changed to ${commissionLabel === 'inr_50' ? '50% member' : '1:1 PKR member'}`);
      member.commissionLabel = commissionLabel;
      // Sync active assignments for this member
      await SellerAssignment.updateMany(
        { memberId: member._id, status: 'active' },
        { $set: { commissionLabel } }
      );
    }

    await member.save();
    forgetSessions(member._id);

    if (changes.length > 0) {
      await logFinance({
        session,
        action: 'member.updated',
        summary: `${member.role === 'admin' ? 'Partner' : 'Member'} “${member.name}”: ${changes.join(', ')}`,
        entity: 'member',
        entityId: member._id,
        before: { active: beforeState.active, deal: beforeState.commissionLabel },
        after: { active: member.active !== false, deal: member.commissionLabel || 'pkr_1to1' },
      });
      await flushFinanceAlertsSoon();
    }

    const safeMember = member.toObject();
    delete safeMember.passwordHash;

    return NextResponse.json({
      message: 'Member updated successfully',
      member: safeMember,
    });
  } catch (err) {
    console.error('Update member error:', err);
    return NextResponse.json({ message: err.message || 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/members/[id] — Admin deletes a team member
export async function DELETE(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden. Admin access required.' }, { status: 403 });
    }

    const { id } = params;

    // Safeguard 1: Admin cannot delete their own account
    if (session._id.toString() === id.toString()) {
      return NextResponse.json({ message: 'You cannot delete your own account.' }, { status: 400 });
    }

    const member = await Member.findById(id);
    if (!member) {
      return NextResponse.json({ message: 'Member not found' }, { status: 404 });
    }

    // Safeguard 2: Prevent deletion of primary platform admins via members portal
    if (member.role === 'admin' && member.ecommerceAdminId) {
      return NextResponse.json({
        message: 'Cannot delete primary platform administrator account from team management.',
      }, { status: 400 });
    }

    const hadSellers = await SellerAssignment.countDocuments({ memberId: member._id, status: 'active' });

    // Release any client store assignments so they can be reassigned
    await SellerAssignment.deleteMany({ memberId: member._id });

    // Delete the member record
    await Member.findByIdAndDelete(member._id);
    forgetSessions(member._id);

    await logFinance({
      session,
      action: 'member.deleted',
      summary: `Deleted ${member.role === 'admin' ? 'admin' : 'member'} “${member.name}” (${hadSellers} assigned ${hadSellers === 1 ? 'seller' : 'sellers'} became unassigned)`,
      entity: 'member',
      entityId: member._id,
      before: {
        name: member.name,
        username: member.username,
        role: member.role,
        deal: member.commissionLabel || 'pkr_1to1',
        walletUSDT: member.wallet?.balanceUSDT || 0,
        activeSellers: hadSellers,
      },
    });
    await flushFinanceAlertsSoon();

    return NextResponse.json({
      message: `Member "${member.name}" deleted successfully. Any assigned stores have been unassigned.`,
    });
  } catch (err) {
    console.error('Delete member error:', err);
    return NextResponse.json({ message: err.message || 'Internal server error' }, { status: 500 });
  }
}
