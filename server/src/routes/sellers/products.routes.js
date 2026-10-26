import express from 'express';
import Seller from '../../models/Seller.js';
import Product from '../../models/Product.js';
import Order from '../../models/Order.js';
import { isDiamond } from '../../utils/sellerTier.js';
import { removedKeys, deleteUnusedKeys } from '../../services/uploads.js';
import { authSeller } from '../../middleware/auth.js';
import { slugify, blockWhenFrozen, ownProductFilter } from './helpers.js';

const router = express.Router();

// GET /api/sellers/products
router.get('/products', authSeller, async (req, res) => {
  try {
    // the store's name / slug are read fresh (the login token keeps the ones from login time)
    const me = await Seller.findById(req.seller.id).select('storeName storeSlug').lean();
    if (!me) return res.status(404).json({ message: 'Seller not found' });
    const products = await Product.find(await ownProductFilter(me))
      .populate('category', 'name slug')
      .sort({ createdAt: -1 });

    // very old products without an owner (matched above only when the store name is unique) are
    // linked to this store once
    for (const p of products) {
      if (!p.seller) {
        p.seller = me._id;
        p.sellerName = me.storeName;
        p.sellerSlug = me.storeSlug || slugify(me.storeName);
        await p.save().catch(() => {});
      }
    }

    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** A price a customer could be charged must be a real, non-negative number (a negative price
 *  lowered the total of a whole order that also held other stores' products). */
function priceProblem(data) {
  const bad = (v) => v !== undefined && v !== null && v !== '' && !(Number.isFinite(Number(v)) && Number(v) >= 0);
  if (bad(data.price) || bad(data.oldPrice) || bad(data.compareAtPrice)) return 'Please enter a valid price (0 or more).';
  if (Array.isArray(data.sizes) && data.sizes.some((s) => s && bad(s.price))) return 'Please enter a valid price (0 or more) for every size.';
  return '';
}

// POST /api/sellers/products
router.post('/products', authSeller, blockWhenFrozen('adding products'), async (req, res) => {
  try {
    const seller = await Seller.findById(req.seller.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    // Fields only the platform sets: the shop's own figures (rating, reviews, sales), the link to a
    // Central Treasury master product (that has its own "add from Treasury" route) and record ids.
    const data = { ...(req.body || {}) };
    for (const f of ['_id', '__v', 'createdAt', 'updatedAt', 'treasuryProduct', 'rating', 'numReviews', 'sold', 'reservedStock']) delete data[f];
    const badPrice = priceProblem(data);
    if (badPrice) return res.status(400).json({ message: badPrice });
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
      // stock is set by the platform (admin Inventory), never by the store: a new own product
      // starts with the usual opening stock, whatever number was sent
      stock: req.admin && data.stock !== undefined ? Math.max(0, Math.floor(Number(data.stock) || 0)) : 20,
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
router.put('/products/:id', authSeller, blockWhenFrozen('editing products'), async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, seller: req.seller.id });
    if (!product) return res.status(404).json({ message: 'Product not found or access denied' });

    const data = req.body || {};
    const badPrice = priceProblem(data);
    if (badPrice) return res.status(400).json({ message: badPrice });

    // Explicit whitelist of user-editable product fields
    if (data.name !== undefined) product.name = String(data.name).trim();
    if (data.description !== undefined) product.description = String(data.description);
    if (data.price !== undefined) product.price = Number(data.price);
    // the "compare at" price is stored as oldPrice (compareAtPrice is not a field, so edits were lost)
    const compare = data.oldPrice !== undefined ? data.oldPrice : data.compareAtPrice;
    if (compare !== undefined) product.oldPrice = compare === null || compare === '' || Number(compare) <= 0 ? undefined : Number(compare);
    if (data.shortDescription !== undefined) product.shortDescription = String(data.shortDescription);
    // a Central Treasury listing shows the master's stock: a seller cannot change it (a higher
    // number here let the listing sell more than the Treasury holds)
    // Stores cannot change stock at all any more — it is managed by the platform (admin
    // Inventory). Only an admin acting for the store may still set it on an own product.
    if (data.stock !== undefined && req.admin && !product.treasuryProduct) {
      const stock = Number(data.stock);
      if (!Number.isFinite(stock)) return res.status(400).json({ message: 'Please enter a valid stock number.' });
      product.stock = Math.max(0, Math.floor(stock));
    }
    if (data.lowStockThreshold !== undefined) product.lowStockThreshold = Number(data.lowStockThreshold);
    if (data.sku !== undefined) product.sku = String(data.sku).trim();
    if (data.barcode !== undefined) product.barcode = String(data.barcode).trim();
    if (data.brand !== undefined) product.brand = String(data.brand).trim();
    if (data.category !== undefined) product.category = data.category;
    if (data.active !== undefined) {
      // switched off with its Treasury master product: only the platform switches it on again
      if (data.active && product.pausedByTreasury) {
        return res.status(400).json({ message: 'This Treasury product is paused by the platform and cannot be switched on right now.' });
      }
      product.active = Boolean(data.active);
    }
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

    let droppedImageKeys = [];
    if (data.images && Array.isArray(data.images)) {
      droppedImageKeys = removedKeys(product.images, data.images);
      product.images = data.images.map((img) => (typeof img === 'string' ? { url: img, key: null } : img));
      if (product.images.length) product.image = product.images[0].url;
    }

    await product.save();
    // pictures taken off: freed on UploadThing, unless still used elsewhere (Product Treasury)
    if (droppedImageKeys.length) await deleteUnusedKeys(droppedImageKeys);
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/sellers/products/:id
router.delete('/products/:id', authSeller, blockWhenFrozen('deleting products'), async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, seller: req.seller.id });
    if (!product) return res.status(404).json({ message: 'Product not found or access denied' });

    if (product.treasuryProduct) {
      // only a Diamond store may remove Product Treasury items from My Store
      const me = await Seller.findById(req.seller.id).select('tier').lean();
      if (!isDiamond(me)) {
        return res.status(403).json({
          ok: false,
          upgradeRequired: true,
          message: 'Products imported from Product Treasury cannot be removed from your store. Upgrade to 💎 Diamond to remove products.',
        });
      }
    }

    // a product with orders still running stays until they are finished (its stock and the
    // order's money steps still point at it)
    const openOrder = await Order.exists({
      'items.product': product._id,
      status: { $nin: ['delivered', 'cancelled', 'refunded'] },
    });
    if (openOrder) {
      return res.status(400).json({
        ok: false,
        message: 'This product has orders that are still running. You can remove it once they are delivered or cancelled.',
      });
    }

    await Product.deleteOne({ _id: product._id });
    // its pictures are freed too — except Product Treasury pictures that other stores still show
    await deleteUnusedKeys((product.images || []).map((i) => i.key));
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
