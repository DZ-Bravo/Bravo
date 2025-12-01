import { Link } from 'react-router-dom'
import Header from '../components/Header'
import './MyPage.css'

function MyPage() {
  return (
    <div className="mypage-page">
      <Header />
      <main className="mypage-main">
        <div className="mypage-container">
          <h1 className="mypage-title">마이페이지</h1>
          
          <div className="user-profile">
            <div className="profile-avatar">
              <div className="avatar-circle">👤</div>
            </div>
            <div className="profile-info">
              <h2 className="profile-name">등산러123</h2>
              <p className="profile-id">ID: 등산러123</p>
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

