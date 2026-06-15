# Stock Vision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an immersive A-stock mid-to-long term trend monitoring dashboard with real data from stock-sdk, accessible on LAN.

**Architecture:** Node.js backend fetches data from stock-sdk, caches in-memory, serves REST JSON APIs. Single-page HTML frontend uses Chart.js for visualizations. 30s auto-refresh during trading hours.

**Tech Stack:** Node.js 18+, stock-sdk (腾讯行情), Chart.js (CDN), native Node.js HTTP (zero framework deps)

---

## File Structure

```
/Users/denrusn/my-stock/stock-vision/
├── package.json
├── src/
│   ├── server.js           # Main HTTP server + route handler
│   ├── cache.js            # In-memory TTL cache
│   └── data/
│       ├── quotes.js       # Index + watchlist realtime quotes
│       ├── industries.js   # Industry sector rankings
│       ├── northbound.js   # Northbound capital flow summary
│       ├── sentiment.js    # Market sentiment (up/down/zt)
│       └── kline.js        # Weekly kline data
└── public/
    └── index.html          # Full dashboard (CSS + JS inline)
```

All backend modules export a single async function `fetch()` that returns normalized data. The server imports them and wires to HTTP routes.

---

## Phase 1: Backend Data Service

### Task 1: Project Initialization

**Files:**
- Create: `stock-vision/package.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "stock-vision",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "dependencies": {
    "stock-sdk": "2.0.0-beta.0"
  },
  "scripts": {
    "start": "node src/server.js"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd /home/denrusn/my-stock/stock-vision && npm install`
Expected: stock-sdk and its dependencies installed in node_modules/

- [ ] **Step 3: Verify stock-sdk works**

Run: `node -e "import('stock-sdk').then(m => console.log(Object.keys(m)))"`
Expected: Array of exported names (StockSDK, etc.)

- [ ] **Step 4: Commit**

```bash
git add stock-vision/package.json stock-vision/package-lock.json
git commit -m "feat: init stock-vision project with stock-sdk dependency"
```

---

### Task 2: Cache Module

**Files:**
- Create: `stock-vision/src/cache.js`

- [ ] **Step 1: Implement TTL cache**

```javascript
// stock-vision/src/cache.js
const store = new Map();

export function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function set(key, value, ttlMs = 30000) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function clear() {
  store.clear();
}

export function stats() {
  return { size: store.size, keys: [...store.keys()] };
}
```

- [ ] **Step 2: Write smoke test**

Run: `node -e "
import('./src/cache.js').then(({get,set,clear}) => {
  set('a', 42, 5000);
  console.assert(get('a') === 42, 'should get value');
  clear();
  console.assert(get('a') === null, 'should clear');
  console.log('cache OK');
})"`

Expected: `cache OK`

- [ ] **Step 3: Commit**

```bash
git add stock-vision/src/cache.js
git commit -m "feat: add TTL cache module"
```

---

### Task 3: Quotes Data Module

**Files:**
- Create: `stock-vision/src/data/quotes.js`

- [ ] **Step 1: Implement quotes fetcher**

```javascript
// stock-vision/src/data/quotes.js
import { StockSDK } from 'stock-sdk';

const INDICES = ['sh000001', 'sz399001', 'sz399006', 'sh000688'];
const WATCHLIST = ['sz002241', 'sh603045', 'sh600396', 'sz000725', 'sz002155'];

const sdk = new StockSDK();

export async function fetch() {
  const codes = [...INDICES, ...WATCHLIST];
  const quotes = await sdk.quotes.cnSimple(codes);
  return { indices: extractIndices(quotes), watchlist: extractWatchlist(quotes), updatedAt: Date.now() };
}

function extractIndices(quotes) {
  const map = { 'sh000001': 'sh', 'sz399001': 'sz', 'sz399006': 'sz', 'sh000688': 'sh' };
  return quotes.filter(q => map[q.code]).map(q => ({
    code: q.code, name: q.name, price: q.price, change: q.changePercent,
    volume: q.volume, amount: q.amount
  }));
}

function extractWatchlist(quotes) {
  const codes = new Set(WATCHLIST);
  return quotes.filter(q => codes.has(q.code)).map(q => ({
    code: q.code, name: q.name, price: q.price, change: q.changePercent
  }));
}
```

- [ ] **Step 2: Verify it fetches real data**

Run: `cd /home/denrusn/my-stock/stock-vision && node -e "import('./src/data/quotes.js').then(m => m.fetch()).then(d => { console.log(JSON.stringify(d, null, 2)) })" 2>&1 | head -20`
Expected: Real index and watchlist data from Tencent

- [ ] **Step 3: Commit**

```bash
git add stock-vision/src/data/quotes.js
git commit -m "feat: add quotes data module (indices + watchlist)"
```

---

### Task 4: Industries Data Module

**Files:**
- Create: `stock-vision/src/data/industries.js`

- [ ] **Step 1: Implement industries fetcher**

