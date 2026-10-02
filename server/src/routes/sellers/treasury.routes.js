import express from 'express';
import TreasuryProduct from '../../models/TreasuryProduct.js';
import Product from '../../models/Product.js';
import Seller from '../../models/Seller.js';
import Category from '../../models/Category.js';
import { authSeller } from '../../middleware/auth.js';
import { slugify } from './helpers.js';
import { escapeRegex } from '../../utils/sanitize.js';

const router = express.Router();

function balancedPriceMix(items) {
  if (!items || items.length <= 2) return items;

  // Split into 4 price tiers: Budget (<$60), Value ($60-$200), Premium ($200-$600), Luxury (>$600)
  const tier1 = [];
  const tier2 = [];
  const tier3 = [];
  const tier4 = [];

  const hash = (id) => {
    const s = String(id || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  };

  items.forEach((item) => {
    const p = Number(item.price) || 0;
    if (p < 60) tier1.push(item);
    else if (p < 200) tier2.push(item);
    else if (p < 600) tier3.push(item);
    else tier4.push(item);
  });

  // Deterministic spread within tiers
  tier1.sort((a, b) => (hash(a._id) % 100) - (hash(b._id) % 100));
  tier2.sort((a, b) => (hash(a._id) % 100) - (hash(b._id) % 100));
  tier3.sort((a, b) => (hash(a._id) % 100) - (hash(b._id) % 100));
  tier4.sort((a, b) => (hash(a._id) % 100) - (hash(b._id) % 100));

  // Interleave pattern across tiers so low and high priced products are evenly intermingled
  const pattern = [2, 4, 1, 3, 2, 1, 3, 4];
  const mixed = [];
  const indices = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const tiers = { 1: tier1, 2: tier2, 3: tier3, 4: tier4 };

  let pIdx = 0;
  while (mixed.length < items.length) {
    const targetTierNum = pattern[pIdx % pattern.length];
    pIdx++;

    let targetTier = tiers[targetTierNum];
    if (indices[targetTierNum] < targetTier.length) {
      mixed.push(targetTier[indices[targetTierNum]++]);
      continue;
    }

    let found = false;
    for (const alt of [1, 3, 2, 4]) {
      if (indices[alt] < tiers[alt].length) {
        mixed.push(tiers[alt][indices[alt]++]);
        found = true;
        break;
      }
    }
    if (!found) break;
  }

  return mixed;
}

// GET /api/sellers/treasury - Browse master products catalog for logged-in seller
router.get('/treasury', authSeller, async (req, res) => {
  try {
    const { q, category, sort } = req.query;
    const filter = { active: true };

    if (category) {
      // Allow category ObjectId or slug
      if (category.match(/^[0-9a-fA-F]{24}$/)) {
        filter.category = category;
      } else {
        const cat = await Category.findOne({ slug: category });
        if (cat) filter.category = cat._id;
      }
    }

    if (q && typeof q === 'string' && q.trim()) {
      const safeQ = escapeRegex(q.trim());
      filter.$or = [
        { name: { $regex: safeQ, $options: 'i' } },
        { brand: { $regex: safeQ, $options: 'i' } },
        { sku: { $regex: safeQ, $options: 'i' } },
      ];
    }

    let sortBy = null;
    if (sort === 'stock') sortBy = { stock: -1 };
    else if (sort === 'price-low') sortBy = { price: 1 };
    else if (sort === 'price-high') sortBy = { price: -1 };
    else if (sort === 'newest') sortBy = { createdAt: -1 };

    const items = await TreasuryProduct.find(filter)
      .populate('category', 'name slug')
      .sort(sortBy || { createdAt: -1 })
      .lean();

    const itemIds = items.map((i) => i._id);

    // Find which of these master products are already added to THIS seller's store
    const sellerExistingListings = await Product.find({
      seller: req.seller.id,
      treasuryProduct: { $in: itemIds },
    }).select('_id treasuryProduct price stock active sold');

    const myListingMap = {};
    sellerExistingListings.forEach((p) => {
      myListingMap[p.treasuryProduct.toString()] = {
        sellerProductId: p._id,
        price: p.price,
        stock: p.stock,
        active: p.active,
        sold: p.sold,
      };
    });

    // Also get overall counts of other sellers carrying these items
    const sellerCounts = await Product.aggregate([
      { $match: { treasuryProduct: { $in: itemIds } } },
      { $group: { _id: '$treasuryProduct', count: { $sum: 1 } } },
    ]);
    const countsMap = {};
    sellerCounts.forEach((c) => {
      countsMap[c._id.toString()] = c.count;
    });

    const enriched = items.map((item) => {
      const myListing = myListingMap[item._id.toString()];
      return {
        ...item,
        isAddedToStore: Boolean(myListing),
        sellerProductId: myListing ? myListing.sellerProductId : null,
        myStorePrice: myListing ? myListing.price : item.price,
        myStoreStock: myListing ? myListing.stock : item.stock,
        myStoreActive: myListing ? myListing.active : false,
        totalSellersCarrying: countsMap[item._id.toString()] || 0,
      };
    });

    let finalItems = enriched;
    // Default to balanced mix of high & low prices unless seller specifically chooses an ordered sort
    if (!sort || sort === 'mixed') {
      finalItems = balancedPriceMix(enriched);
    }

    if (req.query.prioritizeUnadded === 'true') {
      finalItems.sort((a, b) => {
        if (a.isAddedToStore !== b.isAddedToStore) {
          return a.isAddedToStore ? 1 : -1;
        }
        return 0;
      });
    }

    res.json(finalItems);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/treasury/:id/add - 1-Click "Add to Store"
router.post('/treasury/:id/add', authSeller, async (req, res) => {
  try {
    const treasury = await TreasuryProduct.findById(req.params.id);
    if (!treasury) return res.status(404).json({ message: 'Treasury product not found' });
    if (!treasury.active) return res.status(400).json({ message: 'This master product is currently inactive in Treasury' });

    const seller = await Seller.findById(req.seller.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    // Check if seller already has this product in store
    const existing = await Product.findOne({ seller: seller._id, treasuryProduct: treasury._id });
    if (existing) {
      // Already added, ensure it's active
      existing.active = true;
      existing.stock = treasury.stock; // Refresh stock from master
      await existing.save();
      return res.json({
        ok: true,
        message: 'Product already in your store (refreshed & activated)',
        product: existing,
        alreadyExisted: true,
      });
    }

    // Build unique slug for this seller's listing
    const storeSlugPart = seller.storeSlug || slugify(seller.storeName) || seller._id.toString().slice(-4);
    let baseSlug = `${treasury.slug}-${storeSlugPart}`;
    let slug = baseSlug;
    let counter = 1;
    while (await Product.findOne({ slug })) {
      slug = `${baseSlug}-${counter++}`;
    }

    const sellerSku = `${treasury.sku || 'TRZ'}-${storeSlugPart.toUpperCase().slice(0, 4)}-${Math.floor(100 + Math.random() * 900)}`;

    const newProduct = new Product({
      treasuryProduct: treasury._id,
      seller: seller._id,
      sellerName: seller.storeName,
      sellerSlug: seller.storeSlug || slugify(seller.storeName),
      name: treasury.name,
      slug,
      brand: treasury.brand,
      category: treasury.category,
      price: treasury.price,
      oldPrice: treasury.oldPrice,
      costs: {
        purchase: treasury.costPrice || 0,
        delivery: 0,
        packaging: 0,
        tax: 0,
        other: 0,
      },
      stock: treasury.stock, // Inherits central stock
      reservedStock: 0,
      lowStockThreshold: treasury.lowStockThreshold || 5,
      sku: sellerSku,
      barcode: treasury.barcode,
      weight: treasury.weight,
      dimensions: treasury.dimensions,
      image: treasury.image,
      images: treasury.images,
      shortDescription: treasury.shortDescription,
      description: treasury.description,
      bullets: treasury.bullets,
      highlights: treasury.highlights,
      specifications: treasury.specifications,
      variants: treasury.variants,
      sizes: treasury.sizes,
      labels: treasury.labels,
      tags: treasury.tags,
      rating: treasury.rating || 4.8,
      numReviews: treasury.numReviews || 12,
      sold: 0,
      active: true,
      primeEligible: treasury.primeEligible,
      freeDelivery: treasury.freeDelivery,
    });

    await newProduct.save();

    res.status(201).json({
      ok: true,
      message: `"${treasury.name}" has been successfully added to your store!`,
      product: newProduct,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST or DELETE /api/sellers/treasury/:id/remove - Remove Treasury Product from seller's store
router.all('/treasury/:id/remove', authSeller, async (req, res) => {
  try {
    const deleted = await Product.findOneAndDelete({
      seller: req.seller.id,
      treasuryProduct: req.params.id,
    });

    if (!deleted) {
      // Also try deleting by the product ID directly
      const byId = await Product.findOneAndDelete({
        _id: req.params.id,
        seller: req.seller.id,
      });
      if (!byId) return res.status(404).json({ message: 'Product not found in your store' });
    }

    res.json({ ok: true, message: 'Product successfully removed from your store catalog' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
