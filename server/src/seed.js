import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import Product from './models/Product.js';
import Category from './models/Category.js';
import Admin from './models/Admin.js';
import Order from './models/Order.js';
import Refund from './models/Refund.js';
import Discount from './models/Discount.js';
import ShippingMethod from './models/ShippingMethod.js';
import Expense from './models/Expense.js';
import Notification from './models/Notification.js';
import AuditLog from './models/AuditLog.js';
import { StockHistory, IncomingStock } from './models/StockHistory.js';
import { Counter, setSetting } from './models/System.js';

const img = (n) => `/img/products/${n}.svg`;

const CATS = [
  { name: 'Skincare Products', slug: 'skincare', img: 'serum' },
  { name: 'Makeup Products', slug: 'makeup', img: 'lipstick' },
  { name: 'Body Products', slug: 'body', img: 'jar' },
  { name: 'Hair Products', slug: 'hair', img: 'oil' },
  { name: 'Fragrances (Perfumes)', slug: 'fragrance', img: 'perfume' },
  { name: 'Bath & Shower Products', slug: 'bath', img: 'cleanser' },
  { name: 'Nail Care Products', slug: 'nails', img: 'nails' },
  { name: "Men's Grooming", slug: 'men', img: 'exfoliant' },
  { name: 'Beauty Accessories', slug: 'brush', img: 'brush', realSlug: 'accessories' },
];

const defaults = {
  howToUse:
    'Apply a small amount to clean, dry skin. Massage gently until fully absorbed. Use morning and evening for best results. Always patch test before first use.',
  ingredients:
    'Aqua (Water), Glycerin, Butylene Glycol, Panthenol, Sodium Hyaluronate, Phenoxyethanol, Ethylhexylglycerin. Full ingredient list is printed on the product packaging.',
};

const HL = {
  hydrate: [
    { icon: 'drop', label: 'Deep Hydration' },
    { icon: 'sparkle', label: 'Plumps & Smooths' },
    { icon: 'feather', label: 'Lightweight Formula' },
    { icon: 'skin', label: 'All Skin Types' },
  ],
  glow: [
    { icon: 'sparkle', label: 'Healthy Glow' },
    { icon: 'drop', label: 'Nourishing' },
    { icon: 'feather', label: 'Fast Absorbing' },
    { icon: 'skin', label: 'Daily Use' },
  ],
  wear: [
    { icon: 'sparkle', label: 'High Pigment' },
    { icon: 'clock', label: 'Long Wear' },
    { icon: 'feather', label: 'Comfortable' },
    { icon: 'shield', label: '100% Original' },
  ],
};

