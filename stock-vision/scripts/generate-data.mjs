/**
 * Static data generator for Stock Vision GitHub Pages deployment
 *
 * Fetches all data from stock-sdk and writes JSON files into dist/data/
 * Run by GitHub Actions on a schedule.
 */

import { StockSDK } from 'stock-sdk';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const DATA_DIR = path.join(DIST_DIR, 'data');

const INDICES = ['sh000001', 'sz399001', 'sz399006', 'sh000688'];
const WATCHLIST = ['sz002241', 'sh603045', 'sh600396', 'sz000725', 'sz002155'];

const sdk = new StockSDK();

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function fmtErr(err) {
  return { error: err.message || String(err), ts: Date.now() };
}

async function generateQuotes() {
  const codes = [...INDICES, ...WATCHLIST];
  const quotes = await sdk.quotes.cnSimple(codes);

  const INDEX_SET = new Set(INDICES.map(c => c.replace(/^[a-z]+/, '')));
  const WATCHLIST_SET = new Set(WATCHLIST.map(c => c.replace(/^[a-z]+/, '')));

  return {
    indices: quotes.filter(q => INDEX_SET.has(q.code)).map(q => ({
      code: q.code, name: q.name, price: q.price, change: q.changePercent,
      volume: q.volume, amount: q.amount
    })),
    watchlist: quotes.filter(q => WATCHLIST_SET.has(q.code)).map(q => ({
      code: q.code, name: q.name, price: q.price, change: q.changePercent
    })),
    updatedAt: Date.now()
  };
}

async function generateIndustries() {
  try {
    const list = await sdk.getIndustryList();
    const ranked = list
      .map(item => ({
        name: item.name, code: item.code,
        weekChange: item.changePercent || 0,
        monthChange: item.monthChangePercent || 0,
        amount: item.amount || 0
      }))
      .sort((a, b) => Math.abs(b.weekChange) - Math.abs(a.weekChange))
      .slice(0, 10);
    return { industries: ranked, updatedAt: Date.now() };
  } catch (err) {
    console.warn('  [warn] industries failed:', err.message);
    return { industries: [], updatedAt: Date.now(), error: err.message };
  }
}

async function generateNorthbound() {
  try {
    const [summary, marketFlow] = await Promise.all([
      sdk.northboundService.getNorthboundFlowSummary(),
      sdk.fundFlowService.getMarketFundFlow()
    ]);
    const northboundBoards = summary.filter(s => s.type === '001' || s.type === '003');
    const todayNet = northboundBoards.reduce((sum, s) => sum + (s.netBuyAmount || 0), 0);

    const now = new Date();
    const oneWeekAgo = new Date(now);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const recentFlows = marketFlow.filter(d => new Date(d.date) >= oneMonthAgo);
    const weekFlows = recentFlows.filter(d => new Date(d.date) >= oneWeekAgo);
    const weekNet = weekFlows.reduce((sum, d) => sum + (d.mainNetInflow || 0), 0);
    const monthNet = recentFlows.reduce((sum, d) => sum + (d.mainNetInflow || 0), 0);

    const dailyHistory = marketFlow.slice(-20).map(d => ({
      date: d.date, net: d.mainNetInflow || 0,
      shClose: d.shClose, shChangePercent: d.shChangePercent
    }));

    return { todayNet, weekNet, monthNet, history: dailyHistory, updatedAt: Date.now() };
  } catch (err) {
    console.warn('  [warn] northbound failed:', err.message);
    return { todayNet: 0, weekNet: 0, monthNet: 0, history: [], updatedAt: Date.now(), error: err.message };
  }
}

async function generateSentiment() {
  try {
    const [ztPool, dtPool] = await Promise.all([
      sdk.getZTPool('zt'),
      sdk.getZTPool('dt')
    ]);
    return {
      ztCount: (ztPool || []).length,
      dtCount: (dtPool || []).length,
      totalVolume: 0,
      updatedAt: Date.now()
    };
  } catch (err) {
    console.warn('  [warn] sentiment failed:', err.message);
    return { ztCount: 0, dtCount: 0, totalVolume: 0, updatedAt: Date.now(), error: err.message };
  }
}

