import dns from 'dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}

import fs from 'fs';
import https from 'https';
import { BATCH_8_PRODUCTS } from './data/batch8-part1.js';

const dir = 'C:/Users/aizaz/.gemini/antigravity/brain/a7ea40cf-bf14-490f-852f-112caa985dfc/scratch/check_part1';
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

function download(url, dest) {
  return new Promise((resolve) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve(true));
      });
    }).on('error', () => {
      resolve(false);
    });
  });
}

async function run() {
  const unsplash = BATCH_8_PRODUCTS.filter(p => p.image.includes('unsplash.com')).slice(0, 10);
  for (let i = 0; i < unsplash.length; i++) {
    const p = unsplash[i];
    const dest = `${dir}/item_${i+1}.jpg`;
    await download(`${p.image}&w=300`, dest);
    console.log(`Downloaded item ${i+1}: [${p.categorySlug}] ${p.name}`);
  }
}

run();