// base product list — transform() fills costs/stock/sku/spec/seo automatically
const P = [
  {
    name: 'The Ordinary Hyaluronic Acid 2% + B5 Serum', slug: 'the-ordinary-hyaluronic-acid-2-b5-serum', brand: 'The Ordinary',
    cat: 'skincare', price: 2350, oldPrice: 2950, labels: ['featured', 'sale', 'best'], rating: 4.5, numReviews: 120, sold: 245, img: 'serum',
    gallery: ['serum', 'jar', 'essence', 'serum-dark'], stock: 60,
    short: 'A hydrating serum that provides deep hydration and helps to plump, smooth, and improve the overall texture of your skin.',
    desc: 'The Ordinary Hyaluronic Acid 2% + B5 is a hydrating serum that helps to hydrate the skin, smooth fine lines, and improve skin elasticity. With a combination of low, medium, and high molecular weight hyaluronic acid, it penetrates multiple layers of the skin for long-lasting hydration.',
    bullets: ['Provides intense hydration', 'Plumps and smooths the skin', 'Reduces the appearance of fine lines', 'Lightweight and fast-absorbing', 'Suitable for all skin types'],
    highlights: HL.hydrate, sizes: [{ label: '30ml', price: 2350 }, { label: '60ml', price: 3950 }], weight: '30ml',
  },
  {
    name: 'Maybelline Fit Me Matte + Poreless Foundation', slug: 'maybelline-fit-me-matte-poreless-foundation', brand: 'Maybelline',
    cat: 'makeup', price: 1850, labels: ['featured', 'hot'], rating: 4.5, numReviews: 98, sold: 180, img: 'foundation', stock: 85,
    short: 'Matte, poreless foundation for a natural, seamless finish that lasts all day.',
    desc: 'Maybelline Fit Me Matte + Poreless Foundation mattifies and refines pores for a natural, seamless finish. Its lightweight formula blends effortlessly and controls shine for up to 12 hours.',
    bullets: ['Matte, poreless finish', 'Controls shine for 12 hours', 'Blends effortlessly', 'Available for all skin tones'],
    highlights: HL.wear, weight: '30ml', variants: [{ name: 'Shade', options: ['110 Porcelain', '128 Warm Nude', '220 Natural Beige', '310 Sun Beige'] }],
  },
  {
    name: 'Huda Beauty Liquid Matte Lipstick', slug: 'huda-beauty-liquid-matte-lipstick', brand: 'Huda Beauty',
    cat: 'makeup', price: 1650, labels: ['featured', 'new'], rating: 4.5, numReviews: 75, sold: 132, img: 'lipstick', stock: 70,
    short: 'Ultra-comfortable liquid matte lipstick with intense colour payoff.',
    desc: 'Huda Beauty Liquid Matte delivers intense colour payoff with a lightweight, ultra-comfortable formula that doesn’t dry out your lips. One swipe gives a bold, velvety matte finish that lasts.',
    bullets: ['Intense one-swipe colour', 'Velvety matte finish', 'Transfer-proof formula', 'Comfortable all-day wear'],
    highlights: HL.wear, weight: '5ml', variants: [{ name: 'Color', options: ['Bombshell', 'Trendsetter', 'Venus', 'Icon'] }],
  },
  {
    name: "L'Oréal Paris Elvive Extraordinary Oil", slug: 'loreal-paris-elvive-extraordinary-oil', brand: "L'Oréal Paris",
    cat: 'hair', price: 1950, labels: ['featured', 'new'], rating: 4.5, numReviews: 65, sold: 110, img: 'oil', stock: 55,
    short: 'Nourishing hair oil for silky, shiny hair without weighing it down.',
    desc: "L'Oréal Paris Elvive Extraordinary Oil is enriched with 6 flower oils to nourish hair deeply, leaving it silky, shiny and soft without weighing it down. Perfect for dull, dry hair.",
    bullets: ['Enriched with 6 flower oils', 'Instant shine and softness', 'Non-greasy formula', 'For all hair types'],
    highlights: HL.glow, weight: '100ml',
  },
  {
    name: 'COSRX Advanced Snail 96 Mucin Essence', slug: 'cosrx-advanced-snail-96-mucin-essence', brand: 'COSRX',
    cat: 'skincare', price: 2450, labels: ['featured', 'hot'], rating: 4, numReviews: 110, sold: 205, img: 'essence', stock: 40,
    short: 'Lightweight essence with 96% snail mucin to repair and hydrate skin.',
    desc: 'COSRX Advanced Snail 96 Mucin Power Essence is formulated with 96% snail secretion filtrate to repair damaged skin, boost hydration, and improve skin elasticity for a healthy glow.',
    bullets: ['96% snail secretion filtrate', 'Repairs and soothes skin', 'Boosts hydration and glow', 'Fast-absorbing texture'],
    highlights: HL.glow, weight: '100ml',
  },
  {
    name: "Victoria's Secret Pure Seduction (250ml)", slug: 'victorias-secret-pure-seduction-250ml', brand: "Victoria's Secret",
    cat: 'fragrance', price: 1650, oldPrice: 2200, labels: ['featured', 'sale'], rating: 4, numReviews: 84, sold: 96, img: 'perfume', stock: 30,
    short: 'A juicy blend of red plum and freesia in a refreshing body mist.',
    desc: "Victoria's Secret Pure Seduction Fragrance Mist is a juicy blend of red plum and freesia that keeps you feeling fresh and irresistible all day long.",
    bullets: ['Juicy plum & freesia notes', 'Light, refreshing mist', 'Perfect for everyday wear', '250ml full size'],
    highlights: HL.glow, weight: '250ml',
  },
  {
    name: 'Swiss Beauty Eyeshadow Palette 10 Color', slug: 'swiss-beauty-eyeshadow-palette-10-color', brand: 'Swiss Beauty',
    cat: 'makeup', price: 1250, labels: ['featured', 'new'], rating: 4, numReviews: 71, sold: 88, img: 'palette', stock: 45,
    short: 'Highly pigmented 10-colour palette with matte and shimmer shades.',
    desc: 'Swiss Beauty 10 Color Eyeshadow Palette features a mix of highly pigmented matte and shimmer shades that blend smoothly for endless day-to-night looks.',
    bullets: ['10 versatile shades', 'Matte + shimmer finishes', 'Highly pigmented', 'Blends smoothly'],
    highlights: HL.wear, weight: '120g',
  },
  {
    name: 'CeraVe Hydrating Cleanser', slug: 'cerave-hydrating-cleanser', brand: 'CeraVe',
    cat: 'skincare', price: 1950, labels: ['featured', 'best'], rating: 4.5, numReviews: 98, sold: 150, img: 'cleanser', stock: 65,
    short: 'Gentle hydrating cleanser with ceramides and hyaluronic acid.',
    desc: 'CeraVe Hydrating Facial Cleanser gently cleanses while restoring the skin barrier with 3 essential ceramides and hyaluronic acid. Ideal for normal to dry skin.',
    bullets: ['3 essential ceramides', 'With hyaluronic acid', 'Non-foaming, gentle formula', 'For normal to dry skin'],
    highlights: HL.hydrate, weight: '236ml',
  },
  {
    name: 'The Ordinary Niacinamide 10% + Zinc 1%', slug: 'the-ordinary-niacinamide-10-zinc-1', brand: 'The Ordinary',
    cat: 'skincare', price: 2150, labels: ['best'], rating: 4.5, numReviews: 120, sold: 230, img: 'serum', stock: 75,
    short: 'High-strength serum to reduce blemishes and balance oil.',
    desc: 'The Ordinary Niacinamide 10% + Zinc 1% reduces the appearance of blemishes and congestion while balancing visible sebum activity for clearer-looking skin.',
    bullets: ['Reduces blemishes', 'Balances oil production', 'Minimises pores', 'Brightens skin tone'],
    highlights: HL.glow, weight: '30ml',
  },
  {
    name: 'Minimalist Vitamin C 10% Serum', slug: 'minimalist-vitamin-c-10-serum', brand: 'Minimalist',
    cat: 'skincare', price: 2450, labels: [], rating: 4, numReviews: 86, sold: 140, img: 'serum-dark', stock: 50,
    short: 'Stable vitamin C serum for glowing, even-toned skin.',
    desc: 'Minimalist 10% Vitamin C Face Serum brightens dull skin, fades dark spots and boosts collagen for a naturally radiant, even-toned complexion.',
    bullets: ['Brightens dull skin', 'Fades dark spots', 'Boosts collagen', 'Non-irritating formula'],
    highlights: HL.glow, weight: '30ml',
  },
  {
    name: 'Laneige Lip Sleeping Mask', slug: 'laneige-lip-sleeping-mask', brand: 'Laneige',
    cat: 'skincare', price: 1850, labels: ['hot'], rating: 4, numReviews: 77, sold: 120, img: 'jar', stock: 35,
    short: 'Overnight lip mask for soft, supple lips by morning.',
    desc: 'Laneige Lip Sleeping Mask melts away dead skin cells overnight with its Berry Fruit Complex, leaving lips soft, smooth and supple by morning.',
    bullets: ['Overnight lip treatment', 'Berry fruit complex', 'Removes dead skin gently', 'Soft, supple lips by morning'],
    highlights: HL.hydrate, weight: '20g',
  },
  {
    name: "Paula's Choice 2% BHA Liquid Exfoliant", slug: 'paulas-choice-2-bha-liquid-exfoliant', brand: "Paula's Choice",
    cat: 'skincare', price: 3250, labels: ['best'], rating: 4.5, numReviews: 65, sold: 95, img: 'exfoliant', stock: 25,
    short: 'Cult-favourite leave-on exfoliant for unclogged, smooth skin.',
    desc: "Paula's Choice Skin Perfecting 2% BHA Liquid Exfoliant unclogs pores, smooths wrinkles, and evens skin tone with gentle salicylic acid exfoliation.",
    bullets: ['Unclogs and minimises pores', 'Smooths fine lines', 'Evens skin tone', 'Gentle leave-on formula'],
    highlights: HL.glow, weight: '118ml',
  },
  {
    name: 'Nivea Soft Moisturizing Cream', slug: 'nivea-soft-moisturizing-cream', brand: 'Nivea',
    cat: 'body', price: 1050, labels: ['hot'], rating: 4.5, numReviews: 140, sold: 260, img: 'jar', stock: 120,
    short: 'Light moisturizing cream with jojoba oil and vitamin E.',
    desc: 'Nivea Soft is a refreshing, fast-absorbing moisturizing cream with jojoba oil and vitamin E for face, hands and body — soft skin every day.',
    bullets: ['With jojoba oil & vitamin E', 'Fast absorbing', 'For face, hands & body', 'Everyday moisture'],
    highlights: HL.hydrate, weight: '200ml',
  },
  {
    name: 'Dove Deeply Nourishing Body Wash', slug: 'dove-deeply-nourishing-body-wash', brand: 'Dove',
    cat: 'bath', price: 1150, labels: [], rating: 4.5, numReviews: 105, sold: 190, img: 'cleanser', stock: 90,
    short: 'Creamy body wash that nourishes deep into the skin.',
    desc: 'Dove Deeply Nourishing Body Wash with NutriumMoisture technology gently cleanses and nourishes deep into the surface layers of the skin for softness that lasts.',
    bullets: ['NutriumMoisture technology', 'Gentle daily cleansing', 'Softer, smoother skin', 'Mild & caring formula'],
    highlights: HL.hydrate, weight: '250ml',
  },
  {
    name: 'Essence Gel Nail Colour Set', slug: 'essence-gel-nail-colour-set', brand: 'Essence',
    cat: 'nails', price: 950, labels: ['new'], rating: 4, numReviews: 52, sold: 75, img: 'nails', stock: 4,
    short: 'Gel-finish nail colours with high shine and long wear.',
    desc: 'Essence Gel Nail Colour delivers a salon-style gel finish with high shine and long-lasting wear — no UV lamp needed.',
    bullets: ['Gel-look finish', 'High shine', 'Long-lasting wear', 'No UV lamp needed'],
    highlights: HL.wear, weight: '8ml x 2', variants: [{ name: 'Color', options: ['Rose Pink', 'Coral Crush', 'Nude Beige'] }],
  },
  {
    name: 'Beardo Beard Growth Oil for Men', slug: 'beardo-beard-growth-oil-for-men', brand: 'Beardo',
    cat: 'men', price: 1250, labels: ['limited'], rating: 4, numReviews: 48, sold: 66, img: 'oil', stock: 8,
    short: 'Nourishing beard oil for fuller, softer beard growth.',
    desc: 'Beardo Beard Growth Oil nourishes facial hair and the skin underneath, promoting fuller, softer and healthier beard growth.',
    bullets: ['Promotes fuller growth', 'Softens beard hair', 'Nourishes skin underneath', 'Non-sticky formula'],
    highlights: HL.glow, weight: '30ml',
  },
  {
    name: 'Pro Blending Makeup Brush Set (12pc)', slug: 'pro-blending-makeup-brush-set-12pc', brand: 'Nayab Glow',
    cat: 'accessories', price: 1450, oldPrice: 1850, labels: ['sale'], rating: 4.5, numReviews: 60, sold: 85, img: 'brush', stock: 0,
    short: 'Professional 12-piece brush set for flawless application.',
    desc: 'A professional 12-piece makeup brush set with ultra-soft synthetic bristles for flawless blending, contouring and detailing.',
    bullets: ['12 professional brushes', 'Ultra-soft bristles', 'Cruelty-free synthetic hair', 'For face & eye makeup'],
    highlights: HL.wear, weight: '350g',
  },
];

