import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { connectDB } from './db.js';
import Member from './models/Member.js';

const JWT_SECRET = process.env.JWT_SECRET || 'bazario_super_secure_jwt_secret_2026_xyz';

export async function hashPassword(plain) {
  return await bcrypt.hash(plain, 10);
}

export async function comparePassword(plain, hashed) {
  return await bcrypt.compare(plain, hashed);
}

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

export async function getAuthSession(req) {
  await connectDB();

  let token = null;

  // 1. Check Authorization header
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // 2. Check Cookie
  if (!token) {
    const cookieHeader = req.headers.get('cookie') || '';
    const match = cookieHeader.match(/portal_token=([^;]+)/);
    if (match) {
      token = match[1];
    }
  }

  if (!token) return null;

  const decoded = verifyToken(token);
  if (!decoded || !decoded.id) return null;

  let member = await Member.findById(decoded.id).select('-passwordHash -plainPassword');

  // Robust fallback: if token had an older ID, lookup by ecommerceAdminId or email
  if (!member && decoded.ecommerceAdminId) {
    member = await Member.findOne({ ecommerceAdminId: decoded.ecommerceAdminId }).select('-passwordHash -plainPassword');
  }
  if (!member && decoded.email) {
    member = await Member.findOne({ email: decoded.email.toLowerCase() }).select('-passwordHash -plainPassword');
  }

  if (!member || !member.active) return null;

  return member;
}
