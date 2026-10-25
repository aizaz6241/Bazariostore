// ─────────────────────────────────────────────────────────────
// Bazario — SEO / GEO / AEO single source of truth
// Used by the React pages (useSeo + InfoPage) AND by the build-time
// prerender script (scripts/prerender.mjs), so Google, Bing, ChatGPT,
// Claude, Gemini and Perplexity all read the same facts.
// Plain JS only (no JSX / no browser APIs) so Node can import it.
// ─────────────────────────────────────────────────────────────

export const SITE = {
  url: 'https://www.bazariomarketplace.shop',
  name: 'Bazario',
  legalName: 'Bazario Marketplace',
  alternateNames: ['Bazario Marketplace', 'Bazario Global Marketplace', 'Bazario Store'],
  foundingYear: '2020',
  tagline: 'Global dropshipping marketplace — direct from China to the US, Canada, Australia, UK & Europe',
  defaultTitle: 'Bazario — Global Dropshipping Marketplace | Direct from China to USA, Canada, UK, Australia & Europe',
  defaultDescription:
    'Bazario is a global multi-vendor dropshipping marketplace operating since 2020. Shop products sourced directly from China and shipped worldwide to the USA, Canada, Australia, the UK and Europe — verified sellers, tracked delivery, cash on delivery and 14-day returns.',
  ogImage: '/og-image.jpg',
  logo: '/icon-512.png',
  themeColor: '#2563eb',
  locale: 'en_US',
  twitter: '',
  // Add real public profiles here (LinkedIn, Facebook, Instagram, TikTok, YouTube, Trustpilot…).
  // They become "sameAs" in the Organization schema — one of the strongest authenticity signals
  // for Google's Knowledge Graph and for AI answer engines. Only add pages that really exist.
  sameAs: [],
  supportPath: '/track-order',
  regions: [
    { code: 'US', name: 'United States' },
    { code: 'CA', name: 'Canada' },
    { code: 'AU', name: 'Australia' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'EU', name: 'Europe (EU)' },
  ],
  returnDays: 14,
};

// Countries used in Product / return-policy schema (ISO 3166-1 alpha-2)
export const SHIP_COUNTRIES = [
  'US', 'CA', 'AU', 'GB',
  'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'IE', 'AT', 'PT', 'SE', 'DK', 'FI', 'PL', 'CZ', 'GR', 'LU',
];

