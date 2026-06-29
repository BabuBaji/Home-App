// Headless screenshotter for the web app. Usage:
//   node shot.mjs <token> home=/home service=/service/cleaning ...
import puppeteer from 'puppeteer-core'

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://localhost:5173'
const token = process.argv[2]
const routes = process.argv.slice(3)

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
page.on('console', (m) => { if (m.type() === 'error') console.log('  [console.error]', m.text().slice(0, 200)) })

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await page.evaluate((t) => localStorage.setItem('hh_token', t), token)

for (const r of routes) {
  const [name, path] = r.split('=')
  const url = BASE + path
  console.log('navigating', JSON.stringify(url))
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
    await new Promise((res) => setTimeout(res, 1800))
    await page.screenshot({ path: `C:/Users/Smartgrow/Home-App/_shot_${name}.png`, fullPage: true })
    console.log('shot', name, '->', path)
  } catch (e) { console.log('FAILED', name, e.message) }
}
await browser.close()
