import express from 'express';
import mongoose from 'mongoose';
import Seller from '../../models/Seller.js';
import SellerNickname from '../../models/SellerNickname.js';
import { authAdmin } from '../../middleware/auth.js';
import { audit } from '../../utils/audit.js';
import { asText } from '../../middleware/sanitize.js';

/**
 * ADMIN-ONLY STORE NICKNAMES (models/SellerNickname.js) — the store never sees them.
 *   GET /api/sellers/nicknames        any admin: { nicknames: { <sellerId>: "nickname" } }
 *   PUT /api/sellers/:id/nickname     admin with "sellers": { nickname } (empty = remove)
 * Every admin screen gets a live "seller:nickname" update.
 */
const router = express.Router();
const isId = (v) => mongoose.Types.ObjectId.isValid(String(v || ''));

router.get('/nicknames', authAdmin(), async (req, res) => {
  try {
    const list = await SellerNickname.find({}).select('seller nickname').lean();
    const nicknames = {};
    for (const n of list) nicknames[String(n.seller)] = n.nickname;
    res.set('Cache-Control', 'no-store');
    res.json({ nicknames });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.put('/:id/nickname', authAdmin('sellers'), async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ message: 'Store not found' });
    const nickname = asText(req.body?.nickname, 40).replace(/\s+/g, ' ').trim();
    const seller = await Seller.findById(req.params.id).select('storeName').lean();
    if (!seller) return res.status(404).json({ message: 'Store not found' });
    const prev = await SellerNickname.findOne({ seller: seller._id }).select('nickname').lean();
    if (nickname) {
      await SellerNickname.updateOne({ seller: seller._id }, { $set: { nickname, updatedBy: req.admin?.name || '' } }, { upsert: true });
    } else {
      await SellerNickname.deleteOne({ seller: seller._id });
    }
    // live update to every admin screen (admins only: the "admins" room)
    req.app.get('io')?.to('admins').emit('seller:nickname', { sellerId: String(seller._id), nickname });
    if ((prev?.nickname || '') !== nickname) {
      audit(req, 'update', 'seller_nickname', seller._id, nickname ? `Nickname for ${seller.storeName}: “${nickname}”${prev?.nickname ? ` (was “${prev.nickname}”)` : ''}` : `Nickname removed for ${seller.storeName} (was “${prev?.nickname || ''}”)`);
    }
    res.json({ ok: true, sellerId: String(seller._id), nickname });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

export default router;
