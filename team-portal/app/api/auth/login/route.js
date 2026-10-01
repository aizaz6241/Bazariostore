import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import Member from '@/lib/models/Member';
import { comparePassword, hashPassword, signToken } from '@/lib/auth';

export async function POST(req) {
  try {
    await connectDB();
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ message: 'Username and password are required' }, { status: 400 });
    }

    const cleanUsername = username.trim().toLowerCase();

    // Check if any admin exists in the system; if not, create default Super Admin
    const adminCount = await Member.countDocuments({ role: 'admin' });
    if (adminCount === 0) {
      const defaultPasswordHash = await hashPassword('admin123');
      await Member.create({
        name: 'Super Admin',
        username: 'admin',
        passwordHash: defaultPasswordHash,
        plainPassword: 'admin123',
        role: 'admin',
        phone: '+92 300 0000000',
        wallet: { balancePKR: 0, totalDepositsPKR: 0, totalWithdrawalsPKR: 0, totalBonusesPKR: 0 },
      });
      console.log('🌟 [Seed] Initial Super Admin created (username: admin, password: admin123)');
    }

    const member = await Member.findOne({ username: cleanUsername });
    if (!member) {
      return NextResponse.json({ message: 'Invalid username or password' }, { status: 401 });
    }

    if (!member.active) {
      return NextResponse.json({ message: 'Account is deactivated. Please contact admin.' }, { status: 403 });
    }

    const isMatch = await comparePassword(password, member.passwordHash);
    if (!isMatch) {
      return NextResponse.json({ message: 'Invalid username or password' }, { status: 401 });
    }

    member.lastLoginAt = new Date();
    await member.save();

    const token = signToken({
      id: member._id,
      name: member.name,
      username: member.username,
      role: member.role,
    });

    const safeMember = member.toObject();
    delete safeMember.passwordHash;

    const response = NextResponse.json({
      message: 'Logged in successfully',
      token,
      member: safeMember,
    });

    // Set cookie for convenience
    response.cookies.set('portal_token', token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ message: err.message || 'Internal server error' }, { status: 500 });
  }
}
