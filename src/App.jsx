import { useState } from 'react'
import BottomNav from './components/BottomNav.jsx'
import TodayPage from './pages/TodayPage.jsx'
import MealsPage from './pages/MealsPage.jsx'
import ProductsPage from './pages/ProductsPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import './App.css'

const PAGES = {
  today: TodayPage,
  meals: MealsPage,
  products: ProductsPage,
  settings: SettingsPage,
}

function App() {
  const [currentPage, setCurrentPage] = useState('today')
  const Page = PAGES[currentPage]

  return (
    <div className="app-shell">
      <main className="app-content">
        <Page />
      </main>
      <BottomNav currentPage={currentPage} onNavigate={setCurrentPage} />
    </div>
  )
}

export default App
