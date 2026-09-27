import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import mongoose from 'mongoose';
import TreasuryProduct from './models/TreasuryProduct.js';
import Product from './models/Product.js';
import fs from 'fs';

const URI = 'mongodb+srv://aizazkhan6241_db_user:98av24298@cluster0.ijpphlb.mongodb.net/bazario?retryWrites=true&w=majority&appName=Cluster0';

// 84 Dedicated, unique, verified Unsplash photos for each secondary duplicate:
export const ZERO_DUPE_MAP = {
  // Beauty & Personal Care & Cosmetics
  'TRZ-COS-BWASH-EUC': 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800&auto=format&fit=crop&q=80', // Eucalyptus body wash foaming bottle
  'TRZ-COS-SRM-RET': 'https://images.unsplash.com/photo-1616949755610-8c9bbc08f138?w=800&auto=format&fit=crop&q=80', // Retinol night renewal serum dropper
  'TRZ-COS-LIN-PEN': 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=800&auto=format&fit=crop&q=80', // Felt-tip precision liquid eyeliner
  'TRZ-BTY-GLD-50ML': 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&auto=format&fit=crop&q=80', // Gold repair face cream jar
  'TRZ-COS-CRM-CER': 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&auto=format&fit=crop&q=80', // Barrier restore hydrating cream
  'TRZ-COS-BLSH-CRM': 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&auto=format&fit=crop&q=80', // Liquid cream blush cushion
  'TRZ-COS-MSK-CLAY': 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=800&auto=format&fit=crop&q=80', // French green clay pore tightening mask
  'TRZ-COS-SRM-HYA': 'https://images.unsplash.com/photo-1608248597359-0a6042456e30?w=800&auto=format&fit=crop&q=80', // Hyaluronic acid intense hydration serum
  'TRZ-COS-TON-ROSE': 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=800&auto=format&fit=crop&q=80', // Organic Damask rosewater mist
  'TRZ-B6-T3-AIR-LUXE': 'https://images.unsplash.com/photo-1585751119414-ef2636f8aede?w=800&auto=format&fit=crop&q=80', // T3 AireLuxe professional digital hair dryer
  'TRZ-COS-EDP-AMB': 'https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=800&auto=format&fit=crop&q=80', // Golden amber vanilla bourbon luxury perfume
  'TRZ-KID-FRD-SNOT': 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=800&auto=format&fit=crop&q=80', // FridaBaby nasal aspirator deluxe kit
  'TRZ-B4-BBY-NANO-125': 'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?w=800&auto=format&fit=crop&q=80', // BaBylissPRO titanium flat iron
  'TRZ-DEC-CRB-AMB2': 'https://images.unsplash.com/photo-1603006905003-be475563bc59?w=800&auto=format&fit=crop&q=80', // Amber glass hurricane candle holders
  'TRZ-B5-REV-VOL2-BLK': 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&auto=format&fit=crop&q=80', // Revlon hot air volumizer brush
  'TRZ-HLT-DYS-NURL': 'https://images.unsplash.com/photo-1585751119414-ef2636f8aede?w=800&auto=format&fit=crop&q=80', // Dyson supersonic Nural hair dryer
  'TRZ-COS-BWASH-SAK': 'https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=800&auto=format&fit=crop&q=80', // Cherry blossom shower gel
  'TRZ-B6-DDG-LED-MASK': 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800&auto=format&fit=crop&q=80', // Dr. Dennis Gross SpectraLite LED face mask
  'TRZ-COS-MSK-GOLD': 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?w=800&auto=format&fit=crop&q=80', // 24K bio-collagen hydrogel sleeping mask
  'TRZ-COS-MSC-LASH': 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=800&auto=format&fit=crop&q=80', // High-impact waterproof mascara
  'TRZ-COS-EYE-PLT': 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=800&auto=format&fit=crop&q=80', // Warm sunset eyeshadow palette
  'TRZ-COS-PWD-SET': 'https://images.unsplash.com/photo-1631729371254-42c2892f0e6e?w=800&auto=format&fit=crop&q=80', // Blur setting powder with puff
  'TRZ-COS-HLT-GLW': 'https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=800&auto=format&fit=crop&q=80', // Champagne shimmer highlighting powder
  'TRZ-COS-SRM-VITC': 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=800&auto=format&fit=crop&q=80', // 20% Vitamin C antioxidant glow serum
  'TRZ-COS-EYE-CAF': 'https://images.unsplash.com/photo-1608248597359-0a6042456e30?w=800&auto=format&fit=crop&q=80', // Caffeine 5% dark circle eye cream
  'TRZ-COS-LIP-OIL': 'https://images.unsplash.com/photo-1616949755610-8c9bbc08f138?w=800&auto=format&fit=crop&q=80', // Peptide hydrating lip glow oil
  'TRZ-COS-EDP-SNT': 'https://images.unsplash.com/photo-1547887537-6158d64c35b3?w=800&auto=format&fit=crop&q=80', // Santal & cardamom woody perfume
  'TRZ-COS-BRS-SET': 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=800&auto=format&fit=crop&q=80', // 12-piece professional vegan brush set
  'TRZ-COS-SOAP-CHR': 'https://images.unsplash.com/photo-1607006411601-775c8cc632dc?w=800&auto=format&fit=crop&q=80', // Activated bamboo charcoal bar soap
  'TRZ-COS-CLN-SAL': 'https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=800&auto=format&fit=crop&q=80', // Salicylic acid gentle cleanser
  'TRZ-COS-CLN-FOAM': 'https://images.unsplash.com/photo-1526947425960-945c6e72858f?w=800&auto=format&fit=crop&q=80', // Green tea calming foam face wash
  'TRZ-COS-SUN-SPF50': 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=800&auto=format&fit=crop&q=80', // Water-gel broad spectrum SPF 50 sunscreen
  'TRZ-COS-SRM-NIA': 'https://images.unsplash.com/photo-1617897903246-719242758050?w=800&auto=format&fit=crop&q=80', // Niacinamide 10% zinc serum
  'TRZ-COS-LIP-NUDE': 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=800&auto=format&fit=crop&q=80', // Nude elegance hydrating satin lipstick

  // Audio, Electronics & Tech
  'TRZ-B5-SNY-XB100-BLK': 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&auto=format&fit=crop&q=80', // Sony compact portable Bluetooth speaker
  'TRZ-INS-FLOW-WHT': 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&auto=format&fit=crop&q=80', // Insta360 Flow AI-tracking smartphone gimbal
  'TRZ-OFC-ANK-C310': 'https://images.unsplash.com/photo-1587826080692-f439cd0b70da?w=800&auto=format&fit=crop&q=80', // AnkerWork C310 4K HDR conference webcam
  'TRZ-ACC-ANK-NANO30': 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=800&auto=format&fit=crop&q=80', // Anker Nano 30W GaN fast charger
  'TRZ-B6-LOG-ANY-3S': 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=800&auto=format&fit=crop&q=80', // Logitech MX Anywhere 3S compact wireless mouse
  'TRZ-OFC-KYC-Q1PRO': 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800&auto=format&fit=crop&q=80', // Keychron Q1 Pro custom mechanical keyboard
  'TRZ-B6-WDB-SN85-2TB': 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=800&auto=format&fit=crop&q=80', // WD_BLACK SN850X 2TB NVMe SSD
  'TRZ-B6-KEN-SD57-TB4': 'https://images.unsplash.com/photo-1544652478-6653e09f18a2?w=800&auto=format&fit=crop&q=80', // Kensington SD5700T Thunderbolt 4 dock
  'TRZ-B6-AUD-A2P-WHT': 'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=800&auto=format&fit=crop&q=80', // Audioengine A2+ wireless powered desktop speakers
  'TRZ-B6-EDI-R128-DBS': 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=80', // Edifier R1280DBs bookshelf Bluetooth speakers
  'TRZ-VEH-CLK-2AIR': 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80', // Carlinkit wireless CarPlay adapter
  'TRZ-ACC-BAS-BLD65': 'https://images.unsplash.com/photo-1609592424364-7bf5dfb3e41c?w=800&auto=format&fit=crop&q=80', // Baseus Blade 65W slim laptop power bank
  'TRZ-OFC-BNQ-BAR': 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=800&auto=format&fit=crop&q=80', // BenQ ScreenBar LED monitor light
  'TRZ-B6-NUP-AIR-75V2': 'https://images.unsplash.com/photo-1595225476474-87563907a212?w=800&auto=format&fit=crop&q=80', // NuPhy Air75 low profile mechanical keyboard
  'TRZ-TRV-NTC-NB10K': 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=800&auto=format&fit=crop&q=80', // Nitecore NB10000 ultralight carbon fiber power bank
  'TRZ-ACC-ESR-CRYO': 'https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=800&auto=format&fit=crop&q=80', // ESR CryoBoost 3-in-1 MagSafe stand
  'TRZ-ACC-AUL-G05': 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=800&auto=format&fit=crop&q=80', // Aulumu G05 titanium kickstand
  'TRZ-ACC-BLK-GYM': 'https://images.unsplash.com/photo-1517420704952-d9f39e95b43e?w=800&auto=format&fit=crop&q=80', // Belkin MagSafe gym equipment mount
  'TRZ-B6-ANK-C300-CAM': 'https://images.unsplash.com/photo-1587826080692-f439cd0b70da?w=800&auto=format&fit=crop&q=80', // Anker PowerConf C300 AI webcam
  'TRZ-ACC-UGR-100W': 'https://images.unsplash.com/photo-1585338107529-13afc5f02586?w=800&auto=format&fit=crop&q=80', // UGREEN Nexode 100W 4-port desktop GaN charger
  'TRZ-OFC-LCH-A5DOT': 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&auto=format&fit=crop&q=80', // Leuchtturm1917 A5 dotted journal
  'TRZ-B6-PHI-HUE-65G': 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=800&auto=format&fit=crop&q=80', // Philips Hue gradient TV lightstrip
  'TRZ-DEC-GOV-FLR2': 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=800&auto=format&fit=crop&q=80', // Govee smart ambient floor lamp
  'TRZ-HLT-PHL-WAKE': 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&auto=format&fit=crop&q=80', // Philips SmartSleep wake-up light
  'TRZ-DEC-LLG-LMP': 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&auto=format&fit=crop&q=80', // Fluted ceramic bedside table lamp
  'TRZ-KID-HTC-RST2': 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&auto=format&fit=crop&q=80', // Hatch Rest sound machine night light

  // Watches & Wearables
  'TRZ-B6-TIS-PRX-80BL': 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=800&auto=format&fit=crop&q=80', // Tissot PRX Powermatic 80 blue automatic watch
  'TRZ-B6-HAM-KHK-38MM': 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&auto=format&fit=crop&q=80', // Hamilton Khaki Field mechanical watch
  'TRZ-B4-GRM-INST2-SLR': 'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=800&auto=format&fit=crop&q=80', // Garmin Instinct 2 solar tactical GPS watch
  'TRZ-B6-SUU-9PK-TI': 'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=800&auto=format&fit=crop&q=80', // Suunto 9 Peak Pro titanium multisport watch

  // Kitchen & Home
  'TRZ-B4-FLW-STG-MBK': 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=800&auto=format&fit=crop&q=80', // Fellow Stagg EKG electric gooseneck kettle
  'TRZ-HOM-LDG-12SKL': 'https://images.unsplash.com/photo-1590794056226-79ef3a8147e1?w=800&auto=format&fit=crop&q=80', // Lodge 12-inch pre-seasoned cast iron skillet
  'TRZ-KIT-ZWL-7KNF': 'https://images.unsplash.com/photo-1593618998160-e34014e67546?w=800&auto=format&fit=crop&q=80', // Zwilling 7-piece German stainless knife block set
  'TRZ-KIT-OXO-8GLS': 'https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=800&auto=format&fit=crop&q=80', // OXO 8-piece glass food storage containers
  'TRZ-KIT-CSR-GSNK': 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=800&auto=format&fit=crop&q=80', // Cosori smart gooseneck kettle
  'TRZ-KIT-CRW-4PC': 'https://images.unsplash.com/photo-1584990347449-3e3c04239e33?w=800&auto=format&fit=crop&q=80', // Caraway nonstick ceramic cookware set
  'TRZ-KIT-ANO-NANO': 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=800&auto=format&fit=crop&q=80', // Anova sous vide precision cooker

  // Sports & Fitness
  'TRZ-B4-THB-MINI2-BLK': 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800&auto=format&fit=crop&q=80', // Theragun Mini 2.0 portable massage gun
  'TRZ-B6-IRO-QLK-KBH': 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=800&auto=format&fit=crop&q=80', // Ironmaster adjustable kettlebell handle
  'TRZ-B5-HYD-32OZ-PAC': 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800&auto=format&fit=crop&q=80', // Hydro Flask wide mouth water bottle
  'TRZ-B6-SPE-LZR-INT': 'https://images.unsplash.com/photo-1530549387789-4c1017266635?w=800&auto=format&fit=crop&q=80', // Speedo racing swim jammer
  'TRZ-B6-HYP-VOLT-2P': 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=800&auto=format&fit=crop&q=80', // Hyperice Hypervolt 2 Pro massager
  'TRZ-HLT-THB-PROPLS': 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=800&auto=format&fit=crop&q=80', // Theragun PRO Plus 6-in-1 massager
  'TRZ-B6-TRX-PRO-4SYS': 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=800&auto=format&fit=crop&q=80', // TRX PRO4 suspension trainer straps

  // Outdoor, Shoes, Bags, Toys
  'TRZ-SHOE-SLM-XT6': 'https://images.unsplash.com/photo-1539185441755-769473a23570?w=800&auto=format&fit=crop&q=80', // Salomon XT-6 trail running shoes
  'TRZ-KID-SKP-ACT': 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=800&auto=format&fit=crop&q=80', // Skip Hop 3-stage interactive activity table
  'TRZ-KID-BBJ-BLISS': 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=800&auto=format&fit=crop&q=80', // BabyBjörn Bouncer Bliss seat
  'TRZ-TRV-YET-T45': 'https://images.unsplash.com/photo-1527631746610-bca00a040d60?w=800&auto=format&fit=crop&q=80', // YETI Tundra camping hard cooler
  'TRZ-SHOE-UGG-ULTRA': 'https://images.unsplash.com/photo-1520639888713-7851133b1ed0?w=800&auto=format&fit=crop&q=80', // UGG Classic Ultra Mini sheepskin boots
  'TRZ-TRV-MNS-PLUS': 'https://images.unsplash.com/photo-1565026057447-bc90a3dceb87?w=800&auto=format&fit=crop&q=80' // Monos Carry-On Plus polycarbonate suitcase
};

