import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import Seller from '../../models/Seller.js';
import Product from '../../models/Product.js';
import { authSeller } from '../../middleware/auth.js';
import { slugify, blockWhenFrozen } from './helpers.js';
import { notify } from '../../utils/notify.js';
import { comparePassword, cleanEmail } from '../../utils/password.js';
import { sendVerificationOtpEmail, sendPasswordResetEmail, sendSellerApplicationEmail, emailEnabled } from '../../services/email.service.js';
import EmailCode from '../../models/EmailCode.js';
import { allowEmailSend, hashSecret, secretMatches, waitMessage } from '../../utils/emailGuard.js';
import { rememberPassword } from '../../utils/sellerPassword.js';
import { jwtSecret } from '../../utils/secrets.js';
import { limit, failureLimiter } from '../../utils/rateLimit.js';
import { asText } from '../../middleware/sanitize.js';
import { forgetAuthCache } from '../../middleware/auth.js';
import { adminRoom } from '../../utils/permissions.js';
import { resolveAffiliateCode } from '../../utils/affiliateCodes.js';
import { sellerSafeTargets } from '../../utils/sellerTargets.js';

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

const SITE_URL = () => (process.env.CLIENT_URL || 'https://www.bazariomarketplace.shop').replace(/\/+$/, '');
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CODE_VALID_MS = 10 * 60 * 1000;
// proof that the registration email was verified (given after the right code; used by /register)
const EMAIL_PROOF_TTL = '2h';
const emailProof = (email) => jwt.sign({ t: 'seller_email', email }, jwtSecret(), { expiresIn: EMAIL_PROOF_TTL });
function provenEmail(token) {
  try {
    const p = jwt.verify(String(token || ''), jwtSecret());
    return p?.t === 'seller_email' && typeof p.email === 'string' ? p.email : '';
  } catch {
    return '';
  }
}

// What to tell someone who registers again with an email that already has an account. A seller
// whose application is still waiting must learn that it WAS received (and not send it again).
function existingAccountAnswer(existing) {
  // Anyone can type any email here, so no names are given back (only that an application exists and
  // when it was sent); the form shows the store / owner name the person typed themselves.
  const application = {
    email: existing.email || '',
    submittedAt: existing.createdAt || null,
  };
  if (existing.registrationRejectedAt) {
    return {
      code: 'APPLICATION_REJECTED',
      application,
      message:
        'An application with this email was already reviewed and was not approved. Please contact our support team through the chat (bottom right) — you do not need to register again.',
    };
  }
  if (existing.status === 'pending_approval') {
    return {
      code: 'APPLICATION_PENDING',
      application,
      message:
        'You have already submitted your application with this email. It is waiting for admin approval — no need to register again. You will be able to sign in as soon as it is approved.',
    };
  }
  return {
    code: 'ALREADY_REGISTERED',
    application: null,
    message: 'A merchant account with this email already exists. Please sign in instead.',
  };
}

