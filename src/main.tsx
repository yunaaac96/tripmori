import { StrictMode } from 'react' // 1. 把這行解除註解（拿掉 //）
import { createRoot } from 'react-dom/client'
import './index.css' // 2. 留一個就好
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)