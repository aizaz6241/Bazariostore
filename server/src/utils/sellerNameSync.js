import mongoose from 'mongoose';

/**
 * A store's name / owner / email / phone is also kept on its support chat (conversations:
 * storeName, sellerName, sellerEmail, sellerPhone), written when the chat was opened. When the
 * store changed its name later, the admin's chat list kept showing the old one.
 *
 * Seller model hooks call this whenever one of those fields changes (from any screen), and the
 * admin chat list repairs any chat that is still out of date when it loads. Only these four
 * copied labels are updated; nothing else in the chat changes.
 */
export const NAME_FIELDS = ['storeName', 'ownerName', 'email', 'phone'];

export function chatNamesOf(seller) {
  return {
    storeName: seller.storeName || '',
    sellerName: seller.ownerName || '',
    sellerEmail: seller.email || '',
    sellerPhone: seller.phone || '',
  };
}

export async function syncChatNames(seller) {
  try {
    if (!seller?._id || mongoose.connection.readyState !== 1) return;
    const names = chatNamesOf(seller);
    await mongoose.connection
      .collection('conversations')
      .updateMany(
        {
          seller: new mongoose.Types.ObjectId(String(seller._id)),
          $or: Object.entries(names).map(([k, v]) => ({ [k]: { $ne: v } })),
        },
        { $set: names }
      );
  } catch (e) {
    console.error('[chat names] sync failed:', e.message);
  }
}

/** Register on the Seller schema: any save / update that touches a name field re-syncs the chat. */
export function registerSellerNameSync(schema) {
  schema.pre('save', function (next) {
    this.$locals = this.$locals || {};
    this.$locals.syncChatNames = !this.isNew && NAME_FIELDS.some((f) => this.isModified(f));
    next();
  });
  schema.post('save', function (doc) {
    if (doc?.$locals?.syncChatNames) syncChatNames(doc);
  });

  const touchesNames = (update) => {
    if (!update) return false;
    const flat = { ...update, ...(update.$set || {}) };
    return NAME_FIELDS.some((f) => Object.prototype.hasOwnProperty.call(flat, f));
  };
  const afterQuery = async function () {
    try {
      if (!touchesNames(this.getUpdate())) return;
      const list = await this.model.find(this.getFilter()).select('storeName ownerName email phone').limit(50).lean();
      for (const s of list) await syncChatNames(s);
    } catch (e) {
      console.error('[chat names] sync after update failed:', e.message);
    }
  };
  schema.post('findOneAndUpdate', afterQuery);
  schema.post('updateOne', afterQuery);
  schema.post('updateMany', afterQuery);
}
