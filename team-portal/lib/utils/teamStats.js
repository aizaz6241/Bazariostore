import Member from '@/lib/models/Member';
import SellerAssignment from '@/lib/models/SellerAssignment';
import RewardClaim from '@/lib/models/RewardClaim';
import { Seller, Order, CLIENT_SELLER_FILTER } from '@/lib/models/SharedModels';
import { getWalletBalancesMap, EMPTY_WALLET } from '@/lib/utils/wallet';
import { getLedgerStats, sellerBinance } from '@/lib/utils/ledgerStats';

const OPEN_ORDER_STATUSES = ['pending', 'processing', 'unfulfilled'];
const sid = (v) => (v ? String(v) : '');

/**
 * Per-person numbers for the dashboard and the members list, loaded with a fixed handful of
 * queries for the whole team (it used to be 5–8 queries per person).
 *
 * @param {object[]} people  lean PortalMember docs
 * Money is REAL BINANCE USDT from the finance ledger (not the store wallets of the seller site):
 *   totalDeposits    = USDT brought in by this person's stores
 *   totalWithdrawals = USDT paid out to this person's stores (seller withdrawals)
 * Each seller in `sellers` carries the same numbers for itself in `binance`.
 *
 * @returns {Promise<Map<string, object>>} memberId -> { sellers, totalDeposits, totalWithdrawals,
 *          totalBonusesPKR, pendingOrdersCount, wallet }
 */
export async function loadTeamStats(people) {
  const ids = people.map((p) => p._id);

  const [assignments, bonusAgg, wallets, ledgerStats] = await Promise.all([
    SellerAssignment.find({ memberId: { $in: ids }, status: 'active' }).select('sellerId memberId').lean(),
    RewardClaim.aggregate([
      { $match: { memberId: { $in: ids }, status: 'approved' } },
      { $group: { _id: '$memberId', total: { $sum: '$amountPKR' } } },
    ]),
    getWalletBalancesMap().catch((e) => {
      console.error('Wallet ledger error:', e.message);
      return new Map();
    }),
    getLedgerStats().catch((e) => {
      console.error('Ledger stats error:', e.message);
      return { bySeller: new Map(), byOwner: new Map() };
    }),
  ]);

  const sellerIds = assignments.map((a) => a.sellerId);

  const [sellers, orderAgg] = await Promise.all([
    Seller.find({ _id: { $in: sellerIds }, ...CLIENT_SELLER_FILTER })
      .select('storeName ownerName email phone status wallet accountHealth createdAt')
      .lean(),
    sellerIds.length
      ? Order.aggregate([
          { $match: { seller: { $in: sellerIds }, status: { $in: OPEN_ORDER_STATUSES } } },
          { $group: { _id: '$seller', n: { $sum: 1 } } },
        ])
      : [],
  ]);

  const sellerMap = new Map(sellers.map((s) => [sid(s._id), s]));
  const ordersBySeller = new Map(orderAgg.map((o) => [sid(o._id), o.n]));
  const bonusByMember = new Map(bonusAgg.map((b) => [sid(b._id), b.total]));

  const out = new Map();
  for (const p of people) {
    const own = ledgerStats.byOwner.get(sid(p._id));
    out.set(sid(p._id), {
      sellers: [],
      totalDeposits: own ? own.depositUSDT : 0,
      totalWithdrawals: own ? own.withdrawUSDT : 0,
      depositsCount: own ? own.deposits : 0,
      pendingOrdersCount: 0,
      totalBonusesPKR: bonusByMember.get(sid(p._id)) || 0,
      wallet: wallets.get(sid(p._id)) || { ...EMPTY_WALLET },
    });
  }

  for (const a of assignments) {
    const row = out.get(sid(a.memberId));
    const seller = sellerMap.get(sid(a.sellerId));
    if (!row || !seller) continue; // test / deleted sellers are not counted
    row.sellers.push({ ...seller, binance: sellerBinance(ledgerStats, seller._id) });
    row.pendingOrdersCount += ordersBySeller.get(sid(a.sellerId)) || 0;
  }

  return out;
}

export { OPEN_ORDER_STATUSES };
