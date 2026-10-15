/**
 * Seller account tiers: Basic (every seller) and Diamond (upgraded by an admin after the seller
 * pays the one-time upgrade fee). One place for every tier rule, so the order, penalty and
 * product code all read the same numbers.
 *
 *   Basic   — 20% profit per order, 48h to confirm an order (warning at 24h), cannot remove
 *             Product Treasury items from My Store.
 *   Diamond — 35% profit on orders placed from the upgrade on, 72h to confirm (warning at 48h,
 *             i.e. 24h before the deadline), may remove products from My Store, fast 3–5 day delivery.
 */
export const DIAMOND_UPGRADE_FEE_USD = 1500;
export const WARNING_BEFORE_DEADLINE_HOURS = 24;

export const TIERS = {
  basic: {
    key: 'basic',
    label: 'Basic',
    profitRate: 20,
    confirmHours: 48,
    canRemoveProducts: false,
    deliveryDays: '',
  },
  diamond: {
    key: 'diamond',
    label: 'Diamond',
    profitRate: 35,
    confirmHours: 72,
    canRemoveProducts: true,
    deliveryDays: '3–5',
  },
};

export const isDiamond = (seller) => seller?.tier === 'diamond';
export const tierOf = (seller) => (isDiamond(seller) ? TIERS.diamond : TIERS.basic);

/**
 * Profit % for a seller's items in this order. The Diamond rate applies only to orders PLACED on
 * or after the upgrade (tierSince); an order that was already waiting keeps the Basic 20%.
 */
export function profitRateFor(seller, order) {
  if (!isDiamond(seller)) return TIERS.basic.profitRate;
  const since = seller.tierSince ? new Date(seller.tierSince) : null;
  const placed = order?.createdAt ? new Date(order.createdAt) : new Date();
  if (since && placed < since) return TIERS.basic.profitRate;
  return TIERS.diamond.profitRate;
}

/** Hours a seller has to confirm a waiting order before the freeze, and when the warning goes. */
export const confirmHoursFor = (seller) => tierOf(seller).confirmHours;
export const warnHoursFor = (seller) => confirmHoursFor(seller) - WARNING_BEFORE_DEADLINE_HOURS;

/** What the seller's own screens need (no internal fields). */
export function tierInfo(seller) {
  const t = tierOf(seller);
  return {
    tier: t.key,
    label: t.label,
    profitRate: t.profitRate,
    confirmHours: t.confirmHours,
    warnHours: t.confirmHours - WARNING_BEFORE_DEADLINE_HOURS,
    canRemoveProducts: t.canRemoveProducts,
    deliveryDays: t.deliveryDays,
    tierSince: seller?.tierSince || null,
    request: {
      status: seller?.tierRequest?.status || 'none',
      requestedAt: seller?.tierRequest?.requestedAt || null,
    },
    upgradeFee: DIAMOND_UPGRADE_FEE_USD,
    plans: TIERS,
  };
}
