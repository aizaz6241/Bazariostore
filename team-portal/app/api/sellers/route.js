import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { Seller, Order, CLIENT_SELLER_FILTER } from '@/lib/models/SharedModels';
import SellerAssignment from '@/lib/models/SellerAssignment';
import Member from '@/lib/models/Member';
import { evaluateMemberMilestones } from '@/lib/utils/milestones';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const filter = searchParams.get('filter'); // 'all', 'assigned', 'unassigned'

    let sellersQuery = {};

    if (session.role === 'member') {
      // Member sees only their assigned sellers
      const myAssignments = await SellerAssignment.find({ memberId: session._id, status: 'active' });
      const assignedSellerIds = myAssignments.map((a) => a.sellerId);
      sellersQuery = { _id: { $in: assignedSellerIds } };

      // Trigger automatic milestone check for this member
      evaluateMemberMilestones(session._id).catch((err) =>
        console.error('Milestone evaluation background error:', err)
      );
    }

    // Only real client stores are listed; test / demo seller accounts are hidden.
    const sellers = await Seller.find({ ...sellersQuery, ...CLIENT_SELLER_FILTER }).select('-kycDocuments').sort({ createdAt: -1 }).limit(500);

    // Fetch active assignments for these sellers
    const sellerIds = sellers.map((s) => s._id);
    const assignments = await SellerAssignment.find({
      sellerId: { $in: sellerIds },
      status: 'active',
    }).populate('memberId', 'name username role');

    const assignmentMap = new Map();
    assignments.forEach((a) => {
      assignmentMap.set(a.sellerId.toString(), a);
    });

    // Pending orders for every listed seller in ONE query (was one query per seller)
    const pendingAgg = sellerIds.length
      ? await Order.aggregate([
          { $match: { seller: { $in: sellerIds }, status: { $in: ['pending', 'processing', 'unfulfilled', 'payment_pending'] } } },
          { $group: { _id: '$seller', n: { $sum: 1 } } },
        ])
      : [];
    const pendingBySeller = new Map(pendingAgg.map((o) => [String(o._id), o.n]));

    const enrichedSellers = await Promise.all(
      sellers.map(async (s) => {
        const assignment = assignmentMap.get(s._id.toString());
        const pendingOrders = pendingBySeller.get(s._id.toString()) || 0;

        const totalDeposited = Number(s.wallet?.totalDeposited || 0);
        const totalWithdrawn = Number(s.wallet?.totalWithdrawn || 0);
        const netRemaining = totalDeposited - totalWithdrawn;

        return {
          _id: s._id,
          storeName: s.storeName,
          ownerName: s.ownerName,
          email: s.email,
          phone: s.phone || '',
          status: s.status,
          createdAt: s.createdAt,
          commissionLabel: s.commissionLabel || assignment?.commissionLabel || 'pkr_1to1',
          wallet: {
            balance: s.wallet?.balance || 0,
            totalDeposited,
            totalWithdrawn,
            netRemaining,
            pendingDeposit: s.wallet?.pendingDeposit || 0,
            pendingWithdrawal: s.wallet?.pendingWithdrawal || 0,
          },
          accountHealth: {
            score: s.accountHealth?.score ?? 100,
            status: s.accountHealth?.status || 'healthy',
          },
          pendingOrdersCount: pendingOrders,
          assignment: assignment
            ? {
                _id: assignment._id,
                member: assignment.memberId,
                assignedAt: assignment.createdAt,
                commissionLabel: assignment.commissionLabel || s.commissionLabel || 'pkr_1to1',
                privateNotes: assignment.privateNotes || {},
              }
            : null,
        };
      })
    );

    return NextResponse.json({ sellers: enrichedSellers });
  } catch (err) {
    console.error('Fetch sellers error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
