import dns from 'dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}

import fs from 'fs';
import { BATCH_8_ALL_PRODUCTS } from './data/batch8-complete-100.js';
import { validateUrls } from './batch-url-validator.js';

const existing = JSON.parse(fs.readFileSync('server/src/data/treasury-all-products.json', 'utf8'));
const existingImages = new Set(existing.map(p => p.image));
const existingSlugs = new Set(existing.map(p => p.slug));
const existingSkus = new Set(existing.map(p => p.sku));

// 1. Keep the 64 non-colliding items
const kept = BATCH_8_ALL_PRODUCTS.filter(p => !existingImages.has(p.image));
console.log(`Kept non-colliding visually verified items: ${kept.length}`);

// We need exactly 36 fresh items to reach 100.
// Let's see how many high-tier items are in kept:
const keptHighTier = kept.filter(p => p.price >= 2000).length;
const keptLowTier = kept.length - keptHighTier;
console.log(`Kept High Tier (>= $2000): ${keptHighTier}`);
console.log(`Kept Low Tier (< $2000): ${keptLowTier}`);

// Target total: 100 items. Target High Tier: 68 items (68%).
// So from the 36 replacements, we need:
// High Tier needed: 68 - keptHighTier
// Low Tier needed: 32 - keptLowTier
const highTierNeeded = 68 - keptHighTier;
const lowTierNeeded = 36 - highTierNeeded;
console.log(`Needed from 36 replacements: High Tier = ${highTierNeeded}, Low Tier = ${lowTierNeeded}`);

