import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { completeProof } from '@/lib/utils/paymentProofs';

export const dynamic = 'force-dynamic';

// POST /api/proofs/[id] — a partner adds (or corrects) the real USDT, its Binance screenshot and the INR screenshot
export async function POST(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ message: 'Partners only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const proof = await completeProof({
      session,
      id: params.id,
      usdtAmount: body.usdtAmount,
      inrAmount: body.inrAmount,
      screenshot: body.screenshot,
      usdtScreenshot: body.usdtScreenshot,
      note: body.note,
    });
    return NextResponse.json({ proof });
  } catch (err) {
    console.error('Payment proof save error:', err);
    return NextResponse.json({ message: err.message || 'Could not save the proof' }, { status: 400 });
  }
}
