/**
 * Small in-memory rate limiter (no extra package, one server process).
 *
 *   limit({ name, max, windowMs, key })        counts every request
 *   failureLimiter({ name, max, windowMs })    counts only FAILED attempts (logins): a correct
 *                                              password is never blocked by someone else's typos
 *                                              from another network, and success clears the count
 */

const buckets = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
}, 5 * 60 * 1000).unref?.();

/**
 * The visitor's own address. Hosting such as Render puts more than one proxy in front of the
 * app, so the address Express sees can be a shared proxy address; the limits would then count
 * all visitors together and could lock out people who did nothing. The front proxy writes the
 * real visitor address into these headers (and overwrites anything the visitor sent), so they
 * are used first.
 */
export function clientIp(req) {
  const fromProxy = req.headers?.['cf-connecting-ip'] || req.headers?.['true-client-ip'];
  if (typeof fromProxy === 'string' && /^[0-9a-fA-F:.]{3,45}$/.test(fromProxy.trim())) return fromProxy.trim();
  // several proxies in a row and no such header: the first address in the chain is the visitor
  const chain = String(req.headers?.['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (chain.length > 1 && /^[0-9a-fA-F:.]{3,45}$/.test(chain[0])) return chain[0];
  return String(req.ip || req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown');
}

function hit(key, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.reset) {
    b = { count: 0, reset: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  return b;
}

function peek(key) {
  const b = buckets.get(key);
  if (!b || Date.now() > b.reset) return null;
  return b;
}

const waitText = (ms) => {
  const min = Math.max(1, Math.ceil(ms / 60000));
  return `${min} minute${min === 1 ? '' : 's'}`;
};

/** Express middleware: at most `max` requests per `windowMs` for each key (default: per IP). */
export function limit({ name, max, windowMs, key = (req) => clientIp(req), message }) {
  return (req, res, next) => {
    let k;
    try {
      k = `${name}:${key(req)}`;
    } catch {
      k = `${name}:${clientIp(req)}`;
    }
    const b = hit(k, windowMs);
    if (b.count > max) {
      res.setHeader('Retry-After', Math.ceil((b.reset - Date.now()) / 1000));
      return res.status(429).json({ message: message || `Too many requests. Please try again in ${waitText(b.reset - Date.now())}.` });
    }
    next();
  };
}

/**
 * For login-style routes. Use:
 *   const guard = failureLimiter({ name: 'admin-login', max: 8, windowMs: 15 * 60 * 1000 });
 *   const state = guard.check(req, email);   if (state.blocked) return res.status(429)...
 *   guard.fail(req, email)  on a wrong password,  guard.ok(req, email)  on success
 * Two counters: this account from this address (strict) and this address overall (loose).
 */
export function failureLimiter({ name, max = 8, windowMs = 15 * 60 * 1000, ipMax = 40 }) {
  const keys = (req, id) => {
    const ip = clientIp(req);
    return [`${name}:pair:${String(id || '').toLowerCase()}|${ip}`, `${name}:ip:${ip}`];
  };
  return {
    check(req, id) {
      const [pair, ip] = keys(req, id);
      const a = peek(pair);
      const b = peek(ip);
      const blockedBy = a && a.count >= max ? a : b && b.count >= ipMax ? b : null;
      if (!blockedBy) return { blocked: false };
      return { blocked: true, message: `Too many wrong attempts. Please try again in ${waitText(blockedBy.reset - Date.now())}.` };
    },
    fail(req, id) {
      const [pair, ip] = keys(req, id);
      hit(pair, windowMs);
      hit(ip, windowMs);
    },
    ok(req, id) {
      const [pair] = keys(req, id);
      buckets.delete(pair);
    },
  };
}

/** For tests. */
export function _resetRateLimits() {
  buckets.clear();
}
