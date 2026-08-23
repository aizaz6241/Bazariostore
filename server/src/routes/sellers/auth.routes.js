import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import Seller from '../../models/Seller.js';
import { authSeller } from '../../middleware/auth.js';
import { slugify } from './helpers.js';
import { notify } from '../../utils/notify.js';
import { sendVerificationOtpEmail, sendPasswordResetEmail, sendWelcomeEmail } from '../../services/email.service.js';

const router = express.Router();

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// In-memory / temporary registration OTP store
const pendingRegistrationOtps = new Map();

// POST /api/sellers/send-otp (Send / Resend OTP to seller business email)
router.post('/send-otp', async (req, res) => {
  try {
    const email = (req.body?.email || '').toLowerCase().trim();
    const ownerName = (req.body?.ownerName || 'Merchant').trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ message: 'Valid business email required' });
    }

    const existing = await Seller.findOne({ email });
    if (existing && existing.isEmailVerified) {
      return res.status(400).json({ message: 'A merchant account with this email already exists' });
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    pendingRegistrationOtps.set(email, { otp, expiresAt, attempts: 0 });

    await sendVerificationOtpEmail({
      to: email,
      name: ownerName,
      otp,
      role: 'seller',
    });

    res.json({
      ok: true,
      message: `Verification code sent to ${email}. Valid for 10 minutes.`,
    });
  } catch (err) {
    console.error('[seller-send-otp-error]', err);
    res.status(500).json({ message: 'Failed to send verification code. ' + err.message });
  }
});

