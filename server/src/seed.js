import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import Product from './models/Product.js';
import Category from './models/Category.js';
import Admin from './models/Admin.js';
import Seller from './models/Seller.js';
import Order from './models/Order.js';
import Discount from './models/Discount.js';
import ShippingMethod from './models/ShippingMethod.js';
import { Conversation, Message } from './models/Chat.js';
import { Counter, setSetting } from './models/System.js';

const CATS = [
  { name: 'Mobiles & Tablets', slug: 'mobiles', icon: 'phone', img: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop&q=80' },
  { name: 'Laptops & Computers', slug: 'laptops', icon: 'package', img: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=600&auto=format&fit=crop&q=80' },
  { name: 'Electronics & Audio', slug: 'electronics', icon: 'headset', img: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80' },
  { name: 'Fashion & Apparel', slug: 'fashion', icon: 'sparkle', img: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=600&auto=format&fit=crop&q=80' },
  { name: 'Watches & Wearables', slug: 'watches', icon: 'clock', img: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80' },
  { name: 'Beauty & Fragrances', slug: 'beauty', icon: 'sparkle', img: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=600&auto=format&fit=crop&q=80' },
  { name: 'Home & Kitchen', slug: 'home', icon: 'home', img: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=600&auto=format&fit=crop&q=80' },
  { name: 'Sports & Fitness', slug: 'sports', icon: 'gift', img: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600&auto=format&fit=crop&q=80' },
];

export async function runSeed() {
  console.log('⚡ Safe Syncing Bazario Multi-Vendor Marketplace database (NO DATA DELETED)...');

  // 1. Ensure Admins (Only admin@bazario.com & abdullah@bazario.com)
  const adminPass = await bcrypt.hash('Admin@Bazario2026!', 10);
  const adminsList = [
    {
      name: 'Super Admin (Owner)',
      email: 'admin@bazario.com',
      passwordHash: adminPass,
      role: 'super_admin',
      title: 'Platform Owner & CEO',
      phone: '+92 300 1234567',
      permissions: ['sellers', 'products', 'categories', 'orders', 'refunds', 'discounts', 'shipping', 'inventory', 'finance', 'reports', 'chat', 'content', 'settings', 'staff', 'audit'],
      active: true,
    },
    {
      name: 'Abdullah',
      email: 'abdullah@bazario.com',
      passwordHash: adminPass,
      role: 'super_admin',
      title: 'Platform Administrator',
      phone: '+92 300 1234567',
      permissions: ['sellers', 'products', 'categories', 'orders', 'refunds', 'discounts', 'shipping', 'inventory', 'finance', 'reports', 'chat', 'content', 'settings', 'staff', 'audit'],
      active: true,
    },
  ];

  for (const adm of adminsList) {
    await Admin.updateOne({ email: adm.email }, { $setOnInsert: adm }, { upsert: true });
  }
  console.log(`✅ Ensured admins (admin@bazario.com & abdullah@bazario.com)`);

  // 2. Demo Sellers / Vendors
  const sellerPass = await bcrypt.hash('seller123', 10);
  const sellersList = [
    {
      ownerName: 'Alex Rivera',
      storeName: 'Apex Electronics & Flagship Tech',
      email: 'demoseller1@bazario.com',
      passwordHash: sellerPass,
      phone: '+1 (555) 234-5678',
      storeSlug: 'apex-electronics',
      logo: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=200&auto=format&fit=crop&q=80',
      banner: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop&q=80',
      description: 'Authorized premier global vendor for flagship smartphones, ultrabooks, pro noise-canceling audio gear, and elite gaming peripherals.',
      address: { street: '742 Silicon Valley Ave, Suite 300', city: 'San Jose', state: 'CA', postalCode: '95113', country: 'United States' },
      bankDetails: { accountTitle: 'Apex Tech Solutions LLC', accountNumber: '123456789012', bankName: 'JPMorgan Chase Bank' },
      payoutDetails: { accountTitle: 'Apex Tech Solutions LLC', accountNumber: '123456789012', bankName: 'JPMorgan Chase Bank', preferredMethod: 'bank' },
      commissionRate: 8,
      status: 'active',
      verified: true,
      rating: 4.9,
      numReviews: 128,
      totalSales: 148500,
      totalOrders: 96,
      wallet: { balance: 14250, processingFund: 3200, totalProfitEarned: 29700, totalEarned: 135000, totalDeposited: 15000, totalWithdrawn: 120750 },
      accountHealth: { score: 98, status: 'healthy' },
      withdrawalLimit: { maxAmount: 500, minAmount: 10, currentTierName: 'Tier 1 - Standard ($500 Max)', successfulWithdrawalCount: 0, requiredWithdrawalsForIncrease: 10, upgradeFee: 50 },
    },
    {
      ownerName: 'Sophia Laurent',
      storeName: 'Vogue & Velvet Luxury Apparel',
      email: 'demoseller2@bazario.com',
      passwordHash: sellerPass,
      phone: '+44 20 7946 0912',
      storeSlug: 'vogue-velvet-apparel',
      logo: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=200&auto=format&fit=crop&q=80',
      banner: 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=1200&auto=format&fit=crop&q=80',
      description: 'Curated designer outerwear, handcrafted genuine lambskin leather jackets, heavyweight streetwear hoodies, and modern trending footwear.',
      address: { street: '450 Oxford Street', city: 'London', state: 'Greater London', postalCode: 'W1C 1AP', country: 'United Kingdom' },
      bankDetails: { accountTitle: 'Vogue & Velvet Apparel Ltd', accountNumber: '987654321098', bankName: 'Barclays Bank' },
      payoutDetails: { accountTitle: 'Vogue & Velvet Apparel Ltd', accountNumber: '987654321098', bankName: 'Barclays Bank', preferredMethod: 'bank' },
      commissionRate: 10,
      status: 'active',
      verified: true,
      rating: 4.8,
      numReviews: 94,
      totalSales: 79500,
      totalOrders: 64,
      wallet: { balance: 8900, processingFund: 1800, totalProfitEarned: 15900, totalEarned: 71550, totalDeposited: 8000, totalWithdrawn: 62650 },
      accountHealth: { score: 95, status: 'healthy' },
      withdrawalLimit: { maxAmount: 500, minAmount: 10, currentTierName: 'Tier 1 - Standard ($500 Max)', successfulWithdrawalCount: 0, requiredWithdrawalsForIncrease: 10, upgradeFee: 50 },
    },
    {
      ownerName: 'Marcus Vance',
      storeName: 'Lumina Smart Home & Kitchen',
      email: 'demoseller3@bazario.com',
      passwordHash: sellerPass,
      phone: '+1 (312) 555-0143',
      storeSlug: 'lumina-smart-home',
      logo: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=200&auto=format&fit=crop&q=80',
      banner: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=1200&auto=format&fit=crop&q=80',
      description: 'Next-generation smart kitchen culinary equipment, dual-zone digital air fryers, commercial-grade blenders, and modern smart living devices.',
      address: { street: '1200 Grand Avenue', city: 'Chicago', state: 'IL', postalCode: '60611', country: 'United States' },
      bankDetails: { accountTitle: 'Lumina Home Living LLC', accountNumber: '456789012345', bankName: 'Bank of America' },
      payoutDetails: { accountTitle: 'Lumina Home Living LLC', accountNumber: '456789012345', bankName: 'Bank of America', preferredMethod: 'bank' },
      commissionRate: 12,
      status: 'active',
      verified: true,
      rating: 4.75,
      numReviews: 62,
      totalSales: 54200,
      totalOrders: 48,
      wallet: { balance: 6200, processingFund: 1200, totalProfitEarned: 10840, totalEarned: 47696, totalDeposited: 5000, totalWithdrawn: 41496 },
      accountHealth: { score: 96, status: 'healthy' },
      withdrawalLimit: { maxAmount: 500, minAmount: 10, currentTierName: 'Tier 1 - Standard ($500 Max)', successfulWithdrawalCount: 0, requiredWithdrawalsForIncrease: 10, upgradeFee: 50 },
    },
    {
      ownerName: 'Dr. Elena Rostova',
      storeName: 'Aura & Glow Dermatological Skincare',
      email: 'demoseller4@bazario.com',
      passwordHash: sellerPass,
      phone: '+1 (212) 555-0199',
      storeSlug: 'aura-glow-skincare',
      logo: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=200&auto=format&fit=crop&q=80',
      banner: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=1200&auto=format&fit=crop&q=80',
      description: 'Clinical-grade botanical face serums, 100% authentic dermatological treatments, French niche perfumes, and luxury organic beauty essentials.',
      address: { street: '750 Fifth Avenue', city: 'New York', state: 'NY', postalCode: '10019', country: 'United States' },
      bankDetails: { accountTitle: 'Aura Glow Cosmetics Corp', accountNumber: '334455667788', bankName: 'Citibank' },
      payoutDetails: { accountTitle: 'Aura Glow Cosmetics Corp', accountNumber: '334455667788', bankName: 'Citibank', preferredMethod: 'bank' },
      commissionRate: 10,
      status: 'active',
      verified: true,
      rating: 4.92,
      numReviews: 145,
      totalSales: 92000,
      totalOrders: 112,
      wallet: { balance: 11400, processingFund: 2400, totalProfitEarned: 18400, totalEarned: 82800, totalDeposited: 10000, totalWithdrawn: 71400 },
      accountHealth: { score: 99, status: 'healthy' },
      withdrawalLimit: { maxAmount: 500, minAmount: 10, currentTierName: 'Tier 1 - Standard ($500 Max)', successfulWithdrawalCount: 0, requiredWithdrawalsForIncrease: 10, upgradeFee: 50 },
    },
    {
      ownerName: 'David Miller',
      storeName: 'Titan Pro Athletics & Fitness',
      email: 'demoseller5@bazario.com',
      passwordHash: sellerPass,
      phone: '+1 (415) 555-0182',
      storeSlug: 'titan-pro-fitness',
      logo: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=200&auto=format&fit=crop&q=80',
      banner: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&auto=format&fit=crop&q=80',
      description: 'Commercial heavy-duty adjustable gym equipment, pure whey isolate supplements, GPS multisport running wearables, and athletic apparel.',
      address: { street: '880 Olympic Boulevard', city: 'Los Angeles', state: 'CA', postalCode: '90015', country: 'United States' },
      bankDetails: { accountTitle: 'Titan Pro Fitness Inc', accountNumber: '778899001122', bankName: 'Wells Fargo' },
      payoutDetails: { accountTitle: 'Titan Pro Fitness Inc', accountNumber: '778899001122', bankName: 'Wells Fargo', preferredMethod: 'bank' },
      commissionRate: 9,
      status: 'active',
      verified: true,
      rating: 4.85,
      numReviews: 78,
      totalSales: 68400,
      totalOrders: 58,
      wallet: { balance: 7800, processingFund: 1500, totalProfitEarned: 13680, totalEarned: 62244, totalDeposited: 6000, totalWithdrawn: 54444 },
      accountHealth: { score: 97, status: 'healthy' },
      withdrawalLimit: { maxAmount: 500, minAmount: 10, currentTierName: 'Tier 1 - Standard ($500 Max)', successfulWithdrawalCount: 0, requiredWithdrawalsForIncrease: 10, upgradeFee: 50 },
    },
    {
      ownerName: 'Henri Dubois',
      storeName: 'Chronos Swiss Luxury Timepieces',
      email: 'demoseller6@bazario.com',
      passwordHash: sellerPass,
      phone: '+41 22 730 0110',
      storeSlug: 'chronos-luxury-timepieces',
      logo: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200&auto=format&fit=crop&q=80',
      banner: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=1200&auto=format&fit=crop&q=80',
      description: 'Certified Swiss automatic chronographs, sapphire crystal heritage timepieces, titanium diver wristwatches, and bespoke luxury accessories.',
      address: { street: '14 Rue du Rhône', city: 'Geneva', state: 'Geneva', postalCode: '1204', country: 'Switzerland' },
      bankDetails: { accountTitle: 'Chronos Horlogerie SA', accountNumber: '665544332211', bankName: 'UBS Switzerland' },
      payoutDetails: { accountTitle: 'Chronos Horlogerie SA', accountNumber: '665544332211', bankName: 'UBS Switzerland', preferredMethod: 'bank' },
      commissionRate: 7,
      status: 'active',
      verified: true,
      rating: 4.95,
      numReviews: 110,
      totalSales: 210000,
      totalOrders: 72,
      wallet: { balance: 24500, processingFund: 5800, totalProfitEarned: 42000, totalEarned: 195300, totalDeposited: 25000, totalWithdrawn: 170800 },
      accountHealth: { score: 100, status: 'healthy' },
      withdrawalLimit: { maxAmount: 500, minAmount: 10, currentTierName: 'Tier 1 - Standard ($500 Max)', successfulWithdrawalCount: 0, requiredWithdrawalsForIncrease: 10, upgradeFee: 50 },
    },
  ];

  for (const s of sellersList) {
    await Seller.updateOne({ email: s.email }, { $set: s }, { upsert: true });
  }
  console.log(`✅ Ensured demo sellers (demoseller1@bazario.com through demoseller6@bazario.com)`);

  // 3. Categories
  for (const [i, c] of CATS.entries()) {
    await Category.updateOne(
      { slug: c.slug },
      { $set: { name: c.name, slug: c.slug, image: { url: c.img, key: null }, active: true, sortOrder: i } },
      { upsert: true }
    );
  }

  // 4. Shipping Methods & Discounts
  const shippingMethods = [
    { name: 'Global Express 1-2 Day Delivery', description: 'Next-day fast international delivery across major global hubs', cost: 15, etaText: '1-2 business days', active: true, sortOrder: 0 },
    { name: 'Standard Worldwide Shipping', description: 'Reliable doorstep worldwide delivery', cost: 0, etaText: '3-5 business days', active: true, sortOrder: 1 },
    { name: 'Same Day Express Hub Delivery', description: 'Order before 2 PM for same day metro delivery', cost: 25, etaText: 'Today Evening', active: true, sortOrder: 2 },
  ];
  for (const sm of shippingMethods) {
    await ShippingMethod.updateOne({ name: sm.name }, { $set: sm }, { upsert: true });
  }

  const discounts = [
    { name: 'Welcome Deal 15% OFF', code: 'BAZARIO15', type: 'percentage', value: 15, scope: 'all', active: true },
    { name: 'Mega Flash Sale 25% OFF', code: 'MEGA25', type: 'percentage', value: 25, scope: 'all', minPurchase: 100, active: true },
    { name: 'Free Express Shipping', code: 'FREESHIP', type: 'free_shipping', scope: 'all', minPurchase: 50, active: true },
  ];
  for (const d of discounts) {
    await Discount.updateOne({ code: d.code }, { $set: d }, { upsert: true });
  }

  console.log('\n🎉 Bazario Multi-Vendor Marketplace database safe-synced successfully!');
}

if (process.argv[1]?.endsWith('seed.js')) {
  let mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri || mongoUri.includes('<db_username>') || mongoUri.includes('<db_password>') || mongoUri.includes('aizaz6241_db_user:') || mongoUri.includes('u2IODhWhiXehEOy8')) {
    mongoUri = 'mongodb+srv://aizazkhan6241_db_user:98av24298@cluster0.ijpphlb.mongodb.net/bazario?retryWrites=true&w=majority&appName=Cluster0';
  }
  mongoose
    .connect(mongoUri)
    .then(async () => {
      await runSeed();
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch(async (e) => {
      console.error('❌ Seed connection error:', e.message);
      process.exit(1);
    });
}
