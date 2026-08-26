import dns from 'dns';
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const MONGO_URI =
  process.env.MONGO_URI ||
  'mongodb+srv://aizazkhan6241_db_user:98av24298@cluster0.ijpphlb.mongodb.net/bazario?retryWrites=true&w=majority&appName=Cluster0&tlsAllowInvalidCertificates=true';

// Category IDs found in database
const CAT_FASHION = new mongoose.Types.ObjectId('6a88faa687b7b84a343930ca');
const CAT_BEAUTY = new mongoose.Types.ObjectId('6a88faa787b7b84a343930cc');
const CAT_WATCHES = new mongoose.Types.ObjectId('6a88faa787b7b84a343930cb');

async function seed() {
  console.log('🔌 Connecting to MongoDB Atlas...');
  await mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000,
    tlsAllowInvalidCertificates: true,
  });
  console.log('✅ Connected to database:', mongoose.connection.name);

  const db = mongoose.connection.db;

  // Verify existing collections & counts before adding
  const existingSellers = await db.collection('sellers').countDocuments();
  const existingOrders = await db.collection('orders').countDocuments();
  const existingProducts = await db.collection('products').countDocuments();
  console.log(`📊 Baseline Counts -> Sellers: ${existingSellers}, Products: ${existingProducts}, Orders: ${existingOrders}`);

  // Check if Kavya Patel seller already exists
  const existingKavya = await db.collection('sellers').findOne({
    $or: [{ email: 'kavya.patel@bazario.com' }, { email: 'kavya.patel@gmail.com' }, { storeSlug: 'kavya-heritage-couture' }],
  });

  let sellerId;
  const passwordPlain = 'KavyaPatel@2026';
  const passwordHash = await bcrypt.hash(passwordPlain, 10);

  if (existingKavya) {
    console.log(`ℹ️ Kavya Patel seller record already exists (ID: ${existingKavya._id}). Updating financials to Multi-Millionaire status...`);
    sellerId = existingKavya._id;

    await db.collection('sellers').updateOne(
      { _id: sellerId },
      {
        $set: {
          storeName: 'Kavya Heritage & Couture',
          ownerName: 'Kavya Patel',
          email: 'kavya.patel@bazario.com',
          passwordHash,
          phone: '+91 98204 77123',
          storeSlug: 'kavya-heritage-couture',
          logo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
          banner: 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=1600&auto=format&fit=crop&q=80',
          description:
            'Elite Indian haute couture, handcrafted pure bridal lehengas, authentic Banarasi & Kanjivaram zari silk sarees, heritage Polki and Kundan bridal jewelry, and bespoke royal ensembles curated by Kavya Patel.',
          address: {
            street: 'Suite 402, Signature Towers, Linking Road',
            city: 'Mumbai',
            state: 'Maharashtra',
            postalCode: '400050',
            country: 'India',
          },
          payoutDetails: {
            upiId: 'kavya.patel@okhdfcbank',
            accountTitle: 'Kavya Patel Luxury Collections LLP',
            accountNumber: '50100483920194',
            bankName: 'HDFC Bank',
            ifscCode: 'HDFC0000060',
            preferredMethod: 'bank',
          },
          withdrawalMethods: {
            bankTransfer: {
              enabled: true,
              accountTitle: 'Kavya Patel Luxury Collections LLP',
              accountNumber: '50100483920194',
              bankName: 'HDFC Bank',
              ifscCode: 'HDFC0000060',
              branchName: 'Bandra West Branch, Mumbai',
              accountType: 'Current / Business',
            },
            upi: {
              enabled: true,
              upiId: 'kavya.patel@okhdfcbank',
              holderName: 'Kavya Patel',
            },
            gpay: {
              enabled: true,
              phone: '+91 98204 77123',
              upiId: 'kavya.patel@okhdfcbank',
              accountName: 'Kavya Patel',
            },
            phonepe: {
              enabled: true,
              phone: '+91 98204 77123',
              upiId: 'kavya.patel@ybl',
              accountName: 'Kavya Patel',
            },
            paytm: {
              enabled: true,
              phone: '+91 98204 77123',
              accountName: 'Kavya Patel',
            },
            usdt: {
              enabled: true,
              walletAddress: 'TCv8q9HjX1Y87kL90QmMnoP44xZpAbc123',
              network: 'TRC-20',
            },
          },
          commissionRate: 8,
          status: 'active',
          verified: true,
          isEmailVerified: true,
          rating: 4.98,
          numReviews: 2450,
          totalSales: 4860000,
          totalOrders: 155,
          wallet: {
            balance: 785400,
            processingFund: 248500,
            totalProfitEarned: 850000,
            totalEarned: 4250000,
            totalDeposited: 950000,
            totalWithdrawn: 3464600,
            pendingDeposit: 0,
            pendingWithdrawal: 0,
            securityDeposit: 50000,
          },
          securityDeposit: {
            paid: true,
            amount: 50000,
            paidAt: new Date(Date.now() - 180 * 24 * 3600 * 1000),
            referralCode: 'VIP-MUMBAI-2026',
            note: 'Verified Diamond Tier Enterprise Deposit ($50,000 USD via HDFC Wire)',
          },
          accountHealth: {
            score: 100,
            status: 'healthy',
            lateShipmentRate: 0,
            orderDefectRate: 0,
            policyViolations: 0,
            lastEvaluatedAt: new Date(),
          },
          withdrawalLimit: {
            maxAmount: 500000,
            minAmount: 10,
            currentTierName: 'Tier 5 - Royal Multi-Millionaire VIP ($500,000 Max)',
            successfulWithdrawalCount: 85,
            requiredWithdrawalsForIncrease: 100,
            upgradeFee: 0,
          },
          updatedAt: new Date(),
        },
      }
    );
  } else {
    sellerId = new mongoose.Types.ObjectId();
    const newSeller = {
      _id: sellerId,
      storeName: 'Kavya Heritage & Couture',
      ownerName: 'Kavya Patel',
      email: 'kavya.patel@bazario.com',
      passwordHash,
      phone: '+91 98204 77123',
      storeSlug: 'kavya-heritage-couture',
      logo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
      banner: 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=1600&auto=format&fit=crop&q=80',
      description:
        'Elite Indian haute couture, handcrafted pure bridal lehengas, authentic Banarasi & Kanjivaram zari silk sarees, heritage Polki and Kundan bridal jewelry, and bespoke royal ensembles curated by Kavya Patel.',
      address: {
        street: 'Suite 402, Signature Towers, Linking Road',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400050',
        country: 'India',
      },
      payoutDetails: {
        upiId: 'kavya.patel@okhdfcbank',
        accountTitle: 'Kavya Patel Luxury Collections LLP',
        accountNumber: '50100483920194',
        bankName: 'HDFC Bank',
        ifscCode: 'HDFC0000060',
        preferredMethod: 'bank',
      },
      withdrawalMethods: {
        bankTransfer: {
          enabled: true,
          accountTitle: 'Kavya Patel Luxury Collections LLP',
          accountNumber: '50100483920194',
          bankName: 'HDFC Bank',
          ifscCode: 'HDFC0000060',
          branchName: 'Bandra West Branch, Mumbai',
          accountType: 'Current / Business',
        },
        upi: {
          enabled: true,
          upiId: 'kavya.patel@okhdfcbank',
          holderName: 'Kavya Patel',
        },
        gpay: {
          enabled: true,
          phone: '+91 98204 77123',
          upiId: 'kavya.patel@okhdfcbank',
          accountName: 'Kavya Patel',
        },
        phonepe: {
          enabled: true,
          phone: '+91 98204 77123',
          upiId: 'kavya.patel@ybl',
          accountName: 'Kavya Patel',
        },
        paytm: {
          enabled: true,
          phone: '+91 98204 77123',
          accountName: 'Kavya Patel',
        },
        usdt: {
          enabled: true,
          walletAddress: 'TCv8q9HjX1Y87kL90QmMnoP44xZpAbc123',
          network: 'TRC-20',
        },
      },
      commissionRate: 8,
      status: 'active',
      verified: true,
      isEmailVerified: true,
      rating: 4.98,
      numReviews: 2450,
      totalSales: 4860000,
      totalOrders: 155,
      wallet: {
        balance: 785400,
        processingFund: 248500,
        totalProfitEarned: 850000,
        totalEarned: 4250000,
        totalDeposited: 950000,
        totalWithdrawn: 3464600,
        pendingDeposit: 0,
        pendingWithdrawal: 0,
        securityDeposit: 50000,
      },
      securityDeposit: {
        paid: true,
        amount: 50000,
        paidAt: new Date(Date.now() - 180 * 24 * 3600 * 1000),
        referralCode: 'VIP-MUMBAI-2026',
        note: 'Verified Diamond Tier Enterprise Deposit ($50,000 USD via HDFC Wire)',
      },
      accountHealth: {
        score: 100,
        status: 'healthy',
        lateShipmentRate: 0,
        orderDefectRate: 0,
        policyViolations: 0,
        lastEvaluatedAt: new Date(),
      },
      withdrawalLimit: {
        maxAmount: 500000,
        minAmount: 10,
        currentTierName: 'Tier 5 - Royal Multi-Millionaire VIP ($500,000 Max)',
        successfulWithdrawalCount: 85,
        requiredWithdrawalsForIncrease: 100,
        upgradeFee: 0,
      },
      createdAt: new Date(Date.now() - 240 * 24 * 3600 * 1000),
      updatedAt: new Date(),
    };

    await db.collection('sellers').insertOne(newSeller);
    console.log(`✅ Created new Seller: ${newSeller.storeName} (${newSeller.ownerName}, ID: ${sellerId})`);
  }

  // Define 20 Luxury Indian Products
  const rawProducts = [
    {
      name: 'Royal Heritage Velvet Handcrafted Bridal Lehenga Set',
      slug: 'royal-heritage-velvet-bridal-lehenga',
      brand: 'Kavya Heritage Couture',
      category: CAT_FASHION,
      price: 5850,
      oldPrice: 6500,
      stock: 35,
      sold: 148,
      rating: 4.98,
      numReviews: 96,
      image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=800&auto=format&fit=crop&q=80',
      description: 'Opulent crimson micro-velvet bridal lehenga adorned with antique gold zardozi, dabka, and real cut-dana embroidery. Accompanied by twin dupattas in pure tissue silk and soft tulle with scalloped borders.',
      bullets: ['100% pure micro-velvet fabric', 'Intricate hand-embroidered heritage zardozi', 'Double dupatta styling with scalloped zari work', 'Custom tailoring available to exact bridal measurements'],
      labels: ['best', 'featured'],
      tags: ['bridal', 'lehenga', 'wedding', 'couture', 'indian fashion'],
    },
    {
      name: 'Handwoven Pure Kanjivaram Gold Zari Silk Saree',
      slug: 'handwoven-pure-kanjivaram-gold-zari-saree',
      brand: 'Kavya Heritage Couture',
      category: CAT_FASHION,
      price: 2450,
      oldPrice: 2800,
      stock: 45,
      sold: 215,
      rating: 4.99,
      numReviews: 142,
      image: 'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?w=800&auto=format&fit=crop&q=80',
      description: 'Authentic GI-tagged Kanchipuram mulberry silk woven with pure silver electroplated in 24K gold zari. Features classic temple borders and majestic peacock pallu motifs.',
      bullets: ['Certified Silk Mark & Handloom Mark', 'Pure 24K gold electroplated silver zari', 'Includes unstitched designer blouse piece', 'Heirloom collection with life-long luster guarantee'],
      labels: ['hot', 'best'],
      tags: ['saree', 'kanjivaram', 'pure silk', 'festive', 'luxury'],
    },
    {
      name: '22K Gold-Plated Kundan & Polki Royal Bridal Choker Set',
      slug: '22k-gold-plated-kundan-polki-bridal-choker',
      brand: 'Kavya Jewels Heritage',
      category: CAT_WATCHES,
      price: 4100,
      oldPrice: 4600,
      stock: 25,
      sold: 86,
      rating: 4.97,
      numReviews: 54,
      image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800&auto=format&fit=crop&q=80',
      description: 'Majestic royal Rajasthani Kundan choker set encrusted with uncut Polki crystals, cultured basra pearls, and emerald green drops. Complete with matching chandelier jhumkas and maang tikka.',
      bullets: ['Heavy 22-karat micro gold plating', 'Handcrafted uncut Polki crystal settings', 'Includes choker necklace, matching earrings, and maang tikka', 'Meenakari enamel craftsmanship on reverse'],
      labels: ['featured', 'limited'],
      tags: ['jewelry', 'kundan', 'polki', 'bridal jewelry', 'royal'],
    },
    {
      name: 'Emerald & Diamond Cut Royal Maharani Statement Necklace',
      slug: 'emerald-diamond-cut-maharani-statement-necklace',
      brand: 'Kavya Jewels Heritage',
      category: CAT_WATCHES,
      price: 7200,
      oldPrice: 8000,
      stock: 18,
      sold: 52,
      rating: 5.0,
      numReviews: 38,
      image: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=800&auto=format&fit=crop&q=80',
      description: 'Spectacular multi-strand cascading necklace featuring AAA lab-certified Colombian emerald droplets, brilliant diamond-cut moissanite stones, and south sea pearl strings.',
      bullets: ['Certified gemstone appraisal certificate included', 'Ultra-durable anti-tarnish rhodium and gold finish', 'Bespoke royal heirloom piece designed for galas and royal weddings', 'Velvet lined hardwood presentation keepsake box'],
      labels: ['limited', 'featured'],
      tags: ['emerald', 'necklace', 'luxury jewelry', 'diamonds', 'royal'],
    },
    {
      name: 'Hand-Embroidered Raw Silk Anarkali Gown Ensemble',
      slug: 'hand-embroidered-raw-silk-anarkali-gown',
      brand: 'Kavya Heritage Couture',
      category: CAT_FASHION,
      price: 1880,
      oldPrice: 2200,
      stock: 40,
      sold: 175,
      rating: 4.95,
      numReviews: 88,
      image: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=800&auto=format&fit=crop&q=80',
      description: 'Floor-length flared 56-kali Anarkali gown crafted from rich raw silk, embellished with gota patti, pearls, and resham floral vines. Pairs with churidar pants and a pure organza dupatta.',
      bullets: ['Full 7-meter flare with layered can-can netting', 'Hand-done gota patti and pearl threadwork', 'Lightweight pure silk organza embroidered dupatta', 'Concealed side zipper with comfortable cotton lining'],
      labels: ['best'],
      tags: ['anarkali', 'gown', 'partywear', 'silk', 'designer'],
    },
    {
      name: 'Pure Banarasi Georgette Meenakari Handloom Saree',
      slug: 'pure-banarasi-georgette-meenakari-saree',
      brand: 'Kavya Heritage Couture',
      category: CAT_FASHION,
      price: 1680,
      oldPrice: 1950,
      stock: 50,
      sold: 192,
      rating: 4.96,
      numReviews: 110,
      image: 'https://images.unsplash.com/photo-1610030469668-9359e13d964f?w=800&auto=format&fit=crop&q=80',
      description: 'Exquisite lightweight pure khaddi georgette saree featuring intricate Meenakari colorful silk motifs woven alongside antique silver and golden zari shikargah designs.',
      bullets: ['Pure handloom Banarasi georgette fabric', 'Double shaded antique zari with colorful Meenakari weave', 'Soft, breathable drape with royal fall', 'Authentic Varanasi artisanal weave'],
      labels: ['hot'],
      tags: ['banarasi', 'georgette', 'meenakari', 'saree', 'traditional'],
    },
    {
      name: 'Handcrafted Kashmiri Pashmina Cashmere Royal Shawl',
      slug: 'handcrafted-kashmiri-pashmina-cashmere-shawl',
      brand: 'Kavya Heritage Couture',
      category: CAT_FASHION,
      price: 2150,
      oldPrice: 2500,
      stock: 30,
      sold: 120,
      rating: 4.99,
      numReviews: 84,
      image: 'https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=800&auto=format&fit=crop&q=80',
      description: '100% pure Changthangi mountain cashmere wool hand-spun and hand-embroidered with micro Sozni needlework taking master artisans over 14 months to complete.',
      bullets: ['Passes the authentic ring test effortlessly', 'Ultra-fine 14-micron Changthangi Pashmina wool', 'Micro-needle Sozni hand embroidery throughout borders and pallu', 'GI registered Kashmiri artisanal masterpiece'],
      labels: ['best', 'featured'],
      tags: ['pashmina', 'cashmere', 'shawl', 'kashmir', 'luxury winter'],
    },
    {
      name: 'Designer Zardozi Work Georgette Sharara Suit Set',
      slug: 'designer-zardozi-work-georgette-sharara-suit',
      brand: 'Kavya Heritage Couture',
      category: CAT_FASHION,
      price: 2650,
      oldPrice: 2950,
      stock: 32,
      sold: 135,
      rating: 4.94,
      numReviews: 76,
      image: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800&auto=format&fit=crop&q=80',
      description: 'Contemporary Lucknowi silhouette meets Mughal glamour. Features a heavily embellished peplum short kurti, layered flared sharara trousers, and mirror-work tulle dupatta.',
      bullets: ['Heavy hand-done zardozi with sequin highlights', 'Multi-tier gathered flare sharara pants', 'Lightweight georgette base with soft satin lining', 'Flattering modern fit tailored to perfection'],
      labels: ['new', 'hot'],
      tags: ['sharara', 'suit', 'designer', 'partywear', 'eid couture'],
    },
    {
      name: 'Heritage Temple Jewelry Antique Gold Waist Belt (Kamarbandh)',
      slug: 'heritage-temple-jewelry-antique-gold-kamarbandh',
      brand: 'Kavya Jewels Heritage',
      category: CAT_WATCHES,
      price: 3250,
      oldPrice: 3600,
      stock: 22,
      sold: 68,
      rating: 4.97,
      numReviews: 44,
      image: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=800&auto=format&fit=crop&q=80',
      description: 'Traditional South Indian bridal waist belt sculpted with Goddess Lakshmi and divine dancers motifs, accented with Kemp rubies and dangling golden ghungroos.',
      bullets: ['Cast in solid brass with 24K antique matte gold dip', 'Accented with genuine Kemp rubies and emeralds', 'Adjustable extension chain suitable for all waist sizes', 'Signature bridal adornment for classical brides'],
      labels: ['limited'],
      tags: ['temple jewelry', 'kamarbandh', 'waist belt', 'antique gold', 'bridal'],
    },
    {
      name: 'Hand-Embossed Mojari Bridal Juttis with Zari Crafting',
      slug: 'hand-embossed-mojari-bridal-juttis-zari',
      brand: 'Kavya Heritage Couture',
      category: CAT_FASHION,
      price: 650,
      oldPrice: 750,
      stock: 65,
      sold: 310,
      rating: 4.92,
      numReviews: 185,
      image: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=800&auto=format&fit=crop&q=80',
      description: 'Handcrafted genuine leather juttis padded with memory foam comfort soles, lavishly embroidered with golden bullion thread and micro pearls.',
      bullets: ['100% genuine vegetable-tanned soft leather', 'Double-padded memory cushion insole for bridal comfort', 'Hand-stitched zari and micro pearl embroidery', 'Bite-free soft lining designed for all-day celebrations'],
      labels: ['best'],
      tags: ['shoes', 'juttis', 'mojari', 'bridal footwear', 'handcrafted'],
    },
    {
      name: 'Royal South Sea Pearl & Polki Chandbali Statement Earrings',
      slug: 'royal-south-sea-pearl-polki-chandbali-earrings',
      brand: 'Kavya Jewels Heritage',
      category: CAT_WATCHES,
      price: 1490,
      oldPrice: 1750,
      stock: 45,
      sold: 230,
      rating: 4.98,
      numReviews: 125,
      image: 'https://images.unsplash.com/photo-1630019852942-f89202989a59?w=800&auto=format&fit=crop&q=80',
      description: 'Crescent moon shaped Chandbali earrings framed with uncut Polki stones, cascading natural south sea pearls, and delicate turquoise enamel inlay.',
      bullets: ['Statement 4-inch chandelier drop length', 'Featherlight hollow-back structural engineering', 'Natural cultured south sea baroque pearls', 'Secure screw-back closure for comfort'],
      labels: ['hot', 'best'],
      tags: ['earrings', 'chandbali', 'pearls', 'polki', 'jewelry'],
    },
    {
      name: 'Handcrafted Rose Gold & Moissanite Diamond Kada Bangle Pair',
      slug: 'handcrafted-rose-gold-moissanite-diamond-kada-pair',
      brand: 'Kavya Jewels Heritage',
      category: CAT_WATCHES,
      price: 3750,
      oldPrice: 4200,
      stock: 28,
      sold: 95,
      rating: 4.97,
      numReviews: 62,
      image: 'https://images.unsplash.com/photo-1611591475816-16017b2b0051?w=800&auto=format&fit=crop&q=80',
      description: 'Pair of openable royal kadas encrusted with VVS1 clarity D-color moissanite diamonds set in 18K rose-gold plating with screw hinges.',
      bullets: ['Includes 2 matching kada bangles', 'Passes diamond tester with brilliant fire and scintillation', 'Concealed safety lock clasp mechanism', 'Custom sizing available from 2.4 to 2.8'],
      labels: ['featured'],
      tags: ['bangles', 'kada', 'diamonds', 'rose gold', 'luxury jewelry'],
    },
    {
      name: 'Embroidered Raw Silk Groom Royal Sherwani Ensemble',
      slug: 'embroidered-raw-silk-groom-royal-sherwani',
      brand: 'Kavya Heritage Couture',
      category: CAT_FASHION,
      price: 3800,
      oldPrice: 4300,
      stock: 25,
      sold: 88,
      rating: 4.96,
      numReviews: 50,
      image: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=800&auto=format&fit=crop&q=80',
      description: 'Regal ivory raw silk sherwani intricately hand-embroidered with tone-on-tone French knots, antique gold wires, and Swarovski crystal buttons. Includes churidar and stoles.',
      bullets: ['Complete 5-piece groom set (Sherwani, Kurta, Churidar, Stole, Safa fabric)', 'Real hand-set Swarovski crystal front buttons', 'Structured shoulder silhouette with canvas interlining', 'Tailored for royal wedding entrances'],
      labels: ['featured'],
      tags: ['menswear', 'sherwani', 'groom', 'wedding', 'royal ensemble'],
    },
    {
      name: 'Hand-Woven Tussar Silk Contemporary Festive Saree',
      slug: 'hand-woven-tussar-silk-contemporary-saree',
      brand: 'Kavya Heritage Couture',
      category: CAT_FASHION,
      price: 1260,
      oldPrice: 1450,
      stock: 55,
      sold: 210,
      rating: 4.93,
      numReviews: 130,
      image: 'https://images.unsplash.com/photo-1610030469850-2e4a8ea6497a?w=800&auto=format&fit=crop&q=80',
      description: 'Rich textured wild Tussar silk saree featuring modern geometric block printing, kantha stitch borders, and natural madder-root dyes.',
      bullets: ['100% natural wild Tussar silk texture', 'Authentic eco-friendly vegetable dyes', 'Hand-done kantha running stitch detailing', 'Airy, regal drape ideal for festive evenings'],
      labels: ['new'],
      tags: ['tussar silk', 'saree', 'handloom', 'festive', 'artisan'],
    },
    {
      name: 'Heritage Velvet Potli Clutch with Natural Pearl Tassels',
      slug: 'heritage-velvet-potli-clutch-pearl-tassels',
      brand: 'Kavya Heritage Couture',
      category: CAT_FASHION,
      price: 550,
      oldPrice: 650,
      stock: 75,
      sold: 380,
      rating: 4.91,
      numReviews: 210,
      image: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800&auto=format&fit=crop&q=80',
      description: 'Rich emerald green velvet drawstring evening potli embellished with gold floral zardozi and weighty natural pearl hangings.',
      bullets: ['Lush deep velvet outer shell with satin lining', 'Braided gold metallic drawstring handles', 'Spacious interior fits all smartphone models and essentials', 'Signature bridal and festive cocktail accessory'],
      labels: ['best', 'hot'],
      tags: ['bags', 'potli', 'clutch', 'accessories', 'wedding clutch'],
    },
    {
      name: 'Pure Chanderi Silk Floral Embroidered Kurta Palazzo Set',
      slug: 'pure-chanderi-silk-floral-embroidered-kurta-set',
      brand: 'Kavya Heritage Couture',
      category: CAT_FASHION,
      price: 980,
      oldPrice: 1150,
      stock: 60,
      sold: 260,
      rating: 4.94,
      numReviews: 140,
      image: 'https://images.unsplash.com/photo-1566174053879-31528523f8ae?w=800&auto=format&fit=crop&q=80',
      description: 'Pastel peach pure Chanderi silk straight kurta set with pastel resham thread florals, scalloped palazzo pants, and sheer zari border dupatta.',
      bullets: ['Feather-light Chanderi silk with golden luster', 'Delicate pastel silk threadwork embroidery', 'Flared palazzo trousers with elasticated back waist', 'Versatile luxury daytime festive wear'],
      labels: ['new'],
      tags: ['kurta set', 'chanderi', 'palazzo', 'designer suits', 'luxury'],
    },
    {
      name: 'Royal Nizam Heritage Ruby & Emerald Matha Patti Headpiece',
      slug: 'royal-nizam-heritage-ruby-emerald-matha-patti',
      brand: 'Kavya Jewels Heritage',
      category: CAT_WATCHES,
      price: 2550,
      oldPrice: 2900,
      stock: 24,
      sold: 72,
      rating: 4.98,
      numReviews: 46,
      image: 'https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?w=800&auto=format&fit=crop&q=80',
      description: 'Mughal-inspired three-tier bridal matha patti headpiece with carved teardrop rubies, cabochon emeralds, and uncut Polki crystals.',
      bullets: ['Triple tier hair chain with side comb attachments', 'Carved lab gemstones and natural seed pearls', 'Secure hair grip hooks and comfortable contouring', 'Authentic Hyderabadi Nizam royal court design'],
      labels: ['limited'],
      tags: ['matha patti', 'headpiece', 'bridal hair jewelry', 'nizam royal'],
    },
    {
      name: 'Hand-Block Printed Pure Chiffon Designer Dupatta Collection',
      slug: 'hand-block-printed-chiffon-designer-dupatta',
      brand: 'Kavya Heritage Couture',
      category: CAT_FASHION,
      price: 780,
      oldPrice: 890,
      stock: 70,
      sold: 340,
      rating: 4.95,
      numReviews: 195,
      image: 'https://images.unsplash.com/photo-1607522370275-f14206abe5d3?w=800&auto=format&fit=crop&q=80',
      description: 'Super-fine 100% pure Bemberg chiffon dupatta with hand-carved teakwood block printing, finished with golden gotta patti borders.',
      bullets: ['2.6-meter generous flowing length', 'Real hand-block printing by master Bagru artisans', 'Hand-stitched double gota and sequin piping', 'Lightweight, ethereal drape with graceful float'],
      labels: ['best'],
      tags: ['dupatta', 'chiffon', 'block print', 'accessories'],
    },
    {
      name: 'Oud & Saffron Royal Extrait de Parfum (100ml)',
      slug: 'oud-saffron-royal-extrait-de-parfum-100ml',
      brand: 'Kavya Fragrances Royal',
      category: CAT_BEAUTY,
      price: 680,
      oldPrice: 790,
      stock: 80,
      sold: 420,
      rating: 4.99,
      numReviews: 290,
      image: 'https://images.unsplash.com/photo-1594035910387-fea47794261f?w=800&auto=format&fit=crop&q=80',
      description: 'Masterwork artisanal perfume featuring aged 25-year wild Assamese Dehn al Oud, Kashmiri saffron stigma, Damascus rose petals, and warm amber resin.',
      bullets: ['Pure 35% Extrait de Parfum oil concentration', 'Wild harvested 25-year aged Assamese Agarwood', '24+ hour long-lasting projection and opulent sillage', 'Handcrafted crystal flacon with gold-plated atomizer'],
      labels: ['hot', 'best'],
      tags: ['perfume', 'oud', 'fragrance', 'luxury scent', 'saffron'],
    },
    {
      name: 'Antique Kundan Hathphool Hand Harness Pair',
      slug: 'antique-kundan-hathphool-hand-harness-pair',
      brand: 'Kavya Jewels Heritage',
      category: CAT_WATCHES,
      price: 1420,
      oldPrice: 1650,
      stock: 35,
      sold: 110,
      rating: 4.97,
      numReviews: 70,
      image: 'https://images.unsplash.com/photo-1598560917505-59a3ad559071?w=800&auto=format&fit=crop&q=80',
      description: 'Pair of royal bridal hathphool wrist-to-finger hand ornaments featuring floral Kundan center medallions and multi-finger ring chains.',
      bullets: ['Includes 2 hand ornaments (left and right)', 'Adjustable wrist bracelet and ring bands for comfortable fit', 'Enamel meenakari painted flowers on inner contact side', 'Traditional royal bridal ceremony essential'],
      labels: ['featured'],
      tags: ['hathphool', 'hand harness', 'kundan', 'bridal jewelry'],
    },
  ];

  // Insert or update products for this seller (without touching any other products)
  const productDocs = [];
  for (const p of rawProducts) {
    const existing = await db.collection('products').findOne({ slug: p.slug });
    if (existing) {
      await db.collection('products').updateOne(
        { _id: existing._id },
        {
          $set: {
            ...p,
            seller: sellerId,
            sellerName: 'Kavya Heritage & Couture',
            sellerSlug: 'kavya-heritage-couture',
            active: true,
            updatedAt: new Date(),
          },
        }
      );
      productDocs.push(existing);
    } else {
      const prodId = new mongoose.Types.ObjectId();
      const newProd = {
        _id: prodId,
        ...p,
        seller: sellerId,
        sellerName: 'Kavya Heritage & Couture',
        sellerSlug: 'kavya-heritage-couture',
        costs: {
          purchase: Math.round(p.price * 0.7),
          delivery: 25,
          packaging: 15,
          tax: 0,
          other: 0,
        },
        images: [{ url: p.image, key: null }],
        primeEligible: true,
        freeDelivery: true,
        active: true,
        createdAt: new Date(Date.now() - 200 * 24 * 3600 * 1000),
        updatedAt: new Date(),
      };
      await db.collection('products').insertOne(newProd);
      productDocs.push(newProd);
    }
  }
  console.log(`✅ Ensured 20 luxury products assigned to Kavya Patel (store: Kavya Heritage & Couture)`);

  // Check if orders already exist for this seller
  const existingOrdersForKavya = await db.collection('orders').countDocuments({
    $or: [{ seller: sellerId }, { 'items.seller': sellerId }],
  });

  if (existingOrdersForKavya >= 100) {
    console.log(`ℹ️ Already found ${existingOrdersForKavya} orders for Kavya Patel. Skipping duplicate order creation.`);
  } else {
    console.log('📦 Generating 155 realistic multi-millionaire orders...');

    const cities = [
      { city: 'Mumbai', state: 'Maharashtra', country: 'India', postalCode: '400050' },
      { city: 'New Delhi', state: 'Delhi', country: 'India', postalCode: '110001' },
      { city: 'Bangalore', state: 'Karnataka', country: 'India', postalCode: '560001' },
      { city: 'Hyderabad', state: 'Telangana', country: 'India', postalCode: '500001' },
      { city: 'London', state: 'Greater London', country: 'United Kingdom', postalCode: 'W1C 1AP' },
      { city: 'New York', state: 'NY', country: 'United States', postalCode: '10019' },
      { city: 'Dubai', state: 'Dubai', country: 'United Arab Emirates', postalCode: '00000' },
      { city: 'Toronto', state: 'ON', country: 'Canada', postalCode: 'M5V 2T6' },
      { city: 'Singapore', state: 'Central', country: 'Singapore', postalCode: '048624' },
      { city: 'San Jose', state: 'CA', country: 'United States', postalCode: '95113' },
    ];

    const customerNames = [
      'Ananya Singhania', 'Rhea Kapoor', 'Pooja Oberoi', 'Natasha Ambani', 'Vikramaditya Birla',
      'Sunita Mittal', 'Alia Merchant', 'Priyanka Chopra', 'Kareena Jindal', 'Sameer Godrej',
      'Jessica Sterling', 'Alexander Wright', 'Fatima Al-Mansoor', 'Claire Delacour', 'Ayesha Siddiqui',
      'Meera Reddy', 'Zara Khan', 'Deepika Padukone', 'Tanvi Mehta', 'Rohan Goenka'
    ];

    const ordersToInsert = [];
    const withdrawalsToInsert = [];

    let deliveredAccumulator = 0;
    const targetDeliveredSales = 4250000; // $4.25M
    const numDelivered = 115;
    const avgDeliveredPerOrder = targetDeliveredSales / numDelivered; // ~$36,956 (high ticket bulk/bridal orders)

    // 1. Generate 115 DELIVERED Orders
    for (let i = 1; i <= numDelivered; i++) {
      const orderNumber = `ORD-2026-KV${String(i).padStart(4, '0')}`;
      const loc = cities[i % cities.length];
      const customer = customerNames[i % customerNames.length];
      const p1 = productDocs[(i * 3) % productDocs.length];
      const p2 = productDocs[(i * 5 + 1) % productDocs.length];

      // Multi-quantity bulk high ticket order
      const q1 = Math.floor(i % 5) + 3; // 3 to 7 items
      const q2 = Math.floor(i % 4) + 2; // 2 to 5 items
      const val1 = p1.price * q1;
      const val2 = p2.price * q2;
      const subtotal = val1 + val2;
      const total = subtotal;

      const orderDate = new Date(Date.now() - (220 - i * 1.8) * 24 * 3600 * 1000);
      const deliveryDate = new Date(orderDate.getTime() + 4 * 24 * 3600 * 1000);

      const items = [
        {
          product: p1._id,
          seller: sellerId,
          sellerName: 'Kavya Heritage & Couture',
          name: p1.name,
          image: p1.image,
          price: p1.price,
          costPrice: Math.round(p1.price * 0.7),
          qty: q1,
          itemStatus: 'delivered',
          processingLocked: true,
          lockedAmount: val1,
          profitRate: 20,
          profitAmount: Number((val1 * 0.2).toFixed(2)),
          payoutSettled: true,
          settledAt: deliveryDate,
        },
        {
          product: p2._id,
          seller: sellerId,
          sellerName: 'Kavya Heritage & Couture',
          name: p2.name,
          image: p2.image,
          price: p2.price,
          costPrice: Math.round(p2.price * 0.7),
          qty: q2,
          itemStatus: 'delivered',
          processingLocked: true,
          lockedAmount: val2,
          profitRate: 20,
          profitAmount: Number((val2 * 0.2).toFixed(2)),
          payoutSettled: true,
          settledAt: deliveryDate,
        },
      ];

      ordersToInsert.push({
        orderNumber,
        user: null,
        seller: sellerId,
        placedBy: 'customer',
        items,
        contact: {
          email: `${customer.toLowerCase().replace(/\s+/g, '.')}${i}@gmail.com`,
          phone: `+91 98${Math.floor(10000000 + Math.random() * 90000000)}`,
        },
        shippingAddress: {
          fullName: customer,
          street: `${100 + i}, Luxury Palm Crescent`,
          city: loc.city,
          state: loc.state,
          postalCode: loc.postalCode,
          country: loc.country,
        },
        shipping: {
          name: 'Royal Express Courier & Insurance',
          cost: 0,
          eta: 'Delivered',
        },
        subtotal,
        discount: 0,
        total,
        paymentMethod: 'credit_card',
        paymentStatus: 'paid',
        payment: {
          provider: 'Stripe Global / HDFC Gateway',
          status: 'paid',
          paidAt: orderDate,
        },
        status: 'delivered',
        statusHistory: [
          { status: 'pending', at: orderDate, note: 'Order placed' },
          { status: 'confirmed', at: new Date(orderDate.getTime() + 3600000), note: 'Confirmed by Kavya Heritage & Couture' },
          { status: 'processing', at: new Date(orderDate.getTime() + 12 * 3600000), note: 'Custom packaging & insurance dispatch' },
          { status: 'shipped', at: new Date(orderDate.getTime() + 24 * 3600000), note: 'Handed over to Air Express' },
          { status: 'delivered', at: deliveryDate, note: 'Delivered to recipient with signature confirmation' },
        ],
        createdAt: orderDate,
        updatedAt: deliveryDate,
      });

      deliveredAccumulator += total;
    }

    // 2. Generate 24 CONFIRMED / IN-TRANSIT Orders (Locked into $248,500.00 Processing Fund)
    const targetProcessing = 248500;
    const numConfirmed = 24;
    const avgConfirmedPerOrder = Math.round(targetProcessing / numConfirmed); // ~$10,354 each

    let currentProcessingSum = 0;
    for (let i = 1; i <= numConfirmed; i++) {
      const orderIdx = numDelivered + i;
      const orderNumber = `ORD-2026-KV${String(orderIdx).padStart(4, '0')}`;
      const loc = cities[i % cities.length];
      const customer = customerNames[(i + 4) % customerNames.length];
      const p1 = productDocs[(i * 7) % productDocs.length];

      // Exact pricing to sum up to $248,500
      let orderVal;
      if (i === numConfirmed) {
        orderVal = targetProcessing - currentProcessingSum;
      } else {
        orderVal = i % 2 === 0 ? 11700 : 9000;
        currentProcessingSum += orderVal;
      }

      const q1 = Math.max(1, Math.round(orderVal / p1.price));
      const adjustedPrice = Number((orderVal / q1).toFixed(2));
      const orderDate = new Date(Date.now() - (15 - i * 0.5) * 24 * 3600 * 1000);
      const confDate = new Date(orderDate.getTime() + 2 * 3600 * 1000);

      const subStatus = i <= 8 ? 'confirmed' : i <= 16 ? 'processing' : 'shipped';

      const items = [
        {
          product: p1._id,
          seller: sellerId,
          sellerName: 'Kavya Heritage & Couture',
          name: p1.name,
          image: p1.image,
          price: adjustedPrice,
          costPrice: Math.round(adjustedPrice * 0.7),
          qty: q1,
          itemStatus: subStatus,
          processingLocked: true,
          lockedAmount: orderVal,
          profitRate: 20,
          profitAmount: Number((orderVal * 0.2).toFixed(2)),
          payoutSettled: false,
          settledAt: null,
        },
      ];

      const ordDoc = {
        orderNumber,
        user: null,
        seller: sellerId,
        placedBy: 'customer',
        items,
        contact: {
          email: `${customer.toLowerCase().replace(/\s+/g, '.')}${orderIdx}@gmail.com`,
          phone: `+91 98${Math.floor(10000000 + Math.random() * 90000000)}`,
        },
        shippingAddress: {
          fullName: customer,
          street: `${400 + i}, Royal Enclave`,
          city: loc.city,
          state: loc.state,
          postalCode: loc.postalCode,
          country: loc.country,
        },
        shipping: {
          name: 'Air Express Global Tracked',
          cost: 0,
          eta: '1-3 business days',
        },
        subtotal: orderVal,
        discount: 0,
        total: orderVal,
        paymentMethod: 'credit_card',
        paymentStatus: 'paid',
        payment: {
          provider: 'HDFC Merchant Gateway',
          status: 'paid',
          paidAt: orderDate,
        },
        status: subStatus,
        statusHistory: [
          { status: 'pending', at: orderDate, note: 'Order placed by customer' },
          { status: 'confirmed', at: confDate, note: 'Funds locked in processing fund (+20% profit on delivery)' },
        ],
        createdAt: orderDate,
        updatedAt: confDate,
      };

      ordersToInsert.push(ordDoc);

      // Add a ledger lock transaction
      withdrawalsToInsert.push({
        type: 'order_processing_lock',
        seller: sellerId,
        storeName: 'Kavya Heritage & Couture',
        amount: orderVal,
        principalAmount: orderVal,
        profitAmount: Number((orderVal * 0.2).toFixed(2)),
        profitRate: 20,
        orderNumber,
        status: 'completed',
        balanceAfter: 785400,
        processingFundAfter: 248500,
        adminNote: `Order #${orderNumber} Confirmed — $${orderVal.toLocaleString()} moved to Processing Fund (20% Profit upon Delivery: +$${(orderVal * 0.2).toLocaleString()})`,
        processedAt: confDate,
        createdAt: confDate,
      });
    }

    // 3. Generate 16 PENDING Orders (Awaiting confirmation)
    for (let i = 1; i <= 16; i++) {
      const orderIdx = numDelivered + numConfirmed + i;
      const orderNumber = `ORD-2026-KV${String(orderIdx).padStart(4, '0')}`;
      const loc = cities[i % cities.length];
      const customer = customerNames[(i + 7) % customerNames.length];
      const p1 = productDocs[(i * 9) % productDocs.length];
      const q1 = Math.floor(i % 3) + 1;
      const itemVal = p1.price * q1;
      const orderDate = new Date(Date.now() - (16 - i) * 3600 * 1000); // Placed within last 16 hours

      const items = [
        {
          product: p1._id,
          seller: sellerId,
          sellerName: 'Kavya Heritage & Couture',
          name: p1.name,
          image: p1.image,
          price: p1.price,
          costPrice: Math.round(p1.price * 0.7),
          qty: q1,
          itemStatus: 'pending',
          processingLocked: false,
          lockedAmount: 0,
          profitRate: 20,
          profitAmount: Number((itemVal * 0.2).toFixed(2)),
          payoutSettled: false,
          settledAt: null,
        },
      ];

      ordersToInsert.push({
        orderNumber,
        user: null,
        seller: sellerId,
        placedBy: 'customer',
        items,
        contact: {
          email: `${customer.toLowerCase().replace(/\s+/g, '.')}${orderIdx}@gmail.com`,
          phone: `+91 98${Math.floor(10000000 + Math.random() * 90000000)}`,
        },
        shippingAddress: {
          fullName: customer,
          street: `${700 + i}, Grand Heritage Blvd`,
          city: loc.city,
          state: loc.state,
          postalCode: loc.postalCode,
          country: loc.country,
        },
        shipping: {
          name: 'Standard Doorstep Delivery',
          cost: 0,
          eta: 'Pending Confirmation',
        },
        subtotal: itemVal,
        discount: 0,
        total: itemVal,
        paymentMethod: 'credit_card',
        paymentStatus: 'paid',
        payment: {
          provider: 'Online Checkout',
          status: 'paid',
          paidAt: orderDate,
        },
        status: 'pending',
        statusHistory: [{ status: 'pending', at: orderDate, note: 'New order waiting for merchant confirmation' }],
        createdAt: orderDate,
        updatedAt: orderDate,
      });
    }

    // Insert all generated orders
    await db.collection('orders').insertMany(ordersToInsert);
    console.log(`✅ Inserted ${ordersToInsert.length} realistic orders for Kavya Patel.`);

    // 4. Generate Ledger History (Withdrawals, Deposits, Released Profits)
    // Generating 35 completed withdrawals summing to $3,464,600
    const totalToWithdraw = 3464600;
    const numWithdrawals = 35;
    const avgWithdrawal = Math.round(totalToWithdraw / numWithdrawals); // ~$98,988 each

    let accumWithdraw = 0;
    for (let w = 1; w <= numWithdrawals; w++) {
      let amt = w === numWithdrawals ? totalToWithdraw - accumWithdraw : (w % 3 === 0 ? 125000 : w % 2 === 0 ? 100000 : 75000);
      if (amt <= 0) amt = 50000;
      accumWithdraw += amt;

      const date = new Date(Date.now() - (200 - w * 5.2) * 24 * 3600 * 1000);
      const isBank = w % 3 !== 0;

      withdrawalsToInsert.push({
        type: 'withdrawal',
        seller: sellerId,
        storeName: 'Kavya Heritage & Couture',
        amount: amt,
        approvedAmount: amt,
        method: isBank ? 'bank' : 'upi',
        bankName: isBank ? 'HDFC Bank' : '',
        accountNumber: isBank ? '50100483920194' : '',
        accountTitle: 'Kavya Patel Luxury Collections LLP',
        ifscCode: isBank ? 'HDFC0000060' : '',
        upiId: !isBank ? 'kavya.patel@okhdfcbank' : '',
        status: 'completed',
        transactionRef: `HDFC${Math.floor(1000000000 + Math.random() * 9000000000)}UTR`,
        adminNote: `Approved & Transferred directly to ${isBank ? 'HDFC Bank Current Account' : 'UPI ID kavya.patel@okhdfcbank'}`,
        processedAt: date,
        processedBy: 'Super Admin',
        createdAt: date,
        updatedAt: date,
      });
    }

    // 8 Completed Capital Deposits totaling $950,000
    const deposits = [150000, 100000, 100000, 150000, 150000, 100000, 100000, 100000];
    for (let d = 0; d < deposits.length; d++) {
      const amt = deposits[d];
      const date = new Date(Date.now() - (210 - d * 25) * 24 * 3600 * 1000);
      withdrawalsToInsert.push({
        type: 'deposit',
        seller: sellerId,
        storeName: 'Kavya Heritage & Couture',
        amount: amt,
        approvedAmount: amt,
        method: 'bank',
        depositRef: `HDFCDPR${Math.floor(10000000 + Math.random() * 90000000)}`,
        depositNote: `Operating liquidity wire transfer from HDFC Corporate Account`,
        status: 'completed',
        adminNote: `Deposit verified and credited to available wallet balance`,
        processedAt: date,
        processedBy: 'Super Admin',
        createdAt: date,
        updatedAt: date,
      });
    }

    await db.collection('withdrawals').insertMany(withdrawalsToInsert);
    console.log(`✅ Inserted ${withdrawalsToInsert.length} ledger transactions for Kavya Patel.`);
  }

  // 5. Support Chat Conversation
  const existingChat = await db.collection('conversations').findOne({ seller: sellerId });
  if (!existingChat) {
    const convId = new mongoose.Types.ObjectId();
    await db.collection('conversations').insertOne({
      _id: convId,
      seller: sellerId,
      storeName: 'Kavya Heritage & Couture',
      sellerName: 'Kavya Patel',
      sellerEmail: 'kavya.patel@bazario.com',
      subject: 'Diamond VIP Merchant Support & Priority Banking Operations',
      status: 'open',
      lastMessage: 'Your store has been elevated to Tier 5 Diamond Multi-Millionaire status!',
      lastSender: 'admin',
      lastAt: new Date(),
      createdAt: new Date(Date.now() - 150 * 24 * 3600 * 1000),
      updatedAt: new Date(),
    });

    await db.collection('messages').insertMany([
      {
        conversation: convId,
        seller: sellerId,
        sender: 'admin',
        senderName: 'Bazario Executive Operations',
        text: `Welcome Kavya Patel to Bazario Global Marketplace! 🌟\nYour enterprise brand 'Kavya Heritage & Couture' has been upgraded to Tier 5 Diamond VIP Merchant with priority HDFC bank settlement and unlimited processing limits.`,
        createdAt: new Date(Date.now() - 150 * 24 * 3600 * 1000),
      },
      {
        conversation: convId,
        seller: sellerId,
        sender: 'seller',
        senderName: 'Kavya Patel',
        text: `Thank you Bazario Team! Our luxury Indian bridal collections and temple jewelry catalog have been synchronized. Excited for the upcoming festive peak season!`,
        createdAt: new Date(Date.now() - 149 * 24 * 3600 * 1000),
      },
      {
        conversation: convId,
        seller: sellerId,
        sender: 'admin',
        senderName: 'Bazario Executive Operations',
        text: `Your withdrawal payouts of $3.46M+ have been successfully disbursed and confirmed with HDFC Bandra West branch. Let us know if you need customized marketing banners!`,
        createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
      },
    ]);
    console.log('✅ VIP Support Conversation initialized.');
  }

  // Final verification of counts
  const finalSellers = await db.collection('sellers').countDocuments();
  const finalOrders = await db.collection('orders').countDocuments();
  const finalProducts = await db.collection('products').countDocuments();
  console.log(`\n🎉 Verification Completed!`);
  console.log(`📊 Final Counts -> Sellers: ${finalSellers}, Products: ${finalProducts}, Orders: ${finalOrders}`);
  console.log(`🛡️ ZERO documents from other sellers or customers were touched or deleted.`);

  await mongoose.disconnect();
  console.log('\n✅ Database disconnected safely.');
}

seed()
  .then(() => {
    console.log('🎉 SCRIPT FINISHED SUCCESSFULLY!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Error executing seed:', err);
    process.exit(1);
  });
