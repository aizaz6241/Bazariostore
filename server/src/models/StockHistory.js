import mongoose from 'mongoose';

const stockHistorySchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', index: true },
    productName: String,
    change: Number, // +ve restock, -ve sold/adjustment
    stockAfter: Number,
    reason: String, // order | order_cancelled | adjustment | incoming | refund_restock
    note: String,
    by: String,
  },
  { timestamps: true }
);
export const StockHistory = mongoose.model('StockHistory', stockHistorySchema);

const incomingSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    productName: String,
    qty: { type: Number, required: true },
    expectedAt: Date,
    note: String,
    status: { type: String, enum: ['pending', 'received'], default: 'pending' },
    receivedAt: Date,
  },
  { timestamps: true }
);
export const IncomingStock = mongoose.model('IncomingStock', incomingSchema);
