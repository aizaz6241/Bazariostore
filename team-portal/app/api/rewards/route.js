import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import RewardClaim from '@/lib/models/RewardClaim';
import SellerAssignment from '@/lib/models/SellerAssignment';
import { evaluateRewards, REWARD_RULES, DEVICE_GIFTS, deviceProgress } from '@/lib/utils/milestones';
import { buildLedger } from '@/lib/utils/finance';

export const dynamic = 'force-dynamic';

// GET /api/rewards — rewards (claims) + each seller's progress towards the next reward
export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Create any reward that became due (never twice). A failure here never blocks the page.
    let facts = [];
    try {
      facts = await evaluateRewards();
    } catch (e) {
      console.error('Reward check error:', e);
    }

    const isAdmin = session.role === 'admin';
    const filter = isAdmin ? {} : { memberId: session._id };

    const claims = await RewardClaim.find(filter)
      .populate('memberId', 'name username role avatar')
      .populate('sellerId', 'storeName ownerName')
      .sort({ createdAt: -1 })
      .lean();

    // For the admins: did the seller take money OUT after the reward period? (deposit, collect the
    // reward, withdraw again). Shown on the reward so it can be checked before approving.
    if (isAdmin) {
      try {
        const ledger = await buildLedger();
        const outs = (ledger.entries || []).filter((e) => e.kind === 'seller_withdrawal' && e.sellerId);
        for (const c of claims) {
          const sellerId = c.sellerId?._id ? String(c.sellerId._id) : c.sellerId ? String(c.sellerId) : '';
          if (!sellerId || !c.periodKey) continue;
          const from = new Date(`${c.periodKey}T00:00:00+05:30`);
          const list = outs.filter((e) => String(e.sellerId) === sellerId && new Date(e.date) >= from);
          c.withdrawnAfterUSD = Math.round(list.reduce((t, e) => t + Number(e.walletAmount || 0), 0) * 100) / 100;
          c.withdrawnAfterCount = list.length;
        }
      } catch (e) {
        console.error('Reward withdrawal check error:', e.message);
      }
    }

    // Progress: an admin sees every seller with an owner; a member only his own sellers
    let mine = null;
    if (!isAdmin) {
      const assignments = await SellerAssignment.find({ memberId: session._id, status: 'active' }).select('sellerId').lean();
      mine = new Set(assignments.map((a) => String(a.sellerId)));
    }
    const progress = (facts || [])
      .filter((f) => (mine ? mine.has(f.sellerId) : !!f.ownerId))
      .map((f) => ({
        sellerId: f.sellerId,
        storeName: f.storeName,
        ownerName: f.ownerName || '',
        realUSD: f.realUSD,
        wallet300Done: !!f.wallet300At || !!f.wallet300PaidBefore,
        todayINR: f.todayINR,
        weekINR: f.weekINR,
      }))
      .sort((a, b) => b.realUSD - a.realUSD);

    // Device gifts: each person's net (deposits − withdrawals of all his sellers) towards the gifts
    const devices = (deviceProgress() || []).filter((d) => isAdmin || String(d.ownerId) === String(session._id));

    return NextResponse.json({ claims, progress, devices, deviceGifts: DEVICE_GIFTS, rules: REWARD_RULES });
  } catch (err) {
    console.error('Fetch rewards error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
