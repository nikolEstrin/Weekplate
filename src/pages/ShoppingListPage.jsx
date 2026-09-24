import { useMemo, useState } from 'react'
import {
  generateShoppingList,
  getLocalDateKey,
  getShoppingPurchased,
  setShoppingItemPurchased,
} from '../services/storage.js'
import { roundForDisplay } from '../utils/nutrition.js'
import {
  STANDARD_SLOT_LABELS,
  formatShoppingListAsText,
  shoppingSelectionKey,
} from '../utils/shoppingList.js'

const HEBREW_WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

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

function getWeekStartKey(dateKey) {
  const date = parseDateKey(dateKey)
  const weekStart = addDays(date, -date.getDay())
  return getLocalDateKey(weekStart)
}

function getWeekDayKeys(weekStartKey) {
  const start = parseDateKey(weekStartKey)
  return Array.from({ length: 7 }, (_, index) =>
    getLocalDateKey(addDays(start, index)),
  )
}

function formatDateLabel(dateKey) {
  const date = parseDateKey(dateKey)
  return date.toLocaleDateString('he-IL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function formatQuantity(value) {
  const decimals = Math.abs(value - Math.round(value)) < 1e-9 ? 0 : 1
  const rounded = roundForDisplay(value, decimals)
  return rounded.toLocaleString('he-IL', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  })
}

function Num({ children }) {
  return <span className="num">{children}</span>
}

