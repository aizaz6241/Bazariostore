import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import Member from '@/lib/models/Member';
import { comparePassword, signToken } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import mongoose from 'mongoose';
import { isActivePartner } from '@/lib/partners';

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
    const body = await req.json();
    // plain text only (an object here could be read by the database as "match anything")
    const username = typeof body?.username === 'string' ? body.username : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!username || !password) {
      return NextResponse.json({ message: 'Username / Email and password are required' }, { status: 400 });
    }

    const cleanInput = username.trim().toLowerCase().slice(0, 200);
    const escapedInput = escapeRegex(cleanInput);

    // Wrong passwords for one account: 10 in 15 minutes from one address, then a wait
    const accountKey = `login_fail_${ip}_${cleanInput}`;
    const failed = checkRateLimit(accountKey, 10, 15 * 60 * 1000, { peek: true });
    if (!failed.allowed) {
      return NextResponse.json({ message: 'Too many wrong attempts for this account. Please try again in 15 minutes.' }, { status: 429 });
    }
    const countFailure = () => checkRateLimit(accountKey, 10, 15 * 60 * 1000);
    const db = mongoose.connection.db;

    // ─── 1. Check Main Ecommerce Platform 'admins' Collection First ───
    // Allows any admin (e.g. admin@bazario.com, abdullah@bazario.com, steve123@gmail.com)
    // to login directly with their own separate credentials and maintain their own distinct profile & communications.
    let ecommerceAdmin = await db.collection('admins').findOne({
      $or: [
        { email: cleanInput },
        { email: cleanInput.includes('@') ? cleanInput : `${cleanInput}@bazario.com` },
        { name: new RegExp(`^${escapedInput}$`, 'i') },
      ],
    });

    // A partner may also type their portal username: find the store admin account behind it, so
    // the password is always checked against that account (its current password and status).
    if (!ecommerceAdmin) {
      const mirror = await Member.findOne({
        role: 'admin',
        ecommerceAdminId: { $ne: null },
        $or: [{ username: cleanInput }, { email: cleanInput }],
      })
        .select('ecommerceAdminId')
        .lean();
      if (mirror?.ecommerceAdminId) ecommerceAdmin = await db.collection('admins').findOne({ _id: mirror.ecommerceAdminId });
    }

    // Only an ACTIVE FINANCE PARTNER logs in here as an administrator. A disabled account, or a
    // staff account (support, orders, ...), has no team portal access.
    if (ecommerceAdmin && !isActivePartner(ecommerceAdmin)) {
      const okPassword = await comparePassword(password, ecommerceAdmin.passwordHash);
      if (okPassword) {
        return NextResponse.json(
          { message: ecommerceAdmin.active === false ? 'Account is deactivated. Please contact administrator.' : 'This account has no team portal access. The team portal is for finance partners and team members.' },
          { status: 403 }
        );
      }
    }

    if (ecommerceAdmin && isActivePartner(ecommerceAdmin)) {
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
            active: true,
            wallet: { balancePKR: 0, totalDepositsPKR: 0, totalWithdrawalsPKR: 0, totalBonusesPKR: 0 },
            lastLoginAt: new Date(),
          });
        } else {
          portalMember.ecommerceAdminId = ecommerceAdmin._id;
          portalMember.name = adminName;
          portalMember.email = cleanEmail;
          portalMember.passwordHash = ecommerceAdmin.passwordHash;
          portalMember.role = 'admin';
          portalMember.active = true;
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
      countFailure();
      return NextResponse.json({ message: 'Invalid username/email or password' }, { status: 401 });
    }

    // An admin row in the members list is only a mirror of a store admin account: it can log in
    // only through the partner check above, never with its own copy of the password.
    if (member.role === 'admin' && member.ecommerceAdminId) {
      countFailure();
      return NextResponse.json({ message: 'Invalid username/email or password' }, { status: 401 });
    }

    if (!member.active) {
      return NextResponse.json({ message: 'Account is deactivated. Please contact administrator.' }, { status: 403 });
    }

    const isMatch = await comparePassword(password, member.passwordHash);
    if (!isMatch) {
      countFailure();
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
