// Serves the built admin panel AND proxies /api + /socket.io to the gateway, on ONE origin.
//
// Single-origin is a hard requirement, not a convenience: src/api.ts forces API_BASE='' in the
// browser and relies on a local /api proxy. Pointing the panel at the gateway's own tunnel instead
// breaks - two *.trycloudflare.com hosts get coalesced onto one HTTP/2 connection and requests
// misroute (see the comment in src/api.ts). So: one tunnel -> this server -> gateway.
//
// Static files come from dist/, with SPA fallback so deep links like /workers still boot the app.

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT) || 8101;
const GATEWAY = { host: '127.0.0.1', port: 8080 };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

const isApi = (url) => url.startsWith('/api') || url.startsWith('/socket.io') || url.startsWith('/uploads');

// Pipe an API request straight through to the gateway, headers and body intact, so auth
// (Authorization: Bearer ...) and uploads keep working untouched.
function proxy(req, res) {
  const up = http.request(
    { host: GATEWAY.host, port: GATEWAY.port, method: req.method, path: req.url, headers: { ...req.headers, host: `${GATEWAY.host}:${GATEWAY.port}` } },
    (r) => { res.writeHead(r.statusCode || 502, r.headers); r.pipe(res); },
  );
  up.on('error', (e) => {
    console.log(`proxy error ${req.method} ${req.url}: ${e.message}`);
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'gateway unreachable' }));
  });
  req.pipe(up);
}

function serveFile(file, res) {
  const ext = path.extname(file).toLowerCase();
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      // hashed asset filenames may cache; index.html must not, or a redeploy serves a stale shell
      'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600',
    });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  if (isApi(req.url)) { proxy(req, res); return; }

  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }

  fs.stat(file, (err, st) => {
    // Unknown path with no file extension = a client-side route -> hand back the SPA shell.
    if (err || !st.isFile()) { serveFile(path.join(ROOT, 'index.html'), res); return; }
    serveFile(file, res);
  });
});

// socket.io upgrades to a WebSocket; without this the admin live feed silently falls back to polling.
server.on('upgrade', (req, socket, head) => {
  const up = http.request({ host: GATEWAY.host, port: GATEWAY.port, method: req.method, path: req.url, headers: { ...req.headers, host: `${GATEWAY.host}:${GATEWAY.port}` } });
  up.on('upgrade', (ur, us, uhead) => {
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(ur.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n`);
    if (uhead && uhead.length) us.unshift(uhead);
    us.pipe(socket); socket.pipe(us);
  });
  up.on('error', () => socket.destroy());
  if (head && head.length) up.write(head);
  up.end();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[admin] serving ${ROOT} on http://0.0.0.0:${PORT}  (api -> ${GATEWAY.host}:${GATEWAY.port})`);
});
