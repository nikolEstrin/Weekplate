import { useState } from 'react'
import BottomNav from './components/BottomNav.jsx'
import TodayPage from './pages/TodayPage.jsx'
import MealsPage from './pages/MealsPage.jsx'
import ProductsPage from './pages/ProductsPage.jsx'
import ShoppingListPage from './pages/ShoppingListPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import { getLocalDateKey } from './services/storage.js'
import './App.css'

const PAGES = {
  today: TodayPage,
  meals: MealsPage,
  products: ProductsPage,
  shopping: ShoppingListPage,
  settings: SettingsPage,
}

function App() {
  const [currentPage, setCurrentPage] = useState('today')
  const [selectedDateKey, setSelectedDateKey] = useState(() => getLocalDateKey())
  const Page = PAGES[currentPage]

  return (
    <div className="app-shell">
      <main className="app-content">
        {currentPage === 'today' ? (
          <TodayPage
            selectedDateKey={selectedDateKey}
            onSelectedDateChange={setSelectedDateKey}
          />
        ) : (
          <Page />
        )}
      </main>
      <BottomNav currentPage={currentPage} onNavigate={setCurrentPage} />
    </div>
  )
}

export default App
