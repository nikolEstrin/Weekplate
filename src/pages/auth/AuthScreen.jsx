import { useState } from 'react'
import {
  requestPasswordReset,
  signIn,
  signUp,
} from '../../auth/authService'
import { getAuthErrorMessage } from '../../auth/authErrors'
import '../../auth/auth.css'

function PasswordField({ id, label, value, onChange, autoComplete }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-password">
        <input
          id={id}
          dir="ltr"
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          minLength={8}
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
  )
}

function AuthCard({ title, subtitle, children }) {
  return (
    <main className="auth-screen" dir="rtl">
      <section className="auth-card">
        <div className="auth-accent" aria-hidden="true">🥗</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
        {children}
      </section>
    </main>
  )
}

export function AuthLoading() {
  return (
    <AuthCard title="רק רגע…" subtitle="מכינים את Weekplate עבורך.">
      <div className="auth-loading" role="status">טוענים את החשבון…</div>
    </AuthCard>
  )
}

export function AuthUnconfigured() {
  return (
    <AuthCard
      title="החיבור לענן עדיין לא מוכן"
      subtitle="יש להגדיר את פרטי Supabase לפני שניתן להתחבר."
    />
  )
}

export default function AuthScreen() {
  const [view, setView] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [errorCode, setErrorCode] = useState('')
  const [loading, setLoading] = useState(false)

  function changeView(nextView) {
    setView(nextView)
    setErrorCode('')
    setPassword('')
    setConfirmation('')
  }

  async function submit(event) {
    event.preventDefault()
    setErrorCode('')
    if (view === 'register' && password !== confirmation) {
      setErrorCode('passwords_do_not_match')
      return
    }
    if (view !== 'forgot' && password.length < 8) {
      setErrorCode('password_too_short')
      return
    }

    setLoading(true)
    const result =
      view === 'login'
        ? await signIn({ email, password })
        : view === 'register'
          ? await signUp({ email, password })
          : await requestPasswordReset(email)
    setLoading(false)

    if (!result.ok) {
      setErrorCode(result.errorCode)
      return
    }
    if (view === 'register' && result.needsEmailConfirmation) {
      setView('confirm')
    } else if (view === 'forgot') {
      setView('resetSent')
    }
  }

  if (view === 'confirm' || view === 'resetSent') {
    const reset = view === 'resetSent'
    return (
      <AuthCard
        title="כדאי לבדוק את האימייל 📬"
        subtitle={
          reset
            ? 'שלחנו קישור לבחירת סיסמה חדשה.'
            : 'שלחנו קישור לאישור החשבון. לאחר האישור אפשר להתחבר.'
        }
      >
        <button className="auth-link-button" type="button" onClick={() => changeView('login')}>
          חזרה להתחברות
        </button>
      </AuthCard>
    )
  }

  const isRegister = view === 'register'
  const isForgot = view === 'forgot'
  return (
    <AuthCard
      title={isRegister ? 'יצירת חשבון' : isForgot ? 'איפוס סיסמה' : 'טוב שחזרת'}
      subtitle={
        isForgot
          ? 'נשלח אליך קישור מאובטח לבחירת סיסמה חדשה.'
          : 'מתכננים שבוע טעים ומאוזן, יחד.'
      }
    >
      <form className="auth-form" onSubmit={submit}>
        <div className="auth-field">
          <label htmlFor="auth-email">אימייל</label>
          <input
            id="auth-email"
            dir="ltr"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        {!isForgot && (
          <PasswordField
            id="auth-password"
            label="סיסמה"
            value={password}
            onChange={setPassword}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
          />
        )}
        {isRegister && (
          <PasswordField
            id="auth-confirm-password"
            label="אימות סיסמה"
            value={confirmation}
            onChange={setConfirmation}
            autoComplete="new-password"
          />
        )}
        {errorCode && (
          <p className="auth-error" role="alert">{getAuthErrorMessage(errorCode)}</p>
        )}
        <button className="auth-submit" type="submit" disabled={loading}>
          {loading
            ? 'רק רגע…'
            : isRegister
              ? 'יצירת חשבון'
              : isForgot
                ? 'שליחת קישור'
                : 'התחברות'}
        </button>
      </form>
      <div className="auth-switches">
        {view === 'login' && (
          <>
            <button type="button" onClick={() => changeView('forgot')}>שכחתי סיסמה</button>
            <button type="button" onClick={() => changeView('register')}>אין לי חשבון</button>
          </>
        )}
        {view !== 'login' && (
          <button type="button" onClick={() => changeView('login')}>חזרה להתחברות</button>
        )}
      </div>
    </AuthCard>
  )
}
