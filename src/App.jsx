import { useState } from 'react'
import BottomNav from './components/BottomNav.jsx'
import Today from './pages/Today.jsx'
import Meals from './pages/Meals.jsx'
import Products from './pages/Products.jsx'
import Settings from './pages/Settings.jsx'
import './App.css'

const PAGES = {
  today: Today,
  meals: Meals,
  products: Products,
  settings: Settings,
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