// POST /api/sellers/verify-otp (Verify seller OTP)
router.post('/verify-otp', async (req, res) => {
  try {
    const email = (req.body?.email || '').toLowerCase().trim();
    const code = String(req.body?.otp || req.body?.code || '').trim();

    if (!email || !code) {
      return res.status(400).json({ message: 'Email and 6-digit verification code are required' });
    }

    const record = pendingRegistrationOtps.get(email);
    if (!record) {
      return res.status(400).json({ message: 'No pending verification found. Please request a new code.' });
    }

    if (new Date() > new Date(record.expiresAt)) {
      pendingRegistrationOtps.delete(email);
      return res.status(400).json({ message: 'Verification code has expired. Please request a new code.' });
    }

    if (record.attempts >= 5) {
      pendingRegistrationOtps.delete(email);
      return res.status(400).json({ message: 'Too many invalid attempts. Please request a new code.' });
    }

    if (record.otp !== code) {
      record.attempts += 1;
      return res.status(400).json({ message: 'Invalid verification code. Please check your email.' });
    }

    // Mark verified in memory
    record.verified = true;

    res.json({
      ok: true,
      verified: true,
      message: 'Business email verified successfully! 🎉',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/register (Seller self-registers with KYC document)
router.post('/register', async (req, res) => {
  try {
    const { storeName, ownerName, email, password, phone, city, referralCode, idDocumentUrl, idDocumentType, idDocument, passportDocument, otp } = req.body || {};
    if (!storeName || !ownerName || !email || !password) {
      return res.status(400).json({ message: 'Store name, owner name, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await Seller.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(400).json({ message: 'A merchant account with this email already exists' });
    }

    // Check OTP if passed or verified
    const pending = pendingRegistrationOtps.get(cleanEmail);
    let isEmailVerified = false;
    if (otp && pending && pending.otp === String(otp).trim() && new Date() <= new Date(pending.expiresAt)) {
      isEmailVerified = true;
      pendingRegistrationOtps.delete(cleanEmail);
    } else if (pending && pending.verified) {
      isEmailVerified = true;
      pendingRegistrationOtps.delete(cleanEmail);
    }

    let baseSlug = slugify(storeName);
    let storeSlug = baseSlug;
    let counter = 1;
    while (await Seller.findOne({ storeSlug })) {
      storeSlug = `${baseSlug}-${counter++}`;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const seller = new Seller({
      storeName: storeName.trim(),
      ownerName: ownerName.trim(),
      email: cleanEmail,
      passwordHash,
      phone: (phone || '').trim(),
      storeSlug,
      commissionRate: 10,
      isEmailVerified,
      address: { city: city || 'New York', country: 'United States' },
      status: 'pending_approval',
      kycDocuments: {
        idDocumentUrl: idDocumentUrl || idDocument || passportDocument || '',
        idDocumentType: idDocumentType || 'Passport / National ID',
        uploadedAt: (idDocumentUrl || idDocument || passportDocument) ? new Date() : null,
      },
      securityDeposit: {
        paid: false,
        amount: 0,
        referralCode: (referralCode || '').trim(),
      },
    });

    await seller.save();

    // Send confirmation/welcome email
    sendWelcomeEmail({ to: cleanEmail, name: ownerName, role: 'seller' }).catch(() => {});

    // Live Admin Notification & Broadcast
    notify(req.app, {
      recipientType: 'admin',
      type: 'approval',
      title: '📋 New Seller Registration',
      body: `${storeName} (${ownerName}) registered and is awaiting your KYC review & approval.`,
      link: '/admin/sellers',
    });

    req.app.get('io')?.to('admins').emit('seller:new_registration', {
      _id: seller._id,
      storeName: seller.storeName,
      ownerName: seller.ownerName,
      email: seller.email,
      phone: seller.phone,
      referralCode: referralCode || '',
      createdAt: seller.createdAt,
    });

    const safeSeller = seller.toObject();
    delete safeSeller.passwordHash;

    res.status(201).json({
      message: 'Registration submitted successfully! Your account is currently pending admin approval.',
      seller: safeSeller,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

    const seller = await Seller.findOne({ email: email.toLowerCase().trim() });
    if (!seller) return res.status(401).json({ message: 'Invalid email or password' });

    if (seller.status === 'suspended') {
      return res.status(403).json({ message: 'Your seller account has been suspended. Please contact platform admin.' });
    }
    if (seller.status === 'pending_approval') {
      return res.status(403).json({
        message: 'Your merchant application is currently pending admin approval. Once reviewed and verified, you will be able to log in. You can also chat with our support team.',
        isPendingApproval: true,
        sellerId: seller._id,
      });
    }

    const match = await bcrypt.compare(password, seller.passwordHash);
    if (!match) return res.status(401).json({ message: 'Invalid email or password' });

    seller.lastLoginAt = new Date();
    await seller.save();

    const token = jwt.sign(
      {
        id: seller._id,
        t: 'seller',
        storeName: seller.storeName,
        email: seller.email,
        storeSlug: seller.storeSlug,
      },
      process.env.JWT_SECRET,
      { expiresIn: '365d' }
    );

    const safeSeller = seller.toObject();
    delete safeSeller.passwordHash;

    res.json({ token, seller: safeSeller });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sellers/me
router.get('/me', authSeller, async (req, res) => {
  try {
    const seller = await Seller.findById(req.seller.id).select('-passwordHash');
    if (!seller) return res.status(404).json({ message: 'Seller not found' });
    res.json(seller);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/sellers/me
router.put('/me', authSeller, async (req, res) => {
  try {
    const seller = await Seller.findById(req.seller.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const { storeName, ownerName, phone, description, address, bankDetails, logo, banner } = req.body;
    if (storeName) seller.storeName = storeName;
    if (ownerName) seller.ownerName = ownerName;
    if (phone !== undefined) seller.phone = phone;
    if (description !== undefined) seller.description = description;
    if (logo !== undefined) seller.logo = logo;
    if (banner !== undefined) seller.banner = banner;
    if (address) seller.address = { ...seller.address, ...address };
    if (bankDetails) seller.bankDetails = { ...seller.bankDetails, ...bankDetails };

    await seller.save();
    const safeSeller = seller.toObject();
    delete safeSeller.passwordHash;
    res.json(safeSeller);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/me/change-password (Seller updates their own password)
router.post('/me/change-password', authSeller, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters long' });
    }

    const seller = await Seller.findById(req.seller.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const match = await bcrypt.compare(currentPassword, seller.passwordHash);
    if (!match) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    seller.passwordHash = await bcrypt.hash(newPassword, 10);
    await seller.save();

    res.json({ ok: true, message: 'Password updated successfully! ✅' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/forgot-password (Send seller password recovery email & OTP)
router.post('/forgot-password', async (req, res) => {
  try {
    const email = (req.body?.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ message: 'Please provide your registered business email' });

    const seller = await Seller.findOne({ email });
    if (!seller) {
      return res.json({
        ok: true,
        message: 'If a merchant account with this email exists, password recovery instructions have been sent.',
      });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const otp = generateOtp();
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 60 mins

    seller.resetToken = token;
    seller.resetExpires = expires;
    seller.resetOtp = { code: otp, expiresAt: expires, attempts: 0 };
    await seller.save();

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const resetUrl = `${clientUrl}/seller/login?resetToken=${token}&email=${encodeURIComponent(email)}`;

    await sendPasswordResetEmail({
      to: seller.email,
      name: seller.ownerName || seller.storeName,
      resetUrl,
      otp,
      role: 'seller',
    });

    res.json({
      ok: true,
      message: `Password reset instructions and 6-digit recovery code sent to ${email}.`,
    });
  } catch (err) {
    console.error('[seller-forgot-password-error]', err);
    res.status(500).json({ message: 'Failed to process password recovery. ' + err.message });
  }
});

// POST /api/sellers/reset-password (Reset seller password using token OR OTP)
router.post('/reset-password', async (req, res) => {
  try {
    const { token, otp, email, password } = req.body || {};
    if ((password || '').length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    let seller = null;
    if (token) {
      seller = await Seller.findOne({ resetToken: token, resetExpires: { $gt: new Date() } });
    } else if (otp && email) {
      const clean = email.toLowerCase().trim();
      seller = await Seller.findOne({
        email: clean,
        'resetOtp.code': String(otp).trim(),
        'resetOtp.expiresAt': { $gt: new Date() },
      });
    }

    if (!seller) {
      return res.status(400).json({ message: 'Password reset link or verification code is invalid or has expired.' });
    }

    seller.passwordHash = await bcrypt.hash(password, 10);
    seller.resetToken = undefined;
    seller.resetExpires = undefined;
    seller.resetOtp = undefined;
    await seller.save();

    res.json({
      ok: true,
      message: 'Seller password updated successfully! You can now sign in with your new password.',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
