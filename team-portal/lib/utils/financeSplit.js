/**
 * Pure split rules for the USDT finance ledger (no database, no imports).
 * Every amount here is REAL Binance USDT.
 *
 * Deposit (money IN), by who owns the seller:
 *   - a partner (admin)      -> that partner 75%, other partner 25%
 *   - 50% member (inr_50)    -> member 50%, partners 25% + 25%
 *   - 1:1 PKR member         -> member gets (INR deposited) PKR, converted to USDT at that
 *                               day's PKR/USDT rate; the rest is split 50/50 by the partners
 *   - nobody (unassigned)    -> partners 50% + 50%
 *
 * Seller withdrawal (money OUT), charged on the full amount:
 *   - previous-store seller  -> partners 50% + 50%
 *   - a partner's seller     -> that partner 75%, other partner 25%
 *   - a member's seller      -> member 50%, partners 25% + 25%
 *   - unassigned             -> partners 50% + 50%
 */

export function r6(n) {
  return Math.round((Number(n) || 0) * 1e6) / 1e6;
}

export function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function pctOf(part, total) {
  return total > 0 ? r6((part / total) * 100) : 0;
}

/**
 * @param {object} p
 * @param {'deposit'|'seller_withdrawal'} p.kind
 * @param {number} p.usdt       real USDT received / sent
 * @param {number} [p.inr]      INR the seller paid (needed for 1:1 PKR members)
 * @param {number} [p.pkrRate]  PKR per 1 USDT on that day (needed for 1:1 PKR members)
 * @param {{id:string,name:string,role:'admin'|'member',deal?:string}|null} [p.owner]
 * @param {{id:string,name:string}[]} p.partners  exactly two
 * @param {boolean} [p.previousStore]
 * @returns {{ok:boolean, reason?:string, shares?:Array}}
 */
export function computeSplit({ kind, usdt, inr = 0, pkrRate = 0, owner = null, partners = [], previousStore = false }) {
  const total = r6(usdt);
  if (!Array.isArray(partners) || partners.length !== 2) return { ok: false, reason: 'partners' };
  if (!(total > 0)) return { ok: false, reason: 'usdt' };

  const [p1, p2] = partners.map((p) => ({ id: String(p.id), name: p.name }));
  const ownerId = owner ? String(owner.id) : null;
  const ownerIsPartner = !!owner && (ownerId === p1.id || ownerId === p2.id);
  const ownerIsMember = !!owner && owner.role === 'member' && !ownerIsPartner;

  const shares = [];
  const push = (person, role, label, amount) =>
    shares.push({ userId: person.id, name: person.name, role, label, pct: pctOf(amount, total), amountUSDT: r6(amount) });

  // The last partner always receives the remainder so the shares add up to the total exactly.
  const finish = (lastPartner, label) => {
    const used = shares.reduce((s, x) => s + x.amountUSDT, 0);
    push(lastPartner, 'partner', label, r6(total - used));
    return { ok: true, shares };
  };

  if (kind === 'seller_withdrawal' && previousStore) {
    push(p1, 'partner', 'Previous-store seller (50%)', total * 0.5);
    return finish(p2, 'Previous-store seller (50%)');
  }

  if (ownerIsPartner) {
    const own = ownerId === p1.id ? p1 : p2;
    const other = ownerId === p1.id ? p2 : p1;
    push(own, 'partner', 'Own seller (75%)', total * 0.75);
    return finish(other, 'Partner share (25%)');
  }

  if (ownerIsMember) {
    const member = { id: ownerId, name: owner.name };
    const isPkrDeal = owner.deal !== 'inr_50';

    if (kind === 'deposit' && isPkrDeal) {
      if (!(Number(inr) > 0) || !(Number(pkrRate) > 0)) return { ok: false, reason: 'pkr_rate' };
      // 1 INR deposited = 1 PKR for the member, paid in USDT at that day's rate.
      const memberUsdt = Math.min(total, Number(inr) / Number(pkrRate));
      push(member, 'member', `1:1 PKR (Rs ${Number(inr).toLocaleString('en-US')} @ ${pkrRate})`, memberUsdt);
      const rest = total - shares[0].amountUSDT;
      push(p1, 'partner', 'Partner share (half of rest)', rest * 0.5);
      return finish(p2, 'Partner share (half of rest)');
    }

    push(member, 'member', 'Member share (50%)', total * 0.5);
    push(p1, 'partner', 'Partner share (25%)', total * 0.25);
    return finish(p2, 'Partner share (25%)');
  }

  push(p1, 'partner', 'Unassigned seller (50%)', total * 0.5);
  return finish(p2, 'Unassigned seller (50%)');
}

/**
 * Milestone bonus for a member. No money moves on Binance: the member's wallet goes UP by the
 * bonus and the two partners pay for it 50 / 50 out of their own wallets.
 * The first share is the member's credit; the partner shares are costs.
 *
 * @param {object} p
 * @param {number} p.usdt  bonus value in USDT (PKR bonus / that day's PKR rate)
 * @param {{id:string,name:string}} p.member
 * @param {{id:string,name:string}[]} p.partners  exactly two
 */
export function computeBonusSplit({ usdt, member, partners = [] }) {
  const total = r6(usdt);
  if (!Array.isArray(partners) || partners.length !== 2) return { ok: false, reason: 'partners' };
  if (!member || !member.id) return { ok: false, reason: 'member' };
  if (!(total > 0)) return { ok: false, reason: 'bonus_rate' };

  const half = r6(total / 2);
  return {
    ok: true,
    shares: [
      { userId: String(member.id), name: member.name, role: 'member', label: 'Milestone bonus', pct: 100, amountUSDT: total },
      { userId: String(partners[0].id), name: partners[0].name, role: 'partner', label: 'Bonus cost (50%)', pct: 50, amountUSDT: half },
      { userId: String(partners[1].id), name: partners[1].name, role: 'partner', label: 'Bonus cost (50%)', pct: 50, amountUSDT: r6(total - half) },
    ],
  };
}
