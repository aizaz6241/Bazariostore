import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { buildLedger } from '@/lib/utils/finance';

export const dynamic = 'force-dynamic';

// GET /api/finance — Binance USDT ledger (admins only)
export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ message: 'Admins only' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const ledger = await buildLedger({ fresh: searchParams.get('fresh') === '1' });
    return NextResponse.json(ledger);
  } catch (err) {
    console.error('Finance ledger error:', err);
    return NextResponse.json({ message: err.message || 'Failed to load finance ledger' }, { status: 500 });
  }
}
