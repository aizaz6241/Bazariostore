export function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
}

export function calculateHealthStatus(score) {
  const s = Number(score) || 0;
  if (s >= 80) return 'healthy';
  if (s >= 31) return 'at_risk';
  if (s > 20) return 'critical_risk';
  return 'suspended';
}
