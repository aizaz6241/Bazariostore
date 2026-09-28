import { BusinessTransaction } from '../models/BusinessFinance.js';
import Withdrawal from '../models/Withdrawal.js';
import Seller from '../models/Seller.js';
import { getSetting, setSetting } from '../models/System.js';

const SETTINGS_KEY = 'business_finance_settings';

export const DEFAULT_FINANCE_SETTINGS = {
  securityPin: '7860',
  defaultUsdtRate: 278.5,
  autoSyncBazario: true,
  reinvestmentReserveUsdt: 0, // Default 0; only reserved when partners explicitly decide to allocate
  partner1: {
    id: 'p1',
    name: 'Aizaz',
    sharePercent: 50,
    initialCapital: 0,
    phone: '',
    role: 'Partner',
  },
  partner2: {
    id: 'p2',
    name: 'Abdullah',
    sharePercent: 50,
    initialCapital: 0,
    phone: '',
    role: 'Partner',
  },
};

export async function getFinanceSettings() {
  try {
    const saved = await getSetting(SETTINGS_KEY, null);
    if (!saved) {
      await setSetting(SETTINGS_KEY, DEFAULT_FINANCE_SETTINGS);
      return DEFAULT_FINANCE_SETTINGS;
    }
    const settings = { ...DEFAULT_FINANCE_SETTINGS, ...saved };
    // Auto-normalize partner names for Aizaz & Abdullah
    if (!settings.partner2?.name || settings.partner2.name === 'Business Partner') {
      settings.partner2.name = 'Abdullah';
    }
    if (!settings.partner1?.name || settings.partner1.name === 'Aizaz (You)') {
      settings.partner1.name = 'Aizaz';
    }
    return settings;
  } catch (err) {
    console.error('[FinanceSettings Error]', err.message);
    return DEFAULT_FINANCE_SETTINGS;
  }
}

export async function updateFinanceSettings(partial) {
  const current = await getFinanceSettings();
  const updated = {
    ...current,
    ...partial,
    partner1: { ...current.partner1, ...(partial.partner1 || {}) },
    partner2: { ...current.partner2, ...(partial.partner2 || {}) },
  };

  // Enforce 100% total profit share split if both are edited
  if (partial.partner1?.sharePercent !== undefined && partial.partner2?.sharePercent === undefined) {
    updated.partner2.sharePercent = Math.max(0, 100 - Number(partial.partner1.sharePercent));
  } else if (partial.partner2?.sharePercent !== undefined && partial.partner1?.sharePercent === undefined) {
    updated.partner1.sharePercent = Math.max(0, 100 - Number(partial.partner2.sharePercent));
  }

  await setSetting(SETTINGS_KEY, updated);
  return updated;
}

