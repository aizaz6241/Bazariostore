import mongoose from 'mongoose';

export const ROLES = ['super_admin', 'admin', 'manager', 'support', 'inventory'];

const adminSchema = new mongoose.Schema(
  {
    name: { type: String, default: 'Admin' },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, default: 'admin' },
    // empty array => fall back to role defaults (utils/permissions.js)
    permissions: { type: [String], default: [] },
    active: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model('Admin', adminSchema);
