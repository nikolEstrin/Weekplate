import { useState } from 'react'
import { useDataSession } from './DataSessionProvider.jsx'

export function describeSyncStatus(status, isCloud) {
  if (!isCloud) return { tone: 'muted', text: 'מצב מקומי (פיתוח) — ללא סנכרון' }
  if (status.errorCode === 'local_write_failed') {
    return { tone: 'error', text: 'שמירת השינוי האחרון במכשיר נכשלה. נסו שוב.' }
  }
  if (status.state === 'offline') {
    return status.pendingCount > 0
      ? { tone: 'warn', text: 'אין חיבור לאינטרנט — השינויים נשמרו במכשיר ויסונכרנו כשהחיבור יחזור.' }
      : { tone: 'muted', text: 'אין חיבור לאינטרנט — מוצגים הנתונים השמורים במכשיר.' }
  }
  if (status.state === 'error') {
    return status.errorCode === 'rejected'
      ? { tone: 'error', text: 'חלק מהשינויים לא נשמרו בענן.' }
      : { tone: 'error', text: 'הסנכרון נכשל. השינויים שמורים במכשיר.' }
  }
  if (status.state === 'syncing') return { tone: 'muted', text: 'מסנכרנים…' }
  if (status.pendingCount > 0) {
    return { tone: 'muted', text: `ממתינים לסנכרון: ${status.pendingCount}` }
  }
  return { tone: 'ok', text: 'הכול מסונכרן' }
}

/** Shown only when something needs the user's attention (offline with changes, or errors). */
export default function SyncStatusBanner() {
  const { status, isCloud, retrySync } = useDataSession()
  const [retrying, setRetrying] = useState(false)
  if (!isCloud) return null
  const important =
    status.state === 'error' || (status.state === 'offline' && status.pendingCount > 0)
  if (!important) return null
  const { tone, text } = describeSyncStatus(status, isCloud)

  async function retry() {
    setRetrying(true)
    try {
      await retrySync()
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className={`sync-banner sync-banner--${tone}`} role="status">
      <span>{text}</span>
      {status.state === 'error' ? (
        <button type="button" className="sync-banner__retry" onClick={retry} disabled={retrying}>
          {retrying ? 'מנסים…' : 'נסו שוב'}
        </button>
      ) : null}
    </div>
  )
}