```javascript
// stock-vision/src/data/industries.js
import { StockSDK } from 'stock-sdk';

const sdk = new StockSDK();

export async function fetch() {
  const list = await sdk.board.industry.list();
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
}
```

- [ ] **Step 2: Verify it returns data**

Run: `cd /home/denrusn/my-stock/stock-vision && node -e "import('./src/data/industries.js').then(m => m.fetch()).then(d => console.log(JSON.stringify(d.industries.slice(0,3), null, 2)))" 2>&1`
Expected: Top 3 industries with name, weekChange, monthChange

- [ ] **Step 3: Commit**

```bash
git add stock-vision/src/data/industries.js
git commit -m "feat: add industries sector ranking module"
```

---

### Task 5: Northbound Data Module

**Files:**
- Create: `stock-vision/src/data/northbound.js`

- [ ] **Step 1: Implement northbound fetcher**

```javascript
// stock-vision/src/data/northbound.js
import { StockSDK } from 'stock-sdk';

const sdk = new StockSDK();

export async function fetch() {
  const flow = await sdk.northbound.marketMoneyFlow();
  return {
    todayNet: flow.todayNetBuy || 0,
    weekNet: flow.weekNetBuy || 0,
    monthNet: flow.monthNetBuy || 0,
    dailyHistory: (flow.dailyHistory || []).slice(-20),
    updatedAt: Date.now()
  };
}
```

- [ ] **Step 2: Verify it returns data**

Run: `cd /home/denrusn/my-stock/stock-vision && node -e "import('./src/data/northbound.js').then(m => m.fetch()).then(d => console.log(JSON.stringify(d, null, 2)))" 2>&1`
Expected: Northbound flow data with todayNet, weekNet, etc.

- [ ] **Step 3: Commit**

```bash
git add stock-vision/src/data/northbound.js
git commit -m "feat: add northbound capital flow module"
```

---

### Task 6: Sentiment Data Module

**Files:**
- Create: `stock-vision/src/data/sentiment.js`

- [ ] **Step 1: Implement sentiment fetcher**

```javascript
// stock-vision/src/data/sentiment.js
import { StockSDK } from 'stock-sdk';

const sdk = new StockSDK();

export async function fetch() {
  const [ztPool, dtPool] = await Promise.all([
    sdk.ztpool.getPool({ type: 'zt' }),
    sdk.ztpool.getPool({ type: 'dt' })
  ]);
  return {
    ztCount: (ztPool || []).length,
    dtCount: (dtPool || []).length,
    totalVolume: 0, // will be filled from quotes
    updatedAt: Date.now()
  };
}
```

- [ ] **Step 2: Verify it returns data**

Run: `cd /home/denrusn/my-stock/stock-vision && node -e "import('./src/data/sentiment.js').then(m => m.fetch()).then(d => console.log(JSON.stringify(d, null, 2)))" 2>&1`
Expected: ztCount, dtCount from the market

- [ ] **Step 3: Commit**

```bash
git add stock-vision/src/data/sentiment.js
git commit -m "feat: add market sentiment module (zt/dt counts)"
```

---

### Task 7: Kline Data Module

**Files:**
- Create: `stock-vision/src/data/kline.js`

- [ ] **Step 1: Implement kline fetcher**

```javascript
// stock-vision/src/data/kline.js
import { StockSDK } from 'stock-sdk';

const sdk = new StockSDK();
const WATCHLIST = ['sz002241', 'sh603045', 'sh600396', 'sz000725', 'sz002155'];

export async function fetch() {
  const results = await Promise.all(
    WATCHLIST.map(code => fetchOne(code))
  );
  return { stocks: results, updatedAt: Date.now() };
}

async function fetchOne(code) {
  try {
    const kline = await sdk.kline.withIndicators(code, {
      period: 'weekly', limit: 12
    });
    return { code, bars: kline.bars || kline };
  } catch {
    return { code, bars: [] };
  }
}
```

- [ ] **Step 2: Verify it returns kline data**

Run: `cd /home/denrusn/my-stock/stock-vision && node -e "import('./src/data/kline.js').then(m => m.fetch()).then(d => console.log('stocks count:', d.stocks.length, 'first bars:', d.stocks[0]?.bars?.length))" 2>&1`
Expected: stocks count: 5, first bars: >0

- [ ] **Step 3: Commit**

```bash
git add stock-vision/src/data/kline.js
git commit -m "feat: add weekly kline data module for watchlist"
```

---

### Task 8: Main HTTP Server

**Files:**
- Create: `stock-vision/src/server.js`

- [ ] **Step 1: Implement server with all routes**

