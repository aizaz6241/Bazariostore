/**
 * SEND EMAIL (Support inbox → ✉️ Email) — ready-made emails the team can send to one store.
 *
 * Every template can be edited before sending. Inside the texts:
 *   {storeName} {ownerName} {balance} {pendingOrders} {pendingAmount} {shortBy} {tier} {health} {frozenAmount}
 *     → filled in automatically with this store's real values
 *   [something in square brackets]
 *     → must be typed by the admin; the email cannot be sent while one is left
 *
 * Text format (kept simple on purpose): an empty line starts a new paragraph, a line starting with
 * "- " becomes a bullet, **double stars** make text bold. Everything else is plain text.
 * Seller-safe only: no admin names, no internal words (helping amount, members, partners…).
 */
import { fillPlaceholders, PLACEHOLDERS } from './chatPlaceholders.js';

export const MAIL_PLACEHOLDERS = { ...PLACEHOLDERS, health: 'Account health (0–100)' };

/** Fills {storeName}… (and {health}) with this store's values. Unknown names stay as typed. */
export function fillMail(text, facts) {
  if (!text || !facts) return text || '';
  const out = fillPlaceholders(String(text), facts);
  return String(out).replace(/\{health\}/g, `${Math.round(Number(facts.health ?? 100))}/100`);
}

/** Values used for the preview before a store is chosen. */
export const SAMPLE_FACTS = {
  storeName: 'Sample Store',
  ownerName: 'Seller Name',
  balance: 120.5,
  frozenAmount: 0,
  pendingOrders: 3,
  pendingAmount: 245,
  shortBy: 124.5,
  tier: 'Basic',
  health: 86,
};

/** Seller Central pages an email button can open. */
export const MAIL_BUTTONS = {
  dashboard: { label: 'OPEN SELLER CENTRAL', path: '/seller' },
  orders: { label: 'CONFIRM MY ORDERS', path: '/seller/orders' },
  wallet: { label: 'OPEN MY WALLET', path: '/seller/wallet' },
  health: { label: 'SEE MY ACCOUNT HEALTH', path: '/seller/health' },
  support: { label: 'OPEN SUPPORT CHAT', path: '/seller/support' },
  settings: { label: 'COMPLETE MY STORE DETAILS', path: '/seller/settings' },
  products: { label: 'OPEN MY STORE PRODUCTS', path: '/seller/products' },
  treasury: { label: 'ADD PRODUCTS', path: '/seller/treasury' },
  diamond: { label: 'SEE THE DIAMOND PLAN', path: '/seller/diamond' },
  closeStore: { label: 'OPEN CLOSE STORE', path: '/seller/close-store' },
  login: { label: 'LOG IN TO SELLER CENTRAL', path: '/seller/login' },
};

export const MAIL_TONES = ['info', 'success', 'warning', 'danger', 'diamond'];

export const MAIL_CATEGORIES = [
  { key: 'health', label: 'Account health' },
  { key: 'orders', label: 'Orders' },
  { key: 'wallet', label: 'Deposit & wallet' },
  { key: 'withdraw', label: 'Withdrawals' },
  { key: 'status', label: 'Account status' },
  { key: 'setup', label: 'Store setup' },
  { key: 'diamond', label: 'Diamond' },
  { key: 'general', label: 'General' },
];

const T = (key, category, label, f) => ({ key, category, label, builtIn: true, ...f });

