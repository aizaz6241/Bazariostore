import fs from 'fs';

// Verify and assemble all 100 products
export const BATCH_8_PRODUCTS = [
  // =========================================================================
  // 1. WATCHES & WEARABLES (6 Products)
  // =========================================================================
  {
    name: 'Rolex Submariner Date 41mm Oystersteel Luxury Dive Watch',
    slug: 'rolex-submariner-date-41mm-oystersteel-watch',
    brand: 'Rolex',
    categorySlug: 'watches',
    price: 4950.00,
    costPrice: 3700.00,
    oldPrice: 5499.00,
    stock: 50,
    lowStockThreshold: 5,
    sku: 'TRZ-B8-WAT-ROL-SUB41',
    image: 'https://cdn.dummyjson.com/product-images/mens-watches/rolex-submariner-watch/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/mens-watches/rolex-submariner-watch/thumbnail.webp', key: null }],
    shortDescription: 'Iconic 41mm Oystersteel professional diver watch with Cerachrom unidirectional ceramic bezel.',
    description: 'The Rolex Submariner Date in Oystersteel with a black Cerachrom ceramic bezel and black dial with large luminescent hour markers. Calibre 3235 perpetual self-winding mechanical movement offering 70 hours power reserve and 300m water resistance.',
    bullets: [
      'Robust 41mm case crafted from corrosion-resistant 904L Oystersteel',
      'Unidirectional rotatable 60-minute graduated Cerachrom ceramic bezel',
      'Manufacture Rolex Calibre 3235 mechanical movement with Chronergy escapement',
      'Waterproof to 300 meters (1,000 feet) with Triplock triple waterproofness system'
    ],
    specifications: [
      { key: 'Case Size', value: '41 mm' },
      { key: 'Movement', value: 'Rolex Calibre 3235 Automatic' },
      { key: 'Power Reserve', value: 'Approximately 70 Hours' },
      { key: 'Water Resistance', value: '300m / 1,000 feet' }
    ],
    labels: ['featured', 'best'],
    tags: ['rolex', 'luxury watch', 'submariner', 'swiss', 'automatic', 'dive watch']
  },
  {
    name: 'Rolex Datejust 36mm Fluted Bezel Jubilee Bracelet Watch',
    slug: 'rolex-datejust-36mm-fluted-bezel-jubilee-watch',
    brand: 'Rolex',
    categorySlug: 'watches',
    price: 4650.00,
    costPrice: 3500.00,
    oldPrice: 5100.00,
    stock: 45,
    lowStockThreshold: 5,
    sku: 'TRZ-B8-WAT-ROL-DJ36',
    image: 'https://cdn.dummyjson.com/product-images/mens-watches/rolex-datejust/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/mens-watches/rolex-datejust/thumbnail.webp', key: null }],
    shortDescription: 'Timeless 36mm Datejust featuring iconic fluted white gold bezel and 5-piece Jubilee bracelet.',
    description: 'The archetype of the modern classic watch. The Rolex Datejust spans eras while retaining the enduring aesthetics that make it instantly recognizable, paired with the legendary five-piece link Jubilee bracelet.',
    bullets: [
      '36mm Oyster case with signature 18ct white gold fluted bezel',
      'Supple and comfortable five-piece link metal Jubilee bracelet with Oysterclasp',
      'Cyclops magnification lens over the date aperture at 3 o’clock position',
      'Self-winding mechanical movement featuring Superlative Chronometer certification'
    ],
    specifications: [
      { key: 'Case Diameter', value: '36 mm' },
      { key: 'Bezel', value: '18K White Gold Fluted' },
      { key: 'Bracelet', value: 'Jubilee five-piece links' },
      { key: 'Crystal', value: 'Scratch-resistant sapphire' }
    ],
    labels: ['best'],
    tags: ['rolex', 'datejust', 'luxury', 'dress watch', 'swiss']
  },
  {
    name: 'Rolex Cellini Moonphase 18K Everose Gold Luxury Dress Watch',
    slug: 'rolex-cellini-moonphase-everose-gold-watch',
    brand: 'Rolex',
    categorySlug: 'watches',
    price: 4850.00,
    costPrice: 3600.00,
    oldPrice: 5350.00,
    stock: 30,
    lowStockThreshold: 4,
    sku: 'TRZ-B8-WAT-ROL-CEL-MN',
    image: 'https://cdn.dummyjson.com/product-images/mens-watches/rolex-cellini-moonphase/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/mens-watches/rolex-cellini-moonphase/thumbnail.webp', key: null }],
    shortDescription: 'Rare 39mm 18K Everose gold dress watch displaying lunar cycles with genuine meteorite disc.',
    description: 'The Cellini Moonphase features a white lacquer dial with a blue enameled disc at 6 o’clock showing the full moon and new moon, with the full moon depicted by a real meteorite applique. Driven by calibre 3195 with a patented astronomical moonphase module.',
    bullets: [
      'Cast in proprietary 18K Everose gold with double fluted and domed bezel',
      'Astronomical moonphase display with genuine Gibeon meteorite disc',
      'Date displayed around dial circumference via a crescent-tipped center hand',
      'Tobacco brown alligator leather strap with 18K Everose Crownclasp'
    ],
    specifications: [
      { key: 'Material', value: '18ct Everose Gold' },
      { key: 'Moon Disc', value: 'Genuine Gibeon Meteorite' },
      { key: 'Diameter', value: '39 mm' },
      { key: 'Strap', value: 'Stitched Alligator Leather' }
    ],
    labels: ['featured'],
    tags: ['rolex', 'cellini', 'moonphase', 'everose gold', 'luxury watch']
  },
  {
    name: 'Rolex Lady-Datejust 28mm Diamond Dial Luxury Watch',
    slug: 'rolex-lady-datejust-28mm-diamond-dial-watch',
    brand: 'Rolex',
    categorySlug: 'watches',
    price: 4750.00,
    costPrice: 3550.00,
    oldPrice: 5200.00,
    stock: 40,
    lowStockThreshold: 4,
    sku: 'TRZ-B8-WAT-ROL-LADY28',
    image: 'https://cdn.dummyjson.com/product-images/womens-watches/rolex-datejust-women/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/womens-watches/rolex-datejust-women/thumbnail.webp', key: null }],
    shortDescription: 'Refined 28mm Oystersteel Lady-Datejust with hand-set brilliant cut diamond hour markers.',
    description: 'The classic feminine watch from Rolex. Featuring a 28mm redesigned case and a dial adorned with hand-set diamonds in 18ct gold settings, equipped with calibre 2236 featuring the patented Syloxi silicon hairspring.',
    bullets: [
      'Elegant 28mm Oystersteel case scaled for sophisticated feminine wrists',
      'Lustrous sunray dial set with genuine brilliant-cut diamonds',
      'Manufacture Calibre 2236 with anti-magnetic Syloxi silicon balance spring',
      'Waterproof Oyster case with twinlock screw-down crown to 100m'
    ],
    specifications: [
      { key: 'Case Size', value: '28 mm' },
      { key: 'Gem Setting', value: 'Diamonds in 18K Gold Castings' },
      { key: 'Movement', value: 'Rolex Calibre 2236 Automatic' },
      { key: 'Water Resistance', value: '100m' }
    ],
    labels: ['best'],
    tags: ['rolex', 'womens watch', 'diamonds', 'luxury', 'datejust']
  },
  {
    name: 'Garmin Instinct 2 Solar Tactical Edition GPS Smartwatch',
    slug: 'garmin-instinct-2-solar-tactical-edition-watch',
    brand: 'Garmin',
    categorySlug: 'watches',
    price: 2200.00,
    costPrice: 1550.00,
    oldPrice: 2450.00,
    stock: 120,
    lowStockThreshold: 15,
    sku: 'TRZ-B8-WAT-GRM-INST2',
    image: 'https://images.unsplash.com/photo-1773399452188-a42e29543bf2?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1773399452188-a42e29543bf2?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Military-grade solar powered tactical GPS smartwatch with infinite battery life in solar mode.',
    description: 'Built to military standard 810 for thermal, shock and water resistance. Tactical features include night vision compatibility, waypoint projection, dual-position GPS formatting, and stealth mode.',
    bullets: [
      'Power Glass solar charging lens yields unlimited battery life in smartwatch mode',
      'Built to MIL-STD-810 military specifications with fiber-reinforced polymer case',
      'Tactical specific functions: stealth mode, night vision compatibility, kill switch',
      'Comprehensive multisport biometric tracking including VO2 max, SpO2, and HRV'
    ],
    specifications: [
      { key: 'Lens', value: 'Power Glass Solar Charging' },
      { key: 'Water Rating', value: '10 ATM (100 meters)' },
      { key: 'GPS', value: 'Multi-GNSS: GPS, GLONASS, Galileo' }
    ],
    labels: ['hot'],
    tags: ['garmin', 'gps watch', 'tactical', 'solar', 'smartwatch']
  },
  {
    name: 'Suunto 9 Peak Pro Titanium All-Black Multisport GPS Watch',
    slug: 'suunto-9-peak-pro-titanium-all-black-watch',
    brand: 'Suunto',
    categorySlug: 'watches',
    price: 2450.00,
    costPrice: 1700.00,
    oldPrice: 2700.00,
    stock: 90,
    lowStockThreshold: 10,
    sku: 'TRZ-B8-WAT-SUU-9PKTI',
    image: 'https://images.unsplash.com/photo-1654195131868-cac1d8429d86?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1654195131868-cac1d8429d86?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Ultra-thin grade 5 titanium military-grade GPS sports watch with 85-hour endurance battery.',
    description: 'Handcrafted in Finland using 100% renewable energy. Grade 5 titanium bezel paired with sapphire crystal glass creates an ultra-thin, durable chassis capable of surviving the most demanding expedition conditions.',
    bullets: [
      'Ultra-thin 10.8mm profile engineered with aerospace-grade 5 titanium',
      'Up to 300 hours of continuous GPS tracking in Tour expedition mode',
      'Tested to US military standards (MIL-STD-810H) for extreme temperatures and drops',
      'Over 95 pre-configured sport modes with wrist heart rate and blood oxygen'
    ],
    specifications: [
      { key: 'Bezel Material', value: 'Titanium Grade 5' },
      { key: 'Glass', value: 'Sapphire Crystal' },
      { key: 'Weight', value: '55 grams' }
    ],
    labels: ['trending'],
    tags: ['suunto', 'titanium', 'gps', 'endurance', 'adventure watch']
  },

  // =========================================================================
  // 2. VEHICLES & AUTOMOTIVE (7 Products)
  // =========================================================================
  {
    name: 'Kawasaki Z800 Performance ABS Streetfighter Motorcycle',
    slug: 'kawasaki-z800-performance-abs-motorcycle',
    brand: 'Kawasaki',
    categorySlug: 'vehicles',
    price: 4800.00,
    costPrice: 3600.00,
    oldPrice: 5300.00,
    stock: 15,
    lowStockThreshold: 3,
    sku: 'TRZ-B8-VEH-KAW-Z800',
    image: 'https://cdn.dummyjson.com/product-images/motorcycle/kawasaki-z800/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/motorcycle/kawasaki-z800/thumbnail.webp', key: null }],
    shortDescription: '806cc liquid-cooled in-line four cylinder aggressive naked streetfighter motorcycle.',
    description: 'The aggressive Kawasaki Z800 combines raw streetfighter attitude with razor-sharp chassis dynamics. Featuring an 806cc in-line four engine tuned for intense mid-range punch, inverted 41mm KYB forks, and twin 310mm petal discs.',
    bullets: [
      'High-revving 806cc liquid-cooled 16-valve DOHC in-line four power plant',
      'Aggressive Sugomi predator styling with full LED cockpit instrumentation',
      'Dual 310mm front petal rotors with opposed four-piston calipers and ABS',
      'Inverted 41mm KYB cartridge front forks with adjustable rebound damping'
    ],
    specifications: [
      { key: 'Engine', value: '806cc Liquid-Cooled In-Line Four' },
      { key: 'Transmission', value: '6-Speed Return Shift' },
      { key: 'Fuel System', value: 'DFI with 34mm Mikuni Throttle Bodies' },
      { key: 'Front Suspension', value: '41mm Inverted Fork' }
    ],
    labels: ['featured', 'hot'],
    tags: ['kawasaki', 'motorcycle', 'streetfighter', 'sports bike', 'superbike']
  },
  {
    name: 'MotoGP CI.H1 Championship Grand Prix Racing Superbike',
    slug: 'motogp-ci-h1-championship-racing-superbike',
    brand: 'MotoGP Racing',
    categorySlug: 'vehicles',
    price: 4990.00,
    costPrice: 3800.00,
    oldPrice: 5500.00,
    stock: 10,
    lowStockThreshold: 2,
    sku: 'TRZ-B8-VEH-MGP-CIH1',
    image: 'https://cdn.dummyjson.com/product-images/motorcycle/motogp-ci.h1/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/motorcycle/motogp-ci.h1/thumbnail.webp', key: null }],
    shortDescription: 'Track-ready aerodynamic racing motorcycle engineered with carbon fiber fairings.',
    description: 'Constructed for apex competition. Pure racing DNA featuring a lightweight aluminum twin-spar chassis, Öhlins electronic suspension, race-spec titanium exhaust, and full telemetry telemetry tracking.',
    bullets: [
      'Hand-laid carbon-fiber aerodynamic fairings with downforce winglets',
      'Öhlins semi-active electronic suspension system for track dynamics',
      'Brembo Stylema monobloc calipers with dual floating 330mm carbon rotors',
      'Six-axis Bosch Inertial Measurement Unit (IMU) with cornering ABS and traction control'
    ],
    specifications: [
      { key: 'Chassis', value: 'Aluminum Twin-Spar with Carbon Subframe' },
      { key: 'Brakes', value: 'Brembo Stylema Monobloc' },
      { key: 'Suspension', value: 'Öhlins Electronic Semi-Active' }
    ],
    labels: ['best', 'featured'],
    tags: ['motogp', 'superbike', 'racing', 'carbon fiber', 'motorcycle']
  },
  {
    name: 'Ducati Panigale V4 S Carbon Track Sportbike Motorcycle',
    slug: 'ducati-panigale-v4s-carbon-sportbike',
    brand: 'Ducati',
    categorySlug: 'vehicles',
    price: 4900.00,
    costPrice: 3750.00,
    oldPrice: 5400.00,
    stock: 12,
    lowStockThreshold: 2,
    sku: 'TRZ-B8-VEH-DUC-PANV4S',
    image: 'https://cdn.dummyjson.com/product-images/motorcycle/sportbike-motorcycle/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/motorcycle/sportbike-motorcycle/thumbnail.webp', key: null }],
    shortDescription: '1,103cc Desmosedici Stradale V4 engine delivering 215.5 hp racing performance.',
    description: 'The pinnacle of Italian motorcycle engineering. The Panigale V4 S brings MotoGP engine architecture directly to road riders, paired with Öhlins Smart EC 2.0 electronic suspension and forged aluminum wheels.',
    bullets: [
      '1,103cc 90-degree V4 Desmosedici Stradale engine with counter-rotating crankshaft',
      'Öhlins Smart EC 2.0 electronically controlled active suspension suite',
      'Carbon-fiber aerodynamic double-profile aerodynamic wings for high-speed stability',
      'Ducati Power Launch (DPL) and Ducati Quick Shift (DQS) up/down EVO 2'
    ],
    specifications: [
      { key: 'Horsepower', value: '215.5 HP @ 13,000 RPM' },
      { key: 'Dry Weight', value: '174 kg (384 lbs)' },
      { key: 'Wheels', value: '3-Spoke Forged Aluminum Alloy' }
    ],
    labels: ['hot'],
    tags: ['ducati', 'panigale', 'sportbike', 'racing', 'v4']
  },
  {
    name: 'Dodge Hornet GT Plus AWD Performance Hybrid Utility Vehicle',
    slug: 'dodge-hornet-gt-plus-awd-utility-vehicle',
    brand: 'Dodge',
    categorySlug: 'vehicles',
    price: 4950.00,
    costPrice: 3800.00,
    oldPrice: 5450.00,
    stock: 8,
    lowStockThreshold: 2,
    sku: 'TRZ-B8-VEH-DOD-HRNT',
    image: 'https://cdn.dummyjson.com/product-images/vehicle/dodge-hornet-gt-plus/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/vehicle/dodge-hornet-gt-plus/thumbnail.webp', key: null }],
    shortDescription: 'Turbocharged Hurricane4 AWD performance crossover utility vehicle with sport suspension.',
    description: 'A muscle-inspired compact crossover utility vehicle built for spirited performance driving. Featuring all-wheel drive, dual-stage valve suspension, red Brembo fixed front calipers, and 12-inch digital cockpit.',
    bullets: [
      '2.0L Hurricane4 Turbo engine pumping out 268 hp and 295 lb-ft torque',
      'Standard Torque-Flite 9-speed automatic transmission with standard AWD',
      'Dual-stage valve suspension and Koni frequency selective damping',
      'Uconnect 5 multimedia platform with 10.25-inch center touchscreen'
    ],
    specifications: [
      { key: 'Drive Type', value: 'Intelligent All-Wheel Drive' },
      { key: 'Horsepower', value: '268 HP' },
      { key: 'Braking', value: 'Brembo 4-Piston Fixed Calipers' }
    ],
    labels: ['featured'],
    tags: ['dodge', 'hornet', 'awd', 'vehicle', 'crossover']
  },
  {
    name: 'Dodge Durango SXT 7-Passenger Full-Size Luxury SUV',
    slug: 'dodge-durango-sxt-7-passenger-luxury-suv',
    brand: 'Dodge',
    categorySlug: 'vehicles',
    price: 4900.00,
    costPrice: 3700.00,
    oldPrice: 5400.00,
    stock: 6,
    lowStockThreshold: 2,
    sku: 'TRZ-B8-VEH-DOD-DUR',
    image: 'https://cdn.dummyjson.com/product-images/vehicle/durango-sxt-rwd/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/vehicle/durango-sxt-rwd/thumbnail.webp', key: null }],
    shortDescription: 'Versatile 3.6L Pentastar V6 7-passenger SUV with 6,200 lbs towing capacity.',
    description: 'Three rows of comfort paired with unmistakable muscle car attitude. Equipped with the award-winning 3.6-liter Pentastar V6 engine, 8-speed automatic transmission, and over 50 seating configurations.',
    bullets: [
      'Award-winning 3.6L Pentastar V6 engine producing 295 hp and 260 lb-ft torque',
      'Class-leading maximum towing capability up to 6,200 pounds',
      'Spacious three-row seating comfortably accommodating up to seven passengers',
      'Near 50/50 front-to-rear weight distribution for exceptional road handling'
    ],
    specifications: [
      { key: 'Seating', value: '7 Passengers' },
      { key: 'Towing Capacity', value: '6,200 lbs' },
      { key: 'Engine', value: '3.6L Pentastar V6' }
    ],
    labels: ['best'],
    tags: ['dodge', 'durango', 'suv', '7 seater', 'automotive']
  },
  {
    name: 'Carlinkit 5.0 2air Wireless CarPlay & Android Auto Adapter',
    slug: 'carlinkit-5-0-2air-wireless-carplay-adapter',
    brand: 'Carlinkit',
    categorySlug: 'vehicles',
    price: 260.00,
    costPrice: 170.00,
    oldPrice: 310.00,
    stock: 350,
    lowStockThreshold: 20,
    sku: 'TRZ-B8-VEH-CLK-2AIR',
    image: 'https://images.unsplash.com/photo-1787750569966-b640cbd8f4e7?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1787750569966-b640cbd8f4e7?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Dual-band 5.8GHz plug-and-play wireless conversion dongle for factory car head units.',
    description: 'Convert wired CarPlay and wired Android Auto to 100% wireless seamlessly. Features automotive-grade 5.8GHz Wi-Fi and Bluetooth 5.2 hardware for ultra-low latency audio and map navigation.',
    bullets: [
      'Converts factory wired Apple CarPlay & Android Auto to effortless wireless',
      'High-speed 5.8GHz Wi-Fi transmission guarantees near-zero input lag',
      'Plug-and-play USB connection with automatic reconnection when engine starts',
      'Maintains full factory steering wheel controls, touchscreen, and knobs'
    ],
    specifications: [
      { key: 'Wireless', value: 'Wi-Fi 5.8GHz + Bluetooth 5.2' },
      { key: 'Compatibility', value: '98% of OEM Factory Wired CarPlay Vehicles' },
      { key: 'Power Input', value: '5V 1A USB-A / USB-C' }
    ],
    labels: ['trending'],
    tags: ['carlinkit', 'carplay', 'android auto', 'wireless', 'automotive']
  },
  {
    name: 'Chrysler 300 Touring Full-Size Luxury Sedan',
    slug: 'chrysler-300-touring-luxury-sedan',
    brand: 'Chrysler',
    categorySlug: 'vehicles',
    price: 4850.00,
    costPrice: 3650.00,
    oldPrice: 5350.00,
    stock: 5,
    lowStockThreshold: 1,
    sku: 'TRZ-B8-VEH-CHR-300T',
    image: 'https://cdn.dummyjson.com/product-images/vehicle/300-touring/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/vehicle/300-touring/thumbnail.webp', key: null }],
    shortDescription: 'Bold American full-size executive luxury sedan with 8-speed automatic transmission.',
    description: 'An iconic executive sedan with unmistakable road presence. Featuring acoustic windshield glass, dual-zone automatic climate control, rotary e-shift selector, and premium touring suspension.',
    bullets: [
      'Refined 3.6L Pentastar V6 with standard TorqueFlite 8-speed automatic transmission',
      'Spacious whisper-quiet cabin with acoustic laminated windshield and front door glass',
      'Uconnect 4C multimedia interface with 8.4-inch high-resolution touchscreen',
      'Performance 4-wheel independent touring suspension for sublime cruise quality'
    ],
    specifications: [
      { key: 'Body Style', value: 'Full-Size 4-Door Sedan' },
      { key: 'Engine', value: '3.6L Pentastar V6 292 HP' },
      { key: 'Infotainment', value: '8.4-inch Uconnect Touchscreen' }
    ],
    labels: ['featured'],
    tags: ['chrysler', 'sedan', 'luxury car', 'automotive', 'executive']
  },

  // =========================================================================
  // 3. FASHION & APPAREL (8 Products)
  // =========================================================================
  {
    name: 'Prada Galleria Medium Saffiano Leather Luxury Handbag',
    slug: 'prada-galleria-medium-saffiano-leather-handbag',
    brand: 'Prada',
    categorySlug: 'fashion',
    price: 3950.00,
    costPrice: 2800.00,
    oldPrice: 4400.00,
    stock: 25,
    lowStockThreshold: 3,
    sku: 'TRZ-B8-FSH-PRA-GAL',
    image: 'https://cdn.dummyjson.com/product-images/womens-bags/prada-women-bag/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/womens-bags/prada-women-bag/thumbnail.webp', key: null }],
    shortDescription: 'Iconic Italian crosshatch Saffiano calf leather tote bag with gold-tone hardware.',
    description: 'Defined by clean, tailored lines and artisanal precision, the Prada Galleria bag is made of Saffiano leather, an iconic material of the brand distinguished by its crosshatch texture and wax finish. Features double leather handles and detachable shoulder strap.',
    bullets: [
      'Handcrafted in Italy from patented crosshatch Saffiano textured calf leather',
      'Dual top rolled leather handles with removable adjustable leather shoulder strap',
      'Enamelled metal triangle logo plaque front and center',
      'Three interior compartments: two zippered pockets and central open compartment'
    ],
    specifications: [
      { key: 'Origin', value: 'Made in Italy' },
      { key: 'Material', value: '100% Saffiano Calf Leather' },
      { key: 'Hardware', value: 'Polished Gold-Tone Metal' },
      { key: 'Dimensions', value: '24 x 32 x 13.5 cm' }
    ],
    labels: ['best', 'featured'],
    tags: ['prada', 'handbag', 'luxury', 'saffiano', 'designer', 'italian']
  },
  {
    name: 'Heshe Vintage Full-Grain Top-Handle Leather Tote Bag',
    slug: 'heshe-vintage-full-grain-leather-tote-bag',
    brand: 'Heshe',
    categorySlug: 'fashion',
    price: 2250.00,
    costPrice: 1550.00,
    oldPrice: 2550.00,
    stock: 60,
    lowStockThreshold: 8,
    sku: 'TRZ-B8-FSH-HSH-TOTE',
    image: "https://cdn.dummyjson.com/product-images/womens-bags/heshe-women's-leather-bag/thumbnail.webp",
    images: [{ url: "https://cdn.dummyjson.com/product-images/womens-bags/heshe-women's-leather-bag/thumbnail.webp", key: null }],
    shortDescription: 'Supple full-grain cowhide leather designer handbag with brass hardware detailing.',
    description: 'Expertly constructed using vegetable-tanned full-grain cowhide leather that develops a rich, distinct patina over time. Equipped with reinforced dual top handles and heavy-duty antique brass metal fittings.',
    bullets: [
      '100% First-layer full-grain cowhide leather with natural grain texture',
      'Corrosion-resistant custom antique brass zippers and metal foot studs',
      'Multi-pocket interior with dedicated padded tablet sleeve and phone slot',
      'Includes detachable and adjustable wide leather crossbody shoulder strap'
    ],
    specifications: [
      { key: 'Material', value: 'Full-Grain Vegetable Tanned Cowhide' },
      { key: 'Hardware', value: 'Solid Antique Brass' },
      { key: 'Lining', value: 'High-Density Cotton Twill' }
    ],
    labels: ['trending'],
    tags: ['leather bag', 'tote', 'handbag', 'vintage', 'fashion']
  },
  {
    name: 'Saint Laurent Floor-Length Silk Crepe Black Evening Gala Gown',
    slug: 'saint-laurent-floor-length-silk-evening-gala-gown',
    brand: 'Saint Laurent',
    categorySlug: 'fashion',
    price: 3900.00,
    costPrice: 2750.00,
    oldPrice: 4350.00,
    stock: 20,
    lowStockThreshold: 3,
    sku: 'TRZ-B8-FSH-YSL-GWN',
    image: "https://cdn.dummyjson.com/product-images/womens-dresses/black-women's-gown/thumbnail.webp",
    images: [{ url: "https://cdn.dummyjson.com/product-images/womens-dresses/black-women's-gown/thumbnail.webp", key: null }],
    shortDescription: 'Sculptural Parisian 100% mulberry silk crepe floor-length evening formal gown.',
    description: 'An architectural silhouette cut from fluid heavy silk crepe. Designed with a plunging neckline, padded shoulders, and an elongated skirt with an alluring side slit for dramatic black-tie entrances.',
    bullets: [
      'Pure 100% heavyweight mulberry silk crepe draped to perfection in Paris',
      'Structured padded shoulders with subtle gathered waist draping',
      'Floor-sweeping column silhouette featuring a confident side leg slit',
      'Concealed back zip closure with silk-covered tonal button accents'
    ],
    specifications: [
      { key: 'Composition', value: '100% Mulberry Silk Crepe de Chine' },
      { key: 'Lining', value: '100% Silk Habotai' },
      { key: 'Origin', value: 'Made in France' }
    ],
    labels: ['featured'],
    tags: ['saint laurent', 'evening gown', 'silk dress', 'black tie', 'parisian luxury']
  },
  {
    name: 'Marni Runway Italian Wool Red & Black Tailored Trouser Suit',
    slug: 'marni-runway-italian-wool-tailored-trouser-suit',
    brand: 'Marni',
    categorySlug: 'fashion',
    price: 3450.00,
    costPrice: 2450.00,
    oldPrice: 3850.00,
    stock: 22,
    lowStockThreshold: 3,
    sku: 'TRZ-B8-FSH-MRN-SUIT',
    image: 'https://cdn.dummyjson.com/product-images/womens-dresses/marni-red-&-black-suit/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/womens-dresses/marni-red-&-black-suit/thumbnail.webp', key: null }],
    shortDescription: 'Striking color-block virgin wool tailored blazer jacket and matching flared trousers.',
    description: 'High-fashion tailoring from Milan. Crafted from fine virgin wool twill, this two-piece ensemble contrasts deep black and bold crimson with sharp peak lapels and horn buttons.',
    bullets: [
      'Crafted from 100% premium Italian virgin wool in a refined twill weave',
      'Slightly oversized single-breasted blazer with sharp peak lapels',
      'Matching high-rise wide-leg tailored trousers with pressed center creases',
      'Genuine buffalo horn buttons and cupro jacquard interior lining'
    ],
    specifications: [
      { key: 'Material', value: '100% Virgin Wool' },
      { key: 'Origin', value: 'Made in Italy' },
      { key: 'Care', value: 'Specialist Dry Clean Only' }
    ],
    labels: ['hot'],
    tags: ['marni', 'suit', 'tailoring', 'italian fashion', 'virgin wool']
  },
  {
    name: 'Alexander McQueen Leather Bustier & Flared Pleated Skirt Set',
    slug: 'alexander-mcqueen-leather-bustier-pleated-skirt-set',
    brand: 'Alexander McQueen',
    categorySlug: 'fashion',
    price: 3850.00,
    costPrice: 2700.00,
    oldPrice: 4250.00,
    stock: 18,
    lowStockThreshold: 2,
    sku: 'TRZ-B8-FSH-AMQ-BST',
    image: 'https://cdn.dummyjson.com/product-images/womens-dresses/corset-leather-with-skirt/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/womens-dresses/corset-leather-with-skirt/thumbnail.webp', key: null }],
    shortDescription: 'Sculpted lambskin leather corset bodice paired with knife-pleated midi skirt.',
    description: 'Iconic punk-couture design by Alexander McQueen. A molded, boned glove-soft lambskin leather bustier pairs seamlessly with a sharp knife-pleated high-waisted midi skirt.',
    bullets: [
      'Bustier crafted from 100% buttery Italian lambskin leather with internal boning',
      'Pleated midi skirt in technical gabardine with immaculate movement',
      'Silver-finished exposed metal zip closures with engraved zipper pulls',
      'Silky smooth breathable viscose-silk lining throughout'
    ],
    specifications: [
      { key: 'Bodice', value: '100% Italian Lambskin Leather' },
      { key: 'Skirt', value: 'Technical Wool Gabardine' },
      { key: 'Origin', value: 'Made in Italy' }
    ],
    labels: ['featured'],
    tags: ['alexander mcqueen', 'leather corset', 'couture', 'fashion', 'runway']
  },
  {
    name: 'Handcrafted Italian Full-Grain Leather Weekender Travel Bag',
    slug: 'handcrafted-italian-full-grain-leather-weekender-bag',
    brand: 'Bottega Artigiana',
    categorySlug: 'fashion',
    price: 2450.00,
    costPrice: 1700.00,
    oldPrice: 2750.00,
    stock: 45,
    lowStockThreshold: 5,
    sku: 'TRZ-B8-FSH-BOT-WKND',
    image: 'https://images.unsplash.com/photo-1536584754829-12214d404f32?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1536584754829-12214d404f32?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Full-grain vegetable-tanned Tuscan leather duffle with solid brass YKK zippers.',
    description: 'An heirloom quality travel companion made in Florence, Italy. Thick, supple Tuscan bridle leather with hand-burnished edges, reinforced base rivets, and detachable padded shoulder strap.',
    bullets: [
      'Genuine Tuscan vegetable-tanned full-grain cowhide leather',
      'Solid forged brass hardware with Japanese two-way YKK Excella zippers',
      'Generous 45L interior capacity conforms to international carry-on requirements',
      'Includes luggage tag and removable ergonomic leather shoulder pad'
    ],
    specifications: [
      { key: 'Capacity', value: '45 Liters' },
      { key: 'Leather', value: 'Tuscan Full-Grain Cowhide' },
      { key: 'Dimensions', value: '52 x 28 x 26 cm' }
    ],
    labels: ['best'],
    tags: ['leather bag', 'duffle', 'weekender', 'italian leather', 'travel']
  },
  {
    name: 'Jacques Marie Mage Dealan Polarized Acetate Sunglasses',
    slug: 'jacques-marie-mage-dealan-polarized-sunglasses',
    brand: 'Jacques Marie Mage',
    categorySlug: 'fashion',
    price: 2350.00,
    costPrice: 1600.00,
    oldPrice: 2600.00,
    stock: 40,
    lowStockThreshold: 5,
    sku: 'TRZ-B8-FSH-JMM-DLN',
    image: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Limited-edition 10mm block cured cellulose acetate handcrafted sunglasses.',
    description: 'Individually numbered collectible eyewear handcrafted in Japan. Featuring a 10mm block cellulose acetate frame, precious metal custom arrowhead rivets, and polarized mineral glass lenses with anti-reflective coating.',
    bullets: [
      'Handcrafted in Japan in a limited production batch of 500 numbered pieces',
      'Cut from 10mm thick cured cellulose acetate with sculpted beveling',
      'Custom 18K gold-plated sterling silver arrowhead front pins and wire cores',
      'Polarized scratch-resistant mineral glass lenses with backside AR treatment'
    ],
    specifications: [
      { key: 'Frame', value: '10mm Cured Japanese Acetate' },
      { key: 'Hardware', value: 'Sterling Silver 18K Gold Plated' },
      { key: 'Lenses', value: 'Polarized CR-39 Mineral Glass' }
    ],
    labels: ['featured'],
    tags: ['sunglasses', 'jacques marie mage', 'eyewear', 'luxury', 'limited edition']
  },
  {
    name: 'Matsuda Heritage Titanium Pilot Aviator Sunglasses',
    slug: 'matsuda-heritage-titanium-pilot-aviator-sunglasses',
    brand: 'Matsuda',
    categorySlug: 'fashion',
    price: 2150.00,
    costPrice: 1500.00,
    oldPrice: 2400.00,
    stock: 55,
    lowStockThreshold: 6,
    sku: 'TRZ-B8-FSH-MAT-AVT',
    image: 'https://images.unsplash.com/photo-1577803645773-f96470509666?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1577803645773-f96470509666?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Intricately hand-engraved Japanese pure titanium pilot aviator eyewear.',
    description: 'Each Matsuda creation represents over 250 individual artisanal steps in the workshops of Sabae, Japan. Detailed with signature hand-engraved scrollwork along the titanium eye wire, bridge, and temples.',
    bullets: [
      'Ultralight 100% Japanese pure titanium frame with hand-engraved detailing',
      'Titanium mesh side shields offer wind defense and iconic steampunk heritage',
      'UVA/UVB 100% polarized gradient lenses with 7-layer anti-reflective coating',
      'Hypoallergenic solid titanium nose pads with engraved Matsuda emblem'
    ],
    specifications: [
      { key: 'Material', value: 'Pure Japanese Titanium' },
      { key: 'Finish', value: 'Brushed Antique Gold' },
      { key: 'Protection', value: '100% UV400 Polarized' }
    ],
    labels: ['trending'],
    tags: ['matsuda', 'aviator', 'sunglasses', 'titanium', 'designer']
  },

  // =========================================================================
  // 4. MOBILES & TABLETS (6 Products)
  // =========================================================================
  {
    name: 'Apple iPad Mini (6th Generation) 256GB Wi-Fi + Cellular Starlight',
    slug: 'apple-ipad-mini-6th-gen-256gb-cellular-starlight',
    brand: 'Apple',
    categorySlug: 'mobiles',
    price: 799.00,
    costPrice: 590.00,
    oldPrice: 879.00,
    stock: 180,
    lowStockThreshold: 20,
    sku: 'TRZ-B8-MOB-IPAD-MINI',
    image: 'https://cdn.dummyjson.com/product-images/tablets/ipad-mini-2021-starlight/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/tablets/ipad-mini-2021-starlight/thumbnail.webp', key: null }],
    shortDescription: '8.3-inch Liquid Retina display with A15 Bionic chip and ultra-fast 5G cellular.',
    description: 'The mega-power of iPad in the palm of your hand. All-screen design with an 8.3-inch Liquid Retina display, blazing A15 Bionic chip, 12MP Ultra Wide front camera with Center Stage, and Apple Pencil (2nd gen) magnetic attachment.',
    bullets: [
      '8.3-inch Liquid Retina display with True Tone, P3 wide color, and anti-reflective coating',
      'A15 Bionic chip with 6-core CPU, 5-core GPU, and 16-core Neural Engine',
      'Ultra-fast 5G connectivity and Wi-Fi 6 for superfast wireless downloads',
      'USB-C connector for rapid charging and connecting high-bandwidth peripherals'
    ],
    specifications: [
      { key: 'Display', value: '8.3-inch Liquid Retina (2266 x 1488)' },
      { key: 'Chip', value: 'Apple A15 Bionic' },
      { key: 'Storage', value: '256GB' },
      { key: 'Cellular', value: '5G NR Sub-6 GHz' }
    ],
    labels: ['best', 'featured'],
    tags: ['apple', 'ipad mini', 'tablet', 'a15 bionic', '5g']
  },
  {
    name: 'Samsung Galaxy Tab S8+ 12.4\" Super AMOLED 256GB Tablet',
    slug: 'samsung-galaxy-tab-s8-plus-256gb-graphite',
    brand: 'Samsung',
    categorySlug: 'mobiles',
    price: 899.00,
    costPrice: 660.00,
    oldPrice: 979.00,
    stock: 140,
    lowStockThreshold: 15,
    sku: 'TRZ-B8-MOB-SAM-TABS8P',
    image: 'https://cdn.dummyjson.com/product-images/tablets/samsung-galaxy-tab-s8-plus-grey/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/tablets/samsung-galaxy-tab-s8-plus-grey/thumbnail.webp', key: null }],
    shortDescription: '12.4-inch 120Hz sAMOLED display with included low-latency S Pen and Snapdragon 8 Gen 1.',
    description: 'Unleash your creativity and productivity. The Galaxy Tab S8+ boasts a gorgeous 12.4-inch Super AMOLED screen, ultra-responsive S Pen with 2.8ms latency, Armor Aluminum frame, and Samsung DeX desktop mode.',
    bullets: [
      'Massive 12.4-inch Super AMOLED display with ultra-smooth 120Hz refresh rate',
      'Included ultra-low latency S Pen snaps magnetically to back for fast charging',
      'Qualcomm Snapdragon 8 Gen 1 flagship processor with 256GB expandable storage',
      'Quad speakers tuned by AKG with Dolby Atmos surround audio immersion'
    ],
    specifications: [
      { key: 'Screen Size', value: '12.4-inch sAMOLED (2800 x 1752)' },
      { key: 'Processor', value: 'Snapdragon 8 Gen 1' },
      { key: 'Battery', value: '10,090 mAh with 45W Super Fast Charging' }
    ],
    labels: ['hot'],
    tags: ['samsung', 'galaxy tab', 'tablet', 'amoled', 's pen']
  },
  {
    name: 'Apple iPhone X 256GB Space Gray (Factory Unlocked)',
    slug: 'apple-iphone-x-256gb-space-gray-unlocked',
    brand: 'Apple',
    categorySlug: 'mobiles',
    price: 450.00,
    costPrice: 310.00,
    oldPrice: 520.00,
    stock: 220,
    lowStockThreshold: 25,
    sku: 'TRZ-B8-MOB-APL-IPX256',
    image: 'https://cdn.dummyjson.com/product-images/smartphones/iphone-x/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/smartphones/iphone-x/thumbnail.webp', key: null }],
    shortDescription: 'Iconic 5.8-inch Super Retina OLED all-screen smartphone with surgical-grade steel frame.',
    description: 'The device that revolutionized modern smartphones. Featuring a surgical-grade stainless steel band, all-glass design, 5.8-inch Super Retina OLED panel, Face ID facial recognition, and dual optical image stabilization.',
    bullets: [
      '5.8-inch Super Retina OLED multi-touch display with HDR and True Tone',
      'Face ID facial authentication powered by TrueDepth camera system',
      'Dual 12MP wide-angle and telephoto cameras with dual optical stabilization',
      'Durable surgical-grade stainless steel frame with IP67 water and dust resistance'
    ],
    specifications: [
      { key: 'Display', value: '5.8-inch OLED Super Retina (2436 x 1125)' },
      { key: 'Storage', value: '256GB' },
      { key: 'Biometrics', value: 'Face ID' }
    ],
    labels: ['best'],
    tags: ['apple', 'iphone x', 'smartphone', 'oled', 'face id']
  },
  {
    name: 'Samsung Galaxy S10+ Prism Black 128GB (Factory Unlocked)',
    slug: 'samsung-galaxy-s10-plus-128gb-prism-black',
    brand: 'Samsung',
    categorySlug: 'mobiles',
    price: 480.00,
    costPrice: 330.00,
    oldPrice: 550.00,
    stock: 190,
    lowStockThreshold: 20,
    sku: 'TRZ-B8-MOB-SAM-S10P',
    image: 'https://cdn.dummyjson.com/product-images/smartphones/samsung-galaxy-s10/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/smartphones/samsung-galaxy-s10/thumbnail.webp', key: null }],
    shortDescription: '6.4-inch Quad HD+ Dynamic AMOLED cinematic Infinity-O display with ultrasonic fingerprint.',
    description: 'A benchmark in flagship Android mobility. Features a cinematic Dynamic AMOLED screen with HDR10+, pro-grade triple rear camera setup with ultra-wide angle, Wireless PowerShare, and all-day 4100mAh battery.',
    bullets: [
      '6.4-inch Curved Quad HD+ Dynamic AMOLED Infinity-O display with HDR10+',
      'Pro-grade triple camera system: 12MP Wide, 12MP Telephoto, 16MP Ultra-Wide',
      'Ultrasonic in-display fingerprint scanner works in all lighting conditions',
      'Wireless PowerShare allows reverse charging earbuds and smartwatches on the go'
    ],
    specifications: [
      { key: 'Display', value: '6.4\" Quad HD+ Dynamic AMOLED' },
      { key: 'Cameras', value: '12MP + 12MP + 16MP Triple Rear' },
      { key: 'Battery', value: '4100 mAh with Fast Wireless 2.0' }
    ],
    labels: ['trending'],
    tags: ['samsung', 'galaxy s10', 'smartphone', 'dynamic amoled', 'android']
  },
  {
    name: 'Samsung Galaxy S8 64GB Midnight Black (Factory Unlocked)',
    slug: 'samsung-galaxy-s8-64gb-midnight-black',
    brand: 'Samsung',
    categorySlug: 'mobiles',
    price: 360.00,
    costPrice: 240.00,
    oldPrice: 420.00,
    stock: 150,
    lowStockThreshold: 15,
    sku: 'TRZ-B8-MOB-SAM-S8',
    image: 'https://cdn.dummyjson.com/product-images/smartphones/samsung-galaxy-s8/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/smartphones/samsung-galaxy-s8/thumbnail.webp', key: null }],
    shortDescription: '5.8-inch Quad HD+ Super AMOLED Infinity Display with iris scanner authentication.',
    description: 'The pioneer of bezel-less design. Featuring a dual-curved Infinity Display that spills smoothly into the aluminum frame, 12MP Dual Pixel rear camera with OIS, IP68 water resistance, and high-performance octa-core processor.',
    bullets: [
      '5.8-inch Quad HD+ Super AMOLED Infinity Display (2960 x 1440 resolution)',
      '12MP Dual Pixel camera with f/1.7 aperture and optical image stabilization',
      'Iris scanner and rear fingerprint sensor for robust multi-factor security',
      'IP68 certified water and dust resistance up to 1.5 meters for 30 minutes'
    ],
    specifications: [
      { key: 'Screen', value: '5.8-inch Super AMOLED' },
      { key: 'Resolution', value: '2960 x 1440 pixels' },
      { key: 'Camera', value: '12MP Dual Pixel f/1.7 OIS' }
    ],
    labels: ['best'],
    tags: ['samsung', 'galaxy s8', 'infinity display', 'android', 'phone']
  },
  {
    name: 'Apple iPhone 6s Plus 128GB Space Gray (Unlocked)',
    slug: 'apple-iphone-6s-plus-128gb-space-gray',
    brand: 'Apple',
    categorySlug: 'mobiles',
    price: 290.00,
    costPrice: 195.00,
    oldPrice: 340.00,
    stock: 210,
    lowStockThreshold: 20,
    sku: 'TRZ-B8-MOB-APL-IP6SP',
    image: 'https://cdn.dummyjson.com/product-images/smartphones/iphone-6/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/smartphones/iphone-6/thumbnail.webp', key: null }],
    shortDescription: '5.5-inch Retina HD display with 7000 series aluminum body and 4K video recording.',
    description: 'Crafted from aerospace-grade 7000 series aluminum, featuring a 5.5-inch Retina HD screen with 3D Touch, 12MP iSight camera with Optical Image Stabilization, 4K video recording, and second-generation Touch ID.',
    bullets: [
      '5.5-inch Retina HD display with 1920x1080 resolution and 3D Touch technology',
      'A9 chip with integrated M9 motion coprocessor for snappy everyday performance',
      '12MP camera with Optical Image Stabilization (OIS) and 4K video capture',
      'Fast Touch ID fingerprint sensor embedded within the home button'
    ],
    specifications: [
      { key: 'Screen Size', value: '5.5-inch Retina HD' },
      { key: 'Camera', value: '12MP OIS / 4K @ 30fps' },
      { key: 'Storage', value: '128GB' }
    ],
    labels: ['best'],
    tags: ['apple', 'iphone 6s plus', 'smartphone', 'retina', 'unlocked']
  },

  // =========================================================================
  // 5. LAPTOPS & COMPUTERS (6 Products)
  // =========================================================================
  {
    name: 'Kensington SD5700T Thunderbolt 4 Dual 4K Enterprise Docking Station',
    slug: 'kensington-sd5700t-thunderbolt-4-dual-4k-dock',
    brand: 'Kensington',
    categorySlug: 'laptops',
    price: 2150.00,
    costPrice: 1500.00,
    oldPrice: 2400.00,
    stock: 80,
    lowStockThreshold: 10,
    sku: 'TRZ-B8-LAP-KEN-TB4',
    image: 'https://images.unsplash.com/photo-1616578273577-5d54546f4dec?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1616578273577-5d54546f4dec?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Enterprise-grade 11-in-1 Thunderbolt 4 dock delivering 90W host charging and 40Gbps throughput.',
    description: 'Unlock full Thunderbolt 4 capabilities for high-workload professional setups. Supports single 8K@30Hz or dual 4K@60Hz video output, 90W Power Delivery, 3x downstream Thunderbolt 4 ports, Gigabit Ethernet, and UHS-II SD card slot.',
    bullets: [
      'Official Intel Thunderbolt 4 Goshen Ridge chipset with 40Gbps transfer bandwidth',
      'Provides up to 90W Power Delivery to charge connected MacBooks and PC workstations',
      'Supports dual 4K 60Hz or single 8K 30Hz video displays via Thunderbolt ports',
      'Built-in UHS-II SD 4.0 card reader, Gigabit Ethernet, and 4x USB-A 3.2 Gen2 ports'
    ],
    specifications: [
      { key: 'Connectivity', value: 'Thunderbolt 4 (40Gbps)' },
      { key: 'Power Delivery', value: '90W to Host Laptop' },
      { key: 'Display Support', value: 'Dual 4K @ 60Hz or Single 8K @ 30Hz' }
    ],
    labels: ['best', 'featured'],
    tags: ['kensington', 'thunderbolt 4', 'docking station', 'laptop dock', 'macbook']
  },
  {
    name: 'Keychron Q1 Pro QMK/VIA Wireless Custom Mechanical Keyboard',
    slug: 'keychron-q1-pro-qmk-wireless-mechanical-keyboard',
    brand: 'Keychron',
    categorySlug: 'laptops',
    price: 380.00,
    costPrice: 245.00,
    oldPrice: 440.00,
    stock: 160,
    lowStockThreshold: 20,
    sku: 'TRZ-B8-LAP-KYC-Q1PRO',
    image: 'https://images.unsplash.com/photo-1635987391914-cb84b567e68f?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1635987391914-cb84b567e68f?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Full CNC anodized aluminum 75% mechanical keyboard with double-gasket acoustic mount.',
    description: 'Precision-engineered typing perfection. Crafted from 6063 aluminum, this 75% keyboard features seamless Bluetooth 5.1 wireless connectivity, double-gasket acoustic dampening, hot-swappable Keychron K Pro switches, and south-facing RGB.',
    bullets: [
      'Full CNC machined 6063 aerospace-grade aluminum chassis with anodized finish',
      'Double-gasket silicone mounting design delivers satisfying deep acoustics',
      'Broadcom Bluetooth 5.1 connects up to 3 devices simultaneously with Mac/Win toggle',
      'Fully customizable key remapping and macros via open-source QMK/VIA software'
    ],
    specifications: [
      { key: 'Layout', value: '75% Layout (81 Keys) with Rotary Knob' },
      { key: 'Chassis', value: 'CNC Machined 6063 Aluminum' },
      { key: 'Battery', value: '4000 mAh Rechargeable Li-Polymer' }
    ],
    labels: ['hot'],
    tags: ['keychron', 'mechanical keyboard', 'custom keyboard', 'qmk', 'wireless']
  },
  {
    name: 'WD_BLACK 2TB SN850X NVMe Internal PCIe Gen4 Gaming SSD',
    slug: 'wd-black-2tb-sn850x-nvme-pcie-gen4-ssd',
    brand: 'Western Digital',
    categorySlug: 'laptops',
    price: 280.00,
    costPrice: 185.00,
    oldPrice: 330.00,
    stock: 250,
    lowStockThreshold: 30,
    sku: 'TRZ-B8-LAP-WDB-SN850X',
    image: 'https://images.unsplash.com/photo-1760708626495-91e1415be067?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1760708626495-91e1415be067?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Ultra-fast 7,300 MB/s read speeds M.2 2280 gaming SSD with predictive caching.',
    description: 'Crush load times and eliminate throttling with the WD_BLACK SN850X NVMe SSD. Offering blistering read speeds up to 7,300 MB/s, integrated thermal heatsink compatibility, and Game Mode 2.0 optimization.',
    bullets: [
      'Extreme PCIe Gen4 performance delivering read speeds up to 7,300 MB/s',
      'Ultra-low latency delivers near-instant game world and high-res asset loading',
      'Western Digital Dashboard software enables Game Mode 2.0 predictive caching',
      'M.2 2280 form factor compatible with PlayStation 5 and modern PC motherboards'
    ],
    specifications: [
      { key: 'Capacity', value: '2TB' },
      { key: 'Sequential Read', value: 'Up to 7,300 MB/s' },
      { key: 'Interface', value: 'PCIe Gen4 x4, NVMe 1.4' }
    ],
    labels: ['best'],
    tags: ['wd black', 'ssd', 'nvme', 'pcie gen4', 'gaming', 'storage']
  },
  {
    name: 'Urban Commuter Weatherproof Laptop Workstation Backpack (30L)',
    slug: 'urban-commuter-weatherproof-laptop-backpack-30l',
    brand: 'Nomatic Travel',
    categorySlug: 'laptops',
    price: 2150.00,
    costPrice: 1480.00,
    oldPrice: 2400.00,
    stock: 95,
    lowStockThreshold: 10,
    sku: 'TRZ-B8-LAP-NOM-BP30',
    image: 'https://images.unsplash.com/photo-1567555922526-e9eb765d8921?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1567555922526-e9eb765d8921?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Ballistic waterproof Cordura 30L commuter pack with 16-inch TSA laptop compartment.',
    description: 'The ultimate professional commuter pack designed for tech executives and digital creators. Constructed from weatherproof 1680D ballistic nylon with dedicated suspended padded compartments for 16\" MacBook and 12.9\" iPad.',
    bullets: [
      'Weatherproof 1680D Cordura ballistic nylon exterior with water-resistant YKK zips',
      'TSA checkpoint-friendly lie-flat 16\" laptop and tablet organizational chamber',
      'RFID-blocking security pocket keeps credit cards and passports shielded',
      'Magnetic side water bottle pockets snap completely flush when not in use'
    ],
    specifications: [
      { key: 'Volume', value: '30 Liters' },
      { key: 'Laptop Fit', value: 'Up to 16-inch MacBook Pro' },
      { key: 'Material', value: '1680D Water-Resistant Ballistic Nylon' }
    ],
    labels: ['trending'],
    tags: ['laptop bag', 'backpack', 'commuter', 'tech', 'waterproof']
  },
  {
    name: 'NuPhy Air75 V2 Ultra-Slim Wireless Mechanical Keyboard',
    slug: 'nuphy-air75-v2-wireless-mechanical-keyboard',
    brand: 'NuPhy',
    categorySlug: 'laptops',
    price: 320.00,
    costPrice: 210.00,
    oldPrice: 370.00,
    stock: 140,
    lowStockThreshold: 15,
    sku: 'TRZ-B8-LAP-NUP-AIR75',
    image: 'https://images.unsplash.com/photo-1595044426077-d36d9236d54a?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1595044426077-d36d9236d54a?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'World’s thinnest low-profile QMK/VIA wireless mechanical keyboard with 1000Hz polling.',
    description: 'Engineered for portable typing perfection. The Air75 V2 features ultra-thin Gateron low-profile mechanical switches, 1000Hz 2.4G wireless polling rate, PBT dye-sublimated keycaps, and full QMK/VIA open-source programmability.',
    bullets: [
      'Ultra-compact low-profile aluminum frame sits naturally without wrist wrest',
      'Triple connectivity: 1000Hz 2.4GHz wireless, Bluetooth 5.1, and USB-C wired',
      'Ultra-thin COAST PBT keycaps with spherical ergonomics resist oil shine',
      'Gateron Low-Profile Mechanical Switches with hot-swappable PCB support'
    ],
    specifications: [
      { key: 'Switch Type', value: 'Gateron Low-Profile 2.0 Mechanical' },
      { key: 'Polling Rate', value: '1000Hz (2.4G & Wired)' },
      { key: 'Battery', value: '2500 mAh Li-ion (Up to 220 hrs)' }
    ],
    labels: ['hot'],
    tags: ['nuphy', 'low profile keyboard', 'mechanical', 'wireless', 'macbook']
  },
  {
    name: 'AnkerWork PowerConf C300 AI-Powered 1080p 60fps Conference Webcam',
    slug: 'ankerwork-powerconf-c300-ai-conference-webcam',
    brand: 'AnkerWork',
    categorySlug: 'laptops',
    price: 290.00,
    costPrice: 185.00,
    oldPrice: 340.00,
    stock: 175,
    lowStockThreshold: 20,
    sku: 'TRZ-B8-LAP-ANK-C300',
    image: 'https://images.unsplash.com/photo-1623949556303-b0d17d198863?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1623949556303-b0d17d198863?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'AI auto-framing 1080p 60fps webcam with HDR color balancing and dual noise-canceling mics.',
    description: 'Ensure you look crisp, professional, and composed on Zoom, Teams, and Google Meet. Features AI auto-framing that tracks your movement, intelligent auto-exposure for backlit offices, and dual stereo microphones.',
    bullets: [
      'Silky smooth 1080p full HD video capture at fluid 60 frames per second',
      'AI-powered auto-framing automatically tracks presenter and pans seamlessly',
      'Intelligent low-light correction and HDR prevent harsh window washouts',
      'Integrated physical privacy shutter slides closed for complete security'
    ],
    specifications: [
      { key: 'Resolution', value: '1080p Full HD @ 60 FPS' },
      { key: 'Field of View', value: 'Adjustable 78°, 90°, or 115°' },
      { key: 'Microphone', value: 'Dual AI Noise-Canceling Array' }
    ],
    labels: ['best'],
    tags: ['ankerwork', 'webcam', 'zoom', 'streaming', 'conference']
  },

  // =========================================================================
  // 6. ELECTRONICS & AUDIO (6 Products)
  // =========================================================================
  {
    name: 'Audioengine A2+ Wireless High-Resolution Desktop Speakers',
    slug: 'audioengine-a2-plus-wireless-desktop-speakers',
    brand: 'Audioengine',
    categorySlug: 'electronics',
    price: 2250.00,
    costPrice: 1550.00,
    oldPrice: 2550.00,
    stock: 70,
    lowStockThreshold: 8,
    sku: 'TRZ-B8-ELC-AUD-A2P',
    image: 'https://images.unsplash.com/photo-1711374704947-2b9cf5958311?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1711374704947-2b9cf5958311?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Hand-finished MDF wooden stereo studio monitors with aptX HD Bluetooth and built-in DAC.',
    description: 'Audiophile grade sound in a compact desktop profile. Built with custom aramid fiber woofers, silk dome tweeters, dual analog class A/B amplifiers, and 24-bit digital-to-analog converter with extended range aptX HD.',
    bullets: [
      'Dual Class A/B monolithic analog power amplifiers delivering 60W peak output',
      'Custom 2.75-inch aramid fiber woofers and 0.75-inch silk dome neodymium tweeters',
      'Bluetooth 5.0 with Qualcomm aptX HD and 24-bit DAC for bit-perfect audio',
      'Precision tuned acoustic front porting in handcrafted furniture-grade MDF cabinets'
    ],
    specifications: [
      { key: 'Amplifier', value: 'Dual Class A/B Monolithic (60W Peak)' },
      { key: 'DAC', value: '24-bit Digital Audio Converter' },
      { key: 'Frequency Response', value: '65Hz - 22kHz (±2.0dB)' }
    ],
    labels: ['featured', 'best'],
    tags: ['audioengine', 'speakers', 'audiophile', 'bluetooth', 'studio monitor']
  },
  {
    name: 'Edifier R1280DB Powered Bluetooth Bookshelf Studio Speakers',
    slug: 'edifier-r1280db-powered-bluetooth-bookshelf-speakers',
    brand: 'Edifier',
    categorySlug: 'electronics',
    price: 2100.00,
    costPrice: 1450.00,
    oldPrice: 2350.00,
    stock: 85,
    lowStockThreshold: 10,
    sku: 'TRZ-B8-ELC-EDI-R128',
    image: 'https://images.unsplash.com/photo-1786875950828-d15928cd2772?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1786875950828-d15928cd2772?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Classic walnut wood grain 42W RMS powered bookshelf monitors with optical & coaxial inputs.',
    description: 'Enrich your acoustic experience with studio sound. The R1280DB features 42W RMS total power, 4-inch bass driver, 13mm silk dome tweeter, wireless remote, optical/coaxial digital inputs, and Bluetooth connectivity.',
    bullets: [
      'Handcrafted natural wood grain enclosure minimizes acoustic cabinet resonance',
      'Optical and coaxial digital inputs provide lossless connection to modern TVs',
      '4-inch bass driver with calibrated front-facing flared bass reflex port',
      'Side-mounted precision equalizer dials for treble, bass, and master volume'
    ],
    specifications: [
      { key: 'Total Power Output', value: '42 Watts RMS (21W + 21W)' },
      { key: 'Input Types', value: 'Dual RCA, Optical, Coaxial, Bluetooth' },
      { key: 'Drivers', value: '4\" Bass Driver + 13mm Silk Dome Tweeter' }
    ],
    labels: ['hot'],
    tags: ['edifier', 'bookshelf speakers', 'bluetooth', 'studio sound', 'audio']
  },
  {
    name: 'AnkerWork PowerConf C310 4K Ultra HD Professional Conference Webcam',
    slug: 'ankerwork-powerconf-c310-4k-conference-webcam',
    brand: 'AnkerWork',
    categorySlug: 'electronics',
    price: 2100.00,
    costPrice: 1460.00,
    oldPrice: 2380.00,
    stock: 90,
    lowStockThreshold: 10,
    sku: 'TRZ-B8-ELC-ANK-C310',
    image: 'https://images.unsplash.com/photo-1586985564150-11ee04838034?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1586985564150-11ee04838034?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Ultra HD 4K 30fps webcam with Sony 1/2.8-inch sensor and AI-powered voice isolation.',
    description: 'Broadcast in cinema-level clarity. Equipped with a large 1/2.8\" Sony STARVIS CMOS sensor, precision glass lens, high dynamic range (HDR), AI person-framing, and beamforming microphones with VoiceRadar noise cancellation.',
    bullets: [
      'Stunning 4K Ultra HD resolution at 30 fps powered by Sony STARVIS sensor',
      'Intelligent VoiceRadar acoustic technology isolates speaker voices and eliminates room echo',
      'AI-driven auto focus locks onto subjects in under 0.3 seconds even in low light',
      'Built-in sliding privacy shield ensures physical camera disconnection'
    ],
    specifications: [
      { key: 'Sensor', value: '1/2.8-inch Sony STARVIS CMOS' },
      { key: 'Resolution', value: '4K @ 30 FPS / 1080p @ 60 FPS' },
      { key: 'Audio', value: 'Dual Beamforming Microphones with AI Noise Filtering' }
    ],
    labels: ['trending'],
    tags: ['webcam', '4k', 'ankerwork', 'conference', 'streaming']
  },
  {
    name: 'Apple AirPods Pro (2nd Generation) with MagSafe USB-C Case',
    slug: 'apple-airpods-pro-2nd-gen-usb-c',
    brand: 'Apple',
    categorySlug: 'electronics',
    price: 279.00,
    costPrice: 195.00,
    oldPrice: 320.00,
    stock: 300,
    lowStockThreshold: 30,
    sku: 'TRZ-B8-ELC-APL-APP2',
    image: 'https://cdn.dummyjson.com/product-images/mobile-accessories/apple-airpods/thumbnail.webp',
    images: [{ url: 'https://cdn.dummyjson.com/product-images/mobile-accessories/apple-airpods/thumbnail.webp', key: null }],
    shortDescription: 'Pro-level Active Noise Cancellation with Adaptive Audio and USB-C MagSafe charging.',
    description: 'Up to 2x more Active Noise Cancellation than previous generation. Powered by the Apple H2 chip, delivering Personalized Spatial Audio with dynamic head tracking, Adaptive Audio, and Conversation Awareness.',
    bullets: [
      'Apple-designed H2 headphone chip unlocks next-level acoustic computing and ANC',
      'Adaptive Audio dynamically blends Transparency mode and Active Noise Cancellation',
      'Personalized Spatial Audio with dynamic head tracking places sound all around you',
      'MagSafe Charging Case (USB-C) with Precision Finding speaker and lanyard loop'
    ],
    specifications: [
      { key: 'Processor', value: 'Apple H2 Audio Chip' },
      { key: 'Battery Life', value: 'Up to 6 Hours with ANC (30 Hours with Case)' },
      { key: 'Water Resistance', value: 'IP54 Dust, Sweat, and Water Resistant' }
    ],
    labels: ['best'],
    tags: ['apple', 'airpods pro', 'noise cancelling', 'earbuds', 'wireless']
  },
  {
    name: 'UGREEN Nexode 100W 4-Port GaN Desktop Fast Charging Station',
    slug: 'ugreen-nexode-100w-4port-gan-charging-station',
    brand: 'UGREEN',
    categorySlug: 'electronics',
    price: 299.00,
    costPrice: 190.00,
    oldPrice: 350.00,
    stock: 220,
    lowStockThreshold: 25,
    sku: 'TRZ-B8-ELC-UGR-100W',
    image: 'https://images.unsplash.com/photo-1600490722773-35753aea6332?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1600490722773-35753aea6332?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: '100W GaN desktop fast power station with 3 USB-C and 1 USB-A smart allocation ports.',
    description: 'Consolidate all chargers into one compact hub. Powered by advanced Navitas GaN chips, capable of fast-charging a 16\" MacBook Pro to 55% in just 30 minutes while powering your phone, watch, and tablet.',
    bullets: [
      '100W maximum single-port USB-C output charges laptops at lightning speed',
      '4-in-1 multi-device distribution: 3 USB-C ports and 1 USB-A fast charge port',
      'Next-generation Gallium Nitride (GaN) architecture runs cooler and 40% smaller',
      'Thermal Guard intelligent temperature management takes 800 scans every second'
    ],
    specifications: [
      { key: 'Total Power Output', value: '100 Watts Max' },
      { key: 'Ports', value: '3x USB-C + 1x USB-A' },
      { key: 'Fast Charge Protocols', value: 'PD 3.0, QC 4+, PPS, AFC, FCP' }
    ],
    labels: ['hot'],
    tags: ['ugreen', 'gan charger', '100w', 'usb-c', 'fast charger']
  },
  {
    name: 'Anker Prime 20,000mAh 200W Power Bank with Smart Digital Display',
    slug: 'anker-prime-20000mah-200w-power-bank',
    brand: 'Anker',
    categorySlug: 'electronics',
    price: 299.00,
    costPrice: 195.00,
    oldPrice: 345.00,
    stock: 180,
    lowStockThreshold: 20,
    sku: 'TRZ-B8-ELC-ANK-PRM20K',
    image: 'https://images.unsplash.com/photo-1585995603413-eb35b5f4a50b?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1585995603413-eb35b5f4a50b?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Colossal 20,000mAh battery pack with 200W combined output and real-time TFT display.',
    description: 'The definitive laptop power bank. Delivers up to 100W per USB-C port for charging two high-draw laptops simultaneously, with a full-color smart display providing real-time wattages and battery health.',
    bullets: [
      '200W ultra-high combined output with two 100W fast-charging USB-C ports',
      'Smart color digital display shows battery percentage, input/output wattage, and time',
      'Massive 20,000mAh capacity provides over 3 full phone charges or 1 full laptop charge',
      'ActiveShield 2.0 safety system performs 3,000,000 temperature checks daily'
    ],
    specifications: [
      { key: 'Capacity', value: '20,000 mAh (72Wh)' },
      { key: 'Max Single Port', value: '100W USB-C' },
      { key: 'Total Output', value: '200W Combined' }
    ],
    labels: ['best'],
    tags: ['anker', 'power bank', 'laptop charger', '200w', 'portable battery']
  },

  // =========================================================================
  // 7. HEALTH & WELLNESS (6 Products)
  // =========================================================================
  {
    name: 'Theragun PRO Gen 5 Deep Tissue Percussive Massage Gun',
    slug: 'theragun-pro-gen-5-percussive-massage-gun',
    brand: 'Therabody',
    categorySlug: 'health',
    price: 2499.00,
    costPrice: 1750.00,
    oldPrice: 2850.00,
    stock: 65,
    lowStockThreshold: 8,
    sku: 'TRZ-B8-HLT-THB-PRO5',
    image: 'https://images.unsplash.com/photo-1733517301512-33df59031e2c?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1733517301512-33df59031e2c?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Commercial-grade percussive therapy device with patented EQ-150 brushless motor and visual guided routines.',
    description: 'The gold standard in athletic recovery trusted by world champions. Delivers 16mm amplitude reaching 60% deeper into muscle than consumer vibration guns, paired with an OLED screen showing built-in therapy routines.',
    bullets: [
      'Proprietary EQ-150 brushless motor with QuietForce Technology delivering 60 lbs stall force',
      'Deep 16mm amplitude reaches 60% deeper into muscle tissue to melt away tension',
      'Rotatable triangular multi-grip ergonomic arm reaches 80% of the body with zero wrist strain',
      'OLED display with 4 visual recovery presets and Bluetooth companion app syncing'
    ],
    specifications: [
      { key: 'Amplitude', value: '16 mm' },
      { key: 'Stall Force', value: '60 lbs (27 kg)' },
      { key: 'Speeds', value: 'Customizable 1750 - 2400 PPM' }
    ],
    labels: ['featured', 'best'],
    tags: ['theragun', 'massage gun', 'recovery', 'percussive therapy', 'fitness']
  },
  {
    name: 'Hyperice Hypervolt 2 Pro High-Torque Percussive Massager',
    slug: 'hyperice-hypervolt-2-pro-percussive-massager',
    brand: 'Hyperice',
    categorySlug: 'health',
    price: 1850.00,
    costPrice: 1300.00,
    oldPrice: 2100.00,
    stock: 75,
    lowStockThreshold: 10,
    sku: 'TRZ-B8-HLT-HYP-VOLT2',
    image: 'https://images.unsplash.com/photo-1746278925416-9d6c71f55c2d?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1746278925416-9d6c71f55c2d?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Professional percussion massage device with 90W high-torque motor and digital speed dial.',
    description: 'Get deep relief from stiff muscles with the strongest percussive device from Hyperice. Featuring 5 variable speed levels navigated via an infinity dial, patented Pressure Sensor Technology, and QuietGlide motor.',
    bullets: [
      'Heavy-duty 90W high-torque brushless motor delivers deep, penetrating percussion',
      'Digital speed dial provides 5 precise percussion levels up to 3200 percussions per minute',
      'Patented Pressure Sensor Technology displays visual feedback on applied force',
      'Removable rechargeable lithium-ion battery provides up to 3 hours of continuous runtime'
    ],
    specifications: [
      { key: 'Motor', value: 'Brushless High-Torque 90W' },
      { key: 'Speeds', value: '5 Variable Speed Settings (up to 3200 PPM)' },
      { key: 'Battery', value: 'Rechargeable 24V Lithium-Ion' }
    ],
    labels: ['hot'],
    tags: ['hyperice', 'hypervolt', 'massage gun', 'recovery', 'muscle relief']
  },
  {
    name: 'Theragun Mini Gen 2 Ultra-Portable Deep Tissue Massage Gun',
    slug: 'theragun-mini-gen-2-ultra-portable-massage-gun',
    brand: 'Therabody',
    categorySlug: 'health',
    price: 299.00,
    costPrice: 195.00,
    oldPrice: 349.00,
    stock: 200,
    lowStockThreshold: 25,
    sku: 'TRZ-B8-HLT-THB-MINI2',
    image: 'https://images.unsplash.com/photo-1611908200005-b898ddde09cf?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1611908200005-b898ddde09cf?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Pocket-sized ergonomic percussive therapy device 20% smaller and 30% lighter.',
    description: 'Pocket-sized wellness that goes wherever you go. The Theragun Mini Gen 2 packs 12mm amplitude and 20 lbs of no-stall force into a lightweight ergonomic triangle chassis with Bluetooth app connectivity.',
    bullets: [
      'Ultra-compact palm-sized design fits easily into gym duffles, backpacks, or carry-ons',
      'Proprietary QX35 brushless motor with QuietForce technology delivers near-silent operation',
      '3 scientifically calibrated speed levels (1750, 2100, 2400 percussions per minute)',
      'Universal USB-C fast charging delivers up to 120 minutes of total battery life'
    ],
    specifications: [
      { key: 'Amplitude', value: '12 mm' },
      { key: 'Weight', value: '1 lb (0.45 kg)' },
      { key: 'Battery', value: '120 Minutes Runtime via USB-C' }
    ],
    labels: ['best'],
    tags: ['theragun', 'mini', 'massage gun', 'portable', 'wellness']
  },
  {
    name: 'Philips SmartSleep HF3520 Sunrise Simulation Alarm Wake-Up Light',
    slug: 'philips-smartsleep-hf3520-sunrise-wake-up-light',
    brand: 'Philips',
    categorySlug: 'health',
    price: 2150.00,
    costPrice: 1480.00,
    oldPrice: 2400.00,
    stock: 90,
    lowStockThreshold: 10,
    sku: 'TRZ-B8-HLT-PHI-SUN',
    image: 'https://images.unsplash.com/photo-1663416827757-c98066d93625?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1663416827757-c98066d93625?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Clinically proven colored sunrise simulation therapy light clock with FM radio and nature sounds.',
    description: 'Wake up naturally energized. Inspired by natural sunrise, light gradually increases through 20 brightness settings from soft morning red through orange to bright daylight yellow, prompting your body to wake up refreshed.',
    bullets: [
      'Clinically proven colored sunrise simulation promotes natural and energetic waking',
      'Dusk simulation feature dims light gradually to prepare your brain and body for sleep',
      'Choice of 5 soothing natural acoustic wake-up sounds or digital FM radio alarm',
      'Smart touch-sensitive display with automatic auto-dimming room light sensor'
    ],
    specifications: [
      { key: 'Brightness Levels', value: '20 Settings up to 300 Lux' },
      { key: 'Sound Options', value: '5 Natural Sounds + FM Radio' },
      { key: 'Simulation Duration', value: 'Adjustable 20 to 40 Minutes' }
    ],
    labels: ['trending'],
    tags: ['philips', 'wake up light', 'sunrise clock', 'sleep therapy', 'health']
  },
  {
    name: 'T3 AireLuxe Digital Ionic Professional Salon Hair Dryer',
    slug: 't3-aireluxe-digital-ionic-hair-dryer',
    brand: 'T3',
    categorySlug: 'health',
    price: 2250.00,
    costPrice: 1550.00,
    oldPrice: 2500.00,
    stock: 80,
    lowStockThreshold: 10,
    sku: 'TRZ-B8-HLT-T3-AIR',
    image: 'https://images.unsplash.com/photo-1522338140262-f46f5913618a?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1522338140262-f46f5913618a?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Smart digital ionic blow dryer with custom engineered fan and 15 heat/speed pairings.',
    description: 'Cut drying time while retaining up to 60% more natural hair moisture. T3 RapidAire technology delivers an airstream infused with 10 million negative ions per second to eliminate frizz and leave a radiant shine.',
    bullets: [
      'Engineered with a custom fan that propels a 128% wider airflow for faster drying',
      'Ion generator saturates airflow with negative ions to seal the cuticle and banish frizz',
      'Smart microchip controls 5 heat settings and 3 speed options for all hair textures',
      'Volume boost switch enhances natural body while the lock-in cool shot sets styles'
    ],
    specifications: [
      { key: 'Technology', value: 'T3 RapidAire Ion Generator' },
      { key: 'Settings', value: '15 Heat / Speed Combinations' },
      { key: 'Power', value: '1875 Watts AC Motor' }
    ],
    labels: ['best'],
    tags: ['t3', 'hair dryer', 'ionic', 'hair care', 'beauty device']
  },
  {
    name: 'Salon Pro Infrared Ceramic Tourmaline Ionic Hair Blow Dryer',
    slug: 'salon-pro-infrared-ceramic-hair-dryer',
    brand: 'Salon Pro',
    categorySlug: 'health',
    price: 2100.00,
    costPrice: 1450.00,
    oldPrice: 2350.00,
    stock: 85,
    lowStockThreshold: 10,
    sku: 'TRZ-B8-HLT-SLN-DRY',
    image: 'https://images.unsplash.com/photo-1727364438136-6edc10ef0a52?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1727364438136-6edc10ef0a52?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Far-infrared ceramic heating hair dryer with lightweight brushless DC motor.',
    description: 'Delivers salon blowout results with zero heat damage. Far-infrared wavelengths gently penetrate the hair cortex from the inside out, drying hair twice as fast while protecting precious keratin proteins.',
    bullets: [
      'Far-infrared light waves dry hair from within, preserving hair moisture balance',
      'High-speed 110,000 RPM brushless motor generates high-velocity air velocity',
      'Tourmaline-infused ceramic grill emits millions of natural smoothing ions',
      'Ultra-lightweight 380g balanced ergonomic design eliminates wrist fatigue'
    ],
    specifications: [
      { key: 'Motor', value: '110,000 RPM Brushless DC Motor' },
      { key: 'Weight', value: '380 grams' },
      { key: 'Attachments', value: 'Magnetic Concentrator Nozzle + Diffuser' }
    ],
    labels: ['hot'],
    tags: ['hair dryer', 'infrared', 'ceramic', 'salon', 'blowout']
  },

  // =========================================================================
  // 8. BEAUTY & FRAGRANCES (10 Products)
  // =========================================================================
  {
    name: 'Dr. Dennis Gross DRx SpectraLite FaceWare Pro LED Light Therapy Mask',
    slug: 'dr-dennis-gross-drx-spectralite-faceware-pro-mask',
    brand: 'Dr. Dennis Gross',
    categorySlug: 'beauty',
    price: 2850.00,
    costPrice: 2000.00,
    oldPrice: 3200.00,
    stock: 50,
    lowStockThreshold: 6,
    sku: 'TRZ-B8-BTY-DDG-MASK',
    image: 'https://images.unsplash.com/photo-1740350631565-6a5081a2f841?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1740350631565-6a5081a2f841?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'FDA-cleared medical grade 162-LED light therapy mask targeting wrinkles and blemishes.',
    description: 'A revolutionary 3-minute hands-free at-home treatment. Uses 100 red LED lights to stimulate collagen and elastin production alongside 62 blue LED lights that destroy acne-causing bacteria.',
    bullets: [
      'FDA-cleared medical device featuring 100 red LED lights and 62 blue LED lights',
      'Quick 3-minute automated daily treatment with automatic shutoff timer',
      'Combines red and blue wavelengths simultaneously to smooth lines and clear skin',
      'Flexible medical silicone design with adjustable head strap for all face shapes'
    ],
    specifications: [
      { key: 'LED Count', value: '162 Medical-Grade LEDs' },
      { key: 'Wavelengths', value: 'Red (630nm/660nm) & Blue (415nm)' },
      { key: 'Treatment Time', value: '3 Minutes Daily' }
    ],
    labels: ['featured', 'best'],
    tags: ['led mask', 'skincare device', 'anti aging', 'dr dennis gross', 'beauty']
  },
  {
    name: 'BaBylissPRO Nano Titanium Ultra-Thin 1.5\" Straightening Flat Iron',
    slug: 'babylisspro-nano-titanium-ultra-thin-flat-iron',
    brand: 'BaBylissPRO',
    categorySlug: 'beauty',
    price: 2200.00,
    costPrice: 1520.00,
    oldPrice: 2450.00,
    stock: 80,
    lowStockThreshold: 10,
    sku: 'TRZ-B8-BTY-BBY-NANO',
    image: 'https://images.unsplash.com/photo-1577716595717-f4c363695556?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1577716595717-f4c363695556?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Exceptional titanium plate flat iron with 50 heat settings up to 450°F.',
    description: 'The salon professional choice for silky smooth glass hair. Extra-long 5-inch titanium plates conduct ultra-high heat and resist corrosion, straightening wider sections of hair with single-pass perfection.',
    bullets: [
      'Ultra-thin and lightweight body profile maximizes styling comfort and control',
      '50 digital heat settings reaching up to 450°F (232°C) for all hair types',
      'Extended 5-inch nano titanium plates allow larger hair sections to be styled faster',
      'Ceramic heater provides instant heat-up with zero temperature drop during passes'
    ],
    specifications: [
      { key: 'Plate Width', value: '1.5 inches (Extended 5\" length)' },
      { key: 'Plate Material', value: 'Pure Nano Titanium' },
      { key: 'Max Temperature', value: '450°F (232°C)' }
    ],
    labels: ['best'],
    tags: ['babylisspro', 'flat iron', 'straightener', 'nano titanium', 'hair styling']
  },
  {
    name: 'Revlon One-Step Volumizer Plus 2.0 Titanium Ceramic Hot Air Brush',
    slug: 'revlon-one-step-volumizer-plus-2-hot-air-brush',
    brand: 'Revlon',
    categorySlug: 'beauty',
    price: 270.00,
    costPrice: 175.00,
    oldPrice: 310.00,
    stock: 190,
    lowStockThreshold: 20,
    sku: 'TRZ-B8-BTY-REV-VOL2',
    image: 'https://images.unsplash.com/photo-1734111719430-fe4a3973f8af?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1734111719430-fe4a3973f8af?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: '2.4-inch titanium tourmaline oval barrel blow dryer brush with four heat settings.',
    description: 'Dry and style in up to half the time. The slimmer 2.4-inch oval head creates lift at the roots and bouncy ends, while the titanium ceramic barrel provides even heat distribution for long-lasting volume.',
    bullets: [
      'Smaller 2.4-inch oval barrel design creates dramatic root lift and soft curls',
      'Titanium ceramic tourmaline barrel provides even heat distribution to prevent damage',
      'Four heat and speed settings including a cool air shot to lock in finished styles',
      'Charcoal-infused nylon pin bristles detangle smoothly without snagging'
    ],
    specifications: [
      { key: 'Barrel Size', value: '2.4 inches' },
      { key: 'Coating', value: 'Titanium Ceramic Tourmaline' },
      { key: 'Heat Settings', value: 'Low, Med, High, Cool' }
    ],
    labels: ['hot'],
    tags: ['revlon', 'hot air brush', 'volumizer', 'blowout', 'hair care']
  },
  {
    name: '24K Pure Gold Cellular Recovery Anti-Aging Night Cream (50ml)',
    slug: '24k-pure-gold-cellular-recovery-night-cream',
    brand: 'L’Elixir Doré',
    categorySlug: 'beauty',
    price: 2650.00,
    costPrice: 1850.00,
    oldPrice: 2950.00,
    stock: 60,
    lowStockThreshold: 8,
    sku: 'TRZ-B8-BTY-GLD-50ML',
    image: 'https://images.unsplash.com/photo-1629732097571-b042b35aa3ed?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1629732097571-b042b35aa3ed?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Luxury Swiss peptide night cream suspended with 24-karat colloidal gold flakes.',
    description: 'Formulated in Switzerland, this ultra-rich night treatment harnesses the anti-inflammatory power of 24K colloidal gold, multi-molecular hyaluronic acid, and Matrixyl 3000 to visibly restore youthful skin elasticity.',
    bullets: [
      'Infused with 24K pure bio-active gold flakes that dissolve into dermal layers',
      'Triple-peptide complex visibly firms sagging skin and smooths deep expression lines',
      'Enriched with wild rosehip oil, squalane, and coenzyme Q10 for radiant overnight glow',
      'Free from synthetic parabens, sulfates, silicones, and artificial fragrances'
    ],
    specifications: [
      { key: 'Volume', value: '50 ml / 1.7 fl. oz.' },
      { key: 'Key Ingredients', value: '24K Colloidal Gold, Matrixyl 3000, Squalane' },
      { key: 'Origin', value: 'Formulated in Geneva, Switzerland' }
    ],
    labels: ['featured'],
    tags: ['gold cream', 'anti aging', 'luxury skincare', 'night cream', 'beauty']
  },
  {
    name: 'Triple Active 20% Vitamin C Radiance & Brightening Serum (50ml)',
    slug: 'triple-active-20-percent-vitamin-c-serum',
    brand: 'Botanique Bio',
    categorySlug: 'beauty',
    price: 2400.00,
    costPrice: 1650.00,
    oldPrice: 2700.00,
    stock: 90,
    lowStockThreshold: 10,
    sku: 'TRZ-B8-BTY-VITC-50',
    image: 'https://images.unsplash.com/photo-1741896135512-084b251887f7?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1741896135512-084b251887f7?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'High-potency clinical L-ascorbic acid serum with ferulic acid and pure vitamin E.',
    description: 'A revolutionary antioxidant powerhouse. Formulated with 20% pure L-ascorbic acid stabilized with 1% ferulic acid and 1% alpha-tocopherol to neutralize free radicals and diminish hyperpigmentation.',
    bullets: [
      'Potent 20% concentration of pharmaceutical grade pure L-ascorbic acid',
      'Synergistic combination of Ferulic Acid and Vitamin E multiplies photoprotection by 8x',
      'Fades stubborn dark spots, sun spots, and post-blemish marks within 14 days',
      'Packaged in amber glass bottle with nitrogen-flushed seal to ensure fresh potency'
    ],
    specifications: [
      { key: 'Active Ingredients', value: '20% L-Ascorbic Acid, 1% Ferulic Acid, 1% Vit E' },
      { key: 'pH Level', value: 'Optimized 2.8 - 3.2' },
      { key: 'Volume', value: '50 ml' }
    ],
    labels: ['best'],
    tags: ['vitamin c', 'brightening serum', 'antioxidant', 'skincare', 'radiance']
  },
  {
    name: 'Advanced 10% Niacinamide + Zinc Pore-Refining Face Serum (50ml)',
    slug: 'advanced-10-percent-niacinamide-zinc-face-serum',
    brand: 'Dermacell Clinical',
    categorySlug: 'beauty',
    price: 2350.00,
    costPrice: 1600.00,
    oldPrice: 2650.00,
    stock: 110,
    lowStockThreshold: 15,
    sku: 'TRZ-B8-BTY-NIA-50',
    image: 'https://images.unsplash.com/photo-1573461160327-b450ce3d8e7f?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1573461160327-b450ce3d8e7f?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'High-strength vitamin B3 and zinc formula to balance oil and tighten enlarged pores.',
    description: 'Combat enlarged pores, uneven skin texture, and excess oil production. Contains 10% pure Niacinamide with 1% Zinc PCA to soothe redness, reinforce the skin lipid barrier, and smooth rough patches.',
    bullets: [
      'High-strength 10% pure Niacinamide (Vitamin B3) balances sebum activity',
      '1% Zinc PCA reduces visible congestion and soothes sensitive, stressed skin',
      'Visibly tightens enlarged pores and refines coarse skin texture',
      'Water-light fast-absorbing formula leaves a soft matte velvety finish'
    ],
    specifications: [
      { key: 'Niacinamide', value: '10% High Purity Vitamin B3' },
      { key: 'Zinc PCA', value: '1%' },
      { key: 'Volume', value: '50 ml / 1.7 oz' }
    ],
    labels: ['trending'],
    tags: ['niacinamide', 'serum', 'pore refining', 'zinc', 'skincare']
  },
  {
    name: 'Dior Addict Peptide Nourishing Rosewood Lip Glow Oil',
    slug: 'dior-addict-peptide-lip-glow-oil-rosewood',
    brand: 'Dior',
    categorySlug: 'beauty',
    price: 2150.00,
    costPrice: 1480.00,
    oldPrice: 2450.00,
    stock: 130,
    lowStockThreshold: 15,
    sku: 'TRZ-B8-BTY-DIO-LIP',
    image: 'https://images.unsplash.com/photo-1631214524049-0ebbbe6d81aa?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1631214524049-0ebbbe6d81aa?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Color-awakening nourishing lip oil infused with cherry oil for intense mirror shine.',
    description: 'The genuine icon of runway beauty. Dior Lip Glow Oil deeply protects and enhances lips, bringing out their natural color with Color Reviver technology. Non-sticky, non-greasy texture enriched with cherry oil.',
    bullets: [
      'Color Reviver technology reacts directly to lip moisture level for custom rosy tint',
      'Enriched with protective nourishing cherry oil to form a cocooning comfort film',
      'Delivers intense ultra-glossy mirror shine without stickiness or heaviness',
      'Extra-soft pampering applicator envelops lips in a single generous swipe'
    ],
    specifications: [
      { key: 'Shade', value: '012 Rosewood' },
      { key: 'Finish', value: 'Glassy Mirror Shine' },
      { key: 'Infusion', value: 'Prunus Cerasus (Bitter Cherry) Seed Oil' }
    ],
    labels: ['best'],
    tags: ['dior', 'lip oil', 'lip glow', 'beauty', 'makeup', 'luxury']
  },
  {
    name: 'Depuffing Caffeine & Green Tea Multi-Peptide Firming Eye Cream',
    slug: 'depuffing-caffeine-green-tea-firming-eye-cream',
    brand: 'Clinique Organics',
    categorySlug: 'beauty',
    price: 2200.00,
    costPrice: 1500.00,
    oldPrice: 2500.00,
    stock: 120,
    lowStockThreshold: 12,
    sku: 'TRZ-B8-BTY-EYE-CAF',
    image: 'https://images.unsplash.com/photo-1613803745799-ba6c10aace85?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1613803745799-ba6c10aace85?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Targeted botanical eye treatment with cooling ceramic tip to banish dark circles.',
    description: 'Erase signs of fatigue in minutes. Contains 5% highly soluble caffeine paired with epigallocatechin gallatyl glucoside (EGCG) from green tea leaves to drain fluid retention and brighten under-eye shadows.',
    bullets: [
      '5% concentrated Caffeine actively reduces vascular swelling and morning puffiness',
      'Purified EGCG from green tea delivers potent polyphenol antioxidant defense',
      'Argireline multi-peptide firming complex targets crow’s feet and fine lines',
      'Cool-touch ceramic applicator delivers an instant de-puffing lymphatic massage'
    ],
    specifications: [
      { key: 'Volume', value: '30 ml / 1.0 fl. oz.' },
      { key: 'Actives', value: '5% Caffeine, Green Tea EGCG, Palmitoyl Tripeptide' },
      { key: 'Application', value: 'AM & PM under-eye contour' }
    ],
    labels: ['hot'],
    tags: ['eye cream', 'caffeine', 'dark circles', 'anti aging', 'skincare']
  },
  {
    name: 'Artisan Handcrafted 15-Piece Cruelty-Free Professional Makeup Brush Set',
    slug: 'artisan-15-piece-professional-makeup-brush-set',
    brand: 'Chantecaille Artistry',
    categorySlug: 'beauty',
    price: 2300.00,
    costPrice: 1580.00,
    oldPrice: 2600.00,
    stock: 75,
    lowStockThreshold: 8,
    sku: 'TRZ-B8-BTY-BRS-SET',
    image: 'https://images.unsplash.com/photo-1620464003286-a5b0d79f32c2?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1620464003286-a5b0d79f32c2?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Hand-tied micro-crystal vegan fiber brush set with weighted FSC beechwood handles.',
    description: 'Designed for makeup artists who demand surgical precision. Each brush is hand-tied with custom micro-crystal synthetic fibers that mimic the cuticle structure of natural goat hair without animal cruelty.',
    bullets: [
      '15 essential face, contour, and eye brushes for flawless blending and buffing',
      'Advanced micro-crystal vegan bristles pick up and distribute powder with zero fallout',
      'Weighted ergonomic handles turned from FSC-certified sustainable solid beechwood',
      'Seamless electroplated aluminum ferrules guaranteed against shedding for a lifetime'
    ],
    specifications: [
      { key: 'Piece Count', value: '15 Brushes + Vegan Leather Case' },
      { key: 'Bristles', value: 'Micro-Crystal Synthetic Vegan Fibers' },
      { key: 'Handles', value: 'FSC Solid Beechwood' }
    ],
    labels: ['featured'],
    tags: ['makeup brushes', 'beauty tools', 'cruelty free', 'cosmetics', 'artistry']
  },
  {
    name: 'Pure Damask Rosewater Hydrating Face & Body Mist Toner (200ml)',
    slug: 'pure-damask-rosewater-hydrating-mist-toner',
    brand: 'Rose De Grasse',
    categorySlug: 'beauty',
    price: 280.00,
    costPrice: 175.00,
    oldPrice: 320.00,
    stock: 220,
    lowStockThreshold: 25,
    sku: 'TRZ-B8-BTY-ROSE-200',
    image: 'https://images.unsplash.com/photo-1599847987657-881f11b92a75?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1599847987657-881f11b92a75?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: '100% pure steam-distilled organic Bulgarian Rosa Damascena hydrosol mist.',
    description: 'Harvested by hand at dawn in the Rose Valley of Bulgaria. Steam-distilled using fresh rose blossoms to preserve precious botanical aromatics, toning and re-balancing skin pH with a soothing cloud of hydration.',
    bullets: [
      '100% Organic steam-distilled Rosa Damascena flower water with zero added alcohol',
      'Naturally balances skin pH, reduces redness, and provides instant soothing hydration',
      'Micro-mist pump produces an ultra-fine cloud that can be applied over makeup',
      'Free from synthetic preservatives, artificial dyes, and parabens'
    ],
    specifications: [
      { key: 'Volume', value: '200 ml / 6.7 fl. oz.' },
      { key: 'Source', value: 'Organic Bulgarian Rosa Damascena Blossoms' },
      { key: 'Bottle', value: 'UV-Protected Frosted Glass' }
    ],
    labels: ['best'],
    tags: ['rosewater', 'toner', 'mist', 'organic', 'skincare']
  }
];

console.log('Batch 8 defined with:', BATCH_8_PRODUCTS.length, 'products so far.');
