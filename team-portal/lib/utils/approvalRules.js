/**
 * Pure rules of the two-person approval system (no database, no imports) so they can be tested
 * on their own and reused by the screens.
 *
 * Idea: anything that takes money OUT of the count, moves it from one person to another, or
 * rewrites history needs a second person. Anything that only ADDS a new real amount is done at
 * once and written to the activity log.
 */

export const ACTION_LABEL = {
  skip: 'Mark as “no real money”',
  edit_usdt: 'Change a counted amount',
  count_bonus: 'Count a milestone bonus',
  resplit: 'Divide an entry again',
  manual_create: 'Add a manual entry',
  manual_delete: 'Delete a manual entry',
  fix_deposit: 'Fix a deposit added to the wrong seller',
  payout: 'Record a payout',
  reassign: 'Move a seller to another owner',
  seller_flag: 'Change seller type',
  admin_create: 'Create an admin account',
  admin_update: 'Change an admin account',
  admin_delete: 'Delete an admin account',
};

export const GATED_ACTIONS = Object.keys(ACTION_LABEL);

const clean = (v) => (v === undefined || v === null ? '' : String(v).trim().toLowerCase());

/** Are these two the same human? Any one matching id / email is enough. */
export function samePerson(a, b) {
  if (!a || !b) return false;
  const pairs = [
    [clean(a.memberId), clean(b.memberId)],
    [clean(a.adminId), clean(b.adminId)],
    [clean(a.email), clean(b.email)],
  ];
  return pairs.some(([x, y]) => x && y && x === y);
}

/**
 * Who may decide a request.
 *   cancel  -> only the person who asked
 *   approve / reject -> an admin who is NOT the person who asked;
 *                       for a payout also the person the money is paid to
 */
export function canDecide({ approval, viewer, decision }) {
  if (!approval || !viewer) return { ok: false, reason: 'Not allowed' };
  if (approval.status !== 'pending') return { ok: false, reason: 'This request is already closed' };

  const mine = samePerson(approval.requestedBy, viewer);
  if (decision === 'cancel') {
    return mine ? { ok: true } : { ok: false, reason: 'Only the person who asked can cancel this request' };
  }
  if (decision !== 'approve' && decision !== 'reject') return { ok: false, reason: 'Unknown decision' };
  if (mine) return { ok: false, reason: 'You asked for this yourself. The other partner has to approve it' };

  const isPayee = approval.action === 'payout' && clean(approval.payeeId) && clean(approval.payeeId) === clean(viewer.memberId);
  if (viewer.role === 'admin' || isPayee) return { ok: true };
  return { ok: false, reason: 'Only a partner can approve this' };
}

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const r6 = (v) => Math.round(n(v) * 1e6) / 1e6;

/**
 * Saving USDT / INR / PKR rate on a deposit or seller withdrawal.
 *   not counted yet           -> first entry of the real amount: done at once
 *   counted, nothing changes  -> nothing to do
 *   counted, a value changes  -> history is being rewritten: needs approval
 * `next` values that are empty mean "leave as it is".
 */
export function saveNeedsApproval({ counted, current = {}, next = {} }) {
  if (!counted) return false;
  const has = (v) => v !== undefined && v !== null && v !== '';
  if (has(next.usdtAmount) && r6(next.usdtAmount) !== r6(current.usdt)) return true;
  if (has(next.inrAmount) && n(next.inrAmount) !== n(current.inr)) return true;
  if (has(next.pkrRate) && n(next.pkrRate) !== n(current.pkrRate)) return true;
  return false;
}

/** A payout written by someone other than the person who receives it needs a second person. */
export function payoutNeedsApproval({ recorderId, payeeId }) {
  return clean(recorderId) !== clean(payeeId);
}

/**
 * Counting a milestone bonus (it is paid 50 / 50 by the two partners). Two different partners
 * must be involved: if the one entering the rate is not the one who approved the bonus, that is
 * already two people.
 */
export function bonusNeedsApproval({ approvedById, saverId }) {
  return !clean(approvedById) || clean(approvedById) === clean(saverId);
}
