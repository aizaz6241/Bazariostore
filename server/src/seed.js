import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import Product from './models/Product.js';
import Category from './models/Category.js';
import Admin from './models/Admin.js';
import Seller from './models/Seller.js';
import Order from './models/Order.js';
import Refund from './models/Refund.js';
import Discount from './models/Discount.js';
import ShippingMethod from './models/ShippingMethod.js';
import Expense from './models/Expense.js';
import Notification from './models/Notification.js';
import AuditLog from './models/AuditLog.js';
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
  console.log('Seeding Amazon Multi-Vendor Marketplace database...');

  // 1. Super Admin & Staff
  const adminPass = await bcrypt.hash('admin123', 10);
  await Admin.deleteMany({});
  const admins = await Admin.insertMany([
    {
      name: 'Super Admin (Owner)',
      email: 'admin@amazon.com',
      passwordHash: adminPass,
      role: 'super_admin',
      title: 'Platform Owner & CEO',
      phone: '+92 300 1234567',
      permissions: ['sellers', 'products', 'categories', 'orders', 'refunds', 'discounts', 'shipping', 'inventory', 'finance', 'reports', 'chat', 'content', 'settings', 'staff', 'audit'],
      active: true,
    },
    {
      name: 'Sara Khan (Support Lead)',
      email: 'support@amazon.com',
      passwordHash: adminPass,
      role: 'support',
      title: 'Seller & Customer Support Executive',
      phone: '+92 301 9876543',
      permissions: ['sellers', 'orders', 'refunds', 'chat'],
      active: true,
    },
    {
      name: 'Bilal Ahmed (Logistics)',
      email: 'orders@amazon.com',
      passwordHash: adminPass,
      role: 'order_manager',
      title: 'Fulfillment & Dispatch Lead',
      phone: '+92 302 5556677',
      permissions: ['sellers', 'orders', 'refunds', 'shipping'],
      active: true,
    },
  ]);
  console.log(`Seeded ${admins.length} admins & staff members`);

  // 2. Sellers / Vendors
  const sellerPass = await bcrypt.hash('seller123', 10);
  await Seller.deleteMany({});
  const sellers = await Seller.insertMany([
    {
      storeName: 'TechZone Gadgets',
      ownerName: 'Hamza Tariq',
      email: 'seller1@tech.com',
      passwordHash: sellerPass,
      phone: '+92 321 4455667',
      storeSlug: 'techzone-gadgets',
      logo: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=200&auto=format&fit=crop&q=80',
      description: 'Authorized retailer for premium smartphones, laptops, wireless audio, and gaming gear.',
      address: { street: 'Hafeez Centre, Main Boulevard', city: 'Lahore', state: 'Punjab', country: 'Pakistan' },
      bankDetails: { accountTitle: 'TechZone Enterprise', accountNumber: '01234567890123', bankName: 'Meezan Bank' },
      commissionRate: 8,
      status: 'active',
      rating: 4.9,
      numReviews: 84,
      totalSales: 485000,
      totalOrders: 62,
    },
    {
      storeName: 'Urban Vogue Fashion',
      ownerName: 'Ayesha Malik',
      email: 'seller2@fashion.com',
      passwordHash: sellerPass,
      phone: '+92 333 7788990',
      storeSlug: 'urban-vogue-fashion',
      logo: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=200&auto=format&fit=crop&q=80',
      description: 'Trendy streetwear, premium jackets, sneakers, and modern apparel for men and women.',
      address: { street: 'Dolmen Mall, Clifton', city: 'Karachi', state: 'Sindh', country: 'Pakistan' },
      bankDetails: { accountTitle: 'Urban Vogue Studio', accountNumber: '98765432109876', bankName: 'Bank Alfalah' },
      commissionRate: 10,
      status: 'active',
      rating: 4.8,
      numReviews: 56,
      totalSales: 295000,
      totalOrders: 48,
    },
    {
      storeName: 'Apex Living & Home',
      ownerName: 'Usman Farooq',
      email: 'seller3@home.com',
      passwordHash: sellerPass,
      phone: '+92 345 1122334',
      storeSlug: 'apex-living-home',
      logo: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=200&auto=format&fit=crop&q=80',
      description: 'Modern kitchen appliances, air fryers, ergonomic lighting, and smart home decor.',
      address: { street: 'Centaurus Mall, F-8', city: 'Islamabad', state: 'Federal', country: 'Pakistan' },
      bankDetails: { accountTitle: 'Apex Living Pvt Ltd', accountNumber: '45678901234567', bankName: 'HBL' },
      commissionRate: 12,
      status: 'active',
      rating: 4.7,
      numReviews: 39,
      totalSales: 185000,
      totalOrders: 31,
    },
    {
      storeName: 'Glow & Aura Cosmetics',
      ownerName: 'Zainab Noor',
      email: 'seller4@beauty.com',
      passwordHash: sellerPass,
      phone: '+92 312 9988776',
      storeSlug: 'glow-aura-cosmetics',
      logo: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=200&auto=format&fit=crop&q=80',
      description: '100% authentic international skincare serums, fragrances, luxury perfumes, and beauty essentials.',
      address: { street: 'Mall of Lahore, Cantt', city: 'Lahore', state: 'Punjab', country: 'Pakistan' },
      bankDetails: { accountTitle: 'Glow Aura Official', accountNumber: '33445566778899', bankName: 'Standard Chartered' },
      commissionRate: 10,
      status: 'active',
      rating: 4.9,
      numReviews: 92,
      totalSales: 340000,
      totalOrders: 75,
    },
  ]);
  console.log(`Seeded ${sellers.length} verified sellers`);

  // 3. Categories
  await Category.deleteMany({});
  const categories = await Category.insertMany(
    CATS.map((c, i) => ({
      name: c.name,
      slug: c.slug,
      image: { url: c.img, key: null },
      active: true,
      sortOrder: i,
    }))
  );
  const catMap = Object.fromEntries(categories.map((c) => [c.slug, c._id]));
  console.log(`Seeded ${categories.length} categories`);

  // 4. Products with Multi-Vendor assignment and cost breakdown
  const sTech = sellers[0];
  const sFashion = sellers[1];
  const sHome = sellers[2];
  const sBeauty = sellers[3];

  const rawProducts = [
    // TechZone Products
    {
      name: 'Apple iPhone 15 Pro Max (256GB Natural Titanium)',
      slug: 'apple-iphone-15-pro-max-256gb',
      brand: 'Apple',
      category: catMap['mobiles'],
      seller: sTech._id,
      sellerName: sTech.storeName,
      sellerSlug: sTech.storeSlug,
      price: 435000,
      oldPrice: 465000,
      costs: { purchase: 395000, delivery: 500, packaging: 300, tax: 2000, other: 0 },
      stock: 15,
      sku: 'APL-IP15PM-256',
      rating: 4.9,
      numReviews: 128,
      sold: 45,
      labels: ['featured', 'hot', 'best'],
      image: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=700&auto=format&fit=crop&q=80',
      images: [
        { url: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=700&auto=format&fit=crop&q=80', key: null },
        { url: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=700&auto=format&fit=crop&q=80', key: null },
      ],
      shortDescription: 'Flagship Apple iPhone with A17 Pro chip, Grade 5 Titanium design, and 5x optical zoom camera.',
      description: 'The iPhone 15 Pro Max is forged in titanium and features the groundbreaking Apple A17 Pro chip, a customizable Action button, and the most powerful iPhone camera system ever.',
      bullets: ['A17 Pro chip with 6-core GPU', 'Titanium design with textured matte glass back', '48MP Main camera with 5x Telephoto', 'Super Retina XDR OLED Display with ProMotion 120Hz', 'USB-C with USB 3 speeds up to 10Gb/s'],
      specifications: [{ key: 'Storage', value: '256GB' }, { key: 'RAM', value: '8GB' }, { key: 'Battery', value: '4422 mAh' }, { key: 'Warranty', value: '1 Year Apple Official' }],
      variants: [{ name: 'Color', options: ['Natural Titanium', 'Blue Titanium', 'Black Titanium', 'White Titanium'] }],
    },
    {
      name: 'Sony WH-1000XM5 Wireless Noise-Canceling Headphones',
      slug: 'sony-wh-1000xm5-wireless-headphones',
      brand: 'Sony',
      category: catMap['electronics'],
      seller: sTech._id,
      sellerName: sTech.storeName,
      sellerSlug: sTech.storeSlug,
      price: 89500,
      oldPrice: 99000,
      costs: { purchase: 74000, delivery: 300, packaging: 150, tax: 500, other: 0 },
      stock: 24,
      sku: 'SNY-WH1000XM5-BLK',
      rating: 4.8,
      numReviews: 95,
      sold: 38,
      labels: ['best', 'sale'],
      image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=700&auto=format&fit=crop&q=80',
      images: [{ url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=700&auto=format&fit=crop&q=80', key: null }],
      shortDescription: 'Industry-leading noise cancellation with two processors and 8 microphones for crystal clear audio.',
      description: 'The Sony WH-1000XM5 headphones rewrite the rules for distraction-free listening with industry-leading noise cancelation and magnificent high-resolution sound quality.',
      bullets: ['Industry-leading noise canceling with Auto NC Optimizer', 'Up to 30-hour battery life with quick charging', 'Ultra-comfortable, lightweight design in soft fit leather', 'Multipoint connection allows swift device switching'],
      specifications: [{ key: 'Battery Life', value: '30 Hours' }, { key: 'Bluetooth', value: '5.2' }, { key: 'Weight', value: '250g' }],
    },
    {
      name: 'Samsung Galaxy Watch 6 Classic (47mm Bluetooth)',
      slug: 'samsung-galaxy-watch-6-classic-47mm',
      brand: 'Samsung',
      category: catMap['watches'],
      seller: sTech._id,
      sellerName: sTech.storeName,
      sellerSlug: sTech.storeSlug,
      price: 68000,
      oldPrice: 75000,
      costs: { purchase: 56000, delivery: 250, packaging: 100, tax: 400, other: 0 },
      stock: 18,
      sku: 'SAM-GW6C-47MM',
      rating: 4.7,
      numReviews: 64,
      sold: 29,
      labels: ['hot'],
      image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=700&auto=format&fit=crop&q=80',
      images: [{ url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=700&auto=format&fit=crop&q=80', key: null }],
      shortDescription: 'Timeless stainless steel smartwatch with rotating bezel and advanced health tracking.',
      description: 'Galaxy Watch6 Classic features a slim rotating bezel, larger display, and comprehensive sleep coaching and ECG heart health monitoring.',
      bullets: ['Rotating physical bezel', 'Advanced Sleep Coaching & ECG', 'Sapphire Crystal glass display', 'Water resistant 5ATM + IP68'],
      specifications: [{ key: 'Size', value: '47mm' }, { key: 'Display', value: 'Super AMOLED' }, { key: 'Waterproof', value: '50m' }],
    },
    {
      name: 'MacBook Air 15-inch M3 Chip (16GB / 512GB SSD)',
      slug: 'macbook-air-15-inch-m3-chip-512gb',
      brand: 'Apple',
      category: catMap['laptops'],
      seller: sTech._id,
      sellerName: sTech.storeName,
      sellerSlug: sTech.storeSlug,
      price: 385000,
      oldPrice: 410000,
      costs: { purchase: 345000, delivery: 600, packaging: 400, tax: 1500, other: 0 },
      stock: 8,
      sku: 'APL-MBA15-M3-512',
      rating: 4.9,
      numReviews: 76,
      sold: 21,
      labels: ['featured', 'best'],
      image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=700&auto=format&fit=crop&q=80',
      images: [{ url: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=700&auto=format&fit=crop&q=80', key: null }],
      shortDescription: 'Impossibly thin and fast 15-inch Liquid Retina display laptop powered by Apple M3 silicon.',
      description: 'With a spacious 15.3-inch Liquid Retina display, the M3 chip brings even greater capabilities to the world’s most popular laptop, with up to 18 hours of battery life.',
      bullets: ['Apple M3 8-core CPU with 10-core GPU', '15.3-inch Liquid Retina display with 500 nits', 'Up to 18 hours battery life', '1080p FaceTime HD camera & 6-speaker sound system'],
      specifications: [{ key: 'Processor', value: 'Apple M3' }, { key: 'Memory', value: '16GB Unified' }, { key: 'Storage', value: '512GB SSD' }],
    },

    // Urban Vogue Fashion Products
    {
      name: 'Premium Bomber Leather Jacket (Midnight Black)',
      slug: 'premium-bomber-leather-jacket-black',
      brand: 'Urban Vogue',
      category: catMap['fashion'],
      seller: sFashion._id,
      sellerName: sFashion.storeName,
      sellerSlug: sFashion.storeSlug,
      price: 14500,
      oldPrice: 19500,
      costs: { purchase: 8500, delivery: 200, packaging: 150, tax: 100, other: 0 },
      stock: 35,
      sku: 'UV-BMB-JKT-BLK',
      rating: 4.8,
      numReviews: 42,
      sold: 55,
      labels: ['hot', 'sale'],
      image: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=700&auto=format&fit=crop&q=80',
      images: [{ url: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=700&auto=format&fit=crop&q=80', key: null }],
      shortDescription: 'Handcrafted genuine lambskin leather bomber jacket with satin lining and heavy-duty YKK zippers.',
      description: 'A timeless silhouette tailored for modern style. Crafted from soft, durable premium genuine leather that ages gracefully over time.',
      bullets: ['100% genuine lambskin leather', 'Durable YKK brass metal zippers', 'Ribbed cuffs and waistband', 'Interior dual stash pockets'],
      specifications: [{ key: 'Material', value: 'Genuine Leather' }, { key: 'Fit', value: 'Regular Fit' }, { key: 'Care', value: 'Specialist Leather Clean' }],
      sizes: [{ label: 'Small', price: 14500 }, { label: 'Medium', price: 14500 }, { label: 'Large', price: 14500 }, { label: 'XL', price: 15500 }],
    },
    {
      name: 'Nike Air Max 270 React Running Sneakers',
      slug: 'nike-air-max-270-react-sneakers',
      brand: 'Nike',
      category: catMap['fashion'],
      seller: sFashion._id,
      sellerName: sFashion.storeName,
      sellerSlug: sFashion.storeSlug,
      price: 26500,
      oldPrice: 32000,
      costs: { purchase: 18500, delivery: 250, packaging: 100, tax: 200, other: 0 },
      stock: 28,
      sku: 'NKE-AM270-WHT',
      rating: 4.9,
      numReviews: 68,
      sold: 49,
      labels: ['featured', 'best'],
      image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=700&auto=format&fit=crop&q=80',
      images: [{ url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=700&auto=format&fit=crop&q=80', key: null }],
      shortDescription: 'Iconic max air unit in the heel delivers unrivaled all-day comfort with lightweight foam response.',
      description: 'Nike Air Max 270 React brings artistic flair to sportswear with layered materials and bold color contrasts backed by the largest heel Air unit.',
      bullets: ['Max Air 270 unit delivers all-day cushion', 'Nike React foam for a smooth, responsive ride', 'Woven and synthetic fabric upper', 'Rubber outsole with durable traction'],
      sizes: [{ label: 'US 8', price: 26500 }, { label: 'US 9', price: 26500 }, { label: 'US 10', price: 26500 }, { label: 'US 11', price: 26500 }],
    },
    {
      name: 'Heavyweight Oversized Cotton Hoodie (Oatmeal Beige)',
      slug: 'heavyweight-oversized-cotton-hoodie-beige',
      brand: 'Urban Vogue',
      category: catMap['fashion'],
      seller: sFashion._id,
      sellerName: sFashion.storeName,
      sellerSlug: sFashion.storeSlug,
      price: 5490,
      oldPrice: 7500,
      costs: { purchase: 2800, delivery: 150, packaging: 80, tax: 50, other: 0 },
      stock: 45,
      sku: 'UV-OVS-HD-BGE',
      rating: 4.7,
      numReviews: 38,
      sold: 82,
      labels: ['sale'],
      image: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=700&auto=format&fit=crop&q=80',
      images: [{ url: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=700&auto=format&fit=crop&q=80', key: null }],
      shortDescription: '450 GSM luxury brushed fleece hoodie with double-layer hood and kangaroo pouch.',
      description: 'Crafted from ultra-soft 450 GSM organic French terry fleece, tailored for a clean relaxed aesthetic.',
      bullets: ['450 GSM 100% Combed Cotton', 'Pre-shrunk fabric to preserve fit', 'Kangaroo pocket with reinforced stitching', 'Double-lined deep hood'],
      sizes: [{ label: 'Small', price: 5490 }, { label: 'Medium', price: 5490 }, { label: 'Large', price: 5490 }, { label: 'XL', price: 5490 }],
    },

    // Apex Living & Home Products
    {
      name: 'Ninja Professional 1000W Countertop Blender',
      slug: 'ninja-professional-1000w-blender',
      brand: 'Ninja',
      category: catMap['home'],
      seller: sHome._id,
      sellerName: sHome.storeName,
      sellerSlug: sHome.storeSlug,
      price: 28500,
      oldPrice: 34000,
      costs: { purchase: 21000, delivery: 400, packaging: 200, tax: 250, other: 0 },
      stock: 20,
      sku: 'NJA-BL610-1000W',
      rating: 4.8,
      numReviews: 54,
      sold: 33,
      labels: ['best', 'featured'],
      image: 'https://images.unsplash.com/photo-1570222094114-d054a817e56b?w=700&auto=format&fit=crop&q=80',
      images: [{ url: 'https://images.unsplash.com/photo-1570222094114-d054a817e56b?w=700&auto=format&fit=crop&q=80', key: null }],
      shortDescription: '1000 watts of professional performance power to crush ice, whole fruits, and frozen veggies in seconds.',
      description: 'The Ninja Professional Blender features Total Crushing technology with 6-blade assembly to pulverize ice into snow for smoothies and frozen drinks.',
      bullets: ['1000-watt motor base', '72 oz. Total Crushing Pitcher', 'BPA-free & dishwasher-safe parts', '3 Speeds, Pulse & Single Serve functions'],
      specifications: [{ key: 'Power', value: '1000 Watts' }, { key: 'Capacity', value: '72 oz (2.1 Liters)' }, { key: 'Voltage', value: '220-240V' }],
    },
    {
      name: 'Philips XXL Digital Smart Air Fryer (7.2L Capacity)',
      slug: 'philips-xxl-digital-smart-air-fryer',
      brand: 'Philips',
      category: catMap['home'],
      seller: sHome._id,
      sellerName: sHome.storeName,
      sellerSlug: sHome.storeSlug,
      price: 49500,
      oldPrice: 58000,
      costs: { purchase: 38000, delivery: 500, packaging: 300, tax: 400, other: 0 },
      stock: 14,
      sku: 'PHL-AF-XXL-72L',
      rating: 4.9,
      numReviews: 72,
      sold: 41,
      labels: ['hot', 'sale'],
      image: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=700&auto=format&fit=crop&q=80',
      images: [{ url: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=700&auto=format&fit=crop&q=80', key: null }],
      shortDescription: 'Twin TurboStar technology removes fat from food while frying with little to no added oil.',
      description: 'Cook for the whole family with 7.2L family-sized capacity, digital touch screen presets, and Fat Removal technology for crispy, healthy meals.',
      bullets: ['Rapid Air Technology with 90% less fat', 'Digital display with 7 preset cooking programs', 'QuickClean basket with non-stick mesh', 'Automatic shut-off & keep warm function'],
      specifications: [{ key: 'Capacity', value: '7.2 Liters / 1.4kg' }, { key: 'Power', value: '2225W' }, { key: 'Warranty', value: '2 Years Official' }],
    },

    // Glow & Aura Beauty Products
    {
      name: 'The Ordinary Niacinamide 10% + Zinc 1% (60ml)',
      slug: 'the-ordinary-niacinamide-10-zinc-1-60ml',
      brand: 'The Ordinary',
      category: catMap['beauty'],
      seller: sBeauty._id,
      sellerName: sBeauty.storeName,
      sellerSlug: sBeauty.storeSlug,
      price: 3250,
      oldPrice: 3950,
      costs: { purchase: 1950, delivery: 100, packaging: 50, tax: 30, other: 0 },
      stock: 50,
      sku: 'ORD-NIA-60ML',
      rating: 4.8,
      numReviews: 140,
      sold: 110,
      labels: ['best', 'hot'],
      image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=700&auto=format&fit=crop&q=80',
      images: [{ url: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=700&auto=format&fit=crop&q=80', key: null }],
      shortDescription: 'High-strength vitamin and mineral blemish formula to reduce sebum congestion and even skin tone.',
      description: 'Niacinamide (Vitamin B3) is indicated to reduce the appearance of skin blemishes and congestion, supported by Zinc salt of pyrrolidone carboxylic acid.',
      bullets: ['10% Niacinamide + 1% Zinc PCA', 'Balances oil activity and minimizes pores', 'Improves skin smoothness and barrier strength', 'Cruelty-free and vegan formulation'],
      specifications: [{ key: 'Volume', value: '60ml' }, { key: 'Skin Type', value: 'All Skin Types / Oily' }, { key: 'Made In', value: 'Canada' }],
    },
    {
      name: 'Dior Sauvage Eau De Parfum (100ml For Men)',
      slug: 'dior-sauvage-eau-de-parfum-100ml',
      brand: 'Dior',
      category: catMap['beauty'],
      seller: sBeauty._id,
      sellerName: sBeauty.storeName,
      sellerSlug: sBeauty.storeSlug,
      price: 42000,
      oldPrice: 48000,
      costs: { purchase: 32000, delivery: 300, packaging: 200, tax: 350, other: 0 },
      stock: 16,
      sku: 'DIR-SVG-EDP-100',
      rating: 4.9,
      numReviews: 89,
      sold: 62,
      labels: ['featured', 'best'],
      image: 'https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=700&auto=format&fit=crop&q=80',
      images: [{ url: 'https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=700&auto=format&fit=crop&q=80', key: null }],
      shortDescription: 'Noble and powerful fragrance blend of Calabrian bergamot, sensual Papua vanilla, and spicy amberwood.',
      description: 'Dior Sauvage Eau de Parfum radiates sensual and mysterious facets. Calabrian bergamot adds a juicy, peppery freshness enveloped in smoky accents of vanilla absolute.',
      bullets: ['100% Original Authentic Import', 'Top notes: Calabrian Bergamot, Pepper', 'Heart notes: Sichuan Pepper, Lavender, Pink Pepper', 'Base notes: Ambroxan, Cedar, Labdanum, Vanilla'],
      specifications: [{ key: 'Concentration', value: 'Eau de Parfum (EDP)' }, { key: 'Volume', value: '100ml' }, { key: 'Origin', value: 'France' }],
    },
  ];

  await Product.deleteMany({});
  const seededProducts = await Product.insertMany(rawProducts);
  console.log(`Seeded ${seededProducts.length} multi-vendor products`);

  // 5. Shipping methods
  await ShippingMethod.deleteMany({});
  await ShippingMethod.insertMany([
    { name: 'Amazon Prime Express Delivery', description: 'Next-day fast delivery across major cities', cost: 199, etaText: '1-2 business days', active: true, sortOrder: 0 },
    { name: 'Standard Nationwide Delivery', description: 'Reliable doorstep delivery nationwide', cost: 0, etaText: '3-5 business days', active: true, sortOrder: 1 },
    { name: 'Same Day Express Delivery', description: 'Order before 2 PM for same day delivery in Lahore, Karachi, Islamabad', cost: 350, etaText: 'Today Evening', active: true, sortOrder: 2 },
  ]);

  // 6. Discounts / Coupons
  await Discount.deleteMany({});
  await Discount.insertMany([
    { name: 'Welcome Deal 15% OFF', code: 'AMAZON15', type: 'percentage', value: 15, scope: 'all', active: true },
    { name: 'Mega Flash Sale 25% OFF', code: 'MEGA25', type: 'percentage', value: 25, scope: 'all', minPurchase: 5000, active: true },
    { name: 'Free Express Shipping', code: 'FREESHIP', type: 'free_shipping', scope: 'all', minPurchase: 3000, active: true },
  ]);

  // 7. Seed Orders
  await Order.deleteMany({});
  const sampleOrders = [
    {
      orderNumber: 'ORD-1001',
      seller: sTech._id,
      placedBy: 'customer',
      contact: { email: 'customer@gmail.com', phone: '+92 300 9988776' },
      shippingAddress: { fullName: 'Ahmad Khan', street: 'House 42, Street 8, Phase 5, DHA', city: 'Lahore', state: 'Punjab', postalCode: '54000', country: 'Pakistan' },
      shipping: { name: 'Amazon Prime Express Delivery', cost: 199, eta: '1-2 business days' },
      items: [
        {
          product: seededProducts[1]._id,
          seller: sTech._id,
          sellerName: sTech.storeName,
          name: seededProducts[1].name,
          image: seededProducts[1].image,
          price: seededProducts[1].price,
          costPrice: seededProducts[1].costs.purchase,
          qty: 1,
          itemStatus: 'delivered',
          trackingNumber: 'TRK-98214-PK',
        },
      ],
      subtotal: 89500,
      total: 89699,
      paymentMethod: 'credit_card',
      paymentStatus: 'paid',
      status: 'delivered',
      createdAt: new Date(Date.now() - 4 * 86400000),
    },
    {
      orderNumber: 'ORD-1002',
      seller: sFashion._id,
      placedBy: 'customer',
      contact: { email: 'bilal.customer@yahoo.com', phone: '+92 321 8877665' },
      shippingAddress: { fullName: 'Bilal Siddiqui', street: 'Apartment 4B, Clifton Block 2', city: 'Karachi', state: 'Sindh', postalCode: '75600', country: 'Pakistan' },
      shipping: { name: 'Standard Nationwide Delivery', cost: 0, eta: '3-5 business days' },
      items: [
        {
          product: seededProducts[4]._id,
          seller: sFashion._id,
          sellerName: sFashion.storeName,
          name: seededProducts[4].name,
          image: seededProducts[4].image,
          price: seededProducts[4].price,
          costPrice: seededProducts[4].costs.purchase,
          qty: 1,
          itemStatus: 'shipped',
          trackingNumber: 'TRK-77192-PK',
        },
      ],
      subtotal: 14500,
      total: 14500,
      paymentMethod: 'cod',
      paymentStatus: 'pending',
      status: 'shipped',
      createdAt: new Date(Date.now() - 2 * 86400000),
    },
    {
      orderNumber: 'ORD-1003',
      seller: sHome._id,
      placedBy: 'admin',
      placedByAdminName: 'Super Admin (Owner)',
      contact: { email: 'tariq.home@gmail.com', phone: '+92 333 1122445' },
      shippingAddress: { fullName: 'Tariq Mehmood', street: 'Sector F-7/2, House 15', city: 'Islamabad', state: 'Federal', postalCode: '44000', country: 'Pakistan' },
      shipping: { name: 'Standard Nationwide Delivery', cost: 0, eta: '3-5 business days' },
      items: [
        {
          product: seededProducts[7]._id,
          seller: sHome._id,
          sellerName: sHome.storeName,
          name: seededProducts[7].name,
          image: seededProducts[7].image,
          price: seededProducts[7].price,
          costPrice: seededProducts[7].costs.purchase,
          qty: 1,
          itemStatus: 'processing',
        },
      ],
      subtotal: 28500,
      total: 28500,
      paymentMethod: 'cod',
      paymentStatus: 'pending',
      status: 'processing',
      adminNotes: 'Order manually placed by Admin for corporate client',
      createdAt: new Date(Date.now() - 1 * 86400000),
    },
    {
      orderNumber: 'ORD-1004',
      seller: sBeauty._id,
      placedBy: 'customer',
      contact: { email: 'ayesha.beauty@gmail.com', phone: '+92 312 3344556' },
      shippingAddress: { fullName: 'Ayesha Raza', street: 'Gulberg III, Street 12', city: 'Lahore', state: 'Punjab', postalCode: '54660', country: 'Pakistan' },
      shipping: { name: 'Amazon Prime Express Delivery', cost: 199, eta: '1-2 business days' },
      items: [
        {
          product: seededProducts[10]._id,
          seller: sBeauty._id,
          sellerName: sBeauty.storeName,
          name: seededProducts[10].name,
          image: seededProducts[10].image,
          price: seededProducts[10].price,
          costPrice: seededProducts[10].costs.purchase,
          qty: 1,
          itemStatus: 'processing',
        },
      ],
      subtotal: 42000,
      total: 42199,
      paymentMethod: 'credit_card',
      paymentStatus: 'paid',
      status: 'processing',
      createdAt: new Date(),
    },
  ];
  await Order.insertMany(sampleOrders);
  console.log(`Seeded ${sampleOrders.length} multi-vendor orders`);

  // 8. Support Chat Conversations between Sellers and Admin
  await Conversation.deleteMany({});
  await Message.deleteMany({});

  const chat1 = new Conversation({
    seller: sTech._id,
    storeName: sTech.storeName,
    sellerName: sTech.ownerName,
    sellerEmail: sTech.email,
    sellerPhone: sTech.phone,
    subject: 'Bulk Inventory Approval for iPhone 15 Pro Max',
    status: 'open',
    priority: 'high',
    lastMessage: 'Hello Admin, we just restocked 15 more units of iPhone 15 Pro Max. Please verify our inventory.',
    lastSender: 'seller',
    lastAt: new Date(Date.now() - 3600000),
    unreadForAdmin: 1,
    unreadForSeller: 0,
  });
  await chat1.save();

  await Message.insertMany([
    {
      conversation: chat1._id,
      seller: sTech._id,
      sender: 'seller',
      senderName: sTech.storeName,
      text: 'Salam Admin team, we want to inquire about the weekly payout settlement schedule.',
      createdAt: new Date(Date.now() - 7200000),
    },
    {
      conversation: chat1._id,
      seller: sTech._id,
      sender: 'admin',
      senderName: 'Sara Khan (Support Lead)',
      text: 'Waleikum Assalam Hamza! Weekly vendor payouts are processed every Monday directly to your registered Meezan Bank account.',
      createdAt: new Date(Date.now() - 5400000),
    },
    {
      conversation: chat1._id,
      seller: sTech._id,
      sender: 'seller',
      senderName: sTech.storeName,
      text: 'Hello Admin, we just restocked 15 more units of iPhone 15 Pro Max. Please verify our inventory.',
      createdAt: new Date(Date.now() - 3600000),
    },
  ]);

  const chat2 = new Conversation({
    seller: sFashion._id,
    storeName: sFashion.storeName,
    sellerName: sFashion.ownerName,
    sellerEmail: sFashion.email,
    sellerPhone: sFashion.phone,
    subject: 'Winter Collection Promo & Flash Sale Participation',
    status: 'open',
    priority: 'normal',
    lastMessage: 'Sure Ayesha, we have added your leather jackets to the Mega Flash Sale banner!',
    lastSender: 'admin',
    lastAt: new Date(Date.now() - 1800000),
    unreadForAdmin: 0,
    unreadForSeller: 1,
  });
  await chat2.save();

  await Message.insertMany([
    {
      conversation: chat2._id,
      seller: sFashion._id,
      sender: 'seller',
      senderName: sFashion.storeName,
      text: 'Hi Admin, can our leather jackets be featured on the homepage 25% OFF banner for this weekend?',
      createdAt: new Date(Date.now() - 3600000),
    },
    {
      conversation: chat2._id,
      seller: sFashion._id,
      sender: 'admin',
      senderName: 'Super Admin (Owner)',
      text: 'Sure Ayesha, we have added your leather jackets to the Mega Flash Sale banner!',
      createdAt: new Date(Date.now() - 1800000),
    },
  ]);
  console.log('Seeded Seller-Admin support chat threads');

  // 9. Site Content & Settings
  const SITE_CONTENT = {
    topbar: {
      welcome: 'Welcome to Amazon Global Marketplace — Pakistan’s Premier Multi-Vendor Store',
      promos: [
        { icon: 'badgeCheck', text: '100% Genuine Verified Sellers' },
        { icon: 'truck', text: 'Amazon Prime 1-2 Day Express Delivery' },
        { icon: 'banknote', text: 'Cash on Delivery & Secure Cards' },
        { icon: 'refresh', text: 'Easy 14-Day Hassle-Free Returns' },
      ],
    },
    logo: { script: 'Amazon', name: 'MARKETPLACE', tagline: 'Earth’s Biggest Selection' },
    hero: {
      slides: [
        {
          a: 'Mega Electronics &',
          b: 'Flagship Mobiles',
          sub: 'Explore Top Verified Sellers with Prime Express Delivery across Pakistan',
          badge: 'Up to 35% OFF',
          imgs: [
            'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600&auto=format&fit=crop&q=80',
          ],
        },
        {
          a: 'Urban Fashion &',
          b: 'Winter Streetwear',
          sub: 'Genuine Leather, Sneakers, Hoodies & Apparel from Top Verified Boutiques',
          badge: 'New Season Deals',
          imgs: [
            'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=600&auto=format&fit=crop&q=80',
          ],
        },
      ],
      features: [
        { icon: 'badgeCheck', l1: '100% Genuine', l2: 'Verified Sellers' },
        { icon: 'truck', l1: 'Express Prime', l2: '1-2 Day Dispatch' },
        { icon: 'shield', l1: 'Buyer Protection', l2: 'Money Back Guarantee' },
        { icon: 'headset', l1: '24/7 Support', l2: 'Live Chat Support' },
      ],
      button: 'EXPLORE DEALS',
    },
    sections: {
      categoriesTitle: 'BROWSE BY CATEGORIES',
      featuredTitle: 'TOP DEALS & BEST SELLERS',
      brandsTitle: 'POPULAR VERIFIED SELLERS & BRANDS',
    },
  };

  await setSetting('payments', {
    cod: { enabled: true },
    credit_card: { enabled: true },
    debit_card: { enabled: true },
    easypaisa: { enabled: true },
    jazzcash: { enabled: true },
  });
  await setSetting('store', { taxRate: 5, lowStockThreshold: 5 });
  await setSetting('siteContent', SITE_CONTENT);

  await Counter.updateOne({ _id: 'order' }, { $setOnInsert: { seq: 1005 } }, { upsert: true });

  console.log('Amazon Multi-Vendor Marketplace seed completed successfully!');
}

// If invoked directly from command line (node src/seed.js)
if (process.argv[1]?.endsWith('seed.js')) {
  let mongoUri = process.env.MONGO_URI;
  if (!mongoUri || mongoUri.includes('<db_username>')) {
    mongoUri = 'mongodb://127.0.0.1:27017/amazon_ecommerce';
  }
  mongoose
    .connect(mongoUri)
    .then(async () => {
      await runSeed();
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch(async (e) => {
      console.warn('Seed connection error:', e.message);
      process.exit(0);
    });
}
