import mongoose from 'mongoose';

/**
 * A lead = a possible seller that was found (hunted) and is given to ONE team member to talk to.
 *
 * One phone number = one lead, for everybody (unique `phoneKey`): the same seller can never be
 * with two members at the same time. Whoever tries to add a number that is already there is told
 * that it is taken, and the attempt is written in the lead's history for the admins.
 *
 * When the seller registers a store with the same phone number, the lead becomes "converted" by
 * itself (see lib/utils/leads.js → reconcileLeadConversions) and the store approval screen
 * suggests this lead's member as the owner.
 */
const historySchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    type: { type: String, default: 'note' }, // created | assigned | unassigned | status | note | duplicate | converted | owner | number | edited
    by: { type: mongoose.Schema.Types.ObjectId, default: null },
    byName: { type: String, default: '' },
    text: { type: String, default: '' },
  },
  { _id: false }
);

export const LEAD_STATUSES = ['new', 'contacted', 'interested', 'converted', 'not_converted'];
export const LOST_REASONS = ['no_response', 'not_interested', 'fake', 'other_platform', 'other'];

const leadSchema = new mongoose.Schema(
  {
    name: { type: String, default: '', trim: true },
    phone: { type: String, required: true, trim: true },
    phoneKey: { type: String, required: true, unique: true },
    country: { type: String, default: '', trim: true },
    source: { type: String, default: 'other', trim: true }, // facebook | instagram | tiktok | whatsapp | google | referral | other
    sourceDetail: { type: String, default: '', trim: true }, // e.g. the group / page name
    notes: { type: String, default: '' },

    // who it is with
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'PortalMember', default: null, index: true },
    memberName: { type: String, default: '' },
    assignedAt: { type: Date, default: null },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    origin: { type: String, enum: ['admin', 'member'], default: 'admin' }, // given by the admins, or brought by the member himself
    addedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    addedByName: { type: String, default: '' },

    // where it stands
    status: { type: String, enum: LEAD_STATUSES, default: 'new', index: true },
    statusAt: { type: Date, default: Date.now },
    lostReason: { type: String, default: '' },
    everContacted: { type: Boolean, default: false },
    everInterested: { type: Boolean, default: false },
    lastActivityAt: { type: Date, default: Date.now, index: true },

    // the company WhatsApp number the member talks to this lead from
    waNumberId: { type: mongoose.Schema.Types.ObjectId, ref: 'PortalWaNumber', default: null, index: true },

    // the store, once the seller registered
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', default: null, index: true },
    storeName: { type: String, default: '' },
    convertedAt: { type: Date, default: null },
    convertedBy: { type: String, default: '' }, // 'auto' (phone matched) | 'approval' | admin name
    ownerId: { type: mongoose.Schema.Types.ObjectId, default: null }, // who the store was finally assigned to
    ownerName: { type: String, default: '' },

    duplicateAttempts: { type: Number, default: 0 },
    lastDuplicateAt: { type: Date, default: null },

    history: { type: [historySchema], default: [] },
  },
  { timestamps: true }
);

leadSchema.index({ memberId: 1, status: 1, lastActivityAt: -1 });
leadSchema.index({ status: 1, createdAt: -1 });
leadSchema.index({ createdAt: -1 });
leadSchema.index({ convertedAt: -1 });

export default mongoose.models.PortalLead || mongoose.model('PortalLead', leadSchema, 'portalleads');
