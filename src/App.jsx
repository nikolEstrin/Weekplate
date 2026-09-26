import { useState } from 'react'
import BottomNav from './components/BottomNav.jsx'
import { useDataSession } from './components/DataSessionProvider.jsx'
import SyncStatusBanner from './components/SyncStatusBanner.jsx'
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
  const { dataVersion } = useDataSession()
  const Page = PAGES[currentPage]

  // Pages read storage when they mount; remounting after a sync that changed
  // data (dataVersion) shows the new data without each page subscribing.
  return (
    <div className="app-shell">
      <main className="app-content">
        <SyncStatusBanner />
        {currentPage === 'today' ? (
          <TodayPage
            key={dataVersion}
            selectedDateKey={selectedDateKey}
            onSelectedDateChange={setSelectedDateKey}
          />
        ) : (
          <Page key={currentPage === 'settings' ? 'settings' : dataVersion} />
        )}
      </main>
      <BottomNav currentPage={currentPage} onNavigate={setCurrentPage} />
    </div>
  )
}

export default App
