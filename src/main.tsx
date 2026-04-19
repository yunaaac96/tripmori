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

// Inline #app-splash fade-out is now triggered from inside <SplashScreen />
// (useEffect after first paint), so we know React's splash is visible before
// the inline one starts fading — no gap, no flash.