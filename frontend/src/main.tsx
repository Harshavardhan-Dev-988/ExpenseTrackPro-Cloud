import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './config/amplify'
import App from './App.tsx'
import AuthGate from './components/auth/AuthGate'
import ErrorBoundary from './components/ui/ErrorBoundary'
import { ToastProvider } from './components/ui/Toast'
import { ConfirmProvider } from './components/ui/ConfirmDialog'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <ConfirmProvider>
          <AuthGate>
            <App />
          </AuthGate>
        </ConfirmProvider>
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
)
