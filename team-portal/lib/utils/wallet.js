import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import Member from '@/lib/models/Member';
import WalletTransaction from '@/lib/models/WalletTransaction';
import { buildLedger, invalidateLedger, FINANCE_START } from '@/lib/utils/finance';
import { r2 } from '@/lib/utils/financeSplit';

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
 * Wallet statement for one person, read from the USDT finance ledger (lib/utils/finance.js).
 *
 * USDT wallet (the real one):
 *   + share of every seller deposit (real Binance USDT)
 *   - share of every seller withdrawal (50 / 25 / 25, or 75 / 25 for a partner's own seller)
 *   - payouts already taken
 *   The balance may go below zero; it settles from the next deposits.
 *
 * Milestone bonuses are part of the USDT wallet: the member is credited (PKR bonus converted
 * at that day's rate) and the two partners are charged 50 / 50.
 */
export async function getWalletData({ userId, period = 'all', startDate = null, endDate = null }) {
  await connectDB();

  if (!userId || userId === 'undefined' || userId === 'null' || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Valid User ID is required');
  }

  const user = await Member.findById(userId).select('-passwordHash');
  if (!user) throw new Error('User not found');

  const uid = user._id.toString();
  const ledger = await buildLedger();
  const { from, to } = getPeriodDateRange(period, startDate, endDate);

  const rawTransactions = [];
  let totalClientDepositsINR = 0;
  let totalClientDepositsUSDT = 0;
  let totalClientWithdrawalsUSDT = 0;

  let earnedUSDT = 0;
  let sellerWithdrawUSDT = 0;
  let payoutUSDT = 0;
  let bonusUSDT = 0;
  let bonusCostUSDT = 0;
  let totalEarnedPKR = 0; // bonus value in PKR, for reference only

  // ─── Shares of real seller deposits and seller withdrawals ───
  for (const e of ledger.entries) {
    const share = e.shares.find((s) => String(s.userId) === uid);
    if (!share) continue;

    if (e.kind === 'bonus') {
      const isMine = share.role === 'member';
      if (isMine) {
        bonusUSDT += share.amountUSDT;
        totalEarnedPKR += e.amountPKR;
      } else {
        bonusCostUSDT += share.amountUSDT;
      }
      rawTransactions.push({
        id: `bonus_${e.id}_${uid}`,
        type: isMine ? 'credit' : 'debit',
        category: isMine ? 'bonus_reward' : 'bonus_cost',
        amount: share.amountUSDT,
        currency: 'USDT',
        amountUSDT: share.amountUSDT,
        sellerId: null,
        storeName: 'Platform Milestone',
        sourceRef: e.ref || e.id,
        description: isMine
          ? `🎁 Milestone Bonus: ${e.storeName}`
          : `Bonus cost 50%: ${e.storeName} (${e.owner ? e.owner.name : 'member'})`,
        details: `Rs ${e.amountPKR.toLocaleString('en-US')} PKR @ ${e.pkrRate} = ₮${e.usdt.toFixed(2)} USDT${isMine ? '' : ' • paid 50 / 50 by the partners'}`,
        date: new Date(e.date),
      });
      continue;
    }

    const isDeposit = e.kind === 'deposit';
    const pctText = `${Number(share.pct.toFixed(2))}%`;

    if (isDeposit) {
      earnedUSDT += share.amountUSDT;
      totalClientDepositsINR += e.inr;
      totalClientDepositsUSDT += e.usdt;
    } else {
      sellerWithdrawUSDT += share.amountUSDT;
      totalClientWithdrawalsUSDT += e.usdt;
    }

    rawTransactions.push({
      id: `${isDeposit ? 'dep' : 'wth'}_${e.id}_${uid}`,
      type: isDeposit ? 'credit' : 'debit',
      category: isDeposit ? 'deposit_share' : 'seller_withdrawal_share',
      amount: share.amountUSDT,
      currency: 'USDT',
      amountUSDT: share.amountUSDT,
      sellerId: e.sellerId,
      storeName: e.storeName,
      sourceRef: e.ref || e.id,
      description: isDeposit
        ? `Deposit share ${pctText} from ${e.storeName}`
        : `Seller withdrawal share ${pctText}: ${e.storeName}`,
      details: isDeposit
        ? `${share.label} of ₮${e.usdt.toFixed(2)} USDT received on Binance${e.inr > 0 ? ` (₹${e.inr.toLocaleString('en-US')} INR @ ${e.rate})` : ''}`
        : `${share.label} of ₮${e.usdt.toFixed(2)} USDT paid to the seller from Binance`,
      date: new Date(e.date),
    });
  }

  // ─── USDT payouts already taken ───
  for (const p of ledger.payouts) {
    if (p.userId !== uid) continue;
    payoutUSDT += p.amountUSDT;
    rawTransactions.push({
      id: `manual_${p.id}`,
      type: 'debit',
      category: 'payout_withdrawal',
      amount: p.amountUSDT,
      currency: 'USDT',
      amountUSDT: p.amountUSDT,
      sellerId: null,
      storeName: 'Operations Payout',
      sourceRef: p.id,
      description: p.description || `Payout of ₮${p.amountUSDT.toFixed(2)} USDT`,
      details: p.note || 'Payout withdrawal completed',
      date: new Date(p.date),
    });
  }

  // ─── Balances ───
  const totalEarnedUSDT = r2(earnedUSDT + bonusUSDT);
  const totalSellerWithdrawUSDT = r2(sellerWithdrawUSDT);
  const totalPayoutUSDT = r2(payoutUSDT);
  const totalBonusUSDT = r2(bonusUSDT);
  const totalBonusCostUSDT = r2(bonusCostUSDT);
  const totalWithdrawnUSDT = r2(sellerWithdrawUSDT + bonusCostUSDT + payoutUSDT);
  const balanceUSDT = r2(earnedUSDT + bonusUSDT - bonusCostUSDT - sellerWithdrawUSDT - payoutUSDT); // can be negative
  const totalWithdrawnPKR = 0;
  const balancePKR = 0; // bonuses are paid in USDT now; PKR is shown for reference only

  try {
    await Member.updateOne(
      { _id: user._id },
      {
        $set: {
          'wallet.balancePKR': balancePKR,
          'wallet.totalEarnedPKR': totalEarnedPKR,
          'wallet.totalWithdrawnPKR': totalWithdrawnPKR,
        },
      }
    );
  } catch (syncErr) {
    console.error('Wallet sync error:', syncErr);
  }

  // ─── Filter by selected time period ───
  const filteredTransactions = rawTransactions.filter((t) => {
    if (!from && !to) return true;
    const txTime = t.date.getTime();
    if (from && txTime < from.getTime()) return false;
    if (to && txTime > to.getTime()) return false;
    return true;
  });

  let periodEarnedUSDT = 0;
  let periodWithdrawnUSDT = 0;
  let periodEarnedPKR = 0;
  let periodWithdrawnPKR = 0;

  for (const t of filteredTransactions) {
    if (t.currency === 'USDT') {
      if (t.type === 'credit') periodEarnedUSDT += t.amount;
      if (t.type === 'debit') periodWithdrawnUSDT += t.amount;
    } else if (t.currency === 'PKR') {
      if (t.type === 'credit') periodEarnedPKR += t.amount;
      if (t.type === 'debit') periodWithdrawnPKR += t.amount;
    }
  }

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
      totalEarnedUSDT,
      totalWithdrawnUSDT,
      totalSellerWithdrawUSDT,
      totalPayoutUSDT,
      totalBonusUSDT,
      totalBonusCostUSDT,
      balancePKR,
      totalEarnedPKR,
      totalWithdrawnPKR,
      // INR is no longer a wallet: everything is settled in real Binance USDT.
      balanceINR: 0,
      totalEarnedINR: 0,
      totalWithdrawnINR: 0,
      totalClientDepositsINR: r2(totalClientDepositsINR),
      totalClientDepositsUSDT: r2(totalClientDepositsUSDT),
      totalClientWithdrawalsINR: 0,
      totalClientWithdrawalsUSDT: r2(totalClientWithdrawalsUSDT),
    },
    periodTotals: {
      earnedUSDT: r2(periodEarnedUSDT),
      withdrawnUSDT: r2(periodWithdrawnUSDT),
      netUSDT: r2(periodEarnedUSDT - periodWithdrawnUSDT),
      earnedINR: 0,
      withdrawnINR: 0,
      netINR: 0,
      earnedPKR: periodEarnedPKR,
      withdrawnPKR: periodWithdrawnPKR,
      netPKR: periodEarnedPKR - periodWithdrawnPKR,
      periodClientWithdrawalsINR: 0,
      periodClientWithdrawalsUSDT: 0,
      count: filteredTransactions.length,
    },
    financeStart: FINANCE_START.toISOString(),
    transactions: filteredTransactions,
    activeAdminsCount: ledger.partners.length,
  };
}

