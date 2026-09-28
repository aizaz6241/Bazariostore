import dns from 'dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}

import https from 'https';

const ids = [
  'photo-1591047139829-d91aecb6caea',
  'photo-1519689680058-324335c77eba',
  'photo-1505377059067-e285a7bac49b',
  'photo-1544126592-807ade215a0b',
  'photo-1522771739844-6a9f6d5f14af'
];

async function checkMetadata(id) {
  return new Promise((resolve) => {
    // We can fetch unsplash html and extract <title>
    const cleanId = id.replace('photo-', '');
    const url = `https://unsplash.com/photos/${cleanId}`;
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => { if (data.length < 50000) data += chunk; });
      res.on('end', () => {
        const titleMatch = data.match(/<title>([^<]+)<\/title>/i);
        resolve({ id, status: res.statusCode, title: titleMatch ? titleMatch[1] : 'No title' });
      });
    }).on('error', (err) => resolve({ id, error: err.message }));
  });
}

async function run() {
  for (const id of ids) {
    const meta = await checkMetadata(id);
    console.log(meta.id, '->', meta.title);
  }
}

run();
