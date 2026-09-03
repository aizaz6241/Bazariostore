import { Router } from 'express';
import TreasuryProduct from '../models/TreasuryProduct.js';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import { authAdmin } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { escapeRegex } from '../utils/sanitize.js';
import { deleteKeys, removedKeys } from '../services/uploads.js';
import { setTreasuryStock, adjustTreasuryStock } from '../utils/stockSync.js';

const router = Router();

const slugify = (s) =>
  s
    .toLowerCase()
    .trim()
    .replace(/['%+]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// ==========================================
// ADMIN TREASURY ROUTES
// ==========================================

// GET /api/treasury - List master products in Treasury
router.get('/', authAdmin('products'), async (req, res) => {
  try {
    const { q, category, status, sort, page = 1, limit = 100 } = req.query;
    const filter = {};

    if (q && typeof q === 'string' && q.trim()) {
      const safeQ = escapeRegex(q.trim());
      filter.$or = [
        { name: { $regex: safeQ, $options: 'i' } },
        { brand: { $regex: safeQ, $options: 'i' } },
        { sku: { $regex: safeQ, $options: 'i' } },
      ];
    }

    if (category) filter.category = category;
    if (status === 'active') filter.active = true;
    if (status === 'inactive') filter.active = false;

    let sortBy = { createdAt: -1 };
    if (sort === 'stock-asc') sortBy = { stock: 1 };
    if (sort === 'stock-desc') sortBy = { stock: -1 };
    if (sort === 'price-asc') sortBy = { price: 1 };
    if (sort === 'price-desc') sortBy = { price: -1 };
    if (sort === 'name') sortBy = { name: 1 };

    const items = await TreasuryProduct.find(filter)
      .populate('category', 'name slug')
      .sort(sortBy)
      .limit(Number(limit))
      .lean();

    // Attach seller listing count for each treasury product
    const itemIds = items.map((i) => i._id);
    const sellerCounts = await Product.aggregate([
      { $match: { treasuryProduct: { $in: itemIds } } },
      { $group: { _id: '$treasuryProduct', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    sellerCounts.forEach((c) => {
      countMap[c._id.toString()] = c.count;
    });

    const enriched = items.map((item) => ({
      ...item,
      sellersCount: countMap[item._id.toString()] || 0,
    }));

    // Summary statistics
    const totalCount = await TreasuryProduct.countDocuments();
    const activeCount = await TreasuryProduct.countDocuments({ active: true });
    const outOfStockCount = await TreasuryProduct.countDocuments({ stock: { $lte: 0 } });
    const allStockAgg = await TreasuryProduct.aggregate([{ $group: { _id: null, total: { $sum: '$stock' } } }]);
    const totalStockUnits = allStockAgg[0]?.total || 0;

    res.json({
      products: enriched,
      summary: {
        totalProducts: totalCount,
        activeProducts: activeCount,
        outOfStockProducts: outOfStockCount,
        totalStockUnits,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/treasury/:id - Get single master product details & listing sellers
router.get('/:id', authAdmin('products'), async (req, res) => {
  try {
    const product = await TreasuryProduct.findById(req.params.id).populate('category', 'name slug');
    if (!product) return res.status(404).json({ message: 'Treasury product not found' });

    // Find all sellers who have listed this product
    const sellerListings = await Product.find({ treasuryProduct: product._id })
      .populate('seller', 'storeName ownerName email phone storeSlug logo rating numReviews')
      .select('seller sellerName sellerSlug price stock sold active createdAt');

    res.json({
      product,
      sellers: sellerListings,
      sellersCount: sellerListings.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/treasury - Add new master product into Treasury
router.post('/', authAdmin('products'), async (req, res) => {
  try {
    const data = req.body || {};
    if (!data.name?.trim()) return res.status(400).json({ message: 'Product title is required' });
    if (!data.price || Number(data.price) < 0) return res.status(400).json({ message: 'Valid selling price is required' });

    let baseSlug = slugify(data.name);
    let slug = baseSlug;
    let counter = 1;
    while (await TreasuryProduct.findOne({ slug })) {
      slug = `${baseSlug}-${counter++}`;
    }

    const images = Array.isArray(data.images) && data.images.length
      ? data.images.map((img) => (typeof img === 'string' ? { url: img, key: null } : img))
      : data.image
      ? [{ url: data.image, key: null }]
      : [{ url: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600&auto=format&fit=crop&q=80', key: null }];

    const product = await TreasuryProduct.create({
      ...data,
      slug,
      price: Number(data.price),
      costPrice: Number(data.costPrice || 0),
      oldPrice: data.oldPrice ? Number(data.oldPrice) : null,
      stock: Math.max(0, Number(data.stock ?? 100)),
      reservedStock: 0,
      lowStockThreshold: Number(data.lowStockThreshold || 10),
      images,
      image: images[0]?.url || '',
      sku: data.sku?.trim() || `TRZ-${Date.now().toString(36).toUpperCase()}`,
      active: data.active !== false,
    });

    await audit(req, 'treasury_product_created', 'treasury_product', product._id, {
      name: product.name,
      stock: product.stock,
      price: product.price,
    });

    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/treasury/:id - Update master product & sync stock across sellers
router.put('/:id', authAdmin('products'), async (req, res) => {
  try {
    const product = await TreasuryProduct.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Treasury product not found' });

    const data = req.body || {};
    delete data._id;
    delete data.slug; // Preserve permanent slug

    const previousStock = product.stock;
    const newStockProvided = data.stock !== undefined ? Math.max(0, Number(data.stock)) : null;

    if (data.name !== undefined) product.name = String(data.name).trim();
    if (data.brand !== undefined) product.brand = String(data.brand).trim();
    if (data.category !== undefined) product.category = data.category;
    if (data.price !== undefined) product.price = Number(data.price);
    if (data.costPrice !== undefined) product.costPrice = Number(data.costPrice);
    if (data.oldPrice !== undefined) product.oldPrice = data.oldPrice ? Number(data.oldPrice) : null;
    if (data.lowStockThreshold !== undefined) product.lowStockThreshold = Number(data.lowStockThreshold);
    if (data.sku !== undefined) product.sku = String(data.sku).trim();
    if (data.barcode !== undefined) product.barcode = String(data.barcode).trim();
    if (data.weight !== undefined) product.weight = data.weight;
    if (data.dimensions !== undefined) product.dimensions = data.dimensions;
    if (data.shortDescription !== undefined) product.shortDescription = String(data.shortDescription);
    if (data.description !== undefined) product.description = String(data.description);
    if (data.active !== undefined) product.active = Boolean(data.active);

    if (Array.isArray(data.bullets)) product.bullets = data.bullets;
    if (Array.isArray(data.highlights)) product.highlights = data.highlights;
    if (Array.isArray(data.specifications)) product.specifications = data.specifications;
    if (Array.isArray(data.variants)) product.variants = data.variants;
    if (Array.isArray(data.sizes)) product.sizes = data.sizes;
    if (Array.isArray(data.labels)) product.labels = data.labels;
    if (Array.isArray(data.tags)) product.tags = data.tags;

    if (Array.isArray(data.images) && data.images.length) {
      // free removed UploadThing images if needed
      await deleteKeys(removedKeys(product.images, data.images));
      product.images = data.images.map((img) => (typeof img === 'string' ? { url: img, key: null } : img));
      product.image = product.images[0]?.url || '';
    }

    if (newStockProvided !== null) {
      product.stock = newStockProvided;
    }

    await product.save();

    // If stock changed, propagate new central stock to all sellers who added this product
    if (newStockProvided !== null && newStockProvided !== previousStock) {
      await setTreasuryStock(product._id, product.stock, {
        reason: 'admin_treasury_edit',
        note: `Stock updated by ${req.admin?.name || 'Admin'}`,
        by: req.admin?.name || 'Admin',
      });
    }

    // Also update common fields on sellers' products (image, brand, category) so seller listings stay fresh
    await Product.updateMany(
      { treasuryProduct: product._id },
      {
        $set: {
          image: product.image,
          images: product.images,
          category: product.category,
          brand: product.brand,
          shortDescription: product.shortDescription,
          description: product.description,
          'costs.purchase': product.costPrice,
        },
      }
    );

    await audit(req, 'treasury_product_updated', 'treasury_product', product._id, {
      name: product.name,
      stock: product.stock,
      price: product.price,
    });

    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/treasury/:id/active - Quick toggle active status
router.patch('/:id/active', authAdmin('products'), async (req, res) => {
  try {
    const product = await TreasuryProduct.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Treasury product not found' });
    product.active = !product.active;
    await product.save();
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/treasury/:id/restock - Quick stock adjustment / restock
router.post('/:id/restock', authAdmin('products'), async (req, res) => {
  try {
    const { delta, newStock, note } = req.body;
    const product = await TreasuryProduct.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Treasury product not found' });

    let updated;
    if (newStock !== undefined) {
      updated = await setTreasuryStock(product._id, newStock, {
        reason: 'admin_manual_restock',
        note: note || 'Direct stock level adjustment',
        by: req.admin?.name || 'Admin',
      });
    } else if (delta !== undefined) {
      updated = await adjustTreasuryStock(product._id, delta, {
        reason: 'admin_delta_restock',
        note: note || `Stock changed by ${delta}`,
        by: req.admin?.name || 'Admin',
      });
    } else {
      return res.status(400).json({ message: 'Must provide either delta or newStock' });
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/treasury/:id - Delete master product
router.delete('/:id', authAdmin('products'), async (req, res) => {
  try {
    const product = await TreasuryProduct.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Treasury product not found' });

    // Clean up images
    await deleteKeys((product.images || []).map((i) => i.key));

    // Unlink any seller products so they become standalone rather than broken
    await Product.updateMany({ treasuryProduct: product._id }, { $set: { treasuryProduct: null } });

    await product.deleteOne();
    await audit(req, 'treasury_product_deleted', 'treasury_product', req.params.id, { name: product.name });

    res.json({ ok: true, message: 'Treasury product deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