```javascript
// stock-vision/src/server.js
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cache from './cache.js';
import * as quotesModule from './data/quotes.js';
import * as industriesModule from './data/industries.js';
import * as northboundModule from './data/northbound.js';
import * as sentimentModule from './data/sentiment.js';
import * as klineModule from './data/kline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';

const DATA_MODULES = {
  '/api/quotes':       { mod: quotesModule,     ttl: 30000 },
  '/api/industries':   { mod: industriesModule,  ttl: 300000 },
  '/api/northbound':   { mod: northboundModule,  ttl: 300000 },
  '/api/sentiment':    { mod: sentimentModule,   ttl: 30000 },
  '/api/kline':        { mod: klineModule,       ttl: 600000 },
};

async function handleAPI(route) {
  const config = DATA_MODULES[route];
  if (!config) return null;
  const cached = cache.get(route);
  if (cached) return cached;
  const data = await config.mod.fetch();
  cache.set(route, data, config.ttl);
  return data;
}

function serveStatic(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = { '.html': 'text/html;charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };
  const fullPath = path.join(PUBLIC_DIR, filePath === '/' ? 'index.html' : filePath);
  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    res.writeHead(404); res.end('Not Found');
    return;
  }
  res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
  fs.createReadStream(fullPath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = url.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (route.startsWith('/api/')) {
    try {
      const data = await handleAPI(route);
      if (data === null) { res.writeHead(404); res.end('{"error":"not found"}'); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  serveStatic(res, route);
});

server.listen(PORT, HOST, () => {
  console.log(`📊 Stock Vision running at http://${HOST}:${PORT}`);
});
```

- [ ] **Step 2: Start server and verify API endpoints**

Run: `cd /home/denrusn/my-stock/stock-vision && node src/server.js &` then `sleep 3 && curl -s http://localhost:8080/api/quotes | head -c 200`
Expected: JSON with indices and watchlist data

Run: `curl -s http://localhost:8080/api/industries | head -c 200`
Expected: JSON with top 10 industries

Run: `curl -s http://localhost:8080/api/northbound | head -c 200`
Expected: JSON with northbound flow data

- [ ] **Step 3: Kill test server**

Run: `kill %1 2>/dev/null; true`

- [ ] **Step 4: Commit**

```bash
git add stock-vision/src/server.js
git commit -m "feat: add main HTTP server with all API routes"
```

---

## Phase 2: Frontend Layout & Theme

### Task 9: HTML Skeleton + CSS Dark Theme

**Files:**
- Create: `stock-vision/public/index.html`

- [ ] **Step 1: Create HTML scaffold with CSS variables**

```html
<!-- stock-vision/public/index.html -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=1280">
<title>Stock Vision</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
  :root {
    --bg-primary: #0a0a1a;
    --bg-secondary: #12122a;
    --card-bg: linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.06));
    --card-border: rgba(255,255,255,0.06);
    --green: #00c853;
    --green-light: #69f0ae;
    --red: #ff5252;
    --red-light: #ff8a80;
    --purple: #5c6bc0;
    --purple-light: #7986cb;
    --yellow: #ffd740;
    --text-primary: #e0e0e0;
    --text-secondary: rgba(255,255,255,0.4);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: linear-gradient(135deg, var(--bg-primary), var(--bg-secondary));
    color: var(--text-primary);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
    min-height: 100vh;
    overflow-x: hidden;
  }
  .dashboard { max-width: 1440px; margin: 0 auto; padding: 20px; }
</style>
</head>
<body>
<div class="dashboard" id="app">
  <!-- Will be populated by JS -->
  <div class="loading-screen" id="loadingScreen">
    <div style="text-align:center;padding:40vh 0;">
      <div style="font-size:32px;font-weight:700;margin-bottom:12px;">📊 STOCK VISION</div>
      <div style="font-size:14px;color:var(--text-secondary);">正在加载数据...</div>
    </div>
  </div>
</div>
</body>
</html>
```

- [ ] **Step 2: Verify static file serving**

Run: `cd /home/denrusn/my-stock/stock-vision && node src/server.js &` then `sleep 2 && curl -s http://localhost:8080/ | head -c 100`
Expected: `<!DOCTYPE html>` rendered

- [ ] **Step 3: Kill server**

Run: `kill %1 2>/dev/null; true`

- [ ] **Step 4: Commit**

```bash
git add stock-vision/public/index.html
git commit -m "feat: add HTML scaffold with dark theme CSS variables"
```

---

### Task 10: TOP BAR + Index Cards Layout

**Files:**
- Modify: `stock-vision/public/index.html`

- [ ] **Step 1: Add TOP BAR and index cards HTML**

Add after the `#app` div (replacing loading screen):

```html
<div class="dashboard" id="app">
  <!-- TOP BAR -->
  <header class="top-bar">
    <div class="top-bar-left">
      <div class="logo">📊</div>
      <h1 class="brand-title">STOCK VISION</h1>
    </div>
    <div class="top-bar-right">
      <span class="live-date" id="liveDate"></span>
      <span class="status-dot" id="statusDot"></span>
    </div>
  </header>

  <!-- INDEX CARDS -->
  <section class="index-grid" id="indexGrid">
    <div class="index-card" data-code="sh000001">
      <div class="index-name">上证指数</div>
      <div class="index-price" id="price-sh000001">--</div>
      <div class="index-change" id="change-sh000001">--</div>
      <div class="mini-chart"><canvas id="spark-sh000001"></canvas></div>
    </div>
    <!-- 3 more cards added by JS -->
  </section>
</div>
```

