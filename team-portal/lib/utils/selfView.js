import Member from '@/lib/models/Member';

/**
 * What the signed-in person's own account looks like when it is sent to his phone / browser.
 *
 * Referral privacy:
 *   - A member never gets to know who brought him or at what %: referredBy / referralPct /
 *     referralSetAt are taken out for everyone except the partners (admins).
 *   - `hasReferrals` tells the app whether to show the "My Members" section at all: a member sees it
 *     only after he has brought at least one member; a partner sees "Referrals" only once at least one
 *     referral exists in the team.
 *
 * @param {object} member  mongoose document or plain object (passwords already removed)
 * @returns {Promise<object>} plain object
 */
export async function selfView(member) {
  if (!member) return member;
  const out = typeof member.toObject === 'function' ? member.toObject() : { ...member };
  delete out.passwordHash;
  delete out.plainPassword;

  const isAdmin = out.role === 'admin';
  let hasReferrals = false;
  try {
    hasReferrals = isAdmin
      ? !!(await Member.exists({ referredBy: { $ne: null } }))
      : !!(await Member.exists({ referredBy: out._id }));
  } catch {
    hasReferrals = false;
  }

  if (!isAdmin) {
    delete out.referredBy;
    delete out.referralPct;
    delete out.referralSetAt;
  }
  out.hasReferrals = hasReferrals;
  return out;
}
