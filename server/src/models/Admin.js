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
    // Finance partner: shares the Binance money (the ledger divides between the finance partners)
    // and approves the other partner's sensitive actions on the team portal.
    // Not set (older accounts) = partner when the role is super_admin / admin, as it always was.
    // A staff account (support, orders, ...) is created with false: no share, no team portal.
    financePartner: { type: Boolean },
    // When the password was last changed: logins made before this moment stop working.
    pwdAt: { type: Date, default: null },
    lastLoginAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model('Admin', adminSchema);
