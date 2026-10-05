import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { listFinanceLog } from '@/lib/utils/financeLog';

export const dynamic = 'force-dynamic';

// GET /api/finance/log?before=<ISO date>&limit=50 — finance activity log (admins only, read-only).
// There is no POST / PUT / DELETE here on purpose: the log cannot be edited.
export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ message: 'Admins only' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const out = await listFinanceLog({ before: searchParams.get('before'), limit: searchParams.get('limit') || 50 });
    return NextResponse.json(out);
  } catch (err) {
    console.error('Finance log error:', err);
    return NextResponse.json({ message: err.message || 'Failed to load the activity log' }, { status: 500 });
  }
}
