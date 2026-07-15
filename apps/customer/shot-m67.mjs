// Screenshots for Module 6 (Live Job Tracking) + Module 7 (Rating).
// Injects a real auth token (demo-44) and shoots each route for booking 53 (assigned to rahul).
import puppeteer from 'puppeteer-core'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://localhost:5173'
const OUT = 'C:/Users/Smartgrow/Downloads/CUSTOMER_UPDATED SCREENS'
const TOKEN = 'demo-44'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const shots = [
  ['m6_42_worker_assigned', '/job/53'],
  ['m6_43_worker_profile', '/job/53/worker'],
  ['m6_44_on_the_way', '/job/53/otw'],
  ['m6_45_live_map', '/job/53/map'],
  ['m6_46_chat', '/job/53/chat'],
  ['m6_47_call', '/job/53/call'],
  ['m6_48_share_otp', '/job/53/otp'],
  ['m6_49_service_started', '/job/53/started'],
  ['m6_50_live_progress', '/job/53/progress'],
  ['m6_51_service_completed', '/job/53/completed'],
  ['m7_52_rate_worker', '/rate/53'],
  ['m7_53_upload_photos', '/rate/53/photos'],
  ['m7_54_complaint', '/complaint/53'],
  ['m7_55_tip', '/tip/53'],
  ['m7_56_rebook', '/rebook/53'],
  ['m7_57_refer', '/refer'],
]

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
await page.evaluateOnNewDocument((tok) => { localStorage.setItem('hh_token', tok) }, TOKEN)
page.on('console', (m) => { if (m.type() === 'error') console.log('  [err]', m.text().slice(0, 140)) })

// warm boot so /me + splash settle once
await page.goto(BASE + '/home', { waitUntil: 'networkidle2' }).catch(() => {})
await sleep(3500)

for (const [name, route] of shots) {
  await page.goto(BASE + route, { waitUntil: 'networkidle2' }).catch(() => {})
  await sleep(route.includes('/map') ? 4200 : 2600) // maps need OSRM/tiles
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log('shot', name)
}
await browser.close()
console.log('DONE')
