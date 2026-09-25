import { useState } from 'react'
import { getAuthErrorMessage } from '../../auth/authErrors'
import { updatePassword } from '../../auth/authService'
import { useAuth } from '../../auth/AuthProvider'
import '../../auth/auth.css'

export default function ResetPasswordPage() {
  const { completePasswordRecovery } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [visible, setVisible] = useState(false)
  const [errorCode, setErrorCode] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (password.length < 8) {
      setErrorCode('password_too_short')
      return
    }
    if (password !== confirmation) {
      setErrorCode('passwords_do_not_match')
      return
    }
    setLoading(true)
    setErrorCode('')
    const result = await updatePassword(password)
    setLoading(false)
    if (!result.ok) {
      setErrorCode(result.errorCode)
      return
    }
    completePasswordRecovery()
  }

  return (
    <main className="auth-screen" dir="rtl">
      <section className="auth-card">
        <div className="auth-accent" aria-hidden="true">🔐</div>
        <h1>בחירת סיסמה חדשה</h1>
        <p>הסיסמה צריכה להכיל לפחות 8 תווים.</p>
        <form className="auth-form" onSubmit={submit}>
          <div className="auth-field">
            <label htmlFor="reset-password">סיסמה חדשה</label>
            <div className="auth-password">
              <input
                id="reset-password"
                dir="ltr"
                type={visible ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                type="button"
                className="auth-password__toggle"
                aria-label={visible ? 'הסתרת סיסמה' : 'הצגת סיסמה'}
                onClick={() => setVisible((current) => !current)}
              >
                {visible ? 'הסתרה' : 'הצגה'}
              </button>
            </div>
          </div>
          <div className="auth-field">
            <label htmlFor="reset-confirmation">אימות סיסמה חדשה</label>
            <input
              id="reset-confirmation"
              dir="ltr"
              type={visible ? 'text' : 'password'}
              autoComplete="new-password"
              minLength={8}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
            />
          </div>
          {errorCode && (
            <p className="auth-error" role="alert">{getAuthErrorMessage(errorCode)}</p>
          )}
          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? 'מעדכנים…' : 'שמירת הסיסמה'}
          </button>
        </form>
      </section>
    </main>
  )
}
