import fs from 'fs';
const items = JSON.parse(fs.readFileSync('server/src/data/secondary-dupes.json'));
items.slice(0, 40).forEach((it, idx) => {
  console.log(`${idx + 1}. [${it.sku}] ${it.name} (Shared with: ${it.sharedSku} - ${it.sharedWith})`);
});
