#!/usr/bin/env node
'use strict';
// Zero-dependency local server: serves public/ and runs the Netlify functions
// in process, the same way /api/* is routed on Netlify. Handy when you do not
// want to install the Netlify CLI. Reads .env if present.
//   npm run dev:local   then open http://localhost:8888
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}
if (!process.env.SUPABASE_URL && process.env.ALLOW_DEV_AUTH === undefined) process.env.ALLOW_DEV_AUTH = 'true';

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const PORT = Number(process.env.PORT || 8888);

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).replace(/[^a-z-]/g, '');
    const file = path.join(ROOT, 'netlify', 'functions', `${name}.js`);
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('{"error":"Not found"}'); }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const event = {
      httpMethod: req.method,
      headers: req.headers,
      queryStringParameters: Object.fromEntries(url.searchParams),
      body: chunks.length ? Buffer.concat(chunks).toString('utf8') : null,
      isBase64Encoded: false,
    };
    const out = await require(file).handler(event, {});
    res.writeHead(out.statusCode, out.headers || {});
    return res.end(out.body);
  }
  let p = path.join(ROOT, 'public', decodeURIComponent(url.pathname));
  if (!p.startsWith(path.join(ROOT, 'public'))) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) p = path.join(ROOT, 'public', 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(PORT, () => console.log(`CheckMyTrade dev server on http://localhost:${PORT}`));
