import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getAuthSession } from '@/lib/auth';
import { sellerAnalytics } from '@/lib/utils/sellerAnalytics';

export const dynamic = 'force-dynamic';

// GET /api/sellers/analytics?scope=mine|all[&sellerId=...]
//   mine -> the viewer's own sellers (members and partners)
//   all  -> every real client seller (partners only)
//   sellerId -> one seller in detail (a member only gets his own sellers)
export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get('scope') === 'all' && session.role === 'admin' ? 'all' : 'mine';
    const sellerId = searchParams.get('sellerId') || '';
    if (sellerId && !mongoose.Types.ObjectId.isValid(sellerId)) {
      return NextResponse.json({ message: 'Seller not found' }, { status: 404 });
    }
    const data = await sellerAnalytics({ viewer: session, scope, sellerId });
    if (sellerId && !data.seller) return NextResponse.json({ message: 'Seller not found' }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    console.error('Seller analytics error:', err);
    return NextResponse.json({ message: err.message || 'Could not load seller analytics' }, { status: 500 });
  }
}
