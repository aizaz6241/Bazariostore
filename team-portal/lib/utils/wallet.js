import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import Member from '@/lib/models/Member';
import SellerAssignment from '@/lib/models/SellerAssignment';
import { Seller, Withdrawal } from '@/lib/models/SharedModels';
import RewardClaim from '@/lib/models/RewardClaim';
import WalletTransaction from '@/lib/models/WalletTransaction';
import {
  toUSDT,
  inrToUSDT,
  pkrToUSDT,
  usdtToINR,
  usdtToPKR,
  USDT_INR_RATE,
  USDT_PKR_RATE,
} from '@/lib/utils/currency';

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
 * Central Multi-Currency Wallet & Financial Distribution Engine
 *
 * Distribution Architecture:
 * 1. 2 Platform Admins:
 *    - Store assigned to Admin A:
 *      * Admin A (Managing Handler): 50% INR personal commission.
 *      * Platform Pool: Remaining 50% INR, split 50-50 between BOTH Admins (25% each).
 *      * Net: Admin A gets 75% INR (50% + 25%), Admin B gets 25% INR.
 *    - Store assigned to 50% INR Member:
 *      * Member gets 50% INR.
 *      * Admins split remaining 50% INR equally (25% to each Admin).
 *    - Store assigned to 1:1 PKR Member:
 *      * Member gets 1:1 in PKR (100,000 PKR per 100,000 INR deposit).
 *      * Admins split full 100% deposit INR equally (50% to each Admin).
 *    - Unassigned Store:
 *      * Admins split full 100% deposit INR equally (50% to each Admin).
 *
 * 2. Automatic USDT Conversion:
 *    - Inflows and Outflows operate in USDT via Binance.
 *    - All distributions are automatically converted to USDT (Binance P2P benchmark).
 *    - Both USDT (Hero currency) and native INR/PKR are displayed across statements.
 *
 * 3. Store Activity in Ledger:
 *    - Assigned stores' deposits AND client withdrawals are tracked in the statement.
 */