- [ ] **Step 2: Add TOP BAR + Index Cards CSS**

Add to `<style>`:

```css
.top-bar {
  display:flex; justify-content:space-between; align-items:center;
  padding:0 4px 16px 4px; border-bottom:1px solid rgba(255,255,255,0.06); margin-bottom:16px;
}
.top-bar-left { display:flex; align-items:center; gap:10px; }
.logo { font-size:24px; }
.brand-title { font-size:18px; font-weight:700; letter-spacing:2px; }
.top-bar-right { display:flex; align-items:center; gap:16px; font-size:13px; color:var(--text-secondary); }
.status-dot { width:8px; height:8px; border-radius:50%; background:var(--green); box-shadow:0 0 8px rgba(0,200,83,0.6); animation: breathe 2s ease-in-out infinite; }
@keyframes breathe { 0%,100%{opacity:0.4} 50%{opacity:1} }

.index-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:16px; }
.index-card {
  background:var(--card-bg); border:1px solid var(--card-border); border-radius:12px; padding:16px;
  transition:transform 0.2s, box-shadow 0.2s;
}
.index-card:hover { transform:translateY(-2px); box-shadow:0 4px 20px rgba(0,200,83,0.1); }
.index-name { font-size:11px; color:var(--text-secondary); margin-bottom:4px; }
.index-price { font-size:26px; font-weight:700; }
.index-change { font-size:14px; font-weight:600; margin-top:2px; }
.up { color:var(--green); } .down { color:var(--red); }
.mini-chart { height:50px; margin-top:10px; }
```

- [ ] **Step 3: Commit**

```bash
git add stock-vision/public/index.html
git commit -m "feat: add TOP BAR and index cards layout"
```

---

### Task 11: Middle Section + Watchlist Layout

**Files:**
- Modify: `stock-vision/public/index.html`

- [ ] **Step 1: Add middle section HTML**

Add after `</section>` (index-grid closing tag):

```html
  <div class="middle-grid">
    <!-- INDUSTRIES -->
    <section class="card" id="industriesSection">
      <div class="card-header"><span>🏭 板块轮动 Top 10</span></div>
      <div class="card-body" id="industriesBody"><div class="loading-skeleton">加载中...</div></div>
    </section>
    <div class="right-col">
      <!-- NORTHBOUND -->
      <section class="card" id="northboundSection">
        <div class="card-header"><span>📊 北向资金流向</span></div>
        <div class="card-body" id="northboundBody"><div class="loading-skeleton">加载中...</div></div>
      </section>
      <!-- SENTIMENT -->
      <section class="card" id="sentimentSection">
        <div class="card-header"><span>📈 市场情绪</span></div>
        <div class="card-body" id="sentimentBody"><div class="loading-skeleton">加载中...</div></div>
      </section>
    </div>
  </div>

  <!-- WATCHLIST -->
  <section class="card" id="watchlistSection">
    <div class="card-header"><span>🔍 自选股技术面概览</span>
      <div class="tab-group" id="klineTab">
        <span class="tab" data-period="daily">日K</span>
        <span class="tab active" data-period="weekly">周K</span>
        <span class="tab" data-period="monthly">月K</span>
      </div>
    </div>
    <div class="card-body" id="watchlistBody"><div class="loading-skeleton">加载中...</div></div>
  </section>
```

- [ ] **Step 2: Add middle + watchlist CSS**

```css
.middle-grid { display:grid; grid-template-columns:1.5fr 1fr; gap:12px; margin-bottom:16px; }
.right-col { display:grid; grid-template-rows:1fr 1fr; gap:12px; }
.card {
  background:var(--card-bg); border:1px solid var(--card-border); border-radius:12px; padding:16px;
  transition:transform 0.2s, box-shadow 0.2s;
}
.card:hover { transform:translateY(-1px); box-shadow:0 2px 12px rgba(92,107,192,0.08); }
.card-header { display:flex; justify-content:space-between; align-items:center; font-size:13px; font-weight:600; margin-bottom:12px; }
.card-body { font-size:13px; }
.tab-group { display:flex; gap:10px; }
.tab { font-size:11px; font-weight:400; color:var(--text-secondary); cursor:pointer; padding:2px 0; }
.tab.active { color:var(--green); border-bottom:2px solid var(--green); }
.loading-skeleton { color:var(--text-secondary); padding:20px 0; text-align:center; }
```

- [ ] **Step 3: Commit**

```bash
git add stock-vision/public/index.html
git commit -m "feat: add middle section and watchlist layout"
```

---

## Phase 3: Data Binding & Charts

### Task 12: Data Fetching Engine + Index Card Rendering

**Files:**
- Modify: `stock-vision/public/index.html`

