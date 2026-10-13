/**
 * Phone numbers are typed in many ways: "+91 98765-43210", "0091 9876543210", "09876543210",
 * "wa.me/919876543210". To know that two of them are the SAME person, only the digits are kept
 * and the LAST 10 digits are compared (the part after the country code / trunk 0 is the same
 * whichever way it was typed). Ten digits is the length of a mobile number in India, the US and
 * Pakistan, and of the UK number without its leading 0.
 */

export function phoneDigits(v) {
  return String(v || '').replace(/\D+/g, '');
}

/** The key two numbers are compared by ('' when it is not a usable phone number). */
export function phoneKey(v) {
  const d = phoneDigits(v);
  if (d.length < 7) return '';
  return d.length > 10 ? d.slice(-10) : d;
}

/** Same number written neatly for display: "+919876543210" (or the digits as typed when short). */
export function phoneDisplay(v) {
  const raw = String(v || '').trim();
  const d = phoneDigits(raw);
  if (!d) return '';
  if (raw.startsWith('+')) return `+${d}`;
  if (d.startsWith('00')) return `+${d.slice(2)}`;
  return d;
}
