import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import './MyPoints.css'

function MyPoints() {
  const navigate = useNavigate()
  const [points, setPoints] = useState(0)
  const [earned, setEarned] = useState(0)
  const [used, setUsed] = useState(0)
  const [filter, setFilter] = useState('all') // 'all', 'earned', 'used'
  const [history, setHistory] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      alert('로그인이 필요합니다.')
      navigate('/login', { replace: true })
      return
    }

    const fetchPoints = async () => {
      try {
        const response = await fetch(`${API_URL}/api/auth/stats`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        
        if (response.ok) {
          const data = await response.json()
          setPoints(data.points || 0)
          setEarned(data.earnedPoints || 0)
          setUsed(data.usedPoints || 0)
        }
      } catch (error) {
        console.error('포인트 조회 오류:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchPoints()
  }, [navigate, API_URL])

  const filteredHistory = filter === 'all' 
    ? history 
    : filter === 'earned' 
    ? history.filter(item => item.type === 'earned')
    : history.filter(item => item.type === 'used')

  return (
    <div className="mypoints-page">
      <Header />
      <main className="mypoints-main">
        <div className="mypoints-container">
          <div className="mypoints-header">
            <Link to="/mypage" className="back-link">
              ←
            </Link>
            <h1 className="mypoints-title">나의 포인트</h1>
          </div>

          {/* 보유 포인트 섹션 */}
          <div className="points-summary">
            <div className="points-header-row">
              <h2 className="points-label">보유 포인트</h2>
              <span className="points-value">{points}</span>
            </div>
            <div className="points-details">
              <div className="points-detail-item">
                <span className="points-detail-label">· 적립</span>
                <span className="points-detail-value">+ {earned}</span>
              </div>
              <div className="points-detail-item">
                <span className="points-detail-label">· 사용</span>
                <span className="points-detail-value">- {used}</span>
              </div>
            </div>
          </div>

          {/* 필터 버튼 */}
          <div className="points-filter">
            <button 
              className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              전체
            </button>
            <button 
              className={`filter-btn ${filter === 'earned' ? 'active' : ''}`}
              onClick={() => setFilter('earned')}
            >
              적립
            </button>
            <button 
              className={`filter-btn ${filter === 'used' ? 'active' : ''}`}
              onClick={() => setFilter('used')}
            >
              사용
            </button>
          </div>

          {/* 총 건수 */}
          <div className="points-count">
            총 {filteredHistory.length}건
          </div>

          {/* 포인트 내역 */}
          {isLoading ? (
            <div className="points-empty">
              <p>포인트 내역을 불러오는 중...</p>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="points-empty">
              <p>포인트 적립내역이 없어요 😊</p>
              <p className="points-empty-hint">오늘 등산 후기를 작성해보세요</p>
            </div>
          ) : (
            <div className="points-history">
              {filteredHistory.map((item, index) => (
                <div key={index} className="points-history-item">
                  <div className="history-content">
                    <div className="history-title">{item.title}</div>
                    <div className="history-date">{item.date}</div>
                  </div>
                  <div className={`history-points ${item.type === 'earned' ? 'earned' : 'used'}`}>
                    {item.type === 'earned' ? '+' : '-'} {item.points}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default MyPoints

