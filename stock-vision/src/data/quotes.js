// Quotes data module for Stock Vision
// Fetches real-time prices for A-share indices and watchlist stocks via Tencent API
//
// Note: StockSDK#cnSimple strips the exchange prefix (sh/sz) from returned codes.
// We match against the numeric portion of code strings defined below.

import { StockSDK } from 'stock-sdk';

const INDICES = ['sh000001', 'sz399001', 'sz399006', 'sh000688'];
const WATCHLIST = ['sz002241', 'sh603045', 'sh600396', 'sz000725', 'sz002155'];

const sdk = new StockSDK();

// Build lookup sets keyed by numeric code (what the SDK returns)
const INDEX_SET = new Set(INDICES.map(c => c.replace(/^[a-z]+/, '')));
const WATCHLIST_SET = new Set(WATCHLIST.map(c => c.replace(/^[a-z]+/, '')));

export async function fetch() {
  const codes = [...INDICES, ...WATCHLIST];
  const quotes = await sdk.quotes.cnSimple(codes);
  return { indices: extractIndices(quotes), watchlist: extractWatchlist(quotes), updatedAt: Date.now() };
}

function extractIndices(quotes) {
  return quotes.filter(q => INDEX_SET.has(q.code)).map(q => ({
    code: q.code, name: q.name, price: q.price, change: q.changePercent,
    volume: q.volume, amount: q.amount
  }));
}

function extractWatchlist(quotes) {
  return quotes.filter(q => WATCHLIST_SET.has(q.code)).map(q => ({
    code: q.code, name: q.name, price: q.price, change: q.changePercent
  }));
}
