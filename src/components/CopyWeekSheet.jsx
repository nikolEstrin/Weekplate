import { useEffect, useMemo, useState } from 'react'
import {
  COPY_CATEGORY_OPTIONS,
  CopyIconWeek,
  CopyPlanCategories,
  CopyPlanChip,
  CopyPlanChips,
  CopyPlanDateChip,
  CopyPlanOptions,
  CopyPlanSection,
  CopyPlanSheet,
} from './CopyPlanSheet.jsx'
import {
  buildWeekCopyPairs,
  COPY_DAY_MODES,
  COPY_WEEK_DAY_ACTIONS,
  copyWeekPlan,
  DAY_PLAN_COPY_CATEGORIES,
  getDayPlan,
  getLocalDateKey,
  getWeekDayKeys,
  getWeekStartKey,
  isDayPlanEmpty,
} from '../services/storage.js'

const HEBREW_WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

const WEEK_CONFLICT_REPLACE = 'replace'
const WEEK_CONFLICT_MERGE = 'merge'
const WEEK_CONFLICT_PER_DAY = 'perDay'

const WEEK_CONFLICT_OPTIONS = [
  {
    id: WEEK_CONFLICT_REPLACE,
    label: 'החלף ימים רלוונטיים',
    hint: 'רק ימים עם תכנון במקור יוחלפו ביעד',
  },
  {
    id: WEEK_CONFLICT_MERGE,
    label: 'הוסף לתכנון הקיים',
    hint: 'הארוחות שיועתקו יתווספו לימים המקבילים',
  },
  {
    id: WEEK_CONFLICT_PER_DAY,
    label: 'בחר עבור כל יום',
    hint: 'בחרו החלפה, מיזוג או דילוג לכל יום עם התנגשות',
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

function formatWeekRange(weekStartKey) {
  const days = getWeekDayKeys(weekStartKey)
  return `${formatShortDate(days[0])}–${formatShortDate(days[6])}`
}

function allCategoriesSelected(selected) {
  return DAY_PLAN_COPY_CATEGORIES.every((id) => selected.includes(id))
}

/**
 * Mobile-first Copy Week sheet — reuses CopyPlanSheet chrome from Copy Day.
 */
export default function CopyWeekSheet({
  sourceWeekStartKey,
  onClose,
  onSuccess,
}) {
  const sourceWeekStart = getWeekStartKey(sourceWeekStartKey)
  const nextWeekStart = getLocalDateKey(
    addDays(parseDateKey(sourceWeekStart), 7),
  )
  const twoWeeksStart = getLocalDateKey(
    addDays(parseDateKey(sourceWeekStart), 14),
  )

  const [destWeekStart, setDestWeekStart] = useState(nextWeekStart)
  const [quickTarget, setQuickTarget] = useState('next')
  const [conflictMode, setConflictMode] = useState(WEEK_CONFLICT_REPLACE)
  const [categories, setCategories] = useState(() => [...DAY_PLAN_COPY_CATEGORIES])
  const [dayModes, setDayModes] = useState({})
  const [error, setError] = useState('')

  useEffect(() => {
    setDestWeekStart(nextWeekStart)
    setQuickTarget('next')
    setConflictMode(WEEK_CONFLICT_REPLACE)
    setCategories([...DAY_PLAN_COPY_CATEGORIES])
    setDayModes({})
    setError('')
  }, [sourceWeekStart, nextWeekStart])

  const pairs = useMemo(
    () => buildWeekCopyPairs(sourceWeekStart, destWeekStart),
    [sourceWeekStart, destWeekStart],
  )

  const conflictingPairs = useMemo(() => {
    const rows = []
    for (const pair of pairs) {
      if (isDayPlanEmpty(getDayPlan(pair.sourceDateKey))) {
        continue
      }
      if (!isDayPlanEmpty(getDayPlan(pair.destinationDateKey))) {
        rows.push(pair)
      }
    }
    return rows
  }, [pairs])

  const hasConflicts = conflictingPairs.length > 0
  const showPerDay = hasConflicts && conflictMode === WEEK_CONFLICT_PER_DAY

  function setDestWeek(weekStartKey, targetId) {
    const next = getWeekStartKey(weekStartKey)
    if (next === sourceWeekStart) {
      setError('שבוע היעד חייב להיות שונה משבוע המקור')
      return
    }
    setDestWeekStart(next)
    setQuickTarget(targetId)
    setDayModes({})
    setError('')
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

  function setDayAction(destKey, action) {
    setDayModes((current) => ({
      ...current,
      [destKey]: action,
    }))
    setError('')
  }

  function handleSubmit() {
    if (!destWeekStart || destWeekStart === sourceWeekStart) {
      setError('יש לבחור שבוע יעד שונה')
      return
    }
    if (categories.length === 0) {
      setError('יש לבחור לפחות קטגוריה אחת להעתקה')
      return
    }

    if (showPerDay) {
      for (const pair of conflictingPairs) {
        if (!dayModes[pair.destinationDateKey]) {
          setError('יש לבחור פעולה לכל יום עם התנגשות')
          return
        }
      }
    }

    const useSelective = !allCategoriesSelected(categories)
    let mode = COPY_DAY_MODES.REPLACE
    if (useSelective) {
      mode = COPY_DAY_MODES.SELECTIVE
    } else if (conflictMode === WEEK_CONFLICT_MERGE) {
      mode = COPY_DAY_MODES.MERGE
    }

    const resolvedDayModes = showPerDay
      ? Object.fromEntries(
          conflictingPairs.map((pair) => [
            pair.destinationDateKey,
            dayModes[pair.destinationDateKey],
          ]),
        )
      : undefined

    const result = copyWeekPlan(sourceWeekStart, destWeekStart, {
      mode,
      slots: useSelective ? categories : undefined,
      dayModes: resolvedDayModes,
      // Explicit conflict choice — never silent overwrite.
      replaceExplicitly: conflictMode === WEEK_CONFLICT_REPLACE,
    })

    if (!result.ok) {
      setError(
        result.errors?.destination ||
          result.errors?.slots ||
          'לא ניתן להעתיק את השבוע',
      )
      return
    }

    onSuccess?.({
      destinationDateKeys: result.destinationDateKeys || [],
      previousPlans: result.previousPlans || {},
      mode: result.mode,
    })
    onClose?.()
  }

  const canSubmit =
    Boolean(destWeekStart) &&
    destWeekStart !== sourceWeekStart &&
    categories.length > 0 &&
    (!showPerDay ||
      conflictingPairs.every((pair) => dayModes[pair.destinationDateKey]))

  return (
    <CopyPlanSheet
      theme="week"
      titleId="copy-week-sheet-title"
      title="העתקת שבוע"
      subtitle={formatWeekRange(sourceWeekStart)}
      caption="יועתקו כל הארוחות בשבוע זה"
      heroIcon={<CopyIconWeek />}
      onClose={onClose}
      error={error}
      submitLabel="העתק"
      onSubmit={handleSubmit}
      submitDisabled={!canSubmit}
    >
      <CopyPlanSection title="בחר לאן להעתיק">
        <CopyPlanChips>
          <CopyPlanChip
            active={quickTarget === 'next'}
            onClick={() => setDestWeek(nextWeekStart, 'next')}
          >
            לשבוע הבא
          </CopyPlanChip>
          <CopyPlanChip
            active={quickTarget === 'two'}
            onClick={() => setDestWeek(twoWeeksStart, 'two')}
          >
            בעוד שבועיים
          </CopyPlanChip>
          <CopyPlanDateChip
            active={quickTarget === 'custom'}
            label="בחר שבוע"
            ariaLabel="בחירת שבוע יעד"
            onPick={(dateKey) => setDestWeek(dateKey, 'custom')}
          />
        </CopyPlanChips>
      </CopyPlanSection>

      <CopyPlanSection title="מיפוי הימים">
        <ul className="copy-week-sheet__map" aria-label="מיפוי ימי השבוע">
          {pairs.map((pair) => {
            const weekday = HEBREW_WEEKDAYS[parseDateKey(pair.sourceDateKey).getDay()]
            return (
              <li key={pair.destinationDateKey} className="copy-week-sheet__map-row">
                <span className="copy-week-sheet__map-source">
                  {weekday} {formatShortDate(pair.sourceDateKey)}
                </span>
                <span className="copy-week-sheet__map-arrow" aria-hidden="true">
                  ←
                </span>
                <span className="copy-week-sheet__map-dest">
                  {weekday} {formatShortDate(pair.destinationDateKey)}
                </span>
              </li>
            )
          })}
        </ul>
      </CopyPlanSection>

      {hasConflicts ? (
        <CopyPlanSection title="תכנון קיים ביעד">
          <p className="copy-day-sheet__conflict-note copy-week-sheet__conflict-banner">
            בחלק מהימים כבר קיים תכנון
          </p>
          <CopyPlanOptions
            name="copy-week-conflict"
            value={conflictMode}
            options={WEEK_CONFLICT_OPTIONS}
            onChange={(next) => {
              setConflictMode(next)
              setError('')
            }}
          />
        </CopyPlanSection>
      ) : null}

      {showPerDay ? (
        <CopyPlanSection title="בחירה לימים עם התנגשות">
          <ul className="copy-week-sheet__day-conflicts">
            {conflictingPairs.map((pair) => {
              const weekday =
                HEBREW_WEEKDAYS[parseDateKey(pair.sourceDateKey).getDay()]
              return (
                <li
                  key={pair.destinationDateKey}
                  className="copy-week-sheet__day-conflict"
                >
                  <span className="copy-week-sheet__day-conflict-label">
                    {weekday} {formatShortDate(pair.sourceDateKey)} →{' '}
                    {formatShortDate(pair.destinationDateKey)}
                  </span>
                  <div className="copy-week-sheet__day-actions">
                    {[
                      { id: COPY_WEEK_DAY_ACTIONS.REPLACE, label: 'החלף' },
                      { id: COPY_WEEK_DAY_ACTIONS.MERGE, label: 'הוסף' },
                      { id: COPY_WEEK_DAY_ACTIONS.SKIP, label: 'דלג' },
                    ].map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        className={[
                          'copy-week-sheet__day-action',
                          dayModes[pair.destinationDateKey] === action.id
                            ? 'copy-week-sheet__day-action--active'
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() =>
                          setDayAction(pair.destinationDateKey, action.id)
                        }
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
        </CopyPlanSection>
      ) : null}

      <CopyPlanSection title="בחר מה להעתיק">
        <CopyPlanCategories
          categories={COPY_CATEGORY_OPTIONS}
          selected={categories}
          onToggle={toggleCategory}
        />
      </CopyPlanSection>
    </CopyPlanSheet>
  )
}
