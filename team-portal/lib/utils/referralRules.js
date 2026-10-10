/**
 * Referral rules (pure, no database). Agreed 10 Oct 2026:
 *  - only between 1:1 PKR members: the referrer AND the new member are 1:1 members
 *  - never a partner (admin), never yourself
 *  - 1% to 20% (half percents allowed), set once when the member is created, never changed
 */
export const REFERRAL_MIN = 1;
export const REFERRAL_MAX = 20;

/**
 * @param {{ deal:string, referrer:object|null, pct:any, newMemberId?:string }} p
 * @returns {{ ok:boolean, reason?:string, pct?:number }}
 */
export function checkReferral({ deal, referrer, pct, newMemberId = '' }) {
  if (!referrer) return { ok: true, pct: 0 }; // no referrer: nothing to check
  if ((deal || 'pkr_1to1') !== 'pkr_1to1') return { ok: false, reason: 'A referral is only for 1:1 PKR members.' };
  if (referrer.role !== 'member') return { ok: false, reason: 'A partner cannot be a referrer.' };
  if (referrer.active === false) return { ok: false, reason: 'The referrer’s account is switched off.' };
  if ((referrer.commissionLabel || 'pkr_1to1') !== 'pkr_1to1') return { ok: false, reason: 'The referrer must be a 1:1 PKR member (50% members cannot refer).' };
  if (newMemberId && String(referrer._id || referrer.id) === String(newMemberId)) return { ok: false, reason: 'A member cannot refer himself.' };
  const n = Number(pct);
  if (!Number.isFinite(n) || n < REFERRAL_MIN || n > REFERRAL_MAX) return { ok: false, reason: `Commission must be between ${REFERRAL_MIN}% and ${REFERRAL_MAX}%.` };
  if (Math.round(n * 2) !== n * 2) return { ok: false, reason: 'Commission can only be a whole or half percent (e.g. 5 or 2.5).' };
  return { ok: true, pct: n };
}
