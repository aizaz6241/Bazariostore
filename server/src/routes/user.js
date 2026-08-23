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

const router = Router();

const signUser = (u) =>
  jwt.sign({ t: 'user', id: u._id, name: u.name, email: u.email }, process.env.JWT_SECRET, { expiresIn: '365d' });

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
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST /api/user/send-otp (Send / Resend OTP to customer email)
router.post('/send-otp', async (req, res) => {
  try {
    const email = cleanEmail(req.body?.email);
    const name = (req.body?.name || 'Customer').trim();
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
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body || {};
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
    const email = cleanEmail(req.body?.email);
    const password = String(req.body?.password || '');
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    const ok = user && user.active !== false && (await comparePassword(password, user.passwordHash));
    if (!ok) {
      console.log(`[user-login-failed] email="${email}"`);
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    res.json({ token: signUser(user), user: publicUser(user) });
  } catch (err) {
    console.error('[user-login-error]', err);
    res.status(500).json({ message: err.message || 'Login failed. Please try again.' });
  }
});

// POST /api/user/forgot (Password recovery with real email link & 6-digit OTP)
router.post('/forgot', async (req, res) => {
  try {
    const email = cleanEmail(req.body?.email);
    if (!email) return res.status(400).json({ message: 'Please provide your registered email address' });

    const user = await User.findOne({ email });
    if (!user) {
      return res.json({
        ok: true,
        message: 'If an account with this email exists, password reset instructions have been sent.',
      });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const otp = generateOtp();
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 60 mins

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

    res.json({
      ok: true,
      message: `Password reset instructions and 6-digit recovery code have been sent to ${email}.`,
    });
  } catch (err) {
    console.error('[forgot-password-error]', err);
    res.status(500).json({ message: 'Failed to process password reset request. ' + err.message });
  }
});

// POST /api/user/reset (Reset password with token OR OTP)
router.post('/reset', async (req, res) => {
  try {
    const { token, otp, email, password } = req.body || {};
    if ((password || '').length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    let user = null;
    if (token) {
      user = await User.findOne({ resetToken: token, resetExpires: { $gt: new Date() } });
    } else if (otp && email) {
      const clean = cleanEmail(email);
      user = await User.findOne({
        email: clean,
        'resetOtp.code': String(otp).trim(),
        'resetOtp.expiresAt': { $gt: new Date() },
      });
    }

    if (!user) {
      return res.status(400).json({ message: 'Password reset link or verification code is invalid or has expired.' });
    }

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
  const { name, phone } = req.body || {};
  const user = await User.findById(req.user.id);
  if (name?.trim()) user.name = name.trim();
  user.phone = (phone || '').trim();
  await user.save();
  res.json({ user: publicUser(user), token: signUser(user) });
});

router.put('/me/password', authUser, async (req, res) => {
  const { current, next } = req.body || {};
  const user = await User.findById(req.user.id);
  if (!(await bcrypt.compare(current || '', user.passwordHash))) return res.status(400).json({ message: 'Current password ghalat hai' });
  if ((next || '').length < 6) return res.status(400).json({ message: 'Naya password kam az kam 6 characters ka hona chahiye' });
  user.passwordHash = await bcrypt.hash(next, 10);
  await user.save();
  res.json({ ok: true });
});

// --- addresses ---
router.post('/me/addresses', authUser, async (req, res) => {
  const user = await User.findById(req.user.id);
  const addr = req.body || {};
  if (addr.isDefault) user.addresses.forEach((a) => (a.isDefault = false));
  user.addresses.push(addr);
  await user.save();
  res.json({ addresses: user.addresses });
});

router.put('/me/addresses/:addrId', authUser, async (req, res) => {
  const user = await User.findById(req.user.id);
  const a = user.addresses.id(req.params.addrId);
  if (!a) return res.status(404).json({ message: 'Address not found' });
  if (req.body.isDefault) user.addresses.forEach((x) => (x.isDefault = false));
  Object.assign(a, req.body);
  await user.save();
  res.json({ addresses: user.addresses });
});

router.delete('/me/addresses/:addrId', authUser, async (req, res) => {
  const user = await User.findById(req.user.id);
  user.addresses.id(req.params.addrId)?.deleteOne();
  await user.save();
  res.json({ addresses: user.addresses });
});

// --- order history ---
router.get('/me/orders', authUser, async (req, res) => {
  const user = await User.findById(req.user.id);
  const orders = await Order.find({
    $or: [{ user: req.user.id }, { 'contact.email': user.email }],
  })
    .sort({ createdAt: -1 })
    .limit(50);
  res.json(orders);
});

export default router;
