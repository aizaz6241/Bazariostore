/**
 * Realistic Live Traffic & Viewing Metrics for Seller Portal
 * Generates believable, realistic visitor numbers that gently fluctuate over time.
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

/**
 * Returns a realistic active store visitor count for a seller.
 * Typically 18 to 42 active shoppers browsing the store,
 * gently fluctuating by ±1-3 over rolling intervals.
 */
export function getLiveStoreVisitors(sellerId = '', totalProducts = 10) {
  const baseSeed = hashStr(String(sellerId || 'bazario-store'));
  const catalogBonus = Math.min(12, Math.floor((totalProducts || 1) * 0.3));
  const baseCount = 19 + (baseSeed % 14) + catalogBonus; // 19 to 38

  // Small realistic organic fluctuation based on 25-second rolling window
  const timeBlock = Math.floor(Date.now() / 25000);
  const jitter = ((baseSeed + timeBlock * 7) % 7) - 3; // -3 to +3

  return Math.max(14, Math.min(58, baseCount + jitter));
}

/**
 * Returns a realistic live viewer count for a specific product.
 * Range: 3 to 25 people currently viewing this product.
 */
export function getProductLiveViewers(productId = '', price = 0) {
  const str = String(productId || 'prod');
  const h = hashStr(str);

  // Base range between 3 and 18
  let base = 3 + (h % 16);

  // Higher interest items (based on hash variation) get a slight bump
  if ((h >> 2) % 3 === 0) {
    base += 5;
  }

  // Realistic organic jitter (changes subtly every 35 seconds by ±1 or 0)
  const timeBlock = Math.floor(Date.now() / 35000);
  const jitter = ((h + timeBlock * 11) % 5) - 2; // -2 to +2

  return Math.max(2, Math.min(29, base + jitter));
}
