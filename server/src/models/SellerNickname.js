import mongoose from 'mongoose';

/**
 * ADMIN-ONLY NICKNAME / LABEL for a store ("Ali from Lahore", "Big buyer", …) so the team remembers
 * who is who. Kept in its own collection, never on the Seller document, so no seller screen or
 * seller API can ever send it to the store. Read and changed only through admin routes.
 */
const sellerNicknameSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true, unique: true },
    nickname: { type: String, required: true, trim: true, maxlength: 40 },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true, collection: 'sellernicknames' }
);

export default mongoose.model('SellerNickname', sellerNicknameSchema);
