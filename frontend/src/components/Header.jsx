import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './Header.css'

function Header() {
  const [user, setUser] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    // localStorage에서 사용자 정보 확인
    const userData = localStorage.getItem('user')
    if (userData) {
      try {
        setUser(JSON.parse(userData))
      } catch (e) {
        console.error('사용자 정보 파싱 오류:', e)
      }
    }
  }, [])

  const handleLogout = () => {
    // 로그아웃 확인 팝업
    if (window.confirm('로그아웃하시겠습니까?')) {
      // localStorage에서 토큰과 사용자 정보 제거
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      setUser(null)
      navigate('/')
      alert('로그아웃되었습니다.')
    }
  }

  return (
    <header>
      <div className="header-top">
        <Link to="/" className="logo">
          <svg className="logo-mountain" viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
            {/* 왼쪽 구름 */}
            <ellipse cx="18" cy="22" rx="10" ry="6" fill="white" stroke="#4a7c59" strokeWidth="1.5"/>
            
            {/* 오른쪽 구름 */}
            <ellipse cx="95" cy="28" rx="8" ry="5" fill="white" stroke="#4a7c59" strokeWidth="1.5"/>
            
            {/* 왼쪽 산 (더 큰 산) */}
            <path d="M 25 65 Q 25 30 40 18 Q 55 30 55 65 Z" fill="#a8d5ba" stroke="#4a7c59" strokeWidth="2"/>
            {/* 눈 덮인 봉우리 */}
            <path d="M 35 18 Q 40 18 40 28 Q 35 28 35 18" fill="white"/>
            <path d="M 35 18 L 40 18 L 40 28 L 35 28 Z" fill="white"/>
            {/* 그림자 */}
            <path d="M 40 18 L 55 30 L 50 30 L 40 25 Z" fill="#8bc49f" opacity="0.3"/>
            
            {/* 오른쪽 산 (작은 산) */}
            <path d="M 60 65 Q 60 40 70 25 Q 80 40 80 65 Z" fill="#a8d5ba" stroke="#4a7c59" strokeWidth="2"/>
            {/* 눈 덮인 봉우리 */}
            <path d="M 65 25 Q 70 25 70 35 Q 65 35 65 25" fill="white"/>
            <path d="M 65 25 L 70 25 L 70 35 L 65 35 Z" fill="white"/>
            {/* 그림자 */}
            <path d="M 70 25 L 80 40 L 75 40 L 70 32 Z" fill="#8bc49f" opacity="0.3"/>
            
            {/* 별들 */}
            <path d="M 42 12 L 43.5 15 L 46.5 15 L 44 17 L 45.5 20 L 42 18 L 38.5 20 L 40 17 L 37.5 15 L 40.5 15 Z" fill="#a8d5ba"/>
            <path d="M 68 15 L 69.5 18 L 72.5 18 L 70 20 L 71.5 23 L 68 21 L 64.5 23 L 66 20 L 63.5 18 L 66.5 18 Z" fill="#a8d5ba"/>
            <path d="M 88 18 L 89.5 21 L 92.5 21 L 90 23 L 91.5 26 L 88 24 L 84.5 26 L 86 23 L 83.5 21 L 86.5 21 Z" fill="#a8d5ba"/>
          </svg>
          <span>내일의 등산</span>
        </Link>
        <div className="header-actions">
          {user ? (
            <div className="user-info">
              <span className="user-id-display">{user.id}</span>
              <button onClick={handleLogout} className="btn-logout">로그아웃</button>
            </div>
          ) : (
            <>
              <Link to="/login" className="btn-login">Login</Link>
              <Link to="/signup" className="btn-signup">회원가입</Link>
            </>
          )}
        </div>
      </div>
      <nav>
        <ul>
          <li><Link to="/notice">공지사항</Link></li>
          <li><Link to="/ai-course">AI 등산 코스 추천</Link></li>
          <li><Link to="/store">스토어</Link></li>
          <li><Link to="/community">커뮤니티</Link></li>
          <li><Link to="/mypage">마이페이지</Link></li>
        </ul>
      </nav>
    </header>
  )
}

export default Header

