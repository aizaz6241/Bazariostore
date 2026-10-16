import mongoose from 'mongoose';

/**
 * A company WhatsApp number (UK, US, ...) that team members use to talk to sellers.
 * One number can be linked on several members' phones at the same time (holders).
 *
 * The monthly subscription is recorded here for tracking only: it is NOT part of the finance
 * ledger (no wallet is charged) until the partners decide otherwise.
 */
const holderSchema = new mongoose.Schema(
  {
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'PortalMember', required: true },
    name: { type: String, default: '' },
    primary: { type: Boolean, default: false }, // the one whose phone the number's SIM / account is on
    device: { type: String, default: '', trim: true }, // which mobile it is logged in on: "iPhone 13", "Samsung A54"
    since: { type: Date, default: Date.now },
  },
  { _id: false }
);

const historySchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    type: { type: String, default: 'note' }, // created | linked | unlinked | primary | banned | active | replaced | inactive | renewed | edited | note
    by: { type: mongoose.Schema.Types.ObjectId, default: null },
    byName: { type: String, default: '' },
    memberId: { type: mongoose.Schema.Types.ObjectId, default: null },
    text: { type: String, default: '' },
  },
  { _id: false }
);

const renewalSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now }, // the day it was paid
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
    periodEnd: { type: Date, default: null }, // paid until
    by: { type: mongoose.Schema.Types.ObjectId, default: null },
    byName: { type: String, default: '' },
  },
  { _id: false }
);

const waNumberSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, trim: true }, // as shown: +447700900123
    numberKey: { type: String, required: true, unique: true }, // last 10 digits (lib/utils/phone.js), to stop the same number twice
    country: { type: String, default: '', trim: true }, // UK, US, ...
    label: { type: String, default: '', trim: true }, // a nickname: "UK-3", "US main"
    provider: { type: String, default: '', trim: true }, // the platform it was bought from
    // who bought the number (a member or a partner) — tracking only, not finance
    purchasedBy: {
      memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'PortalMember', default: null },
      name: { type: String, default: '' },
    },
    // the WhatsApp app the number is registered on (one number is on one app at a time; its
    // linked devices use the same app)
    appType: { type: String, enum: ['', 'business', 'normal'], default: '' },
    status: { type: String, enum: ['active', 'banned', 'replaced', 'inactive'], default: 'active', index: true },
    monthlyCost: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
    nextRenewalAt: { type: Date, default: null, index: true },
    notes: { type: String, default: '' },

    holders: { type: [holderSchema], default: [] },

    bannedAt: { type: Date, default: null },
    banReason: { type: String, default: '' },
    replacedById: { type: mongoose.Schema.Types.ObjectId, ref: 'PortalWaNumber', default: null },
    replacesId: { type: mongoose.Schema.Types.ObjectId, ref: 'PortalWaNumber', default: null },

    renewals: { type: [renewalSchema], default: [] },
    history: { type: [historySchema], default: [] },

    createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

waNumberSchema.index({ 'holders.memberId': 1 });

export default mongoose.models.PortalWaNumber || mongoose.model('PortalWaNumber', waNumberSchema, 'portalwanumbers');
