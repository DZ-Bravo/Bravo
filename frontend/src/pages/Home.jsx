import { Link } from 'react-router-dom'
import { useState } from 'react'
import Header from '../components/Header'
import Chatbot from '../components/Chatbot'
import { notices } from '../utils/notices'
import './Home.css'

function Home() {
  const [searchQuery, setSearchQuery] = useState('')

  const handleSearch = (e) => {
    e.preventDefault()
    // 검색 로직 구현
    console.log('Search:', searchQuery)
  }

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
            <Link to="/bukhansan" className="mountain-tag">북한산</Link>
            <Link to="/seoraksan" className="mountain-tag">설악산</Link>
            <Link to="#" className="mountain-tag">관악산</Link>
            <Link to="#" className="mountain-tag">월악산</Link>
            <Link to="#" className="mountain-tag">계룡산</Link>
            <Link to="#" className="mountain-tag">천마산</Link>
            <Link to="#" className="mountain-tag">소백산</Link>
            <Link to="#" className="mountain-tag">봉화산</Link>
            <Link to="#" className="mountain-tag">한라산</Link>
            <Link to="#" className="mountain-tag">내장산</Link>
          </div>
        </section>

        {/* 테마별 코스 큐레이션 */}
        <section className="themed-courses">
          <h2>테마별 코스 큐레이션</h2>
          <div className="course-grid">
            <div className="course-card spring">
              <div className="course-card-image"></div>
              <div className="course-card-content">
                <h3>봄 산행지</h3>
              </div>
            </div>
            <div className="course-card summer">
              <div className="course-card-image"></div>
              <div className="course-card-content">
                <h3>여름 산행지</h3>
              </div>
            </div>
            <div className="course-card autumn">
              <div className="course-card-image"></div>
              <div className="course-card-content">
                <h3>가을 산행지</h3>
              </div>
            </div>
            <div className="course-card winter">
              <div className="course-card-image"></div>
              <div className="course-card-content">
                <h3>겨울 산행지</h3>
              </div>
            </div>
            <div className="course-card sunrise">
              <div className="course-card-image"></div>
              <div className="course-card-content">
                <h3>일출 명소 베스트 코스</h3>
              </div>
            </div>
            <div className="course-card beginner">
              <div className="course-card-image"></div>
              <div className="course-card-content">
                <h3>초보자 추천 코스</h3>
              </div>
            </div>
          </div>
        </section>

        {/* 공지사항 섹션 */}
        <section className="notice-section">
          <h2>공지사항</h2>
          <div className="notice-list">
            {notices.slice(0, 3).map((notice) => (
              <Link
                key={notice.id}
                to={`/notice/${notice.id}`}
                className="notice-item"
              >
                <span className="notice-title">{notice.title}</span>
                <span className="notice-date">{notice.date}</span>
              </Link>
            ))}
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

