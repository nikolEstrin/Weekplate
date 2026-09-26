import { useRef, useState } from 'react'
import {
  exportLibrary,
  getGoals,
  getLibraryExportFilename,
  importLibrary,
  parseLibraryJson,
  saveGoals,
} from '../services/storage.js'
import { shareJsonFile } from '../platform/share.js'
import {
  exportBackup,
  getBackupFilename,
  importBackup,
  parseBackupJson,
} from '../services/backup.js'
import AccountSection from '../components/AccountSection.jsx'
import { useDataSession } from '../components/DataSessionProvider.jsx'
import { describeSyncStatus } from '../components/SyncStatusBanner.jsx'

const GOAL_FIELDS = [
  { name: 'calories', label: 'קלוריות', id: 'goal-calories' },
  { name: 'protein', label: 'חלבון', id: 'goal-protein' },
  { name: 'carbs', label: 'פחמימות', id: 'goal-carbs' },
  { name: 'fat', label: 'שומן', id: 'goal-fat' },
]

const OVERAGE_PRESETS = [0, 50, 100, 150, 200]

function goalsToForm(goals) {
  return {
    calories: String(goals.calories),
    protein: String(goals.protein),
    carbs: String(goals.carbs),
    fat: String(goals.fat),
    allowedCalorieOverage: String(goals.allowedCalorieOverage ?? 100),
  }
}

