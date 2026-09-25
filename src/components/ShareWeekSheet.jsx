import { useMemo, useState } from 'react'
import {
  CopyIconWeek,
  CopyPlanSection,
  CopyPlanSheet,
} from './CopyPlanSheet.jsx'
import {
  exportWeekPrep,
  getDayPlan,
  getWeekDayKeys,
  getWeekPrepExportFilename,
  getWeekStartKey,
  isDayPlanEmpty,
} from '../services/storage.js'
import { shareJsonFile } from '../platform/share.js'

function parseDateKey(dateKey) {
  const parts = String(dateKey).split('-').map(Number)
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return new Date()
  }
  const [year, month, day] = parts
  return new Date(year, month - 1, day)
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
 * Export / share the visible week prep (plans + library) as JSON.
 */
export default function ShareWeekSheet({ weekStartKey, onClose, onShared }) {
  const sourceWeekStart = getWeekStartKey(weekStartKey)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const plannedDayCount = useMemo(() => {
    let count = 0
    for (const key of getWeekDayKeys(sourceWeekStart)) {
      if (!isDayPlanEmpty(getDayPlan(key))) {
        count += 1
      }
    }
    return count
  }, [sourceWeekStart])

  function buildPayload() {
    return exportWeekPrep(sourceWeekStart)
  }

  async function handleShare() {
    setError('')
    setStatus('')
    setBusy(true)
    try {
      const result = await shareJsonFile({
        filename: getWeekPrepExportFilename(sourceWeekStart),
        json: buildPayload(),
        title: 'תכנון שבועי — Weekplate',
      })
      if (result.cancelled) {
        return
      }
      if (!result.ok) {
        throw new Error('share failed')
      }
      setStatus('הייצוא הושלם.')
      onShared?.({ method: 'share' })
    } catch {
      setError('הייצוא נכשל. אפשר לנסות שוב.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CopyPlanSheet
      theme="week"
      titleId="share-week-sheet-title"
      title="שתף שבוע"
      subtitle={formatWeekRange(sourceWeekStart)}
      caption="תכנון + מוצרים וארוחות חסרים"
      heroIcon={<CopyIconWeek />}
      onClose={onClose}
      error={error}
      submitLabel="שתף או הורד"
      onSubmit={handleShare}
      submitDisabled={busy}
      quantityTitle="כמויות התכנון נשמרות"
      quantityText="הכמויות במתכונים השמורים של המקבל לא יוחלפו"
    >
      <CopyPlanSection title="מה ייכלל בקובץ">
        <ul className="share-week-sheet__list">
          <li>
            תכנון ל־<span className="num">{plannedDayCount}</span> ימים עם ארוחות
          </li>
          <li>כמויות ומנות כפי שתוכננו אצלך</li>
          <li>מוצרים וארוחות — רק מה שחסר אצל המקבל יתווסף</li>
        </ul>
      </CopyPlanSection>

      {status ? (
        <p className="goals-form__status" role="status">
          {status}
        </p>
      ) : null}
    </CopyPlanSheet>
  )
}
