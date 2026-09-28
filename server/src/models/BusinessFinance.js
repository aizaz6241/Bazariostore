import mongoose from 'mongoose';

// Individual financial transaction in the business ledger
const businessTransactionSchema = new mongoose.Schema(
  {
    // Transaction Category / Classification
    type: {
      type: String,
      enum: [
        'income',            // General business profit / revenue
        'expense',           // Business expense (food, bills, etc.)
        'investment',        // Capital investment from a partner
        'drawing',           // Personal withdrawal / drawing by a partner
        'conversion',        // Binance USDT sold / converted to PKR
        'reserve_transfer',  // Fund allocation into / out of Reinvestment Reserve
      ],
      required: true,
      default: 'expense',
    },

    // Sub-category for organized analytics
    category: {
      type: String,
      enum: [
        // Expenses
        'office_food',        // Office lunch, dinner, snacks
        'chai_refreshment',   // Tea, coffee, water, daily drinks
        'bills_electricity',  // Electricity bill (WAPDA / K-Electric)
        'bills_internet',     // Office internet / fiber
        'office_rent',        // Monthly office rent
        'office_supplies',    // Stationery, furniture, electronics
        'staff_salary',       // Employee salaries & allowances
        'marketing',          // Meta ads, Google ads, influencers
        'logistics',          // Courier, delivery fees, packaging
        'seller_withdrawal',  // Seller payout withdrawal (Bazario)
        'reinvestment',       // Inventory purchases, product sourcing
        'misc_expense',       // Uncategorized business expenses

        // Incomes
        'seller_deposit',     // Seller USD deposit on Bazario platform
        'platform_profit',    // Direct ecommerce sales margin / markup
        'commission_income',  // Merchant commission cuts
        'trading_profit',     // Crypto trading or Binance gain
        'misc_income',        // Other business revenue

        // Partner capital & equity
        'partner_capital',    // Fresh capital injection
        'partner_drawing',    // Profit drawing by partner

        // Wallets
        'binance_p2p_cashout',// Sold USDT on Binance P2P for PKR
        'reserve_adjustment', // Allocation to Reinvestment Reserve
        'other',
      ],
      default: 'misc_expense',
    },

    // Transaction Primary Amount
    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    // Primary Currency
    currency: {
      type: String,
      enum: ['USDT', 'USD', 'PKR'],
      required: true,
      default: 'PKR',
    },

    // Exchange Rate at transaction time (PKR per 1 USDT)
    exchangeRate: {
      type: Number,
      default: 278.5,
    },

    // Normalized amounts in both currencies for universal calculations
    amountPKR: {
      type: Number,
      required: true,
    },
    amountUSDT: {
      type: Number,
      required: true,
    },

    // Wallet source and destination
    walletSource: {
      type: String,
      enum: [
        'binance_usdt',       // Main Binance USDT wallet
        'binance_reserve',    // Reserved Binance USDT pool for reinvestment / seller payouts
        'pkr_cash',           // Physical cash in office drawer
        'pkr_bank',           // Business bank account (Meezan, Nayapay, Sadapay, etc.)
        'partner_pocket',     // Paid out of personal pocket by a partner
      ],
      default: 'pkr_cash',
    },
    walletDestination: {
      type: String,
      enum: [
        'binance_usdt',
        'binance_reserve',
        'pkr_cash',
        'pkr_bank',
        'partner_pocket',
        'external',
      ],
      default: 'external',
    },

    // Associated Partner (if investment or drawing or paid by partner)
    partnerName: {
      type: String,
      default: '',
    },

    // Title / Description
    description: {
      type: String,
      required: true,
      trim: true,
    },

    // Date of transaction
    date: {
      type: Date,
      default: Date.now,
    },

    // Bazario Platform Linkage (for deposits & withdrawals)
    bazarioRef: {
      type: {
        type: String,
        enum: ['deposit', 'withdrawal', 'manual', ''],
        default: '',
      },
      withdrawalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Withdrawal',
        default: null,
      },
      sellerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Seller',
        default: null,
      },
      storeName: {
        type: String,
        default: '',
      },
      sellerName: {
        type: String,
        default: '',
      },
      rawAmount: {
        type: Number,
        default: 0,
      },
    },

    // Flag indicating whether record was auto-synced from Bazario
    isAutoSynced: {
      type: Boolean,
      default: false,
    },

    // Optional receipt image or proof URL
    receiptUrl: {
      type: String,
      default: '',
    },

    // Notes
    notes: {
      type: String,
      default: '',
    },

    // User who recorded this entry
    createdBy: {
      type: String,
      default: 'Partner',
    },
  },
  { timestamps: true }
);

// Indexing for rapid queries
businessTransactionSchema.index({ date: -1 });
businessTransactionSchema.index({ type: 1, date: -1 });
businessTransactionSchema.index({ 'bazarioRef.withdrawalId': 1 });

export const BusinessTransaction = mongoose.model('BusinessTransaction', businessTransactionSchema);
export default BusinessTransaction;
