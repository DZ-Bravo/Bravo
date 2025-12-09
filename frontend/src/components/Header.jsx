import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { API_URL } from '../utils/api'
import './Header.css'

function Header({ hideNav = false }) {
  const [user, setUser] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const navigate = useNavigate()
  const notificationRef = useRef(null)
  const userMenuRef = useRef(null)

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

  // 알림 가져오기
  useEffect(() => {
    if (!user) {
      console.log('Header - 알림 가져오기 스킵: user 없음')
      return
    }

    const fetchNotifications = async () => {
      const token = localStorage.getItem('token')
      if (!token) {
        console.log('Header - 알림 가져오기 스킵: token 없음')
        return
      }

      try {
        console.log('Header - 알림 가져오기 시작:', `${API_URL}/api/notifications?limit=20`)
        const response = await fetch(`${API_URL}/api/notifications?limit=20`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        console.log('Header - 알림 응답 상태:', response.status, response.ok)
        
        if (response.ok) {
          const data = await response.json()
          console.log('Header - 알림 데이터:', {
            notificationsCount: data.notifications?.length || 0,
            unreadCount: data.unreadCount || 0,
            notifications: data.notifications
          })
          setNotifications(data.notifications || [])
          setUnreadCount(data.unreadCount || 0)
        } else {
          const errorData = await response.json().catch(() => ({}))
          console.error('Header - 알림 가져오기 실패:', response.status, errorData)
        }
      } catch (error) {
        console.error('Header - 알림 가져오기 오류:', error)
      }
    }

    fetchNotifications()
    // 30초마다 알림 새로고침
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [user])

  // 외부 클릭 시 알림 닫기
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false)
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false)
      }
    }

    if (showNotifications || showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showNotifications, showUserMenu])

  const handleNotificationClick = async (notification) => {
    const token = localStorage.getItem('token')
    if (!token) return

    // 읽음 처리
    if (!notification.read) {
      try {
        await fetch(`${API_URL}/api/notifications/${notification._id}/read`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        setNotifications(notifications.map(n => 
          n._id === notification._id ? { ...n, read: true } : n
        ))
        setUnreadCount(prev => Math.max(0, prev - 1))
      } catch (error) {
        console.error('알림 읽음 처리 오류:', error)
      }
    }

    // 관련 페이지로 이동
    if (notification.relatedId) {
      if (notification.type === 'point_earned') {
        // 포인트 적립 알림인 경우 포인트 페이지로 이동
        navigate('/mypage/points')
      } else if (notification.type === 'comment') {
        navigate(`/community/${notification.relatedId}`)
      } else if (notification.type === 'schedule_reminder') {
        // 등산일정 알림인 경우, 일정 날짜를 URL에 포함
        const scheduleId = notification.relatedId
        navigate(`/mypage?tab=profile&openCalendar=true&scheduleId=${scheduleId}`)
      } else if (notification.type === 'announcement') {
        navigate(`/notice/${notification.relatedId}`)
      }
    } else {
      // relatedId가 없어도 schedule_reminder 타입이면 마이페이지로 이동
      if (notification.type === 'schedule_reminder') {
        navigate('/mypage?tab=profile&openCalendar=true')
      } else if (notification.type === 'point_earned') {
        // 포인트 적립 알림인 경우 포인트 페이지로 이동
        navigate('/mypage/points')
      }
    }
    setShowNotifications(false)
  }

  const handleMarkAllAsRead = async () => {
    const token = localStorage.getItem('token')
    if (!token) return

    try {
      const response = await fetch(`${API_URL}/api/notifications/read-all`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        setNotifications(notifications.map(n => ({ ...n, read: true })))
        setUnreadCount(0)
      }
    } catch (error) {
      console.error('알림 일괄 읽음 처리 오류:', error)
    }
  }

  const handleDeleteNotification = async (notificationId) => {
    const token = localStorage.getItem('token')
    if (!token) return

    if (!window.confirm('알림을 삭제하시겠습니까?')) return

    try {
      const response = await fetch(`${API_URL}/api/notifications/${notificationId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        // 삭제된 알림을 목록에서 제거
        setNotifications(notifications.filter(n => n._id !== notificationId))
        // 읽지 않은 알림 수 업데이트
        const deletedNotification = notifications.find(n => n._id === notificationId)
        if (deletedNotification && !deletedNotification.read) {
          setUnreadCount(prev => Math.max(0, prev - 1))
        }
      } else {
        alert('알림 삭제에 실패했습니다.')
      }
    } catch (error) {
      console.error('알림 삭제 오류:', error)
      alert('알림 삭제 중 오류가 발생했습니다.')
    }
  }

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
    <header className={hideNav ? 'hide-nav' : ''}>
      <div className="header-top">
        <Link to="/" className="logo">
          <img src="/images/logo.png" alt="HIKER" className="logo-img" />
        </Link>
        <div className="header-actions">
          {user ? (
            <div className="user-info">
              <div className="notification-container" ref={notificationRef}>
                <button 
                  className="notification-btn"
                  onClick={() => setShowNotifications(!showNotifications)}
                >
                  <img 
                    src="/images/bell_icon.png" 
                    alt="알림" 
                    className="notification-icon"
                  />
                  {unreadCount > 0 && (
                    <span className="notification-dot"></span>
                  )}
                </button>
                {showNotifications && (
                  <div className="notification-dropdown">
                    <div className="notification-header">
                      <h3>알림</h3>
                      {notifications.length > 0 && (
                        <button 
                          className="mark-all-read-btn" 
                          onClick={handleMarkAllAsRead}
                          disabled={unreadCount === 0}
                        >
                          모두 읽음
                        </button>
                      )}
                    </div>
                    <div className="notification-list">
                      {notifications.length === 0 ? (
                        <div className="notification-empty">알림이 없습니다.</div>
                      ) : (
                        notifications.map((notification) => (
                          <div
                            key={notification._id}
                            className={`notification-item ${!notification.read ? 'unread' : ''}`}
                          >
                            <div 
                              className="notification-content"
                              onClick={() => handleNotificationClick(notification)}
                            >
                              <div className="notification-title">{notification.title}</div>
                              <div className="notification-message">{notification.message}</div>
                              <div className="notification-time">
                                {new Date(notification.createdAt).toLocaleString('ko-KR', {
                                  year: 'numeric',
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                            </div>
                            <button
                              className="notification-delete-btn"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteNotification(notification._id)
                              }}
                              title="삭제"
                            >
                              ✕
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="user-menu-container" ref={userMenuRef}>
                <button 
                  className="user-menu-btn"
                  onClick={() => setShowUserMenu(!showUserMenu)}
                >
                  <span className="user-name-display">{user.role === 'admin' ? '관리자' : (user.name || user.id)}</span>
                  <span className="user-menu-arrow">▼</span>
                </button>
                {showUserMenu && (
                  <div className="user-menu-dropdown">
                    <Link 
                      to="/mypage" 
                      className="user-menu-item"
                      onClick={() => setShowUserMenu(false)}
                    >
                      마이페이지
                    </Link>
                    <button 
                      onClick={() => {
                        setShowUserMenu(false)
                        handleLogout()
                      }} 
                      className="user-menu-item user-menu-logout"
                    >
                      로그아웃
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <Link to="/login" className="btn-login">로그인</Link>
              <Link to="/signup" className="btn-signup">회원가입</Link>
            </>
          )}
        </div>
      </div>
      {!hideNav && (
        <nav>
          <ul>
            <li><Link to="/notice">공지사항</Link></li>
            <li><Link to="/ai-course">AI 등산 코스 추천</Link></li>
            <li><Link to="/store">스토어</Link></li>
            <li><Link to="/community">커뮤니티</Link></li>
          </ul>
        </nav>
      )}
    </header>
  )
}

export default Header

