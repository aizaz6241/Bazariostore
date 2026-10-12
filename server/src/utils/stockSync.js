import mongoose from 'mongoose';
import TreasuryProduct from '../models/TreasuryProduct.js';
import Product from '../models/Product.js';
import { StockHistory } from '../models/StockHistory.js';
import { toSellers } from './realtime.js';

/**
 * Central Treasury stock. One master product, many seller listings that show its stock.
 *
 * Every change is ONE database step ($inc), never "read, change, write back": two orders at the
 * same moment used to both read 10 and both write 9. The counters follow the same rules as a
 * seller's own product (utils/orderStock.js):
 *   - order placed          stock -q, reservedStock +q   (kind 'reserve', refuses when short)
 *   - order delivered       reservedStock -q, sold +q    (settleTreasurySale)
 *   - order cancelled       stock +q, reservedStock -q   (kind 'release')
 *   - delivered, refunded   stock +q, sold -q            (kind 'unsell')
 *   - refunded order back   stock -q, sold +q            (kind 'resell')
 *   - admin correction      stock ±q                     (kind 'adjust', the default)
 */
const KINDS = {
  adjust: (q) => ({ stock: q }),
  reserve: (q) => ({ stock: -q, reservedStock: q }),
  release: (q) => ({ stock: q, reservedStock: -q }),
  unsell: (q) => ({ stock: q, sold: -q }),
  resell: (q) => ({ stock: -q, sold: q }),
};

const validId = (id) => Boolean(id) && mongoose.Types.ObjectId.isValid(String(id));

/** Counters never go below zero (a correction can ask for more than is there). */
async function clampCounters(id) {
  for (const f of ['stock', 'reservedStock', 'sold']) {
    await TreasuryProduct.updateOne({ _id: id, [f]: { $lt: 0 } }, { $set: { [f]: 0 } });
  }
}

/** Every seller listing of this master product shows the master's current stock. */
export async function syncTreasuryListings(treasuryId) {
  const tp = await TreasuryProduct.findById(treasuryId).select('stock').lean();
  if (!tp) return null;
  await Product.updateMany({ treasuryProduct: tp._id }, { $set: { stock: tp.stock } });
  await announceTreasuryChange(tp._id);
  return tp.stock;
}

/** The sellers who list this master product see their products / Treasury screens refresh. */
export async function announceTreasuryChange(treasuryId) {
  try {
    const sellerIds = await Product.distinct('seller', { treasuryProduct: treasuryId });
    toSellers(sellerIds, 'products:changed', { treasuryProduct: String(treasuryId) });
  } catch (e) {
    console.error('[realtime] treasury change:', e.message);
  }
}

async function logTreasury(tp, change, meta, fallbackReason) {
  try {
    await StockHistory.create({
      product: tp._id,
      productName: tp.name,
      change,
      stockAfter: tp.stock,
      reason: meta.reason || fallbackReason,
      note: meta.note || '',
      by: meta.by || 'System',
    });
  } catch (err) {
    console.error('Failed to log Treasury StockHistory:', err.message);
  }
}

/**
 * Change master Treasury stock by `delta` units and show the new stock on every seller listing.
 *
 * @param {string|ObjectId} treasuryId - The _id of the TreasuryProduct
 * @param {number} delta - Stock change: negative takes from the shelf, positive puts back
 * @param {object} meta - { reason, note, by, kind } — kind: see KINDS above (default 'adjust').
 *   Older callers' { releaseReserved: true } means kind 'release'.
 *   With kind 'reserve' the step only happens while enough stock is left; otherwise null.
 * @returns {Promise<TreasuryProduct|null>}
 */
export async function adjustTreasuryStock(treasuryId, delta, meta = {}) {
  if (!validId(treasuryId)) return null;
  const n = Number(delta);
  if (!Number.isFinite(n) || n === 0) return TreasuryProduct.findById(treasuryId);

  const kind = meta.kind || (meta.releaseReserved ? 'release' : 'adjust');
  const q = kind === 'adjust' ? n : Math.abs(n);
  const filter = { _id: treasuryId };
  if (kind === 'reserve' || kind === 'resell') filter.stock = { $gte: q }; // never sell what is not there

  const tp = await TreasuryProduct.findOneAndUpdate(filter, { $inc: KINDS[kind](q) }, { new: true });
  if (!tp) return null;
  await clampCounters(tp._id);

  await syncTreasuryListings(tp._id);
  const fresh = (await TreasuryProduct.findById(tp._id)) || tp;
  await logTreasury(fresh, KINDS[kind](q).stock, meta, KINDS[kind](q).stock < 0 ? 'order' : 'restock');
  return fresh;
}

/** An order of this master product was delivered: the reservation becomes a sale. */
export async function settleTreasurySale(treasuryId, qty) {
  const q = Math.abs(Number(qty) || 0);
  if (!validId(treasuryId) || !q) return null;
  await TreasuryProduct.updateOne({ _id: treasuryId }, { $inc: { reservedStock: -q, sold: q } });
  await clampCounters(treasuryId);
  return true;
}

/**
 * Directly sets a new stock level on a master Treasury product,
 * and synchronizes all seller store listings immediately.
 */
export async function setTreasuryStock(treasuryId, newStock, meta = {}) {
  if (!validId(treasuryId)) return null;
  const target = Math.max(0, Math.floor(Number(newStock)));
  if (!Number.isFinite(target)) return null;

  const before = await TreasuryProduct.findOneAndUpdate({ _id: treasuryId }, { $set: { stock: target } }, { new: false });
  if (!before) return null;
  await syncTreasuryListings(before._id);
  const tp = (await TreasuryProduct.findById(before._id)) || before;
  await logTreasury(tp, target - (before.stock || 0), meta, 'admin_adjustment');
  return tp;
}
