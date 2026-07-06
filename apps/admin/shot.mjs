// Headless screenshotter for the admin web app. Usage:
//   node shot.mjs <token> dashboard=/dashboard customers=/customers ...
import puppeteer from 'puppeteer-core'

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://localhost:5174'
const token = process.argv[2]
const routes = process.argv.slice(3)
const W = Number(process.env.W || 1440), H = Number(process.env.H || 900)

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
page.on('console', (m) => { if (m.type() === 'error') console.log('  [console.error]', m.text().slice(0, 200)) })

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await page.evaluate((t) => localStorage.setItem('hha_token', t), token)

for (const r of routes) {
  const [name, path] = r.split('=')
  try {
    await page.goto(BASE + path, { waitUntil: 'networkidle2', timeout: 30000 })
    await new Promise((res) => setTimeout(res, 1400))
    await page.screenshot({ path: `C:/Users/Smartgrow/Home-App/_admin_${name}.png` })
    console.log('shot', name, '->', path)
  } catch (e) { console.log('FAILED', name, e.message) }
}
await browser.close()
