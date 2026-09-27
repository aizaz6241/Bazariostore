import dns from 'dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}
import https from 'https';

export function searchUnsplash(keyword) {
  return new Promise((resolve) => {
    const url = `https://unsplash.com/napi/search/photos?query=${encodeURIComponent(keyword)}&per_page=10`;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
      timeout: 8000
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const results = (json.results || []).map(r => ({
            id: r.id,
            url: r.urls?.regular ? `${r.urls.regular.split('?')[0]}?w=800&auto=format&fit=crop&q=80` : null,
            desc: r.alt_description || r.description || ''
          })).filter(r => r.url);
          resolve(results);
        } catch (e) {
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });
}

// Test with camp stove
searchUnsplash('camping stove').then(results => {
  console.log(`Found ${results.length} images for "camping stove":`);
  results.slice(0, 3).forEach(r => console.log(`  - ${r.url} (${r.desc})`));
});
