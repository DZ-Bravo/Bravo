import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import './Home.css'

function Home() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [notices, setNotices] = useState([])
  const [isLoadingNotices, setIsLoadingNotices] = useState(true)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const aiBannerRef = useRef(null)

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

  // AI 배너 마우스 이동 효과
  const handleAiBannerMouseMove = (e) => {
    if (!aiBannerRef.current) return
    
    const rect = aiBannerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    
    const moveX = (x - centerX) / centerX * 40 // 최대 40px 이동 (범위 확대)
    const moveY = (y - centerY) / centerY * 40 // 최대 40px 이동 (범위 확대)
    
    const textLines = aiBannerRef.current.querySelectorAll('.ai-text-line')
    textLines.forEach((line, index) => {
      const delay = index * 0.15
      const offsetX = moveX * (1 + delay)
      const offsetY = moveY * (1 + delay)
      line.style.transform = `translate(${offsetX}px, ${offsetY}px)`
    })
  }

  // AI 배너 마우스 벗어났을 때 원래 위치로
  const handleAiBannerMouseLeave = () => {
    if (!aiBannerRef.current) return
    
    const textLines = aiBannerRef.current.querySelectorAll('.ai-text-line')
    textLines.forEach((line) => {
      line.style.transform = 'translate(0, 0)'
    })
  }

  const [popularMountains, setPopularMountains] = useState([])
  const [currentMountainIndex, setCurrentMountainIndex] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(true)
  const cardWidthRef = useRef(396) // 기본 카드 너비 + gap (380px + 16px)
  const trackRef = useRef(null)

  // 이미지 URL 상태 관리
  const [imageUrls, setImageUrls] = useState({})

  // imgbb.co URL을 실제 이미지 URL로 변환
  useEffect(() => {
    const convertImageUrls = async () => {
      const urlMap = {}
      
      await Promise.all(
        popularMountains.map(async (mountain) => {
          if (!mountain.image) {
            urlMap[mountain.id] = '/images/popularity_img1.png'
            return
          }
          
          let imageUrl = mountain.image
          
          // imgbb.co 페이지 URL인 경우 백엔드 API로 실제 이미지 URL 추출
          if (imageUrl.includes('ibb.co/') && !imageUrl.includes('i.ibb.co')) {
            try {
              const response = await fetch(`${API_URL}/api/utils/imgbb-url?url=${encodeURIComponent(imageUrl)}`)
              const data = await response.json()
              if (data.imageUrl) {
                urlMap[mountain.id] = data.imageUrl
              } else {
                urlMap[mountain.id] = imageUrl
              }
            } catch (error) {
              console.error('imgbb.co 이미지 URL 추출 실패:', error)
              urlMap[mountain.id] = imageUrl
            }
          } else {
            // 이미 http:// 또는 https://로 시작하면 그대로 사용
            if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
              urlMap[mountain.id] = imageUrl
            } else if (imageUrl.startsWith('/')) {
              // 상대 경로인 경우 API_URL 추가
              urlMap[mountain.id] = `${API_URL}${imageUrl}`
            } else {
              urlMap[mountain.id] = imageUrl
            }
          }
        })
      )
      
      setImageUrls(urlMap)
    }
    
    if (popularMountains.length > 0) {
      convertImageUrls()
    }
  }, [popularMountains, API_URL])

  // 테마별 코스 데이터
  const [themedCourses, setThemedCourses] = useState({
    winter: { count: 0, courses: [] },
    beginner: { count: 0, courses: [] },
    sunrise: { count: 0, courses: [] }
  })

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

  // 인기 있는 산 가져오기
  useEffect(() => {
    const fetchPopularMountains = async () => {
      try {
        const response = await fetch(`${API_URL}/api/mountains/popular`)
        if (response.ok) {
          const data = await response.json()
          if (data.mountains && data.mountains.length > 0) {
            // 각 산의 상세 정보 가져오기 (높이, 위치)
            const mountainsWithDetails = await Promise.all(
              data.mountains.map(async (mountain) => {
                try {
                  const detailResponse = await fetch(`${API_URL}/api/mountains/${mountain.id}`)
                  if (detailResponse.ok) {
                    const detailData = await detailResponse.json()
                    return {
                      ...mountain,
                      height: detailData.height || null,
                      location: detailData.location || null
                    }
                  }
                } catch (error) {
                  console.error(`산 ${mountain.id} 상세 정보 조회 실패:`, error)
                }
                return {
                  ...mountain,
                  height: null,
                  location: null
                }
              })
            )
            setPopularMountains(mountainsWithDetails)
          }
        }
      } catch (error) {
        console.error('인기 있는 산 조회 오류:', error)
      }
    }

    fetchPopularMountains()
  }, [API_URL])

  // 카드 너비 계산 (반응형)
  useEffect(() => {
    const updateCardWidth = () => {
      if (window.innerWidth <= 768) {
        cardWidthRef.current = 288 // 280px + 8px gap
      } else {
        cardWidthRef.current = 328 // 320px + 8px gap
      }
    }
    
    updateCardWidth()
    window.addEventListener('resize', updateCardWidth)
    return () => window.removeEventListener('resize', updateCardWidth)
  }, [])

  // 무한 루프를 위한 카드 배열 복제
  const duplicatedMountains = popularMountains.length > 0 
    ? [...popularMountains, ...popularMountains, ...popularMountains]
    : []
  
  const baseIndex = popularMountains.length
  // 중간 그룹의 중앙에서 시작하도록 조정 (가운데 3개가 보이도록)
  const centerOffset = Math.floor((popularMountains.length - 1) / 2)
  
  // 무한 루프를 위해 currentMountainIndex를 제한 없이 사용
  // displayIndex와 transformIndex 모두 중간 그룹 내에서 순환하도록 조정
  const getNormalizedIndex = (index) => {
    if (popularMountains.length === 0) return 0
    // index를 popularMountains.length로 나눈 나머지를 사용하여 순환
    return ((index % popularMountains.length) + popularMountains.length) % popularMountains.length
  }
  
  const normalizedIndex = getNormalizedIndex(currentMountainIndex)
  const displayIndex = baseIndex + normalizedIndex
  const transformIndex = baseIndex + normalizedIndex

  // 캐러셀 이동 함수 (무한 루프 - 자연스러운 순환)
  const handlePrev = () => {
    if (popularMountains.length === 0) return
    
    setIsTransitioning(true)
    setCurrentMountainIndex((prev) => prev - 1)
  }

  const handleNext = () => {
    if (popularMountains.length === 0) return
    
    setIsTransitioning(true)
    setCurrentMountainIndex((prev) => prev + 1)
  }

  // 테마별 코스 가져오기
  useEffect(() => {
    const fetchThemedCourses = async () => {
      try {
        const themes = ['winter', 'beginner', 'sunrise']
        const coursesData = {}
        
        await Promise.all(
          themes.map(async (theme) => {
            try {
              const response = await fetch(`${API_URL}/api/courses/theme/${theme}?limit=10`)
              if (response.ok) {
                const data = await response.json()
                coursesData[theme] = {
                  count: data.count || 0,
                  courses: data.courses || []
                }
              } else {
                coursesData[theme] = { count: 0, courses: [] }
              }
            } catch (error) {
              console.error(`${theme} 테마 코스 조회 실패:`, error)
              coursesData[theme] = { count: 0, courses: [] }
            }
          })
        )
        
        setThemedCourses(coursesData)
      } catch (error) {
        console.error('테마별 코스 조회 오류:', error)
      }
    }
    
    fetchThemedCourses()
  }, [API_URL])

  return (
    <div className="home">
      <Header />
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

      <div className="home-container">
        <main>
        {/* 인기 있는 산 섹션 */}
        <section className="popular-mountains">
          <h2>인기 있는 산</h2>
          <p className="section-subtitle">산둥이들에게 인기 있는 산을 살펴보세요!</p>
          <div className="mountain-carousel-container">
            <button 
              className="carousel-btn carousel-btn-left"
              onClick={handlePrev}
              aria-label="이전"
            >
              &lt;
            </button>
            <div className="mountain-carousel">
              <div 
                ref={trackRef}
                className="mountain-carousel-track"
                style={{ 
                  transform: `translateX(calc(50% - ${transformIndex * cardWidthRef.current}px - 160px))`,
                  transition: isTransitioning ? 'transform 0.5s ease-in-out' : 'none'
                }}
              >
                {duplicatedMountains.map((mountain, index) => {
                  const imageUrl = imageUrls[mountain.id] || mountain.image || '/images/popularity_img1.png'
                  const relativeIndex = index - displayIndex
                  const distance = Math.abs(relativeIndex)
                  
                  // 모든 카드를 선명하게 표시, 블러 처리 없음
                  const isHidden = distance > 2
                  
                  return (
                    <Link
                      key={`${mountain.id}-${index}`}
                      to={`/mountain/${mountain.id}`}
                      className={`mountain-card ${isHidden ? 'hidden' : ''}`}
                    >
                      <div className="mountain-card-image">
                        <img 
                          src={imageUrl} 
                          alt={mountain.name}
                          onError={(e) => {
                            console.error('이미지 로드 실패:', imageUrl, '산:', mountain.name)
                            e.target.src = '/images/popularity_img1.png'
                          }}
                        />
                        <div className="mountain-card-overlay">
                          <h3 className="mountain-card-name">{mountain.name}</h3>
                          <div className="mountain-card-info">
                            {mountain.height && (
                              <div className="mountain-info-item">
                                <span className="mountain-info-label">높이:</span>
                                <span className="mountain-info-value">{mountain.height}m</span>
                              </div>
                            )}
                            {mountain.location && (
                              <div className="mountain-info-item">
                                <span className="mountain-info-label">위치:</span>
                                <span className="mountain-info-value">{mountain.location}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
            <button 
              className="carousel-btn carousel-btn-right"
              onClick={handleNext}
              aria-label="다음"
            >
              &gt;
            </button>
          </div>
        </section>

        {/* AI 등산 코스 추천 섹션 */}
        <section className="ai-course-section">
          <h2>AI 등산 코스 추천</h2>
          <p className="section-subtitle">나에게 딱 맞는 맞춤 코스를 확인하세요!</p>
          <div className="ai-course-banner" ref={aiBannerRef} onMouseMove={handleAiBannerMouseMove} onMouseLeave={handleAiBannerMouseLeave}>
            <div className="ai-banner-content">
              <div className="ai-banner-text">
                <div className="ai-text-line">HIKER 만의</div>
                <div className="ai-text-line">AI 등산 코스로</div>
                <div className="ai-text-line">즐겨보세요!</div>
              </div>
              <Link to="/ai-course" className="ai-banner-btn">
                바로가기 &gt;
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
                  BEST {themedCourses.winter.count || 10}
                </p>
              </div>
            </Link>
            <Link to="/course/beginner" className="course-item">
              <img src="/images/theme_curation_img2.png" alt="초보 산쟁이 코스" />
              <div className="course-overlay">
                <h3>심박수 140BPM 이하</h3>
                <p>
                  초보 산쟁이 코스<br />
                  BEST {themedCourses.beginner.count || 5}
                </p>
              </div>
            </Link>
            <Link to="/course/sunrise" className="course-item">
              <img src="/images/theme_curation_img3.png" alt="일몰&야경 코스" />
              <div className="course-overlay">
                <h3>특별하게 즐기고 싶어!</h3>
                <p>
                  일몰&야경 코스<br />
                  BEST {themedCourses.sunrise.count || 8}
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
    </div>
  )
}

export default Home
