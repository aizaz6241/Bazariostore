import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getAuthSession } from '@/lib/auth';
import ChatReport from '@/lib/models/ChatReport';

export const dynamic = 'force-dynamic';

// PATCH /api/chat/reports/[id] { action: 'reviewed' | 'reopen' } — partners only
export async function PATCH(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session || session.role !== 'admin') return NextResponse.json({ message: 'Only admins can do this.' }, { status: 403 });
    if (!mongoose.Types.ObjectId.isValid(String(params.id))) return NextResponse.json({ message: 'Report not found' }, { status: 404 });
    const { action } = await req.json().catch(() => ({}));
    const set =
      action === 'reopen'
        ? { status: 'open', reviewedBy: null, reviewedByName: '', reviewedAt: null }
        : { status: 'reviewed', reviewedBy: session._id, reviewedByName: session.name, reviewedAt: new Date() };
    const done = await ChatReport.findByIdAndUpdate(params.id, { $set: set }, { new: true }).lean();
    if (!done) return NextResponse.json({ message: 'Report not found' }, { status: 404 });
    return NextResponse.json({ message: 'Saved', report: done });
  } catch (err) {
    console.error('Chat report update error:', err);
    return NextResponse.json({ message: err.message || 'Could not update the report' }, { status: 500 });
  }
}
