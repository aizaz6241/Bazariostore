/**
 * Central Currency & USDT Conversion Utility for Team Portal
 *
 * Rates:
 * Binance P2P Standard Reference:
 * 1 USDT ≈ 90.00 INR
 * 1 USDT ≈ 280.00 PKR
 */

export const USDT_INR_RATE = Number(process.env.USDT_INR_RATE) || 90.0;
export const USDT_PKR_RATE = Number(process.env.USDT_PKR_RATE) || 280.0;

/**
 * Convert INR to USDT
 */
export function inrToUSDT(amount) {
  const num = Number(amount || 0);
  if (isNaN(num) || num === 0) return 0;
  return Number((num / USDT_INR_RATE).toFixed(2));
}

/**
 * Convert PKR to USDT
 */
export function pkrToUSDT(amount) {
  const num = Number(amount || 0);
  if (isNaN(num) || num === 0) return 0;
  return Number((num / USDT_PKR_RATE).toFixed(2));
}

/**
 * Convert USDT to INR
 */
export function usdtToINR(amount) {
  const num = Number(amount || 0);
  if (isNaN(num) || num === 0) return 0;
  return Number((num * USDT_INR_RATE).toFixed(2));
}

/**
 * Convert USDT to PKR
 */
export function usdtToPKR(amount) {
  const num = Number(amount || 0);
  if (isNaN(num) || num === 0) return 0;
  return Number((num * USDT_PKR_RATE).toFixed(2));
}

/**
 * Generic toUSDT converter given an amount and source currency
 */
export function toUSDT(amount, currency = 'USDT') {
  const num = Number(amount || 0);
  if (isNaN(num) || num === 0) return 0;
  const cleanCurr = (currency || 'USDT').toUpperCase();
  if (cleanCurr === 'INR') return inrToUSDT(num);
  if (cleanCurr === 'PKR') return pkrToUSDT(num);
  return Number(num.toFixed(2));
}

/**
 * Format currency with 2 decimals and thousands separators
 */
export function formatMoney(val, decimals = 2) {
  const num = Number(val || 0);
  if (isNaN(num)) return '0.00';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format USDT string: ₮1,250.00 USDT
 */
export function formatUSDT(amount, decimals = 2) {
  return `₮${formatMoney(amount, decimals)} USDT`;
}
