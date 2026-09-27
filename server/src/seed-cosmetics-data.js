export const COSMETICS_PRODUCTS = [
  // ─── 1. ARTISANAL SOAPS & BATH (Nahane & Sabun) ───
  {
    name: 'Organic French Lavender & Goat Milk Artisan Bar Soap',
    slug: 'organic-french-lavender-goat-milk-artisan-soap',
    brand: 'LuxeBotanicals',
    categorySlug: 'beauty',
    price: 12.00,
    costPrice: 5.00,
    oldPrice: 16.00,
    stock: 1500,
    lowStockThreshold: 30,
    sku: 'TRZ-COS-SOAP-LAV',
    image: 'https://images.unsplash.com/photo-1607006411601-775c8cc632dc?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1607006411601-775c8cc632dc?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Handcrafted cold-processed soap made with raw farm goat milk and calming French lavender essential oil.',
    description: 'Nourish and soothe sensitive skin with our artisanal French Lavender and Goat Milk soap. Cold-processed in small batches to preserve natural glycerin, vitamins A, B, and lactic acid.',
    bullets: [
      'Raw farm-fresh goat milk gently cleanses without stripping natural moisture',
      'Infused with 100% pure organic Provence lavender essential oil for deep relaxation',
      'Rich, velvety creamy lather suitable for face and body',
      'Zero synthetic detergents, parabens, phthalates, or artificial dyes'
    ],
    specifications: [
      { key: 'Weight', value: '5.5 oz (156g)' },
      { key: 'Skin Type', value: 'All skin types, especially sensitive & dry' },
      { key: 'Process', value: 'Traditional Cold Processed' },
      { key: 'Origin', value: 'Provence, France' }
    ],
    labels: ['best', 'featured'],
    tags: ['soap', 'bar soap', 'lavender', 'goat milk', 'bath', 'organic', 'skincare']
  },
  {
    name: 'Raw Shea Butter & Colloidal Oatmeal Sensitive Skin Soap Bar',
    slug: 'raw-shea-butter-colloidal-oatmeal-sensitive-soap-bar',
    brand: 'AuraGlow',
    categorySlug: 'beauty',
    price: 11.50,
    costPrice: 4.80,
    oldPrice: 15.00,
    stock: 1400,
    lowStockThreshold: 25,
    sku: 'TRZ-COS-SOAP-OAT',
    image: 'https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Unscented ultra-soothing colloidal oatmeal bar enriched with 30% organic virgin shea butter.',
    description: 'Designed specifically for easily irritated, eczema-prone, and dry skin. Colloidal oatmeal forms a protective barrier to lock in hydration while raw virgin shea butter calms inflammation.',
    bullets: [
      'Colloidal oatmeal relieves itchiness and redness naturally',
      'Ultra-rich 30% raw unrefined shea butter hydrates deeply',
      'Fragrance-free, hypoallergenic, and dermatologist-tested',
      'Gentle enough for daily face and body use on infants and adults'
    ],
    specifications: [
      { key: 'Weight', value: '5.0 oz (142g)' },
      { key: 'Scent', value: 'Fragrance-Free / Unscented' },
      { key: 'Skin Type', value: 'Eczema-Prone, Sensitive, Dry' },
      { key: 'Certifications', value: 'Cruelty-Free, Vegan' }
    ],
    labels: ['popular'],
    tags: ['soap', 'shea butter', 'oatmeal', 'sensitive skin', 'eczema', 'bath', 'skincare']
  },
  {
    name: 'Activated Bamboo Charcoal & Tea Tree Purifying Detox Bar Soap',
    slug: 'activated-bamboo-charcoal-tea-tree-detox-soap',
    brand: 'BotanicaPure',
    categorySlug: 'beauty',
    price: 12.50,
    costPrice: 5.20,
    oldPrice: 16.50,
    stock: 1200,
    lowStockThreshold: 20,
    sku: 'TRZ-COS-SOAP-CHR',
    image: 'https://images.unsplash.com/photo-1594913785162-e678a0c23ec9?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1594913785162-e678a0c23ec9?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Deep-pore clarifying cleansing bar with activated bamboo charcoal and Australian tea tree oil.',
    description: 'Draw out deep impurities, excess sebum, and everyday pollution. Activated charcoal acts like a magnet for toxins while Australian tea tree provides natural antibacterial purification.',
    bullets: [
      'Activated bamboo charcoal draws micro-pollutants out of pores',
      'Australian tea tree oil fights acne bacteria and clarifies skin',
      'Non-drying base formulated with coconut and olive oils',
      'Ideal for acne-prone skin, oily skin, and back acne (bacne)'
    ],
    specifications: [
      { key: 'Weight', value: '5.2 oz (147g)' },
      { key: 'Key Ingredients', value: 'Bamboo Charcoal, Tea Tree Oil, Coconut Oil' },
      { key: 'Skin Type', value: 'Oily, Combination, Acne-Prone' }
    ],
    labels: ['trending'],
    tags: ['soap', 'charcoal', 'tea tree', 'acne', 'detox', 'cleanser', 'bath']
  },
  {
    name: 'Rose Clay & Botanical Jasmine Gentle Moisture Bar Soap',
    slug: 'rose-clay-botanical-jasmine-moisture-soap',
    brand: 'LuxeBotanicals',
    categorySlug: 'beauty',
    price: 13.00,
    costPrice: 5.50,
    oldPrice: 17.00,
    stock: 950,
    lowStockThreshold: 20,
    sku: 'TRZ-COS-SOAP-ROSE',
    image: 'https://images.unsplash.com/photo-1607006314644-88cb206fb7a7?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1607006411601-775c8cc632dc?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Exquisite French pink clay bar with exotic night-blooming jasmine and sweet almond oil.',
    description: 'French rose clay gently exfoliates dead skin cells while restoring elasticity and glow. Scented with natural night-blooming jasmine blossoms for an intoxicating spa shower experience.',
    bullets: [
      'French pink clay mildly exfoliates and refines skin texture',
      'Infused with cold-pressed sweet almond and jojoba oils',
      'Heavenly aromatic jasmine blossom natural fragrance',
      'Produces a dense, creamy lather leaving skin velvety soft'
    ],
    specifications: [
      { key: 'Weight', value: '5.3 oz (150g)' },
      { key: 'Scent', value: 'Jasmine & Damask Rose' },
      { key: 'Key Ingredients', value: 'French Pink Clay, Jasmine Extract, Sweet Almond Oil' }
    ],
    labels: ['luxury'],
    tags: ['soap', 'rose clay', 'jasmine', 'luxury soap', 'bath', 'skincare']
  },
  {
    name: 'Aromatherapy Eucalyptus & Spearmint Foaming Body Wash (500ml)',
    slug: 'aromatherapy-eucalyptus-spearmint-body-wash-500ml',
    brand: 'AuraGlow',
    categorySlug: 'beauty',
    price: 24.00,
    costPrice: 11.00,
    oldPrice: 32.00,
    stock: 1100,
    lowStockThreshold: 25,
    sku: 'TRZ-COS-BWASH-EUC',
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Invigorating shower gel infused with pure essential oils to relieve stress and awaken senses.',
    description: 'Transform your morning shower into a luxury steam spa. Formulated with cooling eucalyptus globulus and invigorating spearmint essential oils to clear your mind while aloe vera hydrates.',
    bullets: [
      'Pure eucalyptus and spearmint essential oils clear breathing and relax tension',
      'Aloe vera and vitamin E maintain skin natural protective barrier',
      'Rich foaming gel with pump dispenser for effortless daily use',
      'Sulfate-free, dye-free, and biodegradable plant-derived formula'
    ],
    specifications: [
      { key: 'Volume', value: '500 ml (16.9 fl oz)' },
      { key: 'Dispenser', value: 'Locking Pump Bottle' },
      { key: 'Scent Profile', value: 'Fresh Eucalyptus & Crisp Spearmint' }
    ],
    labels: ['best', 'featured'],
    tags: ['body wash', 'shower gel', 'eucalyptus', 'bath', 'grooming', 'skincare']
  },
  {
    name: 'Japanese Cherry Blossom Nourishing Moisture Shower Gel (400ml)',
    slug: 'japanese-cherry-blossom-nourishing-shower-gel-400ml',
    brand: 'LuxeBotanicals',
    categorySlug: 'beauty',
    price: 22.00,
    costPrice: 9.50,
    oldPrice: 28.00,
    stock: 1350,
    lowStockThreshold: 30,
    sku: 'TRZ-COS-BWASH-SAK',
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Delicate floral shower gel infused with Kyoto sakura blossom extract, rice milk, and vitamin E.',
    description: 'Envelop yourself in the graceful fragrance of Kyoto cherry blossoms in spring. Blended with skin-softening Japanese rice milk and hyaluronic acid for silky-smooth hydrated skin.',
    bullets: [
      'Authentic sakura cherry blossom extract provides antioxidant brightening',
      'Nourishing rice milk leaves skin supple and luminous all day',
      'Luxurious foaming texture that rinses clean without residue',
      'pH balanced 5.5 formulation suitable for every skin type'
    ],
    specifications: [
      { key: 'Volume', value: '400 ml (13.5 fl oz)' },
      { key: 'Scent', value: 'Kyoto Sakura Cherry Blossom' },
      { key: 'Skin Feel', value: 'Silky, Hydrated, Fresh' }
    ],
    labels: ['popular'],
    tags: ['shower gel', 'body wash', 'cherry blossom', 'bath', 'sakura', 'skincare']
  },
  {
    name: 'Pink Himalayan Crystal Salt & Coconut Oil Body Polish Scrub (300g)',
    slug: 'pink-himalayan-salt-coconut-oil-body-polish-scrub',
    brand: 'BotanicaPure',
    categorySlug: 'beauty',
    price: 28.00,
    costPrice: 12.00,
    oldPrice: 36.00,
    stock: 850,
    lowStockThreshold: 20,
    sku: 'TRZ-COS-SCRUB-HIM',
    image: 'https://images.unsplash.com/photo-1567928815117-640a34b281f6?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1567928815117-640a34b281f6?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Detoxifying mineral salt scrub with cold-pressed virgin coconut oil, sweet almond oil, and lychee essential oil.',
    description: 'Buff away dull, flaky skin to reveal radiant softness. Pure mineral-rich Himalayan pink crystal salt gently polishes while organic virgin coconut oil locks in deep moisture.',
    bullets: [
      '84 essential minerals in pink salt gently stimulate circulation and detoxify',
      'Virgin coconut and sweet almond oils provide intense long-lasting hydration',
      'Leaves skin silky, glowing, and deliciously scented',
      '100% natural, preservative-free, and vegan formulation'
    ],
    specifications: [
      { key: 'Net Weight', value: '10.5 oz (300g)' },
      { key: 'Texture', value: 'Rich Mineral Granule in Whipped Oil' },
      { key: 'Use Frequency', value: '2-3 Times per Week' }
    ],
    labels: ['luxury'],
    tags: ['body scrub', 'himalayan salt', 'exfoliator', 'bath', 'coconut oil', 'skincare']
  },
  {
    name: 'Whipped Raw African Shea & Cocoa Butter Ultra-Rich Body Cream (250ml)',
    slug: 'whipped-raw-african-shea-cocoa-butter-body-cream',
    brand: 'AuraGlow',
    categorySlug: 'beauty',
    price: 26.00,
    costPrice: 11.50,
    oldPrice: 34.00,
    stock: 1250,
    lowStockThreshold: 25,
    sku: 'TRZ-COS-BBL-SHEA',
    image: 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Air-whipped decadent body butter combining unrefined Ghanaian shea butter with pure cocoa butter.',
    description: 'An ultra-nourishing feast for very dry, cracked skin. Melts instantly on contact with body heat, delivering 48 hours of deep barrier restoration and a warm vanilla cocoa aroma.',
    bullets: [
      'Unrefined Grade-A Ghanaian shea butter restores elasticity and prevents stretch marks',
      'Rich cocoa butter shields against moisture loss in harsh weather',
      'Air-whipped soufflé texture absorbs without greasy residue',
      'Delicate, all-natural warm Madagascar vanilla and cocoa aroma'
    ],
    specifications: [
      { key: 'Volume', value: '250 ml (8.5 oz)' },
      { key: 'Duration', value: '48-Hour Continuous Moisture' },
      { key: 'Container', value: 'Amber Glass Jar with Aluminum Lid' }
    ],
    labels: ['best'],
    tags: ['body butter', 'shea butter', 'cocoa butter', 'moisturizer', 'bath', 'skincare']
  },
  {
    name: 'Moroccan Argan Oil Hydrating & Repairing Shampoo (350ml)',
    slug: 'moroccan-argan-oil-hydrating-repairing-shampoo',
    brand: 'BotanicaPure',
    categorySlug: 'beauty',
    price: 28.00,
    costPrice: 13.00,
    oldPrice: 35.00,
    stock: 1100,
    lowStockThreshold: 20,
    sku: 'TRZ-COS-SHMP-ARG',
    image: 'https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Salon-grade sulfate-free moisture shampoo infused with pure cold-pressed Moroccan argan oil.',
    description: 'Rescue dry, brittle, and color-treated hair. Infuses strands with vitamin E, omega-6 fatty acids, and argan oil to restore mirror-like shine, elasticity, and frizz control.',
    bullets: [
      'Cold-pressed Moroccan argan oil repairs damaged hair cuticles',
      'Sulfate-free formulation safe for color-treated and keratin-treated hair',
      'Tames frizzy flyaways and delivers luminous healthy shine',
      'Enriched with pro-vitamin B5 (Panthenol) for root-to-tip volume'
    ],
    specifications: [
      { key: 'Volume', value: '350 ml (11.8 fl oz)' },
      { key: 'Hair Type', value: 'Dry, Damaged, Frizzy, Color-Treated' },
      { key: 'Free From', value: 'Sulfates, Parabens, Silicones, Phthalates' }
    ],
    labels: ['popular', 'featured'],
    tags: ['shampoo', 'argan oil', 'haircare', 'bath', 'salon', 'moroccan']
  },
  {
    name: 'Keratin Protein Smooth & Deep Moisture Conditioner (350ml)',
    slug: 'keratin-protein-smooth-deep-moisture-conditioner',
    brand: 'BotanicaPure',
    categorySlug: 'beauty',
    price: 28.00,
    costPrice: 13.00,
    oldPrice: 35.00,
    stock: 1050,
    lowStockThreshold: 20,
    sku: 'TRZ-COS-COND-KER',
    image: 'https://images.unsplash.com/photo-1526947425960-945c6e72858f?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1526947425960-945c6e72858f?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Deep penetrating silk conditioner with hydrolyzed vegetable keratin and marula oil for intense detangling.',
    description: 'Instant slip and salon-smooth texture in under 3 minutes. Vegetable keratin proteins fill in micro-cracks along the hair shaft while marula oil seals the cuticle against heat and humidity.',
    bullets: [
      'Hydrolyzed keratin rebuilds structural strength and reduces split ends by 85%',
      'Marula and avocado oils provide featherweight moisture without weighing hair down',
      'Instant detangling glide prevents shower breakage and shedding',
      'Heat protection shield up to 450°F (232°C)'
    ],
    specifications: [
      { key: 'Volume', value: '350 ml (11.8 fl oz)' },
      { key: 'Treatment Time', value: '2-3 Minutes' },
      { key: 'Silicones', value: 'Zero (Water-Soluble Formula)' }
    ],
    labels: ['best'],
    tags: ['conditioner', 'keratin', 'haircare', 'bath', 'detangler', 'salon']
  },
  {
    name: '100% Pure Cold-Pressed Rosemary & Biotin Hair & Scalp Oil (60ml)',
    slug: 'pure-cold-pressed-rosemary-biotin-hair-scalp-oil',
    brand: 'AuraGlow',
    categorySlug: 'beauty',
    price: 22.00,
    costPrice: 9.00,
    oldPrice: 29.00,
    stock: 1600,
    lowStockThreshold: 35,
    sku: 'TRZ-COS-OIL-ROSE',
    image: 'https://images.unsplash.com/photo-1608248597359-0a6042456e30?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1608248597359-0a6042456e30?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Viral scalp stimulating elixir formulated with pure rosemary essential oil, biotin, and peppermint.',
    description: 'Activate dormant hair follicles and invigorate circulation at the root. Clinically formulated blend of steam-distilled rosemary, biotin, peppermint, and castor oil to support thicker, denser hair.',
    bullets: [
      'Rosemary leaf oil clinically proven to encourage follicle activity and growth',
      'Biotin and castor oil strengthen fragile strands and prevent premature shedding',
      'Cooling peppermint soothes dry scalp itchiness and eliminates flaking',
      'Precision glass dropper for targeted daily root application'
    ],
    specifications: [
      { key: 'Volume', value: '60 ml (2.0 fl oz)' },
      { key: 'Application', value: 'Scalp Massage & Split End Treatment' },
      { key: 'Formula', value: '100% Botanical Oil Blend' }
    ],
    labels: ['trending', 'bestseller'],
    tags: ['rosemary oil', 'hair growth', 'scalp oil', 'biotin', 'haircare', 'skincare']
  },

  // ─── 2. FACIAL SKINCARE (Serums, Creams, Toners, Sunscreen) ───
  {
    name: '20% Vitamin C + Ferulic Acid + Vitamin E Antioxidant Glow Serum (30ml)',
    slug: 'vitamin-c-ferulic-acid-vitamin-e-glow-serum',
    brand: 'AuraGlow',
    categorySlug: 'beauty',
    price: 38.00,
    costPrice: 16.00,
    oldPrice: 48.00,
    stock: 1800,
    lowStockThreshold: 40,
    sku: 'TRZ-COS-SRM-VITC',
    image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Gold-standard brightening antioxidant serum with 20% pure L-ascorbic acid and ferulic acid.',
    description: 'Fade stubborn dark spots, sun damage, and hyperpigmentation while boosting collagen synthesis. Synergistic ferulic acid and vitamin E stabilize active vitamin C for 8x photo-protective efficacy.',
    bullets: [
      '20% pure L-Ascorbic Acid visibly fades post-acne marks and sun spots in 4 weeks',
      '0.5% Ferulic Acid neutralizes free radicals from UV and blue light exposure',
      'Hydrating hyaluronic acid base absorbs rapidly without stickiness',
      'Airless UV-protected amber glass dropper ensures peak active potency'
    ],
    specifications: [
      { key: 'Volume', value: '30 ml (1.0 fl oz)' },
      { key: 'Active Concentration', value: '20% L-Ascorbic Acid + 0.5% Ferulic Acid' },
      { key: 'pH Level', value: 'Optimal 3.2' }
    ],
    labels: ['best', 'featured'],
    tags: ['serum', 'vitamin c', 'brightening', 'antioxidant', 'skincare', 'face']
  },
  {
    name: 'Multi-Molecular Hyaluronic Acid 2% + B5 Intense Plumping Hydration Serum (30ml)',
    slug: 'hyaluronic-acid-2-percent-b5-hydration-serum',
    brand: 'BotanicaPure',
    categorySlug: 'beauty',
    price: 32.00,
    costPrice: 13.50,
    oldPrice: 42.00,
    stock: 1500,
    lowStockThreshold: 35,
    sku: 'TRZ-COS-SRM-HYA',
    image: 'https://images.unsplash.com/photo-1608248597359-0a6042456e30?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1608248597359-0a6042456e30?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Triple-weight hyaluronic acid hydration treatment that instantly quenches and plumps dehydrated skin.',
    description: 'Combines low, medium, and high molecular weight hyaluronic acid molecules to penetrate multiple depths of the epidermis. Pro-vitamin B5 (Panthenol) accelerates skin repair and softness.',
    bullets: [
      'Triple molecular weight hyaluronic acid hydrates both surface and deep dermal layers',
      'Instantly plumps fine dehydration lines and restores bounce',
      'Pro-vitamin B5 heals compromised skin barrier and calms redness',
      'Water-light oil-free serum plays beautifully under makeup and sunscreens'
    ],
    specifications: [
      { key: 'Volume', value: '30 ml (1.0 fl oz)' },
      { key: 'Texture', value: 'Clear Fast-Absorbing Hydrogel' },
      { key: 'Skin Type', value: 'Dehydrated, Dry, Normal, Sensitive' }
    ],
    labels: ['popular'],
    tags: ['serum', 'hyaluronic acid', 'hydration', 'plumping', 'skincare', 'face']
  },
  {
    name: 'Niacinamide 10% + Zinc 1% Oil Control & Pore Refining Facial Serum (30ml)',
    slug: 'niacinamide-10-percent-zinc-1-percent-pore-serum',
    brand: 'AuraGlow',
    categorySlug: 'beauty',
    price: 26.00,
    costPrice: 10.50,
    oldPrice: 34.00,
    stock: 1700,
    lowStockThreshold: 40,
    sku: 'TRZ-COS-SRM-NIA',
    image: 'https://images.unsplash.com/photo-1617897903246-719242758050?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1617897903246-719242758050?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'High-strength vitamin and mineral blemish formula that minimizes enlarged pores and regulates shine.',
    description: 'Regulate sebum production and tighten the appearance of congested pores. High-purity 10% niacinamide (Vitamin B3) paired with 1% zinc PCA visibly balances oily T-zones and prevents future breakouts.',
    bullets: [
      '10% Niacinamide significantly shrinks enlarged pores and evens tone',
      '1% Zinc PCA controls excess oil without causing flaking or tightness',
      'Clears congestion and reduces redness from active blemishes',
      'Alcohol-free, silicone-free, oil-free, non-comedogenic'
    ],
    specifications: [
      { key: 'Volume', value: '30 ml (1.0 fl oz)' },
      { key: 'Active Ingredients', value: 'Niacinamide (10%), Zinc PCA (1%)' },
      { key: 'Target Concerns', value: 'Pores, Oiliness, Uneven Skin Texture' }
    ],
    labels: ['best'],
    tags: ['niacinamide', 'serum', 'pores', 'oil control', 'acne', 'skincare']
  },
  {
    name: 'Encapsulated 0.5% Retinol Night Renewal & Wrinkle Repair Serum (30ml)',
    slug: 'encapsulated-retinol-night-renewal-repair-serum',
    brand: 'LuxeBotanicals',
    categorySlug: 'beauty',
    price: 42.00,
    costPrice: 18.00,
    oldPrice: 56.00,
    stock: 900,
    lowStockThreshold: 20,
    sku: 'TRZ-COS-SRM-RET',
    image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Time-release encapsulated pure retinol with squalane and peptides for smooth, wrinkle-free mornings.',
    description: 'Enjoy the transformative anti-aging benefits of pure retinol without the redness and peeling. Micro-encapsulated delivery system slowly releases active retinol throughout the night while squalane buffers.',
    bullets: [
      'Encapsulated 0.5% pure retinol smooths deep wrinkles and crow’s feet',
      'Time-release liposomal delivery reduces irritation by 70% compared to ordinary retinol',
      'Plant squalane and centella asiatica soothe and prevent dryness',
      'Promotes rapid cellular turnover for refined, youthful radiance'
    ],
    specifications: [
      { key: 'Volume', value: '30 ml (1.0 fl oz)' },
      { key: 'Active', value: '0.5% Encapsulated Retinol + Matrixyl Peptides' },
      { key: 'Usage', value: 'Nighttime Only (Follow with SPF in morning)' }
    ],
    labels: ['anti-aging'],
    tags: ['retinol', 'serum', 'anti-aging', 'wrinkles', 'skincare', 'night repair']
  },
  {
    name: 'Multi-Ceramide & Peptide Barrier Restore Hydrating Cream (50ml)',
    slug: 'multi-ceramide-peptide-barrier-restore-cream',
    brand: 'AuraGlow',
    categorySlug: 'beauty',
    price: 36.00,
    costPrice: 15.00,
    oldPrice: 46.00,
    stock: 1400,
    lowStockThreshold: 30,
    sku: 'TRZ-COS-CRM-CER',
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Intensive barrier-repair face moisturizer formulated with 5 essential ceramides and biomimetic peptides.',
    description: 'Restore cracked, compromised, and irritated skin barriers. Features 5 bio-identical ceramides (EOP, NP, AP, AS, NS), cholesterol, and fatty acids in the optimal 3:1:1 physiological ratio.',
    bullets: [
      '5 essential bio-identical ceramides reinforce natural lipid barrier',
      'Signal peptides stimulate natural collagen synthesis and firm skin contours',
      'Provides intense 24-hour hydration with a velvety semi-matte finish',
      'Fragrance-free, non-greasy, and dermatologist-tested for sensitive skin'
    ],
    specifications: [
      { key: 'Volume', value: '50 ml (1.7 fl oz)' },
      { key: 'Ceramides', value: 'Ceramides EOP, NP, AP, AS, NS' },
      { key: 'Packaging', value: 'Hygienic Airless Pump Jar' }
    ],
    labels: ['bestseller'],
    tags: ['ceramide', 'moisturizer', 'face cream', 'barrier repair', 'skincare']
  },
  {
    name: 'Daily Invisible Water-Gel Broad Spectrum SPF 50+ Sunscreen (50ml)',
    slug: 'daily-invisible-water-gel-spf50-sunscreen-50ml',
    brand: 'BotanicaPure',
    categorySlug: 'beauty',
    price: 29.00,
    costPrice: 12.00,
    oldPrice: 38.00,
    stock: 1650,
    lowStockThreshold: 40,
    sku: 'TRZ-COS-SUN-SPF50',
    image: 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Weightless Korean-style watery sunscreen lotion with zero white cast, broad UVA/UVB protection, and cica.',
    description: 'Forget heavy, chalky sunscreens forever. This revolutionary water-burst formula glides on like a refreshing serum, absorbing completely invisible on all skin tones with zero greasy shine.',
    bullets: [
      'Broad spectrum SPF 50+ / PA++++ protects against UVA, UVB, and pollution',
      '100% invisible finish with zero white cast on fair to deep skin tones',
      'Infused with centella asiatica (Cica) and hyaluronic acid to calm heat redness',
      'Perfect gripping primer under makeup that never pills or clings to dry patches'
    ],
    specifications: [
      { key: 'Volume', value: '50 ml (1.7 fl oz)' },
      { key: 'Sun Protection', value: 'SPF 50+ / PA++++' },
      { key: 'Finish', value: 'Invisible, Natural Dewy, Weightless' }
    ],
    labels: ['essential', 'featured'],
    tags: ['sunscreen', 'spf 50', 'cica', 'sun protection', 'skincare', 'face']
  },
  {
    name: 'Salicylic Acid 2% Daily Gentle Exfoliating Cleanser (200ml)',
    slug: 'salicylic-acid-2-percent-exfoliating-cleanser-200ml',
    brand: 'AuraGlow',
    categorySlug: 'beauty',
    price: 24.00,
    costPrice: 9.50,
    oldPrice: 32.00,
    stock: 1300,
    lowStockThreshold: 30,
    sku: 'TRZ-COS-CLN-SAL',
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Oil-soluble BHA foaming face wash that clears blackheads and unclogs pores without stripping moisture.',
    description: 'Penetrate deep inside pores where blackheads and pimples start. 2% salicylic acid gently dissolves trapped oil and dead skin cells while allantoin ensures a calm, comfortable cleanse.',
    bullets: [
      '2% pharmaceutical grade Salicylic Acid unclogs stubborn blackheads and whiteheads',
      'Gentle foaming amino-acid surfactant base respects the acid mantle',
      'Allantoin and green tea extract soothe inflammation during cleansing',
      'Safe for daily morning and evening use on acne-prone face and body'
    ],
    specifications: [
      { key: 'Volume', value: '200 ml (6.8 fl oz)' },
      { key: 'Active', value: '2.0% Salicylic Acid (BHA)' },
      { key: 'pH', value: 'Mildly Acidic 4.5' }
    ],
    labels: ['popular'],
    tags: ['cleanser', 'face wash', 'salicylic acid', 'blackheads', 'acne', 'skincare']
  },
  {
    name: '100% Organic Damask Rosewater Facial Hydrosol Mist Toner (120ml)',
    slug: 'organic-damask-rosewater-hydrosol-mist-toner-120ml',
    brand: 'LuxeBotanicals',
    categorySlug: 'beauty',
    price: 22.00,
    costPrice: 9.00,
    oldPrice: 28.00,
    stock: 1100,
    lowStockThreshold: 25,
    sku: 'TRZ-COS-TON-ROSE',
    image: 'https://images.unsplash.com/photo-1608248597359-0a6042456e30?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1608248597359-0a6042456e30?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Pure steam-distilled Bulgarian Rosa Damascena floral water in an ultra-fine continuous micro-mist bottle.',
    description: 'Harvested at dawn in Bulgaria’s famous Rose Valley. Pure unadulterated rose hydrosol naturally balances skin pH, tightens pores, and infuses tired skin with instant botanical hydration.',
    bullets: [
      '100% pure steam-distilled organic Rosa Damascena petals',
      'Natural astringent properties refine pores and balance skin pH 5.5',
      'Ultra-fine atomizer delivers a cloud-like mist that can refresh bare skin or set makeup',
      'Zero alcohol, synthetic fragrances, preservatives, or added water'
    ],
    specifications: [
      { key: 'Volume', value: '120 ml (4.0 fl oz)' },
      { key: 'Origin', value: 'Rose Valley, Kazanlak, Bulgaria' },
      { key: 'Bottle', value: 'Frosted Glass with Fine Micro-Mist Atomizer' }
    ],
    labels: ['pure'],
    tags: ['toner', 'rosewater', 'face mist', 'hydrosol', 'skincare', 'organic']
  },
  {
    name: 'Caffeine 5% + Peptides Dark Circle & Puffiness Brightening Eye Cream (15ml)',
    slug: 'caffeine-peptides-dark-circle-eye-cream-15ml',
    brand: 'AuraGlow',
    categorySlug: 'beauty',
    price: 27.00,
    costPrice: 11.00,
    oldPrice: 36.00,
    stock: 1200,
    lowStockThreshold: 25,
    sku: 'TRZ-COS-EYE-CAF',
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Awakening under-eye gel-cream with concentrated green coffee caffeine and cooling metal applicator tip.',
    description: 'Instantly de-puff tired eyes and erase dark circles from late nights. 5% micro-caffeine constricts dilated under-eye blood vessels while peptides stimulate firming collagen around delicate eye contours.',
    bullets: [
      '5% concentrated green coffee caffeine drains fluid retention and reduces puffiness',
      'Copper peptides and niacinamide visibly brighten dark shadows in 2 weeks',
      'Ergonomic cooling palladium alloy applicator tip gently massages under-eye area',
      'Ophthalmologist-tested and safe for contact lens wearers'
    ],
    specifications: [
      { key: 'Volume', value: '15 ml (0.5 fl oz)' },
      { key: 'Applicator', value: 'Cryo-Cooling Metal Alloy Tip' },
      { key: 'Key Actives', value: '5% Caffeine, Haloxyl Peptide, Niacinamide' }
    ],
    labels: ['trending'],
    tags: ['eye cream', 'caffeine', 'dark circles', 'eye puffiness', 'skincare']
  },

  // ─── 3. MAKEUP & COLOR COSMETICS ───
  {
    name: 'Velvet Matte Waterproof 16H Long-Wear Liquid Lipstick (Iconic Ruby Red)',
    slug: 'velvet-matte-waterproof-liquid-lipstick-ruby-red',
    brand: 'VogueGlam',
    categorySlug: 'beauty',
    price: 24.00,
    costPrice: 9.50,
    oldPrice: 32.00,
    stock: 1500,
    lowStockThreshold: 30,
    sku: 'TRZ-COS-LIP-RED',
    image: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Smudge-proof, transfer-resistant liquid matte lipstick infused with jojoba oil and vitamin E.',
    description: 'Bold, head-turning red lip color that stays flawlessly in place through meals and sips. Lightweight mousse texture dries down to a comfortable, non-cracking velvet matte finish that lasts 16 hours.',
    bullets: [
      'Single-swipe full opacity with intense rich pigment payoff',
      '16-hour transfer-proof and waterproof wear with zero bleeding',
      'Enriched with cold-pressed jojoba oil and vitamin E to prevent drying',
      'Precision teardrop doe-foot applicator lines and fills with perfection'
    ],
    specifications: [
      { key: 'Shade', value: 'Iconic Ruby Red (Cool-Toned Classic Red)' },
      { key: 'Finish', value: 'Velvet Soft Matte' },
      { key: 'Wear Time', value: 'Up to 16 Hours' }
    ],
    labels: ['bestseller', 'featured'],
    tags: ['lipstick', 'matte lipstick', 'red lipstick', 'makeup', 'lip color', 'cosmetics']
  },
  {
    name: 'Ultra-Creamy Satin Finish Hydrating Lipstick (Nude Elegance)',
    slug: 'ultra-creamy-satin-finish-hydrating-lipstick-nude',
    brand: 'VogueGlam',
    categorySlug: 'beauty',
    price: 22.00,
    costPrice: 8.50,
    oldPrice: 28.00,
    stock: 1300,
    lowStockThreshold: 25,
    sku: 'TRZ-COS-LIP-NUDE',
    image: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Buttery satin bullet lipstick in an everyday universal nude with hyaluronic filling spheres.',
    description: 'The quintessential everyday nude lipstick in an ultra-luxurious magnetic gold bullet. Glides like silk across the lips, imparting healthy luminous satin shine and moisture.',
    bullets: [
      'Universal warm beige nude compliments fair, medium, and deep skin tones',
      'Hyaluronic filling spheres visibly plump and smooth lip texture',
      'Magnetic click-close heavy metal case feels exceptionally luxurious',
      'Infused with avocado oil and mango butter for all-day comfort'
    ],
    specifications: [
      { key: 'Shade', value: 'Nude Elegance (Warm Neutral Nude)' },
      { key: 'Finish', value: 'Satin Luminous' },
      { key: 'Case', value: 'Weighted Magnetic Closure' }
    ],
    labels: ['popular'],
    tags: ['lipstick', 'nude lipstick', 'makeup', 'lip color', 'satin lipstick', 'cosmetics']
  },
  {
    name: 'Peptide Hydrating Lip Glow Treatment Oil (Berry Blossom)',
    slug: 'peptide-hydrating-lip-glow-treatment-oil-berry',
    brand: 'AuraGlow',
    categorySlug: 'beauty',
    price: 20.00,
    costPrice: 7.50,
    oldPrice: 26.00,
    stock: 1600,
    lowStockThreshold: 35,
    sku: 'TRZ-COS-LIP-OIL',
    image: 'https://images.unsplash.com/photo-1625093742435-6fa192b6fb10?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1625093742435-6fa192b6fb10?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Glass-like high-shine lip oil treatment combining berry seed oil with collagen-boosting peptides.',
    description: 'Give lips high-shine mirror glaze without the slightest hint of stickiness. Infused with antioxidant-rich raspberry seed oil, cherry oil, and lip-plumping peptides for soft, kissable lips.',
    bullets: [
      'High-refraction mirror shine finish with a sheer healthy berry tint',
      'Maxi-Lip peptides boost natural collagen and smooth lip lines',
      'Non-sticky, nourishing cushion texture wraps lips in hydration',
      'Jumbo plush doe-foot applicator blankets lips in one effortless coat'
    ],
    specifications: [
      { key: 'Volume', value: '7 ml (0.24 fl oz)' },
      { key: 'Shade', value: 'Berry Blossom (Sheer Juicy Pink Berry)' },
      { key: 'Feel', value: 'Non-Sticky, Nourishing, Plumping' }
    ],
    labels: ['viral', 'trending'],
    tags: ['lip oil', 'lip gloss', 'lip care', 'makeup', 'berry tint', 'cosmetics']
  },
  {
    name: 'Luminous Silk Breathable Full-Coverage Liquid Foundation (30ml)',
    slug: 'luminous-silk-breathable-full-coverage-liquid-foundation',
    brand: 'VogueGlam',
    categorySlug: 'beauty',
    price: 45.00,
    costPrice: 19.00,
    oldPrice: 58.00,
    stock: 1200,
    lowStockThreshold: 25,
    sku: 'TRZ-COS-FND-SILK',
    image: 'https://images.unsplash.com/photo-1631729371254-42c2892f0e6e?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1631729371254-42c2892f0e6e?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Weightless micro-silk liquid foundation delivering airbrushed medium-to-full coverage with a natural radiance.',
    description: 'Achieve second-skin perfection that looks like your skin on its absolute best day. Formulated with micro-fil technology that blurs blemishes, pores, and redness while letting skin breathe.',
    bullets: [
      'Buildable medium-to-full coverage that mimics authentic skin texture',
      '24-hour humidity-proof and sweat-resistant performance',
      'Hydrating glycerin and vitamin E prevent settling into fine lines',
      'Frosted glass bottle with precision dispensing pump'
    ],
    specifications: [
      { key: 'Volume', value: '30 ml (1.0 fl oz)' },
      { key: 'Finish', value: 'Luminous Silk / Natural Demi-Matte' },
      { key: 'Coverage', value: 'Medium to Full (Buildable)' }
    ],
    labels: ['luxury', 'featured'],
    tags: ['foundation', 'liquid foundation', 'makeup', 'face makeup', 'cosmetics']
  },
  {
    name: 'High-Impact Waterproof Volumizing & Lengthening Mascara (Jet Black)',
    slug: 'high-impact-waterproof-volumizing-lengthening-mascara',
    brand: 'VogueGlam',
    categorySlug: 'beauty',
    price: 25.00,
    costPrice: 10.00,
    oldPrice: 32.00,
    stock: 1750,
    lowStockThreshold: 40,
    sku: 'TRZ-COS-MSC-LASH',
    image: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Dramatic false-lash effect mascara with an hourglass fiber brush and clump-free waterproof formula.',
    description: 'Multiply your lashes with instant dramatic volume and sky-high lift. Specially engineered hourglass fiber brush grabs every tiny lash from root to tip, coating with ultra-black pigments.',
    bullets: [
      'Hourglass wand lifts, separates, and fans lashes out to a full 360 degrees',
      'Waterproof, flake-proof, and smudge-resistant through tears, sweat, and rain',
      'Conditioning panthenol and bamboo extract keep lashes flexible and soft',
      'Carbon black mineral pigments provide the deepest possible jet-black intensity'
    ],
    specifications: [
      { key: 'Color', value: 'Ultra Jet Black' },
      { key: 'Formula', value: 'Waterproof 24-Hour Hold' },
      { key: 'Brush Type', value: 'Dense Hourglass Fiber Bristle' }
    ],
    labels: ['bestseller'],
    tags: ['mascara', 'eye makeup', 'waterproof mascara', 'lashes', 'cosmetics']
  },
  {
    name: '18-Color Warm Sunset & Desert Rose Eyeshadow Palette',
    slug: '18-color-warm-sunset-desert-rose-eyeshadow-palette',
    brand: 'VogueGlam',
    categorySlug: 'beauty',
    price: 48.00,
    costPrice: 21.00,
    oldPrice: 62.00,
    stock: 850,
    lowStockThreshold: 20,
    sku: 'TRZ-COS-EYE-PLT',
    image: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Pro-grade eyeshadow palette featuring 10 velvety mattes, 5 multidimensional metallics, and 3 duo-chromes.',
    description: 'Endless versatile looks from daytime neutrals to sultry smokey eyes. Creamy, buttery powders blend effortlessly like melted butter, delivering intense color saturation with zero fallout.',
    bullets: [
      '18 highly pigmented warm terracotta, champagne, rose gold, and deep bronze shades',
      'Ultra-fine micronized powder blends seamlessly without muddying',
      'Features velvet mattes, foiled metallics, and reflective duo-chrome toppers',
      'Sleek magnetic palette includes large HD vanity mirror'
    ],
    specifications: [
      { key: 'Shade Count', value: '18 Shades (0.05 oz / 1.4g each)' },
      { key: 'Palette Size', value: '8.2 x 4.5 inches with Full Mirror' },
      { key: 'Formula', value: 'Talc-Free, Vegan, Paraben-Free' }
    ],
    labels: ['featured'],
    tags: ['eyeshadow', 'palette', 'eye makeup', 'cosmetics', 'shimmer', 'matte']
  },
  {
    name: 'Soft Dewy Liquid Cream Blush with Cushion Wand (Peachy Coral)',
    slug: 'soft-dewy-liquid-cream-blush-peachy-coral',
    brand: 'AuraGlow',
    categorySlug: 'beauty',
    price: 26.00,
    costPrice: 10.50,
    oldPrice: 34.00,
    stock: 1400,
    lowStockThreshold: 30,
    sku: 'TRZ-COS-BLSH-CRM',
    image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Weightless liquid blush that melts into cheeks for a fresh, dewy, pinched-from-within flush.',
    description: 'Get that coveted luminous glass-skin glow. Featherlight water-gel liquid blush formula blends seamlessly with fingers or brush, delivering buildable, translucent color that lasts all day.',
    bullets: [
      'Effortless natural pinch-of-color flush with radiant dewy skin finish',
      'Soft sponge cushion wand dots precisely onto high cheekbones',
      'Enriched with botanical squalane and lotus flower extract for all-day hydration',
      'Never disturbs base foundation or accentuates skin texture'
    ],
    specifications: [
      { key: 'Volume', value: '12 ml (0.4 fl oz)' },
      { key: 'Shade', value: 'Peachy Coral (Warm Peachy Pink Glow)' },
      { key: 'Finish', value: 'Dewy Radiant Glow' }
    ],
    labels: ['trending'],
    tags: ['blush', 'liquid blush', 'cream blush', 'cheeks', 'makeup', 'cosmetics']
  },
  {
    name: 'Waterproof Ultra-Precision Felt-Tip Liquid Eyeliner Pen (Carbon Black)',
    slug: 'waterproof-ultra-precision-felt-tip-liquid-eyeliner-pen',
    brand: 'VogueGlam',
    categorySlug: 'beauty',
    price: 19.00,
    costPrice: 7.00,
    oldPrice: 25.00,
    stock: 1900,
    lowStockThreshold: 45,
    sku: 'TRZ-COS-LIN-PEN',
    image: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: '0.1mm micro-fine Japanese calligraphy tip eyeliner pen delivering sharp wings that never skip or bleed.',
    description: 'Master the sharpest cat-eye flick with total control. Features an innovative internal ball shaker and Japanese calligraphy fiber tip that deposits rich, jet-black waterproof ink with razor precision.',
    bullets: [
      '0.1mm micro-point flexible felt tip draws ultra-thin lines or bold graphic wings',
      'Quick-drying smudge-proof formula sets in 10 seconds for 24-hour waterproof hold',
      'Continuous ink flow technology ensures zero skipping or dragging',
      'Safe for sensitive eyes and easily removed with warm water or oil cleanser'
    ],
    specifications: [
      { key: 'Color', value: 'Deepest Carbon Black (Matte)' },
      { key: 'Tip Size', value: '0.1mm Japanese Calligraphy Tip' },
      { key: 'Wear', value: '24-Hour Smudge-Proof / Waterproof' }
    ],
    labels: ['bestseller'],
    tags: ['eyeliner', 'liquid eyeliner', 'eye makeup', 'cosmetics', 'wings']
  },
  {
    name: 'Translucent Micro-Fine Blur Setting Powder with Velvet Puff (20g)',
    slug: 'translucent-micro-fine-blur-setting-powder',
    brand: 'VogueGlam',
    categorySlug: 'beauty',
    price: 32.00,
    costPrice: 13.00,
    oldPrice: 42.00,
    stock: 1100,
    lowStockThreshold: 25,
    sku: 'TRZ-COS-PWD-SET',
    image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Ultra-refined micro-milled loose powder that locks makeup in place for 16 hours with zero flashback.',
    description: 'Soft-focus blurring powder that acts like a real-life Instagram filter. Translucent silk silica particles absorb excess shine while blurring fine lines and pores without feeling heavy or dry.',
    bullets: [
      'Triple-milled featherweight texture sets makeup with zero cakey buildup',
      'Tested under high-definition flash photography with 100% zero white flashback',
      'Controls midday shine for up to 16 hours without drying out skin',
      'Includes plush ultra-soft velvet powder puff for effortless pressing and baking'
    ],
    specifications: [
      { key: 'Net Weight', value: '0.7 oz (20g)' },
      { key: 'Shade', value: 'Universal Translucent (Invisible on all skin tones)' },
      { key: 'Flashback', value: 'Guaranteed 0% Flashback' }
    ],
    labels: ['popular'],
    tags: ['setting powder', 'translucent powder', 'face powder', 'makeup', 'cosmetics']
  },
  {
    name: 'Golden Amber, Vanilla Bourbon & White Musk Luxury Eau De Parfum (100ml)',
    slug: 'golden-amber-vanilla-bourbon-white-musk-eau-de-parfum',
    brand: 'LuxeBotanicals',
    categorySlug: 'beauty',
    price: 78.00,
    costPrice: 34.00,
    oldPrice: 98.00,
    stock: 650,
    lowStockThreshold: 15,
    sku: 'TRZ-COS-EDP-AMB',
    image: 'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Intoxicating niche fragrance featuring warm golden amber, Madagascar vanilla bourbon, and clean white musk.',
    description: 'An unforgettable olfactory signature. Opens with sparkling Italian bergamot, transitioning into a heart of smoky Madagascar vanilla bourbon and resting on a hypnotic base of golden amber and white musk.',
    bullets: [
      '20% Eau de Parfum oil concentration delivering 10-12 hours of rich projection',
      'Top notes: Italian Bergamot, Pink Peppercorn',
      'Heart notes: Madagascar Vanilla Bourbon, Benzoin Resinoid',
      'Base notes: Golden Baltic Amber, Cashmere Wood, Silky White Musk'
    ],
    specifications: [
      { key: 'Concentration', value: 'Eau de Parfum (20% Oil)' },
      { key: 'Volume', value: '100 ml (3.4 fl oz)' },
      { key: 'Bottle', value: 'Heavy French Crystal Flacon with Magnetic Cap' }
    ],
    labels: ['luxury', 'bestseller'],
    tags: ['perfume', 'eau de parfum', 'fragrance', 'vanilla', 'amber', 'musk', 'luxury']
  },
  {
    name: 'Santal & Cardamom Unisex Woody Eau De Parfum (100ml)',
    slug: 'santal-cardamom-unisex-woody-eau-de-parfum',
    brand: 'LuxeBotanicals',
    categorySlug: 'beauty',
    price: 85.00,
    costPrice: 38.00,
    oldPrice: 110.00,
    stock: 550,
    lowStockThreshold: 15,
    sku: 'TRZ-COS-EDP-SNT',
    image: 'https://images.unsplash.com/photo-1547887537-6158d64c35b3?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1547887537-6158d64c35b3?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Sophisticated Australian sandalwood perfume blended with spicy cardamom, violet iris, and cedarwood.',
    description: 'A cult-favorite contemporary masterpiece. Creamy Australian sandalwood meets the electric spark of crushed green cardamom and powdery Florentine iris.',
    bullets: [
      'Premium 22% concentrated perfume oil for 12+ hour sillage',
      'Sensual woody profile beloved by all genders',
      'Responsibly sourced Australian sustainable sandalwood',
      'Heavy minimalist glass flacon with magnetic wood-grain cap'
    ],
    specifications: [
      { key: 'Volume', value: '100 ml (3.4 fl oz)' },
      { key: 'Fragrance Family', value: 'Woody Spicy' }
    ],
    labels: ['luxury'],
    tags: ['perfume', 'sandalwood', 'santal', 'fragrance', 'luxury']
  },
  {
    name: 'Baked Champagne Shimmer Strobe Highlighting Powder (8g)',
    slug: 'baked-champagne-shimmer-strobe-highlighting-powder',
    brand: 'VogueGlam',
    categorySlug: 'beauty',
    price: 28.00,
    costPrice: 11.00,
    oldPrice: 36.00,
    stock: 1200,
    lowStockThreshold: 25,
    sku: 'TRZ-COS-HLT-GLW',
    image: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Slow-baked illuminating powder that imparts an ethereal, glass-skin wet sheen without chunky glitter.',
    description: 'Drape cheekbones in pure liquid-like light. Terracotta oven-baked mineral pearls yield an ultra-fine, silky powder that glides over texture for a lit-from-within glow.',
    bullets: [
      'Zero chunky glitter particles—just pure micronized pearlescent pearl reflection',
      'Can be applied dry for a soft daytime sheen or wet for blinding metallic strobe',
      'Universal champagne gold hue flatters warm, neutral, and cool complexions',
      'Includes compact mirror for on-the-go touchups'
    ],
    specifications: [
      { key: 'Weight', value: '0.28 oz (8g)' },
      { key: 'Shade', value: 'Champagne Starlight' }
    ],
    labels: ['glow'],
    tags: ['highlighter', 'makeup', 'glow', 'champagne', 'cosmetics']
  },
  {
    name: '12-Piece Professional Ultra-Soft Vegan Makeup Brush Set with Travel Case',
    slug: '12-piece-professional-vegan-makeup-brush-set',
    brand: 'VogueGlam',
    categorySlug: 'beauty',
    price: 39.00,
    costPrice: 16.00,
    oldPrice: 55.00,
    stock: 950,
    lowStockThreshold: 20,
    sku: 'TRZ-COS-BRS-SET',
    image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Complete artistry brush collection with cruelty-free nanofiber bristles and solid birchwood handles.',
    description: 'Every brush you need for flawless complexion, contour, and eye makeup application. Engineered with patented synthetic fibers that pick up and distribute powder and liquid pigments like natural hair.',
    bullets: [
      'Includes 5 dense complexion brushes and 7 precision eye/lip brushes',
      'Velvety cruelty-free synthetic nanofiber bristles shed zero hairs',
      'Sturdy FSC-certified matte black birchwood handles with rose gold ferrules',
      'Includes luxury cylindrical snap-close travel brush cup'
    ],
    specifications: [
      { key: 'Piece Count', value: '12 Brushes + Hard Shell Travel Cup' },
      { key: 'Bristles', value: '100% Vegan Nanofiber' }
    ],
    labels: ['essential', 'set'],
    tags: ['makeup brushes', 'brush set', 'makeup', 'tools', 'cosmetics']
  },
  {
    name: 'French Green Clay & Matcha Purifying Pore Tightening Face Mask (100g)',
    slug: 'french-green-clay-matcha-purifying-face-mask',
    brand: 'BotanicaPure',
    categorySlug: 'beauty',
    price: 25.00,
    costPrice: 10.00,
    oldPrice: 34.00,
    stock: 1100,
    lowStockThreshold: 25,
    sku: 'TRZ-COS-MSK-CLAY',
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Deep cleansing mineral mud mask with French Montmorillonite clay and ceremonial Japanese matcha.',
    description: 'Draw out deep grime and tighten pores in 10 relaxing minutes. Pure French green illite clay absorbs impurities while antioxidant-rich matcha green tea calms irritation and reduces redness.',
    bullets: [
      'Absorbs excess sebum and shrinks the look of dilated pores',
      'Ceremonial Japanese matcha delivers potent EGCG antioxidants to reduce stress redness',
      'Non-stripping creamy formula rinses off effortlessly without tugging',
      'Leaves skin purified, matte, and remarkably soft'
    ],
    specifications: [
      { key: 'Net Weight', value: '3.5 oz (100g)' },
      { key: 'Treatment Time', value: '10-15 Minutes' }
    ],
    labels: ['detox'],
    tags: ['face mask', 'clay mask', 'matcha', 'green clay', 'skincare', 'pores']
  },
  {
    name: '24K Bio-Collagen Hydrogel Rejuvenating Overnight Sleeping Mask (Set of 5)',
    slug: '24k-bio-collagen-hydrogel-rejuvenating-sleeping-mask',
    brand: 'AuraGlow',
    categorySlug: 'beauty',
    price: 34.00,
    costPrice: 14.00,
    oldPrice: 48.00,
    stock: 1300,
    lowStockThreshold: 30,
    sku: 'TRZ-COS-MSK-GOLD',
    image: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Viral deep-absorption collagen hydrogel face sheet mask that turns transparent as actives sink in overnight.',
    description: 'Wake up to glass skin with zero fine lines. Low molecular weight collagen and oligo-hyaluronic acid slowly absorb through the epidermis overnight, leaving behind plump, bouncy elasticity.',
    bullets: [
      'Real 24K colloidal gold boosts cellular renewal and luminosity',
      'Hydrogel sheet slowly turns transparent as skin drinks in all active collagen',
      'Locks in continuous moisture for 8+ hours while you sleep',
      'Hypoallergenic formula clinically proven to improve skin elasticity by 34%'
    ],
    specifications: [
      { key: 'Pack Size', value: '5 Individually Wrapped Hydrogel Masks' },
      { key: 'Key Actives', value: '24K Gold, Hydrolyzed Collagen, Galactomyces' }
    ],
    labels: ['viral', 'luxury'],
    tags: ['sheet mask', 'collagen', 'gold mask', 'overnight mask', 'skincare', 'k-beauty']
  },
  {
    name: 'Green Tea & Centella Asiatica Calming Foam Face Wash (150ml)',
    slug: 'green-tea-centella-calming-foam-face-wash',
    brand: 'BotanicaPure',
    categorySlug: 'beauty',
    price: 21.00,
    costPrice: 8.50,
    oldPrice: 28.00,
    stock: 1450,
    lowStockThreshold: 30,
    sku: 'TRZ-COS-CLN-FOAM',
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&auto=format&fit=crop&q=80',
    images: [{ url: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&auto=format&fit=crop&q=80', key: null }],
    shortDescription: 'Micro-bubble gentle cleansing foam with fermented green tea seed extract and soothing Tiger Grass (Cica).',
    description: 'A cloud of gentle, micro-fine cleansing bubbles that whisks away makeup and sunscreen without disturbing the acid mantle. Centella Asiatica immediately calms redness and irritation.',
    bullets: [
      'Self-foaming pump creates dense marshmallow bubbles with zero friction',
      'Centella Asiatica (Tiger Grass) calms inflammation, burning, and sensitivity',
      'Green tea polyphenols protect against oxidative environmental stress',
      'Mild 5.5 pH leaves skin hydrated and comfortable, never stripped'
    ],
    specifications: [
      { key: 'Volume', value: '150 ml (5.1 fl oz)' },
      { key: 'pH', value: 'Balanced 5.5' }
    ],
    labels: ['gentle'],
    tags: ['face wash', 'foam cleanser', 'green tea', 'cica', 'centella', 'skincare']
  }
];
