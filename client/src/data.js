export const PROVINCES = [
  'Alabama', 'Alaska', 'Arizona', 'California', 'Colorado', 'Florida',
  'Georgia', 'Illinois', 'Michigan', 'New York', 'Ohio', 'Pennsylvania',
  'Texas', 'Washington', 'Ontario', 'Quebec', 'British Columbia',
  'England', 'Scotland', 'Wales', 'Other',
];

export const STATUS_STEPS = [
  'pending',
  'confirmed',
  'processing',
  'packed',
  'out_from_warehouse',
  'delivery_warehouse',
  'out_for_delivery',
  'delivered',
];

export const STATUS_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  processing: 'Processing',
  packed: 'Packed',
  out_from_warehouse: 'Out from Warehouse',
  delivery_warehouse: 'Delivery Warehouse',
  shipped: 'Shipped',
  out_for_delivery: 'Out for Delivery',
  delivery_failed: 'No Response from Customer',
  returned_to_warehouse: 'Returned to Warehouse',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

export const ALL_STATUSES = [...STATUS_STEPS, 'delivery_failed', 'returned_to_warehouse', 'shipped', 'cancelled', 'refunded'];

// delivery could not be completed: shown with a note, the order waits for the next attempt
export const DELIVERY_ISSUE = {
  delivery_failed: 'The courier could not reach the customer. Another delivery attempt will be made.',
  returned_to_warehouse: 'The parcel is back at the warehouse after a failed delivery and will be sent out again.',
};

// Status changes that move money at once: asked before they are sent
export const STATUS_WARNINGS = {
  delivered: 'Mark this order as DELIVERED?\n\nThe seller is paid out at once (locked amount + 20% profit). This cannot be undone.',
  cancelled: 'CANCEL this order?\n\nThe items go back in stock and the locked amount returns to the seller.',
  refunded: 'Mark this order as REFUNDED?\n\nThe items go back in stock and any locked amount returns to the seller.',
};

export const PAYMENT_LABELS = {
  cod: 'Cash on Delivery',
  credit_card: 'Credit Card',
  debit_card: 'Debit Card',
  stripe: 'Stripe',
  paypal: 'PayPal',
  upi: 'UPI / Online Transfer',
  easypaisa: 'EasyPaisa',
  jazzcash: 'JazzCash',
  usdt: 'USDT',
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