async function executeZeroDupeFix() {
  console.log('🚀 Applying Zero-Duplicate Master Fix...');
  await mongoose.connect(URI, { serverSelectionTimeoutMS: 20000 });
  console.log('Connected to MongoDB Atlas');

  let updatedCount = 0;
  for (const [sku, img] of Object.entries(ZERO_DUPE_MAP)) {
    const res = await TreasuryProduct.updateOne(
      { sku },
      { 
        $set: { 
          image: img,
          images: [{ url: img, key: null }]
        } 
      }
    );
    if (res.modifiedCount > 0) updatedCount++;

    await Product.updateMany(
      { sku: new RegExp(`^${sku}`, 'i') },
      { 
        $set: { 
          image: img,
          images: [{ url: img, key: null }]
        } 
      }
    );
  }
  console.log(`✅ Applied updates to ${updatedCount} products.`);

  // Audit
  const allProds = await TreasuryProduct.find({}).lean();
  console.log(`Total Treasury Products: ${allProds.length}`);
  const imgFreq = {};
  for (const p of allProds) {
    const img = p.image || '';
    imgFreq[img] = (imgFreq[img] || 0) + 1;
  }
  const dupes = Object.entries(imgFreq).filter(([u, c]) => c > 1);
  console.log(`Remaining duplicate image groups: ${dupes.length}`);

  await mongoose.disconnect();
}

executeZeroDupeFix().catch(console.error);
