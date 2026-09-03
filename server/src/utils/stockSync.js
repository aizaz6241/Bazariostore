import TreasuryProduct from '../models/TreasuryProduct.js';
import Product from '../models/Product.js';
import { StockHistory } from '../models/StockHistory.js';

/**
 * Adjusts master Treasury stock by delta (positive or negative),
 * and automatically synchronizes the new stock count across all seller listings.
 *
 * @param {string|ObjectId} treasuryId - The _id of the TreasuryProduct
 * @param {number} delta - Stock change (e.g. -5 for order, +5 for cancel/restock)
 * @param {object} meta - { reason, note, by }
 * @returns {Promise<TreasuryProduct>}
 */
export async function adjustTreasuryStock(treasuryId, delta, meta = {}) {
  if (!treasuryId) return null;
  const tp = await TreasuryProduct.findById(treasuryId);
  if (!tp) return null;

  const previousStock = tp.stock || 0;
  tp.stock = Math.max(0, previousStock + Number(delta));

  // If order was placed (delta < 0), increment reservedStock or track
  if (delta < 0) {
    tp.reservedStock = (tp.reservedStock || 0) + Math.abs(delta);
    tp.sold = (tp.sold || 0) + Math.abs(delta);
  } else if (meta.releaseReserved) {
    tp.reservedStock = Math.max(0, (tp.reservedStock || 0) - Math.abs(delta));
  }

  await tp.save();

  // Synchronize all seller store listings that imported this Treasury product
  await Product.updateMany(
    { treasuryProduct: tp._id },
    { $set: { stock: tp.stock } }
  );

  // Record audit trail in StockHistory
  try {
    await StockHistory.create({
      product: tp._id,
      productName: tp.name,
      change: delta,
      stockAfter: tp.stock,
      reason: meta.reason || (delta < 0 ? 'order' : 'restock'),
      note: meta.note || '',
      by: meta.by || 'System',
    });
  } catch (err) {
    console.error('Failed to log Treasury StockHistory:', err.message);
  }

  return tp;
}

/**
 * Directly sets a new stock level on a master Treasury product,
 * and synchronizes all seller store listings immediately.
 */
export async function setTreasuryStock(treasuryId, newStock, meta = {}) {
  if (!treasuryId) return null;
  const tp = await TreasuryProduct.findById(treasuryId);
  if (!tp) return null;

  const prev = tp.stock || 0;
  tp.stock = Math.max(0, Number(newStock));
  await tp.save();

  await Product.updateMany(
    { treasuryProduct: tp._id },
    { $set: { stock: tp.stock } }
  );

  try {
    await StockHistory.create({
      product: tp._id,
      productName: tp.name,
      change: tp.stock - prev,
      stockAfter: tp.stock,
      reason: meta.reason || 'admin_adjustment',
      note: meta.note || 'Admin stock level update',
      by: meta.by || 'Admin',
    });
  } catch (err) {
    console.error('Failed to log Treasury StockHistory:', err.message);
  }

  return tp;
}
