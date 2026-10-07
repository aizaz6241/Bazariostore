import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { buildLedger } from '@/lib/utils/finance';

export const dynamic = 'force-dynamic';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * GET /api/calendar — the deposits calendar on the partners' dashboard.
 *
 * A short list of every real seller deposit of the finance ledger (it only READS the ledger):
 *   counted  -> the real USDT received on Binance
 *   waiting  -> approved, but the real USDT has not been entered / divided yet
 * and of the real USDT that left Binance (`outs`): payouts and seller withdrawals.
 * The screen groups them into its own calendar days, like the Analytics screen does.
 */
export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ message: 'Partners only' }, { status: 403 });

    const ledger = await buildLedger();
    const deposits = [];
    const row = (e, counted) => ({
      id: String(e.id),
      t: new Date(e.date).getTime(),
      store: e.storeName || 'Store',
      member: e.owner?.name || '',
      usdt: counted ? num(e.usdt) : 0,
      inr: num(e.inr),
      wallet: num(e.walletAmount),
      helping: num(e.helping),
      counted,
    });

    for (const e of ledger.entries || []) {
      if (e.kind === 'deposit') deposits.push(row(e, true));
    }
    for (const e of ledger.pending || []) {
      if (e.kind !== 'deposit') continue;
      // real money only: a credit that is entirely "helping amount" brought nothing in
      const realPart = num(e.walletAmount) - num(e.helping);
      if (!(num(e.usdt) > 0) && !(realPart > 0.004)) continue;
      deposits.push(row(e, false));
    }
    deposits.sort((a, b) => a.t - b.t);

    // Real USDT that LEFT Binance: payouts taken by a member / partner, and seller withdrawals
    const roleOf = new Map((ledger.wallets || []).map((w) => [String(w.userId), w.role]));
    const outs = [];
    for (const p of ledger.payouts || []) {
      outs.push({
        id: `payout_${p.id}`,
        t: new Date(p.date).getTime(),
        kind: 'payout',
        name: p.name || 'Unknown',
        role: roleOf.get(String(p.userId)) || '',
        usdt: num(p.amountUSDT),
        note: p.note || '',
      });
    }
    for (const e of ledger.entries || []) {
      if (e.kind !== 'seller_withdrawal') continue;
      outs.push({ id: `seller_${e.id}`, t: new Date(e.date).getTime(), kind: 'seller', store: e.storeName || 'Store', member: e.owner?.name || '', usdt: num(e.usdt), inr: num(e.inr) });
    }
    outs.sort((a, b) => a.t - b.t);

    // Milestone bonuses given to members: paid by the two partners' wallets, so the Binance total
    // does not change, but it is money a member received that day
    const bonuses = [];
    for (const e of ledger.entries || []) {
      if (e.kind !== 'bonus') continue;
      bonuses.push({ id: `bonus_${e.id}`, t: new Date(e.date).getTime(), member: e.owner?.name || 'Member', title: e.storeName || 'Milestone bonus', usdt: num(e.usdt), pkr: num(e.amountPKR), pkrRate: num(e.pkrRate) });
    }
    bonuses.sort((a, b) => a.t - b.t);

    return NextResponse.json({ deposits, outs, bonuses });
  } catch (err) {
    console.error('Deposits calendar error:', err);
    return NextResponse.json({ message: err.message || 'Could not load the calendar' }, { status: 500 });
  }
}
