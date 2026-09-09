import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { initAnalytics } from './analytics.js'
import App from './App.jsx'
import { I18nProvider } from './i18n/index.jsx'
import './styles/app.css'

initAnalytics()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
