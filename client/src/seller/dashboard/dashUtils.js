// Small helpers shared by the seller dashboard pieces.

// a calendar day in the seller's own time zone: 'YYYY-MM-DD'
export const dayKey = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export const longDay = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};
export const shortDay = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
};
export const timeOf = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// money in the chosen currency, short: $1.2k, ₹3.4M
export function makeCompact(convert, symbol) {
  return (usd) => {
    const v = convert(Number(usd) || 0);
    const a = Math.abs(v);
    const sign = v < 0 ? '−' : '';
    if (a >= 1e6) return `${sign}${symbol}${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
    if (a >= 1e3) return `${sign}${symbol}${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
    return `${sign}${symbol}${a.toFixed(a > 0 && a < 10 ? 2 : 0)}`;
  };
}

// order status -> label + colour group used everywhere on the dashboard
export const STATUS_META = {
  pending: { label: 'Awaiting confirmation', tone: 'amber' },
  confirmed: { label: 'Confirmed', tone: 'blue' },
  processing: { label: 'Processing', tone: 'blue' },
  packed: { label: 'Packed', tone: 'blue' },
  out_from_warehouse: { label: 'Left warehouse', tone: 'indigo' },
  delivery_warehouse: { label: 'At delivery hub', tone: 'indigo' },
  shipped: { label: 'Shipped', tone: 'indigo' },
  out_for_delivery: { label: 'Out for delivery', tone: 'indigo' },
  delivered: { label: 'Delivered', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
  refunded: { label: 'Refunded', tone: 'red' },
};
export const statusMeta = (s) => STATUS_META[s] || { label: String(s || 'pending').replace(/_/g, ' '), tone: 'slate' };
export const isClosed = (s) => s === 'cancelled' || s === 'refunded';
