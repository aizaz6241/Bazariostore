import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    admin: { id: String, name: String, email: String },
    action: { type: String, index: true }, // e.g. product_added, price_changed, order_updated, login
    entity: String, // product | category | order | refund | discount | shipping | admin | content | settings
    entityId: String,
    details: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

export default mongoose.model('AuditLog', auditLogSchema);
