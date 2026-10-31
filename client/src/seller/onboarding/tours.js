/**
 * The guided tours of Seller Central (English).
 * A step points at an element with a CSS selector (`target`, comma separated = first visible one).
 * `path` opens that page first. No target (or not found) = the box shows in the middle.
 * `fallback` is used when the target is hidden (e.g. the side menu on a phone), with `mobileBody`.
 */
export const TOURS = [
  {
    id: 'welcome',
    title: 'Welcome tour',
    summary: 'Find your way around the panel',
    icon: 'grid',
    steps: [
      { path: '/seller', title: 'Welcome to Bazario Seller Central 👋', body: 'This quick tour shows you around. It takes about a minute — you can skip it any time.' },
      { target: '[data-tour="nav"]', fallback: '[data-tour="menu-btn"]', title: 'Your menu', body: 'Every page lives here: products, orders, wallet, support and settings.', mobileBody: 'Tap ☰ to open the menu with all your pages: products, orders, wallet, support and settings.' },
      { target: '[data-tour="topbar-wallet"]', title: 'Your balance', body: 'The money you can use to confirm orders. Tap it to deposit or withdraw.' },
      { target: '[data-tour="topbar-health"]', title: 'Account health', body: 'Confirm your orders on time to keep this score high. A low score can lead to warnings or a freeze.' },
      { target: '.sd-head-actions', title: 'Quick actions', body: 'Add a product, make a deposit or message support in one tap.' },
      { target: '[data-tour="help-btn"]', title: 'Need help again?', body: 'Open Help any time to replay a tour or see your getting-started list.' },
    ],
  },
  {
    id: 'products',
    title: 'Adding products',
    summary: 'Treasury, your store and what you earn',
    icon: 'tag',
    steps: [
      { path: '/seller/treasury', target: '.tr-head', title: 'Product Treasury', body: 'Ready-made products from the Bazario warehouse. You do not buy stock — just add the products you like to your store.' },
      { path: '/seller/treasury', target: '.tr-search', title: 'Find products', body: 'Search by name or filter by category to find what fits your store.' },
      { path: '/seller/treasury', target: '.tr-card .tr-btn-primary', title: 'Add to your store', body: 'One tap puts the product in your store. Bazario keeps the stock and ships the orders for you.' },
      { path: '/seller/products', target: '.pp-stats', title: 'Your store products', body: 'See what is live, what needs stock and how much you earn on each sale — 20% of the order (35% on Diamond).' },
      { path: '/seller/products', target: '.pp-head-actions', title: 'Your own products', body: 'You can also list a product of your own with photos and a price.' },
    ],
  },
  {
    id: 'orders',
    title: 'Handling orders',
    summary: 'Confirm, deadlines and getting paid',
    icon: 'package',
    steps: [
      { path: '/seller/orders', target: '.so-stats', title: 'Your orders at a glance', body: 'New orders waiting for you are shown first, so you never miss one.' },
      { path: '/seller/orders', target: '.so-tabs', title: 'Order stages', body: 'Every order moves through: To confirm → Confirmed → Processing → In transit → Delivered.' },
      { path: '/seller/orders', target: '.so-card', title: 'Confirm each new order', body: 'Press Confirm on a new order. Its amount is held from your wallet and Bazario packs and ships it to the customer. Keep enough balance for new orders.' },
      { path: '/seller/orders', title: 'Confirm in time ⏱', body: 'You have 48 hours to confirm an order (72 hours on Diamond). You get a reminder at 24 hours. Orders left too long can freeze your store.' },
      { path: '/seller/orders', title: 'Get paid on delivery 💰', body: 'When the order is delivered, the held amount comes back to your wallet — plus your profit.' },
    ],
  },
  {
    id: 'wallet',
    title: 'Wallet: deposit & withdraw',
    summary: 'Add money and take out earnings',
    icon: 'wallet',
    steps: [
      { path: '/seller/wallet', target: '.wl-balance', title: 'Your wallet', body: 'Available balance is what you can use right now. Money held for orders in progress is shown separately.' },
      { path: '/seller/wallet', target: '.wl-head-actions .wl-btn-ghost', title: 'Deposit', body: 'Send money using the payment details shown, then upload the payment screenshot. Once the team approves it, it appears in your balance.' },
      { path: '/seller/wallet', target: '.wl-head-actions .wl-btn-dark', title: 'Withdraw', body: 'Take out your earnings to a saved payout method — bank, UPI or USDT. Add a payout method in Store settings first.' },
      { path: '/seller/wallet', title: 'Keep a balance', body: 'Without balance you cannot confirm orders. Top up before new orders arrive so they are never late.' },
    ],
  },
  {
    id: 'support',
    title: 'Support & settings',
    summary: 'Getting help, payout methods, password',
    icon: 'chat',
    steps: [
      { path: '/seller/support', target: '.sp-composer', title: 'Talk to Bazario Support', body: 'Ask anything about orders, deposits or your account. You can send screenshots and PDF files too.' },
      { path: '/seller/support', target: '.sp-side .sp-topics', title: 'Quick topics', body: 'Tap a topic to start your message in one tap.' },
      { path: '/seller/settings', target: '.st-nav', title: 'Store settings', body: 'Your store profile, payout methods, business address and password are all here.' },
      { path: '/seller/settings', target: '.st-nav button:nth-child(2)', title: 'Payout methods', body: 'Add where your withdrawals are sent. Changing them later asks for your password, to keep your money safe.' },
      { title: 'You are all set 🎉', body: 'You can replay any tour from the Help button at the top of the page.' },
    ],
  },
];

export const tourById = (id) => TOURS.find((t) => t.id === id);
