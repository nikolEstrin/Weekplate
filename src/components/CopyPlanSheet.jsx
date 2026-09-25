/**
 * Shared chrome + building blocks for Copy Day / Copy Week bottom sheets.
 */

export function CopyPlanSheet({
  theme = 'day',
  titleId,
  title,
  subtitle,
  caption,
  heroIcon,
  onClose,
  children,
  error,
  submitLabel,
  onSubmit,
  submitDisabled = false,
  quantityTitle = 'הכמויות נשמרות',
  quantityText = 'כל הכמויות והמנות יועתקו כפי שהן',
  hideQuantityNote = false,
}) {
  return (
    <div className={`today-sheet-root copy-plan-root copy-plan-root--${theme}`}>
      <button
        type="button"
        className="today-sheet-backdrop"
        aria-label="סגירה"
        onClick={onClose}
      />
      <div
        className={`today-sheet copy-day-sheet copy-plan-sheet copy-plan-sheet--${theme}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="today-sheet__handle" aria-hidden="true" />
        <div className="today-sheet__body copy-day-sheet__body">
          <header className="copy-day-sheet__header">
            <button
              type="button"
              className="copy-day-sheet__close"
              onClick={onClose}
              aria-label="סגירה"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            <div className="copy-day-sheet__hero">
              <span
                className={`copy-day-sheet__hero-icon copy-plan-sheet__hero-icon copy-plan-sheet__hero-icon--${theme}`}
                aria-hidden="true"
              >
                {heroIcon}
              </span>
              <div className="copy-day-sheet__titles">
                <h2 id={titleId} className="copy-day-sheet__title">
                  {title}
                </h2>
                {subtitle ? (
                  <p className="copy-day-sheet__subtitle">{subtitle}</p>
                ) : null}
                {caption ? (
                  <p className="copy-day-sheet__caption">{caption}</p>
                ) : null}
              </div>
            </div>
          </header>

          {children}

          {!hideQuantityNote ? (
            <p className="copy-day-sheet__quantity-note" role="note">
              <span className="copy-day-sheet__quantity-title">{quantityTitle}</span>
              <span className="copy-day-sheet__quantity-text">{quantityText}</span>
            </p>
          ) : null}

          {error ? (
            <p className="product-field__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="copy-day-sheet__footer">
            <button
              type="button"
              className={`copy-day-sheet__submit copy-plan-sheet__submit copy-plan-sheet__submit--${theme}`}
              onClick={onSubmit}
              disabled={submitDisabled}
            >
              {submitLabel}
            </button>
            <button
              type="button"
              className="copy-day-sheet__cancel"
              onClick={onClose}
            >
              ביטול
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function CopyPlanSection({ title, children, ariaLabel }) {
  return (
    <section className="copy-day-sheet__section" aria-label={ariaLabel || title}>
      {title ? <h3 className="copy-day-sheet__section-title">{title}</h3> : null}
      {children}
    </section>
  )
}

export function CopyPlanChips({ children }) {
  return (
    <div className="copy-day-sheet__chips" role="group">
      {children}
    </div>
  )
}

export function CopyPlanChip({ active, onClick, disabled, children }) {
  return (
    <button
      type="button"
      className={[
        'copy-day-sheet__chip',
        active ? 'copy-day-sheet__chip--active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      disabled={disabled}
    >
      {active ? '✓ ' : ''}
      {children}
    </button>
  )
}

export function CopyPlanDateChip({ active, label, ariaLabel, onPick }) {
  return (
    <div
      className={[
        'copy-day-sheet__chip-wrap',
        active ? 'copy-day-sheet__chip-wrap--active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="copy-day-sheet__chip-label" aria-hidden="true">
        {label}
      </span>
      <input
        type="date"
        className="copy-day-sheet__chip-input"
        onChange={(event) => {
          const next = event.target.value
          if (next) {
            onPick(next)
          }
          event.target.value = ''
        }}
        aria-label={ariaLabel || label}
      />
    </div>
  )
}

export function CopyPlanOptions({ name, value, options, onChange }) {
  return (
    <div className="copy-day-sheet__options" role="radiogroup">
      {options.map((option) => (
        <label
          key={option.id}
          className={[
            'copy-day-sheet__option',
            value === option.id ? 'copy-day-sheet__option--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <input
            type="radio"
            name={name}
            value={option.id}
            checked={value === option.id}
            onChange={() => onChange(option.id)}
          />
          <span className="copy-day-sheet__option-text">
            <span className="copy-day-sheet__option-title">{option.label}</span>
            {option.hint ? (
              <span className="copy-day-sheet__option-hint">{option.hint}</span>
            ) : null}
          </span>
          {option.icon ? (
            <span className="copy-day-sheet__option-icon-wrap" aria-hidden="true">
              {option.icon}
            </span>
          ) : null}
        </label>
      ))}
    </div>
  )
}

export function CopyPlanCategories({ categories, selected, onToggle }) {
  return (
    <ul className="copy-day-sheet__categories">
      {categories.map((category) => {
        const checked = selected.includes(category.id)
        return (
          <li key={category.id}>
            <label
              className={[
                'copy-day-sheet__category',
                checked ? 'copy-day-sheet__category--checked' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(category.id)}
              />
              <span className="copy-day-sheet__category-emoji" aria-hidden="true">
                {category.emoji}
              </span>
              <span className="copy-day-sheet__category-label">
                {category.label}
              </span>
            </label>
          </li>
        )
      })}
    </ul>
  )
}

export const COPY_CATEGORY_OPTIONS = [
  { id: 'breakfast', label: 'ארוחת בוקר', emoji: '☀️' },
  { id: 'lunch', label: 'ארוחת צהריים', emoji: '🌤' },
  { id: 'dinner', label: 'ארוחת ערב', emoji: '🌙' },
  { id: 'snacks', label: 'נשנושים', emoji: '🍎' },
  { id: 'desserts', label: 'קינוחים', emoji: '🍰' },
]

export function CopyIconDay() {
  return (
    <svg viewBox="0 0 24 24">
      <path
        d="M8 7h9a2 2 0 012 2v10a2 2 0 01-2 2H8a2 2 0 01-2-2V9a2 2 0 012-2zm3-3h7a2 2 0 012 2v1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CopyIconWeek() {
  return (
    <svg viewBox="0 0 24 24">
      <path
        d="M7 4v2m10-2v2M5 9h14M6 5h12a1 1 0 011 1v13a1 1 0 01-1 1H6a1 1 0 01-1-1V6a1 1 0 011-1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
