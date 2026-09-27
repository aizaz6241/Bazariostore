import dns from 'dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}
import https from 'https';
import http from 'http';

export function checkUrl(url) {
  return new Promise((resolve) => {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      return resolve({ ok: false, status: 'invalid_url' });
    }
    const client = url.startsWith('https') ? https : http;
    const options = {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
      timeout: 8000
    };

    try {
      const req = client.request(url, options, (res) => {
        // We only need status and headers, destroy body to save bandwidth
        res.destroy();
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = res.headers.location.startsWith('http') 
            ? res.headers.location 
            : new URL(res.headers.location, url).href;
          return checkUrl(redirectUrl).then(resolve);
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
