import dns from 'dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}

import fs from 'fs';
import https from 'https';

const scratchDir = 'C:/Users/aizaz/.gemini/antigravity/brain/a7ea40cf-bf14-490f-852f-112caa985dfc/scratch';
if (!fs.existsSync(scratchDir)) {
  fs.mkdirSync(scratchDir, { recursive: true });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve(dest));
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function run() {
  await download('https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400', `${scratchDir}/candidate1.jpg`);
  await download('https://images.unsplash.com/photo-1519689680058-324335c77eba?w=400', `${scratchDir}/candidate2.jpg`);
  await download('https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=400', `${scratchDir}/candidate3.jpg`);
  await download('https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=400', `${scratchDir}/candidate4.jpg`);
  console.log('Downloaded test images');
}

run();
