import Discount from '../models/Discount.js';
import Product from '../models/Product.js';
import ShippingMethod from '../models/ShippingMethod.js';

function inWindow(d, now) {
  if (d.startsAt && now < d.startsAt) return false;
  if (d.endsAt && now > d.endsAt) return false;
  if (d.usageLimit > 0 && d.usedCount >= d.usageLimit) return false;
  return true;
}

function eligibleLines(d, lines) {
  if (d.scope === 'category') {
    const ids = new Set(d.categories.map(String));
    return lines.filter((l) => l.product.category && ids.has(String(l.product.category)));
  }
  if (d.scope === 'product') {
    const ids = new Set(d.products.map(String));
    return lines.filter((l) => ids.has(String(l.product._id)));
  }
  return lines;
}

function computeAmount(d, lines, subtotal, shippingCost) {
  const el = eligibleLines(d, lines);
  const eligible = el.reduce((s, l) => s + l.price * l.qty, 0);
  if (eligible <= 0) return { amount: 0, freeShipping: false };
  if (d.type === 'percentage') return { amount: Math.round((eligible * d.value) / 100), freeShipping: false };
  if (d.type === 'fixed') return { amount: Math.min(d.value, eligible), freeShipping: false };
  if (d.type === 'free_shipping') return { amount: 0, freeShipping: true };
  if (d.type === 'bxgy' && d.buyQty > 0 && d.getQty > 0) {
    let amount = 0;
    for (const l of el) {
      const freeUnits = Math.floor(l.qty / (d.buyQty + d.getQty)) * d.getQty;
      amount += freeUnits * l.price;
    }
    return { amount, freeShipping: false };
  }
  return { amount: 0, freeShipping: false };
}

// Core cart pricing: resolves products, shipping method, automatic discounts and coupon.
// items: [{ id, qty, size }]
export async function quoteCart({ items = [], couponCode = '', shippingMethodId = null }) {
  const lines = [];
  for (const it of items) {
    const p = await Product.findById(it.id);
    if (!p || !p.active) throw new Error('A product in your cart is no longer available');
    let price = p.price;
    if (it.size && p.sizes?.length) {
      const s = p.sizes.find((s) => s.label === it.size);
      if (s) price = s.price;
    }
    const qty = Math.max(1, Math.min(50, Number(it.qty) || 1));
    lines.push({ product: p, qty, price, size: it.size || '', variant: it.variant || '' });
  }
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);

  // shipping
  let method = null;
  if (shippingMethodId) method = await ShippingMethod.findOne({ _id: shippingMethodId, active: true });
  if (!method) method = await ShippingMethod.findOne({ active: true }).sort({ sortOrder: 1, cost: 1 });
  let shippingCost = method ? method.cost : 0;
  let shippingFreeReason = '';
  if (method && method.freeAbove != null && method.freeAbove >= 0 && subtotal >= method.freeAbove) {
    shippingCost = 0;
    if (method.cost > 0) shippingFreeReason = 'Free shipping rule';
  }

  const now = new Date();
  const applied = [];
  let couponError = '';

  // automatic discounts (no code)
  const autos = await Discount.find({ active: true, $or: [{ code: '' }, { code: null }] });
  for (const d of autos) {
    if (!inWindow(d, now)) continue;
    if (subtotal < (d.minPurchase || 0)) continue;
    const { amount, freeShipping } = computeAmount(d, lines, subtotal, shippingCost);
    if (freeShipping && shippingCost > 0) {
      applied.push({ label: d.name, code: '', amount: 0, freeShipping: true });
      shippingCost = 0;
    } else if (amount > 0) {
      applied.push({ label: d.name, code: '', amount });
    }
  }

  // coupon
  if (couponCode?.trim()) {
    const code = couponCode.trim().toUpperCase();
    const d = await Discount.findOne({ code, active: true });
    if (!d) couponError = 'Invalid coupon code';
    else if (!inWindow(d, now)) couponError = 'This coupon has expired or reached its limit';
    else if (subtotal < (d.minPurchase || 0)) couponError = `Minimum purchase Rs.${d.minPurchase} required for this coupon`;
    else {
      const { amount, freeShipping } = computeAmount(d, lines, subtotal, shippingCost);
      if (freeShipping) {
        applied.push({ label: d.name, code, amount: shippingCost > 0 ? 0 : 0, freeShipping: true });
        shippingCost = 0;
      } else if (amount > 0) {
        applied.push({ label: d.name, code, amount });
      } else couponError = 'This coupon does not apply to the items in your cart';
    }
  }

  let discountTotal = applied.reduce((s, a) => s + (a.amount || 0), 0);
  if (discountTotal > subtotal) discountTotal = subtotal;
  const total = subtotal - discountTotal + shippingCost;

  return {
    lines,
    subtotal,
    shipping: method
      ? { methodId: method._id, name: method.name, cost: shippingCost, eta: method.etaText, originalCost: method.cost, freeReason: shippingFreeReason }
      : { methodId: null, name: 'Standard Delivery', cost: 0, eta: '3-5 business days' },
    applied: applied.map(({ label, code, amount }) => ({ label, code, amount })),
    discountTotal,
    total,
    couponError,
  };
}