// Hook to automatically sync an approved deposit or withdrawal from Bazario
export async function syncWithdrawalDocToFinance(withdrawalDoc, approvedAmount = null, sellerDoc = null) {
  try {
    const settings = await getFinanceSettings();
    if (!settings.autoSyncBazario) return null;

    const amt = approvedAmount !== null ? Number(approvedAmount) : Number(withdrawalDoc.amount || 0);
    if (!amt || amt <= 0) return null;

    const rate = Number(settings.defaultUsdtRate) || 278.5;
    const storeName = sellerDoc?.storeName || withdrawalDoc.storeName || 'Seller';
    const sellerId = sellerDoc?._id || withdrawalDoc.seller?._id || withdrawalDoc.seller;

    // Check if an entry for this withdrawal already exists
    let existing = await BusinessTransaction.findOne({
      'bazarioRef.withdrawalId': withdrawalDoc._id,
    });

    const isDeposit = withdrawalDoc.type === 'deposit';

    if (existing) {
      // Update existing record
      existing.amount = amt;
      existing.amountUSDT = amt;
      existing.amountPKR = Math.round(amt * (existing.exchangeRate || rate));
      existing.description = isDeposit
        ? `Seller Deposit: ${storeName} ($${amt} USDT)`
        : `Seller Payout: ${storeName} ($${amt} USDT)`;
      existing.bazarioRef.rawAmount = amt;
      existing.bazarioRef.storeName = storeName;
      await existing.save();
      return existing;
    }

    // Create new synced record
    const newTx = new BusinessTransaction({
      type: isDeposit ? 'income' : 'expense',
      category: isDeposit ? 'seller_deposit' : 'seller_withdrawal',
      amount: amt,
      currency: 'USDT',
      exchangeRate: rate,
      amountPKR: Math.round(amt * rate),
      amountUSDT: amt,
      walletSource: isDeposit ? 'binance_usdt' : 'binance_reserve',
      walletDestination: 'external',
      description: isDeposit
        ? `Seller Deposit: ${storeName} ($${amt} USDT)`
        : `Seller Payout: ${storeName} ($${amt} USDT)`,
      date: withdrawalDoc.processedAt || withdrawalDoc.createdAt || new Date(),
      bazarioRef: {
        type: withdrawalDoc.type,
        withdrawalId: withdrawalDoc._id,
        sellerId: sellerId || null,
        storeName: storeName,
        sellerName: sellerDoc?.ownerName || '',
        rawAmount: amt,
      },
      isAutoSynced: true,
      notes: withdrawalDoc.depositNote || withdrawalDoc.adminNote || (isDeposit ? 'Bazario verified seller deposit' : 'Bazario approved seller withdrawal payout'),
      createdBy: withdrawalDoc.processedBy || 'Bazario Auto-Sync',
    });

    await newTx.save();
    return newTx;
  } catch (err) {
    console.error('[syncWithdrawalDocToFinance Error]', err.message);
    return null;
  }
}

// 1-Click Sync for all historical approved deposits and withdrawals
export async function syncAllPastBazarioRecords() {
  const settings = await getFinanceSettings();
  const rate = Number(settings.defaultUsdtRate) || 278.5;

  const withdrawals = await Withdrawal.find({
    status: 'approved',
    type: { $in: ['deposit', 'withdrawal'] },
  }).populate('seller', 'storeName ownerName email');

  let syncedCount = 0;
  let skippedCount = 0;

  for (const doc of withdrawals) {
    const existing = await BusinessTransaction.findOne({
      'bazarioRef.withdrawalId': doc._id,
    });

    if (existing) {
      skippedCount++;
      continue;
    }

    const amt = doc.approvedAmount !== null && doc.approvedAmount !== undefined ? doc.approvedAmount : doc.amount;
    if (!amt || amt <= 0) continue;

    const isDeposit = doc.type === 'deposit';
    const storeName = doc.seller?.storeName || doc.storeName || 'Seller';

    await BusinessTransaction.create({
      type: isDeposit ? 'income' : 'expense',
      category: isDeposit ? 'seller_deposit' : 'seller_withdrawal',
      amount: amt,
      currency: 'USDT',
      exchangeRate: rate,
      amountPKR: Math.round(amt * rate),
      amountUSDT: amt,
      walletSource: isDeposit ? 'binance_usdt' : 'binance_reserve',
      walletDestination: 'external',
      description: isDeposit
        ? `Seller Deposit: ${storeName} ($${amt} USDT)`
        : `Seller Payout: ${storeName} ($${amt} USDT)`,
      date: doc.processedAt || doc.createdAt || new Date(),
      bazarioRef: {
        type: doc.type,
        withdrawalId: doc._id,
        sellerId: doc.seller?._id || null,
        storeName: storeName,
        sellerName: doc.seller?.ownerName || '',
        rawAmount: amt,
      },
      isAutoSynced: true,
      notes: doc.depositNote || doc.adminNote || 'Historical Bazario sync',
      createdBy: doc.processedBy || 'Bazario Historical Sync',
    });

    syncedCount++;
  }

  return {
    totalChecked: withdrawals.length,
    syncedCount,
    skippedCount,
  };
}

