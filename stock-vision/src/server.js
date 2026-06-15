// Stock Vision HTTP server
// Serves API data from data modules and static files from public/

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as cache from './cache.js';
import * as quotes from './data/quotes.js';
import * as industries from './data/industries.js';
import * as northbound from './data/northbound.js';
import * as sentiment from './data/sentiment.js';
import * as kline from './data/kline.js';

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Route definitions: method, pattern, handler factory
const routes = [
  { method: 'GET', path: '/api/quotes', ttl: 30000, fetch: () => quotes.fetch() },
  { method: 'GET', path: '/api/industries', ttl: 300000, fetch: () => industries.fetch() },
  { method: 'GET', path: '/api/northbound', ttl: 300000, fetch: () => northbound.fetch() },
  { method: 'GET', path: '/api/sentiment', ttl: 30000, fetch: () => sentiment.fetch() },
  {
    method: 'GET',
    path: '/api/kline',
    ttl: 600000,
    fetch: (url) => {
      const period = new URL(url, 'http://x').searchParams.get('period') || 'weekly';
      return kline.fetch(period);
    }
  }
];

function handleApiRoute(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || HOST}`);
  const route = routes.find(r => r.method === req.method && r.path === url.pathname);

  if (!route) return false;

  const cacheKey = url.pathname + url.search;
  const cached = cache.get(cacheKey);
  if (cached) {
    writeJson(res, 200, cached);
    return true;
  }

  const dataPromise = route.fetch(req.url);
  if (dataPromise && typeof dataPromise.then === 'function') {
    dataPromise
      .then(data => {
        cache.set(cacheKey, data, route.ttl);
        writeJson(res, 200, data);
      })
      .catch(err => {
        console.error(`Error fetching ${url.pathname}:`, err);
        writeJson(res, 500, { error: 'Internal server error', message: err.message });
      });
  } else {
    writeJson(res, 200, dataPromise);
  }

  return true;
}

function writeJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

function serveStaticFile(req, res) {
  let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);

  // Security: prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Fall through to index.html for SPA-style routing
        const fallback = path.join(PUBLIC_DIR, 'index.html');
        fs.readFile(fallback, (err2, data2) => {
          if (err2) {
            res.writeHead(404);
            res.end('Not Found');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(data2);
        });
        return;
      }
      res.writeHead(500);
      res.end('Internal Server Error');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // Try API routes first
  if (handleApiRoute(req, res)) return;

  // Serve static files
  serveStaticFile(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Stock Vision server running at http://${HOST}:${PORT}/`);
});
