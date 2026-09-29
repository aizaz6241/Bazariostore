import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { BusinessTransaction } from '../models/BusinessFinance.js';
import {
  getFinanceSettings,
  updateFinanceSettings,
  calculateFinanceOverview,
  syncAllPastBazarioRecords,
  syncWithdrawalDocToFinance,
} from '../services/businessFinance.service.js';

const router = Router();

// Middleware: Authenticate Partner Security PIN / Session
async function authPartner(req, res, next) {
  try {
    const pinHeader = req.headers['x-partner-pin'] || req.query?.pin;
    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    const settings = await getFinanceSettings();
    const correctPin = settings.securityPin || '7860';

    // 1. Direct PIN matching
    if (pinHeader && String(pinHeader).trim() === String(correctPin).trim()) {
      req.partnerAuthenticated = true;
      return next();
    }

    // 2. Verified JWT Session Token
    if (bearerToken) {
      try {
        const decoded = jwt.verify(bearerToken, process.env.JWT_SECRET);
        if (decoded.t === 'partner_finance' || decoded.role === 'super_admin') {
          req.partnerAuthenticated = true;
          return next();
        }
      } catch (_) {}
    }

    return res.status(401).json({
      ok: false,
      message: 'Access restricted. Please provide valid Partner Security PIN.',
      requiresPin: true,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
}

// POST /api/business-finance/verify-pin — Verify Partner PIN and generate session token
router.post('/verify-pin', async (req, res) => {
  try {
    const { pin } = req.body || {};
    if (!pin) {
      return res.status(400).json({ ok: false, message: 'Security PIN is required' });
    }

    const settings = await getFinanceSettings();
    const correctPin = settings.securityPin || '7860';

    if (String(pin).trim() !== String(correctPin).trim()) {
      return res.status(401).json({ ok: false, message: 'Incorrect Security PIN. Access denied.' });
    }

    // Sign a secure 30-day partner session token
    const token = jwt.sign(
      { t: 'partner_finance', verifiedAt: Date.now() },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      ok: true,
      token,
      message: 'Partner Security Access Granted',
      settings: {
        partner1: settings.partner1,
        partner2: settings.partner2,
        defaultUsdtRate: settings.defaultUsdtRate,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// POST /api/business-finance/update-pin — Change Security PIN
router.post('/update-pin', authPartner, async (req, res) => {
  try {
    const { currentPin, newPin } = req.body || {};
    const cleanNewPin = String(newPin || '').trim();
    if (!cleanNewPin || cleanNewPin.length < 4) {
      return res.status(400).json({ ok: false, message: 'New PIN must be at least 4 digits' });
    }

    const settings = await getFinanceSettings();
    const activePin = String(settings.securityPin || '7860').trim();

    if (currentPin && String(currentPin).trim() !== activePin) {
      return res.status(400).json({ ok: false, message: 'Current PIN is incorrect' });
    }

    await updateFinanceSettings({ securityPin: cleanNewPin });

    // Generate fresh session token
    const token = jwt.sign(
      { t: 'partner_finance', verifiedAt: Date.now() },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      ok: true,
      message: 'Partner Security PIN successfully updated!',
      token,
      newPin: cleanNewPin,
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// GET /api/business-finance/overview — Executive Dashboard KPI & Balances
router.get('/overview', authPartner, async (req, res) => {
  try {
    const { from, to } = req.query;
    const overview = await calculateFinanceOverview({ from, to });
    res.json({ ok: true, ...overview });
  } catch (err) {
    console.error('[Finance Overview Error]', err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

// GET /api/business-finance/transactions — Filtered Transactions Ledger
router.get('/transactions', authPartner, async (req, res) => {
  try {
    const { type, category, currency, search, from, to, limit = 200 } = req.query;
    const filter = {};

    if (type && type !== 'all') filter.type = type;
    if (category && category !== 'all') filter.category = category;
    if (currency && currency !== 'all') filter.currency = currency;

    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) {
        const endOfDay = new Date(to);
        endOfDay.setHours(23, 59, 59, 999);
        filter.date.$lte = endOfDay;
      }
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { description: { $regex: q, $options: 'i' } },
        { notes: { $regex: q, $options: 'i' } },
        { partnerName: { $regex: q, $options: 'i' } },
        { 'bazarioRef.storeName': { $regex: q, $options: 'i' } },
      ];
    }

    const transactions = await BusinessTransaction.find(filter)
      .sort({ createdAt: -1, date: -1 })
      .limit(Number(limit));

    res.json({ ok: true, count: transactions.length, transactions });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// POST /api/business-finance/transactions — Create new manual transaction
router.post('/transactions', authPartner, async (req, res) => {
  try {
    const {
      type,
      category,
      amount,
      currency = 'PKR',
      exchangeRate,
      walletSource,
      walletDestination,
      partnerName,
      paidBy = 'both_50_50',
      description,
      date,
      notes,
    } = req.body || {};

    const amt = Number(amount);
    if (!amt || amt <= 0) {
      return res.status(400).json({ ok: false, message: 'Valid positive amount is required' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ ok: false, message: 'Description is required' });
    }

    const settings = await getFinanceSettings();
    const rate = Number(exchangeRate) > 0 ? Number(exchangeRate) : (Number(settings.defaultUsdtRate) || 278.5);

    const isUsdt = currency === 'USDT' || currency === 'USD';
    const amountPKR = isUsdt ? Math.round(amt * rate) : amt;
    const amountUSDT = isUsdt ? amt : Number((amt / rate).toFixed(2));

    // Default wallet sources based on transaction type and currency
    let finalWalletSource = walletSource;
    if (!finalWalletSource) {
      if (type === 'income') finalWalletSource = isUsdt ? 'binance_usdt' : 'pkr_cash';
      else if (type === 'expense') finalWalletSource = isUsdt ? 'binance_reserve' : 'pkr_cash';
      else if (type === 'investment') finalWalletSource = isUsdt ? 'binance_usdt' : 'pkr_bank';
      else if (type === 'drawing') finalWalletSource = isUsdt ? 'binance_usdt' : 'pkr_cash';
      else if (type === 'settlement') finalWalletSource = 'partner_pocket';
      else if (type === 'conversion') finalWalletSource = 'binance_usdt';
      else finalWalletSource = 'pkr_cash';
    }

    let finalWalletDest = walletDestination || (type === 'settlement' ? 'partner_pocket' : 'external');
    if (type === 'conversion' && (!walletDestination || walletDestination === 'external')) {
      finalWalletDest = 'pkr_cash';
    }

    // Preserve exact timestamp if created today
    let txDate = new Date();
    if (date) {
      const parsed = new Date(date);
      const now = new Date();
      const isToday =
        parsed.getFullYear() === now.getFullYear() &&
        parsed.getMonth() === now.getMonth() &&
        parsed.getDate() === now.getDate();

      if (isToday) {
        txDate = now;
      } else {
        parsed.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
        txDate = parsed;
      }
    }

    const tx = new BusinessTransaction({
      type: type || 'expense',
      category: category || (type === 'settlement' ? 'partner_settlement' : 'misc_expense'),
      amount: amt,
      currency: isUsdt ? 'USDT' : 'PKR',
      exchangeRate: rate,
      amountPKR,
      amountUSDT,
      walletSource: finalWalletSource,
      walletDestination: finalWalletDest,
      partnerName: partnerName || '',
      paidBy: paidBy || 'both_50_50',
      description: description.trim(),
      date: txDate,
      notes: notes || '',
      isAutoSynced: false,
      createdBy: req.partnerAuthenticated ? 'Partner' : 'Admin',
    });

    await tx.save();
    res.status(201).json({ ok: true, message: 'Transaction recorded successfully', transaction: tx });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// PUT /api/business-finance/transactions/:id — Edit any existing transaction
router.put('/transactions/:id', authPartner, async (req, res) => {
  try {
    const tx = await BusinessTransaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ ok: false, message: 'Transaction not found' });

    const {
      type,
      category,
      amount,
      currency,
      exchangeRate,
      walletSource,
      walletDestination,
      partnerName,
      paidBy,
      description,
      date,
      notes,
    } = req.body || {};

    if (type) tx.type = type;
    if (category) tx.category = category;
    if (currency) tx.currency = currency === 'USDT' || currency === 'USD' ? 'USDT' : 'PKR';
    if (description) tx.description = description.trim();
    if (date) tx.date = new Date(date);
    if (notes !== undefined) tx.notes = notes;
    if (partnerName !== undefined) tx.partnerName = partnerName;
    if (paidBy !== undefined) tx.paidBy = paidBy;
    if (walletSource) tx.walletSource = walletSource;
    if (walletDestination) tx.walletDestination = walletDestination;

    const amt = amount !== undefined ? Number(amount) : tx.amount;
    const rate = exchangeRate !== undefined ? Number(exchangeRate) : tx.exchangeRate;

    tx.amount = amt;
    tx.exchangeRate = rate;

    const isUsdt = tx.currency === 'USDT' || tx.currency === 'USD';
    tx.amountPKR = isUsdt ? Math.round(amt * rate) : amt;
    tx.amountUSDT = isUsdt ? amt : Number((amt / rate).toFixed(2));

    await tx.save();
    res.json({ ok: true, message: 'Transaction updated successfully', transaction: tx });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// DELETE /api/business-finance/transactions/:id — Delete any transaction
router.delete('/transactions/:id', authPartner, async (req, res) => {
  try {
    const tx = await BusinessTransaction.findByIdAndDelete(req.params.id);
    if (!tx) return res.status(404).json({ ok: false, message: 'Transaction not found' });
    res.json({ ok: true, message: 'Transaction deleted successfully' });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// POST /api/business-finance/p2p-convert — Quick Action: Binance USDT Sold to PKR
router.post('/p2p-convert', authPartner, async (req, res) => {
  try {
    const { usdtAmount, rate, pkrAmount, targetWallet = 'pkr_cash', notes, date } = req.body || {};

    const usdt = Number(usdtAmount);
    if (!usdt || usdt <= 0) return res.status(400).json({ ok: false, message: 'Valid USDT amount is required' });

    const pkrRate = Number(rate) > 0 ? Number(rate) : 278.5;
    const finalPKR = Number(pkrAmount) > 0 ? Number(pkrAmount) : Math.round(usdt * pkrRate);

    const tx = new BusinessTransaction({
      type: 'conversion',
      category: 'binance_p2p_cashout',
      amount: usdt,
      currency: 'USDT',
      exchangeRate: pkrRate,
      amountPKR: finalPKR,
      amountUSDT: usdt,
      walletSource: 'binance_usdt',
      walletDestination: targetWallet === 'pkr_bank' ? 'pkr_bank' : 'pkr_cash',
      description: `Binance P2P: Sold ${usdt} USDT @ Rs ${pkrRate} → Rs ${finalPKR.toLocaleString('en-US')}`,
      date: date ? new Date(date) : new Date(),
      notes: notes || 'Withdrawn from Binance into liquid PKR for office expenses',
      isAutoSynced: false,
      createdBy: 'Partner',
    });

    await tx.save();
    res.status(201).json({ ok: true, message: 'Binance P2P conversion recorded successfully', transaction: tx });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// POST /api/business-finance/allocate-reserve — Quick Action: Adjust or Reinvest Reserve
router.post('/allocate-reserve', authPartner, async (req, res) => {
  try {
    const { action = 'allocate', usdtAmount, targetReserve, description, notes } = req.body || {}; // action: 'allocate' | 'release' | 'reinvest' | 'set_target'

    // Direct target reserve update (e.g. set to $200 USDT)
    if (targetReserve !== undefined && targetReserve !== null && !isNaN(targetReserve)) {
      const tgt = Math.max(0, Number(targetReserve));
      await updateFinanceSettings({ reinvestmentReserveUsdt: tgt });
      return res.status(200).json({
        ok: true,
        message: `Seller Reserve successfully set to $${tgt.toFixed(2)} USDT`,
        targetReserve: tgt,
      });
    }

    const amt = Number(usdtAmount);
    if (!amt || amt <= 0) return res.status(400).json({ ok: false, message: 'Valid USDT amount is required' });

    const settings = await getFinanceSettings();
    const rate = Number(settings.defaultUsdtRate) || 278.5;

    // REINVEST ACTION: Spends USDT directly from Seller Reserve pool
    if (action === 'reinvest') {
      const tx = new BusinessTransaction({
        type: 'expense',
        category: 'reinvestment',
        amount: amt,
        currency: 'USDT',
        exchangeRate: rate,
        amountPKR: Math.round(amt * rate),
        amountUSDT: amt,
        walletSource: 'binance_reserve',
        walletDestination: 'external',
        description: description?.trim() || `Reinvestment: Deployed $${amt} USDT from Seller Reserve`,
        date: new Date(),
        notes: notes || 'Reserve funds deployed for inventory / business growth',
        isAutoSynced: false,
        createdBy: 'Partner',
      });

      await tx.save();
      return res.status(201).json({
        ok: true,
        message: `Successfully reinvested $${amt} USDT from Seller Reserve`,
        transaction: tx,
      });
    }

    const isAllocate = action === 'allocate';
    const tx = new BusinessTransaction({
      type: 'reserve_transfer',
      category: 'reserve_adjustment',
      amount: amt,
      currency: 'USDT',
      exchangeRate: rate,
      amountPKR: Math.round(amt * rate),
      amountUSDT: amt,
      walletSource: isAllocate ? 'binance_usdt' : 'binance_reserve',
      walletDestination: isAllocate ? 'binance_reserve' : 'binance_usdt',
      description: isAllocate
        ? `Allocated $${amt} USDT to Reinvestment Reserve Pool`
        : `Released $${amt} USDT from Reinvestment Reserve Pool`,
      date: new Date(),
      notes: notes || '',
      isAutoSynced: false,
      createdBy: 'Partner',
    });

    await tx.save();
    res.status(201).json({ ok: true, message: 'Reinvestment reserve updated successfully', transaction: tx });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// POST /api/business-finance/sync-bazario — 1-Click Sync past Bazario deposits and withdrawals
router.post('/sync-bazario', authPartner, async (req, res) => {
  try {
    const result = await syncAllPastBazarioRecords();
    res.json({
      ok: true,
      message: `Bazario sync completed: ${result.syncedCount} new transactions synced, ${result.skippedCount} already up to date.`,
      result,
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// GET /api/business-finance/settings — Get settings & partner configurations
router.get('/settings', authPartner, async (req, res) => {
  try {
    const settings = await getFinanceSettings();
    res.json({
      ok: true,
      settings: {
        ...settings,
        securityPin: settings.securityPin ? '••••' : '',
        rawPin: settings.securityPin,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// PUT /api/business-finance/settings — Update partner configuration or exchange rate
router.put('/settings', authPartner, async (req, res) => {
  try {
    const { partner1, partner2, defaultUsdtRate, autoSyncBazario, reinvestmentReserveUsdt } = req.body || {};
    const updated = await updateFinanceSettings({
      partner1,
      partner2,
      defaultUsdtRate: defaultUsdtRate !== undefined ? Number(defaultUsdtRate) : undefined,
      autoSyncBazario: autoSyncBazario !== undefined ? Boolean(autoSyncBazario) : undefined,
      reinvestmentReserveUsdt: reinvestmentReserveUsdt !== undefined ? Number(reinvestmentReserveUsdt) : undefined,
    });

    res.json({ ok: true, message: 'Settings saved successfully', settings: updated });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

export default router;
