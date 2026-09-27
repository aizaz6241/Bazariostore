import dns from 'dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}
import fs from 'fs';
import { checkUrl } from './image-curator.js';

// We load duplicate groups and broken images
const dupGroups = JSON.parse(fs.readFileSync('server/src/data/duplicate-groups.json'));
const brokenList = JSON.parse(fs.readFileSync('server/src/data/broken-images.json'));
const allProducts = JSON.parse(fs.readFileSync('server/src/data/treasury-all-products.json'));

console.log(`Loaded ${allProducts.length} total products.`);
console.log(`${dupGroups.length} duplicate groups, ${brokenList.length} broken images.`);
