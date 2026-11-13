import { getAuthSession } from '@/lib/auth';
import { ok, fail } from '@/lib/utils/routeHelpers';
import files from '@/lib/privateTools/createPrintFiles';

export const dynamic = 'force-dynamic';

/**
 * GET /api/private-tools/create-print — the Create / Print tool files, portal admins only.
 * Never a public file: members and logged-out visitors get 401 / 403.
 */
export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return fail('Unauthorized', 401);
    if (session.role !== 'admin') return fail('Admins only', 403);
    const res = ok({ files });
    res.headers.set('Cache-Control', 'private, no-store');
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return res;
  } catch (err) {
    console.error('[private-tools] create-print:', err?.message || err);
    return fail('Could not load the tool right now.', 500);
  }
}
