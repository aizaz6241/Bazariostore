import React from 'react';

export default function AnalyticsView({ overview = {}, onBackToDashboard }) {
  const performance = overview.performance || {};
  const wallets = overview.wallets || {};
  const binance = wallets.binance || {};
  const partners = overview.partners || {};
  const p1 = partners.partner1 || { name: 'Aizaz', profitShareUSDT: 0, withdrawnUSDT: 0, remainingInBinanceUSDT: 0 };
  const p2 = partners.partner2 || { name: 'Abdullah', profitShareUSDT: 0, withdrawnUSDT: 0, remainingInBinanceUSDT: 0 };
  const monthlyChart = overview.monthlyChart || [];
  const breakdown = overview.expenseBreakdown?.categories || {};
  const currentRate = overview.exchangeRate || 278.5;

  const totalExpensesPKR = performance.periodExpensePKR || 0;

  // Category metadata with icons and labels
  const categoryMeta = [
    { key: 'office_food', label: 'Office Food & Meals', icon: '🍔', color: '#f59e0b' },
    { key: 'chai_refreshment', label: 'Chai & Refreshments', icon: '☕', color: '#d97706' },
    { key: 'bills_electricity', label: 'Electricity & Generator Bills', icon: '⚡', color: '#eab308' },
    { key: 'bills_internet', label: 'Internet & WiFi Bills', icon: '🌐', color: '#3b82f6' },
    { key: 'office_rent', label: 'Office Rent & Facilities', icon: '🏢', color: '#8b5cf6' },
    { key: 'office_supplies', label: 'Furniture & Table Setup', icon: '🪑', color: '#06b6d4' },
    { key: 'staff_salary', label: 'Staff Salaries & Stipends', icon: '👥', color: '#10b981' },
    { key: 'reinvestment', label: 'Seller Reserve Reinvestments', icon: '🚀', color: '#a855f7' },
    { key: 'misc_expense', label: 'General / Miscellaneous', icon: '📦', color: '#94a3b8' },
  ];

  // Active categories with expense > 0 or all if none
  const activeCategories = categoryMeta
    .map((cat) => {
      const amount = breakdown[cat.key] || 0;
      const percent = totalExpensesPKR > 0 ? Math.round((amount / totalExpensesPKR) * 100) : 0;
      return { ...cat, amount, percent };
    })
    .sort((a, b) => b.amount - a.amount);

  return (
    <div className="bf-analytics-container">
      {/* Top Header & Breadcrumb */}
      <div className="bf-analytics-header">
        <div>
          <button
            type="button"
            className="bf-back-btn"
            onClick={onBackToDashboard}
          >
            ← Back to Live Dashboard
          </button>
          <h2 className="bf-analytics-title">📊 Financial Performance & Analytics</h2>
          <p className="bf-analytics-subtitle">
            Executive audit, profit margins, monthly performance & operational expense breakdown.
          </p>
        </div>
      </div>

      {/* ─── 1. KEY PERFORMANCE INDICATORS (KPIs) ─── */}
      <div className="bf-kpi-grid">
        <div className="bf-kpi-card green">
          <div className="bf-kpi-top">
            <span className="bf-kpi-label">Total Revenue Generated</span>
            <span className="bf-kpi-badge">💰 Inflow</span>
          </div>
          <div className="bf-kpi-value text-green">
            ${(performance.periodRevenueUSDT || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            <span className="bf-kpi-unit">USDT</span>
          </div>
          <div className="bf-kpi-sub">
            ≈ ₨ {(performance.periodRevenuePKR || 0).toLocaleString('en-US')} PKR
          </div>
        </div>

        <div className="bf-kpi-card red">
          <div className="bf-kpi-top">
            <span className="bf-kpi-label">Total Operational Burn</span>
            <span className="bf-kpi-badge red">🍔 Expenses</span>
          </div>
          <div className="bf-kpi-value text-red">
            ₨ {(performance.periodExpensePKR || 0).toLocaleString('en-US')}
          </div>
          <div className="bf-kpi-sub">
            ≈ ${(performance.periodExpenseUSDT || 0).toFixed(2)} USDT spent on operations
          </div>
        </div>

        <div className="bf-kpi-card gold">
          <div className="bf-kpi-top">
            <span className="bf-kpi-label">Net Business Profit</span>
            <span className="bf-kpi-badge gold">💎 Bottom Line</span>
          </div>
          <div className="bf-kpi-value text-gold">
            ${(performance.periodNetProfitUSDT || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            <span className="bf-kpi-unit">USDT</span>
          </div>
          <div className="bf-kpi-sub">
            ≈ ₨ {(performance.periodNetProfitPKR || 0).toLocaleString('en-US')} PKR
          </div>
        </div>

        <div className="bf-kpi-card purple">
          <div className="bf-kpi-top">
            <span className="bf-kpi-label">Net Profit Margin</span>
            <span className="bf-kpi-badge purple">📈 Margin</span>
          </div>
          <div className="bf-kpi-value text-purple">
            {performance.profitMarginPercent || 99}%
          </div>
          <div className="bf-kpi-sub">
            High margin efficiency across sales
          </div>
        </div>
      </div>

      {/* ─── 2. OPERATIONAL EXPENDITURE CATEGORY BREAKDOWN ─── */}
      <div className="bf-analytics-card">
        <div className="bf-acard-header">
          <div>
            <h3 className="bf-acard-title">📑 Office Expenditure Breakdown by Category</h3>
            <p className="bf-acard-sub">Distribution of office food, utilities, reinvestment & daily operations</p>
          </div>
          <span className="bf-chip-highlight">
            Total: ₨ {totalExpensesPKR.toLocaleString('en-US')}
          </span>
        </div>

        <div className="bf-cat-breakdown-list">
          {activeCategories.map((cat) => (
            <div key={cat.key} className="bf-cat-item">
              <div className="bf-cat-top">
                <div className="bf-cat-label-wrap">
                  <span className="bf-cat-icon">{cat.icon}</span>
                  <span className="bf-cat-name">{cat.label}</span>
                </div>
                <div className="bf-cat-val-wrap">
                  <span className="bf-cat-pkr">₨ {cat.amount.toLocaleString('en-US')}</span>
                  <span className="bf-cat-pct">({cat.percent}%)</span>
                </div>
              </div>

              {/* Visual Progress Bar */}
              <div className="bf-prog-track">
                <div
                  className="bf-prog-fill"
                  style={{
                    width: `${Math.max(2, cat.percent)}%`,
                    backgroundColor: cat.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── 3. MONTHLY REVENUE VS EXPENSES TREND ─── */}
      <div className="bf-analytics-card">
        <div className="bf-acard-header">
          <div>
            <h3 className="bf-acard-title">📈 Monthly Financial Trend (Last 12 Months)</h3>
            <p className="bf-acard-sub">Monthly cash inflow vs operational outflow comparisons</p>
          </div>
        </div>

        {monthlyChart.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--bf-text-dim)' }}>
            No historical monthly data recorded yet.
          </div>
        ) : (
          <div className="bf-monthly-bars">
            {monthlyChart.map((m) => {
              const maxVal = Math.max(...monthlyChart.map((x) => Math.max(x.revenue, x.expense, 1)));
              const revPct = Math.min(100, Math.round((m.revenue / maxVal) * 100));
              const expPct = Math.min(100, Math.round((m.expense / maxVal) * 100));

              // Format Month name (e.g., "Sep 2026")
              const [yr, mn] = m.month.split('-');
              const dateObj = new Date(Number(yr), Number(mn) - 1, 1);
              const monthLabel = dateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

              return (
                <div key={m.month} className="bf-mbar-row">
                  <div className="bf-mbar-month">{monthLabel}</div>

                  <div className="bf-mbar-graphs">
                    {/* Revenue Bar */}
                    <div className="bf-bar-line">
                      <span className="bf-bar-lbl green">Inflow: ₨ {m.revenue.toLocaleString('en-US')}</span>
                      <div className="bf-bar-track">
                        <div className="bf-bar-fill rev" style={{ width: `${Math.max(3, revPct)}%` }} />
                      </div>
                    </div>

                    {/* Expense Bar */}
                    <div className="bf-bar-line">
                      <span className="bf-bar-lbl red">Burn: ₨ {m.expense.toLocaleString('en-US')}</span>
                      <div className="bf-bar-track">
                        <div className="bf-bar-fill exp" style={{ width: `${Math.max(3, expPct)}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className="bf-mbar-profit">
                    <span className="bf-pstat-lbl">Net Profit</span>
                    <span className="bf-mbar-pnum">
                      +₨ {m.profit.toLocaleString('en-US')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── 4. PARTNER EQUITY & WITHDRAWAL COMPARISON ─── */}
      <div className="bf-analytics-card">
        <div className="bf-acard-header">
          <div>
            <h3 className="bf-acard-title">🤝 Partner 50/50 Equity & Realization</h3>
            <p className="bf-acard-sub">Comparison of profits earned vs actual cash withdrawals taken</p>
          </div>
        </div>

        <div className="bf-pequity-grid">
          {/* Partner 1 (Aizaz) */}
          <div className="bf-pequity-card p1">
            <div className="bf-pequity-head">
              <div className="bf-partner-avatar p1">{(p1.name || 'A')[0]}</div>
              <div>
                <h4 className="bf-pequity-name">{p1.name} (50%)</h4>
                <span className="bf-partner-share-pill">Managing Partner</span>
              </div>
            </div>

            <div className="bf-pequity-stats">
              <div className="bf-pequity-stat">
                <span className="bf-pequity-stat-label">Total Profit Earned</span>
                <span className="bf-pequity-stat-val text-green">
                  +${(p1.profitShareUSDT || 0).toFixed(2)} USDT
                </span>
                <small className="bf-pequity-pkr">≈ ₨ {(p1.profitSharePKR || 0).toLocaleString('en-US')}</small>
              </div>

              <div className="bf-pequity-stat">
                <span className="bf-pequity-stat-label">Withdrawn to Cash</span>
                <span className="bf-pequity-stat-val text-red">
                  -${(p1.withdrawnUSDT || 0).toFixed(2)} USDT
                </span>
                <small className="bf-pequity-pkr">≈ ₨ {(p1.withdrawnPKR || 0).toLocaleString('en-US')}</small>
              </div>

              <div className="bf-pequity-stat">
                <span className="bf-pequity-stat-label">Retained in Binance</span>
                <span className="bf-pequity-stat-val text-gold">
                  ${(p1.remainingInBinanceUSDT || 0).toFixed(2)} USDT
                </span>
                <small className="bf-pequity-pkr">≈ ₨ {(p1.remainingInBinancePKR || 0).toLocaleString('en-US')}</small>
              </div>
            </div>
          </div>

          {/* Partner 2 (Abdullah) */}
          <div className="bf-pequity-card p2">
            <div className="bf-pequity-head">
              <div className="bf-partner-avatar p2">{(p2.name || 'A')[0]}</div>
              <div>
                <h4 className="bf-pequity-name">{p2.name} (50%)</h4>
                <span className="bf-partner-share-pill">Business Partner</span>
              </div>
            </div>

            <div className="bf-pequity-stats">
              <div className="bf-pequity-stat">
                <span className="bf-pequity-stat-label">Total Profit Earned</span>
                <span className="bf-pequity-stat-val text-green">
                  +${(p2.profitShareUSDT || 0).toFixed(2)} USDT
                </span>
                <small className="bf-pequity-pkr">≈ ₨ {(p2.profitSharePKR || 0).toLocaleString('en-US')}</small>
              </div>

              <div className="bf-pequity-stat">
                <span className="bf-pequity-stat-label">Withdrawn to Cash</span>
                <span className="bf-pequity-stat-val text-red">
                  -${(p2.withdrawnUSDT || 0).toFixed(2)} USDT
                </span>
                <small className="bf-pequity-pkr">≈ ₨ {(p2.withdrawnPKR || 0).toLocaleString('en-US')}</small>
              </div>

              <div className="bf-pequity-stat">
                <span className="bf-pequity-stat-label">Retained in Binance</span>
                <span className="bf-pequity-stat-val text-gold">
                  ${(p2.remainingInBinanceUSDT || 0).toFixed(2)} USDT
                </span>
                <small className="bf-pequity-pkr">≈ ₨ {(p2.remainingInBinancePKR || 0).toLocaleString('en-US')}</small>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