function ShoppingListPage() {
  const todayKey = getLocalDateKey()
  const [weekStartKey, setWeekStartKey] = useState(() =>
    getWeekStartKey(todayKey),
  )
  const [selectedDates, setSelectedDates] = useState(() => new Set([todayKey]))
  const [list, setList] = useState(null)
  const [purchased, setPurchased] = useState({})
  const [exportStatus, setExportStatus] = useState('')

  const weekDayKeys = useMemo(
    () => getWeekDayKeys(weekStartKey),
    [weekStartKey],
  )

  const selectedList = useMemo(
    () => Array.from(selectedDates).sort(),
    [selectedDates],
  )

  const canShareText =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  function shiftWeek(delta) {
    setWeekStartKey((current) =>
      getLocalDateKey(addDays(parseDateKey(current), delta * 7)),
    )
  }

  function toggleDate(dateKey) {
    setSelectedDates((current) => {
      const next = new Set(current)
      if (next.has(dateKey)) {
        next.delete(dateKey)
      } else {
        next.add(dateKey)
      }
      return next
    })
    setList(null)
    setExportStatus('')
  }

  function selectWholeWeek() {
    setSelectedDates(new Set(weekDayKeys))
    setList(null)
    setExportStatus('')
  }

  function clearSelection() {
    setSelectedDates(new Set())
    setList(null)
    setPurchased({})
    setExportStatus('')
  }

  function handleGenerate() {
    if (selectedList.length === 0) {
      return
    }
    const result = generateShoppingList(selectedList)
    setList(result)
    setPurchased(getShoppingPurchased(result.dateKeys))
    setExportStatus('')
  }

  function handleTogglePurchased(itemId) {
    if (!list) {
      return
    }
    const nextValue = !purchased[itemId]
    const next = setShoppingItemPurchased(list.dateKeys, itemId, nextValue)
    setPurchased(next)
  }

  function getExportText() {
    if (!list || list.items.length === 0) {
      return ''
    }
    return formatShoppingListAsText(list.items)
  }

  async function handleCopyAsText() {
    const text = getExportText()
    if (!text) {
      return
    }
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text)
      } else {
        const area = document.createElement('textarea')
        area.value = text
        area.setAttribute('readonly', '')
        area.style.position = 'fixed'
        area.style.insetInlineStart = '-9999px'
        document.body.appendChild(area)
        area.select()
        document.execCommand('copy')
        document.body.removeChild(area)
      }
      setExportStatus('הועתק! אפשר להדביק בוואטסאפ')
    } catch {
      setExportStatus('ההעתקה נכשלה')
    }
  }

  async function handleShareAsText() {
    const text = getExportText()
    if (!text || !canShareText) {
      return
    }
    try {
      await navigator.share({ text, title: 'רשימת קניות' })
      setExportStatus('שותף בהצלחה')
    } catch (error) {
      if (error && error.name === 'AbortError') {
        return
      }
      setExportStatus('השיתוף נכשל')
    }
  }

  const hasWarnings =
    list &&
    (list.warnings.emptyDates.length > 0 ||
      list.warnings.missingSlots.length > 0)

  const selectionFingerprint = shoppingSelectionKey(selectedList)

  return (
    <section className="page">
      <header className="page-header page-header--today">
        <h1>
          <span className="page-header__emoji" aria-hidden="true">
            🛒
          </span>
          רשימת קניות
        </h1>
      </header>

      <section className="shopping-dates" aria-label="בחירת תאריכים">
        <div className="week-selector__toolbar">
          <button
            type="button"
            className="week-selector__nav"
            onClick={() => shiftWeek(-1)}
            aria-label="שבוע קודם"
          >
            ‹
          </button>
          <p className="shopping-dates__title">בחרו ימים לתכנון</p>
          <button
            type="button"
            className="week-selector__nav"
            onClick={() => shiftWeek(1)}
            aria-label="שבוע הבא"
          >
            ›
          </button>
        </div>

        <div
          className="week-selector__grid"
          role="group"
          aria-label="ימי השבוע לרשימת קניות"
        >
          {weekDayKeys.map((dateKey) => {
            const date = parseDateKey(dateKey)
            const weekday = HEBREW_WEEKDAYS[date.getDay()]
            const isSelected = selectedDates.has(dateKey)
            const isToday = dateKey === todayKey

            return (
              <button
                key={dateKey}
                type="button"
                aria-pressed={isSelected}
                className={[
                  'week-selector__day',
                  isSelected ? 'week-selector__day--selected' : '',
                  isToday ? 'week-selector__day--today' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => toggleDate(dateKey)}
                aria-label={formatDateLabel(dateKey)}
              >
                <span className="week-selector__weekday">{weekday}</span>
                <span className="week-selector__date num">{date.getDate()}</span>
              </button>
            )
          })}
        </div>

        <div className="shopping-dates__actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={selectWholeWeek}
          >
            כל השבוע
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={clearSelection}
            disabled={selectedList.length === 0}
          >
            נקה
          </button>
        </div>

        <p className="shopping-dates__summary">
          {selectedList.length === 0
            ? 'לא נבחרו תאריכים'
            : `נבחרו ${selectedList.length} תאריכים`}
        </p>

        <button
          type="button"
          className="btn-primary shopping-dates__generate"
          onClick={handleGenerate}
          disabled={selectedList.length === 0}
        >
          צור רשימת קניות
        </button>
      </section>

      {list && shoppingSelectionKey(list.dateKeys) === selectionFingerprint ? (
        <>
          {hasWarnings ? (
            <aside className="shopping-warnings" role="status">
              <h2 className="shopping-warnings__title">שימו לב</h2>
              {list.warnings.emptyDates.length > 0 ? (
                <div className="shopping-warnings__block">
                  <p className="shopping-warnings__label">
                    ימים ללא תכנון כלל:
                  </p>
                  <ul className="shopping-warnings__list">
                    {list.warnings.emptyDates.map((dateKey) => (
                      <li key={dateKey}>{formatDateLabel(dateKey)}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {list.warnings.missingSlots.length > 0 ? (
                <div className="shopping-warnings__block">
                  <p className="shopping-warnings__label">
                    חסרות ארוחות סטנדרטיות:
                  </p>
                  <ul className="shopping-warnings__list">
                    {list.warnings.missingSlots.map((row) => (
                      <li key={row.dateKey}>
                        {formatDateLabel(row.dateKey)} —{' '}
                        {row.slots
                          .map((slot) => STANDARD_SLOT_LABELS[slot] || slot)
                          .join(', ')}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="shopping-warnings__note">
                ניתן להמשיך עם רשימה חלקית לפי מה שתוכנן.
              </p>
            </aside>
          ) : null}

          {list.items.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state__emoji" aria-hidden="true">
                🧺
              </span>
              <p>אין מוצרים לתאריכים שנבחרו.</p>
            </div>
          ) : (
            <>
              <div className="shopping-export">
                <div className="shopping-export__actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleCopyAsText}
                  >
                    העתק כטקסט
                  </button>
                  {canShareText ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleShareAsText}
                    >
                      שתף
                    </button>
                  ) : null}
                </div>
                {exportStatus ? (
                  <p className="shopping-export__status" role="status">
                    {exportStatus}
                  </p>
                ) : null}
              </div>
              <ul className="shopping-list" aria-label="פריטי קניות">
                {list.items.map((item) => {
                  const isPurchased = Boolean(purchased[item.id])
                  return (
                    <li key={item.id}>
                      <label
                        className={[
                          'shopping-item',
                          isPurchased ? 'shopping-item--purchased' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <input
                          type="checkbox"
                          className="shopping-item__check"
                          checked={isPurchased}
                          onChange={() => handleTogglePurchased(item.id)}
                        />
                        <span className="shopping-item__body">
                          <span className="shopping-item__name">
                            {item.productName}
                          </span>
                          <span className="shopping-item__qty">
                            <Num>{formatQuantity(item.quantity)}</Num>
                            <span className="shopping-item__unit">
                              {' '}
                              {item.label}
                            </span>
                            {item.mergedFromDifferentUnits ? (
                              <span className="shopping-item__hint">
                                {' '}
                                (אוחד מיחידות שונות)
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </>
      ) : null}
    </section>
  )
}

export default ShoppingListPage
