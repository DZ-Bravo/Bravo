import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import './Notice.css'

function Notice() {
  const navigate = useNavigate()
  const [notices, setNotices] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const fetchNotices = async () => {
      setIsLoading(true)
      setError('')
      try {
        const response = await fetch(`${API_URL}/api/notices`)
        if (!response.ok) {
          throw new Error('공지사항을 불러오는데 실패했습니다.')
        }
        const data = await response.json()
        setNotices(data.notices || [])
      } catch (err) {
        console.error('공지사항 목록 조회 오류:', err)
        setError('공지사항을 불러오는데 실패했습니다.')
        setNotices([])
      } finally {
        setIsLoading(false)
      }
    }

    const checkAdmin = async () => {
      const token = localStorage.getItem('token')
      const userData = localStorage.getItem('user')
      if (token && userData) {
        try {
          const user = JSON.parse(userData)
          const response = await fetch(`${API_URL}/api/auth/me`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          })
          if (response.ok) {
            const userData = await response.json()
            setIsAdmin(userData.user?.role === 'admin')
          }
        } catch (err) {
          console.error('사용자 정보 확인 오류:', err)
        }
      }
    }

    fetchNotices()
    checkAdmin()
  }, [API_URL])

  return (
    <div className="notice-page">
      <Header />
      <main className="notice-main">
        <div className="notice-container">
          <div className="notice-header">
            <h1 className="notice-page-title">공지사항</h1>
            {isAdmin && (
              <Link to="/notice/write" className="write-notice-btn">
                ✏️ 작성하기
              </Link>
            )}
          </div>
          
          {isLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              공지사항을 불러오는 중...
            </div>
          ) : error ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {error}
            </div>
          ) : notices.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              공지사항이 없습니다.
            </div>
          ) : (
            <div className="notice-list">
              {notices.map((notice) => (
                <Link
                  key={notice.id}
                  to={`/notice/${notice.id}`}
                  className="notice-item"
                >
                  <div className="notice-icon">{notice.icon}</div>
                  <div className="notice-content-wrapper">
                    <div className="notice-title">{notice.title}</div>
                    <div className="notice-date">{notice.date}</div>
                  </div>
                  <div className="notice-arrow">→</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default Notice

