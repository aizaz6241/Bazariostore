import mongoose from 'mongoose';
import SellerActivity from '../models/SellerActivity.js';
import Seller from '../models/Seller.js';
import { clientIp } from '../utils/rateLimit.js';
import { emailQuery } from '../utils/emailLookup.js';
import { cleanEmail } from '../utils/password.js';

/**
 * SELLER ACTIVITY & DEVICES (admin panel only — sellers never see any of it).
 *
 *  - tracker (middleware): writes a log line when a store logs in, types a wrong password, or does
 *    something important (confirms an order, asks for a deposit / withdrawal, changes the
 *    password …), also when the server refused it. It only listens to the answer ("finish"),
 *    it never changes a request or its answer.
 *  - counts each store's requests per minute, so a flood (bots / scripts hammering the server)
 *    shows up in the panel.
 *  - small helpers: browser / system from the user agent, place from the IP (cached).
 * Every write here is fire-and-forget: a failure is logged and never breaks the real request.
 */

const KEEP_DAYS = 90;
const isId = (v) => !!v && mongoose.Types.ObjectId.isValid(String(v));
const cut = (v, n = 200) => String(v ?? '').slice(0, n);

/* ─────────────────────────── browser / system / device ─────────────────────────── */

export function parseUA(uaRaw = '') {
  const ua = String(uaRaw || '');
  const v = (re) => (ua.match(re) || [])[1] || '';
  let browser = 'Unknown browser';
  if (/EdgA?\/|Edg\//.test(ua)) browser = `Edge ${v(/Edg(?:A|iOS)?\/(\d+)/)}`;
  else if (/OPR\/|Opera/.test(ua)) browser = `Opera ${v(/OPR\/(\d+)/)}`;
  else if (/SamsungBrowser\//.test(ua)) browser = `Samsung Internet ${v(/SamsungBrowser\/(\d+)/)}`;
  else if (/UCBrowser\//.test(ua)) browser = `UC Browser ${v(/UCBrowser\/(\d+)/)}`;
  else if (/YaBrowser\//.test(ua)) browser = `Yandex ${v(/YaBrowser\/(\d+)/)}`;
  else if (/FxiOS\//.test(ua)) browser = `Firefox ${v(/FxiOS\/(\d+)/)}`;
  else if (/Firefox\//.test(ua)) browser = `Firefox ${v(/Firefox\/(\d+)/)}`;
  else if (/CriOS\//.test(ua)) browser = `Chrome ${v(/CriOS\/(\d+)/)}`;
  else if (/; wv\)/.test(ua)) browser = `Android app (WebView ${v(/Chrome\/(\d+)/)})`;
  else if (/Chrome\//.test(ua)) browser = `Chrome ${v(/Chrome\/(\d+)/)}`;
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = `Safari ${v(/Version\/(\d+(?:\.\d+)?)/)}`;
  browser = browser.trim();

  let os = 'Unknown system';
  if (/Windows NT 10/.test(ua)) os = 'Windows 10/11';
  else if (/Windows NT 6\.3/.test(ua)) os = 'Windows 8.1';
  else if (/Windows NT 6\.1/.test(ua)) os = 'Windows 7';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Android/.test(ua)) os = `Android ${v(/Android (\d+(?:\.\d+)?)/)}`.trim();
  else if (/iPhone|iPad|iPod/.test(ua)) os = `iOS ${v(/OS (\d+(?:_\d+)?)/).replace('_', '.')}`.trim();
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  let deviceType = 'Desktop';
  if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) deviceType = 'Tablet';
  else if (/Mobi|iPhone|iPod|Android/.test(ua)) deviceType = 'Mobile';

  let model = '';
  if (/iPhone/.test(ua)) model = 'iPhone';
  else if (/iPad/.test(ua)) model = 'iPad';
  else if (/Android/.test(ua)) {
    const m = ua.match(/Android [^;)]*;\s*([^;)]+?)(?:\sBuild\/[^;)]*)?[;)]/);
    const name = (m?.[1] || '').trim();
    if (name && name !== 'K' && !/^wv$/i.test(name) && !/^[a-z]{2}-[a-z]{2}$/i.test(name)) model = name;
  }
  const bot = /bot|crawler|spider|curl|wget|python|axios|node-fetch|postman|insomnia|httpclient|okhttp|java\//i.test(ua);
  return { browser, os, deviceType, model, bot };
}

export function deviceText(p, model) {
  return [p.deviceType, model || p.model].filter(Boolean).join(' · ');
}

/* ─────────────────────────────── place from IP ─────────────────────────────── */

const geoCache = new Map(); // ip -> { at, value }
const GEO_TTL = 24 * 3600 * 1000;
const GEO_MAX = 3000;
const HOSTING_RE =
  /hosting|host|server|datacenter|data center|cloud|vpn|proxy|digitalocean|amazon|aws|google|microsoft|azure|ovh|hetzner|linode|akamai|vultr|choopa|m247|leaseweb|contabo|oracle|alibaba|tencent|scaleway|cloudflare|nord|express ?vpn|surfshark|private internet|mullvad|packethub|datacamp|cdn77|zenlayer|psychz|quadranet|colocrossing|hostinger|ionos|kamatera/i;

function isPrivateIp(ip) {
  return !ip || ip === '::1' || /^127\./.test(ip) || /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || /^(fc|fd|fe80)/i.test(ip) || ip === 'unknown';
}

async function fetchJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(3000), headers: { Accept: 'application/json', 'User-Agent': 'bazario-api' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const PROVIDERS = [
  async (ip) => {
    const d = await fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}`);
    if (d.success === false) throw new Error(d.message || 'failed');
    return { city: d.city, region: d.region, country: d.country, countryCode: d.country_code, timezone: d.timezone?.id, isp: d.connection?.org || d.connection?.isp, proxy: false };
  },
  async (ip) => {
    const d = await fetchJson(`https://freeipapi.com/api/json/${encodeURIComponent(ip)}`);
    if (!d.countryName) throw new Error('failed');
    return { city: d.cityName, region: d.regionName, country: d.countryName, countryCode: d.countryCode, timezone: Array.isArray(d.timeZones) ? d.timeZones[0] : d.timeZone, isp: d.asnOrganization || '', proxy: Boolean(d.isProxy) };
  },
  async (ip) => {
    const d = await fetchJson(`https://ipapi.co/${encodeURIComponent(ip)}/json/`);
    if (d.error || !d.country_name) throw new Error(d.reason || 'failed');
    return { city: d.city, region: d.region, country: d.country_name, countryCode: d.country_code, timezone: d.timezone, isp: d.org, proxy: false };
  },
];

/** Place of an IP: { city, region, country, countryCode, timezone, isp, proxy } or null. */
export async function geoLookup(ip) {
  if (isPrivateIp(ip)) return null;
  const hit = geoCache.get(ip);
  if (hit && Date.now() - hit.at < GEO_TTL) return hit.value;
  let value = null;
  for (const p of PROVIDERS) {
    try {
      const g = await p(ip);
      value = {
        city: cut(g.city, 80),
        region: cut(g.region, 80),
        country: cut(g.country, 80),
        countryCode: cut(g.countryCode, 4).toUpperCase(),
        timezone: cut(g.timezone, 60),
        isp: cut(g.isp, 120),
        proxy: Boolean(g.proxy),
      };
      value.proxy = value.proxy || HOSTING_RE.test(value.isp);
      break;
    } catch {
      /* next provider */
    }
  }
  if (geoCache.size >= GEO_MAX) geoCache.delete(geoCache.keys().next().value);
  // a failed lookup is remembered for 10 minutes only
  geoCache.set(ip, { at: value ? Date.now() : Date.now() - GEO_TTL + 10 * 60 * 1000, value });
  return value;
}

export function placeOf(g) {
  if (!g) return '';
  return [g.city, g.region && g.region !== g.city ? g.region : '', g.country].filter(Boolean).join(', ');
}

/* ─────────────────────────────── writing a line ─────────────────────────────── */

/**
 * Add one line to a store's activity log. Never throws, never blocks: call without await.
 * from: the request (IP + user agent are taken from it) or { ip, ua }.
 */
export async function logSellerActivity(sellerId, { type, label = '', page = '', detail = '', ok = true, deviceId = '', model = '' }, from = {}) {
  try {
    if (!isId(sellerId)) return;
    const ip = from.headers ? clientIp(from) : cut(from.ip, 64);
    const ua = from.headers ? String(from.headers['user-agent'] || '') : String(from.ua || '');
    const p = parseUA(ua);
    const geo = await geoLookup(ip);
    const now = new Date();
    await SellerActivity.create({
      seller: sellerId,
      type: cut(type, 30),
      label: cut(label, 200),
      page: cut(page, 160),
      detail: cut(detail, 300),
      ok,
      ip: cut(ip, 64),
      place: placeOf(geo),
      deviceId: cut(deviceId, 64),
      browser: p.browser,
      os: p.os,
      device: p.bot ? 'Script / bot — not a normal browser' : deviceText(p, model),
      at: now,
      expireAt: new Date(now.getTime() + KEEP_DAYS * 24 * 3600 * 1000),
    });
  } catch (err) {
    console.error('[seller-activity] log failed:', err.message);
  }
}

/* ─────────────────────────── requests per minute ─────────────────────────── */

const reqCounts = new Map(); // sellerId -> Map(minute -> count)
const BURST_PER_MIN = 150;
const burstNoted = new Map(); // sellerId -> time a burst line was last written

export function noteSellerRequest(sellerId, req) {
  const id = String(sellerId);
  const minute = Math.floor(Date.now() / 60000);
  let m = reqCounts.get(id);
  if (!m) {
    if (reqCounts.size > 20000) reqCounts.clear();
    m = new Map();
    reqCounts.set(id, m);
  }
  const n = (m.get(minute) || 0) + 1;
  m.set(minute, n);
  if (m.size > 12) for (const k of m.keys()) if (k < minute - 10) m.delete(k);
  if (n === BURST_PER_MIN && Date.now() - (burstNoted.get(id) || 0) > 10 * 60 * 1000) {
    burstNoted.set(id, Date.now());
    logSellerActivity(id, { type: 'burst', ok: false, label: `Unusual traffic: ${BURST_PER_MIN}+ requests in one minute`, detail: 'Possible bot / script or the app stuck in a loop.' }, req);
  }
}

/** { lastMinute, peakMinute, last10 } for one store (this server's own count since its start). */
export function sellerRequestStats(sellerId) {
  const m = reqCounts.get(String(sellerId));
  const minute = Math.floor(Date.now() / 60000);
  if (!m) return { lastMinute: 0, peakMinute: 0, last10: 0, burstLimit: BURST_PER_MIN };
  let peak = 0;
  let total = 0;
  for (const [k, n] of m) {
    if (k < minute - 10) continue;
    total += n;
    if (n > peak) peak = n;
  }
  return { lastMinute: (m.get(minute) || 0) + 0, peakMinute: peak, last10: total, burstLimit: BURST_PER_MIN };
}

/* ─────────────────────────────── the tracker ─────────────────────────────── */

const money = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '';
};
const orderNo = (body, req) => {
  const o = body?.order || body;
  const no = o?.orderNumber || o?.number || '';
  return no ? `#${no}` : req.params?.id ? `(${String(req.params.id).slice(-6)})` : '';
};
const idTail = (path) => {
  const m = path.match(/\/([a-f0-9]{24})(?:\/|$)/i);
  return m ? `(${m[1].slice(-6)})` : '';
};

