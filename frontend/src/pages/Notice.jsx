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
  const [activeTab, setActiveTab] = useState('전체')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  const tabs = ['전체', '공지사항', '정보', '이벤트', '업데이트']
  const typeMap = {
    '전체': null,
    '공지사항': 'announcement',
    '정보': 'info',
    '이벤트': 'event',
    '업데이트': 'update'
  }

  const getIconByType = (type) => {
    const iconMap = {
      'announcement': '/images/anno_icon.png',
      'event': '/images/event_icon.png',
      'info': '/images/info_icon.png',
      'update': '/images/update_icon.png'
    }
    return iconMap[type] || '/images/anno_icon.png'
  }

  useEffect(() => {
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

    checkAdmin()
  }, [API_URL])

  useEffect(() => {
    const fetchNotices = async () => {
      setIsLoading(true)
      setError('')
      try {
        const selectedType = typeMap[activeTab]
        const limit = 15
        
        // 모든 데이터를 가져와서 클라이언트에서 필터링 및 페이지네이션 처리
        const url = `${API_URL}/api/notices?page=1&limit=1000` // 충분히 큰 수로 모든 데이터 가져오기

        const response = await fetch(url)
        if (!response.ok) {
          throw new Error('공지사항을 불러오는데 실패했습니다.')
        }
        const data = await response.json()
        
        // 타입별 필터링
        let filteredNotices = data.notices || []
        if (selectedType) {
          filteredNotices = filteredNotices.filter(notice => notice.type === selectedType)
        }

        // 페이지네이션 처리
        const startIndex = (currentPage - 1) * limit
        const endIndex = startIndex + limit
        const paginatedNotices = filteredNotices.slice(startIndex, endIndex)
        
        setNotices(paginatedNotices)
        
        // 전체 개수와 페이지 수 계산
        const totalCount = filteredNotices.length
        setTotal(totalCount)
        setTotalPages(Math.ceil(totalCount / limit))
      } catch (err) {
        console.error('공지사항 목록 조회 오류:', err)
        setError('공지사항을 불러오는데 실패했습니다.')
        setNotices([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchNotices()
  }, [API_URL, activeTab, currentPage])

  const handleTabClick = (tab) => {
    setActiveTab(tab)
    setCurrentPage(1) // 탭 변경 시 첫 페이지로
  }

  const handlePageChange = (page) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="notice-page">
      <Header />
      <main className="notice-main">
        <div className="notice-container">
          <div className="notice-header">
            <div className="notice-title-section">
              <div className="notice-title-wrapper">
                <h1 className="notice-page-title">공지사항</h1>
                <p className="notice-subtitle">공지·정보·이벤트·업데이트 다양한 소식을 확인하세요!</p>
              </div>
            </div>
          </div>

          {/* 탭 메뉴 */}
          <div className="notice-tabs">
            {tabs.map((tab) => (
              <button
                key={tab}
                className={`notice-tab ${activeTab === tab ? 'active' : ''}`}
                onClick={() => handleTabClick(tab)}
              >
                {tab}
              </button>
            ))}
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
            <>
              <div className="notice-list">
                {notices.map((notice) => (
                  <Link
                    key={notice.id}
                    to={`/notice/${notice.id}`}
                    className="notice-item"
                  >
                    <div className="notice-icon">
                      <img 
                        src={getIconByType(notice.type)} 
                        alt={notice.type}
                        onError={(e) => {
                          e.target.src = '/images/anno_icon.png'
                        }}
                      />
                    </div>
                    <div className="notice-content-wrapper">
                      <div className="notice-title">{notice.title}</div>
                    </div>
                    <div className="notice-date">{notice.date}</div>
                  </Link>
                ))}
              </div>

              {/* 작성하기 버튼 */}
              {isAdmin && (
                <div className="write-notice-btn-wrapper">
                  <Link to="/notice/write" className="write-notice-btn">
                    작성하기
                  </Link>
                </div>
              )}

              {/* 페이지네이션 */}
              {totalPages > 1 && (
                <div className="notice-pagination">
                  <button
                    className="pagination-btn"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    &lt;
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      className={`pagination-btn ${currentPage === page ? 'active' : ''}`}
                      onClick={() => handlePageChange(page)}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    className="pagination-btn"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    &gt;
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

export default Notice

