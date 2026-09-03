import 'dotenv/config';
import mongoose from 'mongoose';
import TreasuryProduct from './models/TreasuryProduct.js';
import Category from './models/Category.js';

const MASTER_PRODUCTS = [
  {
    name: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones',
    slug: 'sony-wh-1000xm5-wireless-headphones',
    brand: 'Sony',
    categorySlug: 'electronics',
    price: 399.99,
    costPrice: 280.0,
    oldPrice: 449.99,
    stock: 1000,
    lowStockThreshold: 15,
    sku: 'TRZ-SONY-XM5-BLK',
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80',
    images: [
      { url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80', key: null },
      { url: 'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=800&auto=format&fit=crop&q=80', key: null },
    ],
    shortDescription: 'Industry-leading noise cancellation optimized to you with dual processors and 8 microphones.',
    description: 'The WH-1000XM5 headphones rewrite the rules for distraction-free listening. Two processors control 8 microphones for unprecedented noise cancellation and exceptional call quality.',
    bullets: [
      'Two processors and 8 microphones for astonishing noise cancellation',
      'Auto NC Optimizer automatically adjusts noise canceling based on wearing conditions and environment',
      'Magnificent sound engineered with new Integrated Processor V1',
      'Up to 30-hour battery life with quick charging (3 min charge for 3 hours playback)',
    ],
    specifications: [
      { key: 'Driver Unit', value: '30mm, dome type' },
      { key: 'Frequency Response', value: '4 Hz - 40,000 Hz' },
      { key: 'Battery Life', value: 'Max. 30 hrs (NC ON), Max. 40 hrs (NC OFF)' },
      { key: 'Bluetooth Version', value: '5.2' },
    ],
    labels: ['best', 'featured'],
    tags: ['audio', 'headphones', 'sony', 'wireless', 'noise cancelling'],
  },
  {
    name: 'Apple iPhone 15 Pro Max - 256GB Titanium',
    slug: 'apple-iphone-15-pro-max-256gb',
    brand: 'Apple',
    categorySlug: 'mobiles',
    price: 1199.99,
    costPrice: 950.0,
    oldPrice: 1299.99,
    stock: 1000,
    lowStockThreshold: 20,
    sku: 'TRZ-APL-IP15PM-256',
    image: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=800&auto=format&fit=crop&q=80',
    images: [
      { url: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=800&auto=format&fit=crop&q=80', key: null },
      { url: 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=800&auto=format&fit=crop&q=80', key: null },
    ],
    shortDescription: 'Forged in titanium with industry-leading A17 Pro chip and revolutionary 48MP camera system.',
    description: 'iPhone 15 Pro Max features a strong and light aerospace-grade titanium design with textured matte-glass back. It also has a Ceramic Shield front that is tougher than any smartphone glass.',
    bullets: [
      'Aerospace-grade titanium design with Ceramic Shield front',
      'A17 Pro chip brings next-level gaming and incredible performance',
      '48MP Main camera with 5x optical zoom on 120mm lens',
      'Action button gives fast track to your favorite features',
    ],
    specifications: [
      { key: 'Display', value: '6.7-inch Super Retina XDR with ProMotion' },
      { key: 'Processor', value: 'A17 Pro chip' },
      { key: 'Storage', value: '256GB' },
      { key: 'Connector', value: 'USB-C supporting USB 3' },
    ],
    labels: ['hot', 'featured'],
    tags: ['apple', 'iphone', 'smartphone', '5g', 'titanium'],
  },
  {
    name: 'Apple MacBook Pro 16" M3 Max 36GB / 1TB SSD',
    slug: 'apple-macbook-pro-16-m3-max',
    brand: 'Apple',
    categorySlug: 'laptops',
    price: 3499.0,
    costPrice: 2850.0,
    oldPrice: 3699.0,
    stock: 1000,
    lowStockThreshold: 10,
    sku: 'TRZ-APL-MBP16-M3',
    image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&auto=format&fit=crop&q=80',
    images: [
      { url: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&auto=format&fit=crop&q=80', key: null },
      { url: 'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=800&auto=format&fit=crop&q=80', key: null },
    ],
    shortDescription: 'The most advanced Mac laptop ever with Liquid Retina XDR display and M3 Max chip.',
    description: 'With an M3 Max chip, MacBook Pro tackles the most demanding workflows with up to 16 CPU cores and up to 40 GPU cores.',
    bullets: [
      'Supercharged by M3 Max with up to 16-core CPU and 40-core GPU',
      'Up to 22 hours of battery life so you can go all day',
      'Liquid Retina XDR display with 10,000 mini-LEDs',
      'Full array of ports: 3x Thunderbolt 4, HDMI, SDXC, MagSafe 3',
    ],
    specifications: [
      { key: 'RAM', value: '36GB Unified Memory' },
      { key: 'Storage', value: '1TB Superfast NVMe SSD' },
      { key: 'Screen Size', value: '16.2-inch Liquid Retina XDR' },
    ],
    labels: ['best'],
    tags: ['laptop', 'macbook', 'apple', 'm3 max', 'ultrabook'],
  },
  {
    name: 'Chronos Heritage Swiss Automatic Chronograph Watch',
    slug: 'chronos-heritage-swiss-automatic-chronograph',
    brand: 'Chronos',
    categorySlug: 'watches',
    price: 890.0,
    costPrice: 520.0,
    oldPrice: 1150.0,
    stock: 1000,
    lowStockThreshold: 12,
    sku: 'TRZ-WAT-CHR-001',
    image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80',
    images: [
      { url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80', key: null },
      { url: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&auto=format&fit=crop&q=80', key: null },
    ],
    shortDescription: 'Precision Swiss automatic movement with anti-reflective sapphire crystal and Italian leather strap.',
    description: 'A masterpiece of horological engineering. Features an open-heart exhibition case back showing the decorated rotor, 48-hour power reserve, and 100m water resistance.',
    bullets: [
      'Genuine Swiss automatic movement with 28,800 vph',
      'Scratch-resistant synthetic sapphire crystal front and back',
      'Water resistant to 10 ATM / 100 meters',
      'Handcrafted Italian top-grain calfskin leather strap',
    ],
    specifications: [
      { key: 'Case Diameter', value: '42 mm' },
      { key: 'Case Thickness', value: '11.8 mm' },
      { key: 'Water Resistance', value: '100m / 10 ATM' },
      { key: 'Movement', value: 'Swiss Calibre Automatic' },
    ],
    labels: ['featured'],
    tags: ['watch', 'luxury', 'swiss', 'automatic', 'chronograph'],
  },
  {
    name: 'Bespoke Lambskin Leather Biker Jacket',
    slug: 'bespoke-lambskin-leather-biker-jacket',
    brand: 'Vogue & Velvet',
    categorySlug: 'fashion',
    price: 349.99,
    costPrice: 190.0,
    oldPrice: 499.99,
    stock: 1000,
    lowStockThreshold: 15,
    sku: 'TRZ-FSH-JKT-09',
    image: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=800&auto=format&fit=crop&q=80',
    images: [
      { url: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=800&auto=format&fit=crop&q=80', key: null },
      { url: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800&auto=format&fit=crop&q=80', key: null },
    ],
    shortDescription: '100% full-grain genuine lambskin leather with satin interior lining and gunmetal YKK hardware.',
    description: 'An iconic silhouette tailored to perfection. Soft, supple full-grain lambskin with heavy-duty asymmetric metal zippers, zippered cuffs, and classic snap lapels.',
    bullets: [
      '100% Genuine full-grain lambskin leather',
      'Silky smooth breathable satin interior lining',
      'Authentic heavy-duty YKK gunmetal hardware',
      'Classic asymmetric zipper closure with snap collar',
    ],
    specifications: [
      { key: 'Material', value: '100% Lambskin Leather' },
      { key: 'Lining', value: '100% Satin Polyester' },
      { key: 'Care', value: 'Professional Leather Cleaning Only' },
    ],
    sizes: [
      { label: 'S', price: 349.99 },
      { label: 'M', price: 349.99 },
      { label: 'L', price: 349.99 },
      { label: 'XL', price: 359.99 },
    ],
    labels: ['hot', 'best'],
    tags: ['jacket', 'leather', 'fashion', 'outerwear', 'menswear'],
  },
  {
    name: 'Advanced Botanical Retinol & Hyaluronic Face Serum',
    slug: 'advanced-botanical-retinol-face-serum',
    brand: 'Aura & Glow',
    categorySlug: 'beauty',
    price: 58.0,
    costPrice: 22.0,
    oldPrice: 85.0,
    stock: 1000,
    lowStockThreshold: 25,
    sku: 'TRZ-BTY-SRM-50ML',
    image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=800&auto=format&fit=crop&q=80',
    images: [
      { url: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=800&auto=format&fit=crop&q=80', key: null },
      { url: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=800&auto=format&fit=crop&q=80', key: null },
    ],
    shortDescription: 'Clinical-strength multi-depth hydration serum with encapsulated retinol and pure niacinamide.',
    description: 'Formulated with dermatologist-developed micro-encapsulated retinol to gently resurface skin texture while multi-molecular hyaluronic acid delivers deep 72-hour hydration.',
    bullets: [
      'Encapsulated time-release 0.5% pure Retinol for gentle anti-aging',
      'Triple-molecular weight Hyaluronic Acid deeply hydrates all epidermal layers',
      '5% Niacinamide noticeably shrinks pores and brightens uneven tone',
      '100% vegan, fragrance-free, cruelty-free certified',
    ],
    specifications: [
      { key: 'Volume', value: '50ml / 1.7 fl oz' },
      { key: 'Skin Type', value: 'All skin types including sensitive' },
      { key: 'Formulation', value: 'Lightweight quick-absorbing serum' },
    ],
    labels: ['sale', 'best'],
    tags: ['skincare', 'serum', 'retinol', 'beauty', 'organic'],
  },
];

export async function seedTreasury() {
  console.log('⚡ Seeding Master Products into Product Treasury...');

  for (const item of MASTER_PRODUCTS) {
    let catId = null;
    if (item.categorySlug) {
      const cat = await Category.findOne({ slug: item.categorySlug });
      if (cat) catId = cat._id;
    }

    const { categorySlug, ...data } = item;
    await TreasuryProduct.updateOne(
      { slug: item.slug },
      {
        $set: {
          ...data,
          category: catId,
          active: true,
        },
      },
      { upsert: true }
    );
    console.log(`✅ Treasury product synced: "${item.name}" (Stock: ${item.stock})`);
  }

  const count = await TreasuryProduct.countDocuments();
  console.log(`🎉 Successfully verified ${count} master products in Product Treasury!`);
}

if (process.argv[1]?.endsWith('seed-treasury.js')) {
  let mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (
    !mongoUri ||
    mongoUri.includes('<db_username>') ||
    mongoUri.includes('<db_password>') ||
    mongoUri.includes('aizaz6241_db_user:') ||
    mongoUri.includes('u2IODhWhiXehEOy8')
  ) {
    mongoUri =
      'mongodb+srv://aizazkhan6241_db_user:98av24298@cluster0.ijpphlb.mongodb.net/bazario?retryWrites=true&w=majority&appName=Cluster0';
  }

  mongoose
    .connect(mongoUri)
    .then(async () => {
      await seedTreasury();
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Treasury seed error:', err.message);
      process.exit(1);
    });
}