export async function getWalletData({ userId, period = 'all', startDate = null, endDate = null }) {
  await connectDB();

  if (!userId || userId === 'undefined' || userId === 'null' || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Valid User ID is required');
  }

  const user = await Member.findById(userId).select('-passwordHash');
  if (!user) throw new Error('User not found');

  // Find all active admins (Platform has 2 active admins: Super Admin & Steve)
  const activeAdmins = await Member.find({ role: 'admin', active: true });
  const numAdmins = Math.max(1, activeAdmins.length);

  const { from, to } = getPeriodDateRange(period, startDate, endDate);

  const rawTransactions = [];

  let totalClientDepositsINR = 0;
  let totalClientWithdrawalsINR = 0;

  if (user.role === 'member') {
    // ─── MEMBER COMMISSIONS & CLIENT ACTIVITY ───
    const memberCommissionLabel = user.commissionLabel || 'pkr_1to1';
    const is50PercentINR = memberCommissionLabel === 'inr_50';

    const assignments = await SellerAssignment.find({
      memberId: user._id,
      status: 'active',
    });

    const sellerIds = assignments.map((a) => a.sellerId);
    const sellers = await Seller.find({ _id: { $in: sellerIds } }).select('-kycDocuments');
    const sellerMap = new Map();
    sellers.forEach((s) => sellerMap.set(s._id.toString(), s));

    // 1. Batch fetch approved deposits for assigned sellers
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

      totalClientDepositsINR += grossAmount;

      if (is50PercentINR) {
        // Rule: 50% INR directly to Member
        const creditAmount = grossAmount * 0.5;
        const amountUSDT = inrToUSDT(creditAmount);

        rawTransactions.push({
          id: `dep_${dep._id}_mem`,
          type: 'credit',
          category: 'commission_inr_50',
          amount: creditAmount,
          currency: 'INR',
          amountUSDT,
          sellerId: dep.seller,
          storeName,
          sourceRef: dep.depositRef || dep.transactionRef || dep._id.toString(),
          description: `50% INR Commission from ${storeName}`,
          details: `50% share of ₹${grossAmount.toLocaleString()} INR store deposit • Converted: ₮${amountUSDT.toFixed(2)} USDT`,
          date: new Date(depDate),
        });
      } else {
        // Rule: 1 INR = 1 PKR to Member (1:1 PKR Fixed Rate)
        const creditAmount = grossAmount; // 1:1 in PKR
        const amountUSDT = pkrToUSDT(creditAmount);

        rawTransactions.push({
          id: `dep_${dep._id}_mem`,
          type: 'credit',
          category: 'commission_pkr_1to1',
          amount: creditAmount,
          currency: 'PKR',
          amountUSDT,
          sellerId: dep.seller,
          storeName,
          sourceRef: dep.depositRef || dep.transactionRef || dep._id.toString(),
          description: `1:1 PKR Earning from ${storeName}`,
          details: `1 PKR per 1 INR of ₹${grossAmount.toLocaleString()} INR deposit • Converted: ₮${amountUSDT.toFixed(2)} USDT`,
          date: new Date(depDate),
        });
      }
    }

    // 2. Batch fetch client withdrawals for assigned stores (Store activity visibility)
    const clientWithdrawals = await Withdrawal.find({
      seller: { $in: sellerIds },
      type: 'withdrawal',
    }).sort({ createdAt: 1 });

    for (const wth of clientWithdrawals) {
      const seller = sellerMap.get(wth.seller?.toString());
      const storeName = seller?.storeName || wth.storeName || 'Client Store';
      const wthDate = wth.processedAt || wth.createdAt;
      const wthAmount = Number(wth.approvedAmount || wth.amount || 0);
      if (wthAmount <= 0) continue;

      if (['approved', 'completed'].includes(wth.status)) {
        totalClientWithdrawalsINR += wthAmount;
      }

      const amountUSDT = inrToUSDT(wthAmount);

      rawTransactions.push({
        id: `wth_${wth._id}_mem_act`,
        type: 'activity',
        category: 'client_withdrawal',
        amount: wthAmount,
        currency: 'INR',
        amountUSDT,
        sellerId: wth.seller,
        storeName,
        sourceRef: wth.transactionRef || wth.depositRef || wth._id.toString(),
        description: `Client Withdrawal: ${storeName}`,
        details: `Client store withdrawal of ₹${wthAmount.toLocaleString()} INR (${wth.method || 'Bank/UPI'}) • Status: ${wth.status}`,
        status: wth.status,
        isClientActivity: true,
        date: new Date(wthDate),
      });
    }

    // 3. Fetch approved milestone bonuses in PKR
    const approvedClaims = await RewardClaim.find({
      memberId: user._id,
      status: 'approved',
    });

    for (const claim of approvedClaims) {
      const claimDate = claim.approvedAt || claim.createdAt;
      const amount = Number(claim.amountPKR || 0);
      if (amount <= 0) continue;

      const amountUSDT = pkrToUSDT(amount);

      rawTransactions.push({
        id: `claim_${claim._id}`,
        type: 'credit',
        category: 'bonus_reward',
        amount,
        currency: 'PKR',
        amountUSDT,
        sellerId: null,
        storeName: 'Platform Milestone',
        sourceRef: claim.category || 'Reward Claim',
        description: `🎁 Milestone Bonus: ${claim.title}`,
        details: `${claim.adminFeedback || 'Approved milestone reward claim'} • Converted: ₮${amountUSDT.toFixed(2)} USDT`,
        date: new Date(claimDate),
      });
    }
  } else if (user.role === 'admin') {
    // ─── ADMIN DISTRIBUTION, PERSONAL STORES & OVERALL ACTIVITY ───
    const allSellers = await Seller.find().select('-kycDocuments');
    const sellerMap = new Map();
    allSellers.forEach((s) => sellerMap.set(s._id.toString(), s));

    const allAssignments = await SellerAssignment.find({ status: 'active' });
    const assignmentMap = new Map();
    allAssignments.forEach((a) => assignmentMap.set(a.sellerId.toString(), a));

    const assignedMemberIds = allAssignments.map((a) => a.memberId);
    const assignedMembers = await Member.find({ _id: { $in: assignedMemberIds } }).select('name username role commissionLabel');
    const memberMap = new Map();
    assignedMembers.forEach((m) => memberMap.set(m._id.toString(), m));

    // Stores assigned specifically to this Admin
    const myAssignedSellerIds = new Set(
      allAssignments
        .filter((a) => a.memberId?.toString() === user._id.toString())
        .map((a) => a.sellerId.toString())
    );

    // 1. Batch fetch all approved deposits across all stores
    const deposits = await Withdrawal.find({
      type: 'deposit',
      status: { $in: ['approved', 'completed'] },
    }).sort({ createdAt: 1 });

    for (const dep of deposits) {
      const sellerIdStr = dep.seller?.toString();
      const seller = sellerMap.get(sellerIdStr);
      const storeName = seller?.storeName || dep.storeName || 'Client Store';
      const assignment = assignmentMap.get(sellerIdStr);
      const assignedUser = assignment ? memberMap.get(assignment.memberId?.toString()) : null;

      const depDate = dep.processedAt || dep.createdAt;
      const grossAmount = Number(dep.approvedAmount || dep.amount || 0);
      if (grossAmount <= 0) continue;

      totalClientDepositsINR += grossAmount;

      // Check whether this store belongs to an Admin or a Member
      if (assignedUser?.role === 'admin') {
        const isMyStore = assignedUser._id.toString() === user._id.toString();

        if (isMyStore) {
          // Rule: Store is assigned to THIS Admin!
          // 50% INR belongs directly to this Admin as managing handler share.
          // Remaining 50% INR is the platform pool, split 50-50 across both Admins (25% each).
          // Net result for this Admin: 50% + 25% = 75% INR.
          const personalHandlerShare = grossAmount * 0.5;
          const poolShare = (grossAmount * 0.5) / numAdmins;

          // Personal Handler Share Entry (50% INR)
          rawTransactions.push({
            id: `dep_${dep._id}_adm_handler`,
            type: 'credit',
            category: 'admin_personal_handler',
            amount: personalHandlerShare,
            currency: 'INR',
            amountUSDT: inrToUSDT(personalHandlerShare),
            sellerId: dep.seller,
            storeName,
            sourceRef: dep.depositRef || dep.transactionRef || dep._id.toString(),
            description: `Personal Handler Share (50% INR) from ${storeName}`,
            details: `50% direct managing handler share of ₹${grossAmount.toLocaleString()} INR deposit (Your Assigned Client Store)`,
            date: new Date(depDate),
          });

          // Admin Pool Share Entry (25% INR)
          rawTransactions.push({
            id: `dep_${dep._id}_adm_pool`,
            type: 'credit',
            category: 'admin_pool_share',
            amount: poolShare,
            currency: 'INR',
            amountUSDT: inrToUSDT(poolShare),
            sellerId: dep.seller,
            storeName,
            sourceRef: dep.depositRef || dep.transactionRef || dep._id.toString(),
            description: `Admin Pool Share (25% Split) from ${storeName}`,
            details: `1/${numAdmins} platform pool share of ₹${(grossAmount * 0.5).toLocaleString()} INR (50% remaining pool from your assigned store)`,
            date: new Date(depDate),
          });
        } else {
          // Rule: Store is assigned to the OTHER Admin!
          // Other Admin takes 50% handler share.
          // Remaining 50% INR is split 50-50 across both Admins (25% each).
          const poolShare = (grossAmount * 0.5) / numAdmins;

          rawTransactions.push({
            id: `dep_${dep._id}_adm_pool`,
            type: 'credit',
            category: 'admin_pool_share',
            amount: poolShare,
            currency: 'INR',
            amountUSDT: inrToUSDT(poolShare),
            sellerId: dep.seller,
            storeName,
            sourceRef: dep.depositRef || dep.transactionRef || dep._id.toString(),
            description: `Admin Pool Share (25% Split) from ${storeName}`,
            details: `1/${numAdmins} split of ₹${(grossAmount * 0.5).toLocaleString()} INR pool (Store managed by Admin: ${assignedUser.name})`,
            date: new Date(depDate),
          });
        }
      } else if (assignedUser && assignedUser.commissionLabel === 'inr_50') {
        // Rule: Assigned to a 50% INR Member.
        // Member took 50% INR. Remaining 50% INR is split 50-50 across both Admins (25% each).
        const adminPool = grossAmount * 0.5;
        const myShare = adminPool / numAdmins;

        rawTransactions.push({
          id: `dep_${dep._id}_adm_share_inr50`,
          type: 'credit',
          category: 'admin_share_inr_50',
          amount: myShare,
          currency: 'INR',
          amountUSDT: inrToUSDT(myShare),
          sellerId: dep.seller,
          storeName,
          sourceRef: dep.depositRef || dep.transactionRef || dep._id.toString(),
          description: `Admin Pool Share (50% INR Split) from ${storeName}`,
          details: `1/${numAdmins} split of ₹${adminPool.toLocaleString()} INR pool (Member: ${assignedUser.name} 50% INR Deal)`,
          date: new Date(depDate),
        });
      } else {
        // Rule: Assigned to a 1:1 PKR Member OR Unassigned Store.
        // 100% of deposit INR flows into the Platform Admin pool, split 50-50 across both Admins.
        const myShare = grossAmount / numAdmins;
        const is1to1Member = assignedUser && assignedUser.commissionLabel === 'pkr_1to1';

        rawTransactions.push({
          id: `dep_${dep._id}_adm_profit`,
          type: 'credit',
          category: 'admin_share_pkr_1to1',
          amount: myShare,
          currency: 'INR',
          amountUSDT: inrToUSDT(myShare),
          sellerId: dep.seller,
          storeName,
          sourceRef: dep.depositRef || dep.transactionRef || dep._id.toString(),
          description: `Admin Profit Share from ${storeName}`,
          details: is1to1Member
            ? `1/${numAdmins} split of ₹${grossAmount.toLocaleString()} INR deposit (Member: ${assignedUser.name} 1:1 PKR Deal)`
            : `1/${numAdmins} split of ₹${grossAmount.toLocaleString()} INR deposit (Unassigned Store)`,
          date: new Date(depDate),
        });
      }
    }

    // 2. Batch fetch client withdrawals across stores (Store operational activity visibility)
    const clientWithdrawals = await Withdrawal.find({
      type: 'withdrawal',
    }).sort({ createdAt: 1 });

    for (const wth of clientWithdrawals) {
      const sellerIdStr = wth.seller?.toString();
      const seller = sellerMap.get(sellerIdStr);
      const storeName = seller?.storeName || wth.storeName || 'Client Store';
      const wthDate = wth.processedAt || wth.createdAt;
      const wthAmount = Number(wth.approvedAmount || wth.amount || 0);
      if (wthAmount <= 0) continue;

      if (['approved', 'completed'].includes(wth.status)) {
        totalClientWithdrawalsINR += wthAmount;
      }

      const isMyStore = myAssignedSellerIds.has(sellerIdStr);
      const amountUSDT = inrToUSDT(wthAmount);

      rawTransactions.push({
        id: `wth_${wth._id}_adm_act`,
        type: 'activity',
        category: 'client_withdrawal',
        amount: wthAmount,
        currency: 'INR',
        amountUSDT,
        sellerId: wth.seller,
        storeName,
        sourceRef: wth.transactionRef || wth.depositRef || wth._id.toString(),
        description: `Client Withdrawal: ${storeName}${isMyStore ? ' (My Store)' : ''}`,
        details: `Store client payout of ₹${wthAmount.toLocaleString()} INR via ${wth.method || 'Bank/UPI'} • Status: ${wth.status}`,
        status: wth.status,
        isClientActivity: true,
        date: new Date(wthDate),
      });
    }
  }

  // ─── MANUAL PAYOUTS & DEBIT TRANSACTIONS ───
  const recordedTxs = await WalletTransaction.find({ userId: user._id }).sort({ date: 1 });
  for (const tx of recordedTxs) {
    const txAmount = Number(tx.amount || 0);
    const txUSDT = tx.amountUSDT || (tx.currency === 'USDT' ? txAmount : toUSDT(txAmount, tx.currency));

    rawTransactions.push({
      id: `manual_${tx._id}`,
      type: tx.type, // 'credit' or 'debit'
      category: tx.category,
      amount: txAmount,
      currency: tx.currency,
      amountUSDT: txUSDT,
      sellerId: tx.sellerId,
      storeName: tx.storeName || 'Operations Payout',
      sourceRef: tx.sourceRef || tx._id.toString(),
      description: tx.description,
      details: tx.note || (tx.type === 'debit' ? 'Payout withdrawal completed' : 'Wallet adjustment'),
      date: new Date(tx.date),
    });
  }

  // ─── CALCULATE CUMULATIVE ALL-TIME BALANCES ───
  let totalEarnedINR = 0;
  let totalWithdrawnINR = 0;
  let totalEarnedPKR = 0;
  let totalWithdrawnPKR = 0;
  let totalEarnedUSDTDirect = 0;
  let totalWithdrawnUSDTDirect = 0;

  for (const t of rawTransactions) {
    if (t.isClientActivity || t.type === 'activity') continue; // Skip operational activity from personal balance

    if (t.currency === 'INR') {
      if (t.type === 'credit') totalEarnedINR += t.amount;
      if (t.type === 'debit') totalWithdrawnINR += t.amount;
    } else if (t.currency === 'PKR') {
      if (t.type === 'credit') totalEarnedPKR += t.amount;
      if (t.type === 'debit') totalWithdrawnPKR += t.amount;
    } else if (t.currency === 'USDT') {
      if (t.type === 'credit') totalEarnedUSDTDirect += t.amount;
      if (t.type === 'debit') totalWithdrawnUSDTDirect += t.amount;
    }
  }

  const balanceINR = Math.max(0, totalEarnedINR - totalWithdrawnINR);
  const balancePKR = Math.max(0, totalEarnedPKR - totalWithdrawnPKR);

  // Convert all earned and available balances to USDT (Hero Currency)
  const balanceUSDT = Number(
    (inrToUSDT(balanceINR) + pkrToUSDT(balancePKR) + (totalEarnedUSDTDirect - totalWithdrawnUSDTDirect)).toFixed(2)
  );
  const totalEarnedUSDT = Number(
    (inrToUSDT(totalEarnedINR) + pkrToUSDT(totalEarnedPKR) + totalEarnedUSDTDirect).toFixed(2)
  );
  const totalWithdrawnUSDT = Number(
    (inrToUSDT(totalWithdrawnINR) + pkrToUSDT(totalWithdrawnPKR) + totalWithdrawnUSDTDirect).toFixed(2)
  );

  // Safely sync to User Document in MongoDB
  try {
    await Member.updateOne(
      { _id: user._id },
      {
        $set: {
          'wallet.balanceUSDT': balanceUSDT,
          'wallet.balanceINR': balanceINR,
          'wallet.balancePKR': balancePKR,
          'wallet.totalEarnedUSDT': totalEarnedUSDT,
          'wallet.totalEarnedINR': totalEarnedINR,
          'wallet.totalEarnedPKR': totalEarnedPKR,
          'wallet.totalWithdrawnUSDT': totalWithdrawnUSDT,
          'wallet.totalWithdrawnINR': totalWithdrawnINR,
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
  let periodClientDepositsINR = 0;
  let periodClientWithdrawalsINR = 0;

  for (const t of filteredTransactions) {
    if (t.isClientActivity || t.type === 'activity') {
      if (t.category === 'client_withdrawal' && ['approved', 'completed'].includes(t.status)) {
        periodClientWithdrawalsINR += t.amount;
      }
      continue;
    }

    if (t.currency === 'INR') {
      if (t.type === 'credit') {
        periodEarnedINR += t.amount;
        periodClientDepositsINR += t.amount;
      }
      if (t.type === 'debit') periodWithdrawnINR += t.amount;
    } else if (t.currency === 'PKR') {
      if (t.type === 'credit') periodEarnedPKR += t.amount;
      if (t.type === 'debit') periodWithdrawnPKR += t.amount;
    }
  }

  const periodEarnedUSDT = Number((inrToUSDT(periodEarnedINR) + pkrToUSDT(periodEarnedPKR)).toFixed(2));
  const periodWithdrawnUSDT = Number((inrToUSDT(periodWithdrawnINR) + pkrToUSDT(periodWithdrawnPKR)).toFixed(2));
  const periodNetUSDT = Number((periodEarnedUSDT - periodWithdrawnUSDT).toFixed(2));

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
      balanceUSDT,
      balanceINR,
      balancePKR,
      totalEarnedUSDT,
      totalEarnedINR,
      totalEarnedPKR,
      totalWithdrawnUSDT,
      totalWithdrawnINR,
      totalWithdrawnPKR,
      totalClientDepositsINR,
      totalClientWithdrawalsINR,
      totalClientDepositsUSDT: inrToUSDT(totalClientDepositsINR),
      totalClientWithdrawalsUSDT: inrToUSDT(totalClientWithdrawalsINR),
    },
    periodTotals: {
      earnedUSDT: periodEarnedUSDT,
      withdrawnUSDT: periodWithdrawnUSDT,
      netUSDT: periodNetUSDT,
      earnedINR: periodEarnedINR,
      withdrawnINR: periodWithdrawnINR,
      netINR: periodEarnedINR - periodWithdrawnINR,
      earnedPKR: periodEarnedPKR,
      withdrawnPKR: periodWithdrawnPKR,
      netPKR: periodEarnedPKR - periodWithdrawnPKR,
      periodClientWithdrawalsINR,
      periodClientWithdrawalsUSDT: inrToUSDT(periodClientWithdrawalsINR),
      count: filteredTransactions.length,
    },
    rates: {
      USDT_INR_RATE,
      USDT_PKR_RATE,
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

  const upperCurr = (currency || 'PKR').toUpperCase();
  const cleanCurrency = ['INR', 'PKR', 'USDT'].includes(upperCurr) ? upperCurr : 'PKR';

  let amountUSDT = 0;
  if (cleanCurrency === 'USDT') {
    amountUSDT = numAmount;
  } else if (cleanCurrency === 'INR') {
    amountUSDT = inrToUSDT(numAmount);
  } else {
    amountUSDT = pkrToUSDT(numAmount);
  }

  const transaction = await WalletTransaction.create({
    userId: user._id,
    userRole: user.role,
    type: 'debit',
    category: 'payout_withdrawal',
    amount: numAmount,
    amountUSDT,
    currency: cleanCurrency,
    description: `Payout / Withdrawal of ${cleanCurrency === 'USDT' ? '₮' : cleanCurrency === 'INR' ? '₹' : 'Rs'} ${numAmount.toLocaleString()} ${cleanCurrency}`,
    note: note.trim() || 'Official wallet withdrawal payout',
    processedBy,
    date: new Date(),
  });

  // Recompute wallet balances
  await getWalletData({ userId: user._id });

  return transaction;
}