// 36 Fresh Hand-Crafted Products directly from unused DummyJSON items
const freshReplacements = [
  // 1. LAPTOPS (High Tier)
  {
    name: 'Apple MacBook Pro 14-Inch M3 Max (36GB Unified Memory, 1TB SSD, Space Gray)',
    slug: 'apple-macbook-pro-14-m3-max-space-gray',
    brand: 'Apple',
    categorySlug: 'laptops',
    price: 3499.00,
    costPrice: 2600.00,
    oldPrice: 3899.00,
    stock: 45,
    lowStockThreshold: 5,
    sku: 'TRZ-B8-LAP-APL-MBP14',
    image: 'https://cdn.dummyjson.com/product-images/laptops/apple-macbook-pro-14-inch-space-grey/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/laptops/apple-macbook-pro-14-inch-space-grey/thumbnail.webp', key: null }],
    shortDescription: 'Liquid Retina XDR display with ProMotion and extreme Apple M3 Max silicon horsepower.',
    description: 'The definitive pro laptop for developers and creators. Featuring an advanced 14-core CPU, 30-core GPU, 36GB unified memory, Liquid Retina XDR display with 1,000 nits sustained brightness, and up to 18 hours of battery life.',
    bullets: [
      'Apple M3 Max 14-core CPU and 30-core GPU delivers unmatched performance per watt',
      '14.2-inch Liquid Retina XDR display with 1,000,000:1 contrast ratio and ProMotion 120Hz',
      'Unified 36GB high-bandwidth memory for multi-app professional workflows and 3D rendering',
      'Three Thunderbolt 4 ports, HDMI port, SDXC card slot, headphone jack, and MagSafe 3'
    ],
    specifications: [
      { key: 'Processor', value: 'Apple M3 Max (14-core CPU / 30-core GPU)' },
      { key: 'Memory', value: '36GB Unified Memory' },
      { key: 'Storage', value: '1TB Ultra-Fast NVMe SSD' },
      { key: 'Display', value: '14.2\" Liquid Retina XDR (3024 x 1964)' }
    ],
    labels: ['featured', 'best'],
    tags: ['macbook pro', 'apple', 'm3 max', 'laptop', 'pro computer']
  },
  {
    name: 'Huawei MateBook X Pro 14.2-Inch 3.1K Touchscreen Ultrabook (Core i7, 16GB, 1TB, Space Gray)',
    slug: 'huawei-matebook-x-pro-touchscreen-ultrabook',
    brand: 'Huawei',
    categorySlug: 'laptops',
    price: 2350.00,
    costPrice: 1650.00,
    oldPrice: 2600.00,
    stock: 60,
    lowStockThreshold: 8,
    sku: 'TRZ-B8-LAP-HUA-MBX',
    image: 'https://cdn.dummyjson.com/product-images/laptops/huawei-matebook-x-pro/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/laptops/huawei-matebook-x-pro/thumbnail.webp', key: null }],
    shortDescription: 'Ultra-slim CNC magnesium alloy flagship laptop with 3.1K Real Color FullView touch display.',
    description: 'Elegance meets executive power. Weighing just 1.26kg with a skin-soothing metallic body, 13th Gen Intel Core processor, 3.1K 90Hz Real Color touchscreen, and 6-speaker acoustic setup.',
    bullets: [
      '14.2-inch 3.1K (3120 x 2080) LTPS touchscreen with 90Hz refresh and Delta E < 1 accuracy',
      'Micro-arc oxidation CNC magnesium alloy body feels exceptionally silky and weighs only 1.26kg',
      'Super Turbo performance architecture dynamically allocates CPU resources for zero lag',
      'Huawei Sound 6-speaker array with split-frequency setup for immersive cinematic acoustics'
    ],
    specifications: [
      { key: 'Display', value: '14.2\" 3.1K Real Color Touchscreen' },
      { key: 'Weight', value: '1.26 kg (2.77 lbs)' },
      { key: 'CPU', value: 'Intel Core i7 Evo Platform' }
    ],
    labels: ['trending'],
    tags: ['huawei', 'matebook', 'ultrabook', 'touchscreen', 'laptop']
  },
  {
    name: 'Asus ZenBook Pro Duo 15 OLED Dual-Screen Workstation Laptop',
    slug: 'asus-zenbook-pro-duo-15-oled-dual-screen',
    brand: 'Asus',
    categorySlug: 'laptops',
    price: 3650.00,
    costPrice: 2550.00,
    oldPrice: 4100.00,
    stock: 35,
    lowStockThreshold: 4,
    sku: 'TRZ-B8-LAP-ASU-DUO15',
    image: 'https://cdn.dummyjson.com/product-images/laptops/asus-zenbook-pro-dual-screen-laptop/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/laptops/asus-zenbook-pro-dual-screen-laptop/thumbnail.webp', key: null }],
    shortDescription: '15.6-inch 4K OLED main touchscreen paired with tilting secondary 4K ScreenPad Plus.',
    description: 'The futuristic dual-screen powerhouse for video editors, music producers, and 3D animators. Features a breathtaking 4K OLED HDR NanoEdge primary display and an auto-tilting full-width secondary touchscreen.',
    bullets: [
      'Primary 15.6-inch 4K UHD (3840 x 2160) OLED HDR touchscreen with 100% DCI-P3 color gamut',
      'Tilting 14-inch 4K ScreenPad Plus secondary touchscreen elevates 9.5 degrees for optimal ergonomics',
      'NVIDIA GeForce RTX graphics and Intel Core i9 processor tackle heavy rendering with ease',
      'ErgoLift AAS Plus thermal cooling system enhances airflow by 36% during peak rendering'
    ],
    specifications: [
      { key: 'Main Display', value: '15.6\" 4K OLED HDR Touchscreen' },
      { key: 'Secondary Display', value: '14\" 4K ScreenPad Plus (3840 x 1100)' },
      { key: 'GPU', value: 'NVIDIA GeForce RTX Studio Edition' }
    ],
    labels: ['featured', 'hot'],
    tags: ['asus', 'zenbook', 'dual screen', 'oled', 'workstation laptop']
  },
  {
    name: 'Dell XPS 13 9300 InfinityEdge Touchscreen Laptop (Intel Core i7, 16GB RAM, 512GB SSD)',
    slug: 'dell-xps-13-9300-infinityedge-touchscreen-laptop',
    brand: 'Dell',
    categorySlug: 'laptops',
    price: 2150.00,
    costPrice: 1500.00,
    oldPrice: 2450.00,
    stock: 55,
    lowStockThreshold: 6,
    sku: 'TRZ-B8-LAP-DEL-XPS13',
    image: 'https://cdn.dummyjson.com/product-images/laptops/new-dell-xps-13-9300-laptop/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/laptops/new-dell-xps-13-9300-laptop/thumbnail.webp', key: null }],
    shortDescription: 'Precision cut CNC aluminum ultrabook with 4-sided InfinityEdge 16:10 touchscreen display.',
    description: 'Crafted from a single block of aerospace aluminum with carbon fiber composite palm rest. Featuring a 16:10 4-sided InfinityEdge touchscreen, Intel Core i7 processor, and dual thermal fans.',
    bullets: [
      'Precision machined CNC aluminum chassis with woven carbon fiber palm rest',
      '4-sided InfinityEdge 13.4-inch 16:10 display delivers 91.5% screen-to-body ratio',
      'Corning Gorilla Glass 6 touch panel is tough, scratch-resistant, and anti-reflective',
      'Dual fans separated across chassis maximize thermal heat dispersion during intensive tasks'
    ],
    specifications: [
      { key: 'Display', value: '13.4\" 16:10 InfinityEdge FHD+ Touch' },
      { key: 'Chassis', value: 'CNC Machined Aluminum + Carbon Fiber' },
      { key: 'Weight', value: '1.2 kg (2.64 lbs)' }
    ],
    labels: ['best'],
    tags: ['dell', 'xps 13', 'infinityedge', 'ultrabook', 'laptop']
  },
  {
    name: 'Lenovo Yoga 920 4K UHD 2-in-1 Convertible Touchscreen Laptop with Watchband Hinge',
    slug: 'lenovo-yoga-920-4k-uhd-convertible-laptop',
    brand: 'Lenovo',
    categorySlug: 'laptops',
    price: 2250.00,
    costPrice: 1550.00,
    oldPrice: 2550.00,
    stock: 50,
    lowStockThreshold: 5,
    sku: 'TRZ-B8-LAP-LNV-YG920',
    image: 'https://cdn.dummyjson.com/product-images/laptops/lenovo-yoga-920/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/laptops/lenovo-yoga-920/thumbnail.webp', key: null }],
    shortDescription: 'All-metal 360-degree convertible with intricate watchband hinge and 4K IPS active pen support.',
    description: 'Iconic versatility with jeweler-grade craftsmanship. The Yoga 920 features Lenovo’s patented watchband hinge crafted from 813 individual pieces of aluminum and steel, rotating seamlessly 360 degrees.',
    bullets: [
      'Patented 360-degree watchband hinge assembled with 813 intricate steel links',
      'Stunning 13.9-inch 4K UHD (3840 x 2160) IPS touchscreen with wide viewing angles',
      'Lenovo Active Pen 2 with 4,096 levels of pressure sensitivity for fluid drawing and notes',
      'JBL stereo speakers with Dolby Atmos spatial headphone audio processing'
    ],
    specifications: [
      { key: 'Hinge', value: 'Patented 360° Steel Watchband Hinge' },
      { key: 'Screen', value: '13.9\" 4K UHD IPS Touchscreen' },
      { key: 'Pen', value: 'Lenovo Active Pen 2 Included' }
    ],
    labels: ['trending'],
    tags: ['lenovo', 'yoga', '2 in 1', 'convertible laptop', '4k touchscreen']
  },

  // 2. ELECTRONICS & MOBILE ACCESSORIES (High & Mid Tier)
  {
    name: 'Apple AirPods Max Wireless Over-Ear Active Noise Cancelling Headphones (Silver)',
    slug: 'apple-airpods-max-wireless-headphones-silver',
    brand: 'Apple',
    categorySlug: 'electronics',
    price: 2450.00, // high tier audiophile
    costPrice: 1700.00,
    oldPrice: 2750.00,
    stock: 75,
    lowStockThreshold: 8,
    sku: 'TRZ-B8-ELC-APL-APMAX',
    image: 'https://cdn.dummyjson.com/product-images/mobile-accessories/apple-airpods-max-silver/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/mobile-accessories/apple-airpods-max-silver/thumbnail.webp', key: null }],
    shortDescription: 'Anodized aluminum earcups with breathable knit mesh canopy and computational Spatial Audio.',
    description: 'The pinnacle of personal listening. Featuring custom dynamic 40mm drivers, active noise cancellation with Transparency mode, personalized spatial audio with dynamic head tracking, and stainless steel telescoping arms.',
    bullets: [
      'Apple-designed 40mm dynamic driver produces high-fidelity audio with ultra-low distortion',
      'Pro-level Active Noise Cancellation cancels ambient distractions with 8 external microphones',
      'Knit-mesh canopy and memory foam acoustically engineered ear cushions distribute pressure',
      'Digital Crown provides precise volume control, track skipping, and Siri activation'
    ],
    specifications: [
      { key: 'Driver', value: 'Apple Custom 40mm Dynamic' },
      { key: 'Battery', value: 'Up to 20 Hours with ANC & Spatial Audio' },
      { key: 'Frame', value: 'Stainless Steel with Anodized Aluminum Earcups' }
    ],
    labels: ['featured', 'best'],
    tags: ['apple', 'airpods max', 'headphones', 'noise cancelling', 'spatial audio']
  },
  {
    name: 'Apple HomePod Mini Smart Speaker with 360-Degree Computational Audio (Space Gray)',
    slug: 'apple-homepod-mini-smart-speaker-space-gray',
    brand: 'Apple',
    categorySlug: 'electronics',
    price: 295.00,
    costPrice: 185.00,
    oldPrice: 340.00,
    stock: 250,
    lowStockThreshold: 25,
    sku: 'TRZ-B8-ELC-APL-HPMIN',
    image: 'https://cdn.dummyjson.com/product-images/mobile-accessories/apple-homepod-mini-cosmic-grey/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/mobile-accessories/apple-homepod-mini-cosmic-grey/thumbnail.webp', key: null }],
    shortDescription: 'Full-range driver and dual passive radiators delivering room-filling 360-degree acoustic fidelity.',
    description: 'Jam-packed with innovation. The HomePod Mini delivers unexpectedly big sound for a speaker its size. At just 3.3 inches tall, it features Apple S5 computational audio, seamless iPhone handoff, and Siri smart home control.',
    bullets: [
      'Full-range neodymium driver and dual force-cancelling passive radiators for deep bass',
      'Acoustic waveguide directs sound flow out of the bottom of speaker for immersive 360° field',
      'Four-microphone array hears your \"Hey Siri\" requests from across the room',
      'Seamless proximity audio handoff when bringing iPhone near the illuminated touch surface'
    ],
    specifications: [
      { key: 'Acoustics', value: 'Full-Range Driver + Dual Passive Radiators' },
      { key: 'Height', value: '3.3 inches (84.3 mm)' },
      { key: 'Connectivity', value: 'Wi-Fi 802.11n + Bluetooth 5.0 + Thread' }
    ],
    labels: ['hot'],
    tags: ['apple', 'homepod mini', 'smart speaker', 'siri', 'audio']
  },
  {
    name: 'Beats Flex All-Day Magnetic Wireless Bluetooth Neckband Earphones',
    slug: 'beats-flex-magnetic-wireless-earphones',
    brand: 'Beats by Dre',
    categorySlug: 'electronics',
    price: 275.00,
    costPrice: 175.00,
    oldPrice: 320.00,
    stock: 220,
    lowStockThreshold: 20,
    sku: 'TRZ-B8-ELC-BTS-FLX',
    image: 'https://cdn.dummyjson.com/product-images/mobile-accessories/beats-flex-wireless-earphones/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/mobile-accessories/beats-flex-wireless-earphones/thumbnail.webp', key: null }],
    shortDescription: 'Magnetic auto-play/pause earbuds with Apple W1 headphone chip and 12 hours of battery life.',
    description: 'Stay connected to the world you love. Featuring a durable Nitinol Flex-Form cable, magnetic auto-play/pause earbuds, Apple W1 chip for instant one-touch pairing, and Fast Fuel 10-minute quick charging.',
    bullets: [
      'Magnetic earbuds with auto-play/pause: music plays when in your ears and pauses when clasped',
      'Proprietary layered acoustic driver delivers accurate bass with ultra-low harmonic distortion',
      'Apple W1 chip enables seamless setup, Audio Sharing, and Class 1 extended Bluetooth range',
      'Fast Fuel 10-minute charge gives 1.5 hours of playback when battery is low'
    ],
    specifications: [
      { key: 'Battery', value: 'Up to 12 Hours Listening Time' },
      { key: 'Cable', value: 'Durable Nitinol Flex-Form' },
      { key: 'Chip', value: 'Apple W1 Headphone Chip' }
    ],
    labels: ['best'],
    tags: ['beats', 'wireless earphones', 'magnetic earbuds', 'apple w1', 'audio']
  },
  {
    name: 'Professional Studio LED Ring Light with Adjustable Tripod & Smartphone Live Broadcast Stand',
    slug: 'professional-studio-led-ring-light-tripod-stand',
    brand: 'Neewer',
    categorySlug: 'mobile-accessories',
    price: 285.00,
    costPrice: 180.00,
    oldPrice: 330.00,
    stock: 190,
    lowStockThreshold: 20,
    sku: 'TRZ-B8-MOB-NWR-RING',
    image: 'https://cdn.dummyjson.com/product-images/mobile-accessories/selfie-lamp-with-iphone/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/mobile-accessories/selfie-lamp-with-iphone/thumbnail.webp', key: null }],
    shortDescription: '18-inch bi-color dimmable LED ring light with phone mount cradle and 75-inch heavy-duty tripod.',
    description: 'Flawless lighting for creators, makeup artists, and video streams. Delivers continuous shadowless illumination with adjustable color temperature (3200K - 5600K), high CRI 97+ color rendition, and universal 360-degree phone holder.',
    bullets: [
      '18-inch circular LED panel with 480 high-efficiency SMD LEDs for shadowless beauty lighting',
      'Stepless dimming from 1% to 100% and wide color temperature adjustment (3200K warm to 5600K daylight)',
      'Heavy-duty aluminum alloy light stand extends smoothly from 19\" to 75\" with locking collar',
      'Universal cold-shoe swivel phone clamp compatible with all iPhone and Android devices'
    ],
    specifications: [
      { key: 'Diameter', value: '18 Inches (48 cm)' },
      { key: 'Color Rendition', value: 'CRI 97+ Professional Rating' },
      { key: 'Power', value: '55W AC Powered with In-Line Dimmer' }
    ],
    labels: ['trending'],
    tags: ['ring light', 'studio lighting', 'tripod', 'phone stand', 'creator gear']
  },
  {
    name: 'Apple iPhone 12 Pro Silicone Case with MagSafe (Deep Plum)',
    slug: 'apple-iphone-12-pro-silicone-case-magsafe-plum',
    brand: 'Apple',
    categorySlug: 'mobile-accessories',
    price: 260.00,
    costPrice: 165.00,
    oldPrice: 300.00,
    stock: 240,
    lowStockThreshold: 25,
    sku: 'TRZ-B8-MOB-APL-PLUM',
    image: 'https://cdn.dummyjson.com/product-images/mobile-accessories/iphone-12-silicone-case-with-magsafe-plum/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/mobile-accessories/iphone-12-silicone-case-with-magsafe-plum/thumbnail.webp', key: null }],
    shortDescription: 'Silky soft-touch liquid silicone exterior with built-in MagSafe magnetic alignment ring.',
    description: 'Designed by Apple to protect and complement iPhone 12 Pro. The silky soft-touch finish of the silicone exterior feels great in your hand, while the inside features a soft microfiber lining for maximum protection.',
    bullets: [
      'Built-in precision magnets align perfectly with iPhone 12 Pro for seamless snap-on wireless charging',
      'Silky, soft-touch liquid silicone exterior provides secure non-slip grip in hand',
      'Interior soft microfiber flocking cushions your iPhone against abrasive micro-scratches',
      'Undergoes thousands of hours of drop testing throughout design and manufacturing'
    ],
    specifications: [
      { key: 'Material', value: 'Liquid Silicone + Soft Microfiber Lining' },
      { key: 'Compatibility', value: 'iPhone 12 / iPhone 12 Pro' },
      { key: 'MagSafe', value: 'Full MagSafe Charging & Magnet Alignment' }
    ],
    labels: ['best'],
    tags: ['apple', 'iphone case', 'magsafe', 'silicone case', 'mobile accessory']
  },

  // 3. WATCHES (High Tier)
  {
    name: 'Longines Master Collection Automatic Chronograph Triple Calendar Watch',
    slug: 'longines-master-collection-chronograph-triple-calendar',
    brand: 'Longines',
    categorySlug: 'watches',
    price: 3450.00,
    costPrice: 2400.00,
    oldPrice: 3900.00,
    stock: 35,
    lowStockThreshold: 4,
    sku: 'TRZ-B8-WAT-LNG-MSTR',
    image: 'https://cdn.dummyjson.com/product-images/mens-watches/longines-master-collection/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/mens-watches/longines-master-collection/thumbnail.webp', key: null }],
    shortDescription: '40mm stainless steel Swiss automatic watch with silver barleycorn dial and blued steel hands.',
    description: 'The epitome of classical Swiss watchmaking tradition. Featuring an intricate silver barleycorn guilloche dial, blued steel hands, triple calendar display showing day, month, and date, alongside an astronomical moonphase indicator.',
    bullets: [
      'Swiss Calibre L687 automatic mechanical movement with 66-hour power reserve',
      'Silver-finish \"barleycorn\" stamped dial with painted Arabic numerals and blued steel hands',
      'Triple calendar complication with central crescent date hand, day and month apertures',
      'Transparent sapphire crystal exhibition caseback displaying decorated rotor and movement'
    ],
    specifications: [
      { key: 'Case Diameter', value: '40 mm' },
      { key: 'Movement', value: 'Longines Calibre L687 Automatic' },
      { key: 'Complications', value: 'Chronograph, Moonphase, Day-Date-Month' }
    ],
    labels: ['featured', 'best'],
    tags: ['longines', 'luxury watch', 'chronograph', 'moonphase', 'swiss watch']
  },
  {
    name: 'Rolex Cellini Date 39mm 18K White Gold Black Guilloche Dial Luxury Watch',
    slug: 'rolex-cellini-date-white-gold-black-dial',
    brand: 'Rolex',
    categorySlug: 'watches',
    price: 4950.00,
    costPrice: 3750.00,
    oldPrice: 5500.00,
    stock: 25,
    lowStockThreshold: 3,
    sku: 'TRZ-B8-WAT-ROL-CEL-DT',
    image: 'https://cdn.dummyjson.com/product-images/mens-watches/rolex-cellini-date-black-dial/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/mens-watches/rolex-cellini-date-black-dial/thumbnail.webp', key: null }],
    shortDescription: '39mm 18K white gold dress watch with black Rayon flammé guilloche dial and date subdial.',
    description: 'Celebrates the eternal elegance of traditional timepieces with modern distinction. Cast in solid 18K white gold with a double fluted and domed bezel, black Rayon flammé guilloche dial, and pointer date subdial at 3 o\'clock.',
    bullets: [
      'Solid 18K white gold 39mm Oyster case with signature double fluted/domed bezel',
      'Striking black \"Rayon flammé de la gloire\" guilloche pattern radiating from dial center',
      'Dedicated date subdial at 3 o’clock position with polished white gold pointer hand',
      'Manufacture Rolex Calibre 3165 self-winding mechanical chronometer movement'
    ],
    specifications: [
      { key: 'Material', value: '18ct White Gold' },
      { key: 'Case Size', value: '39 mm' },
      { key: 'Strap', value: 'Black Stitched Alligator Leather' }
    ],
    labels: ['featured'],
    tags: ['rolex', 'cellini', 'white gold', 'dress watch', 'luxury timepiece']
  },
  {
    name: 'Cartier Baignoire 18K Yellow Gold Luxury Oval Diamond Bracelet Watch',
    slug: 'cartier-baignoire-18k-gold-oval-watch',
    brand: 'Cartier',
    categorySlug: 'watches',
    price: 4850.00,
    costPrice: 3650.00,
    oldPrice: 5400.00,
    stock: 20,
    lowStockThreshold: 3,
    sku: 'TRZ-B8-WAT-CRT-GOLD',
    image: 'https://cdn.dummyjson.com/product-images/womens-watches/watch-gold-for-women/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/womens-watches/watch-gold-for-women/thumbnail.webp', key: null }],
    shortDescription: 'Sculpted 18K yellow gold oval curved watch with silvered sunray dial and gold link bracelet.',
    description: 'An emblematic Cartier design born from pure aesthetic precision. Featuring an elegant curved oval case crafted from polished 18K yellow gold that drapes gracefully over the wrist, paired with a matching five-link gold bracelet.',
    bullets: [
      'Solid 18K yellow gold curved oval case with sapphire cabochon beaded winding crown',
      'Silvered opaline sunray dial with Roman numerals and blued-steel sword-shaped hands',
      'Supple 18K yellow gold link jewelry bracelet with concealed folding deployant clasp',
      'High-precision Swiss quartz movement offering years of maintenance-free luxury'
    ],
    specifications: [
      { key: 'Case Material', value: '18K Yellow Gold' },
      { key: 'Crown', value: 'Blue Sapphire Cabochon' },
      { key: 'Origin', value: 'Swiss Made' }
    ],
    labels: ['best'],
    tags: ['cartier', 'gold watch', 'luxury', 'womens watch', 'swiss']
  },

  // 4. VEHICLES (High Tier)
  {
    name: 'Dodge Charger SXT RWD 3.6L V6 American Performance Sport Sedan',
    slug: 'dodge-charger-sxt-rwd-sport-sedan',
    brand: 'Dodge',
    categorySlug: 'vehicles',
    price: 4950.00,
    costPrice: 3800.00,
    oldPrice: 5500.00,
    stock: 6,
    lowStockThreshold: 1,
    sku: 'TRZ-B8-VEH-DOD-CHRG',
    image: 'https://cdn.dummyjson.com/product-images/vehicle/charger-sxt-rwd/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/vehicle/charger-sxt-rwd/thumbnail.webp', key: null }],
    shortDescription: '300-horsepower rear-wheel-drive four-door muscle car with Uconnect infotainment and touring chassis.',
    description: 'Iconic American muscle with executive saloon proportions. Powered by the 3.6L Pentastar V6 generating 300 horsepower through a TorqueFlite 8-speed transmission, featuring aggressive body lines and signature LED racetrack taillamps.',
    bullets: [
      'Award-winning 3.6-liter Pentastar V6 engine outputting 300 horsepower and 264 lb-ft of torque',
      'TorqueFlite 8-speed automatic transmission with steering-wheel-mounted paddle shifters',
      'Signature continuous LED racetrack taillamp assembly and aggressive crosshair grille',
      '7-inch driver information digital display cluster with customizable performance metrics'
    ],
    specifications: [
      { key: 'Drivetrain', value: 'Rear-Wheel Drive (RWD)' },
      { key: 'Engine', value: '3.6L Pentastar V6 (300 HP)' },
      { key: 'Transmission', value: '8-Speed TorqueFlite Automatic' }
    ],
    labels: ['featured', 'hot'],
    tags: ['dodge', 'charger', 'muscle car', 'sedan', 'vehicle']
  },
  {
    name: 'Chrysler Pacifica Touring 3.6L V6 Luxury Passenger Minivan with Stow ‘n Go',
    slug: 'chrysler-pacifica-touring-luxury-minivan',
    brand: 'Chrysler',
    categorySlug: 'vehicles',
    price: 4900.00,
    costPrice: 3750.00,
    oldPrice: 5400.00,
    stock: 5,
    lowStockThreshold: 1,
    sku: 'TRZ-B8-VEH-CHR-PAC',
    image: 'https://cdn.dummyjson.com/product-images/vehicle/pacifica-touring/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/vehicle/pacifica-touring/thumbnail.webp', key: null }],
    shortDescription: 'Premium 7-passenger family minivan with class-exclusive Stow \'n Go folding seats and active safety.',
    description: 'The standard of luxury family travel. Equipped with Chrysler’s class-exclusive Stow \'n Go seating that folds completely into the floor, acoustic laminated glass for a whisper-quiet ride, and full active safety suite.',
    bullets: [
      '3.6L Pentastar V6 engine paired with a 9-speed automatic transmission for smooth power delivery',
      'Class-exclusive Stow \'n Go seating and storage system folds 2nd and 3rd rows into the floor',
      'Standard power sliding side doors and power liftgate with hands-free foot sensor',
      'Advanced safety suite including Pedestrian Automatic Emergency Braking and Blind Spot Monitoring'
    ],
    specifications: [
      { key: 'Seating', value: '7 Passenger Luxury Seating' },
      { key: 'Engine', value: '3.6L V6 287 HP' },
      { key: 'Cargo Volume', value: '140.5 cu. ft. Behind First Row' }
    ],
    labels: ['best'],
    tags: ['chrysler', 'pacifica', 'minivan', 'family vehicle', 'automotive']
  },
  {
    name: 'Vespa Primavera 150 ABS Touring Italian Commuter Scooter',
    slug: 'vespa-primavera-150-touring-scooter',
    brand: 'Vespa',
    categorySlug: 'vehicles',
    price: 3850.00,
    costPrice: 2700.00,
    oldPrice: 4250.00,
    stock: 14,
    lowStockThreshold: 2,
    sku: 'TRZ-B8-VEH-VSP-150',
    image: 'https://cdn.dummyjson.com/product-images/motorcycle/scooter-motorcycle/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/motorcycle/scooter-motorcycle/thumbnail.webp', key: null }],
    shortDescription: 'Classic Italian steel-bodied 150cc i-get fuel-injected touring scooter with chrome luggage racks.',
    description: 'Agile, stylish, and unmistakably Italian. The Vespa Primavera 150 features an iconic pressed sheet steel monocoque chassis, ultra-efficient 150cc i-get 4-stroke engine, front wheel ABS, and vintage chrome luggage carrier racks.',
    bullets: [
      'Signature pressed-steel unibody frame delivers exceptional structural rigidity and agility',
      '150cc electronic fuel-injected i-get single-cylinder engine delivers effortless city cruising',
      'Front 200mm disc brake with Bosch anti-lock braking system (ABS) for maximum road safety',
      'Chrome front and rear luggage racks and dark saddle leatherette touring seat'
    ],
    specifications: [
      { key: 'Engine', value: '150cc 4-Stroke 3-Valve Single Cylinder i-get' },
      { key: 'Chassis', value: 'Sheet Metal Steel Unibody' },
      { key: 'Origin', value: 'Handmade in Pontedera, Italy' }
    ],
    labels: ['featured'],
    tags: ['vespa', 'scooter', 'motorcycle', 'italian', 'commuter']
  },

  // 5. HOME DECOR & FURNITURE (High Tier)
  {
    name: 'Annibale Colombo Handcrafted Italian Solid Walnut Luxury King Bedstead',
    slug: 'annibale-colombo-handcrafted-walnut-king-bed',
    brand: 'Annibale Colombo',
    categorySlug: 'home-decor',
    price: 4950.00,
    costPrice: 3700.00,
    oldPrice: 5500.00,
    stock: 10,
    lowStockThreshold: 2,
    sku: 'TRZ-B8-HOM-ACB-BED',
    image: 'https://cdn.dummyjson.com/product-images/furniture/annibale-colombo-bed/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/furniture/annibale-colombo-bed/thumbnail.webp', key: null }],
    shortDescription: 'Masterpiece king bedstead hand-carved in Brianza, Italy from aged solid Canaletto walnut.',
    description: 'Heirloom cabinet-making of the highest order. Handcrafted in the historic workshops of Brianza, Italy, this king-size bedstead features solid Canaletto walnut with book-matched headboard veneers and beeswax finish.',
    bullets: [
      '100% Solid European Canaletto walnut seasoned and hand-selected by master Italian cabinetmakers',
      'Traditional mortise and tenon joinery reinforced with blind wooden dowels for generational durability',
      'Book-matched figured walnut headboard showcasing the breathtaking natural flame grain',
      'Hand-applied multi-layer natural beeswax and shellac polish with deep satin luster'
    ],
    specifications: [
      { key: 'Wood', value: 'Solid Italian Canaletto Walnut' },
      { key: 'Size', value: 'King Bedstead (200 x 210 cm)' },
      { key: 'Origin', value: 'Handmade in Brianza, Italy' }
    ],
    labels: ['featured', 'best'],
    tags: ['annibale colombo', 'luxury bed', 'walnut furniture', 'italian design', 'home decor']
  },
  {
    name: 'Annibale Colombo Handcrafted Italian Full-Grain Leather & Walnut 3-Seater Sofa',
    slug: 'annibale-colombo-leather-walnut-3-seater-sofa',
    brand: 'Annibale Colombo',
    categorySlug: 'home-decor',
    price: 4850.00,
    costPrice: 3600.00,
    oldPrice: 5350.00,
    stock: 12,
    lowStockThreshold: 2,
    sku: 'TRZ-B8-HOM-ACB-SOFA',
    image: 'https://cdn.dummyjson.com/product-images/furniture/annibale-colombo-sofa/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/furniture/annibale-colombo-sofa/thumbnail.webp', key: null }],
    shortDescription: 'Bespoke 3-seater luxury sofa wrapped in buttery Italian aniline leather with exposed walnut frame.',
    description: 'An architectural symphony of rich timber and glove-soft Italian leather. Features a solid American walnut underframe with tapered legs and deep high-resilience foam cushions enveloped in pure goose feather down.',
    bullets: [
      'Exposed kiln-dried solid Canaletto walnut structural frame with hand-sculpted bevelled edges',
      'Upholstered in full-grain Italian vegetable-tanned aniline leather that develops an exquisite patina',
      'Cushions filled with multi-density high-resilience foam core wrapped in channeled goose down',
      'Eight-way hand-tied steel coil spring suspension provides sublime supportive comfort'
    ],
    specifications: [
      { key: 'Dimensions', value: '235 cm W x 95 cm D x 80 cm H' },
      { key: 'Upholstery', value: '100% Full-Grain Italian Aniline Leather' },
      { key: 'Frame', value: 'Solid Canaletto Walnut' }
    ],
    labels: ['best'],
    tags: ['sofa', 'leather couch', 'italian furniture', 'luxury living', 'home decor']
  },
  {
    name: 'Bespoke African Cherry Solid Wood Bedside Table Nightstand with Drawer and Shelves',
    slug: 'bespoke-african-cherry-wood-bedside-nightstand',
    brand: 'Furniture Co.',
    categorySlug: 'home-decor',
    price: 2450.00,
    costPrice: 1700.00,
    oldPrice: 2750.00,
    stock: 30,
    lowStockThreshold: 4,
    sku: 'TRZ-B8-HOM-AFR-NTBL',
    image: 'https://cdn.dummyjson.com/product-images/furniture/bedside-table-african-cherry/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/furniture/bedside-table-african-cherry/thumbnail.webp', key: null }],
    shortDescription: 'Curved hourglass silhouette bedside table handcrafted from African cherry hardwood with storage drawer.',
    description: 'Elevate your master suite with this sculptured nightstand. Handcrafted from solid African cherry hardwood with curved outward hourglass gables, an upper accessory drawer with brushed nickel pull, and two lower open display shelves.',
    bullets: [
      'Sculpted outward curved side gables create an elegant hourglass silhouette',
      'Solid African cherry hardwood construction with hand-rubbed deep espresso satin finish',
      'Upper pull-out drawer with dovetail joinery and round brushed nickel knob',
      'Two spacious lower open shelving tiers provide ample storage for nighttime reading books and accessories'
    ],
    specifications: [
      { key: 'Wood', value: 'Solid African Cherry Hardwood' },
      { key: 'Dimensions', value: '55 cm W x 40 cm D x 65 cm H' },
      { key: 'Storage', value: '1 Dovetail Drawer + 2 Open Shelves' }
    ],
    labels: ['trending'],
    tags: ['bedside table', 'nightstand', 'cherry wood', 'bedroom furniture', 'home decor']
  },
  {
    name: 'Knoll Saarinen Executive Conference Swivel Armchair in Scarlet Bouclé Fabric',
    slug: 'knoll-saarinen-executive-conference-armchair',
    brand: 'Knoll',
    categorySlug: 'home-decor',
    price: 2200.00,
    costPrice: 1550.00,
    oldPrice: 2500.00,
    stock: 35,
    lowStockThreshold: 5,
    sku: 'TRZ-B8-HOM-KNL-CHAIR',
    image: 'https://cdn.dummyjson.com/product-images/furniture/knoll-saarinen-executive-conference-chair/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/furniture/knoll-saarinen-executive-conference-chair/thumbnail.webp', key: null }],
    shortDescription: 'Iconic mid-century modern sculpted executive armchair with lumbar opening and 5-star swivel caster base.',
    description: 'Designed by Eero Saarinen in 1950, this timeless design transformed executive seating. Features a molded polyurethane foam shell wrapped in vivid scarlet red bouclé fabric, opening in the lower back for fluid movement, and 5-star polished swivel base on smooth-rolling casters.',
    bullets: [
      'Molded reinforced polyurethane shell enveloped in heavy-duty scarlet red textured bouclé weave',
      'Distinctive sculptural lower back cutout conforms naturally to the lumbar curve and flexes with movement',
      'Five-star polished aluminum swivel base equipped with hooded dual-wheel urethane carpet casters',
      '360-degree silent ball-bearing swivel mechanism with pneumatic seat height adjustment'
    ],
    specifications: [
      { key: 'Designer', value: 'Eero Saarinen (Knoll)' },
      { key: 'Upholstery', value: 'Premium Wool-Blend Scarlet Bouclé' },
      { key: 'Base', value: '5-Star Polished Aluminum with Casters' }
    ],
    labels: ['featured', 'best'],
    tags: ['knoll', 'saarinen chair', 'executive chair', 'red armchair', 'designer furniture']
  },
  {
    name: 'Handcrafted Boho Macramé Indoor Hanging Chair Swing with Solid Hardwood Spreader',
    slug: 'handcrafted-macrame-hanging-chair-swing',
    brand: 'Boho Atelier',
    categorySlug: 'home-decor',
    price: 280.00,
    costPrice: 175.00,
    oldPrice: 320.00,
    stock: 160,
    lowStockThreshold: 20,
    sku: 'TRZ-B8-HOM-BOH-SWNG',
    image: 'https://cdn.dummyjson.com/product-images/home-decoration/decoration-swing/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/home-decoration/decoration-swing/thumbnail.webp', key: null }],
    shortDescription: '100% organic unbleached cotton macramé hammock swing with plush fringe and beechwood spreader.',
    description: 'Your personal tranquil reading nook. Hand-knotted by master artisans using thick unbleached organic cotton ropes, featuring a solid beechwood spreader bar, heavy steel hanging rings, and playful fringe trim.',
    bullets: [
      'Hand-woven using 100% natural organic cotton macramé cord with soft tactile comfort',
      'Solid kiln-dried beechwood spreader bar keeps swing open for optimal ergonomics',
      'Robust reinforced double-thick steel eyelets safely support up to 330 lbs (150 kg)',
      'Suitable for indoor lounges, covered verandas, sunrooms, and bedroom reading corners'
    ],
    specifications: [
      { key: 'Material', value: '100% Organic Cotton Cord + Beechwood Bar' },
      { key: 'Weight Capacity', value: '330 lbs (150 kg)' },
      { key: 'Dimensions', value: '130 cm H x 100 cm W' }
    ],
    labels: ['best'],
    tags: ['hanging chair', 'swing', 'macrame', 'boho decor', 'home decoration']
  },
  {
    name: 'Modernist Elevated Floor Planter Stand with Lush Botanical Foliage',
    slug: 'modernist-elevated-floor-planter-stand',
    brand: 'Nordic Greens',
    categorySlug: 'home-decor',
    price: 265.00,
    costPrice: 165.00,
    oldPrice: 310.00,
    stock: 150,
    lowStockThreshold: 15,
    sku: 'TRZ-B8-HOM-NDK-PLNT',
    image: 'https://cdn.dummyjson.com/product-images/home-decoration/house-showpiece-plant/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/home-decoration/house-showpiece-plant/thumbnail.webp', key: null }],
    shortDescription: 'Matte black architectural metal pedestal frame cradling a semi-spherical planter bowl with lifelike botanical greenery.',
    description: 'Elevate your interior living space with architectural biophilic decor. A powder-coated matte black open-wire cube stand cradles a smooth bowl vessel housing dense, vibrant green botanical leaves.',
    bullets: [
      'Sturdy rectangular open-frame steel pedestal finished in rust-proof matte black powder coat',
      'Removable semi-spherical charcoal planter bowl nests securely within the top cradle ring',
      'Filled with hyper-realistic lush green foliage featuring varied leaf textures that never fade',
      'Minimalist Scandinavian silhouette complements urban apartments, offices, and living rooms'
    ],
    specifications: [
      { key: 'Frame', value: 'Matte Black Powder-Coated Steel' },
      { key: 'Dimensions', value: '75 cm H x 25 cm W x 25 cm D' },
      { key: 'Care', value: 'Wipe Clean with Dry Cloth (Zero Watering)' }
    ],
    labels: ['trending'],
    tags: ['planter stand', 'indoor plant', 'pedestal planter', 'scandinavian decor', 'home decor']
  },
  {
    name: 'Silhouette Family Tree Multi-Aperture Collage Wall Photo Frame Gallery',
    slug: 'silhouette-family-tree-collage-photo-frame',
    brand: 'Artisan Living',
    categorySlug: 'home-decor',
    price: 255.00,
    costPrice: 160.00,
    oldPrice: 299.00,
    stock: 180,
    lowStockThreshold: 20,
    sku: 'TRZ-B8-HOM-ART-FRM',
    image: 'https://cdn.dummyjson.com/product-images/home-decoration/family-tree-photo-frame/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/home-decoration/family-tree-photo-frame/thumbnail.webp', key: null }],
    shortDescription: 'Large black sculptural tree silhouette wall art with 8 individual photo frames and central Family plaque.',
    description: 'Celebrate your family heritage with this striking sculptural gallery frame. Featuring a black silhouette tree trunk with branching leaves holding 8 distinct picture frames of various sizes around a central Family motto.',
    bullets: [
      'Sculptural black silhouette tree design crafted from durable high-density composite with branching foliage',
      'Includes 8 individual display frames with protective glass fronts and bevelled cream mats',
      'Prominent central marquee banner inscribed with elegant calligraphy script reading "Family"',
      'Arrives fully assembled with heavy-duty sawtooth wall hanging hardware for level mounting'
    ],
    specifications: [
      { key: 'Apertures', value: '8 Multi-Size Photo Frames + Central Family Plaque' },
      { key: 'Overall Dimensions', value: '70 cm W x 75 cm H' },
      { key: 'Material', value: 'High-Density Composite + Mineral Glass' }
    ],
    labels: ['best'],
    tags: ['family tree frame', 'photo frame collage', 'wall decor', 'gallery wall', 'home decoration']
  },

  // 6. FASHION & LUXURY APPAREL (High Tier)
  {
    name: 'Gucci Horsebit 1955 Medium Full-Grain Calfskin Leather Top-Handle Bag (Azure Blue)',
    slug: 'gucci-horsebit-1955-blue-leather-bag',
    brand: 'Gucci',
    categorySlug: 'fashion',
    price: 3650.00,
    costPrice: 2550.00,
    oldPrice: 4100.00,
    stock: 28,
    lowStockThreshold: 3,
    sku: 'TRZ-B8-FSH-GUC-BLU',
    image: "https://cdn.dummyjson.com/product-images/womens-bags/blue-women's-handbag/thumbnail.webp",
    images: [{ url: "https://cdn.dummyjson.com/product-images/womens-bags/blue-women's-handbag/thumbnail.webp", key: null }],
    shortDescription: 'Structured Italian calfskin dome satchel in vibrant azure blue with polished gold-tone hardware.',
    description: 'An archival icon reborn. Crafted in Florence from supple textured calfskin in a vivid azure blue hue, detailed with the double ring and bar Horsebit hardware, rolled top handles, and detachable crossbody strap.',
    bullets: [
      'Handcrafted in Florence, Italy from 100% textured full-grain calf leather',
      'Polished gold-toned metal hardware with signature equestrian double ring and bar detailing',
      'Dual rolled leather top handles and removable adjustable shoulder strap for shoulder or cross-body wear',
      'Lined in luxury cotton-linen canvas with zippered security wall pocket'
    ],
    specifications: [
      { key: 'Material', value: '100% Italian Calfskin Leather' },
      { key: 'Dimensions', value: '25 cm W x 24 cm H x 9 cm D' },
      { key: 'Origin', value: 'Made in Italy' }
    ],
    labels: ['featured', 'best'],
    tags: ['gucci', 'handbag', 'blue bag', 'luxury fashion', 'italian leather']
  },
  {
    name: 'YSL Sac De Jour Nano Smooth Calfskin Leather Satchel (Noir Black)',
    slug: 'ysl-sac-de-jour-nano-black-leather-satchel',
    brand: 'Saint Laurent',
    categorySlug: 'fashion',
    price: 3850.00,
    costPrice: 2700.00,
    oldPrice: 4300.00,
    stock: 22,
    lowStockThreshold: 3,
    sku: 'TRZ-B8-FSH-YSL-SDJ',
    image: 'https://cdn.dummyjson.com/product-images/womens-bags/women-handbag-black/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/womens-bags/women-handbag-black/thumbnail.webp', key: null }],
    shortDescription: 'Architectural accordion-side structured black calfskin tote with brass padlock in leather lanyard.',
    description: 'The defining silhouette of Parisian luxury. Featuring accordion sides with compression tabs, tubular handles, embossed Saint Laurent Paris signature, and a brass padlock encased in a detachable leather fob.',
    bullets: [
      '100% Supple calfskin leather crafted with precision edge paint by master Parisian leatherworkers',
      'Signature accordion pleat side gussets with adjustable leather cinch straps',
      'Removable leather encased brass padlock with coordinating key fob',
      'Protective metal brass feet on the reinforced base prevent tabletop scuffs'
    ],
    specifications: [
      { key: 'Leather', value: '100% Smooth Box Calfskin' },
      { key: 'Dimensions', value: '22 x 18 x 10.5 cm' },
      { key: 'Hardware', value: 'Polished Gold-Tone Brass' }
    ],
    labels: ['featured'],
    tags: ['saint laurent', 'sac de jour', 'black handbag', 'luxury', 'designer']
  },
  {
    name: 'MCM Stark Visetos Medium Coated Canvas Luxury Backpack (Ivory White)',
    slug: 'mcm-stark-visetos-luxury-backpack-ivory',
    brand: 'MCM',
    categorySlug: 'fashion',
    price: 2450.00,
    costPrice: 1700.00,
    oldPrice: 2750.00,
    stock: 35,
    lowStockThreshold: 4,
    sku: 'TRZ-B8-FSH-MCM-WHT',
    image: 'https://cdn.dummyjson.com/product-images/womens-bags/white-faux-leather-backpack/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/womens-bags/white-faux-leather-backpack/thumbnail.webp', key: null }],
    shortDescription: 'Signature Visetos monogram coated canvas backpack with 24K gold-plated brass logo plaque.',
    description: 'A global statement of luxury streetwear. Crafted from durable ivory monogram coated canvas with nappa leather trim, multi-pocket organizational compartments, and padded ergonomic shoulder straps.',
    bullets: [
      'Ivory Visetos monogram coated canvas is ultra-durable, waterproof, and scratch-resistant',
      'Individually numbered 24K gold-plated brass logo plate at front',
      'Padded interior compartment safely holds up to 13-inch laptop or tablet',
      'Side slip pockets and two-way wraparound gold-tone zippers with leather pull tags'
    ],
    specifications: [
      { key: 'Material', value: 'Visetos Monogram Canvas + Nappa Leather' },
      { key: 'Hardware', value: '24K Gold-Plated Brass' },
      { key: 'Dimensions', value: '33 x 26 x 13 cm' }
    ],
    labels: ['trending'],
    tags: ['mcm', 'backpack', 'luxury bag', 'white backpack', 'fashion']
  },
  {
    name: 'Alexander McQueen Tailored Leather Bustier & Flared Pleated Skirt Set',
    slug: 'alexander-mcqueen-leather-bustier-black-skirt-set',
    brand: 'Alexander McQueen',
    categorySlug: 'fashion',
    price: 3950.00,
    costPrice: 2750.00,
    oldPrice: 4400.00,
    stock: 18,
    lowStockThreshold: 2,
    sku: 'TRZ-B8-FSH-AMQ-SKRT',
    image: 'https://cdn.dummyjson.com/product-images/womens-dresses/corset-with-black-skirt/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/womens-dresses/corset-with-black-skirt/thumbnail.webp', key: null }],
    shortDescription: 'Sculpted boned lambskin leather corset top paired with high-waisted pleated wool skirt.',
    description: 'The epitome of dark romantic tailoring. A structured leather corset bodice crafted from supple Italian nappa leather pairs seamlessly with a knife-pleated high-waisted flared skirt cut from technical wool gabardine.',
    bullets: [
      'Bodice crafted from 100% glove-soft Italian lambskin leather with internal flexible boning',
      'Full flared knife-pleated skirt creates dramatic movement with every step',
      'Exposed industrial silver-toned metal zip closure along center back',
      'Silky cupro lining guarantees breathable all-evening comfort'
    ],
    specifications: [
      { key: 'Bodice', value: '100% Italian Lambskin Nappa' },
      { key: 'Skirt', value: 'Technical Wool Gabardine' },
      { key: 'Origin', value: 'Made in Italy' }
    ],
    labels: ['featured'],
    tags: ['alexander mcqueen', 'corset dress', 'couture', 'leather bustier', 'runway']
  },
  {
    name: 'Carolina Herrera Emerald Silk Shantung A-Line Cocktail Dress',
    slug: 'carolina-herrera-emerald-silk-cocktail-dress',
    brand: 'Carolina Herrera',
    categorySlug: 'fashion',
    price: 3450.00,
    costPrice: 2400.00,
    oldPrice: 3850.00,
    stock: 20,
    lowStockThreshold: 3,
    sku: 'TRZ-B8-FSH-CH-PEA',
    image: 'https://cdn.dummyjson.com/product-images/womens-dresses/dress-pea/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/womens-dresses/dress-pea/thumbnail.webp', key: null }],
    shortDescription: 'Lustrous emerald green silk shantung fit-and-flare dress with sculptural bow waistline.',
    description: 'Timeless feminine sophistication. Tailored from heavyweight raw silk shantung in a radiant emerald pea green shade, featuring a boat neckline, cinched waist with origami fold bow, and full box-pleated skirt.',
    bullets: [
      'Woven from 100% pure raw silk shantung featuring natural slub texture and rich luster',
      'Fitted bodice with elegant bateau neckline and flattering princess seam shaping',
      'Voluminous box-pleated A-line skirt with concealed side seam pockets',
      'Hand-finished hem with reinforced crinoline horsehair braid for perpetual shape'
    ],
    specifications: [
      { key: 'Fabric', value: '100% Pure Silk Shantung' },
      { key: 'Lining', value: '100% Silk Habotai' },
      { key: 'Origin', value: 'Made in USA of Imported Fabrics' }
    ],
    labels: ['best'],
    tags: ['carolina herrera', 'cocktail dress', 'silk dress', 'emerald green', 'luxury fashion']
  },

  // 7. SHOES (High & Mid Tier)
  {
    name: 'Nike Vapor Untouchable Pro Carbon Elite Baseball & Football Cleats',
    slug: 'nike-vapor-untouchable-pro-cleats',
    brand: 'Nike',
    categorySlug: 'shoes',
    price: 2250.00,
    costPrice: 1550.00,
    oldPrice: 2500.00,
    stock: 65,
    lowStockThreshold: 8,
    sku: 'TRZ-B8-SHO-NIK-CLT',
    image: 'https://cdn.dummyjson.com/product-images/mens-shoes/nike-baseball-cleats/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/mens-shoes/nike-baseball-cleats/thumbnail.webp', key: null }],
    shortDescription: 'Carbon fiber plate spiked athletic cleats with Flyweave upper for explosive field traction.',
    description: 'Engineered for game-breaking speed and razor-sharp cuts. Features a one-piece Flyweave upper that locks down your foot, an integrated carbon fiber cleat plate, and precision secondary studs for supreme turf grip.',
    bullets: [
      'One-piece Flyweave upper delivers targeted lateral support and lightweight breathability',
      'Full-length carbon fiber propulsion plate snaps back for explosive linear acceleration',
      'Strategically configured metal and molded TPU secondary cleat layout for 360° turf traction',
      'Cushioned low-profile collar allows unrestricted ankle flexion during high-speed cuts'
    ],
    specifications: [
      { key: 'Plate', value: 'Rigid Carbon Composite Propulsion Plate' },
      { key: 'Upper', value: 'High-Tenacity Nike Flyweave' },
      { key: 'Stud Type', value: 'Molded + Metal Cleat Hybrids' }
    ],
    labels: ['hot'],
    tags: ['nike', 'cleats', 'baseball cleats', 'football cleats', 'sports shoes']
  },
  {
    name: 'Off-White c/o Virgil Abloh Out Of Office Low-Top Leather Sneakers (White / Red)',
    slug: 'off-white-out-of-office-sneakers-white-red',
    brand: 'Off-White',
    categorySlug: 'shoes',
    price: 2350.00,
    costPrice: 1600.00,
    oldPrice: 2650.00,
    stock: 55,
    lowStockThreshold: 6,
    sku: 'TRZ-B8-SHO-OFW-OOO',
    image: 'https://cdn.dummyjson.com/product-images/mens-shoes/sports-sneakers-off-white-red/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/mens-shoes/sports-sneakers-off-white-red/thumbnail.webp', key: null }],
    shortDescription: 'Late 1980s basketball-inspired low-tops featuring contrast red arrow motif and zip tie tag.',
    description: 'The definitive luxury street sneaker created by Virgil Abloh. Blends vintage 80s tennis aesthetics with iconic Off-White signatures: bold red leather arrow lateral patches, perforated toe box, and ridged rubber sole.',
    bullets: [
      'Crafted in Italy from supple white calf leather with bold scarlet red accents',
      'Lateral signature Arrows patch stitched in contrasting tumbled red leather',
      'Finished with signature removable marble zip-tie tag and quoted laces',
      'Durable bi-color rubber cupsole with translucent gel cushioning inserts'
    ],
    specifications: [
      { key: 'Material', value: '100% Italian Calf Leather' },
      { key: 'Sole', value: '100% Rubber with Gel Pods' },
      { key: 'Origin', value: 'Made in Italy' }
    ],
    labels: ['best', 'featured'],
    tags: ['off-white', 'virgil abloh', 'designer sneakers', 'luxury shoes', 'streetwear']
  },
  {
    name: 'Christian Louboutin Follies Strass 100mm Metallic Gold Mesh Pumps',
    slug: 'christian-louboutin-follies-strass-gold-pumps',
    brand: 'Christian Louboutin',
    categorySlug: 'shoes',
    price: 2450.00,
    costPrice: 1700.00,
    oldPrice: 2750.00,
    stock: 30,
    lowStockThreshold: 4,
    sku: 'TRZ-B8-SHO-CLB-GOLD',
    image: 'https://cdn.dummyjson.com/product-images/womens-shoes/golden-shoes-woman/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/womens-shoes/golden-shoes-woman/thumbnail.webp', key: null }],
    shortDescription: '100mm sheer metallic gold mesh stiletto pumps adorned with iridescent hand-set crystals.',
    description: 'Pure fairytale glamour. The iconic Follies Strass pump features sheer glitter-infused mesh dégradé crystal embellishments, laminated metallic specchio gold leather stiletto heel, and the legendary red lacquered sole.',
    bullets: [
      'Hand-applied sparkling dégradé crystals glisten across sheer metallic golden mesh',
      'Iconic red-lacquered leather sole makes an unforgettable high-fashion statement',
      'Laminated specchio gold leather wrapped 100mm (4-inch) pin stiletto heel',
      'Handmade in Italy with supreme Parisian haute-couture craftsmanship'
    ],
    specifications: [
      { key: 'Heel Height', value: '100 mm / 4 Inches' },
      { key: 'Sole', value: 'Signature Red Gloss Lacquered Leather' },
      { key: 'Origin', value: 'Handmade in Italy' }
    ],
    labels: ['featured'],
    tags: ['christian louboutin', 'red bottoms', 'gold heels', 'strass', 'stiletto pumps']
  },
  {
    name: 'Manolo Blahnik Hangisi 105mm Ruby Red Silk Satin Crystal Buckle Pumps',
    slug: 'manolo-blahnik-hangisi-ruby-red-crystal-pumps',
    brand: 'Manolo Blahnik',
    categorySlug: 'shoes',
    price: 2400.00,
    costPrice: 1650.00,
    oldPrice: 2700.00,
    stock: 32,
    lowStockThreshold: 4,
    sku: 'TRZ-B8-SHO-MNL-RED',
    image: 'https://cdn.dummyjson.com/product-images/womens-shoes/red-shoes/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/womens-shoes/red-shoes/thumbnail.webp', key: null }],
    shortDescription: 'Lustrous ruby red silk satin pointed toe pumps crowned with Swarovski crystal buckle.',
    description: 'An enduring masterpiece of footwear design. Handcrafted in Parabiago, Italy in saturated ruby red silk satin, finished with Manolo Blahnik’s iconic square buckle encrusted with faceted grey and clear Swarovski crystals.',
    bullets: [
      'Crafted in Italy from 100% lustrous ruby red silk satin',
      'Signature square buckle meticulously set with Swarovski crystal baguettes',
      'Flattering almond-pointed toe design with deep vamp that flatters the foot arch',
      'Generously padded kid leather insole provides supreme evening comfort'
    ],
    specifications: [
      { key: 'Heel Height', value: '105 mm / 4.1 Inches' },
      { key: 'Upper', value: '100% Silk Satin' },
      { key: 'Buckle', value: 'Genuine Swarovski Crystal' }
    ],
    labels: ['best'],
    tags: ['manolo blahnik', 'hangisi', 'ruby red heels', 'crystal pumps', 'luxury shoes']
  },

  // 8. SPORTS & FITNESS ACCESSORIES (High & Mid Tier)
  {
    name: 'Wilson Duke NFL Official Metallic Handcrafted Game Football',
    slug: 'wilson-duke-nfl-official-game-football',
    brand: 'Wilson',
    categorySlug: 'sports',
    price: 275.00,
    costPrice: 175.00,
    oldPrice: 320.00,
    stock: 180,
    lowStockThreshold: 20,
    sku: 'TRZ-B8-SPT-WLS-BALL',
    image: 'https://cdn.dummyjson.com/product-images/sports-accessories/american-football/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/sports-accessories/american-football/thumbnail.webp', key: null }],
    shortDescription: 'Official game football handcrafted in Ada, Ohio from 100% exclusive Horween leather.',
    description: 'The exact ball used on Sundays in the NFL. Named in honor of football legend Wellington Mara, \"The Duke\" is handcrafted in Ada, Ohio by skilled artisans using proprietary tanned Horween leather with deep pebbled texture.',
    bullets: [
      'Handcrafted in Ada, Ohio from top-grade 100% exclusive American Horween leather',
      'Deep pebble texture and ACL (Accurate Control Lacing) provide exceptional quarterback grip',
      'Multi-ply bladder delivers superior air retention and true spiral flight dynamics',
      'Embossed with official gold foil NFL shield and commissioner signature insignia'
    ],
    specifications: [
      { key: 'Leather', value: '100% Horween American Cowhide' },
      { key: 'Origin', value: 'Handmade in Ada, Ohio, USA' },
      { key: 'Standard', value: 'Official NFL Regulation Game Size' }
    ],
    labels: ['best'],
    tags: ['wilson', 'nfl football', 'horween leather', 'the duke', 'sports']
  },
  {
    name: 'Rawlings Heart of the Hide 11.5-Inch Handcrafted Baseball Infield Glove',
    slug: 'rawlings-heart-of-the-hide-baseball-glove',
    brand: 'Rawlings',
    categorySlug: 'sports',
    price: 2350.00,
    costPrice: 1600.00,
    oldPrice: 2650.00,
    stock: 45,
    lowStockThreshold: 5,
    sku: 'TRZ-B8-SPT-RAW-GLV',
    image: 'https://cdn.dummyjson.com/product-images/sports-accessories/baseball-glove/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/sports-accessories/baseball-glove/thumbnail.webp', key: null }],
    shortDescription: 'Crafted from the top 5% of US steerhide leather with deer-tanned cowhide palm lining.',
    description: 'The choice of MLB Gold Glove winners for over 65 years. Handcrafted from ultra-premium Heart of the Hide steerhide leather with moldable padding that breaks in to form the perfect custom pocket for middle infielders.',
    bullets: [
      'Cut exclusively from the top 5% of steerhide hides available worldwide',
      'Deer-tanned cowhide palm lining and soft full-grain fingerback linings provide plush comfort',
      'Pro Grade Tennessee Tanning leather laces offer unbreakable structure and pocket shape',
      'Padded thumb sleeve and thermoformed wrist pad wick moisture during intense innings'
    ],
    specifications: [
      { key: 'Pattern', value: '11.5-Inch Pro I-Web' },
      { key: 'Leather', value: 'Heart of the Hide Premium Steerhide' },
      { key: 'Position', value: 'Infield (Shortstop / Second Base / Third Base)' }
    ],
    labels: ['featured'],
    tags: ['rawlings', 'baseball glove', 'heart of the hide', 'infield glove', 'sports']
  },
  {
    name: 'Goalrilla Pro Style Heavy-Duty Breakaway Basketball Rim with Weatherproof Net',
    slug: 'goalrilla-pro-style-breakaway-basketball-rim',
    brand: 'Goalrilla',
    categorySlug: 'sports',
    price: 2150.00,
    costPrice: 1500.00,
    oldPrice: 2400.00,
    stock: 50,
    lowStockThreshold: 5,
    sku: 'TRZ-B8-SPT-GLR-RIM',
    image: 'https://cdn.dummyjson.com/product-images/sports-accessories/basketball-rim/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/sports-accessories/basketball-rim/thumbnail.webp', key: null }],
    shortDescription: 'Gym-grade flex breakaway arena basketball goal with enclosed dual stainless steel springs.',
    description: 'Designed to withstand ferocious rim-rattling dunks. Features an institutional-grade solid carbon steel rim, dual enclosed return springs that absorb dunking energy to protect backboards, and baked-on weather powder coat.',
    bullets: [
      'Engineered with commercial flex breakaway springs that deflect smoothly under heavy player dunks',
      'Solid 5/8-inch high-tensile carbon steel rim with laser-cut gusset reinforcements',
      'Electrostatic all-weather powder coating resists rust, chipping, and UV sun degradation',
      'Includes heavy-duty 12-loop braided weatherproof nylon net and zinc-plated mounting hardware'
    ],
    specifications: [
      { key: 'Diameter', value: 'Regulation 18-inch Steel Rim' },
      { key: 'Spring Mechanism', value: 'Enclosed Dual High-Tension Return Springs' },
      { key: 'Mounting', value: 'Universal 5\" x 5\" Backboard Hole Pattern' }
    ],
    labels: ['hot'],
    tags: ['basketball rim', 'breakaway rim', 'goalrilla', 'basketball goal', 'sports']
  },
  {
    name: 'Shrey Masterclass Titanium Air Cricket Helmet (Titanium Visor Grille)',
    slug: 'shrey-masterclass-titanium-cricket-helmet',
    brand: 'Shrey',
    categorySlug: 'sports',
    price: 2200.00,
    costPrice: 1520.00,
    oldPrice: 2480.00,
    stock: 40,
    lowStockThreshold: 5,
    sku: 'TRZ-B8-SPT-SHR-HLM',
    image: 'https://cdn.dummyjson.com/product-images/sports-accessories/cricket-helmet/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/sports-accessories/cricket-helmet/thumbnail.webp', key: null }],
    shortDescription: 'Ultralight 750g titanium grille cricket batting helmet with dual-density high-impact protection.',
    description: 'The preferred choice of international test cricketers. At approximately 750 grams, this ultralight helmet combines a reinforced carbon-infused ABS shell with an aerospace titanium visor that provides unmatched face defense.',
    bullets: [
      'High-grade aerospace titanium face grille offers maximum ball-impact defense with featherweight balance',
      'Dual-density EPS liner and Koroyd core crumple zones absorb and disperse 150 km/h bouncer impacts',
      'Extended rear neck protection and adjustable dial-fit retention cradle for snug security',
      'Removable anti-bacterial sweatband wicks moisture and dries rapidly between overs'
    ],
    specifications: [
      { key: 'Grille Material', value: 'Solid Aerospace Titanium' },
      { key: 'Weight', value: 'Approx. 750 grams (Ultralight)' },
      { key: 'Certification', value: 'BSI BS 7928:2013 Certified' }
    ],
    labels: ['featured'],
    tags: ['cricket helmet', 'titanium grille', 'shrey', 'cricket gear', 'sports']
  },
  {
    name: 'Wilson Pro Staff RF 97 Autograph Professional Carbon Fiber Tennis Racket',
    slug: 'wilson-pro-staff-rf97-carbon-tennis-racket',
    brand: 'Wilson',
    categorySlug: 'sports',
    price: 2450.00,
    costPrice: 1700.00,
    oldPrice: 2750.00,
    stock: 45,
    lowStockThreshold: 5,
    sku: 'TRZ-B8-SPT-WLS-RF97',
    image: 'https://cdn.dummyjson.com/product-images/sports-accessories/tennis-racket/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/sports-accessories/tennis-racket/thumbnail.webp', key: null }],
    shortDescription: 'Braided graphite & Kevlar 340g signature tennis racket engineered with Roger Federer.',
    description: 'Precision engineered for masters of the court. Developed in close collaboration with Roger Federer, featuring a braided 45-degree Kevlar and graphite layup for pure ball feel, laser-engraved typography, and genuine leather grip.',
    bullets: [
      'Braid 45 construction weaves Kevlar and double-braided graphite fibers at 45-degree angles',
      'Substantial 340g (12 oz) unstrung mass delivers devastating plow-through and pinpoint stability',
      'Ergonomic calfskin leather grip provides pure tactile feedback on groundstrokes and volleys',
      'Matte velvet black finish with subtle Swiss cross and Federer autograph detailing'
    ],
    specifications: [
      { key: 'Head Size', value: '97 sq. in. (626 sq. cm)' },
      { key: 'Unstrung Weight', value: '340 grams (12 oz)' },
      { key: 'Composition', value: 'Braided Graphite with Kevlar' }
    ],
    labels: ['best', 'featured'],
    tags: ['wilson', 'pro staff', 'tennis racket', 'roger federer', 'tennis']
  },

  // 9. KITCHEN APPLIANCES (High & Mid Tier)
  {
    name: 'Panasonic Inverter Countertop Stainless Steel Convection Microwave Oven (1.3 cu. ft.)',
    slug: 'panasonic-inverter-stainless-microwave-oven',
    brand: 'Panasonic',
    categorySlug: 'kitchen',
    price: 480.00,
    costPrice: 310.00,
    oldPrice: 550.00,
    stock: 140,
    lowStockThreshold: 15,
    sku: 'TRZ-B8-KIT-PAN-MCW',
    image: 'https://cdn.dummyjson.com/product-images/kitchen-accessories/microwave-oven/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/kitchen-accessories/microwave-oven/thumbnail.webp', key: null }],
    shortDescription: 'Patented Cyclonic Inverter technology delivers even, steady cooking power with sensory reheating.',
    description: 'Unlike traditional microwaves that pulse power on and off, Panasonic Cyclonic Inverter technology generates a steady stream of continuous cooking energy at all temperature levels, ensuring juicy meats, evenly melted cheeses, and no cold spots.',
    bullets: [
      'Cyclonic Wave Inverter circulates microwave energy in a 3D circular pattern for uniform heating',
      '1,250 Watts of high cooking power with smart Genius Sensor that automatically adjusts cook times',
      'Sleek fingerprint-resistant brushed stainless steel door and digital LED control panel',
      'Turbo Defrost function thaws poultry, steaks, and bread rapidly without pre-cooking the edges'
    ],
    specifications: [
      { key: 'Capacity', value: '1.3 Cubic Feet' },
      { key: 'Power Output', value: '1,250 Watts' },
      { key: 'Technology', value: 'Cyclonic Inverter Continuous Power' }
    ],
    labels: ['best'],
    tags: ['microwave', 'panasonic', 'inverter', 'kitchen appliance', 'stainless steel']
  },
  {
    name: 'Cole & Mason Revolving Carousel 16-Jar Stainless Steel Countertop Spice Rack',
    slug: 'cole-and-mason-revolving-spice-rack',
    brand: 'Cole & Mason',
    categorySlug: 'kitchen',
    price: 270.00,
    costPrice: 170.00,
    oldPrice: 310.00,
    stock: 200,
    lowStockThreshold: 20,
    sku: 'TRZ-B8-KIT-CLM-SPC',
    image: 'https://cdn.dummyjson.com/product-images/kitchen-accessories/spice-rack/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/kitchen-accessories/spice-rack/thumbnail.webp', key: null }],
    shortDescription: 'Two-tier 360-degree rotating stainless steel spice carousel with 16 labelled glass herb jars.',
    description: 'Elevate culinary convenience and countertop aesthetic. This smooth 360-degree revolving carousel holds 16 glass herb and spice jars with dual-action pour/shake tops and polished chrome lids.',
    bullets: [
      'Smooth ball-bearing turntable mechanism rotates 360 degrees effortlessly on non-slip base',
      'Includes 16 clear glass jars with airtight brushed stainless steel caps to preserve spice aroma',
      'Dual-function shaker lids allow precise pinch sprinkling or rapid tablespoon pouring',
      'Central brushed stainless steel carry stem allows easy transport from counter to dining table'
    ],
    specifications: [
      { key: 'Jar Count', value: '16 Refillable Glass Jars' },
      { key: 'Material', value: 'Brushed Stainless Steel & Glass' },
      { key: 'Base', value: 'Smooth Ball-Bearing 360° Carousel' }
    ],
    labels: ['trending'],
    tags: ['spice rack', 'kitchen organizer', 'spice carousel', 'kitchenware', 'cooking']
  },

  // 10. FRAGRANCES & BEAUTY (High & Mid Tier)
  {
    name: 'Chanel Coco Noir Eau De Parfum Vaporisateur Spray (100ml)',
    slug: 'chanel-coco-noir-eau-de-parfum-100ml',
    brand: 'Chanel',
    categorySlug: 'beauty',
    price: 2350.00,
    costPrice: 1600.00,
    oldPrice: 2600.00,
    stock: 70,
    lowStockThreshold: 8,
    sku: 'TRZ-B8-BTY-CHN-NOIR',
    image: 'https://cdn.dummyjson.com/product-images/fragrances/chanel-coco-noir-eau-de/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/fragrances/chanel-coco-noir-eau-de/thumbnail.webp', key: null }],
    shortDescription: 'Luminous Venetian oriental fragrance housed in iconic opaque black lacquer flacon.',
    description: 'An intimate, seductive fragrance with magnetic intensity. Opens with vibrant bergamot and grapefruit, revealing a generous floral heart of May rose, geranium rose leaf, and jasmine, settling into patchouli and Venezuelan tonka bean.',
    bullets: [
      'Striking opaque black architectural flacon designed after Gabrielle Chanel\'s Venetian aesthetic',
      'Top notes of sparkling Grapefruit and Calabrian Bergamot awaken the senses',
      'Heart notes of Grasse May Rose and Indonesian Patchouli deliver opulent floral depth',
      'Base notes of Bourbon Vanilla and White Musk provide a lingering, intoxicating sillage'
    ],
    specifications: [
      { key: 'Concentration', value: 'Eau de Parfum (EDP)' },
      { key: 'Volume', value: '100 ml / 3.4 fl. oz.' },
      { key: 'Origin', value: 'Made in France' }
    ],
    labels: ['featured', 'best'],
    tags: ['chanel', 'coco noir', 'parfum', 'perfume', 'luxury fragrance']
  },
  {
    name: 'Dior J’adore L’Or Essence de Parfum Luxury Fragrance (50ml)',
    slug: 'dior-jadore-lor-essence-de-parfum',
    brand: 'Dior',
    categorySlug: 'beauty',
    price: 2450.00,
    costPrice: 1700.00,
    oldPrice: 2750.00,
    stock: 65,
    lowStockThreshold: 8,
    sku: 'TRZ-B8-BTY-DIO-JDR',
    image: "https://cdn.dummyjson.com/product-images/fragrances/dior-j'adore/thumbnail.webp",
    images: [{ url: "https://cdn.dummyjson.com/product-images/fragrances/dior-j'adore/thumbnail.webp", key: null }],
    shortDescription: 'Haute-parfumerie solar floral nectar with hand-coiled gold necklace amphora bottle.',
    description: 'The sensual ode to gold and flowers. Created by master perfumer Francis Kurkdjian, this concentrated essence balances notes of Orange Blossom, Grandiflorum Jasmine, and Centifolia Rose in full bloom.',
    bullets: [
      'Iconic teardrop glass amphora flacon adorned with a fluid melted-gold metallic choker necklace',
      'Solar floral composition featuring Centifolia Rose and Jasmine grandiflorum from Domaine de Manon',
      'Concentrated quintessence formula leaves an opulent, radiant golden floral trail',
      'Handcrafted and bottled in the historic Christian Dior workshops in Grasse, France'
    ],
    specifications: [
      { key: 'Volume', value: '50 ml / 1.7 oz' },
      { key: 'Type', value: 'Essence de Parfum (Pure Extrait)' },
      { key: 'Notes', value: 'Grasse Rose, Jasmine Grandiflorum, Orange Blossom' }
    ],
    labels: ['featured'],
    tags: ['dior', 'jadore', 'fragrance', 'luxury perfume', 'floral']
  },
  {
    name: 'Gucci Bloom Ambrosia di Fiori Intense Eau De Parfum (100ml)',
    slug: 'gucci-bloom-ambrosia-di-fiori-edp',
    brand: 'Gucci',
    categorySlug: 'beauty',
    price: 2250.00,
    costPrice: 1550.00,
    oldPrice: 2500.00,
    stock: 80,
    lowStockThreshold: 10,
    sku: 'TRZ-B8-BTY-GUC-BLM',
    image: 'https://cdn.dummyjson.com/product-images/fragrances/gucci-bloom-eau-de/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/fragrances/gucci-bloom-eau-de/thumbnail.webp', key: null }],
    shortDescription: 'Vibrant red lacquered flacon with Damascena rose and velvety Tuscan orris root extracts.',
    description: 'Inspired by the ancient Greek myth of Ambrosia. Enriched with rare Velvety Orris from Tuscan irises harvested in May, and sweet honeyed notes of Damascena Rose alongside jasmine bud and Rangoon Creeper.',
    bullets: [
      'Encased in a dramatic deep red glazed porcelain-effect bottle with ribbed Gucci label',
      'Intense, rich floral bouquet enriched with rare Tuscan Orris and Damask Rose extract',
      'Rangoon Creeper vine flowers imported from South India shift color as they blossom',
      'Formulated by master nose Alberto Morillas under Alessandro Michele’s creative vision'
    ],
    specifications: [
      { key: 'Volume', value: '100 ml / 3.3 fl. oz.' },
      { key: 'Type', value: 'Eau de Parfum Intense' },
      { key: 'Key Accords', value: 'Tuscan Orris, Damascena Rose, Tuberose' }
    ],
    labels: ['trending'],
    tags: ['gucci', 'gucci bloom', 'perfume', 'luxury fragrance', 'beauty']
  },
  {
    name: 'Calvin Klein CK One All-Over Body Eau de Toilette Spray (200ml)',
    slug: 'calvin-klein-ck-one-eau-de-toilette-200ml',
    brand: 'Calvin Klein',
    categorySlug: 'beauty',
    price: 280.00,
    costPrice: 175.00,
    oldPrice: 320.00,
    stock: 220,
    lowStockThreshold: 20,
    sku: 'TRZ-B8-BTY-CK-ONE',
    image: 'https://cdn.dummyjson.com/product-images/fragrances/calvin-klein-ck-one/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/fragrances/calvin-klein-ck-one/thumbnail.webp', key: null }],
    shortDescription: 'Iconic clean citrus green tea universal fragrance in frosted minimalist flask bottle.',
    description: 'The revolutionary unisex scent that defined a generation. Naturally clean, pure, and contemporary with an invigorating balance of bright bergamot, green tea, papaya, cardamom, and soft amber musk.',
    bullets: [
      'Frosted glass flask bottle inspired by vintage liquor bottles with brushed aluminum cap',
      'Crisp top notes of Green Tea, Bergamot, Cardamom, Tangerine, and Fresh Papaya',
      'Heart of Nutmeg, Violet, Orris Root, Jasmine, Lily-of-the-Valley, and Rose',
      'Generous 200ml flacon designed for generous all-over body misting morning and evening'
    ],
    specifications: [
      { key: 'Volume', value: '200 ml / 6.7 fl. oz.' },
      { key: 'Type', value: 'Eau de Toilette Spray' },
      { key: 'Fragrance Family', value: 'Citrus Aromatic Clean' }
    ],
    labels: ['best'],
    tags: ['calvin klein', 'ck one', 'fragrance', 'eau de toilette', 'unisex']
  },

  // 11. SUNGLASSES & ACCESSORIES (High & Mid Tier)
  {
    name: 'Saint Laurent Classic SL 108 Acetate Square Polarized Sunglasses (Polished Black)',
    slug: 'saint-laurent-classic-sl-108-polarized-sunglasses',
    brand: 'Saint Laurent',
    categorySlug: 'fashion',
    price: 2150.00,
    costPrice: 1480.00,
    oldPrice: 2400.00,
    stock: 50,
    lowStockThreshold: 6,
    sku: 'TRZ-B8-FSH-YSL-SL108',
    image: 'https://cdn.dummyjson.com/product-images/sunglasses/black-sun-glasses/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/sunglasses/black-sun-glasses/thumbnail.webp', key: null }],
    shortDescription: 'Minimalist Italian black acetate square frames with laser-engraved temples and dark grey lenses.',
    description: 'Sleek rock-and-roll elegance. Hand-cut from solid block Italian black acetate, featuring sleek slim temples with subtle laser-engraved Saint Laurent signature, square silhouette, and 100% UV-blocking polarized lenses.',
    bullets: [
      'Sculpted in Italy from premium high-density polished black cellulose acetate',
      'Scratch-resistant polarized mineral lenses eliminate glare from water and roadways',
      'Corner silver corner accents and discreet Saint Laurent signature engraved on temples',
      'Supplied with embossed soft leather triangular protective case and microfiber cloth'
    ],
    specifications: [
      { key: 'Frame', value: '100% Italian Acetate' },
      { key: 'Lenses', value: 'Polarized CR-39 Grey Tint (100% UVA/UVB)' },
      { key: 'Origin', value: 'Made in Italy' }
    ],
    labels: ['hot'],
    tags: ['saint laurent', 'sunglasses', 'black shades', 'polarized', 'designer eyewear']
  },
  {
    name: 'Persol 714SM Steve McQueen Folding Pilot Tortoiseshell Sunglasses',
    slug: 'persol-714sm-steve-mcqueen-folding-sunglasses',
    brand: 'Persol',
    categorySlug: 'fashion',
    price: 2350.00,
    costPrice: 1600.00,
    oldPrice: 2600.00,
    stock: 45,
    lowStockThreshold: 5,
    sku: 'TRZ-B8-FSH-PER-714',
    image: 'https://cdn.dummyjson.com/product-images/sunglasses/classic-sun-glasses/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/sunglasses/classic-sun-glasses/thumbnail.webp', key: null }],
    shortDescription: 'Handcrafted Italian folding pilot sunglasses with Meflecto flexible stem system and crystal lenses.',
    description: 'The world’s first folding sunglasses made legendary by Steve McQueen in The Thomas Crown Affair. Handcrafted in Lauriano, Italy with inward folding hinges at the bridge and temples, and patented Meflecto flexibility.',
    bullets: [
      'Folds down effortlessly to pocket size with precision engineered Italian hinges',
      'Rich Havana tortoiseshell acetate hand-polished to a brilliant lustrous sheen',
      'Patented Meflecto stem system eliminates pressure on temples for bespoke comfort',
      'Pure crystal polarized lenses with internal anti-reflective coating'
    ],
    specifications: [
      { key: 'Origin', value: 'Handmade in Lauriano, Italy' },
      { key: 'Features', value: 'Inward Folding Bridge & Temples' },
      { key: 'Lenses', value: 'Polarized Crystal Glass' }
    ],
    labels: ['featured', 'best'],
    tags: ['persol', 'steve mcqueen', 'folding sunglasses', 'havana', 'eyewear']
  },
  {
    name: 'Cutler and Gross 1386 Bold Emerald Green Acetate Square Sunglasses',
    slug: 'cutler-and-gross-1386-emerald-green-sunglasses',
    brand: 'Cutler and Gross',
    categorySlug: 'fashion',
    price: 2200.00,
    costPrice: 1520.00,
    oldPrice: 2480.00,
    stock: 40,
    lowStockThreshold: 5,
    sku: 'TRZ-B8-FSH-CNG-1386',
    image: 'https://cdn.dummyjson.com/product-images/sunglasses/green-and-black-glasses/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/sunglasses/green-and-black-glasses/thumbnail.webp', key: null }],
    shortDescription: '9mm heavy gauge British-designed emerald green and black bevelled acetate statement sunglasses.',
    description: 'Bold, cinematic eyewear heritage. Cut from 9mm custom dual-layer emerald green and black cured acetate, featuring hand-bevelled edges, custom oyster front pins, and solid green Carl Zeiss optical lenses.',
    bullets: [
      'Chunky 9mm acetate milled by hand in the Italian Dolomites for bold presence',
      'Contrast emerald green laminated outer with glossy black core acetate',
      'Equipped with Carl Zeiss optical grade lenses featuring 100% UV400 absorption',
      'Hand-pinned five-barrel hinges and deco temple cores visible through translucent acetate'
    ],
    specifications: [
      { key: 'Frame', value: '9mm Dual-Layer Acetate' },
      { key: 'Lenses', value: 'Carl Zeiss CR-39 Green Optical' },
      { key: 'Design', value: 'Designed in London, Made in Italy' }
    ],
    labels: ['trending'],
    tags: ['cutler and gross', 'green sunglasses', 'statement eyewear', 'luxury', 'fashion']
  }
];

