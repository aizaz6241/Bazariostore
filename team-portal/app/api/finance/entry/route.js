import mongoose from 'mongoose';
import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { buildLedger } from '@/lib/utils/finance';
import RewardClaim from '@/lib/models/RewardClaim';
import { submitAction, snapEntry } from '@/lib/utils/approvals';
import { saveNeedsApproval, bonusNeedsApproval } from '@/lib/utils/approvalRules';

export const dynamic = 'force-dynamic';

const has = (v) => v !== undefined && v !== null && v !== '';

/**
 * POST /api/finance/entry — everything an admin can do to one ledger entry.
 *
 * Done at once (and written to the activity log):
 *   - entering the real USDT of a deposit / seller withdrawal for the first time
 *   - bringing a "no real money" entry back
 *   - entering the rate of a bonus that the OTHER partner approved
 *
 * Needs the other partner's approval (nothing changes until then):
 *   - "no real money" / "do not count"
 *   - changing an amount that is already counted
 *   - dividing an entry again
 *   - adding or deleting a manual entry
 *   - fixing a deposit that was added to the wrong seller (move it / reverse it)
 *   - counting a bonus that the same person approved
 */
export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ message: 'Admins only' }, { status: 403 });

    const body = await req.json();
    const reply = async (out) => {
      const ledger = out.ledger || (await buildLedger({ fresh: true }));
      return NextResponse.json({ ...ledger, notice: out.pending ? out.message : '', pendingApproval: out.pending === true });
    };

    // ── Manual entry: add ──
    if (body.action === 'create') {
      const payload = {
        kind: body.entryKind,
        sellerId: body.sellerId,
        ownerId: body.ownerId,
        inrAmount: body.inrAmount,
        usdtAmount: body.usdtAmount,
        pkrRate: body.pkrRate,
        date: body.date,
        note: body.note,
      };
      if (!['deposit', 'seller_withdrawal'].includes(payload.kind)) throw new Error('Choose deposit or seller withdrawal');
      if (!payload.sellerId || !mongoose.Types.ObjectId.isValid(payload.sellerId)) throw new Error('Choose a seller');
      if (!(Number(payload.usdtAmount) > 0)) throw new Error('Enter the real USDT amount (greater than 0)');
      return reply(await submitAction({ session, action: 'manual_create', payload, gated: true }));
    }

    const { id, kind, action } = body;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) throw new Error('Valid transaction id is required');

    // ── Manual entry: delete ──
    if (kind === 'manual') {
      if (action !== 'delete') throw new Error('Manual entries can only be deleted');
      return reply(await submitAction({ session, action: 'manual_delete', payload: { id }, gated: true }));
    }

    // ── Deposit added to the wrong seller: move it to the correct one, or reverse it ──
    if (action === 'fix_deposit') {
      const mode = body.mode === 'reverse' ? 'reverse' : 'move';
      const payload = { id, kind: 'deposit', mode, note: String(body.note || '').trim().slice(0, 300) };
      if (mode === 'move') {
        if (!body.toSellerId || !mongoose.Types.ObjectId.isValid(body.toSellerId)) throw new Error('Choose the correct seller');
        payload.toSellerId = String(body.toSellerId);
        if (has(body.pkrRate)) {
          const rate = Number(body.pkrRate);
          if (!Number.isFinite(rate) || rate <= 0) throw new Error('PKR rate is not valid');
          payload.pkrRate = rate;
        }
      }
      return reply(await submitAction({ session, action: 'fix_deposit', payload, gated: true }));
    }

    if (action === 'skip' || action === 'resplit') {
      return reply(await submitAction({ session, action, payload: { id, kind }, gated: true }));
    }
    if (action === 'unskip') {
      return reply(await submitAction({ session, action: 'unskip', payload: { id, kind }, gated: false }));
    }
    if (action !== 'save') throw new Error('Unknown action');

    const ledger = await buildLedger({ fresh: true });
    const counted = ledger.entries.some((e) => e.id === String(id));

    // ── Milestone bonus: only the PKR rate of that day ──
    if (kind === 'bonus') {
      const rate = Number(body.pkrRate);
      if (!Number.isFinite(rate) || rate <= 0) throw new Error('Enter the PKR rate of that day (PKR per 1 USDT)');
      const claim = await RewardClaim.findById(id).select('approvedBy finPkrRate status').lean();
      if (!claim) throw new Error('Bonus not found');
      const payload = { id, kind, pkrRate: rate };
      if (counted) {
        if (!saveNeedsApproval({ counted, current: { pkrRate: claim.finPkrRate }, next: { pkrRate: rate } })) return reply({ ledger });
        return reply(await submitAction({ session, action: 'edit_usdt', payload, gated: true }));
      }
      const gated = bonusNeedsApproval({ approvedById: claim.approvedBy, saverId: session._id });
      return reply(await submitAction({ session, action: gated ? 'count_bonus' : 'set_usdt', payload, gated }));
    }

    // ── Deposit / seller withdrawal: real USDT (and INR / PKR rate) ──
    const usdt = Number(body.usdtAmount);
    if (!Number.isFinite(usdt) || usdt <= 0) throw new Error('Enter the real USDT amount (greater than 0)');
    const payload = { id, kind, usdtAmount: usdt };
    if (has(body.inrAmount)) payload.inrAmount = Number(body.inrAmount);
    if (has(body.pkrRate)) payload.pkrRate = Number(body.pkrRate);

    if (counted) {
      const current = await snapEntry(id, kind);
      if (!current) throw new Error('Transaction not found');
      if (!saveNeedsApproval({ counted, current, next: payload })) return reply({ ledger });
      return reply(await submitAction({ session, action: 'edit_usdt', payload, gated: true }));
    }
    return reply(await submitAction({ session, action: 'set_usdt', payload, gated: false }));
  } catch (err) {
    console.error('Finance entry error:', err);
    return NextResponse.json({ message: err.message || 'Failed to update entry' }, { status: 400 });
  }
}