// [method regex, path regex, (req, body, path) => label]
const ACTIONS = [
  [/POST/, /^\/sellers\/orders\/[^/]+\/confirm$/, (req, b, p) => `Confirmed order ${orderNo(b, req) || idTail(p)}`],
  [/PUT|PATCH|POST/, /^\/sellers\/orders\/[^/]+(\/status)?$/, (req, b, p) => `Order ${orderNo(b, req) || idTail(p)} → ${cut(req.body?.status || req.body?.itemStatus || 'updated', 40)}`],
  [/POST/, /^\/sellers\/wallet\/deposit$/, (req) => `Deposit request ${money(req.body?.amount)}`.trim()],
  [/POST/, /^\/sellers\/wallet\/withdraw$/, (req) => `Withdrawal request ${money(req.body?.amount)}`.trim()],
  [/POST/, /^\/sellers\/wallet\/limit-increase-request$/, () => 'Asked for a higher withdrawal limit'],
  [/POST/, /^\/sellers\/wallet\/limit-offer-response$/, () => 'Answered a withdrawal-limit offer'],
  [/POST/, /^\/sellers\/me\/change-password$/, () => 'Changed the password'],
  [/PUT/, /^\/sellers\/me$/, () => 'Changed store settings / payout details'],
  [/POST/, /^\/sellers\/me\/documents$/, () => 'Uploaded documents (ID / PAN)'],
  [/POST/, /^\/sellers\/store-closure\/apply$/, () => 'Applied to close the store'],
  [/POST/, /^\/sellers\/store-closure\/cancel$/, () => 'Cancelled the store-closure request'],
  [/POST/, /^\/sellers\/tier\/request-upgrade$/, () => 'Requested the Diamond upgrade'],
  [/POST/, /^\/sellers\/products$/, () => 'Added a product'],
  [/PUT/, /^\/sellers\/products\/[^/]+$/, (r, b, p) => `Edited a product ${idTail(p)}`],
  [/DELETE/, /^\/sellers\/products\/[^/]+$/, (r, b, p) => `Removed a product ${idTail(p)}`],
  [/POST/, /^\/sellers\/treasury\/[^/]+\/add$/, () => 'Added a Treasury product to the store'],
  [/POST|PUT|DELETE/, /^\/sellers\/coupons(\/[^/]+)?$/, (req) => ({ POST: 'Created a coupon', PUT: 'Edited a coupon', DELETE: 'Deleted a coupon' })[req.method]],
  [/POST|PUT|DELETE/, /^\/sellers\/shipping(\/[^/]+)?$/, () => 'Changed shipping settings'],
];

