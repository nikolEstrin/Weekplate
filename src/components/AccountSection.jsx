import { useEffect, useRef, useState } from 'react'
import { getAuthErrorMessage } from '../auth/authErrors'
import '../auth/auth.css'

const PRIVACY_POLICY_URL = import.meta.env.VITE_PRIVACY_POLICY_URL?.trim() || ''

export default function AccountSection({ email, onSignOut, onDeleteAccount }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [errorCode, setErrorCode] = useState('')
  const confirmationRef = useRef(null)

  useEffect(() => {
    if (dialogOpen) confirmationRef.current?.focus()
  }, [dialogOpen])

  async function signOut() {
    setBusyAction('signout')
    setErrorCode('')
    try {
      await onSignOut()
    } catch {
      setErrorCode('unknown_error')
    } finally {
      setBusyAction('')
    }
  }

  async function deleteAccount() {
    setBusyAction('delete')
    setErrorCode('')
    try {
      const result = await onDeleteAccount()
      if (!result.ok) {
        setErrorCode(result.errorCode || 'delete_failed')
        setBusyAction('')
      }
    } catch {
      setErrorCode('delete_failed')
      setBusyAction('')
    }
  }

  function closeDialog() {
    if (busyAction) return
    setDialogOpen(false)
    setConfirmation('')
    setErrorCode('')
  }

  return (
    <section className="settings-card account-card">
      <h2 className="settings-card__title">👤 החשבון שלי</h2>
      <p className="account-card__email" dir="ltr">{email}</p>
      {errorCode && !dialogOpen && (
        <p className="auth-error" role="alert">{getAuthErrorMessage(errorCode)}</p>
      )}
      <button
        className="btn-secondary"
        type="button"
        onClick={signOut}
        disabled={Boolean(busyAction)}
      >
        {busyAction === 'signout' ? 'מתנתקים…' : 'התנתקות'}
      </button>
      <button
        className="account-card__delete"
        type="button"
        onClick={() => setDialogOpen(true)}
        disabled={Boolean(busyAction)}
      >
        מחיקת חשבון
      </button>
      {PRIVACY_POLICY_URL && (
        <a
          className="account-card__privacy"
          href={PRIVACY_POLICY_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          מדיניות פרטיות
        </a>
      )}

      {dialogOpen && (
        <div className="today-sheet-root account-dialog-root">
          <button
            className="today-sheet-backdrop"
            type="button"
            aria-label="סגירת חלון מחיקת החשבון"
            onClick={closeDialog}
          />
          <div className="today-sheet account-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
            <div className="today-sheet__handle" aria-hidden="true" />
            <div className="today-sheet__body">
              <h2 id="delete-account-title">מחיקת החשבון לצמיתות</h2>
              <p>
                הפעולה תמחק לצמיתות את החשבון, המידע בענן והמידע השמור במכשיר.
                אי אפשר לבטל אותה.
              </p>
              <div className="auth-field">
                <label htmlFor="delete-confirmation">
                  כדי להמשיך, יש להקליד <strong>מחיקה</strong>
                </label>
                <input
                  id="delete-confirmation"
                  ref={confirmationRef}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="off"
                />
              </div>
              {errorCode && (
                <p className="auth-error" role="alert">{getAuthErrorMessage(errorCode)}</p>
              )}
              <button
                className="account-dialog__confirm"
                type="button"
                disabled={confirmation !== 'מחיקה' || Boolean(busyAction)}
                onClick={deleteAccount}
              >
                {busyAction === 'delete' ? 'מוחקים…' : 'מחיקת החשבון'}
              </button>
              <button className="btn-secondary" type="button" onClick={closeDialog} disabled={Boolean(busyAction)}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
