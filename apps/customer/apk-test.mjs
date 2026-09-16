/* Drive the REAL customer APK on the phone over the WebView DevTools socket.
 *
 * Unlike the headless-Chrome sweep, this runs inside the installed app: the native Capacitor
 * bridge is live, the baked-in LAN backend URL is in force, and the plugins actually exist.
 *
 *   adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
 */
import puppeteer from 'puppeteer-core'

const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: null })
const pages = await browser.pages()
const page = pages.find((p) => p.url().includes('localhost')) || pages[0]
console.log('attached to:', page.url())

// ---------- 1. native bridge ----------
console.log('\n1. Native bridge (only true inside the APK)')
const native = await page.evaluate(() => {
  const C = window.Capacitor
  return {
    hasCapacitor: !!C,
    isNative: !!(C && C.isNativePlatform && C.isNativePlatform()),
    platform: C && C.getPlatform ? C.getPlatform() : null,
    plugins: C && C.Plugins ? Object.keys(C.Plugins).sort() : [],
    ua: navigator.userAgent.includes('wv') ? 'android-webview' : 'browser',
  }
})
console.log('   Capacitor present :', native.hasCapacitor)
console.log('   isNativePlatform  :', native.isNative)
console.log('   platform          :', native.platform)
console.log('   context           :', native.ua)
console.log('   plugins           :', native.plugins.join(', ') || '(none exposed)')

// ---------- 2. backend wiring ----------
console.log('\n2. Backend the APK is actually talking to')
const apiProbe = await page.evaluate(async () => {
  const out = { origin: location.origin, href: location.href }
  try {
    const r = await fetch('http://192.168.0.107:8080/health')
    out.lanHealth = r.status
    out.lanBody = (await r.text()).slice(0, 60)
  } catch (e) { out.lanError = String(e).slice(0, 90) }
  return out
})
console.log('   page origin  :', apiProbe.origin)
console.log('   LAN /health  :', apiProbe.lanHealth ?? apiProbe.lanError, apiProbe.lanBody || '')

// ---------- 3. logged-in state ----------
console.log('\n3. Session state in the app')
const sess = await page.evaluate(() => ({
  token: (localStorage.getItem('hh_token') || '').slice(0, 18),
  user: (localStorage.getItem('hh_user') || '').slice(0, 90),
}))
console.log('   hh_token :', sess.token ? sess.token + '…' : '(none — not signed in)')
console.log('   hh_user  :', sess.user || '(none)')

// ---------- 4. screen sweep inside the APK ----------
const ROUTES = ['/home', '/bookings', '/cart', '/offers', '/notifications', '/profile',
  '/addresses', '/membership', '/wallet', '/support', '/history', '/locations',
  '/ai-home', '/referral', '/settings']
console.log(`\n4. Screen sweep inside the APK (${ROUTES.length} routes)`)
const bad = []
for (const route of ROUTES) {
  const errs = [], net = []
  const onErr = (e) => errs.push(String(e.message || e).slice(0, 120))
  const onCon = (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)) }
  const onRes = (r) => { if (r.status() >= 400) net.push(`${r.status()} ${r.url().slice(0, 70)}`) }
  page.on('pageerror', onErr); page.on('console', onCon); page.on('response', onRes)
  let txt = ''
  try {
    await page.evaluate((r) => { window.history.pushState({}, '', r); window.dispatchEvent(new PopStateEvent('popstate')) }, route)
    await new Promise((r) => setTimeout(r, 900))
    txt = await page.evaluate(() => (document.body.innerText || '').trim().replace(/\s+/g, ' '))
  } catch (e) { errs.push('nav: ' + String(e.message).slice(0, 80)) }
  page.off('pageerror', onErr); page.off('console', onCon); page.off('response', onRes)
  const blankish = txt.length < 25
  const ok = !errs.length && !blankish
  if (!ok) bad.push({ route, errs: [...new Set(errs)], net: [...new Set(net)], chars: txt.length })
  console.log(`   ${ok ? 'ok  ' : 'FAIL'} ${route.padEnd(16)} ${txt.slice(0, 52)}`)
}

console.log('\n' + '='.repeat(66))
console.log(`APK sweep: ${ROUTES.length - bad.length}/${ROUTES.length} screens clean`)
for (const b of bad) {
  console.log(`\n[${b.route}] chars=${b.chars}`)
  b.errs.slice(0, 3).forEach((e) => console.log('   err ' + e))
  b.net.slice(0, 3).forEach((n) => console.log('   net ' + n))
}
console.log('='.repeat(66))

await page.evaluate(() => { window.history.pushState({}, '', '/home'); window.dispatchEvent(new PopStateEvent('popstate')) })
browser.disconnect()
