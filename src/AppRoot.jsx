import { useEffect, useRef, useState } from 'react'
import App from './App.jsx'
import { useAuth } from './auth/AuthProvider.jsx'
import { getAuthErrorMessage } from './auth/authErrors.js'
import { handleAuthCallbackUrl } from './auth/authService.js'
import { DataSessionProvider } from './components/DataSessionProvider.jsx'
import AuthScreen, { AuthLoading, AuthUnconfigured } from './pages/auth/AuthScreen.jsx'
import ResetPasswordPage from './pages/auth/ResetPasswordPage.jsx'
import { onDeepLink } from './platform/lifecycle.js'

// Development-only offline mode for working on the UI without a Supabase project.
// `import.meta.env.DEV` is statically false in production builds, so this branch is removed.
const DEV_LOCAL_USER =
  import.meta.env.DEV && import.meta.env.VITE_DEV_LOCAL_ONLY === 'true'
    ? { id: '00000000-0000-4000-8000-00000000d0e0', email: 'local-dev' }
    : null

const AUTH_CALLBACK_PARAMS = ['code', 'error', 'error_code']
const handledUrls = new Set()

function isAuthCallback(url) {
  try {
    const parsed = new URL(url)
    const params = new URLSearchParams(`${parsed.search.slice(1)}&${parsed.hash.slice(1)}`)
    return AUTH_CALLBACK_PARAMS.some((name) => params.has(name))
  } catch {
    return false
  }
}

function useAuthCallbacks(onError, isSignedInRef) {
  useEffect(() => {
    function handle(url) {
      if (handledUrls.has(url) || !isAuthCallback(url)) return
      // A link must never switch an already signed-in app to another account.
      if (isSignedInRef.current) return
      handledUrls.add(url)
      handleAuthCallbackUrl(url).then((result) => {
        if (!result.ok) onError(result.errorCode)
      })
    }

    if (typeof window !== 'undefined' && isAuthCallback(window.location.href)) {
      const url = window.location.href
      window.history.replaceState(null, '', window.location.pathname)
      handle(url)
    }
    return onDeepLink(handle)
  }, [onError, isSignedInRef])
}

export default function AppRoot() {
  const auth = useAuth()
  const [callbackError, setCallbackError] = useState('')
  const isSignedInRef = useRef(false)
  useEffect(() => {
    isSignedInRef.current = auth.status === 'signedIn'
  }, [auth.status])
  useAuthCallbacks(setCallbackError, isSignedInRef)

  if (auth.status === 'unconfigured') {
    if (DEV_LOCAL_USER) {
      return (
        <DataSessionProvider user={DEV_LOCAL_USER} cloud={false}>
          <App />
        </DataSessionProvider>
      )
    }
    return <AuthUnconfigured />
  }

  if (auth.status === 'loading') return <AuthLoading />
  if (auth.status === 'passwordRecovery') return <ResetPasswordPage />

  if (auth.status === 'signedIn' && auth.user) {
    return (
      <DataSessionProvider key={auth.user.id} user={auth.user}>
        <App />
      </DataSessionProvider>
    )
  }

  return (
    <>
      {callbackError ? (
        <p className="auth-callback-error" role="alert">
          {getAuthErrorMessage(callbackError)}
        </p>
      ) : null}
      <AuthScreen />
    </>
  )
}
