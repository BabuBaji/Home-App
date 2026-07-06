// HomeHelp APK install page + downloader (zero dependencies).
// Serves a phone-friendly landing page at / and streams the two debug APKs with the
// correct Android content-type so tapping "Install" downloads + installs on the device.
// Expose it publicly with:  cloudflared tunnel --url http://localhost:8091
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.INSTALL_PORT || 8091)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') // repo root

// Two apps only: customer + worker. label/file/served-name.
const APPS = [
  { key: 'customer', name: 'HomeHelp', tag: 'Customer App',
    desc: 'Book trusted home services — cleaning, repairs, salon & more.',
    file: 'HomeHelp-customer.apk', download: 'HomeHelp-Customer.apk',
    icon: '🏠', tint: '#5b51e8', tint2: '#7c6bff' },
  { key: 'worker', name: 'HomeHelp Pro', tag: 'Worker App',
    desc: 'For service professionals — accept jobs, navigate & earn.',
    file: 'HomeHelp-Pro-worker.apk', download: 'HomeHelp-Pro.apk',
    icon: '🛠️', tint: '#16a34a', tint2: '#22c55e' },
]

const fmtSize = (b) => b >= 1e6 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB'
const sizeOf = (f) => { try { return fs.statSync(path.join(ROOT, f)).size } catch { return 0 } }

function page() {
  const cards = APPS.map((a) => {
    const size = sizeOf(a.file)
    const ok = size > 0
    return `
    <article class="card" style="--tint:${a.tint};--tint2:${a.tint2}">
      <div class="ico">${a.icon}</div>
      <div class="meta">
        <h2>${a.name}</h2>
        <span class="tag">${a.tag}</span>
        <p>${a.desc}</p>
        <div class="sub">${ok ? `Android · APK · ${fmtSize(size)}` : 'APK not built yet'}</div>
      </div>
      ${ok
        ? `<a class="btn" href="/${a.download}" download>⬇ Install</a>`
        : `<span class="btn disabled">Unavailable</span>`}
    </article>`
  }).join('')

  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Install HomeHelp</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,'Segoe UI',Roboto,system-ui,sans-serif;color:#1a1726;
    min-height:100vh;padding:28px 18px 48px;
    background:radial-gradient(1200px 600px at 50% -10%,#eef0ff 0%,#f7f7fb 45%,#f4f5f9 100%)}
  .wrap{max-width:520px;margin:0 auto}
  header{text-align:center;margin-bottom:26px}
  .brand{display:inline-flex;align-items:center;gap:10px;font-weight:800;font-size:20px;letter-spacing:-.02em}
  .brand .dot{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;font-size:18px;
    background:linear-gradient(135deg,#5b51e8,#7c6bff);box-shadow:0 6px 16px rgba(91,81,232,.35)}
  header p{color:#6b6880;font-size:13.5px;margin-top:8px}
  .card{position:relative;display:flex;align-items:center;gap:15px;background:#fff;
    border:1px solid #ececf3;border-radius:18px;padding:16px 16px;margin-bottom:14px;
    box-shadow:0 2px 4px rgba(26,23,38,.04);overflow:hidden}
  .card::before{content:'';position:absolute;inset:0 auto 0 0;width:5px;background:linear-gradient(var(--tint),var(--tint2))}
  .ico{flex-shrink:0;width:56px;height:56px;border-radius:15px;display:grid;place-items:center;font-size:27px;
    background:color-mix(in srgb,var(--tint) 12%,#fff);border:1px solid color-mix(in srgb,var(--tint) 20%,#fff)}
  .meta{flex:1;min-width:0}
  .meta h2{font-size:16.5px;font-weight:800;letter-spacing:-.02em}
  .tag{display:inline-block;font-size:11px;font-weight:700;color:var(--tint);
    background:color-mix(in srgb,var(--tint) 10%,#fff);padding:2px 8px;border-radius:999px;margin:3px 0 6px}
  .meta p{font-size:12.5px;color:#6b6880;line-height:1.4}
  .sub{font-size:11.5px;color:#98959f;margin-top:7px;font-weight:600}
  .btn{flex-shrink:0;align-self:stretch;display:flex;align-items:center;text-decoration:none;
    padding:0 16px;border-radius:13px;font-weight:700;font-size:13.5px;color:#fff;white-space:nowrap;
    background:linear-gradient(135deg,var(--tint),var(--tint2));box-shadow:0 6px 14px color-mix(in srgb,var(--tint) 35%,transparent)}
  .btn:active{transform:translateY(1px)}
  .btn.disabled{background:#c9c7d2;box-shadow:none;color:#fff;pointer-events:none}
  .note{background:#fff;border:1px solid #ececf3;border-radius:14px;padding:14px 16px;margin-top:8px}
  .note h3{font-size:12.5px;font-weight:800;color:#1a1726;margin-bottom:8px;display:flex;gap:7px;align-items:center}
  .note ol{margin:0 0 0 16px;padding:0}
  .note li{font-size:12px;color:#6b6880;line-height:1.7}
  footer{text-align:center;color:#a9a6b3;font-size:11px;margin-top:22px}
  @media(max-width:380px){.card{flex-wrap:wrap}.btn{width:100%;justify-content:center;padding:11px}}
</style></head>
<body><div class="wrap">
  <header>
    <div class="brand"><span class="dot">🏠</span> HomeHelp</div>
    <p>Install the app on your Android phone — tap a button below.</p>
  </header>
  ${cards}
  <div class="note">
    <h3>📲 Installing on Android</h3>
    <ol>
      <li>Tap <b>Install</b> — the APK downloads to your phone.</li>
      <li>Open the downloaded file (check your notifications / Downloads).</li>
      <li>If asked, allow <b>“Install from unknown sources”</b> for your browser, then confirm <b>Install</b>.</li>
    </ol>
  </div>
  <footer>Debug builds · for testing only</footer>
</div></body></html>`
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0])
  if (url === '/' || url === '/index.html') {
    const html = page()
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    return res.end(html)
  }
  const app = APPS.find((a) => url === '/' + a.download)
  if (app) {
    const abs = path.join(ROOT, app.file)
    let st
    try { st = fs.statSync(abs) } catch { res.writeHead(404); return res.end('APK not found') }
    res.writeHead(200, {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Length': st.size,
      'Content-Disposition': `attachment; filename="${app.download}"`,
      'Cache-Control': 'no-store',
    })
    return fs.createReadStream(abs).pipe(res)
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not found')
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[install] serving on http://localhost:${PORT}`)
  for (const a of APPS) console.log(`[install]   /${a.download.padEnd(22)} -> ${a.file} (${fmtSize(sizeOf(a.file)) || 'missing'})`)
})
