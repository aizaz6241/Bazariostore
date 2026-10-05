import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { buildLedger } from '@/lib/utils/finance';
import { getLiveVersion, hashOf } from '@/lib/utils/liveVersion';

export const dynamic = 'force-dynamic';

// GET /api/live — "has anything about the money changed?"
// Every open page asks this every few seconds and reloads its numbers when the answer changes.
// The reply is only a short code (no amounts, no names), so the signed token is checked without
// a database lookup to keep the call as light as possible.
export async function GET(req) {
  try {
    let token = null;
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.split(' ')[1];
    if (!token) {
      const match = (req.headers.get('cookie') || '').match(/portal_token=([^;]+)/);
      if (match) token = match[1];
    }
    const decoded = token ? verifyToken(token) : null;
    if (!decoded || !decoded.id) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    // The ledger comes from memory unless the database changed; if it did, this rebuilds it, so
    // the screens that reload right after get the new numbers immediately.
    const ledger = await buildLedger();
    const version = await getLiveVersion();

    return NextResponse.json(
      { v: hashOf([ledger.sig, version.stable]), at: Date.now() },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('Live version error:', err);
    return NextResponse.json({ message: 'Live check failed' }, { status: 500 });
  }
}
