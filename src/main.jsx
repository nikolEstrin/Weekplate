import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AppRoot from './AppRoot.jsx'
import { AuthProvider } from './auth/AuthProvider.jsx'
import { hideSplash, initPlatform } from './platform/native.js'

async function startApp() {
  await initPlatform()

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <AuthProvider>
        <AppRoot />
      </AuthProvider>
    </StrictMode>,
  )

  requestAnimationFrame(() => {
    hideSplash()
  })
}

startApp()
