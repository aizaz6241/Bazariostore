/**
 * Customer privacy for sellers.
 *
 * A store sees WHAT was ordered and WHERE it goes at city level — never who the customer is in
 * full, their street address, phone number or email. Delivery is done by Platform Operations, so
 * the store has no use for them, and the real details stay with the admins.
 *
 * Everything that leaves the server for a store (HTTP answers, socket events, notifications)
 * goes through these helpers. Admin answers are never masked.
 */

const plain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : { ...(doc || {}) });

// "Priya Sharma" -> "Priya S."   ·   "priya" -> "Priya"
export function maskName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Customer';
  const first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  return parts.length > 1 ? `${first} ${parts[parts.length - 1].charAt(0).toUpperCase()}.` : first;
}

// "+91 98765 43210" -> "+91 ••••• •••10"
export function maskPhone(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 4) return '•••';
  const cc = raw.startsWith('+') ? `+${digits.slice(0, Math.max(1, digits.length - 10))} ` : '';
  return `${cc}••••• •••${digits.slice(-2)}`;
}

// "priya.sharma@gmail.com" -> "p•••@gmail.com"
export function maskEmail(email) {
  const e = String(email || '').trim();
  const at = e.indexOf('@');
  if (at < 1) return e ? '•••' : '';
  return `${e[0]}•••${e.slice(at)}`;
}

function maskAddress(addr = {}) {
  return {
    fullName: maskName(addr.fullName),
    city: addr.city || '',
    state: addr.state || '',
    country: addr.country || '',
    // street, apartment and postal code are not sent to stores
    street: '',
    apartment: '',
    postalCode: '',
  };
}

/**
 * An order as a store may see it. `ownItems` (optional) limits `items` to the store's own lines,
 * so a shared order never shows another store's products or prices.
 */
export function sellerSafeOrder(order, ownItems) {
  if (!order) return order;
  const o = plain(order);
  o.shippingAddress = maskAddress(o.shippingAddress || {});
  o.contact = { phone: maskPhone(o.contact?.phone), email: maskEmail(o.contact?.email) };
  if (o.user && typeof o.user === 'object') {
    o.user = { _id: o.user._id, name: maskName(o.user.name), phone: maskPhone(o.user.phone), email: maskEmail(o.user.email) };
  }
  delete o.billingAddress;
  delete o.adminNotes;
  delete o.customerNote;
  if (Array.isArray(ownItems)) o.items = ownItems.map((it) => plain(it));
  o.privacyMasked = true;
  return o;
}

// what a store's screen needs to know that an order changed (it fetches the rest itself)
export function sellerOrderPing(order) {
  if (!order) return order;
  return { _id: order._id, orderNumber: order.orderNumber, status: order.status };
}
