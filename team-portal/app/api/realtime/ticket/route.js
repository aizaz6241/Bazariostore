import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAuthSession } from '@/lib/auth';
import RealtimeTicket from '@/lib/models/RealtimeTicket';

export const dynamic = 'force-dynamic';

// Where the realtime channel lives: the store server (it can keep connections open, this app on
// Vercel cannot). Set REALTIME_URL to change it, or to "off" to switch realtime off; the pages
// then check for news on their own, as before.
const DEFAULT_REALTIME_URL = 'https://bazariostore.onrender.com';
const TICKET_TTL_MS = 2 * 60 * 1000;

// POST /api/realtime/ticket — a short-lived pass for the signed-in user to open the channel
export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const url = String(process.env.REALTIME_URL || DEFAULT_REALTIME_URL).trim().replace(/\/+$/, '');
    if (!url || url.toLowerCase() === 'off') {
      return NextResponse.json({ enabled: false }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const ticket = crypto.randomBytes(32).toString('hex');
    await RealtimeTicket.create({
      _id: crypto.createHash('sha256').update(ticket).digest('hex'),
      memberId: session._id,
      role: session.role,
      expiresAt: new Date(Date.now() + TICKET_TTL_MS),
    });

    return NextResponse.json(
      { enabled: true, url, ticket, ttl: Math.round(TICKET_TTL_MS / 1000) },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('Realtime ticket error:', err);
    return NextResponse.json({ message: 'Could not open the live channel' }, { status: 500 });
  }
}