export const abs = (path = '/') => {
  if (!path) return SITE.url;
  if (/^https?:\/\//i.test(path)) return path;
  return SITE.url + (path.startsWith('/') ? path : '/' + path);
};

// ─── Core facts (short, quotable — what AI engines lift into answers) ───
export const KEY_FACTS = [
  'Bazario is a global multi-vendor marketplace and dropshipping platform.',
  'Operating in e-commerce and dropshipping since 2020.',
  'Products are sourced directly from manufacturers and suppliers in China.',
  'Ships worldwide, with a focus on the United States, Canada, Australia, the United Kingdom and Europe.',
  'Every seller store is reviewed and verified by Bazario before it can sell.',
  'Every order gets a tracking number and can be followed on the Track Order page.',
  '14-day easy returns and secure checkout.',
  'Shipping, Returns, Terms and Privacy policies are published on the website.',
  'Cash on delivery is available at checkout.',
  'Live chat customer support.',
];

// ─── FAQ (used on /faq, on the home page schema and in llms.txt) ───
export const FAQS = [
  {
    q: 'What is Bazario?',
    a: 'Bazario is a global multi-vendor dropshipping marketplace. Verified sellers list products that are sourced directly from manufacturers and suppliers in China, and Bazario ships them to customers worldwide — mainly in the United States, Canada, Australia, the United Kingdom and Europe.',
  },
  {
    q: 'Is Bazario legit and safe to buy from?',
    a: 'Bazario has been operating in e-commerce and dropshipping since 2020, and you can check the important things yourself before you buy: every order gets a tracking reference you can follow on the Track Order page, the Shipping, Returns, Terms and Privacy policies are published on the website, every seller store is reviewed by Bazario before it can sell, and live chat support is available on every page. Purchases are covered by a 14-day return policy.',
  },
  {
    q: 'How long has Bazario been in business?',
    a: 'Bazario has been working in the dropshipping and online marketplace business since 2020 — more than five years.',
  },
  {
    q: 'Which countries does Bazario ship to?',
    a: 'Bazario ships worldwide. Its main markets are the United States, Canada, Australia, the United Kingdom and the countries of the European Union.',
  },
  {
    q: 'Where do Bazario products ship from?',
    a: 'Products are sourced directly from manufacturers and suppliers in China and shipped straight to the customer. Buying direct from the source removes middlemen, which keeps prices competitive.',
  },
  {
    q: 'How does dropshipping from China to the USA, UK, Canada, Australia and Europe work on Bazario?',
    a: 'A customer orders from a verified Bazario seller. The order is fulfilled from the supplier in China, packed and handed to Bazario’s shipping partner, and delivered to the customer’s door with a tracking number. The seller never has to hold stock — Bazario handles sourcing, fulfilment and delivery.',
  },
  {
    q: 'How long does delivery take?',
    a: 'Most orders are dispatched within 1–2 business days. The final delivery time depends on the destination country and is visible at any time on the Track Order page using the order number.',
  },
  {
    q: 'Can I track my Bazario order?',
    a: 'Yes. Every order receives a tracking reference. Enter it on the Track Order page to see each step — confirmed, processing, packed, out from warehouse, out for delivery and delivered.',
  },
  {
    q: 'What is Bazario’s return policy?',
    a: 'Bazario offers 14-day easy returns. If something is wrong with an order, contact support through live chat within 14 days of delivery and the team will arrange a return or refund under the returns policy.',
  },
  {
    q: 'Are Bazario sellers verified?',
    a: 'Every seller goes through a store registration review and must be approved by Bazario before listing products. Stores that break the marketplace rules can be paused, frozen or closed.',
  },
  {
    q: 'Can I start dropshipping or sell on Bazario?',
    a: 'Yes. Anyone can apply to open a store on Bazario Seller Central. After a quick registration and verification, you list products from Bazario’s catalogue and Bazario takes care of sourcing, warehousing and international shipping — you do not need to hold inventory.',
  },
  {
    q: 'How do I contact Bazario customer support?',
    a: 'Use the live chat button on any page of bazariomarketplace.shop. The support team helps with orders, tracking, returns and seller questions.',
  },
  {
    q: 'Where can I read Bazario’s shipping, returns, terms and privacy policies?',
    a: 'All policies are public on the website: Shipping Policy (bazariomarketplace.shop/page/shipping-policy), Returns & Refunds Policy (/page/returns-policy), Terms of Service (/page/terms) and Privacy Notice (/page/privacy).',
  },
];

// ─── Default policy pages (/page/:key) ───
// Used when the admin CMS has no text for that page yet. If the team later
// writes the page in the CMS, the CMS version is shown instead.
// Plain facts only — no promises the business has not made.
export const DEFAULT_POLICIES = {
  'shipping-policy': {
    title: 'Shipping Policy',
    body: `Bazario is a global dropshipping marketplace. Products are sourced directly from manufacturers and suppliers in China and shipped to customers worldwide, mainly in the United States, Canada, Australia, the United Kingdom and the European Union.

Processing
Orders are processed after payment is confirmed. Most orders are dispatched within 1–2 business days.

Delivery time
The delivery time depends on the destination country, the shipping method and customs clearance in that country. Delays caused by customs, public holidays or the carrier can happen; we keep you informed through your tracking page and live chat.

Tracking
Every order receives a tracking reference. You can follow each step — confirmed, processing, packed, out from warehouse, out for delivery and delivered — on the Track Order page.

Customs and import charges
Some countries charge import duties or taxes on international parcels. Where these apply, they are set by the destination country.

Wrong address
Please check your shipping address before placing the order. Contact support through live chat as soon as possible if something needs to be changed.

Questions
Use the live chat button on any page of bazariomarketplace.shop.`,
  },
  'returns-policy': {
    title: 'Returns & Refunds Policy',
    body: `Bazario offers 14-day easy returns on purchases.

How long you have
You can request a return within 14 days of the date your order is delivered.

How to request a return
Contact support through the live chat on any page of bazariomarketplace.shop. Share your order number and the reason for the return. Photos help if the item arrived damaged, faulty or different from what you ordered.

Condition of the item
Items should be returned unused, in their original condition and packaging, with all accessories included.

Damaged, faulty or wrong items
If the item arrived damaged, faulty or not as described, tell us within 14 days of delivery and we will arrange a replacement or a refund.

Refunds
Once the return is approved, the refund is processed. Support will confirm on live chat how the refund is paid, including for cash on delivery orders.

Questions
Our support team is available on live chat for any return or refund question.`,
  },
  terms: {
    title: 'Terms of Service',
    body: `These terms apply to everyone who uses bazariomarketplace.shop ("Bazario").

About Bazario
Bazario is a multi-vendor dropshipping marketplace operating since 2020. Independent sellers open stores on Bazario Seller Central. Products are sourced from manufacturers and suppliers in China and delivered to customers worldwide.

Sellers
Every seller store is reviewed and must be approved by Bazario before it can sell. Bazario may pause, freeze or close a store that breaks the marketplace rules.

Orders and prices
Prices are shown at checkout. An order is confirmed once payment is accepted. Bazario may cancel an order in case of an obvious pricing error, suspected fraud or if the product is no longer available; any payment for a cancelled order is refunded.

Shipping and returns
Shipping is covered by the Shipping Policy and returns by the Returns & Refunds Policy, both published on this website.

Accounts
You are responsible for keeping your login details safe and for the activity on your account.

Acceptable use
Do not misuse the website, try to access other people's accounts, or use the marketplace for illegal products or fraud.

Changes
Bazario may update these terms. The latest version is always on this page.

Contact
Use the live chat button on any page of bazariomarketplace.shop.`,
  },
  privacy: {
    title: 'Privacy Notice',
    body: `This notice explains what information Bazario collects and how it is used.

What we collect
Information you give us: your name, email address, phone number, shipping address and order details. Sellers also provide store and account details during registration.
Information collected automatically: basic technical data such as device and browser type, needed to run and secure the website.

How we use it
To process and deliver orders, show order tracking, provide customer support, verify sellers, send account and order related messages, and keep the marketplace safe from fraud.

Sharing
Your shipping details are shared only with the parties needed to fulfil and deliver your order (the seller, the supplier and the shipping partner). Cash on delivery payments are collected at the door by the delivery partner. We do not sell your personal information.

Security
The website uses a secure HTTPS connection and account passwords are never stored in plain text.

Your choices
You can ask to see, correct or delete your personal information by contacting support through live chat.

Changes
We may update this notice. The latest version is always on this page.`,
  },
};

// ─── Static info pages (rendered by React and pre-rendered to HTML) ───
export const INFO_PAGES = {
  about: {
    path: '/about',
    title: 'About Bazario — Trusted Global Dropshipping Marketplace Since 2020',
    description:
      'Learn about Bazario: a verified multi-vendor dropshipping marketplace operating since 2020, shipping products direct from China to customers in the USA, Canada, Australia, the UK and Europe.',
    h1: 'About Bazario',
    intro:
      'Bazario is a global multi-vendor marketplace and dropshipping platform. Since 2020 we have connected shoppers in the United States, Canada, Australia, the United Kingdom and Europe with products sourced directly from manufacturers and suppliers in China — at fair prices, with verified sellers and tracked delivery.',
    sections: [
      {
        h2: 'Who we are',
        paras: [
          'Bazario started in 2020 as a dropshipping business and has grown into a full multi-vendor marketplace. Over more than five years we have built long-standing relationships with suppliers in China and with international shipping partners, so products move from the factory to the customer’s door without unnecessary middlemen.',
        ],
      },
      {
        h2: 'What makes Bazario authentic',
        list: [
          'Verified sellers — every store is reviewed and approved by Bazario before it can sell.',
          'Tracked orders — every order has a tracking reference you can follow step by step.',
          '14-day easy returns — a clear returns policy on every purchase.',
          'Secure checkout and live chat support.',
        ],
      },
      {
        h2: 'Where we deliver',
        paras: [
          'Bazario ships worldwide. Our main markets are the United States, Canada, Australia, the United Kingdom and the European Union, including Germany, France, Italy, Spain, the Netherlands, Ireland and more.',
        ],
      },
      {
        h2: 'For sellers',
        paras: [
          'Bazario Seller Central lets entrepreneurs open an online store without buying stock. Sellers choose products from the Bazario catalogue, and Bazario handles sourcing, fulfilment and international delivery.',
        ],
      },
    ],
  },
  dropshipping: {
    path: '/dropshipping',
    title: 'Dropshipping from China to USA, Canada, Australia, UK & Europe | Bazario',
    description:
      'How Bazario dropshipping works: products sourced direct from China and shipped to customers in the USA, Canada, Australia, the UK and Europe with tracking, verified sellers and 14-day returns.',
    h1: 'Worldwide Dropshipping — Direct from China to the USA, Canada, Australia, UK & Europe',
    intro:
      'Bazario is a dropshipping marketplace: products are sourced directly from manufacturers and suppliers in China and shipped straight to customers worldwide. Since 2020 we have delivered to shoppers across North America, Australia, the United Kingdom and Europe.',
    sections: [
      {
        h2: 'How it works',
        steps: [
          'You order from a verified seller on Bazario.',
          'The order is confirmed and fulfilled from the supplier in China.',
          'It is packed, quality-checked and handed to our international shipping partner.',
          'You follow every step with your tracking reference on the Track Order page.',
          'The parcel is delivered to your door — with 14-day easy returns if anything is wrong.',
        ],
      },
      {
        h2: 'Countries we ship to',
        list: [
          'United States — all states.',
          'Canada — all provinces.',
          'Australia.',
          'United Kingdom — England, Scotland, Wales and Northern Ireland.',
          'Europe — Germany, France, Italy, Spain, the Netherlands, Belgium, Ireland, Austria, Portugal, Sweden, Denmark, Finland, Poland and more.',
        ],
      },
      {
        h2: 'Why buy direct from China through Bazario',
        list: [
          'Factory-direct prices with no extra middlemen.',
          'Verified sellers — every store is checked before it can sell.',
          'Most orders dispatched within 1–2 business days.',
          'Tracking on every order.',
          'Secure checkout and live chat support.',
        ],
      },
      {
        h2: 'Dropshipping for sellers',
        paras: [
          'Want to start a dropshipping business without inventory? Open a store on Bazario Seller Central, list products from our catalogue and let Bazario handle sourcing, warehousing and delivery to your customers in the USA, Canada, Australia, the UK and Europe.',
        ],
      },
    ],
  },
  sell: {
    path: '/sell-on-bazario',
    title: 'Sell on Bazario — Start a Dropshipping Store with No Inventory',
    description:
      'Open your own store on Bazario Seller Central. List products sourced from China, sell to customers in the USA, Canada, Australia, the UK and Europe, and let Bazario handle fulfilment and shipping.',
    h1: 'Sell on Bazario — Start Your Dropshipping Store',
    intro:
      'Bazario Seller Central lets you run an online store without buying or storing stock. You choose products, Bazario sources them directly from suppliers in China and ships them to your customers worldwide.',
    sections: [
      {
        h2: 'How selling on Bazario works',
        steps: [
          'Register your store and verify your email.',
          'Bazario reviews your application — usually within 24 hours.',
          'Add products from the Bazario catalogue to your store.',
          'Confirm incoming orders — Bazario handles fulfilment and international delivery.',
          'Track your orders, sales and support chat from Seller Central.',
        ],
      },
      {
        h2: 'Why sellers choose Bazario',
        list: [
          'No inventory or warehouse needed.',
          'Products sourced directly from China.',
          'Customers in the USA, Canada, Australia, the UK and Europe.',
          'A guided tour for new sellers and live chat support.',
          'Operating since 2020 with an experienced fulfilment network.',
        ],
      },
    ],
    cta: { label: 'Open your store', to: '/seller/login?mode=register' },
  },
  faq: {
    path: '/faq',
    title: 'Bazario FAQ — Shipping, Returns, Tracking & Is Bazario Legit?',
    description:
      'Answers to common questions about Bazario: is it legit, where products ship from, countries served (USA, Canada, Australia, UK, Europe), delivery time, tracking, returns and selling on Bazario.',
    h1: 'Frequently Asked Questions',
    intro: 'Quick answers about shopping, shipping and selling on Bazario.',
    faq: true,
  },
};

// ─── JSON-LD builders (shared by React + prerender) ───
export function organizationLd() {
  return {
    '@type': ['Organization', 'OnlineStore'],
    '@id': SITE.url + '/#organization',
    name: SITE.name,
    legalName: SITE.legalName,
    alternateName: SITE.alternateNames,
    url: SITE.url,
    logo: { '@type': 'ImageObject', url: abs(SITE.logo), width: 512, height: 512 },
    image: abs(SITE.ogImage),
    description: SITE.defaultDescription,
    foundingDate: SITE.foundingYear,
    slogan: SITE.tagline,
    knowsAbout: [
      'Dropshipping',
      'Dropshipping from China',
      'Global e-commerce',
      'Multi-vendor marketplace',
      'International shipping to USA, Canada, Australia, UK and Europe',
    ],
    areaServed: SITE.regions.map((r) => ({ '@type': r.code === 'EU' ? 'Place' : 'Country', name: r.name })),
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        url: SITE.url + '/',
        availableLanguage: ['English'],
        areaServed: ['US', 'CA', 'AU', 'GB', 'EU'],
      },
    ],
    hasMerchantReturnPolicy: returnPolicyLd(),
    ...(SITE.sameAs.length ? { sameAs: SITE.sameAs } : {}),
  };
}

