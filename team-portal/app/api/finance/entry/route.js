import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { updateFinanceEntry, createManualEntry } from '@/lib/utils/finance';

export const dynamic = 'force-dynamic';

// POST /api/finance/entry — admin enters the real Binance USDT for a deposit / seller withdrawal,
// marks it as "no real money", or asks for the split to be recalculated.
export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ message: 'Admins only' }, { status: 403 });

    const body = await req.json();

    if (body.action === 'create') {
      const created = await createManualEntry({
        kind: body.entryKind,
        sellerId: body.sellerId,
        ownerId: body.ownerId,
        inrAmount: body.inrAmount,
        usdtAmount: body.usdtAmount,
        pkrRate: body.pkrRate,
        date: body.date,
        note: body.note,
        by: session.name || session.username || '',
      });
      return NextResponse.json(created);
    }

    const ledger = await updateFinanceEntry({
      id: body.id,
      kind: body.kind,
      action: body.action,
      usdtAmount: body.usdtAmount,
      inrAmount: body.inrAmount,
      pkrRate: body.pkrRate,
      by: session.name || session.username || '',
    });
    return NextResponse.json(ledger);
  } catch (err) {
    console.error('Finance entry error:', err);
    return NextResponse.json({ message: err.message || 'Failed to update entry' }, { status: 400 });
  }
}
