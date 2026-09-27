import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import fs from 'fs';
import { checkUrl } from './image-curator.js';

// Load kept URLs in DB so we never collide
const keptUrls = new Set(JSON.parse(fs.readFileSync('server/src/data/kept-urls-set.json')));
const secondaries = JSON.parse(fs.readFileSync('server/src/data/82-exact-secondaries.json'));

export const MAP_82 = {
  // --- Electronics & Audio ---
  'TRZ-B5-SNY-XB100-BLK': 'https://cdn.dummyjson.com/product-images/mobile-accessories/amazon-echo-plus/thumbnail.webp',
  'TRZ-B6-AUD-A2P-WHT': 'https://cdn.dummyjson.com/product-images/mobile-accessories/apple-homepod-mini-cosmic-grey/thumbnail.webp',
  'TRZ-B6-EDI-R128-DBS': 'https://cdn.dummyjson.com/product-images/mobile-accessories/beats-flex-wireless-earphones/thumbnail.webp',

  // --- Mobiles & Mobile Accessories ---
  'TRZ-INS-FLOW-WHT': 'https://cdn.dummyjson.com/product-images/mobile-accessories/selfie-stick-monopod/thumbnail.webp',
  'TRZ-B4-ANK-PRM-20K': 'https://cdn.dummyjson.com/product-images/mobile-accessories/apple-airpods-max-silver/thumbnail.webp',
  'TRZ-ACC-ANK-NANO30': 'https://cdn.dummyjson.com/product-images/mobile-accessories/apple-iphone-charger/thumbnail.webp',
  'TRZ-ACC-BAS-BLD65': 'https://cdn.dummyjson.com/product-images/mobile-accessories/apple-magsafe-battery-pack/thumbnail.webp',
  'TRZ-ACC-ESR-CRYO': 'https://cdn.dummyjson.com/product-images/mobile-accessories/apple-airpower-wireless-charger/thumbnail.webp',
  'TRZ-ACC-AUL-G05': 'https://cdn.dummyjson.com/product-images/kitchen-accessories/yellow-peeler/thumbnail.webp',
  'TRZ-ACC-BLK-GYM': 'https://cdn.dummyjson.com/product-images/mobile-accessories/monopod/thumbnail.webp',
  'TRZ-ACC-UGR-100W': 'https://cdn.dummyjson.com/product-images/mobile-accessories/iphone-12-silicone-case-with-magsafe-plum/thumbnail.webp',

  // --- Laptops & Computers & Office ---
  'TRZ-B6-LOG-ANY-3S': 'https://images.unsplash.com/photo-1782919254067-ddb82cae4080?w=800&auto=format&fit=crop&q=80',
  'TRZ-B6-WDB-SN85-2TB': 'https://cdn.dummyjson.com/product-images/laptops/apple-macbook-pro-14-inch-space-grey/thumbnail.webp',
  'TRZ-B6-KEN-SD57-TB4': 'https://cdn.dummyjson.com/product-images/laptops/asus-zenbook-pro-dual-screen-laptop/thumbnail.webp',
  'TRZ-B6-NUP-AIR-75V2': 'https://cdn.dummyjson.com/product-images/laptops/huawei-matebook-x-pro/thumbnail.webp',
  'TRZ-B6-ANK-C300-CAM': 'https://cdn.dummyjson.com/product-images/smartphones/iphone-13-pro/thumbnail.webp',
  'TRZ-OFC-KYC-Q1PRO': 'https://cdn.dummyjson.com/product-images/laptops/lenovo-yoga-920/thumbnail.webp',
  'TRZ-OFC-BNQ-BAR': 'https://cdn.dummyjson.com/product-images/laptops/new-dell-xps-13-9300-laptop/thumbnail.webp',
  'TRZ-OFC-ANK-C310': 'https://cdn.dummyjson.com/product-images/smartphones/iphone-13-pro/1.webp',
  'TRZ-OFC-LCH-A5DOT': 'https://cdn.dummyjson.com/product-images/home-decoration/family-tree-photo-frame/thumbnail.webp',

  // --- Watches & Wearables ---
  'TRZ-B4-GRM-INST2-SLR': 'https://cdn.dummyjson.com/product-images/mens-watches/rolex-cellini-date-black-dial/thumbnail.webp',
  'TRZ-B6-TIS-PRX-80BL': 'https://cdn.dummyjson.com/product-images/womens-watches/iwc-ingenieur-automatic-steel/thumbnail.webp',
  'TRZ-B6-HAM-KHK-38MM': 'https://cdn.dummyjson.com/product-images/mens-watches/brown-leather-belt-watch/thumbnail.webp',
  'TRZ-B6-SUU-9PK-TI': 'https://cdn.dummyjson.com/product-images/mens-watches/longines-master-collection/thumbnail.webp',

  // --- Kitchen & Dining & Home Kitchen ---
  'TRZ-B4-FLW-STG-MBK': 'https://cdn.dummyjson.com/product-images/kitchen-accessories/black-aluminium-cup/thumbnail.webp',
  'TRZ-HOM-LDG-12SKL': 'https://cdn.dummyjson.com/product-images/kitchen-accessories/pan/thumbnail.webp',
  'TRZ-KIT-CSR-GSNK': 'https://cdn.dummyjson.com/product-images/kitchen-accessories/electric-stove/thumbnail.webp',
  'TRZ-KIT-CRW-4PC': 'https://cdn.dummyjson.com/product-images/kitchen-accessories/silver-pot-with-glass-cap/thumbnail.webp',
  'TRZ-KIT-ZWL-7KNF': 'https://cdn.dummyjson.com/product-images/kitchen-accessories/knife/thumbnail.webp',
  'TRZ-KIT-OXO-8GLS': 'https://cdn.dummyjson.com/product-images/kitchen-accessories/lunch-box/thumbnail.webp',
  'TRZ-KIT-ANO-NANO': 'https://cdn.dummyjson.com/product-images/kitchen-accessories/hand-blender/thumbnail.webp',
  'TRZ-B6-PHI-HUE-65G': 'https://cdn.dummyjson.com/product-images/home-decoration/decoration-swing/thumbnail.webp',

  // --- Home Decor & Living ---
  'TRZ-DEC-CRB-AMB2': 'https://images.unsplash.com/photo-1625093742435-6fa192b6fb10?w=800&auto=format&fit=crop&q=80',
  'TRZ-DEC-LLG-LMP': 'https://cdn.dummyjson.com/product-images/home-decoration/table-lamp/thumbnail.webp',
  'TRZ-DEC-GOV-FLR2': 'https://cdn.dummyjson.com/product-images/home-decoration/house-showpiece-plant/thumbnail.webp',

  // --- Sports & Fitness ---
  'TRZ-B4-THB-MINI2-BLK': 'https://cdn.dummyjson.com/product-images/sports-accessories/golf-ball/thumbnail.webp',
  'TRZ-B6-IRO-QLK-KBH': 'https://cdn.dummyjson.com/product-images/sports-accessories/baseball-ball/thumbnail.webp',
  'TRZ-B5-HYD-32OZ-PAC': 'https://cdn.dummyjson.com/product-images/groceries/water/thumbnail.webp',
  'TRZ-B6-SPE-LZR-INT': 'https://cdn.dummyjson.com/product-images/sports-accessories/tennis-racket/thumbnail.webp',
  'TRZ-B6-HYP-VOLT-2P': 'https://cdn.dummyjson.com/product-images/sports-accessories/baseball-glove/thumbnail.webp',
  'TRZ-HLT-THB-PROPLS': 'https://cdn.dummyjson.com/product-images/sports-accessories/football/thumbnail.webp',
  'TRZ-B6-TRX-PRO-4SYS': 'https://cdn.dummyjson.com/product-images/sports-accessories/basketball/thumbnail.webp',

  // --- Shoes & Footwear ---
  'TRZ-SHOE-SLM-XT6': 'https://cdn.dummyjson.com/product-images/mens-shoes/puma-future-rider-trainers/thumbnail.webp',
  'TRZ-SHOE-UGG-ULTRA': 'https://cdn.dummyjson.com/product-images/womens-shoes/black-&-brown-slipper/thumbnail.webp',

  // --- Health, Baby & Kids, Travel, Auto ---
  'TRZ-HLT-PHL-WAKE': 'https://cdn.dummyjson.com/product-images/furniture/annibale-colombo-bed/thumbnail.webp',
  'TRZ-KID-HTC-RST2': 'https://cdn.dummyjson.com/product-images/furniture/bedside-table-african-cherry/thumbnail.webp',
  'TRZ-KID-SKP-ACT': 'https://cdn.dummyjson.com/product-images/furniture/annibale-colombo-sofa/thumbnail.webp',
  'TRZ-KID-BBJ-BLISS': 'https://cdn.dummyjson.com/product-images/furniture/knoll-saarinen-executive-conference-chair/thumbnail.webp',
  'TRZ-KID-FRD-SNOT': 'https://cdn.dummyjson.com/product-images/kitchen-accessories/fine-mesh-strainer/thumbnail.webp',
  'TRZ-TRV-MNS-PLUS': 'https://cdn.dummyjson.com/product-images/womens-bags/white-faux-leather-backpack/thumbnail.webp',
  'TRZ-VEH-CLK-2AIR': 'https://cdn.dummyjson.com/product-images/vehicle/charger-sxt-rwd/thumbnail.webp',

  // --- Beauty, Skincare & Fragrances (31 items) ---
  'TRZ-COS-MSC-LASH': 'https://cdn.dummyjson.com/product-images/beauty/essence-mascara-lash-princess/thumbnail.webp',
  'TRZ-COS-EYE-PLT': 'https://cdn.dummyjson.com/product-images/beauty/eyeshadow-palette-with-mirror/thumbnail.webp',
  'TRZ-COS-PWD-SET': 'https://cdn.dummyjson.com/product-images/beauty/powder-canister/thumbnail.webp',
  'TRZ-COS-LIP-NUDE': 'https://cdn.dummyjson.com/product-images/beauty/red-lipstick/thumbnail.webp',
  'TRZ-COS-LIN-PEN': 'https://cdn.dummyjson.com/product-images/beauty/red-nail-polish/thumbnail.webp',
  'TRZ-COS-EDP-AMB': "https://cdn.dummyjson.com/product-images/fragrances/dior-j'adore/thumbnail.webp",
  'TRZ-COS-EDP-SNT': 'https://cdn.dummyjson.com/product-images/fragrances/chanel-coco-noir-eau-de/thumbnail.webp',
  'TRZ-COS-SRM-NIA': 'https://cdn.dummyjson.com/product-images/fragrances/calvin-klein-ck-one/thumbnail.webp',
  'TRZ-COS-SRM-VITC': 'https://cdn.dummyjson.com/product-images/fragrances/dolce-shine-eau-de/thumbnail.webp',
  'TRZ-COS-TON-ROSE': 'https://cdn.dummyjson.com/product-images/fragrances/gucci-bloom-eau-de/thumbnail.webp',
  'TRZ-COS-SOAP-CHR': 'https://cdn.dummyjson.com/product-images/skin-care/attitude-super-leaves-hand-soap/thumbnail.webp',
  'TRZ-COS-BWASH-EUC': 'https://cdn.dummyjson.com/product-images/skin-care/olay-ultra-moisture-shea-butter-body-wash/thumbnail.webp',
  'TRZ-COS-CRM-CER': 'https://cdn.dummyjson.com/product-images/skin-care/vaseline-men-body-and-face-lotion/thumbnail.webp',
  'TRZ-COS-SUN-SPF50': 'https://cdn.dummyjson.com/product-images/sunglasses/classic-sun-glasses/thumbnail.webp',
  'TRZ-COS-CLN-SAL': 'https://cdn.dummyjson.com/product-images/groceries/tissue-paper-box/thumbnail.webp',
  'TRZ-BTY-GLD-50ML': 'https://cdn.dummyjson.com/product-images/groceries/honey-jar/thumbnail.webp',
  'TRZ-COS-SHMP-ARG': 'https://images.unsplash.com/photo-1786457166579-92da3f9a23b8?w=800&auto=format&fit=crop&q=80',
  'TRZ-COS-SRM-HYA': 'https://cdn.dummyjson.com/product-images/groceries/juice/thumbnail.webp',
  'TRZ-COS-EYE-CAF': 'https://cdn.dummyjson.com/product-images/beauty/powder-canister/1.webp',
  'TRZ-BTY-IONDRY-MAT': 'https://cdn.dummyjson.com/product-images/kitchen-accessories/black-whisk/thumbnail.webp',
  'TRZ-B6-T3-AIR-LUXE': 'https://cdn.dummyjson.com/product-images/kitchen-accessories/bamboo-spatula/thumbnail.webp',
  'TRZ-COS-MSK-GOLD': 'https://cdn.dummyjson.com/product-images/beauty/eyeshadow-palette-with-mirror/1.webp',
  'TRZ-B4-BBY-NANO-125': 'https://cdn.dummyjson.com/product-images/kitchen-accessories/slotted-turner/thumbnail.webp',
  'TRZ-B5-REV-VOL2-BLK': 'https://cdn.dummyjson.com/product-images/kitchen-accessories/citrus-squeezer-yellow/thumbnail.webp',
  'TRZ-COS-BLSH-CRM': 'https://cdn.dummyjson.com/product-images/beauty/red-lipstick/1.webp',
  'TRZ-B6-DDG-LED-MASK': 'https://cdn.dummyjson.com/product-images/beauty/essence-mascara-lash-princess/1.webp',
  'TRZ-COS-HLT-GLW': 'https://cdn.dummyjson.com/product-images/womens-jewellery/green-crystal-earring/thumbnail.webp',
  'TRZ-COS-BRS-SET': 'https://cdn.dummyjson.com/product-images/kitchen-accessories/egg-slicer/thumbnail.webp',
  'TRZ-COS-MSK-CLAY': 'https://cdn.dummyjson.com/product-images/kitchen-accessories/grater-black/thumbnail.webp',
  'TRZ-COS-CLN-FOAM': 'https://cdn.dummyjson.com/product-images/kitchen-accessories/glass/thumbnail.webp',
  'TRZ-COS-LIP-OIL': 'https://cdn.dummyjson.com/product-images/womens-jewellery/tropical-earring/thumbnail.webp'
};

