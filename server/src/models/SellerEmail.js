import mongoose from 'mongoose';

/**
 * Emails the support team sent to stores by hand (Support inbox → ✉️ Email). Kept so the team can
 * see what was sent to whom, when, and by whom. The automatic emails are not logged here.
 */
const sellerEmailLogSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', index: true },
    storeName: { type: String, default: '' },
    to: { type: String, default: '' },
    subject: { type: String, default: '' },
    heading: { type: String, default: '' },
    body: { type: String, default: '' }, // as sent (placeholders filled in)
    note: { type: String, default: '' },
    tone: { type: String, default: 'info' },
    buttonKey: { type: String, default: '' },
    templateKey: { type: String, default: '' }, // '' = written from scratch
    templateLabel: { type: String, default: '' },
    status: { type: String, enum: ['sent', 'failed'], default: 'sent', index: true },
    error: { type: String, default: '' },
    messageId: { type: String, default: '' },
    sentBy: { id: String, name: String },
  },
  { timestamps: true }
);
sellerEmailLogSchema.index({ createdAt: -1 });

/** Email templates the team saved for later (shared by all full admins). */
const sellerEmailTemplateSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    category: { type: String, default: 'general' },
    tone: { type: String, default: 'info' },
    badge: { type: String, default: '' },
    subject: { type: String, default: '' },
    heading: { type: String, default: '' },
    body: { type: String, default: '' },
    note: { type: String, default: '' },
    buttonKey: { type: String, default: '' },
    createdBy: { id: String, name: String },
  },
  { timestamps: true }
);

export const SellerEmailLog = mongoose.models.SellerEmailLog || mongoose.model('SellerEmailLog', sellerEmailLogSchema);
export const SellerEmailTemplate = mongoose.models.SellerEmailTemplate || mongoose.model('SellerEmailTemplate', sellerEmailTemplateSchema);
