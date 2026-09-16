// Tiny zero-dependency static server for distributing the HomeHelp APKs.
//
// It exists so the APKs can be handed out over a Cloudflare tunnel WITHOUT touching the
// microservices gateway on :8080 or app-config.json - i.e. nothing about the running apps
// changes, this is download-only. Run it on its own port and point a separate tunnel at it.
//
// Serves apk-dist/ and nothing else. Android needs the APK mime type below or Chrome saves
// the file as a generic download that the package installer refuses to open.

const http = require('http');
const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8099;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.apk' : 'application/vnd.android.package-archive',
  '.png' : 'image/png',
  '.jpg' : 'image/jpeg',
  '.svg' : 'image/svg+xml',
};

http.createServer((req, res) => {
  // Only ever read files that resolve back inside ROOT - blocks ../ traversal.
  const rel  = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      console.log(`404 ${rel}`);
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
      return;
    }

    const ext  = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const head = {
      'Content-Type' : type,
      'Content-Length': st.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',       // always hand out the APK currently on disk
    };
    if (ext === '.apk') {
      head['Content-Disposition'] = `attachment; filename="${path.basename(file)}"`;
    }

    if (req.method === 'HEAD') { res.writeHead(200, head).end(); return; }

    // Range support: a 20MB APK over a tunnel on mobile data drops often enough that
    // resumable downloads are worth the few extra lines.
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      if (m) {
        const start = m[1] ? parseInt(m[1], 10) : 0;
        const end   = m[2] ? parseInt(m[2], 10) : st.size - 1;
        if (start >= st.size || end >= st.size || start > end) {
          res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }).end();
          return;
        }
        console.log(`206 ${rel} ${start}-${end}`);
        res.writeHead(206, {
          ...head,
          'Content-Length': end - start + 1,
          'Content-Range' : `bytes ${start}-${end}/${st.size}`,
        });
        fs.createReadStream(file, { start, end }).pipe(res);
        return;
      }
    }

    console.log(`200 ${rel} (${(st.size / 1048576).toFixed(2)} MB)`);
    res.writeHead(200, head);
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log(`[apk-dist] serving ${ROOT} on http://0.0.0.0:${PORT}`);
});
