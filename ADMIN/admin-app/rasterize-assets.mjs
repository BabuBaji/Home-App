// Rasterize the admin icon/splash SVGs to PNGs for @capacitor/assets.
import puppeteer from 'puppeteer-core'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const A = (f) => join(__dirname, 'assets', f)
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const JOBS = [
  { svg: 'icon-background.svg', png: 'icon-background.png', size: 1024, transparent: false },
  { svg: 'icon-foreground.svg', png: 'icon-foreground.png', size: 1024, transparent: true },
  { svg: 'logo.svg', png: 'logo.png', size: 1024, transparent: true },
  { svg: 'logo.svg', png: 'icon-only.png', size: 1024, transparent: true },
  { svg: 'splash.svg', png: 'splash.png', size: 2732, transparent: false },
  { svg: 'splash.svg', png: 'splash-dark.png', size: 2732, transparent: false },
]

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
for (const j of JOBS) {
  const svg = readFileSync(A(j.svg), 'utf8')
  await page.setViewport({ width: j.size, height: j.size, deviceScaleFactor: 1 })
  await page.setContent(`<style>*{margin:0;padding:0}svg{display:block;width:${j.size}px;height:${j.size}px}</style>${svg}`, { waitUntil: 'domcontentloaded' })
  await new Promise((r) => setTimeout(r, 150))
  const el = await page.$('svg')
  const buf = await el.screenshot({ omitBackground: j.transparent })
  writeFileSync(A(j.png), buf)
  console.log('rasterized', j.png, `${j.size}px`)
}
await browser.close()