const SITE_CONTENT = {
  topbar: {
    welcome: 'Welcome to Official Nayab Glow',
    promos: [
      { icon: 'badgeCheck', text: '100% Original Products' },
      { icon: 'truck', text: 'Fast Delivery Across Pakistan' },
      { icon: 'banknote', text: 'Cash on Delivery Available' },
    ],
  },
  logo: { script: 'Official', name: 'NAYAB GLOW', tagline: 'Enhance Your Natural Beauty' },
  hero: {
    slides: [
      { a: 'Reveal Your', b: 'Natural Glow', sub: 'Premium Beauty & Personal Care Products for a More Beautiful You', imgs: [img('oil'), img('serum'), img('jar'), img('perfume')] },
      { a: 'Glow With', b: 'Confidence', sub: '100% Original International Brands, Delivered to Your Doorstep', imgs: [img('palette'), img('lipstick'), img('foundation'), img('essence')] },
      { a: 'Beauty That', b: 'Feels Like You', sub: 'Skincare, Makeup & More — Cash on Delivery Across Pakistan', imgs: [img('cleanser'), img('serum-dark'), img('nails'), img('brush')] },
    ],
    features: [
      { icon: 'badgeCheck', l1: '100% Original', l2: 'Products' },
      { icon: 'truck', l1: 'Fast Delivery', l2: 'Across Pakistan' },
      { icon: 'shield', l1: 'Secure', l2: 'Payments' },
      { icon: 'headset', l1: '24/7 Customer', l2: 'Support' },
    ],
    button: 'SHOP NOW',
  },
  sections: { categoriesTitle: 'SHOP BY CATEGORY', featuredTitle: 'FEATURED PRODUCTS', brandsTitle: 'TOP BRANDS WE DEAL IN' },
  promoRow: {
    left: { small: 'UP TO', big: '30% OFF', span: 'ON SELECTED ITEMS', btn: 'SHOP NOW', img: img('brush') },
    middle: [
      { icon: 'badgeCheck', t: '100% Original', s: 'Products' },
      { icon: 'tag', t: 'Affordable', s: 'Prices' },
      { icon: 'truck', t: 'Fast Delivery', s: 'Across Pakistan' },
      { icon: 'banknote', t: 'Cash on', s: 'Delivery' },
      { icon: 'refresh', t: 'Easy Return', s: 'Policy' },
    ],
    right: { big: 'NEW ARRIVALS', span: 'Check Out Our Latest Products', btn: 'SHOP NOW', img: img('perfume'), img2: img('essence') },
  },
  brands: [
    { name: "L'ORÉAL", sub: 'PARIS', cls: 'b-loreal' },
    { name: 'MAYBELLINE', sub: 'NEW YORK', cls: 'b-maybelline' },
    { name: 'The', sub: 'Ordinary.', cls: 'b-ordinary' },
    { name: 'COSRX', sub: '', cls: 'b-cosrx' },
    { name: 'LANEIGE', sub: '', cls: 'b-laneige' },
    { name: 'Huda', sub: 'BEAUTY', cls: 'b-huda' },
    { name: 'Neutrogena', sub: '', cls: 'b-neutrogena' },
    { name: "POND'S", sub: '', cls: 'b-ponds' },
    { name: 'Dove', sub: '', cls: 'b-dove' },
  ],
  trustStrip: [
    { icon: 'badgeCheck', title: '100% Original', sub: 'Authentic Products' },
    { icon: 'truck', title: 'Fast Delivery', sub: 'Across Pakistan' },
    { icon: 'banknote', title: 'Cash on Delivery', sub: 'Pay When You Receive' },
    { icon: 'refresh', title: 'Easy Returns', sub: '7 Days Return Policy' },
    { icon: 'shield', title: 'Secure Payments', sub: '100% Protected' },
  ],
  footer: {
    whyTitle: 'WHY CHOOSE OFFICIAL NAYAB GLOW?',
    why: [
      '100% Original & Authentic Products',
      'Best Quality at Affordable Prices',
      'Fast & Safe Delivery All Over Pakistan',
      'Secure Payment Options',
      '24/7 Friendly Customer Support',
    ],
    contact: { location: 'Pakistan', email: 'support@officialnayabglow.com', phone: '+92 300 1234567', hours: 'Mon - Sat / 10:00 AM - 8:00 PM' },
    copyright: '© 2026 Official Nayab Glow. All Rights Reserved.',
  },
  social: { facebook: '#', instagram: '#', tiktok: '#', youtube: '#', whatsapp: '#' },
  chatWidget: {
    title: 'Nayab Glow Support',
    subtitle: 'We usually reply within a few minutes',
    welcome: 'Assalam o Alaikum! 👋 Welcome to Official Nayab Glow. How can we help you today?',
  },
  pages: {
    'shipping-policy': {
      title: 'Shipping Policy',
      body: 'Hum poore Pakistan mein delivery karte hain.\n\nStandard Delivery: 3-5 business days (FREE on all orders).\nExpress Delivery: 1-2 business days (Rs.199).\n\nOrder dispatch hone ke baad aap ko tracking details SMS/email par mil jati hain, aur aap Track Order page se har waqt status check kar sakte hain.',
    },
    'returns-policy': {
      title: 'Returns & Refund Policy',
      body: 'Agar aap kisi product se mutmain nahi hain to delivery ke 7 din ke andar unopened products return kar sakte hain.\n\nRefund process: return receive hone ke baad 3-5 business days mein aap ka refund process ho jata hai.\n\nRefund request ke liye apne account ke Order History se "Request Refund" use karein ya chat support par rabta karein.',
    },
    terms: {
      title: 'Terms & Conditions',
      body: 'Official Nayab Glow se kharidari karte huay aap in sharait se ittefaq karte hain:\n\n1. Tamam products 100% original hain.\n2. Prices mein tabdeeli ka haq mehfooz hai.\n3. Order confirmation ke liye phone par rabta kiya ja sakta hai.\n4. Ghalat address ki soorat mein delivery ka waqt barh sakta hai.',
    },
    privacy: {
      title: 'Privacy Policy',
      body: 'Aap ki personal information hamare paas mehfooz hai. Hum aap ka data kisi third party ke saath share nahi karte.\n\nHum sirf order process karne ke liye aap ka naam, address aur phone number use karte hain. Payment details hamare server par store nahi hoti.',
    },
    faqs: {
      title: 'FAQs',
      body: 'Q: Kya tamam products original hain?\nA: Ji haan, hum sirf 100% original products deal karte hain.\n\nQ: Delivery kitne din mein hoti hai?\nA: Standard delivery 3-5 business days, express 1-2 business days.\n\nQ: Payment kaise karun?\nA: Cash on Delivery available hai — order milne par payment karein.\n\nQ: Order track kaise karun?\nA: Track Order page par apna order number ya phone number enter karein.',
    },
  },
  checkout: {
    loginBar: 'Have an account?',
    privacyTitle: 'We Protect Your Privacy',
    privacyText: 'Your personal information is safe with us. We never share your details with anyone.',
  },
};

