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

      if (body.ownerId) {
        try {
          const { sendPushToUser } = await import('@/lib/utils/push');
          sendPushToUser(body.ownerId, {
            title: `💰 Deposit / Finance Entry: ${body.entryKind === 'deposit' ? 'Deposit' : 'Record'}`,
            body: `An amount of Rs ${Number(body.inrAmount || 0).toLocaleString()} was recorded. Wallet balance updated.`,
            url: '/wallet',
            type: 'finance',
            sound: '/sounds/cash.wav',
            vibrate: [250, 100, 250, 100, 250],
          }).catch((e) => console.error('Finance entry push error:', e));
        } catch (pushErr) {
          console.error('Trigger finance push error:', pushErr);
        }
      }

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
