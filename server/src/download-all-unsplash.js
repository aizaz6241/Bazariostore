import dns from 'dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}

import fs from 'fs';
import https from 'https';
import { BATCH_8_PRODUCTS } from './data/batch8-part1.js';
import { BATCH_8_PART2_PRODUCTS } from './data/batch8-part2.js';

const dir = 'C:/Users/aizaz/.gemini/antigravity/brain/a7ea40cf-bf14-490f-852f-112caa985dfc/scratch/unsplash_all';
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
  const all = [...BATCH_8_PRODUCTS, ...BATCH_8_PART2_PRODUCTS];
  const unsplash = all.filter(p => p.image.includes('unsplash.com'));
  console.log(`Downloading ${unsplash.length} unsplash images...`);

  const manifest = [];
  for (let i = 0; i < unsplash.length; i++) {
    const p = unsplash[i];
    const filename = `img_${String(i + 1).padStart(2, '0')}.jpg`;
    const dest = `${dir}/${filename}`;
    const cleanUrl = p.image.split('?')[0] + '?w=400';
    await download(cleanUrl, dest);
    manifest.push({
      index: i + 1,
      filename,
      currentName: p.name,
      currentCat: p.categorySlug,
      currentPrice: p.price,
      url: p.image
    });
    console.log(`Saved ${i + 1}/${unsplash.length}: ${filename} (${p.categorySlug})`);
  }

  fs.writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2));
  console.log('Done downloading all!');
}

run();
