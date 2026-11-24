import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import Seller from '../models/Seller.js';
import SellerSession from '../models/SellerSession.js';
import SellerActivity from '../models/SellerActivity.js';
import { authAdmin, resolveSeller, forgetAuthCache } from '../middleware/auth.js';
import { jwtSecret } from '../utils/secrets.js';
import { clientIp } from '../utils/rateLimit.js';
import { audit } from '../utils/audit.js';
import { parseUA, geoLookup, placeOf, deviceText, logSellerActivity, sellerRequestStats } from '../services/sellerActivity.js';

/**
 * SELLER ACTIVITY & DEVICES
 *   POST /api/seller-activity/ping        seller app: "this device is here, on this page"
 *   POST /api/seller-activity/logout      seller app: this device logged out
 *   GET  /api/seller-activity/admin/:id   admin panel: devices + activity log + warning signs
 *   POST /api/seller-activity/admin/:id/sign-out-all   admin: end every login of that store
 * Sellers never get anything back from here (204), and never see this data.
 */
const router = express.Router();

const isId = (v) => !!v && mongoose.Types.ObjectId.isValid(String(v));
const cut = (v, n = 120) => String(v ?? '').slice(0, n);
const DEVICE_RE = /^[A-Za-z0-9_-]{8,64}$/;
const ONLINE_MS = 3 * 60 * 1000;

/* a seller's own login (also a frozen / suspended store — those matter most here) */
async function sellerOnly(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return res.status(204).end();
  let payload;
  try {
    payload = jwt.verify(token, jwtSecret());
  } catch {
    return res.status(204).end();
  }
  if (payload?.t !== 'seller') return res.status(204).end(); // an admin looking at a store: not tracked
  try {
    const out = await resolveSeller(payload);
    if (!out.seller) return res.status(401).json({ message: out.message });
    req.trackSeller = payload;
    next();
  } catch {
    return res.status(204).end();
  }
}

// at most one database write per device every 20 s, except when the page changes
const lastWrite = new Map(); // "seller|device" -> { at, page }
setInterval(() => {
  const old = Date.now() - 10 * 60 * 1000;
  for (const [k, v] of lastWrite) if (v.at < old) lastWrite.delete(k);
}, 5 * 60 * 1000).unref?.();

async function recordPing(req, p) {
  const sellerId = String(p.id);
  const b = req.body || {};
  const deviceId = cut(b.deviceId, 64);
  const ua = cut(req.headers['user-agent'], 400);
  const ip = cut(clientIp(req), 64);
  const page = cut(b.page, 160);
  const pageName = cut(b.pageName, 60);
  const model = cut(b.model, 60);
  const parsed = parseUA(ua);
  const now = new Date();

  const prev = await SellerSession.findOne({ seller: sellerId, deviceId }).lean();
  const ipChanged = !prev || prev.ip !== ip;
  const geo = ipChanged || !prev?.geo?.country ? await geoLookup(ip) : prev.geo;
  const place = placeOf(geo);
  const newLogin = !prev || (p.iat && prev.tokenIat !== p.iat);
  const pageChanged = page && (!prev || prev.currentPage !== page || newLogin);

  const set = {
    ua,
    browser: parsed.browser,
    os: parsed.os,
    deviceType: parsed.deviceType,
    model: model || parsed.model || prev?.model || '',
    app: b.app === 'android' ? 'Android app' : 'Website',
    tz: cut(b.tz, 60),
    lang: cut(b.lang, 20),
    screen: cut(b.screen, 20),
    ip,
    lastSeenAt: now,
    visible: b.visible !== false,
    tokenIat: Number(p.iat) || 0,
    loggedOutAt: null,
    loggedOutBy: '',
  };
  if (geo) set.geo = geo;
  if (page) {
    set.currentPage = page;
    set.currentPageName = pageName;
    if (pageChanged) set.pageSince = now;
  }
  const update = { $set: set, $setOnInsert: { seller: sellerId, deviceId, firstSeenAt: now } };
  if (ipChanged) update.$push = { ips: { $each: [{ ip, place, at: now }], $slice: -8 } };
  await SellerSession.updateOne({ seller: sellerId, deviceId }, update, { upsert: true });

  const from = { ip, ua };
  if (!prev) logSellerActivity(sellerId, { type: 'device', label: `New device: ${parsed.browser} on ${parsed.os}`, deviceId, model }, from);
  else if (ipChanged) logSellerActivity(sellerId, { type: 'ip', label: `IP changed: ${prev.ip || '?'} → ${ip}`, detail: place, deviceId, model }, from);
  if (pageChanged) logSellerActivity(sellerId, { type: 'page', label: `Opened ${pageName || page}`, page, deviceId, model }, from);
}

