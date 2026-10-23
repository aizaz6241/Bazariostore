import { NextResponse } from 'next/server';
import { buildLedger } from '@/lib/utils/finance';
import { flushFinanceAlerts } from '@/lib/utils/financeLog';
import { syncPaymentProofs } from '@/lib/utils/paymentProofs';
import { takeTicket } from '@/lib/utils/portalTick';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// POST /api/live/tick — called by the store server when money changed (a deposit approved, a
// finance action on the admin panel…). Runs the checks an open portal page would run, so the
// "payment proof needed" push and the finance alerts go out even when no portal page is open.
// Only the server can call it (one-time ticket, see lib/utils/portalTick.js). Changes no money.
export async function POST(req) {
  try {
    const ok = await takeTicket(req.headers.get('x-portal-tick'));
    if (!ok) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const ledger = await buildLedger();
    const [proofs, alerts] = await Promise.allSettled([syncPaymentProofs(ledger), flushFinanceAlerts({ force: true })]);
    return NextResponse.json(
      { ok: true, proofs: proofs.status, alerts: alerts.status === 'fulfilled' ? alerts.value : 0 },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[portal-tick] failed:', err.message);
    return NextResponse.json({ message: 'Tick failed' }, { status: 500 });
  }
}
