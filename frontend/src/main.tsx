import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './config/amplify'
import App from './App.tsx'
import AuthGate from './components/auth/AuthGate'
import ErrorBoundary from './components/ui/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthGate>
        <App />
      </AuthGate>
    </ErrorBoundary>
  </StrictMode>,
)
