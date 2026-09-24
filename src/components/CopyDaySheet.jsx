import { useEffect, useMemo, useState } from 'react'
import {
  COPY_CATEGORY_OPTIONS,
  CopyIconDay,
  CopyPlanCategories,
  CopyPlanChip,
  CopyPlanChips,
  CopyPlanDateChip,
  CopyPlanOptions,
  CopyPlanSection,
  CopyPlanSheet,
} from './CopyPlanSheet.jsx'
import {
  COPY_DAY_MODES,
  copyDayPlan,
  DAY_PLAN_COPY_CATEGORIES,
  getDayPlan,
  getLocalDateKey,
  isDayPlanEmpty,
} from '../services/storage.js'

const HEBREW_WEEKDAY_FULL = [
  'יום ראשון',
  'יום שני',
  'יום שלישי',
  'יום רביעי',
  'יום חמישי',
  'יום שישי',
  'יום שבת',
]

const DAY_CONFLICT_OPTIONS = [
  {
    id: COPY_DAY_MODES.REPLACE,
    label: 'החלף את התכנון הקיים',
    hint: 'התכנון הנוכחי בימים שנבחרו יוחלף',
  },
  {
    id: COPY_DAY_MODES.MERGE,
    label: 'הוסף לתכנון הקיים',
    hint: 'הארוחות שיועתקו יתווספו לתכנון הקיים',
  },
  {
    id: COPY_DAY_MODES.SELECTIVE,
    label: 'בחר מה להעתיק',
    hint: 'בחר אילו ארוחות להעתיק מהיום',
  },
]

function parseDateKey(dateKey) {
  const parts = String(dateKey).split('-').map(Number)
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return new Date()
  }
  const [year, month, day] = parts
  return new Date(year, month - 1, day)
}

function addDays(date, amount) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function formatShortDate(dateKey) {
  const date = parseDateKey(dateKey)
  return `${date.getDate()}.${date.getMonth() + 1}`
}

function formatSourceLabel(dateKey) {
  const date = parseDateKey(dateKey)
  const weekday = HEBREW_WEEKDAY_FULL[date.getDay()] || ''
  return `${weekday}, ${formatShortDate(dateKey)}`
}

/**
 * Bottom-sheet UI for copying one planned day to one or more targets.
 */
