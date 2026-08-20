import mongoose from 'mongoose';

export const ROLES = ['super_admin', 'admin', 'manager', 'support', 'order_manager', 'inventory'];

const adminSchema = new mongoose.Schema(
  {
    name: { type: String, default: 'Admin' },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, default: 'admin' },
    title: { type: String, default: 'Administrator' },
    phone: { type: String, default: '' },
    // empty array => fall back to role defaults (utils/permissions.js)
    permissions: { type: [String], default: [] },
    active: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model('Admin', adminSchema);