function SettingsPage() {
  const [form, setForm] = useState(() => goalsToForm(getGoals()))
  const [errors, setErrors] = useState({})
  const [saved, setSaved] = useState(false)

  const fileInputRef = useRef(null)
  const [pendingImport, setPendingImport] = useState(null)
  const [backupStatus, setBackupStatus] = useState(null)
  const [backupError, setBackupError] = useState(null)

  const dataSession = useDataSession()
  const [formDirty, setFormDirty] = useState(false)
  const [seenDataVersion, setSeenDataVersion] = useState(dataSession.dataVersion)
  if (seenDataVersion !== dataSession.dataVersion) {
    setSeenDataVersion(dataSession.dataVersion)
    if (!formDirty) setForm(goalsToForm(getGoals()))
  }
  const syncDescription = describeSyncStatus(dataSession.status, dataSession.isCloud)
  const [syncing, setSyncing] = useState(false)
  const fullBackupInputRef = useRef(null)
  const [fullBackupBusy, setFullBackupBusy] = useState(false)
  const [fullBackupStatus, setFullBackupStatus] = useState(null)
  const [fullBackupError, setFullBackupError] = useState(null)

  async function handleSyncNow() {
    setSyncing(true)
    try {
      await dataSession.retrySync()
    } finally {
      setSyncing(false)
    }
  }

  async function handleFullExport() {
    setFullBackupStatus(null)
    setFullBackupError(null)
    const result = await shareJsonFile({
      filename: getBackupFilename(),
      json: exportBackup(),
      title: 'הנתונים שלי ב-Weekplate',
    })
    if (result.cancelled) return
    if (result.ok) setFullBackupStatus('הקובץ יוצא בהצלחה.')
    else setFullBackupError('הייצוא נכשל.')
  }

  function handleFullImportClick() {
    setFullBackupStatus(null)
    setFullBackupError(null)
    if (fullBackupInputRef.current) {
      fullBackupInputRef.current.value = ''
      fullBackupInputRef.current.click()
    }
  }

  async function handleFullBackupSelected(event) {
    const file = event.target.files && event.target.files[0]
    if (!file) return
    setFullBackupBusy(true)
    setFullBackupStatus(null)
    setFullBackupError(null)
    try {
      const parsed = parseBackupJson(await file.text())
      if (!parsed.ok) {
        setFullBackupError('הקובץ אינו גיבוי תקין של Weekplate.')
        return
      }
      const report = await importBackup(parsed.data)
      if (!report.ok) {
        setFullBackupError('השחזור נכשל. הנתונים הקיימים לא שונו.')
        return
      }
      const added = Object.values(report.counts).reduce((sum, count) => sum + count, 0)
      const kept = Object.values(report.skipped).reduce((sum, count) => sum + count, 0)
      setFullBackupStatus(
        kept > 0
          ? `שוחזרו ${added} פריטים. ${kept} פריטים שכבר קיימים נשארו ללא שינוי.`
          : `שוחזרו ${added} פריטים.`,
      )
    } catch {
      setFullBackupError('לא ניתן לקרוא את הקובץ.')
    } finally {
      setFullBackupBusy(false)
    }
  }

  function handleChange(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    setFormDirty(true)
    setSaved(false)
  }

  function handleSubmit(event) {
    event.preventDefault()

    const result = saveGoals(form)
    if (!result.ok) {
      setErrors(result.errors)
      setSaved(false)
      return
    }

    setForm(goalsToForm(result.goals))
    setFormDirty(false)
    setErrors({})
    setSaved(true)
  }

  function clearBackupMessages() {
    setBackupStatus(null)
    setBackupError(null)
  }

  async function handleExport() {
    clearBackupMessages()
    try {
      const result = await shareJsonFile({
        filename: getLibraryExportFilename(),
        json: exportLibrary(),
        title: 'גיבוי Weekplate',
      })
      if (result.cancelled) {
        return
      }
      if (!result.ok) {
        throw new Error('export failed')
      }
      setBackupStatus('הקובץ יוצא בהצלחה.')
    } catch {
      setBackupError('הייצוא נכשל.')
    }
  }

  function handleImportClick() {
    clearBackupMessages()
    setPendingImport(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  function handleFileSelected(event) {
    const file = event.target.files && event.target.files[0]
    if (!file) {
      return
    }

    clearBackupMessages()
    setPendingImport(null)

    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      const parsed = parseLibraryJson(text)
      if (!parsed.ok) {
        setBackupError(parsed.error)
        return
      }

      setPendingImport(parsed.data)
    }
    reader.onerror = () => {
      setBackupError('לא ניתן לקרוא את הקובץ.')
    }
    reader.readAsText(file)
  }

  function handleImportMode(mode) {
    if (!pendingImport) {
      return
    }

    clearBackupMessages()
    const result = importLibrary(pendingImport, mode)
    if (!result.ok) {
      setBackupError(result.error || 'הייבוא נכשל.')
      return
    }

    setPendingImport(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    setBackupStatus(
      mode === 'replace'
        ? 'המוצרים והארוחות הוחלפו בהצלחה.'
        : 'הנתונים מוזגו בהצלחה.',
    )
  }

  function handleCancelImport() {
    setPendingImport(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    clearBackupMessages()
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>הגדרות</h1>
      </header>

      <aside className="settings-hero" aria-label="הודעת עידוד">
        <span className="settings-hero__emoji" aria-hidden="true">
          🥑
        </span>
        <p className="settings-hero__text">
          צעדים קטנים, תוצאות גדולות ✨
        </p>
      </aside>

      <form className="goals-form" onSubmit={handleSubmit} noValidate>
        <h2 className="goals-form__title">
          <span aria-hidden="true">🎯</span>
          יעדים יומיים
        </h2>

        {GOAL_FIELDS.map((field) => (
          <div key={field.name}>
            <div className="product-field">
              <label htmlFor={field.id}>{field.label}</label>
              <input
                id={field.id}
                name={field.name}
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                className="input-ltr"
                value={form[field.name]}
                onChange={handleChange}
                aria-invalid={errors[field.name] ? 'true' : 'false'}
              />
              {errors[field.name] ? (
                <span className="product-field__error">{errors[field.name]}</span>
              ) : null}
            </div>

            {field.name === 'calories' ? (
              <div className="product-field goals-overage-field">
                <label htmlFor="goal-calorie-overage">טווח חריגה מותר</label>
                <p className="product-field__hint" id="goal-calorie-overage-hint">
                  כמה קלוריות אפשר לעבור מעל היעד היומי לפני שהיום יסומן כחריגה.
                </p>
                <div
                  className="meal-filter-chips goals-overage-presets"
                  role="group"
                  aria-label="בחירה מהירה לטווח חריגה"
                >
                  {OVERAGE_PRESETS.map((preset) => {
                    const selected =
                      String(form.allowedCalorieOverage) === String(preset)
                    return (
                      <button
                        key={preset}
                        type="button"
                        className={
                          selected ? 'meal-chip meal-chip--active' : 'meal-chip'
                        }
                        aria-pressed={selected ? 'true' : 'false'}
                        onClick={() => {
                          setForm((current) => ({
                            ...current,
                            allowedCalorieOverage: String(preset),
                          }))
                          setFormDirty(true)
                          setSaved(false)
                        }}
                      >
                        <span className="num">{preset}</span>
                      </button>
                    )
                  })}
                </div>
                <input
                  id="goal-calorie-overage"
                  name="allowedCalorieOverage"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="500"
                  step="1"
                  className="input-ltr"
                  value={form.allowedCalorieOverage}
                  onChange={handleChange}
                  aria-describedby="goal-calorie-overage-hint"
                  aria-invalid={errors.allowedCalorieOverage ? 'true' : 'false'}
                />
                {errors.allowedCalorieOverage ? (
                  <span className="product-field__error">
                    {errors.allowedCalorieOverage}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}

        <button type="submit" className="goals-form__save">
          שמירת יעדים
        </button>

        {saved ? <p className="goals-form__status">היעדים נשמרו.</p> : null}
      </form>

      <section className="backup-panel" aria-labelledby="backup-title">
        <h2 id="backup-title" className="goals-form__title">
          <span aria-hidden="true">💾</span>
          גיבוי ושחזור
        </h2>

        <p className="backup-panel__hint">
          ייצוא וייבוא של מוצרים וארוחות בלבד. תוכניות יומיות ויעדים לא נכללים.
        </p>

        <button type="button" className="btn-primary" onClick={handleExport}>
          ייצוא מוצרים וארוחות
        </button>

        <button type="button" className="btn-secondary" onClick={handleImportClick}>
          ייבוא מקובץ
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          onChange={handleFileSelected}
          aria-label="בחירת קובץ לייבוא"
        />

        {pendingImport ? (
          <div className="backup-panel__modes" role="group" aria-label="מצב ייבוא">
            <p className="backup-panel__modes-title">איך לייבא את הקובץ?</p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => handleImportMode('merge')}
            >
              מיזוג עם הנתונים הקיימים
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleImportMode('replace')}
            >
              החלפת כל המוצרים והארוחות
            </button>
            <button
              type="button"
              className="backup-panel__cancel"
              onClick={handleCancelImport}
            >
              ביטול
            </button>
          </div>
        ) : null}

        {backupStatus ? (
          <p className="goals-form__status" role="status">
            {backupStatus}
          </p>
        ) : null}
        {backupError ? (
          <p className="backup-panel__error" role="alert">
            {backupError}
          </p>
        ) : null}
      </section>

      <section className="backup-panel settings-card" aria-labelledby="my-data-title">
        <h2 id="my-data-title" className="settings-card__title">
          <span aria-hidden="true">🗂️</span>
          הנתונים שלי
        </h2>
        <div className="sync-status-row" role="status">
          <span>
            <span
              className={`sync-status-row__dot sync-status-row__dot--${syncDescription.tone}`}
              aria-hidden="true"
            />
            {syncDescription.text}
          </span>
          {dataSession.isCloud ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={handleSyncNow}
              disabled={syncing || dataSession.status.state === 'syncing'}
            >
              {syncing ? 'מסנכרנים…' : 'סנכרון עכשיו'}
            </button>
          ) : null}
        </div>
        <p className="backup-panel__hint">
          ייצוא של כל הנתונים שלך — מוצרים, ארוחות, תכנונים, יעדים ורשימות קניות — לקובץ JSON.
          שחזור מקובץ מוסיף רק פריטים שעדיין לא קיימים.
        </p>
        <button type="button" className="btn-primary" onClick={handleFullExport}>
          ייצוא כל הנתונים שלי
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={handleFullImportClick}
          disabled={fullBackupBusy}
        >
          {fullBackupBusy ? 'משחזרים…' : 'שחזור מגיבוי מלא'}
        </button>
        <input
          ref={fullBackupInputRef}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          onChange={handleFullBackupSelected}
          aria-label="בחירת קובץ גיבוי מלא"
        />
        {fullBackupStatus ? (
          <p className="goals-form__status" role="status">
            {fullBackupStatus}
          </p>
        ) : null}
        {fullBackupError ? (
          <p className="backup-panel__error" role="alert">
            {fullBackupError}
          </p>
        ) : null}
      </section>

      {dataSession.isCloud ? (
        <AccountSection
          email={dataSession.email}
          onSignOut={dataSession.signOut}
          onDeleteAccount={dataSession.deleteAccount}
        />
      ) : null}

      <section className="settings-card" aria-labelledby="prefs-title">
        <h2 id="prefs-title" className="settings-card__title">
          <span aria-hidden="true">ℹ️</span>
          העדפות / מידע
        </h2>
        <ul className="settings-card__list">
          <li className="settings-card__row">
            <span className="settings-card__row-label">אפליקציה</span>
            <span className="settings-card__row-value">Weekplate</span>
          </li>
          <li className="settings-card__row">
            <span className="settings-card__row-label">שפה</span>
            <span className="settings-card__row-value">עברית</span>
          </li>
          <li className="settings-card__row">
            <span className="settings-card__row-label">כיוון</span>
            <span className="settings-card__row-value">ימין לשמאל</span>
          </li>
        </ul>
      </section>
    </section>
  )
}

export default SettingsPage
