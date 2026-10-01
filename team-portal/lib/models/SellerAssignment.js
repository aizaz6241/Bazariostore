import mongoose from 'mongoose';

const sellerAssignmentSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller',
      required: true,
      index: true,
    },
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PortalMember',
      required: true,
      index: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PortalMember',
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'transferred', 'archived'],
      default: 'active',
    },
    // Commission model label: 'inr_50' (50% INR Split) or 'pkr_1to1' (1:1 PKR Earning)
    commissionLabel: {
      type: String,
      enum: ['inr_50', 'pkr_1to1'],
      default: 'pkr_1to1',
    },
    // Private CRM memory notes for the member
    privateNotes: {
      customName: { type: String, default: '' },      // Member's custom alias / nickname for the seller
      age: { type: String, default: '' },
      occupation: { type: String, default: '' },
      maritalStatus: { type: String, default: '' },
      location: { type: String, default: '' },
      picture: { type: String, default: '' },
      details: { type: String, default: '' },         // Free-form personal memory notes
      updatedAt: { type: Date, default: Date.now },
    },
  },
  { timestamps: true }
);

// Unique compound index so one seller has one active assignment
sellerAssignmentSchema.index({ sellerId: 1, status: 1 });

export default mongoose.models.PortalSellerAssignment || mongoose.model('PortalSellerAssignment', sellerAssignmentSchema);
