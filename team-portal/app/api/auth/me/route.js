import { NextResponse } from 'next/server';
import { getAuthSession, forgetSessions } from '@/lib/auth';
import Member from '@/lib/models/Member';
import SellerAssignment from '@/lib/models/SellerAssignment';
import { Seller } from '@/lib/models/SharedModels';
import RewardClaim from '@/lib/models/RewardClaim';
import mongoose from 'mongoose';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // "Who am I" only (the app asks this first when it opens): the session lookup above already
    // loaded the account, so answer straight away without the admin sync and wallet maths.
    if (new URL(req.url).searchParams.get('lite') === '1') {
      return NextResponse.json({ member: session, lite: true });
    }

    const member = await Member.findById(session._id).select('-passwordHash -plainPassword');
    if (!member) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    // ─── Live Sync for Ecommerce Admins (Name Change & Deletion Detection) ───
    if (member.role === 'admin' && member.ecommerceAdminId) {
      const db = mongoose.connection.db;
      const eAdmin = await db.collection('admins').findOne({ _id: member.ecommerceAdminId });

      if (!eAdmin) {
        // Admin was deleted from ecommerce website! Automatically remove from portal
        await Member.deleteOne({ _id: member._id });
        forgetSessions(member._id);
        return NextResponse.json({ message: 'Administrator account was deleted from platform.' }, { status: 401 });
      }

      // If name was changed on the ecommerce website, immediately update here
      if (eAdmin.name && eAdmin.name !== member.name) {
        member.name = eAdmin.name;
        await member.save();
        forgetSessions(member._id);
      }
    }

    // Recalculate live financial balances based on commission rules and pool shares (Admins & Members)
    // (a plain copy: the account's stored wallet shape would drop the numbers it does not know,
    // such as what is really available to a partner today)
    const out = member.toObject();
    try {
      const { getWalletBalancesMap, EMPTY_WALLET } = await import('@/lib/utils/wallet');
      const wallets = await getWalletBalancesMap();
      out.wallet = wallets.get(member._id.toString()) || { ...EMPTY_WALLET };
    } catch (wErr) {
      console.error('Wallet refresh error in auth/me:', wErr);
    }

    return NextResponse.json({ member: out });
  } catch (err) {
    console.error('Auth me error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
