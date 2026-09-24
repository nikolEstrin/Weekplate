const NAV_ITEMS = [
  {
    id: 'today',
    label: 'תכנון',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M9 8h6M9 12h6M9 16h4" />
      </svg>
    ),
  },
  {
    id: 'meals',
    label: 'ארוחות',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <ellipse cx="12" cy="8" rx="7" ry="3" />
        <path d="M5 8v3c0 1.7 3.1 3 7 3s7-1.3 7-3V8" />
        <path d="M5 14v3c0 1.7 3.1 3 7 3s7-1.3 7-3v-3" />
      </svg>
    ),
  },
  {
    id: 'products',
    label: 'מוצרים',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 8h12l-1 12H7L6 8z" />
        <path d="M9 8V7a3 3 0 0 1 6 0v1" />
      </svg>
    ),
  },
  {
    id: 'shopping',
    label: 'קניות',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 7h15l-1.5 9h-12z" />
        <path d="M6 7l-1-3H2" />
        <circle cx="9" cy="19" r="1.5" />
        <circle cx="17" cy="19" r="1.5" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'הגדרות',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
      </svg>
    ),
  },
]

function BottomNav({ currentPage, onNavigate }) {
  return (
    <nav className="bottom-nav" aria-label="ניווט ראשי">
      {NAV_ITEMS.map((item) => {
        const isActive = currentPage === item.id

        return (
          <button
            key={item.id}
            type="button"
            className={`bottom-nav__item${isActive ? ' bottom-nav__item--active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onNavigate(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

export default BottomNav
