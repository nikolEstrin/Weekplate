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

function canShareFiles() {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
      return false
    }
    if (typeof navigator.canShare !== 'function') {
      return false
    }
    const probe = new File(['{}'], 'probe.json', { type: 'application/json' })
    return navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

/**
 * Export / share the visible week prep (plans + library) as JSON.
 */
export default function ShareWeekSheet({ weekStartKey, onClose, onShared }) {
  const sourceWeekStart = getWeekStartKey(weekStartKey)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const shareAvailable = useMemo(() => canShareFiles(), [])

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

  function handleDownload() {
    setError('')
    setStatus('')
    try {
      const data = buildPayload()
      downloadJsonFile(getWeekPrepExportFilename(sourceWeekStart), data)
      setStatus('הקובץ הורד בהצלחה.')
      onShared?.({ method: 'download' })
    } catch {
      setError('הייצוא נכשל.')
    }
  }

  async function handleShare() {
    setError('')
    setStatus('')
    setBusy(true)
    try {
      const data = buildPayload()
      const filename = getWeekPrepExportFilename(sourceWeekStart)
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      })
      const file = new File([blob], filename, { type: 'application/json' })

      if (shareAvailable) {
        await navigator.share({
          files: [file],
          title: 'תכנון שבועי — Weekplate',
          text: 'תכנון הארוחות שלי לשבוע',
        })
        setStatus('השיתוף הושלם.')
        onShared?.({ method: 'share' })
      } else {
        downloadJsonFile(filename, data)
        setStatus('הקובץ הורד בהצלחה.')
        onShared?.({ method: 'download' })
      }
    } catch (err) {
      if (err && err.name === 'AbortError') {
        setBusy(false)
        return
      }
      setError('השיתוף נכשל. אפשר להוריד את הקובץ במקום.')
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
      submitLabel={shareAvailable ? 'שתף' : 'הורד קובץ'}
      onSubmit={shareAvailable ? handleShare : handleDownload}
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

      {shareAvailable ? (
        <CopyPlanSection title="או הורדה">
          <button
            type="button"
            className="btn-secondary share-week-sheet__download"
            onClick={handleDownload}
            disabled={busy}
          >
            הורד קובץ JSON
          </button>
        </CopyPlanSection>
      ) : null}

      {status ? (
        <p className="goals-form__status" role="status">
          {status}
        </p>
      ) : null}
    </CopyPlanSheet>
  )
}