- [ ] **Step 1: Add data fetching and index card render JS**

Add before `</body>` (but after the existing script include):

```html
<script>
// === CONFIG ===
const API_BASE = '';
const INDICES = [
  { code: 'sh000001', name: '上证指数' },
  { code: 'sz399001', name: '深证成指' },
  { code: 'sz399006', name: '创业板指' },
  { code: 'sh000688', name: '科创50' },
];

const state = { quotes: null, industries: null, northbound: null, sentiment: null, kline: null };

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function fmt(v) { return v != null ? v.toLocaleString('zh-CN', {minimumFractionDigits:2,maximumFractionDigits:2}) : '--'; }
function pct(v) { return v != null ? (v > 0 ? `+${v.toFixed(2)}%` : `${v.toFixed(2)}%`) : '--'; }

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// === INDEX CARDS ===
function renderIndexCards(data) {
  INDICES.forEach(idx => {
    const q = (data.indices || []).find(i => i.code === idx.code);
    document.getElementById(`price-${idx.code}`).textContent = q ? fmt(q.price) : '--';
    const el = document.getElementById(`change-${idx.code}`);
    if (q) {
      el.textContent = pct(q.change);
      el.className = `index-change ${q.change >= 0 ? 'up' : 'down'}`;
    }
  });
}

// === MAIN LOOP ===
async function refreshAll() {
  try {
    const data = await fetchJSON('/api/quotes');
    state.quotes = data;
    renderIndexCards(data);
  } catch(e) { console.error('quotes error:', e); }
}

refreshAll();
setInterval(refreshAll, 30000);
document.getElementById('liveDate').textContent = new Date().toLocaleDateString('zh-CN');
</script>
```

- [ ] **Step 2: Verify data binding works**

Run: `cd /home/denrusn/my-stock/stock-vision && node src/server.js &` then open `http://localhost:8080/` in browser or `curl -s http://localhost:8080/ | grep -o 'price-sh000001">[^<]*'`
Expected: Index prices rendered (not "--")

- [ ] **Step 3: Kill server**

Run: `kill %1 2>/dev/null; true`

- [ ] **Step 4: Commit**

```bash
git add stock-vision/public/index.html
git commit -m "feat: add data fetching engine with index card rendering"
```

---

### Task 13: Industries Table with Bars

**Files:**
- Modify: `stock-vision/public/index.html`

- [ ] **Step 1: Add industries render function**

Add to the `<script>` block after `renderIndexCards`:

