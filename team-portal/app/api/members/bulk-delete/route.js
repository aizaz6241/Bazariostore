import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { removeMember } from '@/lib/utils/memberDelete';
import { flushFinanceAlertsSoon } from '@/lib/utils/financeLog';

export const dynamic = 'force-dynamic';

const MAX_AT_ONCE = 100;

// POST /api/members/bulk-delete { ids: [...] } — Admin deletes many members at once.
// Each one goes through exactly the same rules as a single delete (lib/utils/memberDelete.js),
// one after the other; one that cannot be deleted does not stop the others.
export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden. Admin access required.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map((v) => String(v || '')).filter(Boolean))];
    if (!ids.length) return NextResponse.json({ message: 'Select at least one member.' }, { status: 400 });
    if (ids.length > MAX_AT_ONCE) return NextResponse.json({ message: `You can delete up to ${MAX_AT_ONCE} members at once.` }, { status: 400 });

    const deleted = [];
    const failed = [];
    for (const id of ids) {
      try {
        deleted.push(await removeMember({ session, id }));
      } catch (e) {
        if (!e.expected) console.error('Bulk delete member error:', id, e);
        failed.push({ id, message: e.expected ? e.message : 'Something went wrong, try again.' });
      }
    }
    if (deleted.length) await flushFinanceAlertsSoon();

    const sellers = deleted.reduce((t, r) => t + (r.sellers || 0), 0);
    return NextResponse.json({
      message:
        `${deleted.length} ${deleted.length === 1 ? 'member' : 'members'} deleted` +
        (failed.length ? `, ${failed.length} not deleted` : '') +
        '.' +
        (sellers ? ` ${sellers} ${sellers === 1 ? 'store is' : 'stores are'} now unassigned — assign them again on the Sellers page.` : ''),
      deleted,
      failed,
    });
  } catch (err) {
    console.error('Bulk delete members error:', err);
    return NextResponse.json({ message: err.message || 'Internal server error' }, { status: 500 });
  }
}
