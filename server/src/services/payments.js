import { getSetting } from '../models/System.js';

// ------------------------------------------------------------------
// Payment gateway structure. Each provider exposes `initiate(order, cfg, extra)`.
// Live integration later = fill credentials in Admin > Settings and complete
// the marked TODO blocks — no other code changes needed.
// ------------------------------------------------------------------

export const PAYMENT_METHODS = [
  { key: 'cod', name: 'Cash on Delivery', sub: 'Pay securely when your package arrives', icon: 'banknote' },
  { key: 'credit_card', name: 'Credit Card', sub: 'Visa, Mastercard, AMEX, Discover', icon: 'card' },
  { key: 'debit_card', name: 'Debit Card', sub: 'All international bank debit cards', icon: 'card' },
  { key: 'paypal', name: 'PayPal & Apple Pay', sub: 'Fast & encrypted 1-click checkout', icon: 'wallet' },
  { key: 'stripe', name: 'Stripe Global Payments', sub: 'Instant & PCI-DSS certified gateway', icon: 'card' },
];

const DEFAULT_CONFIG = {
  cod: { enabled: true },
  credit_card: { enabled: true, gateway: '', merchantId: '', apiKey: '', apiSecret: '' },
  debit_card: { enabled: true, gateway: '', merchantId: '', apiKey: '', apiSecret: '' },
  paypal: { enabled: false, clientId: '', clientSecret: '' },
  stripe: { enabled: false, publishableKey: '', secretKey: '' },
};

export async function getPaymentConfig() {
  const saved = (await getSetting('payments', {})) || {};
  const cfg = {};
  for (const m of PAYMENT_METHODS) cfg[m.key] = { ...DEFAULT_CONFIG[m.key], ...(saved[m.key] || {}) };
  return cfg;
}

function hasCreds(cfg) {
  return Object.entries(cfg || {}).some(([k, v]) => k !== 'enabled' && typeof v === 'string' && v.trim());
}

/**
 * Can a customer really pay with this method right now?
 * It must be switched on, the server must know how to start it, and (except cash on delivery) a
 * gateway must be configured. A card option that is only "switched on" with no gateway behind it
 * is not offered: it used to create orders that waited for a payment nobody could make.
 */
export function paymentMethodUsable(key, cfg) {
  const c = cfg?.[key];
  if (!c?.enabled) return false;
  if (!Object.prototype.hasOwnProperty.call(providers, key)) return false;
  return key === 'cod' || hasCreds(c);
}

export async function publicPaymentMethods() {
  const cfg = await getPaymentConfig();
  return PAYMENT_METHODS.map((m) => ({ ...m, enabled: paymentMethodUsable(m.key, cfg) }));
}

const providers = {
  cod: async () => ({
    status: 'cod',
    reference: '',
    message: 'Order milne par cash pay karein — no advance payment needed.',
  }),

  easypaisa: async (order, cfg, extra) => {
    if (hasCreds(cfg)) {
      // TODO (live integration): call Easypaisa Open API here with cfg.merchantId /
      // cfg.storeId / cfg.apiKey, create a transaction for order.total and return
      // { status: 'initiated', reference: <gateway txn id>, redirectUrl }.
    }
    return {
      status: 'awaiting_payment',
      reference: 'EP-' + order.orderNumber,
      walletNumber: extra?.walletNumber || '',
      message: 'Easypaisa payment request register ho gayi hai. Payment confirm hotay hi order process hoga.',
    };
  },

  jazzcash: async (order, cfg, extra) => {
    if (hasCreds(cfg)) {
      // TODO (live integration): build JazzCash v2 payment request using cfg.merchantId,
      // cfg.password and cfg.integritySalt (HMAC-SHA256 secure hash) and return redirectUrl.
    }
    return {
      status: 'awaiting_payment',
      reference: 'JC-' + order.orderNumber,
      walletNumber: extra?.walletNumber || '',
      message: 'JazzCash payment request register ho gayi hai. Payment confirm hotay hi order process hoga.',
    };
  },

  credit_card: async (order, cfg) => {
    if (hasCreds(cfg)) {
      // TODO (live integration): create a hosted-checkout / tokenized session with the
      // configured card gateway (cfg.gateway e.g. PayFast/Stripe) and return redirectUrl.
      // Raw card numbers must never touch this server — always use the gateway's hosted page.
    }
    return {
      status: 'awaiting_payment',
      reference: 'CC-' + order.orderNumber,
      message: 'Card payment gateway configure hotay hi aap ko secure payment link bheja jayega.',
    };
  },

  debit_card: async (order, cfg) => {
    if (hasCreds(cfg)) {
      // TODO (live integration): same hosted-checkout flow as credit_card.
    }
    return {
      status: 'awaiting_payment',
      reference: 'DC-' + order.orderNumber,
      message: 'Card payment gateway configure hotay hi aap ko secure payment link bheja jayega.',
    };
  },
};

export async function initiatePayment(methodKey, order, extra = {}) {
  const cfg = await getPaymentConfig();
  const provider = providers[methodKey];
  if (!provider || !paymentMethodUsable(methodKey, cfg)) throw new Error('Selected payment method is not available');
  const result = await provider(order, cfg[methodKey], extra);
  return { provider: methodKey, ...result };
}
