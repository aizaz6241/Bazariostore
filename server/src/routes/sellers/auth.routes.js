import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Seller from '../../models/Seller.js';
import { authSeller } from '../../middleware/auth.js';
import { slugify } from './helpers.js';
import { notify } from '../../utils/notify.js';

const router = express.Router();

// POST /api/sellers/register (Seller self-registers with KYC document)
router.post('/register', async (req, res) => {
  try {
    const { storeName, ownerName, email, password, phone, city, referralCode, idDocumentUrl, idDocumentType } = req.body || {};
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
      address: { city: city || 'New York', country: 'United States' },
      status: 'pending_approval',
      kycDocuments: {
        idDocumentUrl: idDocumentUrl || '',
        idDocumentType: idDocumentType || 'Passport / National ID',
        uploadedAt: idDocumentUrl ? new Date() : null,
      },
      securityDeposit: {
        paid: false,
        amount: 0,
        referralCode: (referralCode || '').trim(),
      },
    });

    await seller.save();

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

export default router;