```javascript
// === INDUSTRIES ===
function renderIndustries(data) {
  const body = document.getElementById('industriesBody');
  if (!data || !data.industries || !data.industries.length) {
    body.innerHTML = '<div style="color:var(--text-secondary);text-align:center;padding:20px;">暂无数据</div>';
    return;
  }
  const max = Math.max(...data.industries.map(i => Math.abs(i.weekChange)), 0.1);
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:2fr 1fr 1fr 2fr;font-size:11px;color:var(--text-secondary);padding:0 4px 8px 4px;border-bottom:1px solid rgba(255,255,255,0.06);">
      <span>板块名称</span><span style="text-align:right;">周涨幅</span><span style="text-align:right;">月涨幅</span><span></span>
    </div>
    ${data.industries.map((ind, i) => {
      const barW = (Math.abs(ind.weekChange) / max * 100).toFixed(0);
      const barColor = ind.weekChange >= 0 ? '#00c853' : '#ff5252';
      return `<div style="display:grid;grid-template-columns:2fr 1fr 1fr 2fr;align-items:center;padding:5px 4px;font-size:12px;${i % 2 === 0 ? 'background:rgba(255,255,255,0.02);border-radius:4px;' : ''}">
        <span>${ind.name}</span>
        <span style="text-align:right;color:${ind.weekChange >= 0 ? '#00c853' : '#ff5252'};">${pct(ind.weekChange)}</span>
        <span style="text-align:right;color:${ind.monthChange >= 0 ? '#00c853' : '#ff5252'};">${pct(ind.monthChange)}</span>
        <div style="height:6px;background:rgba(255,255,255,0.05);border-radius:3px;overflow:hidden;margin-left:8px;">
          <div style="height:100%;width:${barW}%;background:${barColor};border-radius:3px;"></div>
        </div>
      </div>`;
    }).join('')}`;
}
```

- [ ] **Step 2: Add industries fetch to refreshAll**

Add to `refreshAll()`:
```javascript
try { const d = await fetchJSON('/api/industries'); state.industries = d; renderIndustries(d); }
catch(e) { console.error('industries error:', e); }
```

- [ ] **Step 3: Commit**

```bash
git add stock-vision/public/index.html
git commit -m "feat: add industries table with bar visualization"
```

---

### Task 14: Northbound + Sentiment Panels

**Files:**
- Modify: `stock-vision/public/index.html`

- [ ] **Step 1: Add northbound render function**

```javascript
// === NORTHBOUND ===
function renderNorthbound(data) {
  const body = document.getElementById('northboundBody');
  if (!data) { body.innerHTML = '<div class="loading-skeleton">暂无数据</div>'; return; }
  const color = v => v >= 0 ? '#00c853' : '#ff5252';
  body.innerHTML = `
    <div style="display:flex;gap:16px;margin-bottom:12px;">
      <div><div style="font-size:11px;color:var(--text-secondary);">今日净流入</div>
        <div style="font-size:20px;font-weight:700;color:${color(data.todayNet)};">${fmt(data.todayNet)}亿</div></div>
      <div><div style="font-size:11px;color:var(--text-secondary);">本周累计</div>
        <div style="font-size:20px;font-weight:700;color:${color(data.weekNet)};">${fmt(data.weekNet)}亿</div></div>
      <div><div style="font-size:11px;color:var(--text-secondary);">本月累计</div>
        <div style="font-size:20px;font-weight:700;color:${color(data.monthNet)};">${fmt(data.monthNet)}亿</div></div>
    </div>
    <div style="font-size:10px;color:var(--text-secondary);margin-bottom:6px;">近20日资金流向</div>
    <div style="display:flex;gap:2px;height:20px;">
      ${(data.dailyHistory || []).map(d => {
        const c = d >= 0 ? '#00c853' : '#ff5252';
        const intensity = Math.min(Math.abs(d) / 100, 1);
        return `<div style="flex:1;background:${c};opacity:${Math.max(intensity, 0.2)};border-radius:2px;" title="${d.toFixed(1)}亿"></div>`;
      }).join('')}
    </div>`;
}
```

- [ ] **Step 2: Add sentiment render function**

```javascript
// === SENTIMENT ===
function renderSentiment(data) {
  const body = document.getElementById('sentimentBody');
  if (!data) { body.innerHTML = '<div class="loading-skeleton">暂无数据</div>'; return; }
  body.innerHTML = `
    <div style="display:flex;gap:24px;align-items:center;">
      <div style="position:relative;width:80px;height:80px;">
        <canvas id="sentimentChart"></canvas>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div><span style="color:var(--text-secondary);font-size:11px;">涨停/跌停</span>
          <strong style="color:#00c853;margin-left:8px;">${data.ztCount || 0}</strong>
          <span style="color:var(--text-secondary);">/</span>
          <strong style="color:#ff5252;">${data.dtCount || 0}</strong></div>
        <div><span style="color:var(--text-secondary);font-size:11px;">成交额</span>
          <strong style="margin-left:8px;">${data.totalVolume ? (data.totalVolume/1e8).toFixed(0) : '--'}亿</strong></div>
      </div>
    </div>`;
}
```

- [ ] **Step 3: Add northbound + sentiment fetch to refreshAll**

```javascript
try { const d = await fetchJSON('/api/northbound'); state.northbound = d; renderNorthbound(d); } catch(e) {}
try { const d = await fetchJSON('/api/sentiment'); state.sentiment = d; renderSentiment(d); } catch(e) {}
```

- [ ] **Step 4: Commit**

```bash
git add stock-vision/public/index.html
git commit -m "feat: add northbound and sentiment panels"
```

---

### Task 15: Sentiment Doughnut Chart

**Files:**
- Modify: `stock-vision/public/index.html`

- [ ] **Step 1: Add Chart.js doughnut rendering after sentiment update**

Modify `renderSentiment` to include chart initialization:

```javascript
function renderSentiment(data) {
  const body = document.getElementById('sentimentBody');
  if (!data) { body.innerHTML = '<div class="loading-skeleton">暂无数据</div>'; return; }
  body.innerHTML = `
    <div style="display:flex;gap:24px;align-items:center;">
      <div style="position:relative;width:80px;height:80px;">
        <canvas id="sentimentDoughnut"></canvas>
      </div>
      <div>
        <div style="margin-bottom:6px;"><span style="color:var(--text-secondary);font-size:11px;">涨停</span>
          <strong style="color:#00c853;margin-left:8px;font-size:16px;">${data.ztCount || 0}</strong></div>
        <div style="margin-bottom:6px;"><span style="color:var(--text-secondary);font-size:11px;">跌停</span>
          <strong style="color:#ff5252;margin-left:8px;font-size:16px;">${data.dtCount || 0}</strong></div>
      </div>
    </div>`;
  setTimeout(() => {
    const ctx = document.getElementById('sentimentDoughnut');
    if (!ctx) return;
    if (window._sentimentChart) window._sentimentChart.destroy();
    window._sentimentChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['涨停', '跌停', '其他'],
        datasets: [{
          data: [data.ztCount || 0, data.dtCount || 0, Math.max(100 - (data.ztCount||0) - (data.dtCount||0), 0)],
          backgroundColor: ['#00c853', '#ff5252', 'rgba(255,255,255,0.05)'],
          borderWidth: 0
        }]
      },
      options: { cutout: '60%', plugins: { legend: { display: false } },
        responsive: true, maintainAspectRatio: true }
    });
  }, 50);
}
```

- [ ] **Step 2: Commit**

```bash
git add stock-vision/public/index.html
git commit -m "feat: add sentiment doughnut chart with Chart.js"
```

---

### Task 16: Watchlist K-line Mini Charts

**Files:**
- Modify: `stock-vision/public/index.html`

- [ ] **Step 1: Add watchlist render function**

```javascript
// === WATCHLIST ===
const WATCHLIST_NAMES = {
  'sz002241': '歌尔股份', 'sh603045': '福达合金',
  'sh600396': '华电辽能', 'sz000725': '京东方A', 'sz002155': '湖南黄金'
};

