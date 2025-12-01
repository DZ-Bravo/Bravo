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
    // localStorage에서 토큰과 사용자 정보 제거
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
    navigate('/')
  }

  return (
    <header>
      <div className="header-top">
        <Link to="/" className="logo">
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

