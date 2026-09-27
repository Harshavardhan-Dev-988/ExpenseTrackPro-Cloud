import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './config/amplify'
import App from './App.tsx'
import AuthGate from './components/auth/AuthGate'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </StrictMode>,
)
