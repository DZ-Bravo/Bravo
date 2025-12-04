import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import './Home.css'

function Home() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [notices, setNotices] = useState([])
  const [isLoadingNotices, setIsLoadingNotices] = useState(true)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  const mainImages = ['/images/main1.jpg', '/images/main2.jpg', '/images/main3.jpg']

  // 메인 이미지 슬라이드 (30초마다)
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % mainImages.length)
    }, 30000) // 30초 = 30000ms

    return () => clearInterval(interval)
  }, [])

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

  // 인기 있는 산 데이터
  const popularMountains = [
    { id: '287201304', name: '북한산', image: '/images/popularity_img1.png' },
    { id: '428302602', name: '설악산', image: '/images/popularity_img2.png' },
    { id: '488605302', name: '지리산', image: '/images/popularity_img3.png' },
    { id: '421902904', name: '태백산', image: '/images/popularity_img4.png' },
    { id: '483100401', name: '계룡산', image: '/images/popularity_img5.png' },
    { id: '457300301', name: '덕유산', image: '/images/popularity_img6.png' },
    { id: '438001301', name: '소백산', image: '/images/popularity_img7.png' }
  ]

  return (
    <div className="home">
      <Header />
      <main>
        {/* 메인 검색 섹션 */}
        <section className="search-section">
          <div className="search-background">
            {mainImages.map((image, index) => (
              <div
                key={index}
                className={`background-slide ${index === currentImageIndex ? 'active' : ''}`}
                style={{ backgroundImage: `url(${image})` }}
              />
            ))}
            <div className="search-overlay">
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
                  <img src="/images/search_icon.png" alt="검색" />
                </button>
              </form>
            </div>
          </div>
        </section>

        {/* 인기 있는 산 섹션 */}
        <section className="popular-mountains">
          <h2>인기 있는 산</h2>
          <p className="section-subtitle">산둥이들에게 인기 있는 산을 살펴보세요!</p>
          <div className="mountain-list">
            {popularMountains.map((mountain) => (
              <Link
                key={mountain.id}
                to={`/mountain/${mountain.id}`}
                className="mountain-item"
              >
                <div className="mountain-image">
                  <img src={mountain.image} alt={mountain.name} />
                </div>
                <span className="mountain-name">{mountain.name}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* AI 등산 코스 추천 섹션 */}
        <section className="ai-course-section">
          <h2>AI 등산 코스 추천</h2>
          <p className="section-subtitle">나에게 딱 맞는 맞춤 코스를 확인하세요!</p>
          <div className="ai-course-banner">
            <div className="ai-banner-background">
              <img src="/images/main_banner1.png" alt="AI 등산 코스 추천" />
            </div>
            <div className="ai-banner-content">
              <Link to="/ai-course" className="ai-banner-btn">
                <img src="/images/main_banner1_btn.png" alt="바로가기" />
              </Link>
            </div>
          </div>
        </section>

        {/* 테마별 코스 큐레이션 */}
        <section className="themed-courses">
          <h2>테마별 코스 큐레이션</h2>
          <p className="section-subtitle">HIKER가 PICK한 추천 코스를 확인하세요!</p>
          <div className="course-grid">
            <Link to="/course/winter" className="course-item">
              <img src="/images/theme_curation_img1.png" alt="설산의 절경" />
              <div className="course-overlay">
                <h3>설산의 절경</h3>
                <p>
                  눈꽃 산행지<br />
                  BEST 10
                </p>
              </div>
            </Link>
            <Link to="/course/beginner" className="course-item">
              <img src="/images/theme_curation_img2.png" alt="초보 산쟁이 코스" />
              <div className="course-overlay">
                <h3>심박수 140BPM 이하</h3>
                <p>
                  초보 산쟁이 코스<br />
                  BEST 5
                </p>
              </div>
            </Link>
            <Link to="/course/sunrise" className="course-item">
              <img src="/images/theme_curation_img3.png" alt="일몰&야경 코스" />
              <div className="course-overlay">
                <h3>특별하게 즐기고 싶어!</h3>
                <p>
                  일몰&야경 코스<br />
                  BEST8
                </p>
              </div>
            </Link>
          </div>
        </section>

        {/* 공지사항 섹션 */}
        <section className="notice-section">
          <h2>공지사항</h2>
          <p className="section-subtitle">안전한 등산을 위해 확인하세요!</p>
          <div className="notice-list">
            {isLoadingNotices ? (
              <div className="notice-loading">공지사항을 불러오는 중...</div>
            ) : notices.length === 0 ? (
              <div className="notice-empty">공지사항이 없습니다.</div>
            ) : (
              notices.map((notice) => (
                <Link
                  key={notice.id}
                  to={`/notice/${notice.id}`}
                  className="notice-item"
                >
                  <div className="notice-content">
                    <span className="notice-title">
                      {notice.icon || '📢'} {notice.title}
                    </span>
                    <span className="notice-date">{notice.date}</span>
                  </div>
                  <span className="notice-arrow">→</span>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* 산 전체보기 버튼 */}
        <Link to="/mountains-map" className="view-all-mountains-btn">
          <img src="/images/mountFullView_btn.png" alt="산 전체보기" />
        </Link>
      </main>
    </div>
  )
}

export default Home
