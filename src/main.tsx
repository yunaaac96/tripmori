import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// Explicit SW registration — with injectManifest strategy vite-plugin-pwa no
// longer auto-injects a registration script, so we must call registerSW
// ourselves to guarantee `navigator.serviceWorker.ready` resolves and the
// browser fires `beforeinstallprompt`.
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Fade out and remove the inline splash screen once React has painted its first frame.
// Double-rAF ensures we're past the first browser paint, avoiding a flash of unstyled content.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const splash = document.getElementById('app-splash')
    if (splash) {
      splash.style.opacity = '0'
      setTimeout(() => splash.remove(), 280)
    }
  })
})