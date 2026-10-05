import { NextResponse } from 'next/server';
import { getAuthSession, hashPassword } from '@/lib/auth';
import Member from '@/lib/models/Member';
import SellerAssignment from '@/lib/models/SellerAssignment';
import mongoose from 'mongoose';

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

    // 1. Password update
    if (password) {
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
      member.active = Boolean(active);
    }

    // 5. Commission Agreement Label (Deal between Admin and Member: 'pkr_1to1' or 'inr_50')
    if (commissionLabel && ['inr_50', 'pkr_1to1'].includes(commissionLabel)) {
      member.commissionLabel = commissionLabel;
      // Sync active assignments for this member
      await SellerAssignment.updateMany(
        { memberId: member._id, status: 'active' },
        { $set: { commissionLabel } }
      );
    }

    await member.save();

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

    // Release any client store assignments so they can be reassigned
    await SellerAssignment.deleteMany({ memberId: member._id });

    // Delete the member record
    await Member.findByIdAndDelete(member._id);

    return NextResponse.json({
      message: `Member "${member.name}" deleted successfully. Any assigned stores have been unassigned.`,
    });
  } catch (err) {
    console.error('Delete member error:', err);
    return NextResponse.json({ message: err.message || 'Internal server error' }, { status: 500 });
  }
}
