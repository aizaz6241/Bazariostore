import dns from 'dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}
import fs from 'fs';
import https from 'https';
import http from 'http';

const data = JSON.parse(fs.readFileSync('server/src/data/treasury-all-products.json'));
console.log(`Checking image HTTP status for all ${data.length} products...`);

function checkUrl(url) {
  return new Promise((resolve) => {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      return resolve({ ok: false, status: 'invalid_url' });
    }
    const client = url.startsWith('https') ? https : http;
    try {
      const req = client.request(url, { method: 'HEAD', timeout: 7000 }, (res) => {
        // follow redirect once if needed
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = res.headers.location.startsWith('http') 
            ? res.headers.location 
            : new URL(res.headers.location, url).href;
          const redClient = redirectUrl.startsWith('https') ? https : http;
          const redReq = redClient.request(redirectUrl, { method: 'HEAD', timeout: 7000 }, (redRes) => {
            resolve({ ok: redRes.statusCode >= 200 && redRes.statusCode < 400, status: redRes.statusCode, finalUrl: redirectUrl });
          });
          redReq.on('error', (e) => resolve({ ok: false, status: e.message }));
          redReq.on('timeout', () => { redReq.destroy(); resolve({ ok: false, status: 'timeout' }); });
          redReq.end();
          return;
        }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode });
      });
      req.on('error', (e) => resolve({ ok: false, status: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 'timeout' }); });
      req.end();
    } catch (e) {
      resolve({ ok: false, status: e.message });
    }
  });
}

async function run() {
  const broken = [];
  const valid = [];
  
  // Batch check in chunks of 20 to avoid throttling
  const chunkSize = 20;
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map(async (p) => {
        const res = await checkUrl(p.image);
        return { product: p, res };
      })
    );
    for (const r of results) {
      if (!r.res.ok) {
        broken.push({ id: r.product._id, name: r.product.name, sku: r.product.sku, image: r.product.image, status: r.res.status });
      } else {
        valid.push(r.product._id);
      }
    }
    process.stdout.write(`Checked ${Math.min(i + chunkSize, data.length)}/${data.length}...\r`);
  }

  console.log(`\n\nResult: ${valid.length} valid images, ${broken.length} broken images.`);
  fs.writeFileSync('server/src/data/broken-images.json', JSON.stringify(broken, null, 2));
  console.log('Saved broken images list to server/src/data/broken-images.json');
}

run();
