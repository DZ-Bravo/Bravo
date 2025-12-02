import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Header from '../components/Header'
import Chatbot from '../components/Chatbot'
import { API_URL } from '../utils/api'
import './Home.css'

function Home() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [notices, setNotices] = useState([])
  const [isLoadingNotices, setIsLoadingNotices] = useState(true)

  const handleSearch = (e) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  // 공지사항 가져오기
  useEffect(() => {
    const fetchNotices = async () => {
      try {
        const response = await fetch(`${API_URL}/api/notices?limit=3`)
        if (response.ok) {
          const data = await response.json()
          setNotices(data.notices || [])
        }
      } catch (error) {
        console.error('공지사항 조회 오류:', error)
      } finally {
        setIsLoadingNotices(false)
      }
    }

    fetchNotices()
  }, [API_URL])

  return (
    <div className="home">
      <Header />
      <main>
        {/* 메인 검색 섹션 */}
        <section className="search-section">
          <h1>이번 주엔 어느 산으로 갈까요?</h1>
          <h2>어느 산을 찾으시나요?</h2>
          <form onSubmit={handleSearch} className="search-form">
            <input
              type="text"
              placeholder="산 이름, 지역, 코스명을 검색해보세요"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            <button type="submit" className="search-btn">
              🔍
            </button>
          </form>
        </section>

        {/* 인기 산 섹션 */}
        <section className="popular-mountains">
          <h2>지금 인기 있는 산</h2>
          <div className="mountain-tags">
            <Link to="/mountain/287201304" className="mountain-tag">북한산</Link>
            <Link to="/mountain/428302602" className="mountain-tag">설악산</Link>
            <Link to="/mountain/488605302" className="mountain-tag">지리산</Link>
            <Link to="/mountain/421902904" className="mountain-tag">태백산</Link>
            <Link to="/mountain/483100401" className="mountain-tag">계룡산</Link>
            <Link to="/mountain/457300301" className="mountain-tag">덕유산</Link>
            <Link to="/mountain/438001301" className="mountain-tag">소백산</Link>
            <Link to="/mountain/111100101" className="mountain-tag">북악산</Link>
            <Link to="/mountain/282601001" className="mountain-tag">금정산</Link>
            <Link to="/mountain/287100601" className="mountain-tag">마니산</Link>
          </div>
        </section>

        {/* 테마별 코스 큐레이션 */}
        <section className="themed-courses">
          <h2>테마별 코스 큐레이션</h2>
          <div className="course-grid">
            <Link to="/course/spring" className="course-card spring">
              <div className="course-card-image"></div>
              <div className="course-card-content">
                <h3>봄 산행지</h3>
              </div>
            </Link>
            <Link to="/course/summer" className="course-card summer">
              <div className="course-card-image"></div>
              <div className="course-card-content">
                <h3>여름 산행지</h3>
              </div>
            </Link>
            <Link to="/course/autumn" className="course-card autumn">
              <div className="course-card-image"></div>
              <div className="course-card-content">
                <h3>가을 산행지</h3>
              </div>
            </Link>
            <Link to="/course/winter" className="course-card winter">
              <div className="course-card-image"></div>
              <div className="course-card-content">
                <h3>겨울 산행지</h3>
              </div>
            </Link>
            <Link to="/course/sunrise" className="course-card sunrise">
              <div className="course-card-image"></div>
              <div className="course-card-content">
                <h3>일출 명소 베스트 코스</h3>
              </div>
            </Link>
            <Link to="/course/beginner" className="course-card beginner">
              <div className="course-card-image"></div>
              <div className="course-card-content">
                <h3>초보자 추천 코스</h3>
              </div>
            </Link>
          </div>
        </section>

        {/* 공지사항 섹션 */}
        <section className="notice-section">
          <h2>공지사항</h2>
          <div className="notice-list">
            {isLoadingNotices ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                공지사항을 불러오는 중...
              </div>
            ) : notices.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                공지사항이 없습니다.
              </div>
            ) : (
              notices.map((notice) => (
                <Link
                  key={notice.id}
                  to={`/notice/${notice.id}`}
                  className="notice-item"
                >
                  <span className="notice-title">{notice.title}</span>
                  <span className="notice-date">{notice.date}</span>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* 산 전체보기 버튼 - 고정 */}
        <Link to="/mountains-map" className="view-all-mountains-btn">
          산 전체보기
        </Link>

        {/* 챗봇 */}
        <Chatbot />
      </main>
    </div>
  )
}

export default Home

