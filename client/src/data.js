export const PROVINCES = [
  'Alabama', 'Alaska', 'Arizona', 'California', 'Colorado', 'Florida',
  'Georgia', 'Illinois', 'Michigan', 'New York', 'Ohio', 'Pennsylvania',
  'Texas', 'Washington', 'Ontario', 'Quebec', 'British Columbia',
  'England', 'Scotland', 'Wales', 'Other',
];

export const STATUS_STEPS = ['pending', 'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered'];

export const STATUS_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  processing: 'Processing',
  packed: 'Packed',
  shipped: 'Shipped',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

export const ALL_STATUSES = [...STATUS_STEPS, 'cancelled', 'refunded'];

export const PAYMENT_LABELS = {
  cod: 'Cash on Delivery',
  credit_card: 'Credit Card',
  debit_card: 'Debit Card',
  stripe: 'Stripe',
  paypal: 'PayPal',
};

export const PRODUCT_LABELS = {
  new: { text: 'NEW', cls: 'new' },
  sale: { text: 'SALE', cls: 'sale' },
  hot: { text: 'HOT SELLING', cls: 'hot' },
  best: { text: 'BEST SELLER', cls: 'best' },
  featured: { text: 'FEATURED', cls: 'best' },
  limited: { text: 'LIMITED STOCK', cls: 'limited' },
  out: { text: 'OUT OF STOCK', cls: 'out' },
};

// first matching label shown as the card badge
export const badgeFor = (p) => {
  if (p.stock <= 0) return PRODUCT_LABELS.out;
  const key = (p.labels || []).find((l) => ['sale', 'new', 'hot', 'best', 'limited'].includes(l));
  return key ? PRODUCT_LABELS[key] : null;
};
