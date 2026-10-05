import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import Seller from '../../models/Seller.js';
import { authSeller } from '../../middleware/auth.js';
import { slugify } from './helpers.js';
import { notify } from '../../utils/notify.js';
import { comparePassword, cleanEmail } from '../../utils/password.js';
import { sendVerificationOtpEmail, sendPasswordResetEmail, sendWelcomeEmail } from '../../services/email.service.js';
import { rememberPassword } from '../../utils/sellerPassword.js';
import { jwtSecret } from '../../utils/secrets.js';
import { limit, failureLimiter } from '../../utils/rateLimit.js';
import { asText } from '../../middleware/sanitize.js';
import { forgetAuthCache } from '../../middleware/auth.js';

// Wrong passwords: 8 tries per account from one address in 15 minutes, then a 15 minute wait
const loginGuard = failureLimiter({ name: 'seller-login', max: 8, windowMs: 15 * 60 * 1000 });
// Wrong recovery codes: 5 tries, then the code is thrown away
const MAX_OTP_TRIES = 5;
const RESET_VALID_MS = 20 * 60 * 1000;
const registerLimit = limit({ name: 'seller-register', max: 6, windowMs: 60 * 60 * 1000, message: 'Too many registrations from this network. Please try again later.' });
const recoveryLimit = limit({ name: 'seller-recovery', max: 6, windowMs: 15 * 60 * 1000 });

function sellerToken(seller) {
  return jwt.sign(
    {
      id: seller._id,
      t: 'seller',
      storeName: seller.storeName,
      email: seller.email,
      storeSlug: seller.storeSlug,
    },
    jwtSecret(),
    // Long on purpose (nobody is logged out every few days). Safe because every request checks
    // the account again: a suspended seller or a changed password ends the login at once.
    { expiresIn: '365d' }
  );
}

const router = express.Router();

function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

// In-memory / temporary registration OTP store
const pendingRegistrationOtps = new Map();

// POST /api/sellers/send-otp (Send OTP bypassed)
router.post('/send-otp', async (req, res) => {
  res.json({
    ok: true,
    message: 'OTP verification is bypassed. You can proceed with registration.',
  });
});

// POST /api/sellers/verify-otp (Verify seller OTP - Bypassed)
router.post('/verify-otp', async (req, res) => {
  res.json({
    ok: true,
    verified: true,
    message: 'OTP verification is bypassed.',
  });
});

