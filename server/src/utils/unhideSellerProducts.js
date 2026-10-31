/**
 * ONE-TIME UPDATE (31 Oct 2026): stores can no longer hide their products (the Visible / Hidden
 * switch was removed from Seller Central). Products a STORE had hidden are made visible again.
 *
 * Runs once, by itself, after the server starts with this code (the "done" mark is kept in the
 * settings collection, so a restart or a new deploy never runs it again).
 *
 * Safety:
 *  - Nothing is deleted. Only `active: false → true` on the chosen products, nothing else changes.
 *  - Before the change, the list of every product id it will switch on is saved
 *    (settings key BACKUP_KEY) and written to the audit log — so it can be checked or undone.
 *  - Left as they are (these were switched off by the PLATFORM, not by the store):
 *      · paused with their Central Treasury master (`pausedByTreasury`)
 *      · Treasury listings whose master product is switched off or was deleted
 *      · own products with no stock (what is left after a Treasury master was deleted:
 *        the listing became a standalone product with stock 0, switched off)
 *      · products an admin switched off on the admin Products page (last audit = deactivated)
 *      · platform products without a store, and products of stores not approved / rejected
 */
import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Seller from '../models/Seller.js';
import TreasuryProduct from '../models/TreasuryProduct.js';
import AuditLog from '../models/AuditLog.js';
import { getSetting, setSetting } from '../models/System.js';

export const RUN_KEY = 'oneTime:unhideSellerProducts:2026-10-31';
export const BACKUP_KEY = 'oneTime:unhideSellerProducts:2026-10-31:backup';
const STALE_MS = 15 * 60 * 1000;

/** Which hidden products a store hid itself — the ones to switch on. Reads only. */
export async function planUnhide() {
  const hidden = await Product.find({ seller: { $ne: null }, active: false, pausedByTreasury: { $ne: true } })
    .select('_id name seller treasuryProduct stock')
    .lean();
  const skipped = { treasuryMasterOff: 0, noStockStandalone: 0, adminSwitchedOff: 0, storeNotApproved: 0 };
  if (!hidden.length) return { ids: [], rows: [], skipped, hiddenTotal: 0 };

  // Treasury masters: the listing may only come back when its master exists and is on
  const masterIds = [...new Set(hidden.filter((p) => p.treasuryProduct).map((p) => String(p.treasuryProduct)))];
  const masters = masterIds.length ? await TreasuryProduct.find({ _id: { $in: masterIds } }).select('_id active').lean() : [];
  const masterOn = new Map(masters.map((m) => [String(m._id), m.active !== false]));

  // products an admin switched off (admin Products page): the last on/off in the audit log
  const ids = hidden.map((p) => String(p._id));
  const logs = await AuditLog.find({ entity: 'product', entityId: { $in: ids }, action: { $in: ['product_activated', 'product_deactivated'] } })
    .select('entityId action createdAt')
    .sort({ createdAt: 1 })
    .lean();
  const lastAdmin = new Map();
  for (const l of logs) lastAdmin.set(String(l.entityId), l.action);

  // stores that are real, approved stores
  const sellerIds = [...new Set(hidden.map((p) => String(p.seller)))];
  const sellers = await Seller.find({ _id: { $in: sellerIds } }).select('_id status registrationRejectedAt storeName').lean();
  const storeOk = new Map(sellers.map((s) => [String(s._id), s.status !== 'pending_approval' && !s.registrationRejectedAt]));
  const storeName = new Map(sellers.map((s) => [String(s._id), s.storeName]));

  const rows = [];
  for (const p of hidden) {
    const id = String(p._id);
    if (!storeOk.get(String(p.seller))) {
      skipped.storeNotApproved += 1;
      continue;
    }
    if (lastAdmin.get(id) === 'product_deactivated') {
      skipped.adminSwitchedOff += 1;
      continue;
    }
    if (p.treasuryProduct) {
      if (!masterOn.get(String(p.treasuryProduct))) {
        skipped.treasuryMasterOff += 1;
        continue;
      }
    } else if (!(Number(p.stock) > 0)) {
      skipped.noStockStandalone += 1;
      continue;
    }
    rows.push({ id, name: p.name, seller: String(p.seller), store: storeName.get(String(p.seller)) || '' });
  }
  return { ids: rows.map((r) => r.id), rows, skipped, hiddenTotal: hidden.length };
}

/** Run the update once (safe to call on every start). */
export async function unhideSellerProductsOnce() {
  try {
    if (mongoose.connection.readyState !== 1) return;
    const state = await getSetting(RUN_KEY, null);
    if (state?.state === 'done') return;
    if (state?.state === 'running' && Date.now() - new Date(state.startedAt).getTime() < STALE_MS) return;
    await setSetting(RUN_KEY, { state: 'running', startedAt: new Date() });

    const plan = await planUnhide();

    // 1. backup first: exactly which products are switched on (kept, never overwritten later)
    const already = await getSetting(BACKUP_KEY, null);
    if (!already) {
      await setSetting(BACKUP_KEY, { at: new Date(), count: plan.ids.length, products: plan.rows, skipped: plan.skipped, hiddenTotal: plan.hiddenTotal });
    }
    await AuditLog.create({
      admin: { id: '', name: 'System (one-time update)', email: '' },
      action: 'products_unhidden_bulk',
      entity: 'product',
      entityId: '',
      details: { reason: 'Stores can no longer hide products; products hidden by stores made visible', count: plan.ids.length, ids: plan.ids, skipped: plan.skipped },
    }).catch((e) => console.error('[unhide] audit line:', e.message));

    // 2. the change itself: only active false → true, only on the listed products, and only if
    //    they are still hidden by the store at this very moment
    let modified = 0;
    for (let i = 0; i < plan.ids.length; i += 500) {
      const part = plan.ids.slice(i, i + 500);
      const r = await Product.updateMany({ _id: { $in: part }, active: false, pausedByTreasury: { $ne: true } }, { $set: { active: true } });
      modified += r.modifiedCount || 0;
    }

    await setSetting(RUN_KEY, { state: 'done', doneAt: new Date(), planned: plan.ids.length, madeVisible: modified, skipped: plan.skipped, hiddenTotal: plan.hiddenTotal });
    console.log(`[unhide] one-time update: ${modified} store-hidden product(s) made visible; left as they are: ${JSON.stringify(plan.skipped)}`);
  } catch (e) {
    // not marked done: it is tried again after the next start (it only switches products on)
    console.error('[unhide] one-time update failed:', e.message);
    await setSetting(RUN_KEY, { state: 'failed', at: new Date(), error: e.message }).catch(() => {});
  }
}
