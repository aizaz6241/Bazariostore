import { Router } from 'express';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import Seller from '../models/Seller.js';
import { authAdmin } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { deleteKeys, removedKeys } from '../services/uploads.js';
import { escapeRegex } from '../utils/sanitize.js';

const router = Router();

// ---------- public ----------
// GET /api/products?category=<slug>&q=&label=&seller=&sellerSlug=&featured=1&sort=&limit=
router.get('/', async (req, res) => {
  try {
    const { category, q, label, badge, featured, seller, sellerSlug, sort, limit } = req.query;
    const filter = { active: true };

    if (category) {
      const cat = await Category.findOne({ slug: category });
      filter.category = cat ? cat._id : null;
    }
    if (seller) {
      filter.seller = seller;
    } else if (sellerSlug) {
      filter.sellerSlug = sellerSlug;
    }

    if (featured) filter.labels = { $in: ['featured'] };
    else if (label || badge) filter.labels = { $in: [label || badge] };

    if (q && typeof q === 'string' && q.trim()) {
      const safeQ = escapeRegex(q.trim());
      filter.$or = [
        { name: { $regex: safeQ, $options: 'i' } },
        { brand: { $regex: safeQ, $options: 'i' } },
        { sellerName: { $regex: safeQ, $options: 'i' } },
        { tags: { $regex: safeQ, $options: 'i' } },
      ];
    }

    let sortBy = { createdAt: -1 };
    if (sort === 'price-asc') sortBy = { price: 1 };
    if (sort === 'price-desc') sortBy = { price: -1 };
    if (sort === 'rating') sortBy = { rating: -1 };
    if (sort === 'popular') sortBy = { sold: -1 };

    const products = await Product.find(filter)
      .populate('category', 'name slug')
      .populate('seller', 'storeName storeSlug rating numReviews verified')
      .sort(sortBy)
      .limit(Number(limit) || 100);

    res.json(products);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.get('/slug/:slug', async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug, active: true })
    .populate('category', 'name slug')
    .populate('seller', 'storeName storeSlug rating numReviews verified logo description address');
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json(product);
});

router.get('/related/:slug', async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug });
  if (!product) return res.json([]);
  const related = await Product.find({ category: product.category, active: true, _id: { $ne: product._id } })
    .populate('category', 'name slug')
    .populate('seller', 'storeName storeSlug rating')
    .limit(6);
  res.json(related);
});

// ---------- admin ----------
router.get('/admin/list', authAdmin('products'), async (req, res) => {
  const { q, category, seller, status } = req.query;
  const filter = {};
  if (q && typeof q === 'string' && q.trim()) {
    const safeQ = escapeRegex(q.trim());
    filter.$or = [{ name: { $regex: safeQ, $options: 'i' } }, { sku: { $regex: safeQ, $options: 'i' } }, { sellerName: { $regex: safeQ, $options: 'i' } }];
  }
  if (category) filter.category = category;
  if (seller) filter.seller = seller;
  if (status === 'active') filter.active = true;
  if (status === 'inactive') filter.active = false;

  const products = await Product.find(filter)
    .populate('category', 'name slug')
    .populate('seller', 'storeName storeSlug')
    .sort({ createdAt: -1 })
    .limit(500);
  res.json(products);
});

router.get('/admin/:id', authAdmin('products'), async (req, res) => {
  const product = await Product.findById(req.params.id)
    .populate('category', 'name slug')
    .populate('seller', 'storeName storeSlug');
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json(product);
});

const slugify = (s) =>
  s.toLowerCase().trim().replace(/['%+]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

router.post('/', authAdmin('products'), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name?.trim() || !(Number(body.price) > 0)) return res.status(400).json({ message: 'Name and price are required' });
    let slug = body.slug?.trim() || slugify(body.name);
    if (await Product.findOne({ slug })) slug = `${slug}-${Date.now().toString(36)}`;

    // If seller assigned, attach seller storeName
    if (body.seller) {
      const s = await Seller.findById(body.seller);
      if (s) {
        body.sellerName = s.storeName;
        body.sellerSlug = s.storeSlug;
      }
    }

    const product = await Product.create({ ...body, slug });
    await audit(req, 'product_added', 'product', product._id, { name: product.name, price: product.price });
    res.status(201).json(product);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.put('/:id', authAdmin('products'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    const body = req.body || {};
    delete body._id;
    delete body.slug; // slug stable so links don't break

    if (body.seller && body.seller !== product.seller?.toString()) {
      const s = await Seller.findById(body.seller);
      if (s) {
        body.sellerName = s.storeName;
        body.sellerSlug = s.storeSlug;
      }
    }

    if (body.price != null && Number(body.price) !== product.price) {
      await audit(req, 'price_changed', 'product', product._id, { name: product.name, from: product.price, to: Number(body.price) });
    }
    // free removed images on UploadThing
    if (body.images) await deleteKeys(removedKeys(product.images, body.images));

    Object.assign(product, body);
    await product.save();
    await audit(req, 'product_updated', 'product', product._id, { name: product.name });
    res.json(product);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.patch('/:id/active', authAdmin('products'), async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  product.active = !product.active;
  await product.save();
  await audit(req, product.active ? 'product_activated' : 'product_deactivated', 'product', product._id, { name: product.name });
  res.json(product);
});

router.delete('/:id', authAdmin('products'), async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  await deleteKeys((product.images || []).map((i) => i.key));
  await product.deleteOne();
  await audit(req, 'product_deleted', 'product', req.params.id, { name: product.name });
  res.json({ ok: true });
});

export default router;
