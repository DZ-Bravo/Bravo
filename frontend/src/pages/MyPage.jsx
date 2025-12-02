import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import './MyPage.css'

function MyPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('hiking') // 'hiking' or 'profile'
  const [user, setUser] = useState(null)
  const [stats, setStats] = useState({
    totalElevation: 0,
    totalTime: 0,
    climbedMountains: 0,
    postCount: 0,
    totalLikes: 0,
    points: 0,
    schedules: 0,
    hikingLogs: 0,
    items: 0
  })
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

    const loadUserData = async () => {
      try {
        const parsedUser = JSON.parse(userData)
        setUser(parsedUser)
        
        // 사용자 통계 가져오기
        const statsResponse = await fetch(`${API_URL}/api/auth/stats`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        
        if (statsResponse.ok) {
          const statsData = await statsResponse.json()
          setStats({
            totalElevation: statsData.totalElevation || 0,
            totalTime: statsData.totalTime || 0,
            climbedMountains: statsData.climbedMountains || 0,
            postCount: statsData.postCount || 0,
            totalLikes: statsData.totalLikes || 0,
            points: statsData.points || 0,
            schedules: statsData.schedules || 0,
            hikingLogs: statsData.hikingLogs || 0,
            items: statsData.items || 0,
          })
        }
      } catch (error) {
        console.error('사용자 정보 파싱 오류:', error)
        alert('사용자 정보를 불러올 수 없습니다.')
        navigate('/login', { replace: true })
      } finally {
        setIsLoading(false)
      }
    }

    loadUserData()
  }, [navigate, API_URL])

  const handleLogout = () => {
    if (window.confirm('로그아웃하시겠습니까?')) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      alert('로그아웃되었습니다.')
      navigate('/')
    }
  }

  const handleWithdraw = async () => {
    if (!window.confirm('정말 탈퇴하시겠습니까? 탈퇴 시 모든 데이터가 삭제되며 복구할 수 없습니다.')) {
      return
    }

    // 재확인
    if (!window.confirm('탈퇴를 최종 확인하시겠습니까?')) {
      return
    }

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/auth/delete`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()

      if (response.ok) {
        alert('회원 탈퇴가 완료되었습니다.')
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        navigate('/')
      } else {
        alert(data.error || '탈퇴 처리 중 오류가 발생했습니다.')
      }
    } catch (error) {
      console.error('탈퇴 오류:', error)
      alert('탈퇴 처리 중 오류가 발생했습니다.')
    }
  }

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
          
          {/* 탭 네비게이션 */}
          <div className="mypage-tabs">
            <button 
              className={`tab-button ${activeTab === 'hiking' ? 'active' : ''}`}
              onClick={() => setActiveTab('hiking')}
            >
              나의 하이킹
            </button>
            <button 
              className={`tab-button ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              프로필
            </button>
          </div>

          {/* 나의 하이킹 탭 */}
          {activeTab === 'hiking' && (
            <div className="tab-content">
              {/* 환영 메시지 카드 */}
              <div className="welcome-card">
                <div className="welcome-content">
                  <div className="welcome-text">
                    <h2 className="welcome-greeting">{user.name || user.id}님,</h2>
                    <p className="welcome-message">등산 기록을 남겨볼까요?</p>
                  </div>
                  <div className="welcome-avatar">
                    {user.profileImage ? (
                      <img 
                        src={user.profileImage} 
                        alt={user.name}
                        className="avatar-img"
                      />
                    ) : (
                      <div className="avatar-placeholder"></div>
                    )}
                  </div>
                </div>
              </div>

              {/* 통계 섹션 */}
              <div className="hiking-stats">
                <div className="hiking-stat-item">
                  <div className="stat-icon">⛰️</div>
                  <div className="stat-label">다녀온 산</div>
                  <div className="stat-value">{stats.climbedMountains}개</div>
                </div>
                <div className="hiking-stat-item">
                  <div className="stat-icon">⏰</div>
                  <div className="stat-label">누적시간</div>
                  <div className="stat-value">{stats.totalTime || 0}시간</div>
                </div>
                <div className="hiking-stat-item">
                  <div className="stat-icon">↗️</div>
                  <div className="stat-label">누적고도</div>
                  <div className="stat-value">{(stats.totalElevation || 0).toLocaleString()}m</div>
                </div>
              </div>

            </div>
          )}

          {/* 프로필 탭 */}
          {activeTab === 'profile' && (
            <div className="tab-content">
              {/* 사용자 정보 */}
              <div className="profile-info-card">
                <div className="profile-avatar-section">
                  {user.profileImage ? (
                    <img 
                      src={user.profileImage} 
                      alt={user.name}
                      className="profile-avatar-img"
                    />
                  ) : (
                    <div className="profile-avatar-placeholder">👤</div>
                  )}
                </div>
                <div className="profile-details">
                  <div className="profile-name-text">{user.name || user.id}</div>
                  <div className="profile-level">등력이 없어요</div>
                  <div className="profile-logs">등산일지 {stats.hikingLogs}개</div>
                </div>
                <button className="level-guide-btn">
                  등력안내 &gt;
                </button>
              </div>

              {/* 통계 요약 */}
              <div className="profile-summary-stats">
                <div className="summary-stat-item">
                  <div className="summary-stat-label">나의 포인트</div>
                  <div className="summary-stat-value">{stats.points}</div>
                </div>
                <div className="summary-stat-item">
                  <div className="summary-stat-label">등산 일정</div>
                  <div className="summary-stat-value">{stats.schedules}</div>
                </div>
                <div className="summary-stat-item">
                  <div className="summary-stat-label">찜 목록</div>
                  <div className="summary-stat-value">{stats.items}</div>
                </div>
              </div>

              {/* 내 컨텐츠 */}
              <div className="my-content-section">
                <div className="section-title">내 컨텐츠</div>
                <div className="content-grid">
                  <div className="content-item">
                    <div className="content-icon">📔</div>
                    <div className="content-label">등산일지</div>
                    <div className="content-count">{stats.hikingLogs}</div>
                  </div>
                  <div className="content-item">
                    <div className="content-icon">📅</div>
                    <div className="content-label">등산일정</div>
                    <div className="content-count">{stats.schedules}</div>
                  </div>
                  <div className="content-item">
                    <div className="content-icon">💬</div>
                    <div className="content-label">커뮤니티</div>
                    <div className="content-count">{stats.postCount}</div>
                  </div>
                </div>
              </div>

              {/* 설정 메뉴 */}
              <div className="settings-menu">
                <div className="menu-divider"></div>
                <button className="settings-item" onClick={handleLogout}>
                  로그아웃
                  <span className="settings-arrow">&gt;</span>
                </button>
                <button className="settings-item" onClick={handleWithdraw}>
                  탈퇴하기
                  <span className="settings-arrow">&gt;</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default MyPage
