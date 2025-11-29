import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Bukhansan from './pages/Bukhansan'
import Seoraksan from './pages/Seoraksan'
import MountainsMap from './pages/MountainsMap'
import './App.css'

function App() {
  return (
    <Router
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }}
    >
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/bukhansan" element={<Bukhansan />} />
        <Route path="/seoraksan" element={<Seoraksan />} />
        <Route path="/mountains-map" element={<MountainsMap />} />
      </Routes>
    </Router>
  )
}

export default App

