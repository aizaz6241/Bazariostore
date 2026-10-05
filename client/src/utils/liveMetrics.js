/**
 * Realistic Live Traffic & Viewing Metrics for Seller Portal
 * Generates believable, realistic visitor numbers that gently fluctuate in real-time.
 */

function hashStr(str = '') {
  let hash = 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// In-memory smooth cache for persistent stateful walking per id
const storeCache = new Map();
const productCache = new Map();

/**
 * Returns a realistic active store visitor count for a seller.
 * Realistic Range: 7 to 18 active shoppers (average 10-14).
 * Gently fluctuates in real time without unrealistically huge or tiny numbers.
 */
export function getLiveStoreVisitors(sellerId = '', totalProducts = 10) {
  const key = String(sellerId || 'bazario-store');
  const baseSeed = hashStr(key);
  // Base center between 9 and 14
  const targetBase = 9 + (baseSeed % 6);

  if (!storeCache.has(key)) {
    storeCache.set(key, targetBase);
    return targetBase;
  }

  // Smooth random walk: step by +1, -1, or stay same (0)
  const current = storeCache.get(key);
  const rand = Math.random();
  let step = 0;
  if (rand < 0.38) {
    step = current < targetBase + 3 ? 1 : -1;
  } else if (rand < 0.76) {
    step = current > targetBase - 3 ? -1 : 1;
  }

  const next = Math.max(7, Math.min(18, current + step));
  storeCache.set(key, next);
  return next;
}

/**
 * Returns a realistic live viewer count for a specific product.
 * Realistic Range: 2 to 7 people viewing this product right now.
 * Never displays absurd spikes.
 */
export function getProductLiveViewers(productId = '', price = 0) {
  const key = String(productId || 'prod');
  const h = hashStr(key);
  // Base center between 2 and 5
  const targetBase = 2 + (h % 4);

  if (!productCache.has(key)) {
    productCache.set(key, targetBase);
    return targetBase;
  }

  // Smooth random walk: step by +1, -1, or 0
  const current = productCache.get(key);
  const rand = Math.random();
  let step = 0;
  if (rand < 0.35) {
    step = current < 6 ? 1 : -1;
  } else if (rand < 0.70) {
    step = current > 2 ? -1 : 1;
  }

  const next = Math.max(2, Math.min(7, current + step));
  productCache.set(key, next);
  return next;
}