async function generateKline(period = 'weekly') {
  // Map period to Tencent API format
  const PERIOD_MAP = { daily: 'day', weekly: 'week', monthly: 'month' };
  const periodKey = PERIOD_MAP[period] || 'week';

  async function fetchFromSDK(code) {
    const numCode = code.replace(/^[a-z]+/, '');
    try {
      const k = await sdk.kline.withIndicators(numCode, { period, limit: 50 });
      const rawBars = k.bars || k;
      if (Array.isArray(rawBars) && rawBars.length > 0) {
        return { code, bars: rawBars.slice(-12) };
      }
    } catch (e) { /* fall through to Tencent */ }
    return null;
  }

  async function fetchFromTencent(code) {
    try {
      const url = `http://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},${periodKey},,,20,qfq`;
      const res = await fetch(url);
      const data = await res.json();
      const stocks = data?.data?.[code];
      if (!stocks) return null;
      // Response key: qfqday, qfqweek, or qfqmonth
      const key = 'qfq' + periodKey;
      const rawBars = stocks[key];
      if (!Array.isArray(rawBars) || rawBars.length === 0) return null;
      const bars = rawBars.slice(-12).map(b => ({
        date: b[0],
        open: parseFloat(b[1]),
        close: parseFloat(b[2]),
        high: parseFloat(b[3]),
        low: parseFloat(b[4]),
        volume: parseFloat(b[5])
      }));
      return { code, bars };
    } catch (e) { return null; }
  }

  const results = await Promise.allSettled(
    WATCHLIST.map(async (code) => {
      // Try SDK first, then Tencent fallback
      let result = await fetchFromSDK(code);
      if (!result) {
        console.log(`    [info] kline fallback to Tencent for ${code}`);
        result = await fetchFromTencent(code);
      }
      if (!result) return { code, bars: [] };
      // Fix code to match frontend: strip prefix
      const numCode = code.replace(/^[a-z]+/, '');
      return { ...result, code: code }; // keep original code format
    })
  );

  // Enrich with stock name/price/change from quotes
  let stockInfo = {};
  try {
    const q = await sdk.quotes.cnSimple(WATCHLIST);
    if (q) q.forEach(item => { stockInfo[item.code] = item; });
  } catch (e) { /* use empty map */ }

  const stocks = results.map(r => r.value || r).map(s => {
    const codeKey = s.code.replace(/^[a-z]+/, '');
    const info = stockInfo[codeKey] || {};
    return { ...s, name: info.name || codeKey, price: info.price, changePercent: info.changePercent };
  });

  return { stocks, updatedAt: Date.now() };
}

async function main() {
  console.log('📊 Stock Vision — Static Data Generator');
  console.log(`   Output: ${DATA_DIR}\n`);

  ensureDir(DATA_DIR);

  // Generate all data in parallel
  console.log('  [1/6] Quotes...');
  const quotes = await generateQuotes();
  fs.writeFileSync(path.join(DATA_DIR, 'quotes.json'), JSON.stringify(quotes));
  console.log(`        ✓ ${quotes.indices.length} indices, ${quotes.watchlist.length} watchlist`);

  console.log('  [2/6] Industries...');
  const industries = await generateIndustries();
  fs.writeFileSync(path.join(DATA_DIR, 'industries.json'), JSON.stringify(industries));
  console.log(`        ✓ ${industries.industries.length} sectors`);

  console.log('  [3/6] Northbound...');
  const northbound = await generateNorthbound();
  fs.writeFileSync(path.join(DATA_DIR, 'northbound.json'), JSON.stringify(northbound));
  console.log(`        ✓ todayNet: ${northbound.todayNet}`);

  console.log('  [4/6] Sentiment...');
  const sentiment = await generateSentiment();
  fs.writeFileSync(path.join(DATA_DIR, 'sentiment.json'), JSON.stringify(sentiment));
  console.log(`        ✓ zt: ${sentiment.ztCount}, dt: ${sentiment.dtCount}`);

  console.log('  [5/6] Kline (weekly)...');
  const kline = await generateKline('weekly');
  fs.writeFileSync(path.join(DATA_DIR, 'kline.json'), JSON.stringify(kline));
  console.log(`        ✓ ${kline.stocks.length} stocks`);

  console.log('  [6/6] Copy index.html...');
  fs.copyFileSync(
    path.resolve(__dirname, '..', 'public', 'index.html'),
    path.join(DIST_DIR, 'index.html')
  );
  console.log('        ✓ index.html copied');

  // Timestamp
  fs.writeFileSync(path.join(DIST_DIR, 'last-updated.json'), JSON.stringify({
    updatedAt: Date.now(),
    date: new Date().toISOString()
  }));

  console.log('\n✅ Done. All static data written to dist/');
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