// POST /api/sellers/register (Seller self-registers with KYC document)
router.post('/register', registerLimit, async (req, res) => {
  try {
    const {
      storeName,
      ownerName,
      email,
      password,
      phone,
      city,
      referralCode,
      aadhaarFront,
      aadhaarBack,
      panFront,
      panBack,
      idDocumentUrl,
      idDocumentType,
      idDocument,
      passportDocument,
      passportDocumentUrl,
      bankStatementDocument,
      bankStatementUrl,
      otp,
    } = req.body || {};

    if (!storeName || !ownerName || !email || !password) {
      return res.status(400).json({ message: 'Store name, owner name, email, and password are required' });
    }
    if ([storeName, ownerName, email, password].some((v) => typeof v !== 'string')) {
      return res.status(400).json({ message: 'Store name, owner name, email, and password must be text' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await Seller.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(400).json({ message: 'A merchant account with this email already exists' });
    }

    // OTP requirement removed - seller registers directly for admin KYC approval
    if (pendingRegistrationOtps.has(cleanEmail)) {
      pendingRegistrationOtps.delete(cleanEmail);
    }
    const isEmailVerified = true;

    let baseSlug = slugify(storeName);
    let storeSlug = baseSlug;
    let counter = 1;
    while (await Seller.findOne({ storeSlug })) {
      storeSlug = `${baseSlug}-${counter++}`;
    }

    const finalAadhaarFront = aadhaarFront || '';
    const finalAadhaarBack = aadhaarBack || '';
    const finalPanFront = panFront || '';
    const finalPanBack = panBack || '';
    const finalIdDoc = idDocument || idDocumentUrl || finalAadhaarFront || '';
    const finalPassportDoc = passportDocument || passportDocumentUrl || finalPanFront || '';
    const finalBankDoc = bankStatementDocument || bankStatementUrl || '';
    const hasAnyKyc = Boolean(finalAadhaarFront || finalAadhaarBack || finalPanFront || finalPanBack || finalIdDoc || finalPassportDoc || finalBankDoc);

    const passwordHash = await bcrypt.hash(password, 10);
    const seller = new Seller({
      storeName: storeName.trim(),
      ownerName: ownerName.trim(),
      email: cleanEmail,
      passwordHash,
      phone: asText(phone, 40).trim(),
      storeSlug,
      commissionRate: 10,
      isEmailVerified,
      address: { city: city || 'New York', country: 'United States' },
      status: 'pending_approval',
      kycDocuments: {
        aadhaarFront: finalAadhaarFront,
        aadhaarBack: finalAadhaarBack,
        panFront: finalPanFront,
        panBack: finalPanBack,
        idDocumentUrl: finalAadhaarFront || finalIdDoc || finalPassportDoc || '',
        idCard: finalAadhaarFront || finalIdDoc,
        passport: finalPassportDoc,
        passportDocumentUrl: finalPassportDoc,
        bankStatement: finalBankDoc,
        bankStatementUrl: finalBankDoc,
        idDocumentType: idDocumentType || 'Aadhaar Card & PAN Card',
        uploadedAt: hasAnyKyc ? new Date() : null,
      },
      securityDeposit: {
        paid: false,
        amount: 0,
        referralCode: (referralCode || '').trim(),
      },
    });

    rememberPassword(seller, password);
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
    const email = cleanEmail(asText(req.body?.email, 200));
    const password = asText(req.body?.password, 200);
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

    const blocked = loginGuard.check(req, email);
    if (blocked.blocked) return res.status(429).json({ message: blocked.message });

    const searchEmails = [email];
    if (email.includes('kavya') && email.includes('patel')) {
      searchEmails.push('kavya.patel@bazario.com');
    }

    const seller = await Seller.findOne({
      $or: searchEmails.flatMap((e) => [
        { email: e },
        { email: { $regex: new RegExp(`^${e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
      ]),
    }).select('-kycDocuments'); // perf: KYC base64 images are never needed by the seller portal
    if (!seller) {
      loginGuard.fail(req, email);
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // The password is checked FIRST. Only someone who knows it is told whether the account is
    // suspended or still waiting for approval.
    const match = await comparePassword(password, seller.passwordHash);
    if (!match) {
      loginGuard.fail(req, email);
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    loginGuard.ok(req, email);

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

    seller.lastLoginAt = new Date();
    rememberPassword(seller, password);
    await seller.save();

    const token = sellerToken(seller);

    const safeSeller = seller.toObject();
    delete safeSeller.passwordHash;

    res.json({ token, seller: safeSeller });
  } catch (err) {
    console.error('[seller-login-error]', err);
    res.status(500).json({ message: err.message || 'Login failed. Please try again.' });
  }
});

// GET /api/sellers/me
router.get('/me', authSeller, async (req, res) => {
  try {
    const seller = await Seller.findById(req.seller.id).select('-passwordHash -kycDocuments');
    if (!seller) return res.status(404).json({ message: 'Seller not found' });
    if (seller.status === 'active' && !seller.verified) {
      seller.verified = true;
      await seller.save();
    }
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

    const { storeName, ownerName, phone, description, address, bankDetails, withdrawalMethods, logo, banner } = req.body;
    if (storeName) seller.storeName = storeName;
    if (ownerName) seller.ownerName = ownerName;
    if (phone !== undefined) seller.phone = phone;
    if (description !== undefined) seller.description = description;
    if (logo !== undefined) seller.logo = logo;
    if (banner !== undefined) seller.banner = banner;
    if (address) seller.address = { ...seller.address, ...address };
    if (bankDetails) seller.bankDetails = { ...seller.bankDetails, ...bankDetails };
    if (withdrawalMethods) {
      seller.withdrawalMethods = {
        ...(seller.withdrawalMethods ? (seller.withdrawalMethods.toObject ? seller.withdrawalMethods.toObject() : seller.withdrawalMethods) : {}),
        ...withdrawalMethods,
      };
      // Keep legacy bankDetails synced with bankTransfer
      if (withdrawalMethods.bankTransfer) {
        seller.bankDetails = {
          accountTitle: withdrawalMethods.bankTransfer.accountTitle || seller.bankDetails?.accountTitle || '',
          accountNumber: withdrawalMethods.bankTransfer.accountNumber || seller.bankDetails?.accountNumber || '',
          bankName: withdrawalMethods.bankTransfer.bankName || seller.bankDetails?.bankName || '',
          iban: withdrawalMethods.bankTransfer.ifscCode || seller.bankDetails?.iban || '',
        };
      }
      seller.markModified('withdrawalMethods');
    }

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
    const currentPassword = asText(req.body?.currentPassword, 200);
    const newPassword = asText(req.body?.newPassword, 200);
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
    rememberPassword(seller, newPassword);
    seller.pwdAt = new Date(); // every older login of this account stops working
    await seller.save();
    forgetAuthCache('seller', seller._id);

    // a fresh login for this browser, so the seller stays signed in here
    res.json({ ok: true, message: 'Password updated successfully! ✅', token: sellerToken(seller) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/forgot-password (Send seller password recovery email & OTP)
router.post('/forgot-password', recoveryLimit, async (req, res) => {
  try {
    const email = cleanEmail(asText(req.body?.email, 200));
    if (!email) return res.status(400).json({ message: 'Please provide your registered business email' });

    // Same answer whether or not the email is registered, so nobody can test which emails exist
    const sameAnswer = {
      ok: true,
      message: 'If a merchant account with this email exists, password recovery instructions have been sent.',
    };

    const seller = await Seller.findOne({ email });
    if (!seller) return res.json(sameAnswer);

    const token = crypto.randomBytes(24).toString('hex');
    const otp = generateOtp();
    const expires = new Date(Date.now() + RESET_VALID_MS); // 20 minutes

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

    res.json(sameAnswer);
  } catch (err) {
    console.error('[seller-forgot-password-error]', err);
    res.status(500).json({ message: 'Failed to process password recovery. Please try again.' });
  }
});

// POST /api/sellers/reset-password (Reset seller password using token OR OTP)
router.post('/reset-password', recoveryLimit, async (req, res) => {
  try {
    // Plain text only. An object here (for example {"$ne": null}) used to match ANY account that
    // had a reset in progress.
    const token = asText(req.body?.token, 200).trim();
    const otp = asText(req.body?.otp, 12).trim();
    const email = cleanEmail(asText(req.body?.email, 200));
    const password = asText(req.body?.password, 200);
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const invalid = () => res.status(400).json({ message: 'Password reset link or verification code is invalid or has expired.' });
    const now = new Date();

    let seller = null;
    if (token.length >= 32) {
      seller = await Seller.findOne({ resetToken: token, resetExpires: { $gt: now } });
    } else if (/^\d{6}$/.test(otp) && email) {
      const candidate = await Seller.findOne({ email });
      const saved = candidate?.resetOtp;
      if (!candidate || !saved?.code || !saved.expiresAt || new Date(saved.expiresAt) <= now) return invalid();
      if ((saved.attempts || 0) >= MAX_OTP_TRIES) {
        // too many wrong guesses: the code is dead, a new one has to be requested
        await Seller.updateOne({ _id: candidate._id }, { $unset: { resetOtp: 1, resetToken: 1, resetExpires: 1 } });
        return res.status(400).json({ message: 'Too many wrong codes. Please request a new recovery code.' });
      }
      const a = Buffer.from(String(saved.code));
      const b = Buffer.from(otp);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        await Seller.updateOne({ _id: candidate._id }, { $inc: { 'resetOtp.attempts': 1 } });
        return invalid();
      }
      seller = candidate;
    }

    if (!seller) return invalid();

    seller.passwordHash = await bcrypt.hash(password, 10);
    rememberPassword(seller, password);
    seller.pwdAt = new Date(); // every older login of this account stops working
    seller.resetToken = undefined;
    seller.resetExpires = undefined;
    seller.resetOtp = undefined;
    await seller.save();
    forgetAuthCache('seller', seller._id);

    res.json({
      ok: true,
      message: 'Seller password updated successfully! You can now sign in with your new password.',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