function transform(p, catMap) {
  const purchase = Math.round(p.price * 0.55);
  return {
    name: p.name,
    slug: p.slug,
    brand: p.brand,
    category: catMap[p.cat === 'accessories' ? 'accessories' : p.cat],
    price: p.price,
    oldPrice: p.oldPrice,
    costs: { purchase, delivery: 60, packaging: 25, tax: Math.round(p.price * 0.05), other: 0 },
    stock: p.stock ?? 80,
    reservedStock: 0,
    lowStockThreshold: 5,
    sku: 'NG-' + p.slug.split('-').map((w) => w[0]).join('').toUpperCase().slice(0, 6) + '-' + String(p.price).slice(0, 2),
    weight: p.weight || '',
    dimensions: p.dimensions || '',
    labels: p.labels || [],
    tags: [p.brand, p.cat, ...p.name.split(' ').slice(0, 2)].map((t) => t.toLowerCase()),
    seoTitle: `${p.name} — Buy Online in Pakistan | Official Nayab Glow`,
    seoDescription: p.short,
    active: true,
    image: img(p.img),
    images: [{ url: img(p.img), key: null }, ...(p.gallery || []).slice(1).map((g) => ({ url: img(g), key: null }))],
    gallery: (p.gallery || [p.img, p.img, p.img, p.img]).map(img),
    rating: p.rating,
    numReviews: p.numReviews,
    sold: p.sold,
    shortDescription: p.short,
    description: p.desc,
    bullets: p.bullets,
    highlights: p.highlights,
    specifications: [
      { key: 'Brand', value: p.brand },
      { key: 'Category', value: p.cat },
      { key: 'Size / Weight', value: p.weight || '—' },
      { key: 'Authenticity', value: '100% Original' },
    ],
    variants: p.variants || [],
    sizes: p.sizes || [],
    ...defaults,
  };
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  // super admin
  const email = (process.env.ADMIN_EMAIL || 'admin@nayabglow.com').toLowerCase();
  const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
  await Admin.updateOne(
    { email },
    { $set: { email, passwordHash, name: 'Nayab Glow Admin', role: 'super_admin', active: true } },
    { upsert: true }
  );
  console.log(`Super admin ready: ${email}`);

  // categories
  await Category.deleteMany({});
  const cats = await Category.insertMany(
    CATS.map((c, i) => ({
      name: c.name,
      slug: c.realSlug || c.slug,
      image: { url: img(c.img), key: null },
      active: true,
      sortOrder: i,
    }))
  );
  const catMap = Object.fromEntries(cats.map((c) => [c.slug, c._id]));
  console.log(`Seeded ${cats.length} categories`);

  // products
  await Product.deleteMany({});
  await Product.insertMany(P.map((p) => transform(p, catMap)));
  console.log(`Seeded ${P.length} products`);

  // shipping methods
  await ShippingMethod.deleteMany({});
  await ShippingMethod.insertMany([
    { name: 'Standard Delivery', description: 'Nationwide standard delivery', cost: 0, etaText: '3-5 business days', active: true, sortOrder: 0 },
    { name: 'Express Delivery', description: 'Priority courier delivery', cost: 199, etaText: '1-2 business days', active: true, sortOrder: 1 },
    { name: 'Same Day Delivery (Lahore)', description: 'Same-day within Lahore city', cost: 349, etaText: 'Today (order before 2 PM)', zones: ['Lahore'], active: false, sortOrder: 2 },
  ]);
  console.log('Seeded shipping methods');

  // discounts / coupons
  await Discount.deleteMany({});
  await Discount.insertMany([
    { name: 'Glow Discount 20%', code: 'GLOW20', type: 'percentage', value: 20, scope: 'all', active: true },
    { name: 'Glow Discount 10%', code: 'GLOW10', type: 'percentage', value: 10, scope: 'all', active: true },
    { name: 'Free Shipping Coupon', code: 'FREESHIP', type: 'free_shipping', scope: 'all', minPurchase: 2000, active: true },
    { name: 'Rs.150 off on Rs.5,000+', code: '', type: 'fixed', value: 150, scope: 'all', minPurchase: 5000, active: true },
  ]);
  console.log('Seeded discounts');

  // settings + content
  await setSetting('payments', {
    cod: { enabled: true },
    easypaisa: { enabled: false, merchantId: '', storeId: '', apiKey: '' },
    jazzcash: { enabled: false, merchantId: '', password: '', integritySalt: '' },
    credit_card: { enabled: false, gateway: '', merchantId: '', apiKey: '', apiSecret: '' },
    debit_card: { enabled: false, gateway: '', merchantId: '', apiKey: '', apiSecret: '' },
  });
  await setSetting('store', { taxRate: 12, lowStockThreshold: 5 });
  await setSetting('siteContent', SITE_CONTENT);
  console.log('Seeded settings + site content');

  // guest chat numbering starts at #1001
  await Counter.updateOne({ _id: 'guest' }, { $setOnInsert: { seq: 1000 } }, { upsert: true });

  // clean transactional data for a fresh start
  await Promise.all([
    Order.deleteMany({}),
    Refund.deleteMany({}),
    Expense.deleteMany({}),
    Notification.deleteMany({}),
    AuditLog.deleteMany({}),
    StockHistory.deleteMany({}),
    IncomingStock.deleteMany({}),
  ]);
  console.log('Cleared old orders/refunds/logs');

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
