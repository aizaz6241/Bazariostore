import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Order from '../models/Order.js';
import { authUser } from '../middleware/auth.js';
import { notify } from '../utils/notify.js';
import { comparePassword, cleanEmail } from '../utils/password.js';
import { sendVerificationOtpEmail, sendPasswordResetEmail, sendWelcomeEmail } from '../services/email.service.js';
import { jwtSecret } from '../utils/secrets.js';
import { limit, failureLimiter } from '../utils/rateLimit.js';
import { asText } from '../middleware/sanitize.js';
import { publicOrder } from '../utils/publicOrder.js';

const loginGuard = failureLimiter({ name: 'user-login', max: 8, windowMs: 15 * 60 * 1000 });
const MAX_OTP_TRIES = 5;
const RESET_VALID_MS = 20 * 60 * 1000;
const signupLimit = limit({ name: 'user-signup', max: 10, windowMs: 60 * 60 * 1000 });
const recoveryLimit = limit({ name: 'user-recovery', max: 6, windowMs: 15 * 60 * 1000 });

const router = Router();

const signUser = (u) =>
  jwt.sign({ t: 'user', id: u._id, name: u.name, email: u.email }, jwtSecret(), { expiresIn: '365d' });

const publicUser = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  phone: u.phone || '',
  isEmailVerified: Boolean(u.isEmailVerified),
  addresses: u.addresses,
});

// Helper: Generate random 6-digit OTP
function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

// POST /api/user/send-otp (Send / Resend OTP to customer email)
router.post('/send-otp', signupLimit, async (req, res) => {
  try {
    const email = cleanEmail(asText(req.body?.email, 200));
    const name = (asText(req.body?.name, 80) || 'Customer').trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ message: 'A valid email address is required' });
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    let user = await User.findOne({ email });
    if (!user) {
      // Create user placeholder with isEmailVerified: false
      user = new User({
        name,
        email,
        passwordHash: await bcrypt.hash(crypto.randomBytes(8).toString('hex'), 10),
        isEmailVerified: false,
      });
    }

    user.emailOtp = { code: otp, expiresAt, attempts: 0 };
    await user.save();

    await sendVerificationOtpEmail({ to: email, name: user.name || name, otp, role: 'customer' });

    res.json({ ok: true, message: `Verification code sent to ${email}. Valid for 10 minutes.` });
  } catch (err) {
    console.error('[send-otp-error]', err);
    res.status(500).json({ message: 'Failed to send verification code. ' + err.message });
  }
});

