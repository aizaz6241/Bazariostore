import dns from 'dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}

import fs from 'fs';
import https from 'https';

const scratchDir = 'C:/Users/aizaz/.gemini/antigravity/brain/a7ea40cf-bf14-490f-852f-112caa985dfc/scratch';

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
  await download('https://images.unsplash.com/photo-1618842676088-c4d48a6a7c9d?w=400', `${scratchDir}/skip_hop.jpg`);
  await download('https://images.unsplash.com/photo-1613685301918-59b1039422cc?w=400', `${scratchDir}/hatch.jpg`);
  console.log('Downloaded skip_hop and hatch images');
}

run();
