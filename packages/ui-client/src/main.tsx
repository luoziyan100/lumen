import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { bootstrapAppearance } from './appearance'
import './tokens.css'
import './kumo.css'
import './styles.css'

bootstrapAppearance()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
