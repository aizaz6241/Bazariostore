import mongoose from 'mongoose';

/**
 * SELLER ACTIVITY LOG — admin panel only (Sellers → profile → Dashboard → Activity & Devices).
 *
 * One line per thing a store did: logged in, a wrong password, opened a page, confirmed an order,
 * asked for a deposit / withdrawal, changed the password … with the device, browser, IP and
 * place it came from. Sellers never see this. Lines delete themselves after 90 days (expireAt),
 * so the collection never grows without end.
 */
const sellerActivitySchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    // login | login_failed | login_pending | logout | page | action | blocked | burst | admin
    type: { type: String, required: true },
    label: { type: String, default: '' }, // "Confirmed order #BZ-1234"
    page: { type: String, default: '' }, // "/seller/orders"
    detail: { type: String, default: '' },
    ok: { type: Boolean, default: true }, // false = the server refused it
    ip: { type: String, default: '' },
    place: { type: String, default: '' }, // "Mumbai, Maharashtra, India"
    deviceId: { type: String, default: '' },
    browser: { type: String, default: '' }, // "Chrome 131"
    os: { type: String, default: '' }, // "Android 14"
    device: { type: String, default: '' }, // "Mobile · Samsung SM-A515F"
    at: { type: Date, default: Date.now },
    expireAt: { type: Date, required: true },
  },
  { collection: 'selleractivities', versionKey: false }
);

sellerActivitySchema.index({ seller: 1, at: -1 });
sellerActivitySchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('SellerActivity', sellerActivitySchema);
