import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { getSupabase, isCloudConfigured } from './supabaseClient'

const AuthContext = createContext(null)

function publicUser(session) {
  if (!session?.user) return null
  return { id: session.user.id, email: session.user.email ?? '' }
}

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState({
    status: isCloudConfigured ? 'loading' : 'unconfigured',
    user: null,
    session: null,
  })

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return undefined
    let active = true

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return
        const session = error ? null : data.session
        setAuthState({
          status: session ? 'signedIn' : 'signedOut',
          user: publicUser(session),
          session,
        })
      })
      .catch(() => {
        if (active) {
          setAuthState({ status: 'signedOut', user: null, session: null })
        }
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY') {
        setAuthState({
          status: 'passwordRecovery',
          user: publicUser(session),
          session,
        })
        return
      }
      if (event === 'SIGNED_OUT' || !session) {
        setAuthState({ status: 'signedOut', user: null, session: null })
        return
      }
      setAuthState({
        status: 'signedIn',
        user: publicUser(session),
        session,
      })
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const completePasswordRecovery = useCallback(() => {
    setAuthState((current) =>
      current.session
        ? { ...current, status: 'signedIn' }
        : { status: 'signedOut', user: null, session: null },
    )
  }, [])

  const value = useMemo(
    () => ({ ...authState, completePasswordRecovery }),
    [authState, completePasswordRecovery],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
