import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export const CURRENCIES = {
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', flag: '🇺🇸', defaultRate: 1.0, locale: 'en-US' },
  INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee', flag: '🇮🇳', defaultRate: 83.50, locale: 'en-IN' },
  PKR: { code: 'PKR', symbol: '₨ ', name: 'Pakistani Rupee', flag: '🇵🇰', defaultRate: 278.50, locale: 'en-PK' },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', flag: '🇪🇺', defaultRate: 0.92, locale: 'de-DE' },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound', flag: '🇬🇧', defaultRate: 0.79, locale: 'en-GB' },
  AED: { code: 'AED', symbol: 'AED ', name: 'UAE Dirham', flag: '🇦🇪', defaultRate: 3.67, locale: 'ar-AE' },
  SAR: { code: 'SAR', symbol: 'SAR ', name: 'Saudi Riyal', flag: '🇸🇦', defaultRate: 3.75, locale: 'ar-SA' },
  CAD: { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar', flag: '🇨🇦', defaultRate: 1.36, locale: 'en-CA' },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', flag: '🇦🇺', defaultRate: 1.52, locale: 'en-AU' },
};

export const DEFAULT_RATES = {
  USD: 1.0,
  INR: 83.50,
  PKR: 278.50,
  EUR: 0.92,
  GBP: 0.79,
  AED: 3.67,
  SAR: 3.75,
  CAD: 1.36,
  AUD: 1.52,
};

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const [currency, setCurrencyState] = useState(() => {
    try {
      const saved = localStorage.getItem('bazario_currency');
      return saved && CURRENCIES[saved] ? saved : 'USD';
    } catch {
      return 'USD';
    }
  });

  const [rates, setRates] = useState(() => {
    try {
      const cached = localStorage.getItem('bazario_currency_rates');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object' && parsed.INR) {
          return { ...DEFAULT_RATES, ...parsed };
        }
      }
    } catch {}
    return DEFAULT_RATES;
  });

  // Fetch real-time live rates in background
  useEffect(() => {
    let isMounted = true;
    const fetchLiveRates = async () => {
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.rates && isMounted) {
          const newRates = {
            USD: 1.0,
            INR: data.rates.INR || DEFAULT_RATES.INR,
            PKR: data.rates.PKR || DEFAULT_RATES.PKR,
            EUR: data.rates.EUR || DEFAULT_RATES.EUR,
            GBP: data.rates.GBP || DEFAULT_RATES.GBP,
            AED: data.rates.AED || DEFAULT_RATES.AED,
            SAR: data.rates.SAR || DEFAULT_RATES.SAR,
            CAD: data.rates.CAD || DEFAULT_RATES.CAD,
            AUD: data.rates.AUD || DEFAULT_RATES.AUD,
          };
          setRates(newRates);
          localStorage.setItem('bazario_currency_rates', JSON.stringify(newRates));
          window.dispatchEvent(new Event('bazario:rates_updated'));
        }
      } catch (err) {
        // Fallback to secondary endpoint
        try {
          const fallbackRes = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
          if (fallbackRes.ok && isMounted) {
            const fbData = await fallbackRes.json();
            if (fbData && fbData.rates) {
              const fbRates = {
                USD: 1.0,
                INR: fbData.rates.INR || DEFAULT_RATES.INR,
                PKR: fbData.rates.PKR || DEFAULT_RATES.PKR,
                EUR: fbData.rates.EUR || DEFAULT_RATES.EUR,
                GBP: fbData.rates.GBP || DEFAULT_RATES.GBP,
                AED: fbData.rates.AED || DEFAULT_RATES.AED,
                SAR: fbData.rates.SAR || DEFAULT_RATES.SAR,
                CAD: fbData.rates.CAD || DEFAULT_RATES.CAD,
                AUD: fbData.rates.AUD || DEFAULT_RATES.AUD,
              };
              setRates(fbRates);
              localStorage.setItem('bazario_currency_rates', JSON.stringify(fbRates));
              window.dispatchEvent(new Event('bazario:rates_updated'));
            }
          }
        } catch {}
      }
    };

    fetchLiveRates();
    return () => {
      isMounted = false;
    };
  }, []);

  const setCurrency = useCallback((newCurrencyCode) => {
    if (CURRENCIES[newCurrencyCode]) {
      setCurrencyState(newCurrencyCode);
      localStorage.setItem('bazario_currency', newCurrencyCode);
      window.dispatchEvent(new CustomEvent('bazario:currency_changed', { detail: newCurrencyCode }));
    }
  }, []);

  const convert = useCallback(
    (amountInUSD, targetCode = currency) => {
      const num = Number(amountInUSD) || 0;
      const rate = rates[targetCode] || DEFAULT_RATES[targetCode] || 1.0;
      return num * rate;
    },
    [currency, rates]
  );

  const formatMoney = useCallback(
    (amountInUSD, targetCode = currency) => {
      const curr = CURRENCIES[targetCode] || CURRENCIES.USD;
      const convertedVal = convert(amountInUSD, curr.code);
      const isIntegerLike = Math.abs(convertedVal) >= 1000 && Number.isInteger(convertedVal);
      const formattedNum = Number(convertedVal).toLocaleString(curr.locale || 'en-US', {
        minimumFractionDigits: isIntegerLike ? 0 : 2,
        maximumFractionDigits: 2,
      });
      return `${curr.symbol}${formattedNum}`;
    },
    [currency, convert]
  );

  const currentCurrency = CURRENCIES[currency] || CURRENCIES.USD;

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency,
        currencies: CURRENCIES,
        rates,
        convert,
        formatMoney,
        currentCurrency,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    // Fallback if rendered outside provider
    const currCode = (() => {
      try {
        return localStorage.getItem('bazario_currency') || 'USD';
      } catch {
        return 'USD';
      }
    })();
    const curr = CURRENCIES[currCode] || CURRENCIES.USD;
    const rate = DEFAULT_RATES[currCode] || 1.0;
    return {
      currency: currCode,
      setCurrency: () => {},
      currencies: CURRENCIES,
      rates: DEFAULT_RATES,
      convert: (amt) => (Number(amt) || 0) * rate,
      formatMoney: (amt) =>
        `${curr.symbol}${((Number(amt) || 0) * rate).toLocaleString(curr.locale || 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      currentCurrency: curr,
    };
  }
  return ctx;
}
