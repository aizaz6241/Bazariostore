/**
 * Removes database-operator keys from what the browser sends.
 *
 * Every lookup in this app expects plain text (an email, a token, a guest id...). A request can
 * send an object instead, for example { "$ne": null }, and the database then reads it as "match
 * anything". Dropping every key that starts with "$" from body / query makes
 * that impossible everywhere at once. Normal values are untouched.
 */
function clean(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 12) return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) value[i] = clean(value[i], depth + 1);
    return value;
  }
  if (Buffer.isBuffer(value) || value instanceof Date) return value;
  for (const key of Object.keys(value)) {
    if (key.startsWith('$') || key === '__proto__' || key === 'constructor' || key === 'prototype') {
      delete value[key];
    } else {
      value[key] = clean(value[key], depth + 1);
    }
  }
  return value;
}

export function sanitizeRequest(req, res, next) {
  try {
    if (req.body) clean(req.body);
    if (req.query) clean(req.query);
    if (req.params) clean(req.params);
  } catch (e) {
    /* never block a request because of the cleaner */
  }
  next();
}

/** A value that must be simple text (or a number). Anything else becomes ''. */
export function asText(v, max = 500) {
  if (typeof v === 'string') return v.slice(0, max);
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}
