import mongoose from 'mongoose';

/**
 * SELLER DEVICES — one line per device / browser a store is signed in on (admin panel only).
 *
 * The seller app sends a small "I am here, on this page" signal when a page opens and every
 * couple of minutes while it is open. From that the admin panel shows: which devices are signed
 * in, which one is online now, the page it is on, browser, system, IP, place and network.
 * A device not seen for 180 days is removed by itself (lastSeenAt TTL).
 */
const sellerSessionSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    deviceId: { type: String, required: true }, // random id kept by that browser
    ua: { type: String, default: '' },
    browser: { type: String, default: '' },
    os: { type: String, default: '' },
    deviceType: { type: String, default: '' }, // Mobile | Tablet | Desktop
    model: { type: String, default: '' }, // phone model when the browser tells it
    app: { type: String, default: '' }, // "Website" | "Android app"
    tz: { type: String, default: '' }, // device time zone (Asia/Kolkata)
    lang: { type: String, default: '' },
    screen: { type: String, default: '' },
    ip: { type: String, default: '' },
    geo: {
      city: { type: String, default: '' },
      region: { type: String, default: '' },
      country: { type: String, default: '' },
      countryCode: { type: String, default: '' },
      timezone: { type: String, default: '' },
      isp: { type: String, default: '' },
      proxy: { type: Boolean, default: false }, // VPN / proxy / server network suspected
    },
    // last few different IPs this device used
    ips: {
      type: [
        {
          _id: false,
          ip: String,
          place: String,
          at: Date,
        },
      ],
      default: [],
    },
    tokenIat: { type: Number, default: 0 }, // when the login used on this device was made (seconds)
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    currentPage: { type: String, default: '' },
    currentPageName: { type: String, default: '' },
    pageSince: { type: Date, default: null },
    visible: { type: Boolean, default: true }, // tab in front (true) or in the background
    loggedOutAt: { type: Date, default: null },
    loggedOutBy: { type: String, default: '' }, // 'seller' | 'admin'
  },
  { collection: 'sellersessions', versionKey: false }
);

sellerSessionSchema.index({ seller: 1, deviceId: 1 }, { unique: true });
sellerSessionSchema.index({ seller: 1, lastSeenAt: -1 });
sellerSessionSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });

export default mongoose.model('SellerSession', sellerSessionSchema);
