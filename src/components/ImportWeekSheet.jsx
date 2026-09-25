import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CopyIconWeek,
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
  getDayPlan,
  getLocalDateKey,
  getWeekDayKeys,
  getWeekStartKey,
  importWeekPrep,
  isDayPlanEmpty,
  parseWeekPrepJson,
  validateWeekPrepImport,
} from '../services/storage.js'

const HEBREW_WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

const WEEK_CONFLICT_REPLACE = 'replace'
const WEEK_CONFLICT_MERGE = 'merge'
const WEEK_CONFLICT_PER_DAY = 'perDay'

const WEEK_CONFLICT_OPTIONS = [
  {
    id: WEEK_CONFLICT_REPLACE,
    label: 'החלף ימים רלוונטיים',
    hint: 'רק ימים עם תכנון בקובץ יוחלפו ביעד',
  },
  {
    id: WEEK_CONFLICT_MERGE,
    label: 'הוסף לתכנון הקיים',
    hint: 'הארוחות מהקובץ יתווספו לימים המקבילים',
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

/**
 * Import a shared week-prep file onto a chosen destination week.
 */
export default function ImportWeekSheet({
  defaultWeekStartKey,
  onClose,
  onSuccess,
}) {
  const fileInputRef = useRef(null)
  const defaultWeek = getWeekStartKey(defaultWeekStartKey || getLocalDateKey())

  const [pendingData, setPendingData] = useState(null)
  const [sourceWeekStart, setSourceWeekStart] = useState('')
  const [destWeekStart, setDestWeekStart] = useState(defaultWeek)
  const [quickTarget, setQuickTarget] = useState('current')
  const [conflictMode, setConflictMode] = useState(WEEK_CONFLICT_REPLACE)
  const [dayModes, setDayModes] = useState({})
  const [error, setError] = useState('')

  useEffect(() => {
    setDestWeekStart(defaultWeek)
    setQuickTarget('current')
    setConflictMode(WEEK_CONFLICT_REPLACE)
    setDayModes({})
    setError('')
    setPendingData(null)
    setSourceWeekStart('')
  }, [defaultWeek])

  const pairs = useMemo(() => {
    if (!sourceWeekStart || !destWeekStart) {
      return []
    }
    return buildWeekCopyPairs(sourceWeekStart, destWeekStart)
  }, [sourceWeekStart, destWeekStart])

  const conflictingPairs = useMemo(() => {
    if (!pendingData || pairs.length === 0) {
      return []
    }
    const validated = validateWeekPrepImport(pendingData)
    if (!validated.ok) {
      return []
    }
    const rows = []
    for (const pair of pairs) {
      const sourcePlan = validated.days[pair.sourceDateKey]
      if (isDayPlanEmpty(sourcePlan)) {
        continue
      }
      if (!isDayPlanEmpty(getDayPlan(pair.destinationDateKey))) {
        rows.push(pair)
      }
    }
    return rows
  }, [pendingData, pairs])

  const hasConflicts = conflictingPairs.length > 0
  const showPerDay = hasConflicts && conflictMode === WEEK_CONFLICT_PER_DAY

  function openFilePicker() {
    setError('')
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

    setError('')
    setPendingData(null)
    setSourceWeekStart('')

    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      const parsed = parseWeekPrepJson(text)
      if (!parsed.ok) {
        setError(parsed.error)
        return
      }

      const validated = validateWeekPrepImport(parsed.data)
      if (!validated.ok) {
        setError(validated.error || 'קובץ לא תקין')
        return
      }

      setPendingData(parsed.data)
      setSourceWeekStart(validated.sourceWeekStartKey)
      setDayModes({})
    }
    reader.onerror = () => {
      setError('לא ניתן לקרוא את הקובץ.')
    }
    reader.readAsText(file)
  }

  function setDestWeek(weekStartKey, targetId) {
    const next = getWeekStartKey(weekStartKey)
    setDestWeekStart(next)
    setQuickTarget(targetId)
    setDayModes({})
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
    if (!pendingData) {
      setError('יש לבחור קובץ לייבוא')
      return
    }
    if (!destWeekStart) {
      setError('יש לבחור שבוע יעד')
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

    let mode = COPY_DAY_MODES.REPLACE
    if (conflictMode === WEEK_CONFLICT_MERGE) {
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

    const result = importWeekPrep(pendingData, destWeekStart, {
      mode,
      dayModes: resolvedDayModes,
      replaceExplicitly: conflictMode === WEEK_CONFLICT_REPLACE,
    })

    if (!result.ok) {
      setError(
        result.error ||
          result.errors?.destination ||
          result.errors?.file ||
          'לא ניתן לייבא את השבוע',
      )
      return
    }

    onSuccess?.({
      destinationDateKeys: result.destinationDateKeys || [],
      previousPlans: result.previousPlans || {},
      productsAdded: result.productsAdded || 0,
      mealsAdded: result.mealsAdded || 0,
      products: result.products,
      meals: result.meals,
      destinationWeekStartKey: result.destinationWeekStartKey,
    })
    onClose?.()
  }

  const canSubmit =
    Boolean(pendingData) &&
    Boolean(destWeekStart) &&
    (!showPerDay ||
      conflictingPairs.every((pair) => dayModes[pair.destinationDateKey]))

  const nextWeekStart = getLocalDateKey(addDays(parseDateKey(defaultWeek), 7))
  const twoWeeksStart = getLocalDateKey(addDays(parseDateKey(defaultWeek), 14))

  return (
    <CopyPlanSheet
      theme="week"
      titleId="import-week-sheet-title"
      title="ייבוא שבוע"
      subtitle={
        sourceWeekStart
          ? `מקור: ${formatWeekRange(sourceWeekStart)}`
          : 'בחרו קובץ תכנון שבועי'
      }
      caption="כמויות התכנון מהקובץ · מתכונים קיימים לא משתנים"
      heroIcon={<CopyIconWeek />}
      onClose={onClose}
      error={error}
      submitLabel="ייבוא"
      onSubmit={handleSubmit}
      submitDisabled={!canSubmit}
      quantityTitle="כמויות התכנון מהקובץ"
      quantityText="ארוחות ומוצרים שכבר קיימים אצלך לא יוחלפו"
    >
      <CopyPlanSection title="קובץ">
        <button
          type="button"
          className="btn-primary"
          onClick={openFilePicker}
        >
          {pendingData ? 'החלף קובץ' : 'בחירת קובץ'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          onChange={handleFileSelected}
          aria-label="בחירת קובץ תכנון שבועי"
        />
        {pendingData && sourceWeekStart ? (
          <p className="import-week-sheet__file-ok" role="status">
            הקובץ תקין · שבוע {formatWeekRange(sourceWeekStart)}
          </p>
        ) : null}
      </CopyPlanSection>

      {pendingData ? (
        <>
          <CopyPlanSection title="בחר שבוע יעד">
            <CopyPlanChips>
              <CopyPlanChip
                active={quickTarget === 'current'}
                onClick={() => setDestWeek(defaultWeek, 'current')}
              >
                לשבוע הנוכחי
              </CopyPlanChip>
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

          {pairs.length > 0 ? (
            <CopyPlanSection title="מיפוי הימים">
              <ul className="copy-week-sheet__map" aria-label="מיפוי ימי השבוע">
                {pairs.map((pair) => {
                  const weekday =
                    HEBREW_WEEKDAYS[parseDateKey(pair.sourceDateKey).getDay()]
                  return (
                    <li
                      key={pair.destinationDateKey}
                      className="copy-week-sheet__map-row"
                    >
                      <span className="copy-week-sheet__map-source">
                        {weekday} {formatShortDate(pair.sourceDateKey)}
                      </span>
                      <span
                        className="copy-week-sheet__map-arrow"
                        aria-hidden="true"
                      >
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
          ) : null}

          {hasConflicts ? (
            <CopyPlanSection title="תכנון קיים ביעד">
              <p className="copy-day-sheet__conflict-note copy-week-sheet__conflict-banner">
                בחלק מהימים כבר קיים תכנון
              </p>
              <CopyPlanOptions
                name="import-week-conflict"
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
        </>
      ) : null}
    </CopyPlanSheet>
  )
}