const LOGIN_PATHS = /^\/(sellers\/login|auth\/any-login)$/;

function cleanPath(req) {
  const raw = String(req.originalUrl || req.url || '').split('?')[0];
  return (raw.toLowerCase().replace(/\/+$/, '') || '/').replace(/^\/api(?=\/)/, '');
}

/** Express middleware (mounted once, before the routes). */
export function sellerActivityTracker(req, res, next) {
  const path = cleanPath(req);
  const method = req.method;
  if (method === 'OPTIONS' || method === 'HEAD') return next();

  const isLogin = method === 'POST' && LOGIN_PATHS.test(path);
  const action = !isLogin && method !== 'GET' ? ACTIONS.find(([m, p]) => m.test(method) && p.test(path)) : null;

  let body;
  if (isLogin || action) {
    const json = res.json.bind(res);
    res.json = (b) => {
      body = b;
      return json(b);
    };
  }

  res.on('finish', () => {
    try {
      const status = res.statusCode;
      const who = req.seller && req.seller.t === 'seller' ? String(req.seller.id) : '';
      if (who) noteSellerRequest(who, req);

      if (isLogin) {
        const sid = body?.seller?._id ? String(body.seller._id) : '';
        if (status === 200 && body?.token && sid) {
          logSellerActivity(sid, { type: 'login', label: 'Logged in' }, req);
        } else if (status === 403 && body?.sellerId && body?.isPendingApproval) {
          logSellerActivity(String(body.sellerId), { type: 'login_pending', ok: false, label: 'Tried to log in — application still under review' }, req);
        } else if (status === 401 || status === 429) {
          // wrong password for a store's email (unknown emails are not logged)
          const email = cleanEmail(String(req.body?.email || '').slice(0, 200));
          if (email) {
            Seller.findOne(emailQuery(Seller, email))
              .select('_id')
              .lean()
              .then((s) => {
                if (s) logSellerActivity(String(s._id), { type: 'login_failed', ok: false, label: status === 429 ? 'Login blocked — too many wrong passwords' : 'Wrong password' }, req);
              })
              .catch(() => {});
          }
        }
        return;
      }

      if (action && who) {
        const label = cut(action[2](req, body, path) || 'Action', 200);
        if (status < 400) logSellerActivity(who, { type: 'action', label }, req);
        else if (status !== 401) logSellerActivity(who, { type: 'blocked', ok: false, label: `Tried: ${label}`, detail: cut(body?.message || `Refused (${status})`, 300) }, req);
      }
    } catch (err) {
      console.error('[seller-activity] tracker:', err.message);
    }
  });
  next();
}