export const MAIL_TEMPLATES = [
  /* ── Account health ── */
  T('health_low', 'health', 'Health is low — how to recover', {
    tone: 'warning',
    badge: 'Account health',
    subject: 'Your account health needs attention',
    heading: 'Your account health is {health}',
    body: `Our monitoring system shows that the account health of **{storeName}** is now **{health}**.

Low health can limit your store and can lead to an automatic freeze. The good news: it recovers quickly when you keep things on time.

- Confirm every new order before its deadline
- Keep enough balance in your wallet for waiting orders
- Reply to Support when we contact you`,
    note: 'Penalty points expire on their own after a few weeks of clean activity.',
    buttonKey: 'health',
  }),
  T('health_good', 'health', 'Great health — keep it up', {
    tone: 'success',
    badge: 'Account health',
    subject: 'Great work — your store is in excellent shape',
    heading: 'Thank you for running {storeName} so well',
    body: `Your account health is **{health}** and your orders are being handled on time. This is exactly what our best stores do.

Keep confirming orders on time to stay eligible for bonuses and special offers.`,
    note: '',
    buttonKey: 'dashboard',
  }),

  /* ── Orders ── */
  T('orders_waiting', 'orders', 'Orders waiting for confirmation', {
    tone: 'warning',
    badge: 'Orders',
    subject: 'You have {pendingOrders} orders waiting for confirmation',
    heading: '{pendingOrders} orders are waiting for you',
    body: `**{storeName}** has **{pendingOrders}** orders waiting to be confirmed, worth **{pendingAmount}**.

Your available balance is **{balance}**. Please confirm these orders before their deadline so your customers are not delayed and your account health stays safe.`,
    note: 'Orders that pass their deadline lower your account health and can freeze your store.',
    buttonKey: 'orders',
  }),
  T('orders_late', 'orders', 'Late orders — final reminder', {
    tone: 'danger',
    badge: 'Orders',
    subject: 'Action needed today: your orders are late',
    heading: 'Your orders are close to their deadline',
    body: `Some orders of **{storeName}** have not been confirmed yet and are close to (or past) their deadline.

Please log in now and confirm them. If they are not confirmed in time, the monitoring system will lower your account health and may freeze your store automatically.`,
    note: 'Need help with funds or an order? Write to us in Support chat — we reply quickly.',
    buttonKey: 'orders',
  }),
  T('orders_processing', 'orders', 'Order processing rules (reminder)', {
    tone: 'info',
    badge: 'Orders',
    subject: 'A quick reminder about order processing',
    heading: 'How to keep your orders moving',
    body: `To keep **{storeName}** healthy and your customers happy, please remember:

- Confirm every new order before its deadline (shown on each order)
- Keep enough balance in your wallet to confirm waiting orders
- Orders are delivered automatically after confirmation — you can follow each one in My Orders`,
    note: '',
    buttonKey: 'orders',
  }),

  /* ── Deposit & wallet ── */
  T('deposit_needed', 'wallet', 'Deposit needed to confirm orders', {
    tone: 'warning',
    badge: 'Wallet',
    subject: 'Deposit {shortBy} to confirm your waiting orders',
    heading: 'Your wallet is short by {shortBy}',
    body: `You have **{pendingOrders}** orders waiting (worth **{pendingAmount}**) and your available balance is **{balance}**.

Please deposit **{shortBy}** so all waiting orders can be confirmed on time.`,
    note: 'Deposits are usually approved within about 15 minutes.',
    buttonKey: 'wallet',
  }),
  T('deposit_checking', 'wallet', 'Deposit received — being verified', {
    tone: 'info',
    badge: 'Wallet',
    subject: 'We received your deposit request',
    heading: 'Your deposit is being verified',
    body: `Thank you! We have received your deposit request for **{storeName}** and our team is verifying it now.

You will get a confirmation email with your receipt as soon as it is approved.`,
    note: '',
    buttonKey: 'wallet',
  }),
  T('deposit_proof', 'wallet', 'Deposit could not be verified — send proof', {
    tone: 'danger',
    badge: 'Wallet',
    subject: 'We could not verify your deposit',
    heading: 'Please send your payment proof',
    body: `We could not verify your recent deposit for **{storeName}**.

Reason: [write the reason here]

Please send a clear screenshot of the payment (with the UTR / transaction ID visible) in Support chat so we can approve it quickly.`,
    note: '',
    buttonKey: 'support',
  }),

  /* ── Withdrawals ── */
  T('withdraw_processing', 'withdraw', 'Withdrawal is being processed', {
    tone: 'info',
    badge: 'Withdrawal',
    subject: 'Your withdrawal is being processed',
    heading: 'Your withdrawal is on its way',
    body: `Your withdrawal request for **{storeName}** is being processed by our finance team.

You will receive a confirmation email with the receipt once it is paid.`,
    note: 'Please make sure your payout details in Store Settings are correct.',
    buttonKey: 'wallet',
  }),
  T('withdraw_hold', 'withdraw', 'Withdrawal on hold — orders pending', {
    tone: 'warning',
    badge: 'Withdrawal',
    subject: 'Your withdrawal is on hold',
    heading: 'Your withdrawal is on hold for now',
    body: `Your withdrawal for **{storeName}** cannot be completed yet because the store still has orders in progress.

Once your pending orders are confirmed and completed, you can withdraw again.`,
    note: '',
    buttonKey: 'orders',
  }),

  /* ── Account status ── */
  T('status_frozen', 'status', 'Store frozen — how to unfreeze', {
    tone: 'danger',
    badge: 'Account status',
    subject: 'Your store is frozen — here is how to fix it',
    heading: '{storeName} is frozen',
    body: `Your store has been frozen by the monitoring system.

While frozen you can still log in, see your orders and wallet, deposit, and confirm waiting orders — but withdrawals and store changes are closed.

To unfreeze your store:
- Confirm all waiting orders
- Contact Support chat so we can review your store`,
    note: '',
    buttonKey: 'support',
  }),
  T('status_suspended', 'status', 'Store suspended', {
    tone: 'danger',
    badge: 'Account status',
    subject: 'Your store has been suspended',
    heading: '{storeName} is suspended',
    body: `Your store has been suspended.

Reason: [write the reason here]

Only Support chat is open while your store is suspended. Please contact us there to discuss your account.`,
    note: '',
    buttonKey: 'support',
  }),
  T('status_active', 'status', 'Store is active again', {
    tone: 'success',
    badge: 'Account status',
    subject: 'Good news — your store is active again',
    heading: '{storeName} is active again',
    body: `Your store is fully active again. All features are open.

Keep confirming orders on time to keep your account health high.`,
    note: '',
    buttonKey: 'dashboard',
  }),
  T('status_warning', 'status', 'Official warning', {
    tone: 'warning',
    badge: 'Official warning',
    subject: 'Official warning for your store',
    heading: 'Official warning',
    body: `This is an official warning for **{storeName}**.

[describe what happened and what the seller must do]

If this happens again, your store may be frozen or suspended.`,
    note: '',
    buttonKey: 'support',
  }),

  /* ── Store setup ── */
  T('setup_documents', 'setup', 'Complete store details / documents', {
    tone: 'info',
    badge: 'Store setup',
    subject: 'Please complete your store details',
    heading: 'One more step for {storeName}',
    body: `Your store is almost complete. Please log in to Seller Central and complete your store details, including your ID / PAN card documents.

This helps us keep your account safe and your payouts smooth.`,
    note: '',
    buttonKey: 'settings',
  }),
  T('setup_more_info', 'setup', 'Application needs more information', {
    tone: 'warning',
    badge: 'Application',
    subject: 'We need a little more information',
    heading: 'Your application needs more information',
    body: `Thank you for applying to sell on Bazario with **{storeName}**.

To finish reviewing your application, we need:
- [write what is needed]

Please reply in Support chat or update your details in Seller Central.`,
    note: '',
    buttonKey: 'login',
  }),
  T('setup_welcome', 'setup', 'Welcome — getting started', {
    tone: 'success',
    badge: 'Welcome',
    subject: 'Welcome to Bazario — let us get you started',
    heading: 'Welcome to Bazario, {ownerName}!',
    body: `We are happy to have **{storeName}** with us. Here is how to start selling:

- Add products to your store from Product Treasury
- Deposit funds so you can confirm orders quickly
- Confirm every order before its deadline
- Use Support chat anytime you need help`,
    note: 'Tip: open the guided tour in Seller Central to see everything in 2 minutes.',
    buttonKey: 'treasury',
  }),

  /* ── Diamond ── */
  T('diamond_invite', 'diamond', 'Diamond plan invitation', {
    tone: 'diamond',
    badge: 'Diamond',
    subject: 'Earn more with the Diamond plan',
    heading: 'Ready to grow {storeName}?',
    body: `Stores on the **Diamond** plan earn more on every order:

- **35% profit** per order (Basic: 20%)
- Fast 3–5 day delivery
- 72 hours to confirm each order
- Remove products from your store any time`,
    note: 'Your current plan: {tier}.',
    buttonKey: 'diamond',
  }),

  /* ── General ── */
  T('general_contact', 'general', 'We tried to reach you', {
    tone: 'info',
    badge: 'Support',
    subject: 'We have a message for you in Support chat',
    heading: 'Please check your Support chat',
    body: `Our support team has sent you a message about **{storeName}**.

Please log in to Seller Central and open Support chat to read it and reply.`,
    note: '',
    buttonKey: 'support',
  }),
  T('general_announcement', 'general', 'Announcement / policy update', {
    tone: 'info',
    badge: 'Announcement',
    subject: '[announcement title]',
    heading: '[announcement title]',
    body: `[write the announcement here]`,
    note: '',
    buttonKey: 'dashboard',
  }),
];

/** Square-bracket fields the admin still has to fill in, e.g. "[write the reason here]". */
export const unfilledFields = (...texts) => {
  const found = new Set();
  for (const t of texts) for (const m of String(t || '').matchAll(/\[([^\[\]\n]{2,80})\]/g)) found.add(m[0]);
  return [...found];
};
