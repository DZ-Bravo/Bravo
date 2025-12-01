import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Bukhansan from './pages/Bukhansan'
import Seoraksan from './pages/Seoraksan'
import MountainsMap from './pages/MountainsMap'
import Signup from './pages/Signup'
import Login from './pages/Login'
import FindId from './pages/FindId'
import FindPassword from './pages/FindPassword'
import Notice from './pages/Notice'
import Community from './pages/Community'
import CommunityWrite from './pages/CommunityWrite'
import CommunityEdit from './pages/CommunityEdit'
import CommunityDetail from './pages/CommunityDetail'
import AICourse from './pages/AICourse'
import Store from './pages/Store'
import MyPage from './pages/MyPage'
import CourseDetail from './pages/CourseDetail'
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
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/find-id" element={<FindId />} />
        <Route path="/find-password" element={<FindPassword />} />
        <Route path="/notice" element={<Notice />} />
        <Route path="/community" element={<Community />} />
        <Route path="/community/write" element={<CommunityWrite />} />
        <Route path="/community/edit/:id" element={<CommunityEdit />} />
        <Route path="/community/:id" element={<CommunityDetail />} />
        <Route path="/ai-course" element={<AICourse />} />
        <Route path="/store" element={<Store />} />
        <Route path="/mypage" element={<MyPage />} />
        <Route path="/course/:theme" element={<CourseDetail />} />
      </Routes>
    </Router>
  )
}

export default App

