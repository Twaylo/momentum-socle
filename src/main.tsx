import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import './theme/jetons.css'

const racine = document.getElementById('racine')
if (!racine) throw new Error('L’élément #racine est absent de index.html.')

createRoot(racine).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
