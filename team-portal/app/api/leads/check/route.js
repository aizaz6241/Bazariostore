import { getAuthSession } from '@/lib/auth';
import Lead from '@/lib/models/Lead';
import { ok, fail, sid } from '@/lib/utils/routeHelpers';
import { phoneKey } from '@/lib/utils/phone';
import { checkRateLimit } from '@/lib/rateLimit';
import { duplicateNotice, findStoreByPhone, recordDuplicateAttempt } from '@/lib/utils/leads';

export const dynamic = 'force-dynamic';

/**
 * GET /api/leads/check?phone=...
 * "Can I contact this number?" — checked before messaging a seller.
 *   free      nobody has it: go ahead (and add it as your lead)
 *   mine      it is already your lead
 *   taken     another member has it: do not contact (members see no names)
 *   store     already a registered store
 */
export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return fail('Unauthorized', 401);

    const rl = checkRateLimit(`lead-check:${sid(session._id)}`, 240, 60 * 60 * 1000);
    if (!rl.allowed) return fail('Too many checks in the last hour. Please wait a little.', 429);

    const key = phoneKey(new URL(req.url).searchParams.get('phone'));
    if (!key) return fail('Type at least 7 digits of the number.');

    const lead = await Lead.findOne({ phoneKey: key }).select('-history').lean();
    if (lead) {
      const notice = duplicateNotice(lead, session);
      // a member looking up someone else's lead is written in that lead's history (admins see it)
      if (!notice.mine && session.role !== 'admin') {
        const full = await Lead.findById(lead._id).select('history memberId').lean();
        await recordDuplicateAttempt(full, { _id: session._id, name: `${session.name} (checked the number)`, role: session.role });
      }
      return ok({ result: notice.mine ? 'mine' : 'taken', ...notice });
    }

    const store = await findStoreByPhone(key);
    if (store) {
      return ok({
        result: 'store',
        message:
          session.role === 'admin'
            ? `Already a registered store: “${store.storeName}” (${store.status}).`
            : 'This seller already has a store on Bazario. Please do not contact them.',
      });
    }

    return ok({ result: 'free', message: 'Nobody has this number yet. You can contact this seller — add it as your lead first so it is reserved for you.' });
  } catch (err) {
    console.error('Lead check error:', err);
    return fail(err.message, 500);
  }
}