function renderWatchlist(data) {
  const body = document.getElementById('watchlistBody');
  if (!data || !data.stocks) { body.innerHTML = '<div class="loading-skeleton">暂无数据</div>'; return; }
  body.innerHTML = `<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;">
    ${data.stocks.map(s => {
      const q = (state.quotes?.watchlist || []).find(w => w.code === s.code);
      const curPrice = q ? fmt(q.price) : '--';
      const curChange = q ? q.change : 0;
      const canvasId = `kline-${s.code}`;
      return `<div style="background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.04);border-radius:8px;padding:10px;">
        <div style="font-size:11px;color:var(--text-secondary);">${WATCHLIST_NAMES[s.code] || s.code}</div>
        <div style="font-size:16px;font-weight:700;">${curPrice}</div>
        <div style="font-size:11px;color:${curChange >= 0 ? '#00c853' : '#ff5252'};">${pct(curChange)}</div>
        <div style="height:50px;margin-top:6px;"><canvas id="${canvasId}"></canvas></div>
      </div>`;
  }).join('')}</div>`;
  setTimeout(() => {
    data.stocks.forEach(s => {
      const ctx = document.getElementById(`kline-${s.code}`);
      if (!ctx || !s.bars || !s.bars.length) return;
      const closes = s.bars.map(b => b.close || b.c);
      if (!closes.length) return;
      const up = closes[closes.length-1] >= closes[0];
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: closes.map((_, i) => i),
          datasets: [{
            data: closes, borderColor: up ? '#00c853' : '#ff5252',
            borderWidth: 1.5, fill: false, pointRadius: 0, tension: 0.2
          }]
        },
        options: { responsive: true, maintainAspectRatio: true,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: { x: { display: false }, y: { display: false } } }
      });
    });
  }, 100);
}
```

- [ ] **Step 2: Add kline fetch to refreshAll**

```javascript
try { const d = await fetchJSON('/api/kline'); state.kline = d; renderWatchlist(d); } catch(e) { console.error('kline error:', e); }
```

- [ ] **Step 3: Commit**

```bash
git add stock-vision/public/index.html
git commit -m "feat: add watchlist k-line mini charts"
```

---

### Task 17: CountUp Animation + Value Flash

**Files:**
- Modify: `stock-vision/public/index.html`

- [ ] **Step 1: Add animation helpers**

Add before `refreshAll`:

```javascript
// === ANIMATIONS ===
function animateCountUp(el, target, duration = 800) {
  if (!el || target == null) return;
  const start = parseFloat(el.textContent.replace(/,/g, '')) || 0;
  const startTime = performance.now();
  function tick(now) {
    const p = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(start + (target - start) * eased);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

let prevQuotes = {};

function flashOnChange(el, changed) {
  if (!changed || !el) return;
  el.style.transition = 'background 0.3s';
  el.style.background = changed > 0 ? 'rgba(0,200,83,0.1)' : 'rgba(255,82,82,0.1)';
  setTimeout(() => { el.style.background = 'transparent'; }, 1500);
}
```

- [ ] **Step 2: Integrate animations into renderIndexCards**

Modify `renderIndexCards` to use count-up:

```javascript
function renderIndexCards(data) {
  INDICES.forEach(idx => {
    const q = (data.indices || []).find(i => i.code === idx.code);
    const priceEl = document.getElementById(`price-${idx.code}`);
    const changeEl = document.getElementById(`change-${idx.code}`);
    if (q) {
      animateCountUp(priceEl, q.price);
      changeEl.textContent = pct(q.change);
      changeEl.className = `index-change ${q.change >= 0 ? 'up' : 'down'}`;
    }
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add stock-vision/public/index.html
git commit -m "feat: add count-up animation and value flash effects"
```

---

## Phase 4: Polish & Deploy

### Task 18: Loading States + Error Handling

**Files:**
- Modify: `stock-vision/public/index.html`

- [ ] **Step 1: Add error handling wrapper**

Modify `refreshAll`:

```javascript
async function refreshAll() {
  const results = await Promise.allSettled([
    fetchJSON('/api/quotes').then(d => { state.quotes = d; renderIndexCards(d); }).catch(() => showError('quotes')),
    fetchJSON('/api/industries').then(d => { state.industries = d; renderIndustries(d); }).catch(() => showError('industries')),
    fetchJSON('/api/northbound').then(d => { state.northbound = d; renderNorthbound(d); }).catch(() => showError('northbound')),
    fetchJSON('/api/sentiment').then(d => { state.sentiment = d; renderSentiment(d); }).catch(() => showError('sentiment')),
    fetchJSON('/api/kline').then(d => { state.kline = d; renderWatchlist(d); }).catch(() => showError('kline')),
  ]);
  document.getElementById('loadingScreen')?.remove();
}

function showError(section) {
  const map = { industries: 'industriesBody', northbound: 'northboundBody', sentiment: 'sentimentBody', kline: 'watchlistBody' };
  const el = document.getElementById(map[section]);
  if (el && el.innerHTML.includes('加载中')) el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-secondary);font-size:12px;">⚠️ 数据获取失败</div>';
}

let errorCount = 0;
setInterval(() => {
  if (errorCount > 3) {
    alert('多次数据获取失败，请检查后端服务是否正常运行。');
    errorCount = 0;
  }
}, 60000);
```

- [ ] **Step 2: Commit**

```bash
git add stock-vision/public/index.html
git commit -m "feat: add loading states and error handling"
```

---

### Task 19: Tab Switching for K-line Periods

**Files:**
- Modify: `stock-vision/public/index.html`

- [ ] **Step 1: Add tab click handlers**

Add to `<script>`:

```javascript
// === TAB SWITCHING ===
document.addEventListener('click', e => {
  const tab = e.target.closest('.tab');
  if (!tab || !tab.closest('#klineTab')) return;
  $$('#klineTab .tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  const period = tab.dataset.period;
  fetchAndRenderKline(period);
});

async function fetchAndRenderKline(period) {
  try {
    const data = await fetchJSON(`/api/kline?period=${period}`);
    renderWatchlist(data);
  } catch(e) { console.error('kline tab error:', e); }
}
```

- [ ] **Step 2: Update API handler to support period param**

Modify `src/server.js` route handling to pass query params. In the `handleAPI` function, extract `url.searchParams`:

```javascript
async function handleAPI(route, url) {
  const config = DATA_MODULES[route];
  if (!config) return null;
  const cacheKey = route + (url.search || '');
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const period = url.searchParams.get('period') || undefined;
  const data = await config.mod.fetch(period);
  cache.set(cacheKey, data, config.ttl);
  return data;
}
```

And update `src/data/kline.js` to accept `period` param:

```javascript
export async function fetch(period = 'weekly') {
  const results = await Promise.all(
    WATCHLIST.map(code => fetchOne(code, period))
  );
  return { stocks: results, updatedAt: Date.now() };
}

async function fetchOne(code, period) {
  try {
    const kline = await sdk.kline.withIndicators(code, { period, limit: 12 });
    return { code, bars: kline.bars || kline };
  } catch {
    return { code, bars: [] };
  }
}
```

- [ ] **Step 3: Verify tab switching works**

Run: `cd /home/denrusn/my-stock/stock-vision && node src/server.js &` then open browser, click different tabs
Expected: K-line charts switch between daily/weekly/monthly

- [ ] **Step 4: Kill server**

Run: `kill %1 2>/dev/null; true`

- [ ] **Step 5: Commit**

```bash
git add stock-vision/public/index.html stock-vision/src/server.js stock-vision/src/data/kline.js
git commit -m "feat: add kline period tab switching (daily/weekly/monthly)"
```

---

### Task 20: Final Integration Test + LAN Deployment

**Files:**
- Modify: (no new files, just verification)

- [ ] **Step 1: Start server on LAN**

Run: `cd /home/denrusn/my-stock/stock-vision && node src/server.js`
Expected: `📊 Stock Vision running at http://0.0.0.0:8080`

- [ ] **Step 2: Verify all API endpoints return valid data**

```bash
curl -s http://localhost:8080/api/quotes | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.assert(j.indices.length===4,'4 indices');console.assert(j.watchlist.length===5,'5 watchlist');console.log('quotes OK')})"
curl -s http://localhost:8080/api/industries | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.assert(j.industries.length>0,'has industries');console.log('industries OK')})"
curl -s http://localhost:8080/api/northbound | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log('northbound:', JSON.parse(d).todayNet!==undefined?'OK':'FAIL')})"
curl -s http://localhost:8080/api/sentiment | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log('sentiment:', JSON.parse(d).ztCount!==undefined?'OK':'FAIL')})"
curl -s http://localhost:8080/api/kline | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log('kline:', JSON.parse(d).stocks.length===5?'OK':'FAIL')})"
```

- [ ] **Step 3: Access from LAN**

Check: `http://192.168.2.49:8080` (your LAN IP)
Open it in a browser or ask user to try on another device.

- [ ] **Step 4: Kill server**

Run: `kill %1 2>/dev/null; true`

- [ ] **Step 5: Final commit**

```bash
git add -A && git commit -m "feat: complete Stock Vision dashboard v1.0"
```
