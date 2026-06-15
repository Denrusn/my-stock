// Kline data module for Stock Vision
// Fetches weekly kline with indicators for the watchlist stocks via StockSDK

import { StockSDK } from 'stock-sdk';

const WATCHLIST = ['sz002241', 'sh603045', 'sh600396', 'sz000725', 'sz002155'];

const sdk = new StockSDK();

export async function fetch(period = 'weekly') {
  const results = await Promise.allSettled(
    WATCHLIST.map(code =>
      sdk.kline.withIndicators(code, { period, limit: 12 })
    )
  );

  const stocks = WATCHLIST.map((code, i) => {
    const result = results[i];
    const bars = result.status === 'fulfilled' && Array.isArray(result.value)
      ? result.value.slice(-12)
      : [];
    return { code, bars };
  });

  return { stocks, updatedAt: Date.now() };
}
