import https from 'https';

export function searchPexels(keyword) {
  return new Promise((resolve) => {
    const url = `https://www.pexels.com/search/${encodeURIComponent(keyword)}/`;
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    }, res => {
      console.log('Status:', res.statusCode);
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => {
        const matches = [...html.matchAll(/https:\/\/images\.pexels\.com\/photos\/[0-9]+\/pexels-photo-[0-9]+\.jpeg\?[^"'\\s]+/g)].map(m => m[0]);
        const cleaned = [...new Set(matches.map(u => u.split('?')[0] + '?auto=compress&cs=tinysrgb&w=800'))];
        resolve(cleaned);
      });
    }).on('error', () => resolve([]));
  });
}

searchPexels('camping stove').then(r => console.log('Found:', r.length, r.slice(0, 3)));
