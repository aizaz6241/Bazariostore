import './_script-guard.js';
/**
 * Bazario — Super Admin Setup Script
 * Run: node src/seed-admin.js
 * 
 * This script:
 * 1. Connects to MongoDB Atlas
 * 2. Creates/updates the Super Admin account
 * 3. Does NOT add any demo sellers or products
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// ─── MongoDB Connection ──────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('❌ MONGO_URI is not set in .env');
  process.exit(1);
}

// ─── Inline Admin Schema (avoid circular import issues) ──────────────────────
const adminSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'super_admin', enum: ['super_admin', 'admin', 'manager', 'support', 'order_manager', 'inventory'] },
  title: { type: String, default: 'Super Administrator' },
  phone: { type: String, default: '' },
  active: { type: Boolean, default: true },
  permissions: [String],
  createdAt: { type: Date, default: Date.now },
  lastLoginAt: Date,
});

const Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema);

// ─── Super Admin Config ───────────────────────────────────────────────────────
const SUPER_ADMIN = {
  name: 'Super Admin',
  email: 'admin@bazario.com',
  // No built-in password: it must be given on purpose (ADMIN_PASSWORD, at least 10 characters).
  password: process.env.ADMIN_PASSWORD || '',
  role: 'super_admin',
  title: 'Platform Owner',
};

async function seedAdmin() {
  if (!SUPER_ADMIN.password || SUPER_ADMIN.password.length < 10 || /^(admin123|password|12345678)/i.test(SUPER_ADMIN.password)) {
    console.error('⛔ Set ADMIN_PASSWORD to a strong password (at least 10 characters) before running this script. Nothing was changed.');
    process.exit(1);
  }
  try {
    console.log('🔌 Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    console.log('✅ Connected to database:', mongoose.connection.name);

    // Check if super admin already exists
    const existing = await Admin.findOne({ email: SUPER_ADMIN.email });

    if (existing) {
      // Update password in case it changed
      existing.passwordHash = await bcrypt.hash(SUPER_ADMIN.password, 12);
      existing.role = 'super_admin';
      existing.active = true;
      await existing.save();
      console.log(`✅ Super Admin updated: ${SUPER_ADMIN.email}`);
    } else {
      const passwordHash = await bcrypt.hash(SUPER_ADMIN.password, 12);
      await Admin.create({
        name: SUPER_ADMIN.name,
        email: SUPER_ADMIN.email,
        passwordHash,
        role: SUPER_ADMIN.role,
        title: SUPER_ADMIN.title,
        active: true,
        permissions: [],
      });
      console.log(`✅ Super Admin created: ${SUPER_ADMIN.email}`);
    }

    console.log('\n══════════════════════════════════════');
    console.log('  🎉 BAZARIO SUPER ADMIN READY');
    console.log('══════════════════════════════════════');
    console.log(`  Email   : ${SUPER_ADMIN.email}`);
    console.log('  Password: the one you set in ADMIN_PASSWORD');
    console.log(`  Login at: http://localhost:5000/admin/login`);
    console.log('══════════════════════════════════════\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.message.includes('ECONNREFUSED') || err.message.includes('timed out')) {
      console.error('   ↳ Cannot connect to MongoDB. Check your MONGO_URI in .env');
    }
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seedAdmin();
