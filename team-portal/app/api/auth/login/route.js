import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import Member from '@/lib/models/Member';
import { comparePassword, signToken } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import mongoose from 'mongoose';

export const dynamic = 'force-dynamic';

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function POST(req) {
  try {
    // ─── Rate Limiting (Prevent Brute-Force Password Guessing) ───
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               req.headers.get('x-real-ip') ||
               'unknown_ip';

    const rl = checkRateLimit(`login_${ip}`, 12, 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { message: 'Too many login attempts. Please wait a minute before trying again.' },
        { status: 429 }
      );
    }

    await connectDB();
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ message: 'Username / Email and password are required' }, { status: 400 });
    }

    const cleanInput = username.trim().toLowerCase();
    const escapedInput = escapeRegex(cleanInput);
    const db = mongoose.connection.db;

    // ─── 1. Check Main Ecommerce Platform 'admins' Collection First ───
    // Allows any admin (e.g. admin@bazario.com, abdullah@bazario.com, steve123@gmail.com)
    // to login directly with their own separate credentials and maintain their own distinct profile & communications.
    const ecommerceAdmin = await db.collection('admins').findOne({
      $or: [
        { email: cleanInput },
        { email: cleanInput.includes('@') ? cleanInput : `${cleanInput}@bazario.com` },
        { name: new RegExp(`^${escapedInput}$`, 'i') },
      ],
    });

    if (ecommerceAdmin) {
      const isMatch = await comparePassword(password, ecommerceAdmin.passwordHash);
      if (isMatch) {
        const cleanEmail = (ecommerceAdmin.email || '').toLowerCase().trim();
        const baseUsername = cleanEmail.split('@')[0].toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        const adminName = ecommerceAdmin.name || baseUsername;

        // Ensure distinct synchronized PortalMember record exists for this specific admin
        let portalMember = await Member.findOne({ ecommerceAdminId: ecommerceAdmin._id });

        if (!portalMember) {
          portalMember = await Member.findOne({
            $or: [
              { email: cleanEmail },
              { username: baseUsername },
            ],
          });
        }

        if (!portalMember) {
          portalMember = await Member.create({
            name: adminName,
            username: baseUsername,
            email: cleanEmail,
            ecommerceAdminId: ecommerceAdmin._id,
            passwordHash: ecommerceAdmin.passwordHash,
            role: 'admin',
            phone: ecommerceAdmin.phone || '',
            active: ecommerceAdmin.active !== false,
            wallet: { balancePKR: 0, totalDepositsPKR: 0, totalWithdrawalsPKR: 0, totalBonusesPKR: 0 },
            lastLoginAt: new Date(),
          });
        } else {
          portalMember.ecommerceAdminId = ecommerceAdmin._id;
          portalMember.name = adminName;
          portalMember.email = cleanEmail;
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
          email: portalMember.email,
          ecommerceAdminId: ecommerceAdmin._id,
        });

        const safeMember = portalMember.toObject();
        delete safeMember.passwordHash;
        delete safeMember.plainPassword;

        const response = NextResponse.json({
          message: `Welcome ${portalMember.name}! Logged in as Administrator.`,
          token,
          member: safeMember,
        });

        response.cookies.set('portal_token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60,
          path: '/',
        });

        return response;
      }
    }

    // ─── 2. Check Portal Members Collection (For Agents / Members created by Admins) ───
    const member = await Member.findOne({
      $or: [
        { username: cleanInput },
        { email: cleanInput },
        { name: new RegExp(`^${escapedInput}$`, 'i') },
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
      email: member.email || '',
    });

    const safeMember = member.toObject();
    delete safeMember.passwordHash;
    delete safeMember.plainPassword;

    const response = NextResponse.json({
      message: 'Logged in successfully',
      token,
      member: safeMember,
    });

    response.cookies.set('portal_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
