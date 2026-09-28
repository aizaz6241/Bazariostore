import fs from 'fs';
import { BATCH_8_PRODUCTS as part1 } from './data/batch8-part1.js';
import { BATCH_8_PART2_PRODUCTS as part2 } from './data/batch8-part2.js';

// We apply our verified visual corrections to Part 1 and Part 2 items:
const refinedPart1 = part1.map(p => {
  const item = { ...p };
  // 1. Peak Design Camera Backpack & Gear (img_04 / photo-1536584754829-12214d404f32)
  if (p.image.includes('photo-1536584754829-12214d404f32')) {
    item.name = 'Peak Design Everyday Camera Backpack 30L & Professional Field Kit';
    item.slug = 'peak-design-everyday-camera-backpack-30l-pro-field-kit';
    item.brand = 'Peak Design';
    item.categorySlug = 'fashion'; // also accessories/bags
    item.shortDescription = 'Weatherproof 30L camera backpack with customizable FlexFold dividers and laptop sleeve.';
    item.description = 'The ultimate backpack for photographers and creators. Crafted from 100% recycled 400D weatherproof nylon canvas with dual side access, MagLatch hardware, dedicated 16-inch laptop chamber, and FlexFold dividers.';
    item.bullets = [
      '100% Recycled 400D weatherproof nylon canvas shell with DWR coating and dual PU undercoats',
      'Patented MagLatch closure provides fast, secure top access with expandable internal volume',
      'Configurable FlexFold internal dividers keep camera bodies, lenses, and drone gear protected',
      'Dedicated padded sleeve securely holds up to 16-inch MacBook Pro and tablet'
    ];
    item.specifications = [
      { key: 'Capacity', value: '30 Liters (Expandable)' },
      { key: 'Material', value: 'Weatherproof 400D Double Poly-Coated Canvas' },
      { key: 'Laptop Fit', value: 'Up to 16-inch Laptop' }
    ];
    item.tags = ['peak design', 'camera bag', 'backpack', 'creator gear', 'travel pack'];
  }

  // 2. Ray-Ban Wayfarer Classic Polarized Black Sunglasses (img_05 / photo-1572635196237-14b3f281503f)
  if (p.image.includes('photo-1572635196237-14b3f281503f')) {
    item.name = 'Ray-Ban Original Wayfarer Classic Polarized Black Sunglasses';
    item.slug = 'ray-ban-original-wayfarer-classic-polarized-sunglasses';
    item.brand = 'Ray-Ban';
    item.shortDescription = 'Timeless black acetate square sunglasses with G-15 polarized crystal mineral glass lenses.';
    item.description = 'The most recognizable style in the history of sunglasses. First sculpted in 1952, the Original Wayfarer Classic delivers pure vintage heritage featuring glossy black acetate frame and polarized green G-15 mineral glass lenses.';
    item.bullets = [
      'Authentic glossy black acetate frame with iconic silver temple rivet accents',
      'Polarized G-15 green mineral glass lenses eliminate 99.9% of reflective glare',
      'High optical clarity with 100% UV400 radiation protection',
      'Handcrafted in Italy with 7-barrel metal hinge assemblies'
    ];
    item.specifications = [
      { key: 'Frame Material', value: 'Hypoallergenic Polished Acetate' },
      { key: 'Lenses', value: 'Polarized G-15 Mineral Glass' },
      { key: 'Origin', value: 'Made in Italy' }
    ];
    item.tags = ['ray-ban', 'wayfarer', 'sunglasses', 'polarized', 'eyewear'];
  }

  // 3. Oliver Peoples / Moscot Crystal Acetate Sunglasses Amber Lenses (img_06 / photo-1577803645773-f96470509666)
  if (p.image.includes('photo-1577803645773-f96470509666')) {
    item.name = 'Oliver Peoples Gregory Peck Round Crystal Acetate Sunglasses';
    item.slug = 'oliver-peoples-gregory-peck-crystal-acetate-sunglasses';
    item.brand = 'Oliver Peoples';
    item.shortDescription = 'Handcrafted transparent crystal acetate round sunglasses with amber polarized glass lenses.';
    item.description = 'Inspired by the signature style worn by Atticus Finch. Handcrafted from custom transparent crystal cured acetate, featuring amber brown polarized glass lenses, keyhole bridge, and custom engraved filigree core wire.',
    item.bullets = [
      'Handcrafted from premium transparent crystal cured cellulose acetate',
      'Amber brown polarized glass lenses with backside anti-reflective coating',
      'Retro keyhole bridge design with functional two-dot front silver pins',
      'Engraved feather filigree wire core visible through transparent temples'
    ];
    item.specifications = [
      { key: 'Frame Color', value: 'Buff Crystal Clear' },
      { key: 'Lens Tint', value: 'Polarized Amber Brown' },
      { key: 'Bridge', value: 'Classic Keyhole Bridge' }
    ];
    item.tags = ['oliver peoples', 'sunglasses', 'crystal acetate', 'polarized', 'luxury eyewear'];
  }

  // 4. uni USB-C Multiport Hub (img_07 / photo-1616578273577-5d54546f4dec)
  if (p.image.includes('photo-1616578273577-5d54546f4dec')) {
    item.name = 'uni Accessories USB-C Multiport Hub & High-Speed SD Card Reader Dock';
    item.slug = 'uni-accessories-usb-c-multiport-hub-sd-card-reader';
    item.brand = 'uni Accessories';
    item.shortDescription = 'Sleek aluminum USB-C hub with protective silicone bumper, SD/MicroSD slots, and USB 3.0.';
    item.description = 'Designed for on-the-go creative workflows. Features a rugged aluminum shell with silicone bumper grip, braided nylon cable, dual high-speed UHS-I SD and MicroSD card slots, and USB 3.0 data connectivity for MacBook and iPad.',
    item.bullets = [
      'Braided nylon USB-C connector cable with reinforced strain relief joints',
      'Simultaneous dual card reading: supports SD, SDHC, SDXC, MicroSD, and TF cards',
      'Removable non-slip silicone rubber bumper guards against desktop scratches and drops',
      'Universal plug-and-play compatibility with macOS, iPadOS, Windows, and ChromeOS'
    ];
    item.specifications = [
      { key: 'Card Slots', value: 'UHS-I SD + MicroSD (Up to 104 MB/s)' },
      { key: 'Data Transfer', value: 'USB 3.0 up to 5Gbps' },
      { key: 'Body', value: 'Aluminum Alloy with Silicone Bumper' }
    ];
    item.tags = ['uni', 'usb-c hub', 'card reader', 'macbook accessory', 'dock'];
  }

  // 5. XPG Lancer RGB DDR5 RAM (img_09 / photo-1760708626495-91e1415be067)
  if (p.image.includes('photo-1760708626495-91e1415be067')) {
    item.name = 'XPG Lancer RGB 64GB (4x16GB) DDR5 6000MHz Desktop Gaming RAM Kit';
    item.slug = 'xpg-lancer-rgb-64gb-ddr5-6000mhz-ram-kit';
    item.brand = 'XPG';
    item.shortDescription = 'Quad-channel 64GB DDR5 6000MHz gaming memory with brushed aluminum heatsinks and RGB lightbar.';
    item.description = 'Unleash next-gen DDR5 performance with XPG Lancer RGB memory. Features 1:1 power management IC (PMIC) stability, on-die ECC error correction, heavy brushed aluminum thermal spreaders, and customizable RGB lighting.',
    item.bullets = [
      '64GB Quad-channel kit (4 x 16GB) running at lightning 6000 MT/s bandwidth',
      'Geometric brushed aluminum heat spreaders provide rapid thermal dissipation',
      'Customizable diffused RGB lightbar compatible with all major motherboard sync apps',
      'Supports Intel XMP 3.0 and AMD EXPO for seamless one-click overclocking'
    ];
    item.specifications = [
      { key: 'Capacity', value: '64GB (4x 16GB)' },
      { key: 'Speed', value: 'DDR5 6000 MHz (PC5-48000)' },
      { key: 'Timing', value: 'CL30-40-40 @ 1.35V' }
    ];
    item.tags = ['xpg', 'ddr5', 'gaming ram', 'pc memory', 'rgb'];
  }

  // 6. The North Face Mountain Daypack (img_10 / photo-1567555922526-e9eb765d8921)
  if (p.image.includes('photo-1567555922526-e9eb765d8921')) {
    item.name = 'The North Face Recon Weatherproof Mountain Trail Daypack (30L)';
    item.slug = 'the-north-face-recon-mountain-trail-daypack-30l';
    item.brand = 'The North Face';
    item.shortDescription = 'Iconic 30L all-weather trail backpack with FlexVent suspension and hydration reservoir sleeve.';
    item.description = 'Engineered for mountain adventures and daily trail commutes. Features the American Chiropractic Association certified FlexVent suspension system, stretch mesh front stash pocket, water bottle holsters, and padded protective compartment.',
    item.bullets = [
      'Endorsed FlexVent suspension system features articulated shoulder straps and rounded back panel',
      'Spacious 30L volume with front stretch-stash compartment and external bungee cord storage',
      'Durable water-repellent (non-PFC DWR) recycled ripstop nylon construction',
      'High-visibility 360-degree reflectivity keeps you visible in low-light trails'
    ];
    item.specifications = [
      { key: 'Capacity', value: '30 Liters' },
      { key: 'Suspension', value: 'FlexVent Ergonomic System' },
      { key: 'Fabric', value: '210D Recycled Nylon Ripstop with DWR' }
    ];
    item.tags = ['the north face', 'backpack', 'hiking pack', 'outdoor', 'trail'];
  }

  // 7. Logitech StreamCam (img_12 / photo-1623949556303-b0d17d198863)
  if (p.image.includes('photo-1623949556303-b0d17d198863')) {
    item.name = 'Logitech StreamCam Full HD 1080p 60fps Streaming Webcam (Off-White)';
    item.slug = 'logitech-streamcam-full-hd-1080p-60fps-webcam';
    item.brand = 'Logitech';
    item.shortDescription = 'Premium 1080p 60fps vertical & horizontal webcam with smart auto-focus and facial tracking.';
    item.description = 'Take your content and video conferences to the next level. Stream in vibrant, true-to-life Full HD 1080p at 60 fps with AI facial tracking, auto-exposure, dual front-facing microphones, and USB-C connectivity.',
    item.bullets = [
      'Crisp Full HD 1080p at fluid 60 fps capture for smooth video streaming',
      'Smart auto-focus and intelligent auto-exposure powered by facial tracking',
      'Rotate 90 degrees to instantly record in vertical 9:16 format for social media',
      'Dual omnidirectional microphones with built-in noise reduction filter'
    ];
    item.specifications = [
      { key: 'Resolution', value: '1080p @ 60 FPS' },
      { key: 'Connection', value: 'USB 3.1 Type-C Direct' },
      { key: 'Lens', value: 'Premium Full HD Glass Lens f/2.0' }
    ];
    item.tags = ['logitech', 'streamcam', 'webcam', '1080p60', 'streaming'];
  }

  // 8. Zoom Rooms Software Suite (img_15 / photo-1586985564150-11ee04838034)
  if (p.image.includes('photo-1586985564150-11ee04838034')) {
    item.name = 'Zoom Rooms Enterprise Multi-Display Video Conference & Collaboration Suite';
    item.slug = 'zoom-rooms-enterprise-video-conference-suite';
    item.brand = 'Zoom';
    item.shortDescription = 'Complete enterprise room cloud conferencing license with wireless sharing and digital whiteboard.',
    item.description = 'Transform any meeting space into an effortless collaborative video conference hub. Includes one-touch join, wireless content sharing, smart digital whiteboarding, and multi-screen gallery view for enterprise teams.',
    item.bullets = [
      'One-touch meeting launch compatible with all major conference room hardware',
      'Wireless high-resolution screen sharing with multi-participant co-annotation',
      'Enterprise cloud administrative console with real-time room health telemetry',
      'Supports up to 1,000 interactive video participants with end-to-end encryption'
    ];
    item.specifications = [
      { key: 'Deployment', value: 'Enterprise Room Annual Multi-License' },
      { key: 'Video Support', value: '1080p Full HD Multi-Stream' },
      { key: 'Security', value: '256-bit AES-GCM Encryption' }
    ];
    item.tags = ['zoom', 'video conference', 'enterprise software', 'collaboration', 'office'];
  }

  // 9. Anker Slim Aluminum Power Bank (img_17 / photo-1585995603413-eb35b5f4a50b)
  if (p.image.includes('photo-1585995603413-eb35b5f4a50b')) {
    item.name = 'Anker Aluminum Ultra-Slim Portable Charger Power Bank with 3-in-1 Braided Fast Charging Cable';
    item.slug = 'anker-aluminum-ultra-slim-power-bank-braided-cable';
    item.brand = 'Anker';
    item.shortDescription = 'Sleek anodized aluminum external battery pack with multi-head braided nylon fast-charging cable.';
    item.description = 'Minimalist power on the go. Encased in seamless bead-blasted anodized aluminum, this slim high-density power bank comes bundled with a heavy-duty 3-in-1 nylon braided cable (Lightning, USB-C, Micro-USB) for universal fast charging.',
    item.bullets = [
      'Ultra-thin 14mm brushed aluminum alloy enclosure with scratch-resistant anodization',
      'Bundled with heavy-duty 3-in-1 nylon braided fast-charging cable with reinforced tips',
      'PowerIQ and VoltageBoost deliver optimized high-speed charging to any connected device',
      'MultiProtect 11-point safety system protects against short circuits and temperature spikes'
    ];
    item.specifications = [
      { key: 'Capacity', value: '10,000 mAh High-Density Li-Polymer' },
      { key: 'Shell', value: 'Precision CNC Anodized Aluminum' },
      { key: 'Cable', value: 'Braided 3-in-1 (USB-C, Lightning, Micro-USB)' }
    ];
    item.tags = ['anker', 'power bank', 'portable charger', 'charging cable', 'battery'];
  }

  // 10. Commercial Gym Pull-Up Station (img_18 / photo-1733517301512-33df59031e2c)
  if (p.image.includes('photo-1733517301512-33df59031e2c')) {
    item.name = 'Rogue Fitness Commercial Heavy-Duty Steel Calisthenics Rig & Multi-Grip Pull-Up Power Tower';
    item.slug = 'rogue-commercial-steel-calisthenics-pull-up-power-tower';
    item.brand = 'Rogue Fitness';
    item.shortDescription = 'Heavy-gauge 11-gauge steel calisthenics tower with multi-grip chin-up bars and dip handles.',
    item.description = 'Built for hardcore athletic training centers and luxury home gyms. Constructed from 3x3\" 11-gauge structural steel tubing with knurled multi-angle pull-up bars, gymnastic ring attachment points, and solid laser-cut gussets.',
    item.bullets = [
      'Fabricated from heavy 3x3\" 11-gauge American structural steel with textured matte black powder coat',
      'Multi-grip knurled chin-up bar supports wide, narrow, neutral, and angled hand positions',
      'Includes heavy-duty Olympic gymnastic ring anchor mounts and dip station horns',
      'Tested to safely support dynamic athletic training loads in excess of 1,000 lbs'
    ];
    item.specifications = [
      { key: 'Steel Spec', value: '3x3\" 11-Gauge Structural Steel' },
      { key: 'Footprint', value: '48\" x 52\" x 92\" (L x W x H)' },
      { key: 'Weight Capacity', value: '1,000+ lbs Dynamic Load' }
    ];
    item.tags = ['rogue', 'pull up station', 'power tower', 'calisthenics', 'gym equipment'];
  }

  // 11. Laifen Swift Ionic Hair Dryer (img_19 / photo-1746278925416-9d6c71f55c2d)
  if (p.image.includes('photo-1746278925416-9d6c71f55c2d')) {
    item.name = 'Laifen Swift High-Speed Digital Ionic Hair Dryer with Smart Airflow LED Ring Display';
    item.slug = 'laifen-swift-high-speed-ionic-hair-dryer-led-display';
    item.brand = 'Laifen';
    item.shortDescription = '110,000 RPM high-speed brushless hair dryer with circular 3-color temperature ring indicator.',
    item.description = 'Experience whisper-quiet ultra-fast drying. Equipped with a 110,000 RPM high-speed brushless motor generating 22m/s airspeed, 200 million negative ions, and an intuitive circular LED halo ring displaying airflow thermal status.',
    item.bullets = [
      '110,000 RPM proprietary brushless motor dries long hair in just 2 to 5 minutes',
      'Intelligent 3-color circular LED ring visually displays current temperature and airflow mode',
      'Generates 200 million negative ions per cubic centimeter to eliminate frizz and boost gloss',
      'Microprocessor thermal sensor monitors air temperature 100 times per second to prevent heat damage'
    ];
    item.specifications = [
      { key: 'Motor Speed', value: '110,000 RPM Brushless Motor' },
      { key: 'Air Speed', value: '22 meters / second' },
      { key: 'Display', value: '3-Color LED Temperature Ring Display' }
    ];
    item.tags = ['laifen', 'hair dryer', 'ionic', 'brushless motor', 'beauty device'];
  }

  // 12. Naipo Handheld Massage Gun (img_20 / photo-1611908200005-b898ddde09cf)
  if (p.image.includes('photo-1611908200005-b898ddde09cf')) {
    item.name = 'Naipo Deep Tissue Percussive Handheld Muscle Massage Gun with Adjustable Speed';
    item.slug = 'naipo-deep-tissue-percussive-muscle-massage-gun';
    item.brand = 'Naipo';
    item.shortDescription = 'Ergonomic handheld percussion massager with high-torque motor and interchangeable therapy heads.',
    item.description = 'Soothe soreness and accelerate post-workout recovery. Featuring a high-torque brushless motor, multi-level percussive intensity, ergonomic non-slip silicone grip, and interchangeable specialized massage heads.',
    item.bullets = [
      'High-torque brushless motor delivers intense deep-tissue percussion with ultra-quiet operation',
      'Includes specialized interchangeable massage attachments: ball, bullet, fork, and flat silicone heads',
      'Rechargeable long-lasting lithium battery delivers up to 6 hours of continuous runtime',
      'Ergonomic cylindrical grip with simple one-touch speed control button'
    ];
    item.specifications = [
      { key: 'Speed Levels', value: '5 Adjustable Percussion Speeds' },
      { key: 'Attachments', value: '5 Interchangeable Massage Heads' },
      { key: 'Battery', value: '2500 mAh Rechargeable Lithium-Ion' }
    ];
    item.tags = ['naipo', 'massage gun', 'deep tissue', 'muscle recovery', 'percussion'];
  }

  // 13. Vintage Twin-Bell Alarm Clock (img_21 / photo-1663416827757-c98066d93625)
  if (p.image.includes('photo-1663416827757-c98066d93625')) {
    item.name = 'Vintage Twin-Bell Silent Non-Ticking Quartz Bedside Alarm Clock (Cream White)';
    item.slug = 'vintage-twin-bell-silent-quartz-alarm-clock-cream';
    item.brand = 'Artemis Home';
    item.categorySlug = 'home-decor';
    item.shortDescription = 'Classic twin-bell mechanical hammer alarm clock with silent sweep quartz movement and warm backlight.',
    item.description = 'Timeless vintage bedside charm. Crafted with an all-metal iron housing and polished chrome twin bells, featuring a super-loud mechanical hammer strike for heavy sleepers and a whisper-silent non-ticking quartz sweep second hand.',
    item.bullets = [
      'Authentic mechanical hammer bell alarm rings loud enough to awaken the deepest sleepers',
      'Smooth continuous sweep quartz movement operates 100% silent with zero ticking sound',
      'Soft warm-glow push button backlight illuminates the vintage numeral face at night',
      'Heavy-duty all-metal casing finished in nostalgic matte cream enamel with polished chrome accents'
    ];
    item.specifications = [
      { key: 'Movement', value: 'Silent Non-Ticking Quartz Sweep' },
      { key: 'Alarm Type', value: 'Mechanical Hammer Twin-Bell' },
      { key: 'Material', value: 'Iron Metal Casing + Glass Lens' }
    ];
    item.tags = ['alarm clock', 'vintage clock', 'twin bell', 'home decor', 'bedside'];
  }

  // 14. T3 SinglePass Luxe Flat Iron (img_25 / photo-1577716595717-f4c363695556)
  if (p.image.includes('photo-1577716595717-f4c363695556')) {
    item.name = 'T3 SinglePass Luxe White & Rose Gold Professional Ceramic Hair Straightener Flat Iron';
    item.slug = 't3-singlepass-luxe-white-rose-gold-flat-iron';
    item.brand = 'T3 Micro';
    item.shortDescription = 'Digital 1-inch custom-blend ceramic flat iron with 5 heat settings and rose gold accents.',
    item.description = 'One pass to silky smooth shine. Powered by Digital T3 SinglePass technology with an internal microchip that ensures even, consistent heat along custom ceramic plates with beveled edges for snag-free straightening and waves.',
    item.bullets = [
      'Digital T3 SinglePass technology maintains uniform heat with zero temperature drops',
      'Custom blend ceramic plates emit negative ions to seal hair cuticles and maximize shine',
      '5 digitally controlled heat settings (260°F to 410°F) accommodate every hair texture',
      'Curved bevel body design easily transitions between sleek pin-straight styles and voluminous curls'
    ];
    item.specifications = [
      { key: 'Plate Width', value: '1.0 Inch Beveled Ceramic' },
      { key: 'Finish', value: 'Luxe White with Polished Rose Gold Trim' },
      { key: 'Max Temperature', value: '410°F (210°C)' }
    ];
    item.tags = ['t3', 'flat iron', 'straightener', 'rose gold', 'hair styling'];
  }

  // 15. Luxury Moisturizer Duo (img_27 / photo-1629732097571-b042b35aa3ed)
  if (p.image.includes('photo-1629732097571-b042b35aa3ed')) {
    item.name = 'Luxury Regenerating Collagen & Ultra-Hydrating Day and Night Moisturizer Cream Duo (2 x 50ml)';
    item.slug = 'regenerating-collagen-ultra-hydrating-moisturizer-duo';
    item.brand = 'Dermacell Clinical';
    item.shortDescription = 'Dual 50ml frosted glass jars of Regenerating Collagen and Ultra-Hydrating deep facial moisturizers.';
    item.description = 'The ultimate 24-hour hydration ritual. Includes one jar of Ultra-Hydrating Daytime Radiance Moisturizer enriched with multi-weight hyaluronic acid, and one jar of Regenerating Collagen Night Cream with bio-peptides.',
    item.bullets = [
      'Includes two full-size 50ml frosted glass jars: Ultra-Hydrating Moisturizer & Regenerating Collagen Cream',
      'Ultra-Hydrating formula binds 1,000x its weight in water to plump fine dehydration lines',
      'Regenerating Collagen formula stimulates fibroblasts and repairs the skin barrier overnight',
      'Clean clinical formulation free of mineral oil, parabens, phthalates, and synthetic fragrance'
    ];
    item.specifications = [
      { key: 'Volume', value: '2 x 50 ml / 1.7 fl. oz. Jars' },
      { key: 'Jars Included', value: 'Ultra-Hydrating Moisturiser + Regenerating Collagen Cream' },
      { key: 'Packaging', value: 'Frosted Glass Jars with White Screw Caps' }
    ];
    item.tags = ['moisturizer', 'collagen cream', 'skincare duo', 'hydration', 'anti aging'];
  }

  return item;
});

