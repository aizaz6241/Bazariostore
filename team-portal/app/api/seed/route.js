import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import Member from '@/lib/models/Member';
import ModelProfile from '@/lib/models/ModelProfile';
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

    // 3. Ensure Sample Models exist
    const modelCount = await ModelProfile.countDocuments();
    if (modelCount === 0) {
      await ModelProfile.create([
        {
          name: 'Priya Sharma',
          age: 23,
          dob: '2003-05-14',
          location: 'Mumbai, India',
          familyDetails: 'Living with parents, elder brother',
          occupation: 'Fashion Model & Content Creator',
          moreDetails: 'Specializes in ethnic Indian wear, bridal jewellery, and luxury apparel shoots.',
          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80',
          photos: [
            {
              url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1200&q=80',
              title: 'Editorial Portrait',
            },
            {
              url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80',
              title: 'Casual Studio Look',
            },
            {
              url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1200&q=80',
              title: 'Outdoor Sunlight Session',
            },
          ],
          createdBy: admin._id,
        },
        {
          name: 'Aanya Kapoor',
          age: 25,
          dob: '2001-09-22',
          location: 'Delhi, India',
          familyDetails: 'Independent living, business background family',
          occupation: 'Commercial E-Commerce Model',
          moreDetails: 'Worked with top regional beauty and fashion brands.',
          avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80',
          photos: [
            {
              url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=1200&q=80',
              title: 'Studio Headshot',
            },
            {
              url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=1200&q=80',
              title: 'Minimalist Fashion',
            },
          ],
          createdBy: admin._id,
        },
      ]);
    }

    // 4. Auto-assign any unassigned existing sellers to member1 for testing if needed
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
