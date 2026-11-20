import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import Member from '@/lib/models/Member';
import { Seller } from '@/lib/models/SharedModels';
import SellerAssignment from '@/lib/models/SellerAssignment';
import { getAuthSession, hashPassword } from '@/lib/auth';

export async function POST(req) {
  try {
    // Demo data (a default admin, a sample member with a known password, sample sellers handed to
    // that member). Never on the live site unless it is switched on by hand for a moment.
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PORTAL_SEED !== 'yes') {
      return NextResponse.json({ message: 'Seeding is switched off on the live site.' }, { status: 403 });
    }

    await connectDB();

    // 0. Security Guard: If admin already exists, require authenticated admin session
    const existingAdminCount = await Member.countDocuments({ role: 'admin' });
    if (existingAdminCount > 0) {
      const session = await getAuthSession(req);
      if (!session || session.role !== 'admin') {
        return NextResponse.json(
          { message: 'Forbidden. Database is already seeded. Admin authentication required.' },
          { status: 403 }
        );
      }
    }

    // 1. Ensure Super Admin exists
    let admin = await Member.findOne({ role: 'admin' });
    if (!admin) {
      const pwd = await hashPassword('admin123');
      admin = await Member.create({
        name: 'Super Admin',
        username: 'admin',
        passwordHash: pwd,
        role: 'admin',
        phone: '+92 300 1234567',
        wallet: { balancePKR: 0, totalDepositsPKR: 0, totalWithdrawalsPKR: 0, totalBonusesPKR: 0 },
      });
    }

    // 2. Ensure at least one Member exists
    let member1 = await Member.findOne({ username: 'member1' });
    if (!member1) {
      const pwd1 = await hashPassword('member123');
      member1 = await Member.create({
        name: 'Ali Raza',
        username: 'member1',
        passwordHash: pwd1,
        role: 'member',
        phone: '+92 321 9876543',
        wallet: { balancePKR: 0, totalDepositsPKR: 0, totalWithdrawalsPKR: 0, totalBonusesPKR: 0 },
      });
    }

    // 3. Auto-assign any unassigned existing sellers to member1 for testing if needed
    const existingSellers = await Seller.find().limit(5);
    for (const seller of existingSellers) {
      const hasAssignment = await SellerAssignment.findOne({ sellerId: seller._id, status: 'active' });
      if (!hasAssignment) {
        await SellerAssignment.create({
          sellerId: seller._id,
          memberId: member1._id,
          assignedBy: admin._id,
          status: 'active',
          privateNotes: {
            customName: seller.storeName,
            age: '29',
            occupation: 'Retail Electronics Trader',
            maritalStatus: 'Married',
            location: seller.address?.city || 'Delhi',
            picture: '',
            details: 'Active buyer & trader, frequent deposits.',
          },
        });
      }
    }

    return NextResponse.json({
      message: 'Seed completed successfully',
      admin: { username: admin.username, role: admin.role },
      member: { username: member1.username, role: member1.role },
    });
  } catch (err) {
    console.error('Seed error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
