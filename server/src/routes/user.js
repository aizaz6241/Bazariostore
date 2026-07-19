import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Order from '../models/Order.js';
import { authUser } from '../middleware/auth.js';
import { notify } from '../utils/notify.js';
import { comparePassword, cleanEmail } from '../utils/password.js';

const router = Router();

const signUser = (u) =>
  jwt.sign({ t: 'user', id: u._id, name: u.name, email: u.email }, process.env.JWT_SECRET, { expiresIn: '30d' });

const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email, phone: u.phone || '', addresses: u.addresses });

// POST /api/user/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body || {};
    if (!name?.trim() || !/^\S+@\S+\.\S+$/.test(email || '')) return res.status(400).json({ message: 'Valid name and email required' });
    if ((password || '').length < 6) return res.status(400).json({ message: 'Password kam az kam 6 characters ka hona chahiye' });
    if (await User.findOne({ email: email.toLowerCase().trim() })) return res.status(400).json({ message: 'Is email se account pehle se bana hua hai' });
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: (phone || '').trim(),
      passwordHash: await bcrypt.hash(password, 10),
    });
    notify(req.app, { type: 'customer', title: 'New customer registered', body: `${user.name} (${user.email})`, link: '/admin' });
    res.status(201).json({ token: signUser(user), user: publicUser(user) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/user/login
router.post('/login', async (req, res) => {
  const email = cleanEmail(req.body?.email);
  const password = String(req.body?.password || '');
  const user = await User.findOne({ email });
  // mobile keyboards spaces / invisible unicode daal dete hain — tolerant match
  const ok = user && user.active && (await comparePassword(password, user.passwordHash));
  if (!ok) {
    console.log(`[user-login-failed] email="${email}"`);
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  res.json({ token: signUser(user), user: publicUser(user) });
});

// POST /api/user/forgot — email service abhi configure nahi, is liye dev mode
// mein reset link response mein wapas aata hai (SMTP add hotay hi email bhejenge).
router.post('/forgot', async (req, res) => {
  const user = await User.findOne({ email: (req.body?.email || '').toLowerCase().trim() });
  if (!user) return res.json({ ok: true, message: 'Agar account mojood hai to reset link bhej diya gaya hai.' });
  const token = crypto.randomBytes(24).toString('hex');
  user.resetToken = token;
  user.resetExpires = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();
  const resetUrl = `/reset-password?token=${token}`;
  console.log(`[password-reset] ${user.email}: ${resetUrl}`);
  res.json({ ok: true, message: 'Reset link generate ho gaya hai.', resetUrl, devNote: 'Email service configure honay tak link yahan diya gaya hai.' });
});

// POST /api/user/reset
router.post('/reset', async (req, res) => {
  const { token, password } = req.body || {};
  if ((password || '').length < 6) return res.status(400).json({ message: 'Password kam az kam 6 characters ka hona chahiye' });
  const user = await User.findOne({ resetToken: token, resetExpires: { $gt: new Date() } });
  if (!user) return res.status(400).json({ message: 'Reset link invalid ya expire ho chuka hai' });
  user.passwordHash = await bcrypt.hash(password, 10);
  user.resetToken = undefined;
  user.resetExpires = undefined;
  await user.save();
  res.json({ ok: true, token: signUser(user), user: publicUser(user) });
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
