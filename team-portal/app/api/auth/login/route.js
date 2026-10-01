import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import Member from '@/lib/models/Member';
import { comparePassword, hashPassword, signToken } from '@/lib/auth';
import mongoose from 'mongoose';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    await connectDB();
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ message: 'Username / Email and password are required' }, { status: 400 });
    }

    const cleanInput = username.trim().toLowerCase();
    const db = mongoose.connection.db;

    // ─── 1. Check Main Ecommerce Platform 'admins' Collection First ───
    // Allows any admin from the main website (e.g. admin@bazario.com, abdullah@bazario.com, etc.)
    // to login directly with their existing credentials without creating an account
    const ecommerceAdmin = await db.collection('admins').findOne({
      $or: [
        { email: cleanInput },
        { email: cleanInput.includes('@') ? cleanInput : `${cleanInput}@bazario.com` },
        { name: new RegExp(`^${cleanInput}$`, 'i') },
      ],
    });

    if (ecommerceAdmin) {
      const isMatch = await comparePassword(password, ecommerceAdmin.passwordHash);
      if (isMatch) {
        // Ensure synchronized PortalMember record exists for foreign keys and chat
        let portalMember = await Member.findOne({
          $or: [
            { username: cleanInput },
            { username: ecommerceAdmin.email.split('@')[0] },
            { name: ecommerceAdmin.name },
          ],
        });

        if (!portalMember) {
          portalMember = await Member.create({
            name: ecommerceAdmin.name || 'Ecommerce Admin',
            username: ecommerceAdmin.email.split('@')[0],
            passwordHash: ecommerceAdmin.passwordHash,
            role: 'admin',
            phone: ecommerceAdmin.phone || '',
            wallet: { balancePKR: 0, totalDepositsPKR: 0, totalWithdrawalsPKR: 0, totalBonusesPKR: 0 },
            lastLoginAt: new Date(),
          });
        } else {
          portalMember.passwordHash = ecommerceAdmin.passwordHash;
          portalMember.role = 'admin';
          portalMember.lastLoginAt = new Date();
          await portalMember.save();
        }

        const token = signToken({
          id: portalMember._id,
          name: portalMember.name,
          username: portalMember.username,
          role: 'admin',
          ecommerceAdminId: ecommerceAdmin._id,
        });

        const safeMember = portalMember.toObject();
        delete safeMember.passwordHash;

        const response = NextResponse.json({
          message: 'Welcome Administrator! Logged in with Ecommerce Admin credentials.',
          token,
          member: safeMember,
        });

        response.cookies.set('portal_token', token, {
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 30 * 24 * 60 * 60,
          path: '/',
        });

        return response;
      }
    }

    // ─── 2. Check Portal Members Collection (For Agents / Members created by Admin) ───
    const member = await Member.findOne({
      $or: [
        { username: cleanInput },
        { name: new RegExp(`^${cleanInput}$`, 'i') },
      ],
    });

    if (!member) {
      return NextResponse.json({ message: 'Invalid username/email or password' }, { status: 401 });
    }

    if (!member.active) {
      return NextResponse.json({ message: 'Account is deactivated. Please contact administrator.' }, { status: 403 });
    }

    const isMatch = await comparePassword(password, member.passwordHash);
    if (!isMatch) {
      return NextResponse.json({ message: 'Invalid username/email or password' }, { status: 401 });
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
