import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { deleteAccount as deleteCloudAccount, signOut as signOutCloud } from '../auth/authService.js'
import { getSupabase } from '../auth/supabaseClient.js'
import { onAppPause, onAppResume } from '../platform/lifecycle.js'
import { getIsOnline, onNetworkChange } from '../platform/network.js'
import { deleteLocalUserData, startDataSession } from '../services/dataSession.js'
import localState from '../services/localState.js'
import { createSupabaseRemote } from '../sync/supabaseRemote.js'
import { AuthLoading } from '../pages/auth/AuthScreen.jsx'

const DataSessionContext = createContext(null)

const IDLE_STATUS = { state: 'idle', pendingCount: 0, lastSyncedAt: null, errorCode: null }

/**
 * Opens the signed-in user's own SQLite database, hydrates the synchronous
 * storage layer from it and runs sync. Children render only once local data
 * is ready; a different user always gets a fresh session and database.
 */
export function DataSessionProvider({ user, cloud = true, children }) {
  const [session, setSession] = useState(null)
  const [status, setStatus] = useState(IDLE_STATUS)
  const [dataVersion, setDataVersion] = useState(() => localState.getDataVersion())
  const [writeError, setWriteError] = useState(null)
  const [failed, setFailed] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const sessionRef = useRef(null)
  const deletingRef = useRef(false)
  const userId = user.id

  useEffect(() => {
    let cancelled = false
    const supabase = cloud ? getSupabase() : null
    startDataSession({
      userId,
      remote: supabase ? createSupabaseRemote(supabase) : null,
      platform: { getIsOnline, onNetworkChange, onResume: onAppResume },
    })
      .then((started) => {
        if (cancelled) {
          started.stop()
          return
        }
        sessionRef.current = started
        setStatus(started.getStatus())
        setSession(started)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      const current = sessionRef.current
      sessionRef.current = null
      setSession(null)
      current?.stop({ finalSync: !deletingRef.current })
    }
  }, [userId, cloud, attempt])

  useEffect(() => {
    if (!session) return undefined
    const unsubscribeStatus = session.subscribeStatus(setStatus)
    const unsubscribeData = localState.subscribeDataChanges(setDataVersion)
    const unsubscribeState = localState.subscribe(() => {
      setWriteError(localState.getLastWriteError() ? 'local_write_failed' : null)
    })
    const unsubscribePause = onAppPause(() => {
      session.flush().catch(() => {})
    })
    return () => {
      unsubscribeStatus()
      unsubscribeData()
      unsubscribeState()
      unsubscribePause()
    }
  }, [session])

  async function signOut() {
    setLeaving(true)
    await sessionRef.current?.stop()
    await signOutCloud()
  }

  async function deleteAccount() {
    deletingRef.current = true
    const result = await deleteCloudAccount()
    if (!result.ok) {
      deletingRef.current = false
      return result
    }
    setLeaving(true)
    await deleteLocalUserData(userId)
    await signOutCloud()
    return result
  }

  if (failed) {
    return (
      <main className="auth-screen" dir="rtl">
        <p className="auth-error" role="alert">
          לא הצלחנו לפתוח את הנתונים במכשיר.
        </p>
        <button
          className="auth-submit"
          type="button"
          onClick={() => {
            setFailed(false)
            setAttempt((value) => value + 1)
          }}
        >
          לנסות שוב
        </button>
        {cloud && (
          <button className="btn-secondary" type="button" onClick={() => signOutCloud()}>
            התנתקות
          </button>
        )}
      </main>
    )
  }

  if (!session || leaving) return <AuthLoading />

  const value = {
    email: user.email,
    isCloud: cloud,
    status: writeError ? { ...status, state: 'error', errorCode: writeError } : status,
    dataVersion,
    retrySync: () => session.syncEngine?.retryNow() ?? Promise.resolve(),
    signOut,
    deleteAccount,
  }

  return <DataSessionContext.Provider value={value}>{children}</DataSessionContext.Provider>
}

export function useDataSession() {
  const value = useContext(DataSessionContext)
  if (!value) throw new Error('useDataSession must be used inside DataSessionProvider')
  return value
}
