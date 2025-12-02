import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import './NoticeDetail.css'

function NoticeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [notice, setNotice] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const hasFetched = useRef(false)
  const currentId = useRef(null)

  useEffect(() => {
    // id가 변경되면 리셋
    if (currentId.current !== id) {
      currentId.current = id
      hasFetched.current = false
      setNotice(null)
      setIsLoading(true)
      setError('')
    }
    
    // 중복 호출 방지
    if (hasFetched.current || !id) {
      return
    }

    const fetchNotice = async () => {
      if (hasFetched.current) {
        return
      }
      hasFetched.current = true
      
      setIsLoading(true)
      setError('')
      
      try {
        const response = await fetch(`${API_URL}/api/notices/${id}`)
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('공지사항을 찾을 수 없습니다.')
          }
          throw new Error('공지사항을 불러오는데 실패했습니다.')
        }
        const data = await response.json()
        
        if (currentId.current === id) {
          setNotice(data)
          
          // 관리자 권한 확인
          const token = localStorage.getItem('token')
          const userData = localStorage.getItem('user')
          if (token && userData) {
            try {
              const user = JSON.parse(userData)
              const userResponse = await fetch(`${API_URL}/api/auth/me`, {
                headers: {
                  'Authorization': `Bearer ${token}`
                }
              })
              if (userResponse.ok) {
                const userData = await userResponse.json()
                setIsAdmin(userData.user?.role === 'admin')
              }
            } catch (err) {
              console.error('사용자 정보 확인 오류:', err)
            }
          }
        }
      } catch (err) {
        console.error('공지사항 상세 조회 오류:', err)
        if (currentId.current === id) {
          setError(err.message || '공지사항을 불러오는데 실패했습니다.')
        }
        hasFetched.current = false
      } finally {
        if (currentId.current === id) {
          setIsLoading(false)
        }
      }
    }

    fetchNotice()
  }, [id, API_URL])

  const handleDelete = async () => {
    if (!window.confirm('정말 삭제하시겠습니까?')) {
      return
    }

    const token = localStorage.getItem('token')
    if (!token) {
      alert('로그인이 필요합니다.')
      navigate('/login')
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/notices/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        alert('공지사항이 삭제되었습니다.')
        navigate('/notice')
      } else {
        const errorData = await response.json()
        alert(errorData.error || '공지사항 삭제 중 오류가 발생했습니다.')
      }
    } catch (error) {
      console.error('공지사항 삭제 오류:', error)
      alert('공지사항 삭제 중 오류가 발생했습니다.')
    }
  }

  if (isLoading) {
    return (
      <div className="notice-detail-page">
        <Header />
        <main className="notice-detail-main">
          <div className="notice-detail-container">
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              로딩 중...
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (error || !notice) {
    return (
      <div className="notice-detail-page">
        <Header />
        <main className="notice-detail-main">
          <div className="notice-detail-container">
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {error || '공지사항을 찾을 수 없습니다.'}
            </div>
            <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <Link to="/notice" className="back-link">
                목록으로 돌아가기
              </Link>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="notice-detail-page">
      <Header />
      <main className="notice-detail-main">
        <div className="notice-detail-container">
          <div className="detail-header">
            <Link to="/notice" className="back-link">
              ←
            </Link>
            
            {isAdmin && (
              <div className="notice-actions">
                <button
                  onClick={() => navigate(`/notice/edit/${id}`)}
                  className="edit-btn"
                >
                  수정
                </button>
                <button
                  onClick={handleDelete}
                  className="delete-btn"
                >
                  삭제
                </button>
              </div>
            )}
          </div>

          <div className="notice-detail">
            <div className="notice-detail-header">
              <span className="notice-icon-large">{notice.icon}</span>
              <h1 className="notice-title">{notice.title}</h1>
            </div>

            <div className="notice-meta">
              <span className="notice-author">{notice.author}</span>
              <span className="notice-date">{notice.date}</span>
              <span className="notice-views">조회 {notice.views}</span>
            </div>

            {notice.images && notice.images.length > 0 && (
              <div className="notice-images">
                {notice.images.map((image, index) => (
                  <img
                    key={index}
                    src={`${API_URL}${image}`}
                    alt={`공지사항 이미지 ${index + 1}`}
                    className="content-image"
                    onError={(e) => {
                      e.target.style.display = 'none'
                    }}
                  />
                ))}
              </div>
            )}

            <div className="notice-content">
              {notice.content ? (
                notice.content.split('\n').map((line, index) => (
                  <p key={index}>{line || '\u00A0'}</p>
                ))
              ) : (
                <p>내용이 없습니다.</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default NoticeDetail