// ─── Registration email verification (6-digit code to the seller's email) ───
// POST /api/sellers/register/send-code { email, name? }
//   → { ok, required: true, resendInSeconds, message }   (required: false when email sending is off)
const sendCodeLimit = limit({ name: 'seller-register-code', max: 10, windowMs: 60 * 60 * 1000, message: 'Too many codes requested from this network. Please try again later.' });
router.post('/register/send-code', sendCodeLimit, async (req, res) => {
  try {
    const email = cleanEmail(asText(req.body?.email, 200));
    const name = asText(req.body?.name, 80).trim() || 'Seller';
    if (!email || !EMAIL_RX.test(email)) return res.status(400).json({ message: 'Please enter a valid email address.' });
    const existing = await Seller.findOne({ email }).select('storeName ownerName email status registrationRejectedAt createdAt').lean();
    if (existing) return res.status(409).json(existingAccountAnswer(existing));
    // email sending not set up on this server: registration works without the code (as before)
    if (!emailEnabled) return res.json({ ok: true, required: false, message: '' });

    const gate = allowEmailSend(email, 'seller-register');
    if (!gate.ok) return res.status(429).json({ code: 'WAIT', waitSec: gate.waitSec, message: waitMessage(gate.waitSec) });

    const otp = generateOtp();
    const now = new Date();
    await EmailCode.updateOne(
      { email, purpose: 'seller_register' },
      { $set: { codeHash: hashSecret(otp), expiresAt: new Date(now.getTime() + CODE_VALID_MS), attempts: 0, sentAt: now, verifiedAt: null, purgeAt: new Date(now.getTime() + 86400000) } },
      { upsert: true }
    );
    const sent = await sendVerificationOtpEmail({ to: email, name, otp, role: 'seller' }).catch((e) => ({ success: false, error: e.message }));
    if (!sent?.success) {
      return res.status(503).json({ message: 'We could not send the email right now. Please check the address and try again in a minute.' });
    }
    res.json({
      ok: true,
      required: true,
      resendInSeconds: 60,
      message: `We sent a 6-digit code to ${email}. Please check your inbox — and your Spam / Junk folder if you don't see it.`,
    });
  } catch (err) {
    console.error('[seller-register-code]', err.message);
    res.status(500).json({ message: 'Could not send the code. Please try again.' });
  }
});