// POST /api/user/verify-otp (Verify customer OTP)
router.post('/verify-otp', async (req, res) => {
  try {
    const email = cleanEmail(req.body?.email);
    const code = String(req.body?.otp || req.body?.code || '').trim();
    if (!email || !code) {
      return res.status(400).json({ message: 'Email and 6-digit verification code are required' });
    }

    const user = await User.findOne({ email });
    if (!user || !user.emailOtp?.code) {
      return res.status(400).json({ message: 'No pending verification code found. Please request a new code.' });
    }

    if (new Date() > new Date(user.emailOtp.expiresAt)) {
      return res.status(400).json({ message: 'Verification code has expired. Please request a new one.' });
    }

    if (user.emailOtp.attempts >= 5) {
      return res.status(400).json({ message: 'Too many invalid attempts. Please request a new verification code.' });
    }

    if (user.emailOtp.code !== code) {
      user.emailOtp.attempts = (user.emailOtp.attempts || 0) + 1;
      await user.save();
      return res.status(400).json({ message: 'Invalid verification code. Please check your email.' });
    }

    // Mark as verified
    user.isEmailVerified = true;
    user.emailOtp = undefined;
    await user.save();

    // Send Welcome Email
    sendWelcomeEmail({ to: user.email, name: user.name, role: 'customer' }).catch(() => {});

    res.json({
      ok: true,
      message: 'Email verified successfully! 🎉',
      token: signUser(user),
      user: publicUser(user),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/user/register (Customer Registration)
router.post('/register', signupLimit, async (req, res) => {
  try {
    const name = asText(req.body?.name, 80);
    const email = asText(req.body?.email, 200);
    const phone = asText(req.body?.phone, 40);
    const password = asText(req.body?.password, 200);
    if (!name?.trim() || !/^\S+@\S+\.\S+$/.test(email || '')) {
      return res.status(400).json({ message: 'Valid name and email required' });
    }
    if ((password || '').length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const clean = email.toLowerCase().trim();
    const existing = await User.findOne({ email: clean });
    if (existing && existing.isEmailVerified) {
      return res.status(400).json({ message: 'An account with this email already exists' });
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const passwordHash = await bcrypt.hash(password, 10);

    let user = existing;
    if (user) {
      user.name = name.trim();
      user.phone = (phone || '').trim();
      user.passwordHash = passwordHash;
      user.emailOtp = { code: otp, expiresAt, attempts: 0 };
    } else {
      user = new User({
        name: name.trim(),
        email: clean,
        phone: (phone || '').trim(),
        passwordHash,
        isEmailVerified: false,
        emailOtp: { code: otp, expiresAt, attempts: 0 },
      });
    }
    await user.save();

    // Send OTP verification email
    await sendVerificationOtpEmail({
      to: clean,
      name: user.name,
      otp,
      role: 'customer',
    });

    notify(req.app, {
      type: 'customer',
      title: 'New customer registration',
      body: `${user.name} (${user.email})`,
      link: '/admin',
    });

    res.status(201).json({
      ok: true,
      requiresOtp: true,
      email: clean,
      message: `Registration initiated! We sent a 6-digit verification code to ${clean}.`,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/user/login
router.post('/login', async (req, res) => {
  try {
    const email = cleanEmail(asText(req.body?.email, 200));
    const password = asText(req.body?.password, 200);
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    const blocked = loginGuard.check(req, email);
    if (blocked.blocked) return res.status(429).json({ message: blocked.message });

    const user = await User.findOne({
      $or: [{ email }, { email: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }],
    });
    const ok = user && user.active !== false && (await comparePassword(password, user.passwordHash));
    if (!ok) {
      console.log(`[user-login-failed] email="${email}"`);
      loginGuard.fail(req, email);
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    loginGuard.ok(req, email);
    res.json({ token: signUser(user), user: publicUser(user) });
  } catch (err) {
    console.error('[user-login-error]', err);
    res.status(500).json({ message: err.message || 'Login failed. Please try again.' });
  }
});

// POST /api/user/forgot (Password recovery with real email link & 6-digit OTP)
router.post('/forgot', recoveryLimit, async (req, res) => {
  try {
    const email = cleanEmail(asText(req.body?.email, 200));
    if (!email) return res.status(400).json({ message: 'Please provide your registered email address' });

    // Same answer whether or not the email is registered
    const sameAnswer = {
      ok: true,
      message: 'If an account with this email exists, password reset instructions have been sent.',
    };

    const user = await User.findOne({ email });
    if (!user) return res.json(sameAnswer);

    const token = crypto.randomBytes(24).toString('hex');
    const otp = generateOtp();
    const expires = new Date(Date.now() + RESET_VALID_MS); // 20 minutes

    user.resetToken = token;
    user.resetExpires = expires;
    user.resetOtp = { code: otp, expiresAt: expires, attempts: 0 };
    await user.save();

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const resetUrl = `${clientUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl,
      otp,
      role: 'user',
    });

    res.json(sameAnswer);
  } catch (err) {
    console.error('[forgot-password-error]', err);
    res.status(500).json({ message: 'Failed to process password reset request. Please try again.' });
  }
});

// POST /api/user/reset (Reset password with token OR OTP)
router.post('/reset', recoveryLimit, async (req, res) => {
  try {
    // Plain text only: an object sent as "token" used to match any account with a reset in progress
    const token = asText(req.body?.token, 200).trim();
    const otp = asText(req.body?.otp, 12).trim();
    const email = cleanEmail(asText(req.body?.email, 200));
    const password = asText(req.body?.password, 200);
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const invalid = () => res.status(400).json({ message: 'Password reset link or verification code is invalid or has expired.' });
    const now = new Date();

    let user = null;
    if (token.length >= 32) {
      user = await User.findOne({ resetToken: token, resetExpires: { $gt: now } });
    } else if (/^\d{6}$/.test(otp) && email) {
      const candidate = await User.findOne({ email });
      const saved = candidate?.resetOtp;
      if (!candidate || !saved?.code || !saved.expiresAt || new Date(saved.expiresAt) <= now) return invalid();
      if ((saved.attempts || 0) >= MAX_OTP_TRIES) {
        await User.updateOne({ _id: candidate._id }, { $unset: { resetOtp: 1, resetToken: 1, resetExpires: 1 } });
        return res.status(400).json({ message: 'Too many wrong codes. Please request a new recovery code.' });
      }
      const a = Buffer.from(String(saved.code));
      const b = Buffer.from(otp);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        await User.updateOne({ _id: candidate._id }, { $inc: { 'resetOtp.attempts': 1 } });
        return invalid();
      }
      user = candidate;
    }

    if (!user) return invalid();

    user.passwordHash = await bcrypt.hash(password, 10);
    user.resetToken = undefined;
    user.resetExpires = undefined;
    user.resetOtp = undefined;
    await user.save();

    res.json({
      ok: true,
      message: 'Password updated successfully! You can now sign in with your new password.',
      token: signUser(user),
      user: publicUser(user),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// --- profile ---
router.get('/me', authUser, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'Account not found' });
  res.json({ user: publicUser(user) });
});

router.put('/me', authUser, async (req, res) => {
  const name = asText(req.body?.name, 80);
  const phone = asText(req.body?.phone, 40);
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'Account not found' });
  if (name?.trim()) user.name = name.trim();
  user.phone = (phone || '').trim();
  await user.save();
  res.json({ user: publicUser(user), token: signUser(user) });
});

router.put('/me/password', authUser, async (req, res) => {
  const current = asText(req.body?.current, 200);
  const next = asText(req.body?.next, 200);
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'Account not found' });
  if (!(await bcrypt.compare(current || '', user.passwordHash))) return res.status(400).json({ message: 'Current password ghalat hai' });
  if ((next || '').length < 6) return res.status(400).json({ message: 'Naya password kam az kam 6 characters ka hona chahiye' });
  user.passwordHash = await bcrypt.hash(next, 10);
  await user.save();
  res.json({ ok: true });
});

// --- addresses ---
router.post('/me/addresses', authUser, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'Account not found' });
  const addr = req.body || {};
  if (addr.isDefault) user.addresses.forEach((a) => (a.isDefault = false));
  user.addresses.push(addr);
  await user.save();
  res.json({ addresses: user.addresses });
});

router.put('/me/addresses/:addrId', authUser, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'Account not found' });
  const a = user.addresses.id(req.params.addrId);
  if (!a) return res.status(404).json({ message: 'Address not found' });
  if (req.body.isDefault) user.addresses.forEach((x) => (x.isDefault = false));
  Object.assign(a, req.body);
  await user.save();
  res.json({ addresses: user.addresses });
});

router.delete('/me/addresses/:addrId', authUser, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'Account not found' });
  user.addresses.id(req.params.addrId)?.deleteOne();
  await user.save();
  res.json({ addresses: user.addresses });
});

// --- order history ---
router.get('/me/orders', authUser, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'Account not found' });
  const orders = await Order.find({
    $or: [{ user: req.user.id }, { 'contact.email': user.email }],
  })
    .sort({ createdAt: -1 })
    .limit(50);
  res.json(orders.map(publicOrder));
});

export default router;
