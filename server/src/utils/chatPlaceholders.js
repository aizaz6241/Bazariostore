import mongoose from 'mongoose';
import Seller from '../models/Seller.js';
import Order from '../models/Order.js';
import Withdrawal from '../models/Withdrawal.js';

/**
 * What support needs to know about a store, in one call: used by the seller-info panel of the admin
 * chat and to fill {placeholders} in messages / saved replies / broadcasts.
 */
export const PLACEHOLDERS = {
  storeName: 'Store name',
  ownerName: 'Owner name',
  balance: 'Available balance',
  frozenAmount: 'Frozen amount',
  pendingOrders: 'Orders waiting to be confirmed',
  pendingAmount: 'Value of those orders',
  shortBy: 'Deposit needed to confirm them',
  tier: 'Plan (Basic / Diamond)',
};

const usd = (n) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const oid = (v) => new mongoose.Types.ObjectId(String(v));

export async function sellerFacts(sellerId, { withOrders = false } = {}) {
  if (!sellerId || !mongoose.Types.ObjectId.isValid(String(sellerId))) return null;
  const id = oid(sellerId);
  const [seller, pending, lastDeposit, owner] = await Promise.all([
    Seller.findById(id).select('storeName ownerName email phone status tier tierSince wallet accountHealth isTestAccount createdAt warning freezeReason').lean(),
    Order.find({ status: 'pending', $or: [{ 'items.seller': id }, { seller: id }] })
      .select('orderNumber createdAt seller items.seller items.itemStatus items.price items.qty items.name')
      .sort({ createdAt: 1 })
      .lean(),
    Withdrawal.findOne({ seller: id, type: 'deposit', status: { $in: ['approved', 'completed'] }, purpose: { $ne: 'diamond_fee' } })
      .select('amount approvedAmount processedAt createdAt')
      .sort({ processedAt: -1, createdAt: -1 })
      .lean(),
    mongoose.connection.db
      .collection('portalsellerassignments')
      .findOne({ sellerId: id, status: 'active' })
      .then((a) => (a ? mongoose.connection.db.collection('portalmembers').findOne({ _id: a.memberId }, { projection: { name: 1 } }) : null))
      .catch(() => null),
  ]);
  if (!seller) return null;

  const sid = String(id);
  const waitingOrders = [];
  let pendingAmount = 0;
  for (const o of pending) {
    const mine = (o.items || []).filter((it) => (it.seller ? String(it.seller) === sid : String(o.seller || '') === sid) && (!it.itemStatus || it.itemStatus === 'pending'));
    if (!mine.length) continue;
    const value = mine.reduce((t, it) => t + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
    pendingAmount += value;
    waitingOrders.push({ _id: String(o._id), orderNumber: o.orderNumber, createdAt: o.createdAt, value: Math.round(value * 100) / 100, items: mine.map((it) => it.name).join(', ').slice(0, 80) });
  }
  const balance = Number(seller.wallet?.balance) || 0;
  const facts = {
    sellerId: sid,
    storeName: seller.storeName || '',
    ownerName: seller.ownerName || '',
    email: seller.email || '',
    phone: seller.phone || '',
    status: seller.status || 'active',
    freezeReason: seller.freezeReason || '',
    tier: seller.tier === 'diamond' ? 'Diamond' : 'Basic',
    tierSince: seller.tierSince || null,
    health: seller.accountHealth?.score ?? 100,
    warning: seller.warning?.active ? seller.warning.message || '' : '',
    isTest: seller.isTestAccount === true,
    balance,
    frozenAmount: Number(seller.wallet?.frozenFund) || 0,
    processingFund: Number(seller.wallet?.processingFund) || 0,
    totalDeposited: Number(seller.wallet?.totalDeposited) || 0,
    pendingOrders: waitingOrders.length,
    pendingAmount: Math.round(pendingAmount * 100) / 100,
    shortBy: Math.max(0, Math.round((pendingAmount - balance) * 100) / 100),
    lastDeposit: lastDeposit
      ? { amount: Number(lastDeposit.approvedAmount ?? lastDeposit.amount) || 0, at: lastDeposit.processedAt || lastDeposit.createdAt }
      : null,
    ownerMember: owner?.name || '',
    joinedAt: seller.createdAt,
  };
  if (withOrders) facts.waitingOrders = waitingOrders.slice(0, 8);
  return facts;
}

/** Replace {storeName}, {balance}… with this store's values (unknown names are left as typed). */
export function fillPlaceholders(text, facts) {
  if (!text || !facts || !String(text).includes('{')) return text;
  const values = {
    storeName: facts.storeName,
    ownerName: facts.ownerName || facts.storeName,
    balance: usd(facts.balance),
    frozenAmount: usd(facts.frozenAmount),
    pendingOrders: String(facts.pendingOrders),
    pendingAmount: usd(facts.pendingAmount),
    shortBy: usd(facts.shortBy),
    tier: facts.tier,
  };
  return String(text).replace(/\{(\w+)\}/g, (all, name) => (Object.prototype.hasOwnProperty.call(values, name) ? values[name] : all));
}
