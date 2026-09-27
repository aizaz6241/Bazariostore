import dns from 'dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}
import { checkUrl } from './image-curator.js';

export async function validateUrls(urls) {
  const results = {};
  // Test with concurrency limit 5
  const queue = [...urls];
  const workers = Array(5).fill(0).map(async () => {
    while (queue.length > 0) {
      const url = queue.shift();
      const res = await checkUrl(url);
      results[url] = res;
    }
  });
  await Promise.all(workers);
  return results;
}