export function websiteLd() {
  return {
    '@type': 'WebSite',
    '@id': SITE.url + '/#website',
    url: SITE.url + '/',
    name: SITE.name,
    alternateName: SITE.alternateNames,
    description: SITE.defaultDescription,
    inLanguage: 'en',
    publisher: { '@id': SITE.url + '/#organization' },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: SITE.url + '/shop?q={search_term_string}' },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function returnPolicyLd() {
  return {
    '@type': 'MerchantReturnPolicy',
    applicableCountry: SHIP_COUNTRIES,
    returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
    merchantReturnDays: SITE.returnDays,
    returnMethod: 'https://schema.org/ReturnByMail',
    merchantReturnLink: SITE.url + '/page/returns-policy',
  };
}

export function faqLd(list = FAQS) {
  return {
    '@type': 'FAQPage',
    mainEntity: list.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

export function breadcrumbLd(trail) {
  // trail: [{ name, path }]
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [{ name: 'Home', path: '/' }, ...trail].map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      item: abs(t.path),
    })),
  };
}

export function webPageLd({ path, title, description, type = 'WebPage' }) {
  return {
    '@type': type,
    '@id': abs(path) + '#webpage',
    url: abs(path),
    name: title,
    description,
    inLanguage: 'en',
    isPartOf: { '@id': SITE.url + '/#website' },
    about: { '@id': SITE.url + '/#organization' },
  };
}