/**
 * Record a payout taken from a wallet.
 * Always real Binance USDT paid to the member / partner (it reduces the Binance balance).
 */
export async function recordWalletPayout({
  userId,
  amount,
  currency = 'USDT',
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

  const cleanCurrency = (currency || 'USDT').toUpperCase();
  if (cleanCurrency !== 'USDT') {
    throw new Error('Payouts are recorded in USDT (Binance) only');
  }

  // A payout can never be more than what the wallet holds.
  invalidateLedger();
  const currentWallet = await getWalletData({ userId: user._id });
  const balances = currentWallet.balances || {};

  const available = balances.balanceUSDT || 0;
  if (numAmount > available) {
    throw new Error(`Insufficient USDT balance. Requested: ₮${numAmount.toLocaleString()} USDT, Available: ₮${available.toLocaleString()} USDT`);
  }

  const transaction = await WalletTransaction.create({
    userId: user._id,
    userRole: user.role,
    type: 'debit',
    category: 'payout_withdrawal',
    amount: numAmount,
    amountUSDT: numAmount,
    currency: cleanCurrency,
    description: `Payout / Withdrawal of ₮ ${numAmount.toLocaleString()} USDT`,
    note: note.trim() || 'Official wallet withdrawal payout',
    processedBy,
    date: new Date(),
  });

  invalidateLedger();
  await getWalletData({ userId: user._id });

  return transaction;
}