// Full Financial Overview & KPI Calculations
export async function calculateFinanceOverview(filterDate = {}) {
  const settings = await getFinanceSettings();
  const currentRate = Number(settings.defaultUsdtRate) || 278.5;

  // Fetch all transactions for lifetime asset/wallet balances
  const allTxs = await BusinessTransaction.find().sort({ date: 1 });

  // Filtered transactions for period P&L (profit, expenses, performance)
  let periodQuery = {};
  if (filterDate.from || filterDate.to) {
    periodQuery.date = {};
    if (filterDate.from) periodQuery.date.$gte = new Date(filterDate.from);
    if (filterDate.to) {
      const endOfDay = new Date(filterDate.to);
      endOfDay.setHours(23, 59, 59, 999);
      periodQuery.date.$lte = endOfDay;
    }
  }

  const periodTxs = Object.keys(periodQuery).length
    ? await BusinessTransaction.find(periodQuery).sort({ date: -1 })
    : allTxs;

  // ─── 1. BINANCE USDT WALLET LIFETIME CALCULATIONS ───
  let binanceUsdtTotalInflow = 0;      // Inflow directly to Binance (Deposits, USDT investments)
  let binanceUsdtConvertedToPkr = 0;   // USDT sold for PKR
  let binanceUsdtSellerPayouts = 0;    // USDT paid to sellers
  let binanceUsdtOtherOutflows = 0;    // Other USDT withdrawals/drawings
  let binanceReserveAllocated = 0;     // Allocated to Reinvestment pool
  let binanceReserveReleased = 0;

  // ─── 2. PKR LIQUID WALLET LIFETIME CALCULATIONS ───
  let pkrCashInflowFromBinance = 0;    // PKR received from Binance P2P
  let pkrCashInflowInvestments = 0;    // PKR invested by partners
  let pkrCashInflowDirect = 0;         // Direct PKR incomes
  let pkrExpenses = 0;                 // Office food, bills, rent, etc. paid in PKR
  let pkrDrawings = 0;                 // Partner drawings taken in PKR

  // ─── 3. PARTNER CAPITAL & DRAWINGS LIFETIME ───
  let partner1InvestedPKR = settings.partner1?.initialCapital || 0;
  let partner2InvestedPKR = settings.partner2?.initialCapital || 0;
  let partner1DrawingsPKR = 0;
  let partner2DrawingsPKR = 0;
  let partner1DrawingsUSDT = 0;
  let partner2DrawingsUSDT = 0;

  // ─── OFFICE EXPENSES (FOOD, CHAI, SUPPLIES/TABLE, BILLS) ───
  let totalOfficeExpensesPKR = 0;
  let aizazPaidExpensesPKR = 0;
  let abdullahPaidExpensesPKR = 0;

  // ─── 4. PERIOD REVENUE & EXPENSES (P&L) ───
  let periodRevenuePKR = 0;
  let periodRevenueUSDT = 0;
  let periodExpensePKR = 0;
  let periodExpenseUSDT = 0;
  let periodFoodExpensePKR = 0;
  let periodBillsExpensePKR = 0;
  let periodSellerPayoutsPKR = 0;
  let periodRentExpensePKR = 0;
  let periodSalariesExpensePKR = 0;
  let periodMiscExpensePKR = 0;

  const expenseBreakdown = {
    office_food: 0,
    chai_refreshment: 0,
    bills_electricity: 0,
    bills_internet: 0,
    office_rent: 0,
    office_supplies: 0,
    staff_salary: 0,
    marketing: 0,
    logistics: 0,
    seller_withdrawal: 0,
    reinvestment: 0,
    misc_expense: 0,
  };

  // Lifetime walkthrough to compute exact current balances
  for (const tx of allTxs) {
    const isPkr = tx.currency === 'PKR';
    const pkrAmt = tx.amountPKR || Math.round(tx.amount * (tx.exchangeRate || currentRate));
    const usdtAmt = tx.amountUSDT || (tx.amount / (tx.exchangeRate || currentRate));

    // Partner Capital Investments
    if (tx.type === 'investment') {
      const isP1 = tx.partnerName?.toLowerCase().includes('aizaz') || tx.partnerName === settings.partner1?.name;
      if (isP1) {
        partner1InvestedPKR += pkrAmt;
      } else {
        partner2InvestedPKR += pkrAmt;
      }

      if (tx.walletSource === 'binance_usdt') {
        binanceUsdtTotalInflow += usdtAmt;
      } else {
        pkrCashInflowInvestments += pkrAmt;
      }
    }

    // Partner Drawings / Personal Payouts
    else if (tx.type === 'drawing') {
      const isP1 = tx.partnerName?.toLowerCase().includes('aizaz') || tx.partnerName === settings.partner1?.name;
      if (isP1) {
        partner1DrawingsPKR += pkrAmt;
        partner1DrawingsUSDT += usdtAmt;
      } else {
        partner2DrawingsPKR += pkrAmt;
        partner2DrawingsUSDT += usdtAmt;
      }

      if (tx.walletSource === 'binance_usdt' || tx.walletSource === 'binance_reserve') {
        binanceUsdtOtherOutflows += usdtAmt;
      } else {
        pkrDrawings += pkrAmt;
      }
    }

    // Binance P2P / USDT to PKR Conversion
    else if (tx.type === 'conversion' || tx.category === 'binance_p2p_cashout') {
      binanceUsdtConvertedToPkr += usdtAmt;
      pkrCashInflowFromBinance += pkrAmt;
    }

    // Reinvestment Reserve Transfer
    else if (tx.type === 'reserve_transfer') {
      if (tx.walletDestination === 'binance_reserve') {
        binanceReserveAllocated += usdtAmt;
      } else if (tx.walletSource === 'binance_reserve') {
        binanceReserveReleased += usdtAmt;
      }
    }

    // General Business Incomes
    else if (tx.type === 'income') {
      if (tx.walletSource === 'binance_usdt' || tx.currency === 'USDT' || tx.currency === 'USD') {
        binanceUsdtTotalInflow += usdtAmt;
      } else {
        pkrCashInflowDirect += pkrAmt;
      }
    }

    // General Business Expenses
    else if (tx.type === 'expense') {
      if (tx.walletSource === 'binance_reserve') {
        binanceUsdtSellerPayouts += usdtAmt;
      } else if (tx.walletSource === 'binance_usdt') {
        binanceUsdtOtherOutflows += usdtAmt;
      } else if (tx.walletSource !== 'partner_pocket') {
        pkrExpenses += pkrAmt;
      }

      // Track Office Expenses (Food, Chai, Office Table/Supplies, Bills)
      if (tx.category !== 'seller_withdrawal' && tx.category !== 'reinvestment') {
        totalOfficeExpensesPKR += pkrAmt;
        const pb = (tx.paidBy || '').toLowerCase();
        if (pb.includes('aizaz')) {
          aizazPaidExpensesPKR += pkrAmt;
        } else if (pb.includes('abdullah')) {
          abdullahPaidExpensesPKR += pkrAmt;
        } else {
          // Default: split evenly 50/50
          aizazPaidExpensesPKR += pkrAmt * 0.5;
          abdullahPaidExpensesPKR += pkrAmt * 0.5;
        }
      }
    }
  }

  // Walkthrough period transactions for P&L analytics
  for (const tx of periodTxs) {
    const pkrAmt = tx.amountPKR || Math.round(tx.amount * (tx.exchangeRate || currentRate));
    const usdtAmt = tx.amountUSDT || (tx.amount / (tx.exchangeRate || currentRate));

    if (tx.type === 'income') {
      periodRevenuePKR += pkrAmt;
      periodRevenueUSDT += usdtAmt;
    } else if (tx.type === 'expense') {
      periodExpensePKR += pkrAmt;
      periodExpenseUSDT += usdtAmt;

      if (expenseBreakdown[tx.category] !== undefined) {
        expenseBreakdown[tx.category] += pkrAmt;
      } else {
        expenseBreakdown.misc_expense += pkrAmt;
      }

      if (tx.category === 'office_food' || tx.category === 'chai_refreshment') {
        periodFoodExpensePKR += pkrAmt;
      } else if (tx.category === 'bills_electricity' || tx.category === 'bills_internet') {
        periodBillsExpensePKR += pkrAmt;
      } else if (tx.category === 'seller_withdrawal') {
        periodSellerPayoutsPKR += pkrAmt;
      } else if (tx.category === 'office_rent') {
        periodRentExpensePKR += pkrAmt;
      } else if (tx.category === 'staff_salary') {
        periodSalariesExpensePKR += pkrAmt;
      } else {
        periodMiscExpensePKR += pkrAmt;
      }
    }
  }

  // ─── WALLET BALANCE SUMMARY ───
  // Current Binance USDT Holdings
  const currentBinanceUsdt = Math.max(
    0,
    binanceUsdtTotalInflow - binanceUsdtConvertedToPkr - binanceUsdtSellerPayouts - binanceUsdtOtherOutflows
  );

  // Dynamic Reinvestment Reserve calculation:
  // Initial target or allocated reserve minus seller payouts funded
  const baselineReserve = Number(settings.reinvestmentReserveUsdt || 0);
  const currentReinvestmentReserveUsdt = Math.min(
    currentBinanceUsdt,
    Math.max(0, baselineReserve + binanceReserveAllocated - binanceReserveReleased)
  );
  const availableSurplusUsdt = Math.max(0, currentBinanceUsdt - currentReinvestmentReserveUsdt);

  // Current PKR Liquid Funds (Office Cash Drawer + Bank Account)
  const currentPkrBalance = Math.max(
    0,
    pkrCashInflowFromBinance + pkrCashInflowInvestments + pkrCashInflowDirect - pkrExpenses - pkrDrawings
  );

  // ─── LIFETIME NET PROFIT ───
  // All-time income minus all-time expenses
  let allTimeIncomePKR = 0;
  let allTimeExpensePKR = 0;
  for (const tx of allTxs) {
    const pkr = tx.amountPKR || Math.round(tx.amount * (tx.exchangeRate || currentRate));
    if (tx.type === 'income') allTimeIncomePKR += pkr;
    if (tx.type === 'expense') allTimeExpensePKR += pkr;
  }
  const allTimeNetProfitPKR = allTimeIncomePKR - allTimeExpensePKR;

  // ─── PARTNER BALANCE / EQUITY LEDGER ───
  const p1Share = (Number(settings.partner1?.sharePercent) || 50) / 100;
  const p2Share = (Number(settings.partner2?.sharePercent) || 50) / 100;

  // Distributable Profit Pool (Binance USDT minus Reinvestment Reserve)
  const profitPoolUSDT = Math.max(0, currentBinanceUsdt - currentReinvestmentReserveUsdt);
  const profitPoolPKR = Math.round(profitPoolUSDT * currentRate);

  // 50/50 Split of Distributable Profit Pool
  const partner1ProfitShareUSDT = Number((profitPoolUSDT * p1Share).toFixed(2));
  const partner2ProfitShareUSDT = Number((profitPoolUSDT * p2Share).toFixed(2));

  // Remaining USDT sitting in Binance Wallet for each partner
  const partner1RemainingUSDT = Math.max(0, Number((partner1ProfitShareUSDT - partner1DrawingsUSDT).toFixed(2)));
  const partner2RemainingUSDT = Math.max(0, Number((partner2ProfitShareUSDT - partner2DrawingsUSDT).toFixed(2)));

  // Office Expenses (food, tea, table/furniture, bills) 50/50 breakdown
  const aizazOfficeExpenseSharePKR = Math.round(totalOfficeExpensesPKR * 0.5);
  const abdullahOfficeExpenseSharePKR = Math.round(totalOfficeExpensesPKR * 0.5);

  let officeExpenseSettlement = {
    status: 'settled',
    message: 'Hisaab Barabar: All expenses split evenly 50/50',
    differencePKR: 0,
  };

  const expDiff = Math.abs(aizazPaidExpensesPKR - abdullahPaidExpensesPKR) / 2;
  if (aizazPaidExpensesPKR > abdullahPaidExpensesPKR) {
    officeExpenseSettlement = {
      status: 'abdullah_owes',
      message: `Abdullah owes Aizaz ₨ ${Math.round(expDiff).toLocaleString('en-US')}`,
      differencePKR: Math.round(expDiff),
    };
  } else if (abdullahPaidExpensesPKR > aizazPaidExpensesPKR) {
    officeExpenseSettlement = {
      status: 'aizaz_owes',
      message: `Aizaz owes Abdullah ₨ ${Math.round(expDiff).toLocaleString('en-US')}`,
      differencePKR: Math.round(expDiff),
    };
  }

  const partner1ProfitSharePKR = Math.round(allTimeNetProfitPKR * p1Share);
  const partner2ProfitSharePKR = Math.round(allTimeNetProfitPKR * p2Share);

  // Net Balance = (Capital Invested + Profit Share - Personal Drawings)
  const partner1BalancePKR = partner1InvestedPKR + partner1ProfitSharePKR - partner1DrawingsPKR;
  const partner2BalancePKR = partner2InvestedPKR + partner2ProfitSharePKR - partner2DrawingsPKR;

  // Period Net Profit
  const periodNetProfitPKR = periodRevenuePKR - periodExpensePKR;
  const periodNetProfitUSDT = periodRevenueUSDT - periodExpenseUSDT;
  const profitMarginPercent = periodRevenuePKR > 0 ? Math.round((periodNetProfitPKR / periodRevenuePKR) * 100) : 0;

  // Monthly summary for trend chart (last 6-12 months)
  const monthlyMap = {};
  for (const tx of allTxs) {
    if (tx.type !== 'income' && tx.type !== 'expense') continue;
    const d = new Date(tx.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyMap[key]) {
      monthlyMap[key] = { month: key, revenue: 0, expense: 0, profit: 0 };
    }
    const pkr = tx.amountPKR || Math.round(tx.amount * (tx.exchangeRate || currentRate));
    if (tx.type === 'income') monthlyMap[key].revenue += pkr;
    if (tx.type === 'expense') monthlyMap[key].expense += pkr;
    monthlyMap[key].profit = monthlyMap[key].revenue - monthlyMap[key].expense;
  }
  const monthlyChart = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);

  return {
    exchangeRate: currentRate,
    wallets: {
      binance: {
        totalUSDT: Number(currentBinanceUsdt.toFixed(2)),
        reinvestmentReserveUSDT: Number(currentReinvestmentReserveUsdt.toFixed(2)),
        profitPoolUSDT: Number(profitPoolUSDT.toFixed(2)),
        profitPoolPKR,
        availableUSDT: Number(availableSurplusUsdt.toFixed(2)),
        totalPKREquivalent: Math.round(currentBinanceUsdt * currentRate),
        reservePKREquivalent: Math.round(currentReinvestmentReserveUsdt * currentRate),
        inflowTotalUSDT: Number(binanceUsdtTotalInflow.toFixed(2)),
        convertedToPKRUSDT: Number(binanceUsdtConvertedToPkr.toFixed(2)),
        sellerPayoutsUSDT: Number(binanceUsdtSellerPayouts.toFixed(2)),
      },
      pkr: {
        balancePKR: Math.round(currentPkrBalance),
        inflowFromBinancePKR: Math.round(pkrCashInflowFromBinance),
        expensesPaidPKR: Math.round(pkrExpenses),
        drawingsPaidPKR: Math.round(pkrDrawings),
      },
    },
    performance: {
      periodRevenuePKR,
      periodRevenueUSDT: Number(periodRevenueUSDT.toFixed(2)),
      periodExpensePKR,
      periodExpenseUSDT: Number(periodExpenseUSDT.toFixed(2)),
      periodNetProfitPKR,
      periodNetProfitUSDT: Number(periodNetProfitUSDT.toFixed(2)),
      profitMarginPercent,
      allTimeNetProfitPKR,
      allTimeIncomePKR,
      allTimeExpensePKR,
    },
    expenseBreakdown: {
      categories: expenseBreakdown,
      foodTotal: periodFoodExpensePKR,
      billsTotal: periodBillsExpensePKR,
      rentTotal: periodRentExpensePKR,
      salariesTotal: periodSalariesExpensePKR,
      sellerPayoutsTotal: periodSellerPayoutsPKR,
      miscTotal: periodMiscExpensePKR,
    },
    officeExpenses: {
      totalPKR: Math.round(totalOfficeExpensesPKR),
      aizazSharePKR: aizazOfficeExpenseSharePKR,
      abdullahSharePKR: abdullahOfficeExpenseSharePKR,
      aizazPaidPKR: Math.round(aizazPaidExpensesPKR),
      abdullahPaidPKR: Math.round(abdullahPaidExpensesPKR),
      settlement: officeExpenseSettlement,
    },
    partners: {
      partner1: {
        name: settings.partner1?.name || 'Aizaz',
        sharePercent: settings.partner1?.sharePercent || 50,
        profitShareUSDT: partner1ProfitShareUSDT,
        profitSharePKR: Math.round(partner1ProfitShareUSDT * currentRate),
        withdrawnUSDT: Number(partner1DrawingsUSDT.toFixed(2)),
        withdrawnPKR: Math.round(partner1DrawingsPKR),
        remainingInBinanceUSDT: partner1RemainingUSDT,
        remainingInBinancePKR: Math.round(partner1RemainingUSDT * currentRate),
        officeExpenseSharePKR: aizazOfficeExpenseSharePKR,
        officeExpensesPaidPKR: Math.round(aizazPaidExpensesPKR),
        investedPKR: Math.round(partner1InvestedPKR),
        netBalancePKR: Math.round(partner1BalancePKR),
        netBalanceUSDT: Number((partner1BalancePKR / currentRate).toFixed(2)),
      },
      partner2: {
        name: settings.partner2?.name || 'Abdullah',
        sharePercent: settings.partner2?.sharePercent || 50,
        profitShareUSDT: partner2ProfitShareUSDT,
        profitSharePKR: Math.round(partner2ProfitShareUSDT * currentRate),
        withdrawnUSDT: Number(partner2DrawingsUSDT.toFixed(2)),
        withdrawnPKR: Math.round(partner2DrawingsPKR),
        remainingInBinanceUSDT: partner2RemainingUSDT,
        remainingInBinancePKR: Math.round(partner2RemainingUSDT * currentRate),
        officeExpenseSharePKR: abdullahOfficeExpenseSharePKR,
        officeExpensesPaidPKR: Math.round(abdullahPaidExpensesPKR),
        investedPKR: Math.round(partner2InvestedPKR),
        netBalancePKR: Math.round(partner2BalancePKR),
        netBalanceUSDT: Number((partner2BalancePKR / currentRate).toFixed(2)),
      },
      totalCapitalInvestedPKR: Math.round(partner1InvestedPKR + partner2InvestedPKR),
    },
    monthlyChart,
    settings: {
      autoSyncBazario: settings.autoSyncBazario,
      reinvestmentReserveUsdt: settings.reinvestmentReserveUsdt,
    },
  };
}
