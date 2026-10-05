import 'dotenv/config';
import mongoose from 'mongoose';
import TreasuryProduct from './models/TreasuryProduct.js';
import Category from './models/Category.js';

const DEFAULT_ATLAS_URI = 'mongodb+srv://aizazkhan6241_db_user:98av24298@cluster0.ijpphlb.mongodb.net/bazario?retryWrites=true&w=majority&appName=Cluster0';
let mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || DEFAULT_ATLAS_URI;
if (!mongoUri || mongoUri.includes('<db_username>') || mongoUri.includes('<db_password>') || mongoUri.includes('aizaz6241_db_user:') || mongoUri.includes('u2IODhWhiXehEOy8')) {
  mongoUri = DEFAULT_ATLAS_URI;
}

// 1. Categories to ensure exist in the database (safely with $setOnInsert)
export const NEW_CATEGORIES = [
  { name: 'Toys & Games', slug: 'toys', icon: 'gift', image: { url: 'https://images.unsplash.com/photo-1558060370-d644479cb6f7?w=600&auto=format&fit=crop&q=80', key: null }, sortOrder: 9 },
  { name: 'Kitchen & Dining', slug: 'kitchen', icon: 'package', image: { url: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=600&auto=format&fit=crop&q=80', key: null }, sortOrder: 10 },
  { name: 'Home Decor & Living', slug: 'home-decor', icon: 'home', image: { url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop&q=80', key: null }, sortOrder: 11 },
  { name: 'Mobile Accessories', slug: 'mobile-accessories', icon: 'phone', image: { url: 'https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=600&auto=format&fit=crop&q=80', key: null }, sortOrder: 12 },
  { name: 'Clothes & Apparel', slug: 'clothing', icon: 'sparkle', image: { url: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=600&auto=format&fit=crop&q=80', key: null }, sortOrder: 13 },
  { name: 'Shoes & Footwear', slug: 'shoes', icon: 'gift', image: { url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&auto=format&fit=crop&q=80', key: null }, sortOrder: 14 },
  { name: 'Vehicles & Automotive', slug: 'vehicles', icon: 'truck', image: { url: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600&auto=format&fit=crop&q=80', key: null }, sortOrder: 15 },
  { name: 'Baby & Kids', slug: 'baby-kids', icon: 'gift', image: { url: 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=600&auto=format&fit=crop&q=80', key: null }, sortOrder: 16 },
  { name: 'Pet Supplies', slug: 'pet-supplies', icon: 'heart', image: { url: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&auto=format&fit=crop&q=80', key: null }, sortOrder: 17 },
  { name: 'Office & Stationery', slug: 'office-supplies', icon: 'fileText', image: { url: 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=600&auto=format&fit=crop&q=80', key: null }, sortOrder: 18 },
  { name: 'Health & Wellness', slug: 'health', icon: 'shield', image: { url: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&auto=format&fit=crop&q=80', key: null }, sortOrder: 19 },
  { name: 'Outdoor, Luggage & Travel', slug: 'outdoor-travel', icon: 'mapPin', image: { url: 'https://images.unsplash.com/photo-1501555088652-021faa106b9b?w=600&auto=format&fit=crop&q=80', key: null }, sortOrder: 20 },
];

export async function ensureCategories() {
  for (const cat of NEW_CATEGORIES) {
    await Category.updateOne(
      { slug: cat.slug },
      { $setOnInsert: { name: cat.name, slug: cat.slug, image: cat.image, sortOrder: cat.sortOrder, active: true } },
      { upsert: true }
    );
  }
}
