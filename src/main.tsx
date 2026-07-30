import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './auth/AuthContext'
import { AthleteProvider } from './lib/athlete'
import { LanguageProvider } from './lib/i18n'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LanguageProvider>
    <AuthProvider>
      <AthleteProvider>
        <App />
      </AthleteProvider>
    </AuthProvider>
    </LanguageProvider>
  </React.StrictMode>,
)
