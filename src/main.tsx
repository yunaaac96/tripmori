import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

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