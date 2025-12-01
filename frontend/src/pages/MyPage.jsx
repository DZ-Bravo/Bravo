import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import Header from '../components/Header'
import './MyPage.css'

function MyPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const hasChecked = useRef(false)

  useEffect(() => {
    // 중복 체크 방지
    if (hasChecked.current) {
      return
    }
    hasChecked.current = true

    // 로그인 상태 확인
    const token = localStorage.getItem('token')
    const userData = localStorage.getItem('user')

    if (!token || !userData) {
      // 로그인하지 않았으면 로그인 페이지로 리다이렉트
      alert('로그인이 필요합니다.')
      navigate('/login', { replace: true })
      return
    }

    try {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
    } catch (error) {
      console.error('사용자 정보 파싱 오류:', error)
      alert('사용자 정보를 불러올 수 없습니다.')
      navigate('/login', { replace: true })
    } finally {
      setIsLoading(false)
    }
  }, [navigate])

  // 로딩 중이거나 사용자 정보가 없으면 아무것도 표시하지 않음
  if (isLoading || !user) {
    return (
      <div className="mypage-page">
        <Header />
        <main className="mypage-main">
          <div className="mypage-container">
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              로딩 중...
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="mypage-page">
      <Header />
      <main className="mypage-main">
        <div className="mypage-container">
          <h1 className="mypage-title">마이페이지</h1>
          
          <div className="user-profile">
            <div className="profile-avatar">
              {user.profileImage ? (
                <img 
                  src={user.profileImage} 
                  alt={user.name}
                  className="avatar-circle"
                  style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                <div className="avatar-circle">👤</div>
              )}
            </div>
            <div className="profile-info">
              <h2 className="profile-name">{user.name || user.id}</h2>
              <p className="profile-id">ID: {user.id}</p>
            </div>
          </div>

          <div className="mypage-menu">
            <Link to="/mypage/posts" className="menu-item">
              <span className="menu-icon">📝</span>
              <span className="menu-text">내 게시글</span>
              <span className="menu-arrow">→</span>
            </Link>
            <Link to="/mypage/favorites-products" className="menu-item">
              <span className="menu-icon">🛍️</span>
              <span className="menu-text">찜한 상품</span>
              <span className="menu-arrow">→</span>
            </Link>
            <Link to="/mypage/favorites" className="menu-item">
              <span className="menu-icon">❤️</span>
              <span className="menu-text">찜한 코스</span>
              <span className="menu-arrow">→</span>
            </Link>
          </div>

          <div className="mypage-stats">
            <div className="stat-item">
              <div className="stat-number">0</div>
              <div className="stat-label">등반한 산</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">0</div>
              <div className="stat-label">작성한 글</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">0</div>
              <div className="stat-label">받은 좋아요</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default MyPage

