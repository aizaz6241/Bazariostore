import { NextResponse } from 'next/server';
import { getAuthSession, comparePassword, hashPassword } from '@/lib/auth';
import Member from '@/lib/models/Member';
import mongoose from 'mongoose';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { currentPassword, newPassword } = await req.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ message: 'Both current password and new password are required' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ message: 'New password must be at least 6 characters long' }, { status: 400 });
    }

    const member = await Member.findById(session._id);
    if (!member) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    // Verify current password
    const isMatch = await comparePassword(currentPassword, member.passwordHash);
    if (!isMatch) {
      return NextResponse.json({ message: 'Current password is incorrect' }, { status: 400 });
    }

    // Hash new password
    const newHash = await hashPassword(newPassword);
    member.passwordHash = newHash;
    member.plainPassword = newPassword;
    await member.save();

    // If user is an Admin, sync new password to the specific admin record in the main ecommerce 'admins' collection
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
      } catch (adminSyncErr) {
        console.error('Admin sync password error:', adminSyncErr.message);
      }
    }

    return NextResponse.json({ message: 'Password changed successfully!' });
  } catch (err) {
    console.error('Change password error:', err);
    return NextResponse.json({ message: err.message || 'Failed to change password' }, { status: 500 });
  }
}
