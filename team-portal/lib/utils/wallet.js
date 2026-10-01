import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import Member from '@/lib/models/Member';
import SellerAssignment from '@/lib/models/SellerAssignment';
import { Seller, Withdrawal } from '@/lib/models/SharedModels';
import RewardClaim from '@/lib/models/RewardClaim';
import WalletTransaction from '@/lib/models/WalletTransaction';

/**
 * Get date range boundary dates for period filtering
 */
export function getPeriodDateRange(period, customStart, customEnd) {
  const now = new Date();
  let from = null;
  let to = new Date();
  to.setHours(23, 59, 59, 999);

  switch (period) {
    case 'today': {
      from = new Date();
      from.setHours(0, 0, 0, 0);
      break;
    }
    case 'yesterday': {
      from = new Date();
      from.setDate(from.getDate() - 1);
      from.setHours(0, 0, 0, 0);
      to = new Date(from);
      to.setHours(23, 59, 59, 999);
      break;
    }
    case 'week': {
      from = new Date();
      const day = from.getDay();
      const diff = from.getDate() - day + (day === 0 ? -6 : 1); // Monday as start of week
      from.setDate(diff);
      from.setHours(0, 0, 0, 0);
      break;
    }
    case 'month': {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      from.setHours(0, 0, 0, 0);
      break;
    }
    case 'custom': {
      if (customStart) {
        from = new Date(customStart);
        from.setHours(0, 0, 0, 0);
      }
      if (customEnd) {
        to = new Date(customEnd);
        to.setHours(23, 59, 59, 999);
      }
      break;
    }
    case 'all':
    default: {
      from = null;
      to = null;
      break;
    }
  }

  return { from, to };
}

/**
 * Central Wallet & Financial Statement Engine
 * Supports 50% INR Split & 1:1 PKR Earning with Daily, Weekly, Monthly & Custom filtering
 */
