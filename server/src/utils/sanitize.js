/**
 * Escapes special regex characters in user input strings before passing to MongoDB $regex
 * to prevent Regular Expression Denial of Service (ReDoS) or unintended pattern matching.
 */
export function escapeRegex(string) {
  if (!string || typeof string !== 'string') return '';
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