console.log(`Fresh replacements defined: ${freshReplacements.length}`);

// Filter clean fresh candidates that do not collide with existing DB
const cleanFresh = freshReplacements.filter(p => !existingImages.has(p.image) && !existingSlugs.has(p.slug) && !existingSkus.has(p.sku));
console.log(`Clean fresh candidates (0 DB collisions): ${cleanFresh.length}`);

const freshHigh = cleanFresh.filter(p => p.price >= 2000);
const freshLow = cleanFresh.filter(p => p.price < 2000);
console.log(`Available freshHigh (>= $2000): ${freshHigh.length}, needed: ${highTierNeeded}`);
console.log(`Available freshLow (< $2000): ${freshLow.length}, needed: ${lowTierNeeded}`);

if (freshHigh.length < highTierNeeded || freshLow.length < lowTierNeeded) {
  throw new Error(`Not enough fresh items! freshHigh: ${freshHigh.length}/${highTierNeeded}, freshLow: ${freshLow.length}/${lowTierNeeded}`);
}

const selectedFresh = [
  ...freshHigh.slice(0, highTierNeeded),
  ...freshLow.slice(0, lowTierNeeded)
];

// Combine kept 64 + selectedFresh 36 = 100 items!
const combined = [...kept, ...selectedFresh];
console.log(`Combined total items: ${combined.length}`);