// POST /api/seller-activity/ping
router.post('/ping', express.json({ limit: '4kb' }), sellerOnly, (req, res) => {
  const p = req.trackSeller;
  const deviceId = String(req.body?.deviceId || '');
  res.status(204).end(); // answer first: the seller app never waits for this
  if (!DEVICE_RE.test(deviceId)) return;
  const key = `${p.id}|${deviceId}`;
  const last = lastWrite.get(key);
  const page = cut(req.body?.page, 160);
  if (last && Date.now() - last.at < 20000 && last.page === page) return;
  lastWrite.set(key, { at: Date.now(), page });
  recordPing(req, p).catch((err) => console.error('[seller-activity] ping:', err.message));
});

// POST /api/seller-activity/logout
router.post('/logout', express.json({ limit: '2kb' }), sellerOnly, (req, res) => {
  const p = req.trackSeller;
  const deviceId = String(req.body?.deviceId || '');
  res.status(204).end();
  if (!DEVICE_RE.test(deviceId)) return;
  lastWrite.delete(`${p.id}|${deviceId}`);
  SellerSession.updateOne({ seller: String(p.id), deviceId }, { $set: { loggedOutAt: new Date(), loggedOutBy: 'seller', lastSeenAt: new Date() } })
    .then(() => logSellerActivity(String(p.id), { type: 'logout', label: 'Logged out', deviceId }, req))
    .catch((err) => console.error('[seller-activity] logout:', err.message));
});

/* ───────────────────────────────── admin ───────────────────────────────── */

const TZ_ALIAS = { 'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Katmandu': 'Asia/Kathmandu', 'Asia/Saigon': 'Asia/Ho_Chi_Minh' };
const tzNorm = (t) => TZ_ALIAS[t] || t || '';