export default function CopyDaySheet({ sourceDateKey, onClose, onSuccess }) {
  const sourceDate = parseDateKey(sourceDateKey)
  const tomorrowKey = getLocalDateKey(addDays(sourceDate, 1))
  const nextWeekdayKey = getLocalDateKey(addDays(sourceDate, 7))
  const nextWeekdayLabel = `${HEBREW_WEEKDAY_FULL[sourceDate.getDay()] || 'יום'} הבא`

  const [destKeys, setDestKeys] = useState([])
  const [quickTarget, setQuickTarget] = useState(null)
  const [multiMode, setMultiMode] = useState(false)
  const [mode, setMode] = useState(COPY_DAY_MODES.REPLACE)
  const [categories, setCategories] = useState(() => [...DAY_PLAN_COPY_CATEGORIES])
  const [error, setError] = useState('')

  useEffect(() => {
    setDestKeys([])
    setQuickTarget(null)
    setMultiMode(false)
    setMode(COPY_DAY_MODES.REPLACE)
    setCategories([...DAY_PLAN_COPY_CATEGORIES])
    setError('')
  }, [sourceDateKey])

  const conflictingCount = useMemo(() => {
    let count = 0
    for (const key of destKeys) {
      if (!isDayPlanEmpty(getDayPlan(key))) {
        count += 1
      }
    }
    return count
  }, [destKeys])

  function setSingleDest(dateKey, targetId) {
    if (!dateKey || dateKey === sourceDateKey) {
      setError('תאריך היעד חייב להיות שונה מיום המקור')
      return
    }
    setDestKeys([dateKey])
    setQuickTarget(targetId)
    setMultiMode(false)
    setError('')
  }

  function addDestKey(dateKey, { append = false } = {}) {
    const key = typeof dateKey === 'string' ? dateKey.trim() : ''
    if (!key) {
      return
    }
    if (key === sourceDateKey) {
      setError('תאריך היעד חייב להיות שונה מיום המקור')
      return
    }
    setDestKeys((current) => {
      if (append) {
        return current.includes(key) ? current : [...current, key]
      }
      return [key]
    })
    setError('')
  }

  function removeDestKey(dateKey) {
    setDestKeys((current) => current.filter((key) => key !== dateKey))
  }

  function toggleCategory(categoryId) {
    setCategories((current) => {
      if (current.includes(categoryId)) {
        return current.filter((id) => id !== categoryId)
      }
      return DAY_PLAN_COPY_CATEGORIES.filter(
        (id) => current.includes(id) || id === categoryId,
      )
    })
    setError('')
  }

  function handleSubmit() {
    if (destKeys.length === 0) {
      setError('יש לבחור תאריך יעד')
      return
    }
    if (mode === COPY_DAY_MODES.SELECTIVE && categories.length === 0) {
      setError('יש לבחור לפחות קטגוריה אחת להעתקה')
      return
    }

    const result = copyDayPlan(sourceDateKey, destKeys, {
      mode,
      slots: mode === COPY_DAY_MODES.SELECTIVE ? categories : undefined,
      replaceExplicitly: mode === COPY_DAY_MODES.REPLACE,
    })

    if (!result.ok) {
      setError(
        result.errors?.destination ||
          result.errors?.slots ||
          'לא ניתן להעתיק את היום',
      )
      return
    }

    onSuccess?.({
      destinationDateKeys: result.destinationDateKeys || destKeys,
      previousPlans: result.previousPlans || {},
      mode: result.mode,
    })
    onClose?.()
  }

  const canSubmit =
    destKeys.length > 0 &&
    (mode !== COPY_DAY_MODES.SELECTIVE || categories.length > 0)

  return (
    <CopyPlanSheet
      theme="day"
      titleId="copy-day-sheet-title"
      title="העתקת יום"
      subtitle={formatSourceLabel(sourceDateKey)}
      caption="יועתקו כל הארוחות ביום זה"
      heroIcon={<CopyIconDay />}
      onClose={onClose}
      error={error}
      submitLabel={destKeys.length > 1 ? `העתק (${destKeys.length})` : 'העתק'}
      onSubmit={handleSubmit}
      submitDisabled={!canSubmit}
    >
      <CopyPlanSection title="בחר לאן להעתיק">
        <CopyPlanChips>
          <CopyPlanChip
            active={quickTarget === 'tomorrow'}
            disabled={tomorrowKey === sourceDateKey}
            onClick={() => setSingleDest(tomorrowKey, 'tomorrow')}
          >
            מחר
          </CopyPlanChip>
          <CopyPlanChip
            active={quickTarget === 'nextWeekday'}
            onClick={() => setSingleDest(nextWeekdayKey, 'nextWeekday')}
          >
            {nextWeekdayLabel}
          </CopyPlanChip>
          <CopyPlanDateChip
            active={quickTarget === 'custom'}
            label="בחר תאריך"
            onPick={(dateKey) => {
              setMultiMode(false)
              setQuickTarget('custom')
              addDestKey(dateKey, { append: false })
            }}
          />
          <CopyPlanDateChip
            active={multiMode || quickTarget === 'multi'}
            label="כמה ימים"
            ariaLabel="הוספת כמה תאריכי יעד"
            onPick={(dateKey) => {
              setMultiMode(true)
              setQuickTarget('multi')
              addDestKey(dateKey, { append: true })
            }}
          />
        </CopyPlanChips>
      </CopyPlanSection>

      {destKeys.length > 0 ? (
        <section
          className="copy-day-sheet__selected"
          aria-label={`תאריכים שנבחרו ${destKeys.length}`}
        >
          <h3 className="copy-day-sheet__section-title">
            תאריכים שנבחרו ({destKeys.length})
          </h3>
          <ul className="copy-day-sheet__dest-chips">
            {destKeys.map((key) => (
              <li key={key}>
                <button
                  type="button"
                  className="copy-day-sheet__dest-chip"
                  onClick={() => removeDestKey(key)}
                  aria-label={`הסרת ${formatShortDate(key)}`}
                >
                  <span>{formatShortDate(key)}</span>
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
          {conflictingCount > 0 ? (
            <p className="copy-day-sheet__conflict-note">
              ל־{conflictingCount} מהימים שנבחרו כבר יש תכנון
            </p>
          ) : null}
        </section>
      ) : null}

      <CopyPlanSection title="אם יש תכנון קיים">
        <CopyPlanOptions
          name="copy-day-mode"
          value={mode}
          options={DAY_CONFLICT_OPTIONS}
          onChange={(next) => {
            setMode(next)
            setError('')
          }}
        />
      </CopyPlanSection>

      {mode === COPY_DAY_MODES.SELECTIVE ? (
        <CopyPlanSection title="בחר מה להעתיק">
          <CopyPlanCategories
            categories={COPY_CATEGORY_OPTIONS}
            selected={categories}
            onToggle={toggleCategory}
          />
        </CopyPlanSection>
      ) : null}
    </CopyPlanSheet>
  )
}
