import fs from 'fs';

const dupGroups = JSON.parse(fs.readFileSync('server/src/data/duplicate-groups.json'));
const brokenList = JSON.parse(fs.readFileSync('server/src/data/broken-images.json'));
const allProducts = JSON.parse(fs.readFileSync('server/src/data/treasury-all-products.json'));

const brokenIds = new Set(brokenList.map(b => b.id));
const dupMap = new Map();
dupGroups.forEach(g => {
  g.products.forEach(p => dupMap.set(p.id, g.image));
});

console.log('--- PRODUCTS NEEDING EXACT IMAGES ---');
const items = [];
allProducts.forEach(p => {
  const isBroken = brokenIds.has(p._id);
  const isDupe = dupMap.has(p._id);
  // Also check specific mismatches
  const isMismatch = [
    'TRZ-TRV-BIO-STV2', // BioLite stove
    'TRZ-TRV-STN-40OZ', // Stanley tumbler
    'TRZ-TRV-YET-T45',  // YETI cooler
    'TRZ-HLT-DYS-NURL', // Dyson hair dryer
    'TRZ-HLT-OMR-PLAT', // Omron BP monitor
  ].includes(p.sku);

  if (isBroken || isDupe || isMismatch) {
    items.push({
      _id: p._id,
      sku: p.sku,
      name: p.name,
      brand: p.brand,
      category: p.category,
      categorySlug: p.categorySlug,
      reason: isBroken ? 'broken' : isMismatch ? 'mismatch' : 'duplicate',
      currentImage: p.image
    });
  }
});

console.log(`Total items to fix: ${items.length}`);
fs.writeFileSync('server/src/data/items-to-fix.json', JSON.stringify(items, null, 2));

// Summary by category
const catSummary = {};
items.forEach(it => {
  catSummary[it.category] = (catSummary[it.category] || 0) + 1;
});
console.log('\nBreakdown by category:');
console.log(catSummary);