export async function getWalletData({ userId, period = 'all', startDate = null, endDate = null }) {
  await connectDB();

  if (!userId || userId === 'undefined' || userId === 'null' || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Valid User ID is required');
  }

  const user = await Member.findById(userId).select('-passwordHash');
  if (!user) throw new Error('User not found');

  // Find all active admins to calculate admin distribution shares (e.g. 50-50 across active admins)
  const activeAdmins = await Member.find({ role: 'admin', active: true });
  const numAdmins = Math.max(1, activeAdmins.length);

  const { from, to } = getPeriodDateRange(period, startDate, endDate);

  const rawTransactions = [];

  if (user.role === 'member') {
    // ─── MEMBER COMMISSION & EARNINGS ───
    // Agreement is strictly between Admin and this Member:
    // 'inr_50' (50% INR to Member) or 'pkr_1to1' (1:1 PKR Fixed Rate)
    const memberCommissionLabel = user.commissionLabel || 'pkr_1to1';
    const is50PercentINR = memberCommissionLabel === 'inr_50';

    const assignments = await SellerAssignment.find({
      memberId: user._id,
      status: 'active',
    });

    const sellerIds = assignments.map((a) => a.sellerId);
    const sellers = await Seller.find({ _id: { $in: sellerIds } });
    const sellerMap = new Map();
    sellers.forEach((s) => sellerMap.set(s._id.toString(), s));

    // Batch fetch approved deposits for all assigned sellers
    const deposits = await Withdrawal.find({
      seller: { $in: sellerIds },
      type: 'deposit',
      status: { $in: ['approved', 'completed'] },
    }).sort({ createdAt: 1 });

    for (const dep of deposits) {
      const seller = sellerMap.get(dep.seller?.toString());
      const storeName = seller?.storeName || dep.storeName || 'Client Store';
      const depDate = dep.processedAt || dep.createdAt;
      const grossAmount = Number(dep.approvedAmount || dep.amount || 0);
      if (grossAmount <= 0) continue;

      if (is50PercentINR) {
        // Rule: 50% INR directly to Member
        const creditAmount = grossAmount * 0.5;
        rawTransactions.push({
          id: `dep_${dep._id}_mem`,
          type: 'credit',
          category: 'commission_inr_50',
          amount: creditAmount,
          currency: 'INR',
          sellerId: dep.seller,
          storeName,
          sourceRef: dep.depositRef || dep.transactionRef || dep._id.toString(),
          description: `50% INR Commission from ${storeName}`,
          details: `50% share of ₹${grossAmount.toLocaleString()} INR deposit (Member 50% INR Deal)`,
          date: new Date(depDate),
        });
      } else {
        // Rule: 1 INR = 1 PKR to Member (1:1 PKR Fixed Rate)
        const creditAmount = grossAmount; // 1:1 in PKR
        rawTransactions.push({
          id: `dep_${dep._id}_mem`,
          type: 'credit',
          category: 'commission_pkr_1to1',
          amount: creditAmount,
          currency: 'PKR',
          sellerId: dep.seller,
          storeName,
          sourceRef: dep.depositRef || dep.transactionRef || dep._id.toString(),
          description: `1:1 PKR Earning from ${storeName}`,
          details: `1 PKR per 1 INR of ₹${grossAmount.toLocaleString()} INR deposit (Member 1:1 PKR Deal)`,
          date: new Date(depDate),
        });
      }
    }

    // Fetch approved milestone bonuses in PKR
    const approvedClaims = await RewardClaim.find({
      memberId: user._id,
      status: 'approved',
    });

    for (const claim of approvedClaims) {
      const claimDate = claim.approvedAt || claim.createdAt;
      const amount = Number(claim.amountPKR || 0);
      if (amount <= 0) continue;

      rawTransactions.push({
        id: `claim_${claim._id}`,
        type: 'credit',
        category: 'bonus_reward',
        amount,
        currency: 'PKR',
        sellerId: null,
        storeName: 'Platform Milestone',
        sourceRef: claim.category || 'Reward Claim',
        description: `🎁 Milestone Bonus: ${claim.title}`,
        details: claim.adminFeedback || 'Approved milestone reward claim',
        date: new Date(claimDate),
      });
    }
  } else if (user.role === 'admin') {
    // ─── ADMIN WALLET & PROFIT DISTRIBUTION ───
    const allSellers = await Seller.find();
    const sellerMap = new Map();
    allSellers.forEach((s) => sellerMap.set(s._id.toString(), s));

    const allAssignments = await SellerAssignment.find({ status: 'active' });
    const assignmentMap = new Map();
    allAssignments.forEach((a) => assignmentMap.set(a.sellerId.toString(), a));

    const assignedMemberIds = allAssignments.map((a) => a.memberId);
    const assignedMembers = await Member.find({ _id: { $in: assignedMemberIds } }).select('name username commissionLabel');
    const memberMap = new Map();
    assignedMembers.forEach((m) => memberMap.set(m._id.toString(), m));

    // Batch fetch all approved deposits across all stores
    const deposits = await Withdrawal.find({
      type: 'deposit',
      status: { $in: ['approved', 'completed'] },
    }).sort({ createdAt: 1 });

    for (const dep of deposits) {
      const sellerIdStr = dep.seller?.toString();
      const seller = sellerMap.get(sellerIdStr);
      const storeName = seller?.storeName || dep.storeName || 'Client Store';
      const assignment = assignmentMap.get(sellerIdStr);
      const member = assignment ? memberMap.get(assignment.memberId?.toString()) : null;

      // The commission deal is on the member!
      const memberCommissionLabel = member?.commissionLabel || 'pkr_1to1';
      const is50PercentINR = memberCommissionLabel === 'inr_50';

      const depDate = dep.processedAt || dep.createdAt;
      const grossAmount = Number(dep.approvedAmount || dep.amount || 0);
      if (grossAmount <= 0) continue;

      if (is50PercentINR) {
        // Rule: Member took 50% INR, remaining 50% INR is split equally among active admins
        const adminPool = grossAmount * 0.5;
        const myShare = adminPool / numAdmins;

        rawTransactions.push({
          id: `dep_${dep._id}_adm`,
          type: 'credit',
          category: 'admin_share_inr_50',
          amount: myShare,
          currency: 'INR',
          sellerId: dep.seller,
          storeName,
          sourceRef: dep.depositRef || dep.transactionRef || dep._id.toString(),
          description: `Admin Pool Share (50% INR Split) from ${storeName}`,
          details: `1/${numAdmins} split of ₹${adminPool.toLocaleString()} INR (50% store deposit pool • Member: ${member?.name || 'Agent'})`,
          date: new Date(depDate),
        });
      } else {
        // Rule: 1:1 PKR store — Member took 1:1 PKR, full gross deposit INR profit split equally among active admins
        const myShare = grossAmount / numAdmins;

        rawTransactions.push({
          id: `dep_${dep._id}_adm`,
          type: 'credit',
          category: 'admin_share_pkr_1to1',
          amount: myShare,
          currency: 'INR',
          sellerId: dep.seller,
          storeName,
          sourceRef: dep.depositRef || dep.transactionRef || dep._id.toString(),
          description: `Admin Profit Share from ${storeName}`,
          details: `1/${numAdmins} split of ₹${grossAmount.toLocaleString()} INR store deposit (Member: ${member?.name || 'Agent'} 1:1 PKR deal)`,
          date: new Date(depDate),
        });
      }
    }
  }

  // ─── MANUAL PAYOUTS & DEBIT TRANSACTIONS ───
  const recordedTxs = await WalletTransaction.find({ userId: user._id }).sort({ date: 1 });
  for (const tx of recordedTxs) {
    rawTransactions.push({
      id: `manual_${tx._id}`,
      type: tx.type, // 'credit' or 'debit'
      category: tx.category,
      amount: tx.amount,
      currency: tx.currency,
      sellerId: tx.sellerId,
      storeName: tx.storeName || 'Operations Payout',
      sourceRef: tx.sourceRef || tx._id.toString(),
      description: tx.description,
      details: tx.note || (tx.type === 'debit' ? 'Payout withdrawal completed' : 'Wallet adjustment'),
      date: new Date(tx.date),
    });
  }

  // Calculate Cumulative All-Time Balances
  let totalEarnedINR = 0;
  let totalWithdrawnINR = 0;
  let totalEarnedPKR = 0;
  let totalWithdrawnPKR = 0;

  for (const t of rawTransactions) {
    if (t.currency === 'INR') {
      if (t.type === 'credit') totalEarnedINR += t.amount;
      if (t.type === 'debit') totalWithdrawnINR += t.amount;
    } else if (t.currency === 'PKR') {
      if (t.type === 'credit') totalEarnedPKR += t.amount;
      if (t.type === 'debit') totalWithdrawnPKR += t.amount;
    }
  }

  const balanceINR = Math.max(0, totalEarnedINR - totalWithdrawnINR);
  const balancePKR = Math.max(0, totalEarnedPKR - totalWithdrawnPKR);

  // Safely sync to User Document in MongoDB without triggering passwordHash validation errors
  try {
    await Member.updateOne(
      { _id: user._id },
      {
        $set: {
          'wallet.balanceINR': balanceINR,
          'wallet.balancePKR': balancePKR,
          'wallet.totalEarnedINR': totalEarnedINR,
          'wallet.totalWithdrawnINR': totalWithdrawnINR,
          'wallet.totalEarnedPKR': totalEarnedPKR,
          'wallet.totalWithdrawnPKR': totalWithdrawnPKR,
        },
      }
    );
  } catch (syncErr) {
    console.error('Wallet sync error:', syncErr);
  }

  // ─── FILTER BY SELECTED TIME PERIOD ───
  const filteredTransactions = rawTransactions.filter((t) => {
    if (!from && !to) return true;
    const txTime = t.date.getTime();
    if (from && txTime < from.getTime()) return false;
    if (to && txTime > to.getTime()) return false;
    return true;
  });

  // Calculate Period Inflow / Outflow / Net
  let periodEarnedINR = 0;
  let periodWithdrawnINR = 0;
  let periodEarnedPKR = 0;
  let periodWithdrawnPKR = 0;

  for (const t of filteredTransactions) {
    if (t.currency === 'INR') {
      if (t.type === 'credit') periodEarnedINR += t.amount;
      if (t.type === 'debit') periodWithdrawnINR += t.amount;
    } else if (t.currency === 'PKR') {
      if (t.type === 'credit') periodEarnedPKR += t.amount;
      if (t.type === 'debit') periodWithdrawnPKR += t.amount;
    }
  }

  // Sort descending by date (latest first)
  filteredTransactions.sort((a, b) => b.date.getTime() - a.date.getTime());

  return {
    user: {
      _id: user._id,
      name: user.name,
      username: user.username,
      role: user.role,
      commissionLabel: user.commissionLabel || 'pkr_1to1',
    },
    period,
    dateRange: {
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
    },
    balances: {
      balanceINR,
      balancePKR,
      totalEarnedINR,
      totalWithdrawnINR,
      totalEarnedPKR,
      totalWithdrawnPKR,
    },
    periodTotals: {
      earnedINR: periodEarnedINR,
      withdrawnINR: periodWithdrawnINR,
      netINR: periodEarnedINR - periodWithdrawnINR,
      earnedPKR: periodEarnedPKR,
      withdrawnPKR: periodWithdrawnPKR,
      netPKR: periodEarnedPKR - periodWithdrawnPKR,
      count: filteredTransactions.length,
    },
    transactions: filteredTransactions,
    activeAdminsCount: numAdmins,
  };
}

/**
 * Record a manual payout / withdrawal from wallet
 */
export async function recordWalletPayout({
  userId,
  amount,
  currency = 'PKR',
  note = '',
  processedBy = 'Admin',
}) {
  await connectDB();

  const numAmount = Number(amount);
  if (!numAmount || numAmount <= 0) {
    throw new Error('Valid payout amount is required');
  }

  const user = await Member.findById(userId);
  if (!user) throw new Error('Target user not found');

  const cleanCurrency = currency.toUpperCase() === 'INR' ? 'INR' : 'PKR';

  const transaction = await WalletTransaction.create({
    userId: user._id,
    userRole: user.role,
    type: 'debit',
    category: 'payout_withdrawal',
    amount: numAmount,
    currency: cleanCurrency,
    description: `Payout / Withdrawal of ${cleanCurrency === 'INR' ? '₹' : 'Rs'} ${numAmount.toLocaleString()} ${cleanCurrency}`,
    note: note.trim() || 'Official wallet withdrawal payout',
    processedBy,
    date: new Date(),
  });

  // Recompute wallet balances
  await getWalletData({ userId: user._id });

  return transaction;
}