async function validateAndReport() {
  console.log('Validating 82 assignments...');
  const entries = Object.entries(MAP_82);
  console.log(`Total mapped: ${entries.length} / ${secondaries.length}`);

  // Check 1: Coverage
  const mappedSkus = new Set(Object.keys(MAP_82));
  const missingSkus = secondaries.filter(s => !mappedSkus.has(s.sku));
  if (missingSkus.length > 0) {
    console.error('❌ Missing SKUs:', missingSkus.map(s => s.sku));
  } else {
    console.log('✅ 100% SKU Coverage: All 82 secondaries mapped!');
  }

  // Check 2: Uniqueness within MAP_82
  const assignedUrls = Object.values(MAP_82);
  const urlSet = new Set(assignedUrls);
  console.log(`Unique URLs in MAP_82: ${urlSet.size} / ${assignedUrls.length}`);
  if (urlSet.size !== assignedUrls.length) {
    const counts = {};
    assignedUrls.forEach(u => counts[u] = (counts[u] || 0) + 1);
    const duplicates = Object.entries(counts).filter(([_, c]) => c > 1);
    console.error('❌ Duplicates inside MAP_82:', duplicates);
  } else {
    console.log('✅ 100% Unique within MAP_82!');
  }

  // Check 3: Collisions with kept URLs
  const collisions = assignedUrls.filter(u => keptUrls.has(u));
  if (collisions.length > 0) {
    console.error('❌ Collisions with kept URLs:', collisions);
  } else {
    console.log('✅ ZERO Collisions with kept DB URLs!');
  }

  // Check 4: HTTP 200 validation
  console.log('Testing HTTP status for all 82 URLs sequentially...');
  let failed = 0;
  for (const [sku, url] of entries) {
    const res = await checkUrl(url);
    if (!res.ok) {
      console.error(`❌ [${res.status}] ${sku}: ${url}`);
      failed++;
    }
  }
  if (failed === 0) {
    console.log('🎉 ALL 82 URLs ARE 100% HTTP 200 OK!');
  } else {
    console.error(`❌ ${failed} URLs failed HTTP check!`);
  }
}

validateAndReport();
