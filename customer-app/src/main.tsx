import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { StoreProvider } from './store'
import { initApiBase } from './api'
import { Capacitor } from '@capacitor/core'

// Draw the app edge-to-edge behind a transparent status bar (true full screen). The
// content is kept clear of the clock via `padding-top: env(safe-area-inset-top)` in CSS.
if (Capacitor.isNativePlatform()) {
  import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {})
    StatusBar.setStyle({ style: Style.Light }).catch(() => {}) // dark icons for the light app
  }).catch(() => {})
}
// Self-hosted Inter — bundled into the app so the font ALWAYS applies (no network dependency)
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'
import './index.css'

// Resolve the backend URL from the public config before the app makes any API call,
// then render. Falls back to the baked URL if the config fetch fails or is slow.
function start() {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <StoreProvider>
          <App />
        </StoreProvider>
      </BrowserRouter>
    </React.StrictMode>,
  )
}

// Don't block forever on a slow network — cap the wait, then start with whatever we have.
Promise.race([initApiBase(), new Promise((r) => setTimeout(r, 2500))]).then(start)