// GET /api/seller-activity/admin/:id?before=<iso>&type=<all|login|action|page|risk>
router.get('/admin/:id', authAdmin('sellers'), async (req, res) => {
  try {
    const id = req.params.id;
    if (!isId(id)) return res.status(404).json({ message: 'Seller not found' });
    const seller = await Seller.findById(id).select('storeName status pwdAt').lean();
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const now = Date.now();
    const pwdAt = seller.pwdAt ? new Date(seller.pwdAt).getTime() : 0;
    const filter = { seller: id };
    const before = req.query.before ? new Date(String(req.query.before)) : null;
    if (before && !Number.isNaN(before.getTime())) filter.at = { $lt: before };
    const kind = String(req.query.type || 'all');
    if (kind === 'login') filter.type = { $in: ['login', 'login_failed', 'login_pending', 'logout', 'device', 'ip', 'admin'] };
    else if (kind === 'action') filter.type = { $in: ['action', 'blocked'] };
    else if (kind === 'page') filter.type = 'page';
    else if (kind === 'risk') filter.$or = [{ ok: false }, { type: { $in: ['device', 'ip', 'burst', 'admin'] } }];

    const day = new Date(now - 24 * 3600 * 1000);
    const month = new Date(now - 30 * 24 * 3600 * 1000);
    const [rawSessions, events, failed24h, lastLogin, ips30, blocked24h] = await Promise.all([
      SellerSession.find({ seller: id }).sort({ lastSeenAt: -1 }).limit(40).lean(),
      SellerActivity.find(filter).sort({ at: -1 }).limit(80).lean(),
      SellerActivity.countDocuments({ seller: id, type: 'login_failed', at: { $gte: day } }),
      SellerActivity.findOne({ seller: id, type: 'login' }).sort({ at: -1 }).lean(),
      SellerActivity.distinct('ip', { seller: id, at: { $gte: month }, ip: { $ne: '' } }),
      SellerActivity.countDocuments({ seller: id, type: 'blocked', at: { $gte: day } }),
    ]);

    const sessions = rawSessions.map((s) => {
      const signedIn = !s.loggedOutAt && !(pwdAt && s.tokenIat && s.tokenIat * 1000 < pwdAt - 5000);
      const online = signedIn && now - new Date(s.lastSeenAt).getTime() < ONLINE_MS;
      const tzMismatch = Boolean(s.tz && s.geo?.timezone && tzNorm(s.tz) !== tzNorm(s.geo.timezone));
      return {
        id: String(s._id),
        deviceId: s.deviceId,
        browser: s.browser,
        os: s.os,
        device: deviceText({ deviceType: s.deviceType }, s.model),
        app: s.app,
        ip: s.ip,
        place: placeOf(s.geo),
        countryCode: s.geo?.countryCode || '',
        isp: s.geo?.isp || '',
        proxy: Boolean(s.geo?.proxy),
        tz: s.tz,
        ipTz: s.geo?.timezone || '',
        tzMismatch,
        lang: s.lang,
        screen: s.screen,
        ips: (s.ips || []).slice().reverse(),
        firstSeenAt: s.firstSeenAt,
        lastSeenAt: s.lastSeenAt,
        loginAt: s.tokenIat ? new Date(s.tokenIat * 1000) : null,
        currentPage: s.currentPage,
        currentPageName: s.currentPageName,
        pageSince: s.pageSince,
        visible: s.visible,
        signedIn,
        online,
        loggedOutAt: s.loggedOutAt,
        loggedOutBy: s.loggedOutBy,
        ua: s.ua,
      };
    });

    const signedIn = sessions.filter((s) => s.signedIn);
    const recent = sessions.filter((s) => now - new Date(s.lastSeenAt).getTime() < 30 * 24 * 3600 * 1000);
    const countries = [...new Set(recent.map((s) => s.place.split(', ').pop()).filter(Boolean))];
    const reqs = sellerRequestStats(id);

    const flags = [];
    if (signedIn.length >= 3) flags.push({ level: 'warn', text: `Signed in on ${signedIn.length} devices at the same time` });
    if (countries.length > 1) flags.push({ level: 'warn', text: `Used from ${countries.length} countries in 30 days: ${countries.join(', ')}` });
    if (recent.some((s) => s.proxy)) flags.push({ level: 'danger', text: 'VPN / proxy / server network detected on a device' });
    if (recent.some((s) => s.tzMismatch)) flags.push({ level: 'warn', text: 'Device time zone does not match the IP location (possible VPN)' });
    if (failed24h >= 3) flags.push({ level: failed24h >= 8 ? 'danger' : 'warn', text: `${failed24h} wrong-password attempts in 24 hours` });
    if (ips30.length >= 6) flags.push({ level: 'warn', text: `${ips30.length} different IP addresses in 30 days` });
    if (reqs.peakMinute >= reqs.burstLimit) flags.push({ level: 'danger', text: `Request flood: ${reqs.peakMinute} requests in one minute` });
    if (blocked24h >= 10) flags.push({ level: 'warn', text: `${blocked24h} refused actions in 24 hours` });

    res.json({
      seller: { id, storeName: seller.storeName, status: seller.status },
      online: sessions.some((s) => s.online),
      sessions,
      events: events.map((e) => ({
        id: String(e._id),
        type: e.type,
        label: e.label,
        page: e.page,
        detail: e.detail,
        ok: e.ok !== false,
        ip: e.ip,
        place: e.place,
        browser: e.browser,
        os: e.os,
        device: e.device,
        deviceId: e.deviceId,
        at: e.at,
      })),
      hasMore: events.length === 80,
      summary: {
        signedInDevices: signedIn.length,
        onlineDevices: sessions.filter((s) => s.online).length,
        totalDevices: sessions.length,
        lastLoginAt: lastLogin?.at || null,
        lastLoginPlace: lastLogin?.place || '',
        failedLogins24h: failed24h,
        blocked24h,
        ips30d: ips30.length,
        countries30d: countries,
        requests: reqs,
      },
      flags,
    });
  } catch (err) {
    console.error('[seller-activity] admin view:', err);
    res.status(500).json({ message: 'Could not load the activity log.' });
  }
});

// POST /api/seller-activity/admin/:id/sign-out-all — every device has to log in again
router.post('/admin/:id/sign-out-all', authAdmin('sellers'), async (req, res) => {
  try {
    const id = req.params.id;
    if (!isId(id)) return res.status(404).json({ message: 'Seller not found' });
    const at = new Date();
    const r = await Seller.updateOne({ _id: id }, { $set: { pwdAt: at } });
    if (!r.matchedCount) return res.status(404).json({ message: 'Seller not found' });
    forgetAuthCache('seller', id);
    await SellerSession.updateMany({ seller: id, loggedOutAt: null }, { $set: { loggedOutAt: at, loggedOutBy: 'admin' } });
    logSellerActivity(id, { type: 'admin', ok: false, label: 'All devices signed out by the team' }, { ip: '', ua: '' });
    audit(req, 'seller.sign_out_all_devices', 'seller', id);
    // the store's open pages get "session expired" on their next request and go to the login page
    req.app.get('io')?.to(`seller:${id}`).emit('seller:session_ended', { message: 'Please log in again.' });
    res.json({ ok: true, message: 'Every device of this store has been signed out. The password is unchanged.' });
  } catch (err) {
    console.error('[seller-activity] sign-out-all:', err);
    res.status(500).json({ message: 'Could not sign out the devices.' });
  }
});

export default router;
