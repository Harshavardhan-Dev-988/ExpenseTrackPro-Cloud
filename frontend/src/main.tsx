import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './config/amplify'
import App from './App.tsx'
import AuthGate from './components/auth/AuthGate'
import ErrorBoundary from './components/ui/ErrorBoundary'
import { ToastProvider } from './components/ui/Toast'
import { ConfirmProvider } from './components/ui/ConfirmDialog'
import CategoriesProvider from './components/categories/CategoriesProvider'
import HouseholdProvider from './components/household/HouseholdProvider'
import './services/install'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <ConfirmProvider>
          <AuthGate>
            <HouseholdProvider>
              <CategoriesProvider>
                <App />
              </CategoriesProvider>
            </HouseholdProvider>
          </AuthGate>
        </ConfirmProvider>
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
)

// Installable app + offline shell (public/sw.js). Production builds only:
// in development a service worker would serve stale modules.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker not registered:', err))
  })
}
