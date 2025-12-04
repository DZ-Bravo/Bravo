import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import './MyPage.css'

function MyPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState('hiking') // 'hiking' or 'profile'
  const [showLevelGuide, setShowLevelGuide] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [user, setUser] = useState(null)
  const [stats, setStats] = useState({
    totalElevation: 0,
    totalTime: 0,
    climbedMountains: 0,
    postCount: 0,
    totalLikes: 0,
    diaryLikes: 0,
    communityLikes: 0,
    points: 0,
    schedules: 0,
    hikingLogs: 0,
    items: 0
  })
  const [isLoading, setIsLoading] = useState(true)
  const [recentRecords, setRecentRecords] = useState([])
  const [schedules, setSchedules] = useState([])
  const hasChecked = useRef(false)

  // URL 파라미터 확인하여 탭과 캘린더 자동 열기
  useEffect(() => {
    const tab = searchParams.get('tab')
    const openCalendar = searchParams.get('openCalendar')
    const scheduleId = searchParams.get('scheduleId')
    
    if (tab === 'profile') {
      setActiveTab('profile')
    }
    
    if (openCalendar === 'true') {
      if (scheduleId && schedules.length > 0) {
        // 특정 등산일정으로 포커스
        const schedule = schedules.find(s => s._id === scheduleId || s.id === scheduleId)
        if (schedule && schedule.scheduledDate) {
          const scheduleDate = new Date(schedule.scheduledDate)
          setCurrentDate(new Date(scheduleDate.getFullYear(), scheduleDate.getMonth(), 1))
          setSelectedDate(scheduleDate)
          setShowCalendar(true)
        } else {
          // 일정을 찾을 수 없으면 오늘 날짜로
          const today = new Date()
          setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1))
          setSelectedDate(today)
          setShowCalendar(true)
        }
      } else {
        // scheduleId가 없으면 오늘 날짜로
        const today = new Date()
        setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1))
        setSelectedDate(today)
        setShowCalendar(true)
      }
      // URL에서 파라미터 제거 (한 번만 실행되도록)
      setSearchParams({})
    }
  }, [searchParams, setSearchParams, schedules])

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
            diaryLikes: statsData.diaryLikes || 0,
            communityLikes: statsData.communityLikes || 0,
            points: statsData.points || 0,
            schedules: statsData.schedules || 0,
            hikingLogs: statsData.hikingLogs || 0,
            items: statsData.items || 0,
          })
        }

        // 최근 등산일지 가져오기 (사용자 본인의 등산일지만, 최대 5개)
        const recordsResponse = await fetch(`${API_URL}/api/posts/my?category=diary&limit=5`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        
        if (recordsResponse.ok) {
          const recordsData = await recordsResponse.json()
          const records = (recordsData.posts || []).slice(0, 5)
          
          console.log('최근 등산일지 조회 결과:', records.length, '개')
          
          // 산 이름 가져오기
          const recordsWithMountainName = await Promise.all(
            records.map(async (record) => {
              if (record.mountainCode) {
                try {
                  const mountainResponse = await fetch(`${API_URL}/api/mountains/${record.mountainCode}`)
                  if (mountainResponse.ok) {
                    const mountainData = await mountainResponse.json()
                    return {
                      ...record,
                      mountainName: mountainData.name || '알 수 없음'
                    }
                  }
                } catch (e) {
                  console.error('산 정보 조회 오류:', e)
                }
              }
              return {
                ...record,
                mountainName: '알 수 없음'
              }
            })
          )
          
          console.log('산 이름 포함 최근 등산일지:', recordsWithMountainName)
          setRecentRecords(recordsWithMountainName)
        } else {
          console.error('등산일지 조회 실패:', recordsResponse.status, recordsResponse.statusText)
        }

        // 등산일정 가져오기
        const schedulesResponse = await fetch(`${API_URL}/api/schedules`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        
        if (schedulesResponse.ok) {
          const schedulesData = await schedulesResponse.json()
          setSchedules(schedulesData.schedules || [])
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
                        src={user.profileImage.startsWith('http') ? user.profileImage : `${API_URL}${user.profileImage}`}
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
                  <div className="stat-label">누적거리</div>
                  <div className="stat-value">{Number((stats.totalElevation || 0).toFixed(2)).toLocaleString()}km</div>
                </div>
              </div>

              {/* 최근 기록 섹션 */}
              <div className="recent-records-section">
                <div className="records-header">
                  <h3 className="records-title">최근 기록</h3>
                  <Link to="/mypage/posts?category=diary" className="view-all-link">
                    전체보기 &gt;
                  </Link>
                </div>
                <div className="records-content">
                  {recentRecords.length === 0 ? (
                    <div className="records-empty">
                      <p>기록이 없어요 😊</p>
                      <p className="records-empty-hint">등산일지를 작성해보세요</p>
                    </div>
                  ) : (
                    <div className="records-list">
                      {recentRecords.map((record) => {
                        const date = new Date(record.date || record.createdAt)
                        const formattedDate = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
                        
                        return (
                          <Link 
                            key={record.id} 
                            to={`/community/${record.id}`}
                            className="record-item"
                            style={{ textDecoration: 'none', color: 'inherit' }}
                          >
                            {record.images && record.images.length > 0 && (
                              <div className="record-image">
                                <img 
                                  src={record.images[0].startsWith('http') ? record.images[0] : `${API_URL}${record.images[0]}`}
                                  alt={record.title}
                                />
                              </div>
                            )}
                            <div className="record-info">
                              <div className="record-title">{record.title}</div>
                              <div className="record-details">
                                {record.mountainName && (
                                  <span className="record-mountain">⛰️ {record.mountainName}</span>
                                )}
                              </div>
                              <div className="record-meta">
                                <span className="record-date">{formattedDate}</span>
                              </div>
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* 기록하기 버튼 */}
              <Link to="/community/write" className="record-btn">
                ✏️ 기록하기
              </Link>

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
                      src={user.profileImage.startsWith('http') ? user.profileImage : `${API_URL}${user.profileImage}`}
                      alt={user.name}
                      className="profile-avatar-img"
                    />
                  ) : (
                    <div className="profile-avatar-placeholder">👤</div>
                  )}
                </div>
                <div className="profile-details">
                  <div className="profile-name-text">{user.name || user.id}</div>
                  <div className="profile-logs">등산일지 {stats.hikingLogs}개</div>
                </div>
                <button className="level-guide-btn" onClick={() => setShowLevelGuide(true)}>
                  등력안내 &gt;
                </button>
              </div>

              {/* 통계 요약 */}
              <div className="profile-summary-stats">
                <Link to="/mypage/points" className="summary-stat-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="summary-stat-label">나의 포인트</div>
                  <div className="summary-stat-value">{stats.points}</div>
                </Link>
                <button 
                  className="summary-stat-item" 
                  onClick={() => {
                    const today = new Date()
                    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1))
                    setSelectedDate(today)
                    setShowCalendar(true)
                  }}
                >
                  <div className="summary-stat-label">등산 일정</div>
                  <div className="summary-stat-value">{stats.schedules}</div>
                </button>
                <Link to="/mypage/favorites" className="summary-stat-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="summary-stat-label">찜 목록</div>
                  <div className="summary-stat-value">{stats.items}</div>
                </Link>
              </div>

              {/* 내 컨텐츠 */}
              <div className="my-content-section">
                <div className="section-title">내 컨텐츠</div>
                <div className="content-grid">
                  <Link to="/mypage/posts?category=diary" className="content-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div className="content-icon">📔</div>
                    <div className="content-label">등산일지</div>
                    <div className="content-count">{stats.hikingLogs}</div>
                  </Link>
                  <Link to="/mypage/posts" className="content-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div className="content-icon">💬</div>
                    <div className="content-label">커뮤니티</div>
                    <div className="content-count">{stats.postCount}</div>
                  </Link>
                  <div className="content-item">
                    <div className="content-icon">❤️</div>
                    <div className="content-label">좋아요</div>
                    <div className="content-count">{stats.totalLikes}</div>
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
                <Link to="/mypage/edit" className="settings-item" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer' }}>
                  회원수정
                  <span className="settings-arrow">&gt;</span>
                </Link>
                <button className="settings-item" onClick={handleWithdraw}>
                  탈퇴하기
                  <span className="settings-arrow">&gt;</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 등력안내 모달 */}
      {showLevelGuide && createPortal(
        <div className="level-guide-modal-overlay" onClick={() => setShowLevelGuide(false)}>
          <div className="level-guide-modal" onClick={(e) => e.stopPropagation()}>
            <div className="level-guide-modal-header">
              <button 
                className="level-guide-close-btn"
                onClick={() => setShowLevelGuide(false)}
              >
                ✕
              </button>
              <h2 className="level-guide-title">등력 안내</h2>
            </div>
            <div className="level-guide-content">
              <p className="level-guide-intro">
                나와 비슷한 산쟁이들이 남긴 후기들을 참고하여 하이킹을 더욱 즐겁고 편하게 즐기기 위해 등력을 표시하고 있어요!
              </p>
              <div className="level-guide-list">
                <div className="level-item">
                  <span className="level-dot" style={{ backgroundColor: '#CCCCCC' }}></span>
                  <div className="level-text">
                    <div className="level-main-text">등산 경험 3회 이하</div>
                  </div>
                </div>
                <div className="level-item">
                  <span className="level-dot" style={{ backgroundColor: '#FFD700' }}></span>
                  <div className="level-text">
                    <div className="level-main-text">왕복 2시간 이상 등산 가능</div>
                  </div>
                </div>
                <div className="level-item">
                  <span className="level-dot" style={{ backgroundColor: '#4CAF50' }}></span>
                  <div className="level-text">
                    <div className="level-main-text">왕복 3시간 이상 등산 가능</div>
                    <div className="level-sub-text">등산 경험 10회 전후</div>
                  </div>
                </div>
                <div className="level-item">
                  <span className="level-dot" style={{ backgroundColor: '#FF9800' }}></span>
                  <div className="level-text">
                    <div className="level-main-text">왕복 5시간 이상 등산 가능</div>
                    <div className="level-sub-text">1,000m 이상 경험 有</div>
                  </div>
                </div>
                <div className="level-item">
                  <span className="level-dot" style={{ backgroundColor: '#9C27B0' }}></span>
                  <div className="level-text">
                    <div className="level-main-text">왕복 6시간 이상 등산 가능</div>
                    <div className="level-sub-text">1,000m 이상 경험 多</div>
                  </div>
                </div>
                <div className="level-item">
                  <span className="level-dot" style={{ backgroundColor: '#3F51B5' }}></span>
                  <div className="level-text">
                    <div className="level-main-text">장시간 등산 가능</div>
                    <div className="level-sub-text">종주 경험 有</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="level-guide-modal-footer">
              <button 
                className="level-guide-close-button"
                onClick={() => setShowLevelGuide(false)}
              >
                닫기
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 등산일정 캘린더 모달 */}
      {showCalendar && createPortal(
        <div className="level-guide-modal-overlay" onClick={() => setShowCalendar(false)}>
          <div className="calendar-modal" onClick={(e) => e.stopPropagation()}>
            <div className="calendar-modal-header">
              <button 
                className="calendar-close-btn"
                onClick={() => setShowCalendar(false)}
              >
                ✕
              </button>
              <h2 className="calendar-title">캘린더 보기</h2>
            </div>
            <div className="calendar-content">
              {/* 캘린더 네비게이션 */}
              <div className="calendar-navigation">
                <button 
                  className="calendar-nav-btn"
                  onClick={() => setCurrentDate(new Date(currentDate.getFullYear() - 1, currentDate.getMonth(), 1))}
                >
                  ««
                </button>
                <button 
                  className="calendar-nav-btn"
                  onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}
                >
                  ‹
                </button>
                <div className="calendar-month-year">
                  {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
                </div>
                <button 
                  className="calendar-nav-btn"
                  onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}
                >
                  ›
                </button>
                <button 
                  className="calendar-nav-btn"
                  onClick={() => setCurrentDate(new Date(currentDate.getFullYear() + 1, currentDate.getMonth(), 1))}
                >
                  »»
                </button>
              </div>

              {/* 캘린더 그리드 */}
              <div className="calendar-grid">
                {/* 요일 헤더 */}
                <div className="calendar-weekdays">
                  {['월', '화', '수', '목', '금', '토', '일'].map((day, index) => (
                    <div 
                      key={day} 
                      className={`calendar-weekday ${index === 5 || index === 6 ? 'weekend' : ''}`}
                    >
                      {day}
                    </div>
                  ))}
                </div>

                {/* 날짜 그리드 */}
                <div className="calendar-days">
                  {(() => {
                    const year = currentDate.getFullYear()
                    const month = currentDate.getMonth()
                    const firstDay = new Date(year, month, 1).getDay()
                    const daysInMonth = new Date(year, month + 1, 0).getDate()
                    const days = []
                    
                    // 첫 주의 빈 칸
                    const startDay = firstDay === 0 ? 6 : firstDay - 1
                    for (let i = 0; i < startDay; i++) {
                      days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>)
                    }
                    
                    // 날짜들
                    for (let day = 1; day <= daysInMonth; day++) {
                      const date = new Date(year, month, day)
                      const dayOfWeek = date.getDay()
                      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
                      const isSelected = selectedDate && 
                        selectedDate.getDate() === day && 
                        selectedDate.getMonth() === month && 
                        selectedDate.getFullYear() === year
                      
                      // 해당 날짜의 등산일정 확인
                      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                      const daySchedules = schedules.filter(schedule => {
                        const scheduleDate = new Date(schedule.scheduledDate)
                        const scheduleDateStr = `${scheduleDate.getFullYear()}-${String(scheduleDate.getMonth() + 1).padStart(2, '0')}-${String(scheduleDate.getDate()).padStart(2, '0')}`
                        return scheduleDateStr === dateStr
                      })
                      const hasEvent = daySchedules.length > 0
                      
                      days.push(
                        <div 
                          key={day}
                          className={`calendar-day ${isWeekend ? 'weekend' : ''} ${isSelected ? 'selected' : ''}`}
                          onClick={() => setSelectedDate(date)}
                        >
                          <span className="calendar-day-number">{day}</span>
                          {hasEvent && <span className="calendar-marker red-dot"></span>}
                        </div>
                      )
                    }
                    
                    return days
                  })()}
                </div>
              </div>

              {/* 일정 정보 카드 */}
              {selectedDate && (() => {
                const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
                const daySchedules = schedules.filter(schedule => {
                  const scheduleDate = new Date(schedule.scheduledDate)
                  const scheduleDateStr = `${scheduleDate.getFullYear()}-${String(scheduleDate.getMonth() + 1).padStart(2, '0')}-${String(scheduleDate.getDate()).padStart(2, '0')}`
                  return scheduleDateStr === dateStr
                })

                if (daySchedules.length === 0) {
                  return (
                    <div className="calendar-event-card">
                      <div className="event-details">
                        <div className="event-mountain">등산일정이 없습니다</div>
                      </div>
                    </div>
                  )
                }

                return daySchedules.map((schedule) => {
                  const scheduleDate = new Date(schedule.scheduledDate)
                  const today = new Date()
                  today.setHours(0, 0, 0, 0)
                  scheduleDate.setHours(0, 0, 0, 0)
                  const diffTime = scheduleDate - today
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
                  const dDay = diffDays > 0 ? `D-${diffDays}` : diffDays === 0 ? 'D-Day' : '지난 일정'

                  const handleDeleteSchedule = async () => {
                    if (!window.confirm('등산일정을 삭제하시겠습니까?')) return

                    const token = localStorage.getItem('token')
                    try {
                      const response = await fetch(`${API_URL}/api/schedules/${schedule._id}`, {
                        method: 'DELETE',
                        headers: {
                          'Authorization': `Bearer ${token}`
                        }
                      })

                      if (response.ok) {
                        alert('등산일정이 삭제되었습니다.')
                        const updatedSchedules = schedules.filter(s => s._id !== schedule._id)
                        setSchedules(updatedSchedules)
                        setSelectedDate(null)
                        // 통계 다시 불러오기
                        const statsResponse = await fetch(`${API_URL}/api/auth/stats`, {
                          headers: {
                            'Authorization': `Bearer ${token}`
                          }
                        })
                        if (statsResponse.ok) {
                          const statsData = await statsResponse.json()
                          setStats(prev => ({ ...prev, schedules: statsData.schedules || 0 }))
                        }
                      } else {
                        alert('등산일정 삭제에 실패했습니다.')
                      }
                    } catch (error) {
                      console.error('등산일정 삭제 오류:', error)
                      alert('등산일정 삭제 중 오류가 발생했습니다.')
                    }
                  }

                  const formattedDate = `${scheduleDate.getFullYear()}년 ${scheduleDate.getMonth() + 1}월 ${scheduleDate.getDate()}일 ${schedule.scheduledTime || '09:00'}`

                  return (
                    <div key={schedule._id} className="calendar-event-card">
                      <div className="event-image">
                        <div style={{ width: '100%', height: '100%', background: '#e0e0e0', borderRadius: '8px' }}></div>
                      </div>
                      <div className="event-details">
                        <div className="event-d-day">{dDay}</div>
                        <div className="event-mountain">{schedule.mountainName}</div>
                        <div className="event-time">🕐 {formattedDate}</div>
                        {schedule.courseName && (
                          <div className="event-course">📍 {schedule.courseName}</div>
                        )}
                        {schedule.notes && (
                          <div className="event-notes">{schedule.notes}</div>
                        )}
                        <div className="event-actions">
                          <button className="event-cancel-btn" onClick={handleDeleteSchedule}>일정 취소</button>
                          <Link 
                            to={`/mountain/${schedule.mountainCode}`}
                            className="event-info-btn"
                            style={{ textDecoration: 'none', color: 'inherit' }}
                          >
                            산 정보 보기
                          </Link>
                        </div>
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
            <div className="calendar-modal-footer">
              <button 
                className="calendar-close-button"
                onClick={() => setShowCalendar(false)}
              >
                닫기
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default MyPage
