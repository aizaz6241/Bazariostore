// What a customer may see of an order: no cost prices, margins, payout flags or internal notes.
const HIDDEN_ITEM_FIELDS = ['costPrice', 'processingLocked', 'lockedAmount', 'profitRate', 'profitAmount', 'payoutSettled', 'settledAt', 'lockGen'];
const HIDDEN_ORDER_FIELDS = ['adminNotes', 'warning24hSent', 'penalty48hApplied', 'stockRestored', 'stockSettled', 'nextStatus', 'nextStatusAt', 'placedByAdminName'];

export function publicOrder(order) {
  const o = order?.toObject ? order.toObject() : { ...(order || {}) };
  o.items = (o.items || []).map((it) => {
    const copy = { ...it };
    for (const f of HIDDEN_ITEM_FIELDS) delete copy[f];
    return copy;
  });
  for (const f of HIDDEN_ORDER_FIELDS) delete o[f];
  return o;
}