// Verify price distribution:
let highCount = 0;
let lowCount = 0;
for (const p of combined) {
  if (p.price >= 2000) highCount++;
  else lowCount++;
}

console.log(`High range (>= $2000): ${highCount} / 100 (${(highCount/100*100).toFixed(1)}%)`);
console.log(`Low range (< $2000): ${lowCount} / 100 (${(lowCount/100*100).toFixed(1)}%)`);

// Check unique slugs, skus, images
const slugs = new Set();
const skus = new Set();
const images = new Set();

let internalErrors = 0;
for (const p of combined) {
  if (slugs.has(p.slug)) { console.error(`Internal slug dup: ${p.slug}`); internalErrors++; }
  if (skus.has(p.sku)) { console.error(`Internal sku dup: ${p.sku}`); internalErrors++; }
  if (images.has(p.image)) { console.error(`Internal image dup: ${p.image}`); internalErrors++; }
  slugs.add(p.slug);
  skus.add(p.sku);
  images.add(p.image);
}

// Check against existing 347
let existingErrors = 0;
for (const p of combined) {
  if (existingSlugs.has(p.slug)) { console.error(`Slug collision with DB: ${p.slug}`); existingErrors++; }
  if (existingSkus.has(p.sku)) { console.error(`SKU collision with DB: ${p.sku}`); existingErrors++; }
  if (existingImages.has(p.image)) { console.error(`Image collision with DB: ${p.image}`); existingErrors++; }
}

console.log(`Internal errors: ${internalErrors}`);
console.log(`Existing DB collisions: ${existingErrors}`);

if (internalErrors === 0 && existingErrors === 0 && combined.length === 100) {
  // Write the perfect final dataset!
  fs.writeFileSync('server/src/data/batch8-final-100.js', `// Exactly 100 Products for Product Treasury - Batch 8
// Price range $250 - $5,000, 68% high range, 0 duplicate images, 0 collisions with existing 347 items
export const FINAL_100_PRODUCTS = ${JSON.stringify(combined, null, 2)};
`);
  console.log('SUCCESS! Wrote server/src/data/batch8-final-100.js');
} else {
  console.error('Validation failed. File not written.');
}

