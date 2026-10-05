/**
 * Lightweight in-memory rate limiter for Next.js API routes
 * Does not require Redis or external dependencies.
 */

const rateLimitMap = new Map();

// Periodic cleanup of expired entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, data] of rateLimitMap.entries()) {
      if (now > data.resetTime) {
        rateLimitMap.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

/**
 * Check if a request exceeds rate limit
 * @param {string} key - Unique identifier (e.g. IP + endpoint)
 * @param {number} limit - Maximum allowed requests in window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {{ allowed: boolean, remaining: number, resetTime: number }}
 */
export function checkRateLimit(key, limit = 15, windowMs = 60 * 1000, { peek = false } = {}) {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  // peek: only look (used to count FAILED logins: the count goes up on a wrong password only)
  if (peek) {
    if (!entry || now > entry.resetTime) return { allowed: true, remaining: limit, resetTime: now + windowMs };
    return { allowed: entry.count < limit, remaining: Math.max(0, limit - entry.count), resetTime: entry.resetTime };
  }

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });
    return { allowed: true, remaining: limit - 1, resetTime: now + windowMs };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetTime: entry.resetTime };
  }

  entry.count += 1;
  return { allowed: true, remaining: limit - entry.count, resetTime: entry.resetTime };
}
