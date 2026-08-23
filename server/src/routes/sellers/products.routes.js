import express from 'express';
import Seller from '../../models/Seller.js';
import Product from '../../models/Product.js';
import { authSeller } from '../../middleware/auth.js';
import { slugify } from './helpers.js';

const router = express.Router();

// GET /api/sellers/products
router.get('/products', authSeller, async (req, res) => {
  try {
    const products = await Product.find({
      $or: [
        { seller: req.seller.id },
        { sellerName: req.seller.storeName },
        { sellerSlug: req.seller.storeSlug || slugify(req.seller.storeName) },
      ],
    })
      .populate('category', 'name slug')
      .sort({ createdAt: -1 });

    // Auto-link seller field if missing
    for (const p of products) {
      if (!p.seller || p.seller.toString() !== req.seller.id.toString()) {
        p.seller = req.seller.id;
        p.sellerName = req.seller.storeName;
        p.sellerSlug = req.seller.storeSlug || slugify(req.seller.storeName);
        await p.save().catch(() => {});
      }
    }

    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/products
router.post('/products', authSeller, async (req, res) => {
  try {
    const seller = await Seller.findById(req.seller.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const data = req.body;
    let baseSlug = slugify(data.name || 'product');
    let slug = baseSlug;
    let counter = 1;
    while (await Product.findOne({ slug })) {
      slug = `${baseSlug}-${counter++}`;
    }

    const images = Array.isArray(data.images)
      ? data.images.map((img) => (typeof img === 'string' ? { url: img, key: null } : img))
      : data.image
      ? [{ url: data.image, key: null }]
      : [{ url: '/img/products/serum.svg', key: null }];

    const costPurchase = Number(data.costPrice || data.costs?.purchase || (data.price ? Number(data.price) * 0.8 : 0));

    const product = new Product({
      ...data,
      slug,
      seller: seller._id,
      sellerName: seller.storeName,
      sellerSlug: seller.storeSlug || slugify(seller.storeName),
      active: data.active !== false,
      stock: Number(data.stock ?? 20),
      reservedStock: 0,
      sold: 0,
      price: Number(data.price || 0),
      images,
      image: images[0]?.url || '',
      costs: {
        purchase: costPurchase,
        delivery: Number(data.costs?.delivery || 0),
        packaging: Number(data.costs?.packaging || 0),
        tax: Number(data.costs?.tax || 0),
        other: Number(data.costs?.other || 0),
      },
    });

    await product.save();
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/sellers/products/:id
router.put('/products/:id', authSeller, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, seller: req.seller.id });
    if (!product) return res.status(404).json({ message: 'Product not found or access denied' });

    const data = req.body || {};
    
    // Explicit whitelist of user-editable product fields
    if (data.name !== undefined) product.name = String(data.name).trim();
    if (data.description !== undefined) product.description = String(data.description);
    if (data.price !== undefined) product.price = Number(data.price);
    if (data.compareAtPrice !== undefined) product.compareAtPrice = Number(data.compareAtPrice);
    if (data.stock !== undefined) product.stock = Math.max(0, Number(data.stock));
    if (data.lowStockThreshold !== undefined) product.lowStockThreshold = Number(data.lowStockThreshold);
    if (data.sku !== undefined) product.sku = String(data.sku).trim();
    if (data.barcode !== undefined) product.barcode = String(data.barcode).trim();
    if (data.brand !== undefined) product.brand = String(data.brand).trim();
    if (data.category !== undefined) product.category = data.category;
    if (data.active !== undefined) product.active = Boolean(data.active);
    if (Array.isArray(data.tags)) product.tags = data.tags;
    if (Array.isArray(data.labels)) product.labels = data.labels;
    if (Array.isArray(data.variants)) product.variants = data.variants;
    if (data.weight !== undefined) product.weight = data.weight;
    if (data.dimensions !== undefined) product.dimensions = data.dimensions;
    if (data.warranty !== undefined) product.warranty = data.warranty;

    if (!product.costs) product.costs = {};
    if (data.costs && typeof data.costs === 'object') {
      if (data.costs.delivery !== undefined) product.costs.delivery = Number(data.costs.delivery);
      if (data.costs.packaging !== undefined) product.costs.packaging = Number(data.costs.packaging);
      if (data.costs.tax !== undefined) product.costs.tax = Number(data.costs.tax);
      if (data.costs.other !== undefined) product.costs.other = Number(data.costs.other);
    }
    if (data.costPrice !== undefined) {
      product.costs.purchase = Number(data.costPrice);
    } else if (data.costs?.purchase !== undefined) {
      product.costs.purchase = Number(data.costs.purchase);
    }

    if (data.images && Array.isArray(data.images)) {
      product.images = data.images.map((img) => (typeof img === 'string' ? { url: img, key: null } : img));
      if (product.images.length) product.image = product.images[0].url;
    }

    await product.save();
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/sellers/products/:id
router.delete('/products/:id', authSeller, async (req, res) => {
  try {
    const product = await Product.findOneAndDelete({ _id: req.params.id, seller: req.seller.id });
    if (!product) return res.status(404).json({ message: 'Product not found or access denied' });
    res.json({ ok: true, message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sellers/inventory (Seller views inventory analytics and stock summary)
router.get('/inventory', authSeller, async (req, res) => {
  try {
    const products = await Product.find({ seller: req.seller.id }).populate('category', 'name slug');
    const lowStock = products.filter((p) => (p.stock || 0) <= (p.lowStockThreshold || 5) && (p.stock || 0) > 0);
    const outOfStock = products.filter((p) => (p.stock || 0) === 0);
    const inStock = products.filter((p) => (p.stock || 0) > (p.lowStockThreshold || 5));
    const totalInventoryUnits = products.reduce((acc, p) => acc + (p.stock || 0), 0);
    const totalInventoryValue = products.reduce((acc, p) => acc + ((p.stock || 0) * (p.price || 0)), 0);

    res.json({
      products,
      summary: {
        totalProducts: products.length,
        inStockCount: inStock.length,
        lowStockCount: lowStock.length,
        outOfStockCount: outOfStock.length,
        totalInventoryUnits,
        totalInventoryValue,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
