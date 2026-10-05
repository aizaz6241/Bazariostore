import { Router } from 'express';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import { authAdmin } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { deleteKeys } from '../services/uploads.js';

const router = Router();

let categoriesCache = null;
let categoriesCacheTime = 0;
const CATEGORIES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

export function invalidateCategoriesCache() {
  categoriesCache = null;
  categoriesCacheTime = 0;
}

// public — active categories with product counts
router.get('/', async (req, res) => {
  try {
    const now = Date.now();
    if (categoriesCache && now - categoriesCacheTime < CATEGORIES_CACHE_TTL) {
      res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
      return res.json(categoriesCache);
    }

    const [cats, counts] = await Promise.all([
      Category.find({ active: true }).sort({ sortOrder: 1, name: 1 }).lean(),
      Product.aggregate([
        { $match: { active: true } },
        { $group: { _id: '$category', n: { $sum: 1 } } },
      ]),
    ]);

    const countMap = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
    const result = cats.map((c) => ({ ...c, productCount: countMap[String(c._id)] || 0 }));

    categoriesCache = result;
    categoriesCacheTime = now;
    res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// admin
router.get('/admin/list', authAdmin('categories'), async (req, res) => {
  const [cats, counts] = await Promise.all([
    Category.find().sort({ sortOrder: 1, name: 1 }).lean(),
    Product.aggregate([{ $group: { _id: '$category', n: { $sum: 1 } } }]),
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
  res.json(cats.map((c) => ({ ...c, productCount: countMap[String(c._id)] || 0 })));
});

const slugify = (s) => s.toLowerCase().trim().replace(/['%+]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

router.post('/', authAdmin('categories'), async (req, res) => {
  try {
    const { name, image, sortOrder } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ message: 'Category name required' });
    let slug = slugify(name);
    if (await Category.findOne({ slug })) slug = `${slug}-${Date.now().toString(36)}`;
    const cat = await Category.create({ name: name.trim(), slug, image: image || {}, sortOrder: sortOrder || 0 });
    invalidateCategoriesCache();
    await audit(req, 'category_added', 'category', cat._id, { name: cat.name });
    res.status(201).json(cat);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.put('/:id', authAdmin('categories'), async (req, res) => {
  const cat = await Category.findById(req.params.id);
  if (!cat) return res.status(404).json({ message: 'Category not found' });
  const { name, image, sortOrder } = req.body || {};
  if (image && cat.image?.key && image.key !== cat.image.key) await deleteKeys([cat.image.key]);
  if (name?.trim()) cat.name = name.trim();
  if (image) cat.image = image;
  if (sortOrder != null) cat.sortOrder = sortOrder;
  await cat.save();
  invalidateCategoriesCache();
  await audit(req, 'category_updated', 'category', cat._id, { name: cat.name });
  res.json(cat);
});

router.patch('/:id/active', authAdmin('categories'), async (req, res) => {
  const cat = await Category.findById(req.params.id);
  if (!cat) return res.status(404).json({ message: 'Category not found' });
  cat.active = !cat.active;
  await cat.save();
  invalidateCategoriesCache();
  await audit(req, cat.active ? 'category_activated' : 'category_deactivated', 'category', cat._id, { name: cat.name });
  res.json(cat);
});

router.delete('/:id', authAdmin('categories'), async (req, res) => {
  const count = await Product.countDocuments({ category: req.params.id });
  if (count > 0) return res.status(400).json({ message: `Is category mein ${count} products hain — pehle unhe move ya delete karein` });
  const cat = await Category.findById(req.params.id);
  if (!cat) return res.status(404).json({ message: 'Category not found' });
  if (cat.image?.key) await deleteKeys([cat.image.key]);
  await cat.deleteOne();
  invalidateCategoriesCache();
  await audit(req, 'category_deleted', 'category', req.params.id, { name: cat.name });
  res.json({ ok: true });
});

export default router;