// Now apply corrections to Part 2 items:
const refinedPart2 = part2.map(p => {
  const item = { ...p };

  // 1. Solo Stove Smokeless Fire Pit (img_37 / photo-1478131143081-80f7f84ca84d)
  if (p.image.includes('photo-1478131143081-80f7f84ca84d')) {
    item.name = 'Solo Stove Yukon 2.0 Smokeless Stainless Steel Outdoor Fire Pit & Campfire Gathering Kit';
    item.slug = 'solo-stove-yukon-2-smokeless-outdoor-fire-pit-kit';
    item.brand = 'Solo Stove';
    item.shortDescription = 'Massive 27-inch 304 stainless steel smokeless wood-burning fire pit with removable ash pan.',
    item.description = 'Gather around the ultimate backyard and campsite centerpiece. The Solo Stove Yukon 2.0 features patented 360-degree signature airflow that preheats air for a secondary burn, virtually eliminating smoke while producing mesmerizing fires.',
    item.bullets = [
      'Patented 360-degree Airflow Design superheats air to burn off smoke before it escapes',
      'Built from heavy-duty 304 stainless steel with exceptional thermal and rust resistance',
      'Removable ash pan and base plate make cleanup effortless after every bonfire',
      'Includes heavy-duty weather cover and stainless steel safety stand'
    ];
    item.specifications = [
      { key: 'Diameter', value: '27 inches (68.5 cm)' },
      { key: 'Material', value: '304 Stainless Steel' },
      { key: 'Weight', value: '41.6 lbs (18.9 kg)' }
    ];
    item.tags = ['solo stove', 'fire pit', 'smokeless fire', 'campfire', 'outdoor'];
  }

  // 2. Filson Waxed Canvas Rucksack Backpack (img_39 / photo-1577733966973-d680bffd2e80)
  if (p.image.includes('photo-1577733966973-d680bffd2e80')) {
    item.name = 'Filson Handcrafted Heavy Waxed Canvas & Bridle Leather Rucksack Backpack';
    item.slug = 'filson-waxed-canvas-bridle-leather-rucksack-backpack';
    item.brand = 'Filson';
    item.shortDescription = 'Heritage 22oz rugged twill & tin cloth backpack with saddle-grade English bridle leather harness.',
    item.description = 'Indestructible American craftsmanship. Made from heavy paraffin-treated 22oz rugged twill and oil-finish tin cloth that repels rain and snow, equipped with saddle-grade English bridle leather straps and solid brass buckles.',
    item.bullets = [
      'Heavyweight 22oz water-repellent industrial rugged twill and Tin Cloth canvas',
      'Vegetable-tanned English bridle leather shoulder straps and closure straps',
      'Custom solid brass sand-cast hardware with rustproof lifetime durability',
      'Storm flap top with drawstring inner closure keeps backcountry gear completely dry'
    ];
    item.specifications = [
      { key: 'Volume', value: '28 Liters' },
      { key: 'Material', value: '22oz Rugged Twill + English Bridle Leather' },
      { key: 'Origin', value: 'Made in USA' }
    ];
    item.tags = ['filson', 'rucksack', 'waxed canvas', 'backpack', 'leather pack'];
  }

  // 3. Acne Studios Chunky Multi-Color Sneakers (img_40 / photo-1560769629-975ec94e6a86)
  if (p.image.includes('photo-1560769629-975ec94e6a86')) {
    item.name = 'Acne Studios Chunky Multi-Color Leather & Suede Designer Platform Sneakers';
    item.slug = 'acne-studios-chunky-multi-color-platform-sneakers';
    item.brand = 'Acne Studios';
    item.shortDescription = 'Avant-garde sculpted platform sneakers with color-block leather, mesh, and suede panelling.',
    item.description = 'Sculptural Scandinavian street style. Crafted from an intricate patchwork of calf leather, fine suede, and breathable technical mesh in vibrant teal, ochre, purple, and cream on a multi-layer chunky EVA sole.',
    item.bullets = [
      'Multi-layer panelling combining smooth calf leather, supple suede, and breathable mesh',
      'Exaggerated sculptural platform midsole provides all-day cushioning and bold height',
      'Eye-catching colorblocking with contrast scarlet laces and heel pull tabs',
      'Padded collar and tongue lined with breathable technical mesh for blister-free comfort'
    ];
    item.specifications = [
      { key: 'Upper', value: 'Calf Leather, Suede & Technical Mesh' },
      { key: 'Sole', value: 'Sculpted Multi-Layer Lightweight EVA + Rubber' },
      { key: 'Origin', value: 'Made in Italy' }
    ];
    item.tags = ['acne studios', 'chunky sneakers', 'designer shoes', 'platform sneakers', 'fashion'];
  }

  // 4. Nike Air Max 1 OG Retro (img_41 / photo-1600185365483-26d7a4cc7519)
  if (p.image.includes('photo-1600185365483-26d7a4cc7519')) {
    item.name = 'Nike Air Max 1 OG Retro Running Sneakers (White / Bright Crimson)';
    item.slug = 'nike-air-max-1-og-retro-white-crimson';
    item.brand = 'Nike';
    item.shortDescription = 'Tinker Hatfield 1987 heritage runner featuring visible Air heel unit and crimson mudguard.',
    item.description = 'The revolutionary icon that started it all in 1987. Featuring visible Nike Air cushioning in the heel, breathable mesh toe box, synthetic suede overlays, and the iconic bright crimson swoosh and mudguard.',
    item.bullets = [
      'Visible Max Air unit in heel delivers responsive, time-tested cloud cushioning',
      'Breathable technical mesh upper reinforced with soft synthetic suede overlays',
      'Heritage waffle rubber outsole provides traction, durability, and classic style',
      'Low-cut padded collar feels sleek and comfortable around the ankle'
    ];
    item.specifications = [
      { key: 'Cushioning', value: 'Visible Nike Max Air Heel Unit' },
      { key: 'Upper', value: 'Technical Mesh with Suede Overlays' },
      { key: 'Colorway', value: 'White / Bright Crimson / Neutral Grey' }
    ];
    item.tags = ['nike', 'air max 1', 'sneakers', 'running shoes', 'retro'];
  }

  // 5. Nike Free RN Flyknit (img_42 / photo-1582588678413-dbf45f4823e9)
  if (p.image.includes('photo-1582588678413-dbf45f4823e9')) {
    item.name = 'Nike Free RN Flyknit Ultralight Running Shoes (Olive Green / White)';
    item.slug = 'nike-free-rn-flyknit-olive-green';
    item.brand = 'Nike';
    item.shortDescription = 'Sock-like breathable Flyknit running shoe with barefoot tri-star flexible grooved sole.',
    item.description = 'Feel natural freedom with every stride. The Nike Free RN Flyknit features an ultra-breathable single-piece Flyknit upper that hugs the foot like a sock, paired with an auxetic tri-star grooved foam outsole that expands and contracts with your foot.',
    item.bullets = [
      'One-piece Flyknit woven upper provides targeted breathability, stretch, and support',
      'Auxetic tri-star outsole pattern expands in all directions for natural barefoot biomechanics',
      'Integrated Flywire cables lace directly for lightweight dynamic midfoot lockdown',
      'Anatomical rounded heel rolls smoothly with the ground at initial footstrike'
    ];
    item.specifications = [
      { key: 'Weight', value: '6.9 oz (196g) Ultralight' },
      { key: 'Upper', value: 'Nike Seamless Flyknit' },
      { key: 'Outsole', value: 'Dual-Density Auxetic Foam with Rubber Pods' }
    ];
    item.tags = ['nike', 'flyknit', 'free rn', 'running shoes', 'barefoot'];
  }

  // 6. Badgley Mischka Bridal Stiletto Pumps (img_43 / photo-1518049362265-d5b2a6467637)
  if (p.image.includes('photo-1518049362265-d5b2a6467637')) {
    item.name = 'Badgley Mischka Crystal Embellished Satin Pointed-Toe Bridal Stiletto Pumps';
    item.slug = 'badgley-mischka-crystal-embellished-bridal-pumps';
    item.brand = 'Badgley Mischka';
    item.shortDescription = 'Hand-beaded sparkling crystal evening stiletto pumps crafted in ivory silk satin.',
    item.description = 'The ultimate couture wedding shoe. Handcrafted in lustrous ivory silk satin, adorned with hundreds of dazzling pavé crystals across the pointed toe and heel counter, elevated by a statuesque 4-inch stiletto heel.',
    item.bullets = [
      'Opulent hand-placed crystal embellishments twinkle brilliantly under evening light',
      'Lustrous ivory silk satin upper with breathable sheer mesh side insert panels',
      '4-inch wrapped stiletto heel creates an elongating, glamorous red-carpet silhouette',
      'Padded leather insole and genuine leather outsole with embossed designer insignia'
    ];
    item.specifications = [
      { key: 'Heel Height', value: '4 Inches (100 mm)' },
      { key: 'Upper Material', value: 'Silk Satin with Pavé Crystals' },
      { key: 'Insole', value: 'Cushioned Leather Footbed' }
    ];
    item.tags = ['badgley mischka', 'bridal shoes', 'stiletto pumps', 'wedding', 'crystals', 'heels'];
  }

  // 7. Levi's Vintage Denim Trucker Jacket (img_45 / photo-1516257984-b1b4d707412e)
  if (p.image.includes('photo-1516257984-b1b4d707412e')) {
    item.name = 'Levi’s Vintage Clothing 1953 Type II Japanese Selvedge Denim Trucker Jacket';
    item.slug = 'levis-vintage-clothing-1953-type-2-denim-trucker-jacket';
    item.brand = 'Levi’s Vintage Clothing';
    item.shortDescription = 'Period-accurate Type II denim jacket woven with Japanese selvedge denim in light vintage wash.',
    item.description = 'A faithful reproduction of the legendary 1953 Type II Trucker Jacket. Cut from rigid Japanese shuttle-loomed selvedge denim, featuring double front pleats, waist adjuster tabs, and signature Big \"E\" red tab.',
    item.bullets = [
      'Woven on vintage Toyoda shuttle looms with premium Japanese red-line selvedge denim',
      'Signature front knife pleats sewn with contrast stitch allow chest movement',
      'Dual chest flap pockets with concealed copper rivets and custom shank buttons',
      'Finished with authentic hand-abraded light vintage wash and whiskering'
    ];
    item.specifications = [
      { key: 'Denim', value: '100% Cotton Japanese Selvedge Denim' },
      { key: 'Cut', value: 'Boxy 1950s Period-Accurate Fit' },
      { key: 'Hardware', value: 'Custom Embossed Steel Shank Buttons' }
    ];
    item.tags = ['levis', 'denim jacket', 'trucker jacket', 'selvedge', 'vintage'];
  }

  // 8. Schott NYC Leather Biker Jacket (img_46 / photo-1520975954732-35dd22299614)
  if (p.image.includes('photo-1520975954732-35dd22299614')) {
    item.name = 'Schott NYC Classic Perfecto Cowhide Leather Motorcycle Biker Jacket';
    item.slug = 'schott-nyc-classic-perfecto-leather-motorcycle-jacket';
    item.brand = 'Schott NYC';
    item.shortDescription = 'Iconic asymmetrical zip American steerhide leather motorcycle jacket with nickel hardware.',
    item.description = 'The original American rebel motorcycle jacket created by Irving Schott in 1928. Hand-cut from rugged heavyweight steerhide leather that breaks in beautifully, featuring an asymmetrical front zipper, snap-down lapels, and half-belt.',
    item.bullets = [
      'Handmade in USA from thick, full-weight vegetable-retanned cowhide leather',
      'Asymmetrical front zipper closure locks out wind when cruising on motorcycle',
      'Bi-swing back shoulder panels and underarm footballs provide full riding freedom',
      'Custom heavy-gauge nickel hardware with iconic talon zippers and star lapel snaps'
    ];
    item.specifications = [
      { key: 'Leather', value: 'Full-Grain U.S. Steerhide Cowhide' },
      { key: 'Hardware', value: 'Solid Heavy-Duty Nickel' },
      { key: 'Origin', value: 'Handmade in New Jersey, USA' }
    ];
    item.tags = ['schott nyc', 'perfecto', 'leather jacket', 'motorcycle jacket', 'biker'];
  }

  // 9. VINTA Type-II Camera Backpack (img_48 / photo-1491637639811-60e2756cc1c7)
  if (p.image.includes('photo-1491637639811-60e2756cc1c7')) {
    item.name = 'VINTA Type-II Waterproof Forest Green Travel & Camera Backpack (20L)';
    item.slug = 'vinta-type-2-waterproof-forest-green-camera-backpack';
    item.brand = 'VINTA';
    item.shortDescription = 'Waterproof coated twill camera pack with leather trim and magnetic buckle closures.',
    item.description = 'Form meets function in this stylish travel and camera backpack from VINTA. Coated forest green waterproof poly-twill fabric paired with brass rivets, genuine tan leather accents, and modular interior organizers for DSLR cameras and 15\" laptops.',
    item.bullets = [
      'Waterproof coated military-spec poly-twill canvas with taped water-resistant seams',
      'Leather straps equipped with swift magnetic quick-snap closures for instant access',
      'Modular padded camera kit insert safely cradles full-frame cameras and up to 5 lenses',
      'Concealed rear zipper entry keeps expensive photo gear shielded from pickpockets'
    ];
    item.specifications = [
      { key: 'Volume', value: '20 Liters' },
      { key: 'Material', value: 'Waterproof Coated Twill + Leather Trim' },
      { key: 'Laptop Chamber', value: 'Up to 15.6-inch Laptop' }
    ];
    item.tags = ['vinta', 'camera backpack', 'travel pack', 'waterproof bag', 'photography'];
  }

  // 10. Brooks Brothers Sky Blue Oxford Shirt (img_49 / photo-1588359348347-9bc6cbbb689e)
  if (p.image.includes('photo-1588359348347-9bc6cbbb689e')) {
    item.name = 'Brooks Brothers Regent Fit Supima Cotton Oxford Button-Down Dress Shirt (Sky Blue)';
    item.slug = 'brooks-brothers-regent-fit-supima-oxford-shirt-sky-blue';
    item.brand = 'Brooks Brothers';
    item.shortDescription = 'American-grown Supima cotton button-down dress shirt with signature 6-pleat shirring cuffs.',
    item.description = 'The shirt that defined American tailoring. Crafted from 100% American-grown long-staple Supima cotton woven in a classic basketweave oxford cloth, featuring the iconic original polo button-down collar.',
    item.bullets = [
      'Woven from 100% extra-long staple American Supima cotton for exceptional durability and softness',
      'Original polo button-down collar with signature soft roll that retains its handsome shape',
      'Brooks Brothers signature 6-pleat shirring at the barrel cuffs ensures immaculate tailoring',
      'Genuine mother-of-pearl cross-stitched buttons and reinforced single-needle side seams'
    ];
    item.specifications = [
      { key: 'Fabric', value: '100% American Supima Cotton Oxford' },
      { key: 'Fit', value: 'Regent Fit (Modern Tailored Slim)' },
      { key: 'Collar', value: 'Original Polo Button-Down' }
    ];
    item.tags = ['brooks brothers', 'oxford shirt', 'dress shirt', 'mens clothing', 'button down'];
  }

  // 11. Bosch 800 Series Gas Range Stove (img_52 / photo-1597796681855-a8f9f83012f2)
  if (p.image.includes('photo-1597796681855-a8f9f83012f2')) {
    item.name = 'Bosch 800 Series 30-Inch Stainless Steel Freestanding Smart Gas Range Stove';
    item.slug = 'bosch-800-series-30-inch-stainless-gas-range-stove';
    item.brand = 'Bosch';
    item.shortDescription = 'Commercial-style 5-burner gas range with dual-flame power burner and genuine European convection.',
    item.description = 'Engineered with German precision for master home chefs. Features heavy-duty continuous cast-iron cooktop grates, an intense 18,000 BTU dual-flame power burner, digital touch control clock, and genuine European convection oven.',
    item.bullets = [
      'Five high-efficiency gas burners including an 18,000 BTU dual-ring power burner for rapid boils',
      'Edge-to-edge continuous cast-iron grates allow heavy stockpots to slide across burners effortlessly',
      'Genuine European Convection oven delivers perfectly even browning and baking across all racks',
      'Heavy-duty stainless steel control knobs with tactile weighted metal feel'
    ];
    item.specifications = [
      { key: 'Burners', value: '5 Sealed Gas Burners (up to 18,000 BTU)' },
      { key: 'Oven Capacity', value: '3.7 cu. ft. European Convection' },
      { key: 'Dimensions', value: '30\" W x 36\" H x 26.5\" D' }
    ];
    item.tags = ['bosch', 'gas range', 'stove', 'cooktop', 'kitchen appliance'];
  }

  // 12. Nordic Nightstand & Standing Floor Lamp Duo (img_54 / photo-1766928714376-3263576f7b73)
  if (p.image.includes('photo-1766928714376-3263576f7b73')) {
    item.name = 'Muuto Scandinavian Solid Oak Nightstand Table & Minimalist Standing Floor Lamp Duo';
    item.slug = 'muuto-oak-nightstand-and-standing-floor-lamp-duo';
    item.brand = 'Muuto Design';
    item.shortDescription = 'Solid white oak single-drawer bedside nightstand paired with matte black stem fabric floor lamp.',
    item.description = 'Harmonious Nordic bedroom aesthetic. Handcrafted from sustainably harvested white oak with smooth slide-out drawer and lower open display shelf, complemented by a tall powder-coated black steel floor lamp with diffused linen shade.',
    item.bullets = [
      'Handcrafted bedside table built from solid white oak and fine veneers with matte lacquer finish',
      'Integrated soft-close concealed undermount drawer slide with minimalist cut-out pull handle',
      'Matching minimalist tall floor lamp with solid steel weighted base and warm diffused linen drum shade',
      'Lower open storage shelf perfectly holds magazines, art books, and bedtime reading essentials'
    ];
    item.specifications = [
      { key: 'Nightstand Material', value: 'Solid White Oak & FSC Certified Veneers' },
      { key: 'Lamp Material', value: 'Powder-Coated Steel with Linen Drum Shade' },
      { key: 'Style', value: 'Modern Scandinavian Minimalist' }
    ];
    item.tags = ['muuto', 'nightstand', 'floor lamp', 'scandinavian', 'home decor', 'bedroom'];
  }

  // 13. Rogue Fitness Calisthenics Rig & Pull-Up Bar (img_55 / photo-1669323149885-6bda5714e85b)
  if (p.image.includes('photo-1669323149885-6bda5714e85b')) {
    item.name = 'Rogue Fitness Commercial Steel Calisthenics Multi-Grip Pull-Up Frame & Gymnastic Station';
    item.slug = 'rogue-calisthenics-multi-grip-pull-up-frame-station';
    item.brand = 'Rogue Fitness';
    item.shortDescription = 'Commercial overhead calisthenics monkey bar and pull-up rig with solid steel construction.',
    item.description = 'Train like an Olympic gymnast. Heavy gauge structural steel modular pull-up rig equipped with multiple grip diameters, gymnastics ring suspension mounts, and knurled pull-up bars designed for elite calisthenics.',
    item.bullets = [
      'Heavy-wall American 11-gauge steel frame engineered for zero flex during dynamic swings',
      'Overhead ladder and multi-angle chin-up stations accommodate wide, neutral, and close grips',
      'Includes quick-release heavy-duty climbing carabiners and ring hanging anchors',
      'Electrostatic textured powder coat provides supreme grip security with or without chalk'
    ];
    item.specifications = [
      { key: 'Material', value: '11-Gauge Structural Carbon Steel' },
      { key: 'Coating', value: 'Textured Black Grip Powder Coat' },
      { key: 'Load Rating', value: '1,200 lbs Dynamic Athletic Rating' }
    ];
    item.tags = ['rogue fitness', 'pull up frame', 'calisthenics', 'gym equipment', 'fitness'];
  }

  // 14. Quokka Vacuum Insulated Stainless Steel Bottles (img_57 / photo-1625708458528-802ec79b1ed8)
  if (p.image.includes('photo-1625708458528-802ec79b1ed8')) {
    item.name = 'Quokka Solid Stainless Steel Double-Wall Vacuum Insulated Water Bottle Trio (Pastel Collection, 630ml)';
    item.slug = 'quokka-stainless-steel-vacuum-insulated-water-bottle-trio';
    item.brand = 'Quokka';
    item.shortDescription = 'Three 630ml double-wall vacuum insulated stainless steel bottles in peach, cyan, and lavender.',
    item.description = 'Keep drinks icy cold for 24 hours or steaming hot for 12 hours. Set of three 630ml food-grade 18/8 stainless steel bottles featuring sweat-proof condensation-free powder coating and leak-proof brushed steel caps.',
    item.bullets = [
      'Pack includes three 630ml bottles in stunning pastel hues: Peach Orange, Sky Cyan, and Soft Lavender',
      'Double-wall vacuum insulation keeps ice cold for up to 24 hours and hot liquids for 12 hours',
      '18/8 Pro-grade food stainless steel will never retain odors or transfer metallic flavors',
      '100% BPA-free and leakproof threaded stainless steel caps with silicone seal rings'
    ];
    item.specifications = [
      { key: 'Capacity', value: '630 ml (21.3 oz) Each (3 Bottles Total)' },
      { key: 'Material', value: '18/8 Food Grade Kitchen Stainless Steel' },
      { key: 'Thermal Rating', value: '24h Cold / 12h Hot' }
    ];
    item.tags = ['quokka', 'water bottle', 'stainless steel', 'insulated bottle', 'sports'];
  }

  // 15. Montessori Deluxe Handcrafted Wooden Animals & Sensory Playmat Set (img Candidate 3 / photo-1515488042361-ee00e0ddd4e4 replacing placeholder)
  if (p.slug === 'silver-cross-heritage-balmoral-luxury-pram') {
    item.name = 'Lovevery Montessori Handcrafted Wooden Safari Animals & Sensory Activity Playmat Collection';
    item.slug = 'lovevery-montessori-wooden-animals-sensory-playmat-set';
    item.brand = 'Lovevery';
    item.categorySlug = 'baby-kids';
    item.price = 3850.00;
    item.costPrice = 2700.00;
    item.oldPrice = 4250.00;
    item.stock = 30;
    item.lowStockThreshold = 4;
    item.sku = 'TRZ-B8-KID-LV-MONT';
    item.image = 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=800&auto=format&fit=crop&q=80';
    item.images = [{ url: 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=800&auto=format&fit=crop&q=80', key: null }];
    item.shortDescription = 'Artisanal organic cotton quilted floor playmat complete with heirloom wooden animals, plush figures & felt basket.';
    item.description = 'The ultimate developmental Montessori nursery collection. Featuring a thick organic quilted floor mat surrounded by hand-carved sustainable wooden safari animals (giraffe, elephant, cow), plush bunny and monkey cuddle companions, felt market vegetables, and sensory activity books.',
    item.bullets = [
      'Includes large pure organic cotton quilted floor playmat with non-slip hypoallergenic backing',
      'Set of solid beechwood carved safari animals hand-painted with non-toxic water-based stains',
      'Heirloom soft plush cuddly companions (bunny & monkey) and woven wicker basket with felt vegetables',
      'Pediatrician-endorsed sensory magnetic storybooks and wooden teething stars'
    ];
    item.specifications = [
      { key: 'Playmat Material', value: '100% GOTS Certified Organic Cotton' },
      { key: 'Wood Figures', value: 'FSC-Certified Solid European Beechwood' },
      { key: 'Safety', value: 'ASTM F963 & EN71 Non-Toxic Certified' }
    ];
    item.labels = ['featured', 'best'];
    item.tags = ['montessori', 'baby toys', 'wooden animals', 'sensory playmat', 'baby-kids'];
  }

  // 16. Grimm's Wooden Rainbow Ring Stacker (img_58 / photo-1618842676088-c4d48a6a7c9d)
  if (p.image.includes('photo-1618842676088-c4d48a6a7c9d')) {
    item.name = 'Grimm’s Handcrafted Wooden Rainbow Stacker Conical Stacking Tower & Rings Toy';
    item.slug = 'grimms-handcrafted-wooden-rainbow-stacker-tower';
    item.brand = 'Grimm’s';
    item.categorySlug = 'baby-kids';
    item.price = 2400.00; // keeping high tier
    item.shortDescription = 'Hand-carved European linden wood rainbow disc stacking tower with vibrant natural non-toxic water stains.',
    item.description = 'A masterpiece of Waldorf and Montessori early childhood education. Handcrafted in Germany from sustainably harvested FSC linden wood, finished with certified non-toxic water-based color stains that let the natural wood grain shine through.',
    item.bullets = [
      'Handcrafted in Germany from sustainable FSC-certified solid European linden wood',
      '11 graduated rainbow wooden rings with rounded central safety stacking post and red ball cap',
      'Finished with natural plant-oil and water-based non-toxic dyes with tactile velvet grip',
      'Develops toddler hand-eye coordination, fine motor skills, spatial reasoning, and color sequencing'
    ];
    item.specifications = [
      { key: 'Material', value: 'Solid FSC European Linden Wood' },
      { key: 'Finish', value: 'Certified Non-Toxic Water-Based Stains' },
      { key: 'Height', value: '21 cm (8.3 inches)' }
    ];
    item.tags = ['grimms', 'rainbow stacker', 'wooden toy', 'montessori', 'baby-kids'];
  }

  // 17. Scandinavian Luxury Nursery Suite (img_59 / photo-1613685301918-59b1039422cc)
  if (p.image.includes('photo-1613685301918-59b1039422cc')) {
    item.name = 'Stokke Sleepi Scandinavian Complete Luxury Nursery Room Furniture Suite';
    item.slug = 'stokke-sleepi-scandinavian-luxury-nursery-suite';
    item.brand = 'Stokke';
    item.categorySlug = 'baby-kids';
    item.price = 275.00; // keeping price
    item.shortDescription = 'Complete nursery suite: white solid beechwood convertible crib, plush glider chair, bookcase bin & designer lamp.',
    item.description = 'Transform your baby’s room into an oasis of Nordic calm. This comprehensive nursery collection includes a white solid beechwood convertible oval crib, ergonomic cream nursery glider with ottoman, mid-century bookcase toy chest, and contemporary lighting.',
    item.bullets = [
      'Convertible white wooden crib crafted from sustainable solid European beechwood',
      'Plush upholstered ergonomic nursery glider armchair with matching cushioned ottoman footstool',
      'Mid-century angled front bookcase toy chest with solid wood splayed legs',
      'Complete designer nursery styling bundle with wall shelving and woven chandelier'
    ];
    item.specifications = [
      { key: 'Crib Material', value: '100% Solid European Beechwood' },
      { key: 'Glider Upholstery', value: 'Stain-Resistant Performance Fabric' },
      { key: 'Safety Standards', value: 'JPMA Certified / Greenguard Gold' }
    ];
    item.tags = ['stokke', 'nursery furniture', 'baby crib', 'glider chair', 'baby room'];
  }

  // 18. Aluminum iPhone Charging Dock Cradle (img_60 / photo-1552572748-cb23c32145e6)
  if (p.image.includes('photo-1552572748-cb23c32145e6')) {
    item.name = 'elago Solid Aluminum Desktop Charging Dock Cradle & Phone Stand for iPhone (Silver)';
    item.slug = 'elago-aluminum-desktop-charging-dock-stand-iphone';
    item.brand = 'elago';
    item.shortDescription = 'Precision CNC anodized aluminum desktop charging stand with cable management for iPhone.',
    item.description = 'Charge and view in perfect harmony. Machined from solid aerospace-grade aluminum with silicone cable-management padding, holding your iPhone at the perfect ergonomic viewing angle for FaceTime calls and notifications beside your Mac.',
    item.bullets = [
      'Machined from high-grade solid aluminum with premium bead-blasted silver anodized finish',
      'Non-slip silicone footpads and phone resting cushions prevent scratches and desktop sliding',
      'Integrated rear cable channel cleanly routes charging cables to keep workspace clutter-free',
      'Comfortable 75-degree portrait viewing angle perfect for hands-free FaceTime and StandBy mode'
    ];
    item.specifications = [
      { key: 'Material', value: 'Solid Aerospace Aluminum + Silicone' },
      { key: 'Compatibility', value: 'All iPhone Models with or without cases' },
      { key: 'Weight', value: '280g Weighted Base' }
    ];
    item.tags = ['elago', 'iphone stand', 'charging dock', 'aluminum stand', 'desk accessory'];
  }

  // 19. Apple Pro Display XDR 32-inch 4K/6K Setup (img_61 / photo-1547658718-1cdaa0852790)
  if (p.image.includes('photo-1547658718-1cdaa0852790')) {
    item.name = 'Apple Pro Display XDR 32-Inch Retina 6K IPS Computer Monitor Studio Setup';
    item.slug = 'apple-pro-display-xdr-32-inch-retina-6k-monitor';
    item.brand = 'Apple';
    item.categorySlug = 'office-supplies';
    item.shortDescription = '32-inch Retina 6K HDR reference monitor with 1,600 nits peak brightness and P3 wide color gamut.',
    item.description = 'The ultimate creative display. Delivering 218 pixels per inch across a massive 32-inch panel, Extreme Dynamic Range (XDR) with 1,000,000:1 contrast ratio, 10-bit color depth, and superwide viewing angle.',
    item.bullets = [
      '32-inch IPS LCD panel with 6016 x 3384 Retina 6K resolution at 218 ppi',
      'Extreme Dynamic Range (XDR) with 1,000 nits sustained and 1,600 nits peak brightness',
      'Pro Stand magnetic attachment with effortless height, tilt, and portrait rotation',
      'Thunderbolt 3 upstream port charges MacBooks up to 96W alongside 3x USB-C ports'
    ];
    item.specifications = [
      { key: 'Screen Size', value: '32-inch (Diagonal)' },
      { key: 'Resolution', value: '6016 x 3384 pixels (6K Retina)' },
      { key: 'Color Gamut', value: 'P3 Wide Color, 10-bit Depth' }
    ];
    item.tags = ['apple', 'pro display xdr', '6k monitor', 'retina display', 'studio monitor'];
  }

  // 20. Haute Couture Ruffled Black Wool Overcoat & Wide-Brim Hat (img_63 / photo-1554412933-514a83d2f3c8)
  if (p.image.includes('photo-1554412933-514a83d2f3c8')) {
    item.name = 'Chanel Haute Couture Ruffled Front Black Virgin Wool Overcoat & Wide-Brim Felt Hat Set';
    item.slug = 'chanel-haute-couture-ruffled-black-wool-overcoat-hat-set';
    item.brand = 'Chanel';
    item.categorySlug = 'clothing';
    item.price = 275.00; // keeping price
    item.shortDescription = 'Parisian tailored black virgin wool statement coat with sculpted vertical ruffles, pearl buttons & fedora hat.',
    item.description = 'Exquisite Parisian high fashion. Cut from heavy double-faced Italian virgin wool, this tailored statement overcoat features dramatic vertical cascading ruffles along the placket, lustrous pearl shank buttons, and matching wide-brim felt hat.',
    item.bullets = [
      'Tailored from 100% Italian double-faced virgin wool with immaculate drape',
      'Architectural cascading ruffle front detailing and coordinating ruffled stand collar',
      'Lustrous genuine mother-of-pearl buttons with hand-bound buttonholes',
      'Complete runway set includes matching wide-brim felt millinery hat with silk ribbon'
    ];
    item.specifications = [
      { key: 'Material', value: '100% Virgin Wool' },
      { key: 'Lining', value: '100% Silk Twill' },
      { key: 'Origin', value: 'Made in France' }
    ];
    item.tags = ['chanel', 'haute couture', 'wool coat', 'overcoat', 'fedora hat', 'fashion'];
  }

  // 21. YSL Rouge Pur Couture Velvet Matte Red Lipstick (img_64 / photo-1616683693504-3ea7e9ad6fec)
  if (p.image.includes('photo-1616683693504-3ea7e9ad6fec')) {
    item.name = 'Yves Saint Laurent Rouge Pur Couture The Slim Velvet Radical Matte Lipstick Collection';
    item.slug = 'ysl-rouge-pur-couture-the-slim-velvet-radical-lipstick';
    item.brand = 'Yves Saint Laurent';
    item.shortDescription = 'Square bullet couture lipstick delivering intense semi-matte crimson color with silky comfort.',
    item.description = 'High couture meets bold pigment. The Slim Velvet Radical combines high-coverage color with a radical velvet finish. Enriched with silky oils to keep lips hydrated while delivering iconic saturated red lips.',
    item.bullets = [
      'Innovative square bullet design allows razor-sharp precision lining and filling',
      'Intense crimson red pigments provide high-impact full coverage in a single stroke',
      'Infused with silky conditioning oils to deliver weightless 10-hour comfortable wear',
      'Housed in an ultra-slim matte black couture case with gold YSL Cassandre logo'
    ];
    item.specifications = [
      { key: 'Shade', value: 'No 21 Rouge Paradoxe (Classic True Red)' },
      { key: 'Finish', value: 'Velvet Radical Semi-Matte' },
      { key: 'Formula', value: 'Hydrating Longwear Silk-Oil Blend' }
    ];
    item.tags = ['ysl', 'lipstick', 'rouge pur couture', 'velvet matte', 'luxury beauty'];
  }

  // 22. Neauthy Skin Care Hydration Cream (img_65 / photo-1601049541289-9b1b7bbbfe19)
  if (p.image.includes('photo-1601049541289-9b1b7bbbfe19')) {
    item.name = 'Neauthy Skin Care Deep Hydration Peptide Day & Night Face Cream (50ml)';
    item.slug = 'neauthy-skin-care-deep-hydration-face-cream-50ml';
    item.brand = 'Neauthy Skin Care';
    item.shortDescription = 'Intensive ceramides and multi-peptide barrier repair cream in frosted glass jar.',
    item.description = 'Quench dry, dehydrated skin with intense clinical moisture. Formulated with five bio-identical ceramides, copper peptides, and squalane to deeply replenish moisture and lock in a soft, non-greasy dewy glow.',
    item.bullets = [
      'Five essential bio-identical ceramides restore and fortify depleted skin barrier function',
      'Multi-peptide matrix stimulates cellular renewal and smooths fine surface lines',
      'Rich, whipped velvety cream absorbs cleanly without leaving any greasy residue',
      'Hypoallergenic, dermatologist-tested, fragrance-free, and non-comedogenic'
    ];
    item.specifications = [
      { key: 'Volume', value: '50 ml / 1.7 oz Glass Jar' },
      { key: 'Actives', value: '5 Ceramides, Copper Tripeptide-1, Squalane' },
      { key: 'Skin Type', value: 'Dry, Sensitive, Compromised Barrier' }
    ];
    item.tags = ['neauthy', 'hydration cream', 'face moisturizer', 'ceramides', 'skincare'];
  }

  // 23. Star Wars Grogu Interactive Animatronic Figure (img_66 / photo-1618336753974-aae8e04506aa)
  if (p.image.includes('photo-1618336753974-aae8e04506aa')) {
    item.name = 'Star Wars The Child / Grogu Galactic Snackin’ Animatronic Interactive Toy Figure';
    item.slug = 'star-wars-grogu-galactic-snackin-animatronic-figure';
    item.brand = 'Star Wars';
    item.shortDescription = 'Motorized animatronic Grogu with over 40 sound and motion combinations and interactive accessories.',
    item.description = 'Bring home the beloved star of The Mandalorian. Grogu reacts when given his snack accessories with cute eating sounds, moves his ears, blinks his large eyes, raises his arms to be held, and channels the Force.',
    item.bullets = [
      'Over 40 sound and motion combinations: motorized head, ears, eyes, and reaching arms',
      'Interactive accessories: feeding bowl with tentacle, macaron cookie, shifter knob, and spoon',
      'Pat the top of Grogu\'s head 3 times to activate a 2-handed Force animation channeling sequence',
      'Authentic plush robe with faux-shearling collar and soft tactile silicone skin'
    ];
    item.specifications = [
      { key: 'Height', value: '9.25 Inches (23.5 cm)' },
      { key: 'Features', value: 'Motorized Head, Ears, Eyes, Arms + 40+ Sounds' },
      { key: 'Batteries', value: '4x AA Alkaline Batteries' }
    ];
    item.tags = ['star wars', 'grogu', 'baby yoda', 'animatronic', 'toys', 'mandalorian'];
  }

  return item;
});

const all100 = [...refinedPart1, ...refinedPart2];
console.log('Total refined items:', all100.length);

// Write to server/src/data/batch8-complete-100.js
const fileContent = `// Batch 8 Complete 100 Products - Visually Verified and Audited
export const BATCH_8_ALL_PRODUCTS = ${JSON.stringify(all100, null, 2)};
`;

fs.writeFileSync('server/src/data/batch8-complete-100.js', fileContent);
console.log('Successfully wrote server/src/data/batch8-complete-100.js');
