import fs from 'fs';

const dj = JSON.parse(fs.readFileSync('server/src/data/dummyjson-products.json', 'utf8'));
const search = ['bedside-tables', 'hallway-stand', 'house-craft', 'key-holder'];

for (const s of search) {
  const found = dj.filter(p => (p.thumbnail && p.thumbnail.includes(s)) || (p.title && p.title.toLowerCase().includes(s)));
  console.log('Search for', s, 'found:', found.map(f => ({
    id: f.id,
    title: f.title,
    thumbnail: f.thumbnail,
    images: f.images
  })));
}

// Also let's list unused dummyjson products with valid image URLs
const existing = JSON.parse(fs.readFileSync('server/src/data/treasury-all-products.json', 'utf8'));
const existingImages = new Set(existing.map(p => p.image));
import { FINAL_100_PRODUCTS } from './data/batch8-final-100.js';
const batch8Images = new Set(FINAL_100_PRODUCTS.map(p => p.image));

const available = dj.filter(p => !existingImages.has(p.thumbnail) && !batch8Images.has(p.thumbnail));
console.log(`Total unused DummyJSON products available: ${available.length}`);
console.log('Categories of available:', [...new Set(available.map(p => p.category))]);
