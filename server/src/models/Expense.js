import mongoose from 'mongoose';

export const EXPENSE_TYPES = ['delivery', 'packaging', 'marketing', 'refund', 'misc'];

const expenseSchema = new mongoose.Schema(
  {
    type: { type: String, enum: EXPENSE_TYPES, default: 'misc' },
    amount: { type: Number, required: true },
    note: String,
    date: { type: Date, default: Date.now },
    createdBy: String,
  },
  { timestamps: true }
);

export default mongoose.model('Expense', expenseSchema);