// POST /api/sellers/register/verify-code { email, code } → { ok, emailToken }
const verifyCodeLimit = limit({ name: 'seller-register-verify', max: 30, windowMs: 15 * 60 * 1000, message: 'Too many tries from this network. Please try again later.' });
router.post('/register/verify-code', verifyCodeLimit, async (req, res) => {
  try {
    const email = cleanEmail(asText(req.body?.email, 200));
    const code = asText(req.body?.code ?? req.body?.otp, 12).trim();
    if (!email || !/^\d{6}$/.test(code)) return res.status(400).json({ message: 'Please enter the 6-digit code from the email.' });
    const now = new Date();
    // one try is used up BEFORE the code is compared, in one database step (no parallel guessing)
    const rec = await EmailCode.findOneAndUpdate(
      { email, purpose: 'seller_register', codeHash: { $ne: '' }, expiresAt: { $gt: now }, attempts: { $lt: MAX_OTP_TRIES } },
      { $inc: { attempts: 1 } },
      { new: true }
    );
    if (!rec) {
      const found = await EmailCode.findOne({ email, purpose: 'seller_register' }).lean();
      if (!found?.codeHash) return res.status(400).json({ message: 'Please ask for a code first.' });
      if (new Date(found.expiresAt) <= now) return res.status(400).json({ message: 'This code has expired. Please ask for a new one.' });
      return res.status(400).json({ message: 'Too many wrong codes. Please ask for a new code.' });
    }
    if (!secretMatches(code, rec.codeHash)) {
      const left = Math.max(0, MAX_OTP_TRIES - rec.attempts);
      return res.status(400).json({ message: left ? `Wrong code. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Please ask for a new code.' });
    }
    await EmailCode.updateOne({ _id: rec._id }, { $set: { codeHash: '', verifiedAt: now } });
    res.json({ ok: true, verified: true, emailToken: emailProof(email), message: 'Email verified ✓' });
  } catch (err) {
    console.error('[seller-register-verify]', err.message);
    res.status(500).json({ message: 'Could not check the code. Please try again.' });
  }
});

// Small check made BEFORE the documents are uploaded: is there already an account / application for
// this email? (So someone who already applied is told so at once, without uploading photos again.)
const checkEmailLimit = limit({ name: 'seller-register-check', max: 40, windowMs: 60 * 60 * 1000, message: 'Too many checks from this network. Please try again later.' });
router.post('/register/check-email', checkEmailLimit, async (req, res) => {
  try {
    const email = asText(req.body?.email, 200).toLowerCase().trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.json({ exists: false });
    const existing = await Seller.findOne({ email })
      .select('storeName ownerName email status registrationRejectedAt createdAt')
      .lean();
    if (!existing) return res.json({ exists: false });
    return res.json({ exists: true, ...existingAccountAnswer(existing) });
  } catch (err) {
    // never block a registration because this check failed
    res.json({ exists: false });
  }
});

// GET /api/sellers/affiliate/validate?code=XYZ (public: the registration form checks a code
// while the seller types it). Only says valid / not valid: never lists the codes.
const affiliateCheckLimit = limit({ name: 'seller-affiliate-check', max: 60, windowMs: 15 * 60 * 1000, message: 'Too many code checks. Please try again later.' });
router.get('/affiliate/validate', affiliateCheckLimit, async (req, res) => {
  try {
    const raw = asText(req.query?.code, 64);
    if (!raw.trim()) return res.json({ valid: false, code: '', reason: 'empty', message: '' });
    const r = await resolveAffiliateCode(raw);
    if (!r.ok) return res.json({ valid: false, code: r.code, reason: r.reason, message: r.message });
    res.json({ valid: true, code: r.code, message: `Security code "${r.code}" is valid.` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
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
      emailToken,
      acceptTerms,
      termsVersion,
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
    // the Seller Terms & Conditions must be accepted (the box on the form; checked here too)
    if (acceptTerms !== true) {
      return res.status(400).json({ code: 'TERMS_REQUIRED', field: 'acceptTerms', message: 'Please read and accept the Seller Terms & Conditions to register.' });
    }

    // An affiliate code is optional, but when one is given it must exist and be active:
    // a mistyped or switched-off code is refused instead of being saved silently.
    let affiliateCode = '';
    if (typeof referralCode === 'string' && referralCode.trim()) {
      const aff = await resolveAffiliateCode(referralCode);
      if (!aff.ok) return res.status(400).json({ code: 'INVALID_AFFILIATE_CODE', field: 'referralCode', reason: aff.reason, message: aff.message });
      affiliateCode = aff.code;
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await Seller.findOne({ email: cleanEmail })
      .select('storeName ownerName email status registrationRejectedAt createdAt')
      .lean();
    if (existing) {
      return res.status(409).json(existingAccountAnswer(existing));
    }

    // The email must be verified with the 6-digit code first (only real, working addresses reach
    // the team). When email sending is not set up on this server, registration works as before.
    const verifiedEmail = provenEmail(emailToken);
    if (emailEnabled && verifiedEmail !== cleanEmail) {
      return res.status(400).json({ code: 'EMAIL_NOT_VERIFIED', field: 'email', message: 'Please verify your email with the 6-digit code we send you before submitting.' });
    }
    const isEmailVerified = verifiedEmail === cleanEmail;

    let baseSlug = slugify(storeName);
    let storeSlug = baseSlug;
    let counter = 1;
    while (await Seller.findOne({ storeSlug })) {
      storeSlug = `${baseSlug}-${counter++}`;
    }

    // A document is a picture / PDF (data: URL) or a link. Anything else is dropped.
    const docOf = (v) => (typeof v === 'string' && (v.startsWith('data:image/') || v.startsWith('data:application/pdf') || /^https?:\/\//.test(v)) ? v : '');
    const finalAadhaarFront = docOf(aadhaarFront);
    const finalAadhaarBack = docOf(aadhaarBack);
    const finalPanFront = docOf(panFront);
    const finalPanBack = docOf(panBack);
    // Older forms sent these separately. Each picture is stored ONCE: before, the Aadhaar front and
    // the PAN front were also copied into the legacy fields (3 copies each), which made a seller
    // record several MB bigger and the registration (and the admin's KYC preview) very slow.
    const legacyId = docOf(idDocument) || docOf(idDocumentUrl);
    const legacyPassport = docOf(passportDocument) || docOf(passportDocumentUrl);
    const finalIdDoc = legacyId && legacyId !== finalAadhaarFront ? legacyId : '';
    const finalPassportDoc = legacyPassport && legacyPassport !== finalPanFront ? legacyPassport : '';
    const finalBankDoc = docOf(bankStatementDocument) || docOf(bankStatementUrl);
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
      terms: { version: String(termsVersion || '1.0').slice(0, 20), acceptedAt: new Date(), ip: String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim().slice(0, 64) },
      kycDocuments: {
        aadhaarFront: finalAadhaarFront,
        aadhaarBack: finalAadhaarBack,
        panFront: finalPanFront,
        panBack: finalPanBack,
        idCard: finalIdDoc,
        passport: finalPassportDoc,
        bankStatement: finalBankDoc,
        idDocumentType: idDocumentType || 'Aadhaar Card & PAN Card',
        uploadedAt: hasAnyKyc ? new Date() : null,
      },
      securityDeposit: {
        paid: false,
        amount: 0,
        referralCode: affiliateCode,
      },
    });

    rememberPassword(seller, password);
    await seller.save();

    // "Application received — we review it within 24 hours" (in the background; never blocks)
    sendSellerApplicationEmail({ to: cleanEmail, name: ownerName, storeName }).catch(() => {});

    // Live Admin Notification & Broadcast
    notify(req.app, {
      recipientType: 'admin',
      type: 'approval',
      title: '📋 New Seller Registration',
      body: `${storeName} (${ownerName}) registered and is awaiting your KYC review & approval.`,
      link: '/admin/sellers',
    });

    req.app.get('io')?.to(adminRoom('sellers')).emit('seller:new_registration', {
      _id: seller._id,
      storeName: seller.storeName,
      ownerName: seller.ownerName,
      email: seller.email,
      phone: seller.phone,
      referralCode: affiliateCode,
      createdAt: seller.createdAt,
    });

    const safeSeller = seller.toObject();
    delete safeSeller.passwordHash;
    // the pictures the seller just uploaded are not sent back (megabytes for nothing on a phone)
    delete safeSeller.kycDocuments;

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

    // One known second address of the demo store. Before, ANY email containing "kavya" and "patel"
    // opened that account, so each made-up address got its own wrong-password allowance.
    const searchEmails = [email];
    if (email === 'kavya.patel@gmail.com') searchEmails.push('kavya.patel@bazario.com');

    const seller = await Seller.findOne({
      $or: searchEmails.flatMap((e) => [
        { email: e },
        { email: { $regex: new RegExp(`^${e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
      ]),
    }); // (the KYC pictures are never read here: they stay out unless a query asks for them)
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

    if (seller.status === 'suspended' && seller.registrationRejectedAt) {
      // a rejected registration is told so, with the reason (it used to read "suspended")
      return res.status(403).json({
        code: 'application_rejected',
        isRejected: true,
        message: `Your store registration was not approved. Reason: ${seller.freezeReason || 'not given'}. Please contact platform support if you think this is a mistake.`,
      });
    }
    // a suspended store may log in: it sees the suspension and can only talk to support
    // (every other request is refused by the login check, see middleware/auth.js)
    if (seller.status === 'pending_approval') {
      // the right password, application still in review: the sign-in page shows its status
      // ("Under review", sent on …, decided within 24 hours) instead of a plain error
      return res.status(403).json({
        message: 'Your seller application is under review. Our team reviews every application within 24 hours. You can sign in as soon as your store is approved — we will email you.',
        code: 'application_pending',
        isPendingApproval: true,
        sellerId: seller._id,
        application: {
          storeName: seller.storeName || '',
          ownerName: seller.ownerName || '',
          email: seller.email || '',
          submittedAt: seller.createdAt || null,
          reviewHours: 24,
        },
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
    const seller = await Seller.findById(req.seller.id).select('-passwordHash');
    if (!seller) return res.status(404).json({ message: 'Seller not found' });
    if (seller.status === 'active' && !seller.verified) {
      seller.verified = true;
      await seller.save();
    }
    // targets as the store may see them (who gave / changed a target stays on the admin side)
    const out = seller.toObject();
    out.targets = sellerSafeTargets(out.targets);
    res.json(out);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// The payout details as plain, sorted text, leaving out empty / switched-off values (so the same
// details saved again compare equal)
function payoutFingerprint(seller) {
  const plain = (v) => {
    if (v && typeof v.toObject === 'function') v = v.toObject();
    if (Array.isArray(v)) return v.map(plain);
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const out = {};
      for (const k of Object.keys(v).sort()) if (k !== '_id' && v[k] !== '' && v[k] != null && v[k] !== false) out[k] = plain(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify([plain(seller.bankDetails || {}), plain(seller.withdrawalMethods || {})]);
}

// PUT /api/sellers/me
router.put('/me', authSeller, blockWhenFrozen('changing store settings and payout details'), async (req, res) => {
  try {
    const seller = await Seller.findById(req.seller.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const body = req.body || {};
    const txt = (v, max) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '');
    const storeName = body.storeName !== undefined ? txt(body.storeName, 60) : undefined;
    const ownerName = body.ownerName !== undefined ? txt(body.ownerName, 80) : undefined;
    if (storeName !== undefined && storeName.length < 2) return res.status(400).json({ message: 'Store name must be at least 2 characters.' });
    if (ownerName !== undefined && ownerName.length < 2) return res.status(400).json({ message: 'Owner name must be at least 2 characters.' });
    const imageUrl = (v) => {
      const u = txt(v, 1000);
      if (!u) return '';
      return /^(https?:\/\/|\/)/i.test(u) ? u : null;
    };
    const logo = body.logo !== undefined ? imageUrl(body.logo) : undefined;
    const banner = body.banner !== undefined ? imageUrl(body.banner) : undefined;
    if (logo === null || banner === null) return res.status(400).json({ message: 'The logo must be an uploaded picture or a link starting with https://' });

    // Payout methods: only the known methods and fields, as plain text (anything else used to be
    // saved as sent). A method that is switched on must be filled in correctly.
    const METHOD_FIELDS = {
      bankTransfer: ['accountTitle', 'accountNumber', 'bankName', 'ifscCode', 'branchName', 'accountType'],
      upi: ['upiId', 'holderName'],
      paytm: ['phone', 'accountName'],
      gpay: ['phone', 'upiId', 'accountName'],
      phonepe: ['phone', 'upiId', 'accountName'],
      usdt: ['walletAddress', 'network'],
    };
    let withdrawalMethods;
    if (body.withdrawalMethods && typeof body.withdrawalMethods === 'object') {
      withdrawalMethods = {};
      for (const [key, fields] of Object.entries(METHOD_FIELDS)) {
        const m = body.withdrawalMethods[key];
        if (!m || typeof m !== 'object') continue;
        const clean = { enabled: Boolean(m.enabled) };
        for (const f of fields) clean[f] = txt(m[f], 120);
        withdrawalMethods[key] = clean;
      }
      const w = withdrawalMethods;
      const bad = (msg) => res.status(400).json({ message: msg });
      // only a method whose details were changed now is checked (details saved earlier in an older
      // format must not stop the store from saving something else)
      const storedWm = seller.withdrawalMethods?.toObject ? seller.withdrawalMethods.toObject() : seller.withdrawalMethods || {};
      const changed = (k) => {
        const before = storedWm[k] || {};
        return Boolean(w[k]?.enabled) && METHOD_FIELDS[k].concat('enabled').some((f) => String(w[k][f] ?? '') !== String(before[f] ?? (f === 'enabled' ? false : '')));
      };
      if (w.bankTransfer?.enabled && changed('bankTransfer')) {
        const b = w.bankTransfer;
        b.ifscCode = b.ifscCode.toUpperCase().replace(/\s+/g, '');
        b.accountNumber = b.accountNumber.replace(/[\s-]/g, '');
        if (!b.accountTitle || !b.bankName) return bad('Bank transfer: enter the account holder name and bank.');
        if (!/^\d{6,20}$/.test(b.accountNumber)) return bad('Bank transfer: the account number should be 6–20 digits.');
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(b.ifscCode)) return bad('Bank transfer: the IFSC code looks wrong (example: SBIN0001234).');
        if (!['Savings', 'Current'].includes(b.accountType)) b.accountType = 'Savings';
      }
      if (w.upi?.enabled && changed('upi') && (!/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(w.upi.upiId) || !w.upi.holderName)) return bad('UPI: enter a valid UPI ID (like name@okhdfcbank) and the registered name.');
      for (const k of ['paytm', 'gpay', 'phonepe']) {
        const m = w[k];
        if (m?.enabled && changed(k) && !(/^\+?\d[\d\s]{8,14}$/.test(m.phone) || /@/.test(m.upiId || ''))) return bad(`${k === 'gpay' ? 'Google Pay' : k === 'phonepe' ? 'PhonePe' : 'Paytm'}: enter a valid mobile number${k === 'paytm' ? '' : ' or UPI ID'}.`);
      }
      if (w.usdt?.enabled && changed('usdt')) {
        const u = w.usdt;
        if (!['TRC-20', 'BEP-20', 'ERC-20'].includes(u.network)) u.network = 'TRC-20';
        const ok = u.network === 'TRC-20' ? /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(u.walletAddress) : /^0x[a-fA-F0-9]{40}$/.test(u.walletAddress);
        if (!ok) return bad(u.network === 'TRC-20' ? 'USDT: a TRC-20 address starts with T and has 34 characters.' : 'USDT: a BEP-20 / ERC-20 address starts with 0x and has 42 characters.');
      }
    }

    if (storeName && storeName.toLowerCase() !== String(seller.storeName || '').trim().toLowerCase()) {
      // Older products and orders are matched to their store partly by the store NAME, so taking
      // the exact name of another store would hand that store's items (and payouts) to this one.
      const taken = await Seller.findOne({
        _id: { $ne: seller._id },
        storeName: { $regex: `^${storeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      }).select('_id').lean();
      if (taken) return res.status(400).json({ message: 'Another store already uses this name. Please choose a different store name.' });
    }
    const payoutBefore = payoutFingerprint(seller);
    const nameBefore = seller.storeName;
    if (storeName) seller.storeName = storeName;
    if (ownerName) seller.ownerName = ownerName;
    if (body.phone !== undefined) seller.phone = txt(body.phone, 30);
    if (body.description !== undefined) seller.description = txt(body.description, 1000);
    if (logo !== undefined) seller.logo = logo;
    if (banner !== undefined) seller.banner = banner;
    if (body.address && typeof body.address === 'object') {
      // the stored address as plain values (spreading the stored sub-document copied Mongoose internals)
      const prev = seller.address?.toObject ? seller.address.toObject() : { ...(seller.address || {}) };
      const next = { ...prev };
      for (const f of ['street', 'city', 'state', 'postalCode', 'country']) if (body.address[f] !== undefined) next[f] = txt(body.address[f], 150);
      seller.address = next;
    }
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

    // Changing where payouts go needs the account password (someone using a left-open or stolen
    // login could otherwise send the next withdrawal to their own account). An admin acting for
    // the store is not asked.
    if (!req.admin && payoutFingerprint(seller) !== payoutBefore) {
      const pw = typeof body.currentPassword === 'string' ? body.currentPassword.slice(0, 200) : '';
      if (!pw) return res.status(400).json({ needPassword: true, message: 'Enter your account password to change payout details.' });
      if (!(await comparePassword(pw, seller.passwordHash))) return res.status(400).json({ needPassword: true, message: 'The password is not correct. Payout details were not changed.' });
    }

    await seller.save();

    // products show the store name on their cards: a renamed store's own products follow it
    if (storeName && storeName !== nameBefore) {
      await Product.updateMany({ seller: seller._id }, { $set: { sellerName: storeName } }).catch((e) => console.error('[store-rename]', e.message));
    }

    // Where payouts are sent is the first thing someone changes after taking over an account:
    // the admins are told every time it changes, so a stranger's account number is noticed.
    // compared as saved in the database (the same details saved again are not a change)
    const savedNow = await Seller.findById(seller._id).select('bankDetails withdrawalMethods').lean();
    if (savedNow && payoutFingerprint(savedNow) !== payoutBefore) {
      notify(req.app, {
        recipientType: 'admin',
        type: 'security',
        title: '🔐 Seller changed payout details',
        body: `${seller.storeName} (${seller.email}) changed their bank / UPI / wallet payout details. Check before approving the next withdrawal.`,
        link: '/admin/sellers',
      });
    }

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

    const seller = await Seller.findOne({ email }).select('email ownerName storeName');
    if (!seller) return res.json(sameAnswer);
    // one email per address per minute, 5 an hour (protects the mailbox and the email quota);
    // the answer stays the same so nobody learns anything from it
    if (!allowEmailSend(email, 'seller-reset').ok) return res.json(sameAnswer);

    const token = crypto.randomBytes(24).toString('hex');
    const otp = generateOtp();
    const expires = new Date(Date.now() + RESET_VALID_MS); // 20 minutes

    // only hashes are stored: a copy of the database cannot be used to reset a password
    await Seller.updateOne(
      { _id: seller._id },
      { $set: { resetToken: hashSecret(token), resetExpires: expires, resetOtp: { code: hashSecret(otp), expiresAt: expires, attempts: 0 } } }
    );

    const resetUrl = `${SITE_URL()}/seller/login?resetToken=${token}&email=${encodeURIComponent(email)}`;
    const sent = await sendPasswordResetEmail({
      to: seller.email,
      name: seller.ownerName || seller.storeName,
      resetUrl,
      otp,
      role: 'seller',
    }).catch((e) => ({ success: false, error: e.message }));
    if (sent && sent.success === false && !sent.skipped) {
      console.error('[seller-forgot-password] email failed:', sent.error);
      return res.status(503).json({ message: 'We could not send the email right now. Please try again in a few minutes.' });
    }

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
      seller = await Seller.findOne({ resetToken: hashSecret(token), resetExpires: { $gt: now } });
    } else if (/^\d{6}$/.test(otp) && email) {
      // one try is used up BEFORE the code is compared, in one database step: many guesses sent at
      // the same moment cannot all slip through (the old check-then-save let them)
      const candidate = await Seller.findOneAndUpdate(
        {
          email,
          'resetOtp.code': { $type: 'string' },
          'resetOtp.expiresAt': { $gt: now },
          $or: [{ 'resetOtp.attempts': { $lt: MAX_OTP_TRIES } }, { 'resetOtp.attempts': { $exists: false } }],
        },
        { $inc: { 'resetOtp.attempts': 1 } },
        { new: true }
      );
      if (!candidate) {
        const found = await Seller.findOne({ email }).select('resetOtp').lean();
        if (found?.resetOtp?.code && (found.resetOtp.attempts || 0) >= MAX_OTP_TRIES) {
          // too many wrong guesses: the code is dead, a new one has to be requested
          await Seller.updateOne({ _id: found._id }, { $unset: { resetOtp: 1, resetToken: 1, resetExpires: 1 } });
          return res.status(400).json({ message: 'Too many wrong codes. Please request a new recovery code.' });
        }
        return invalid();
      }
      if (!secretMatches(otp, candidate.resetOtp.code)) return invalid();
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
