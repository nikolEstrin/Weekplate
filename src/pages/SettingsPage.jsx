import { useRef, useState } from 'react'
import {
  exportLibrary,
  getGoals,
  getLibraryExportFilename,
  importLibrary,
  parseLibraryJson,
  saveGoals,
} from '../services/storage.js'

const GOAL_FIELDS = [
  { name: 'calories', label: 'קלוריות', id: 'goal-calories' },
  { name: 'protein', label: 'חלבון', id: 'goal-protein' },
  { name: 'carbs', label: 'פחמימות', id: 'goal-carbs' },
  { name: 'fat', label: 'שומן', id: 'goal-fat' },
]

function goalsToForm(goals) {
  return {
    calories: String(goals.calories),
    protein: String(goals.protein),
    carbs: String(goals.carbs),
    fat: String(goals.fat),
  }
}

function downloadJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function SettingsPage() {
  const [form, setForm] = useState(() => goalsToForm(getGoals()))
  const [errors, setErrors] = useState({})
  const [saved, setSaved] = useState(false)

  const fileInputRef = useRef(null)
  const [pendingImport, setPendingImport] = useState(null)
  const [backupStatus, setBackupStatus] = useState(null)
  const [backupError, setBackupError] = useState(null)

  function handleChange(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
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
    setErrors({})
    setSaved(true)
  }

  function clearBackupMessages() {
    setBackupStatus(null)
    setBackupError(null)
  }

  function handleExport() {
    clearBackupMessages()
    try {
      const data = exportLibrary()
      downloadJsonFile(getLibraryExportFilename(), data)
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

      <form className="goals-form" onSubmit={handleSubmit} noValidate>
        <h2 className="goals-form__title">יעדים יומיים</h2>

        {GOAL_FIELDS.map((field) => (
          <div className="product-field" key={field.name}>
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
        ))}

        <button type="submit" className="goals-form__save">
          שמירת יעדים
        </button>

        {saved ? <p className="goals-form__status">היעדים נשמרו.</p> : null}
      </form>

      <section className="backup-panel" aria-labelledby="backup-title">
        <h2 id="backup-title" className="goals-form__title">
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
    </section>
  )
}

export default SettingsPage