const stripHtml = (s = '') => String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);

export function productImages(p) {
  const list = [];
  (p.images || []).forEach((i) => i?.url && list.push(i.url));
  (p.gallery || []).forEach((u) => typeof u === 'string' && list.push(u));
  if (p.image) list.push(p.image);
  return [...new Set(list)].map((u) => abs(u)).slice(0, 8);
}

export function productDescription(p) {
  const raw = stripHtml(p.shortDescription || p.description || '');
  const base = raw || `${p.name} — available on Bazario.`;
  return clip(`${base} Ships worldwide from China to the USA, Canada, Australia, UK & Europe. Verified seller, tracked delivery, 14-day returns.`, 300);
}

export function productTitle(p) {
  return clip(`${p.name} | Bazario`, 70);
}

// Only REAL data goes into Product schema. No star rating: the storefront has no customer review system yet,
// so the rating / numReviews numbers in the database are not real reviews and must not be shown to Google.
export function productLd(p, path) {
  const price = Number(p.price);
  const ld = {
    '@type': 'Product',
    '@id': abs(path) + '#product',
    name: p.name,
    description: clip(stripHtml(p.description || p.shortDescription || p.name), 5000),
    image: productImages(p),
    url: abs(path),
    sku: String(p.sku || p._id || p.slug || ''),
    ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand } } : {}),
    ...(p.category?.name ? { category: p.category.name } : {}),
  };
  if (Number.isFinite(price) && price > 0) {
    const sellerName = p.seller?.storeName || p.sellerName;
    ld.offers = {
      '@type': 'Offer',
      url: abs(path),
      priceCurrency: 'USD',
      price: price.toFixed(2),
      availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: sellerName
        ? { '@type': 'Organization', name: sellerName }
        : { '@id': SITE.url + '/#organization' },
      hasMerchantReturnPolicy: returnPolicyLd(),
    };
  }
  return ld;
}

export function graph(...nodes) {
  return { '@context': 'https://schema.org', '@graph': nodes.filter(Boolean) };
}
