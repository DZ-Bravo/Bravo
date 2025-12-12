import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import './AICourse.css'

function AICourse() {
  const navigate = useNavigate()
  const [selectedCategory, setSelectedCategory] = useState('course')
  const [userInput, setUserInput] = useState('')
  const [recommendations, setRecommendations] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [mountainCodeMap, setMountainCodeMap] = useState({})


  const formatPrice = (value) => {
    if (value === null || value === undefined) return ''
    const num = Number(value)
    if (Number.isNaN(num)) return String(value)
    return num.toLocaleString('ko-KR') + '원'
  }

  const categories = [
    { id: 'course', name: '코스 추천' },
    { id: 'equipment', name: '장비 추천' }
  ]

  // Bedrock 응답 파싱 함수
  const parseRecommendationResponse = (responseText) => {
    const courses = []
    
    // 정규식으로 코스 분리 (번호 [1], [2], [3] 또는 줄바꿈 기준)
    const coursePattern = /(.+?)\s*\[(\d+)\]/g
    const lines = responseText.split('\n').filter(line => line.trim())
    
    let match
    let currentCourse = null
    
    // 번호 패턴으로 분리 시도
    while ((match = coursePattern.exec(responseText)) !== null) {
      const courseText = match[1].trim()
      const courseNumber = match[2]
      
      // 코스 정보 파싱
      const courseInfo = parseCourseInfo(courseText)
      if (courseInfo) {
        courses.push({
          ...courseInfo,
          id: courseNumber
        })
      }
    }
    
    // 번호 패턴이 없으면 줄바꿈 기준으로 분리
    if (courses.length === 0) {
      lines.forEach((line, index) => {
        const courseInfo = parseCourseInfo(line)
        if (courseInfo) {
          courses.push({
            ...courseInfo,
            id: index + 1
          })
        }
      })
    }
    
    return courses
  }

  // 개별 코스 정보 파싱
  const parseCourseInfo = (text) => {
    // 형식: "장산 - 좌동구간 거리 1.58km, 48분, 난이도 쉬움. 약간의 구름이 낀 하늘 11°C, 구름 20%  가벼운 산책 코스로..."
    
    // 산 이름과 코스 이름 추출
    const mountainMatch = text.match(/^(.+?)\s*-\s*(.+?)\s*거리/)
    if (!mountainMatch) return null
    
    const mountainFull = mountainMatch[1].trim()
    const courseName = mountainMatch[2].trim()
    
    // 산 이름에서 괄호 제거하여 순수 산 이름 추출
    const mountainMatch2 = mountainFull.match(/^(.+?)\s*\(/)
    const mountain = mountainMatch2 ? mountainMatch2[1].trim() : mountainFull
    
    // 거리, 시간, 난이도 추출
    const distanceMatch = text.match(/거리\s*([\d.]+)km/)
    const durationMatch = text.match(/(\d+)분/)
    const difficultyMatch = text.match(/난이도\s*([가-힣]+)/)
    
    // 날씨 정보 추출 (더 유연한 패턴)
    // "약간의 구름이 낀 하늘 11°C, 구름 20%" 또는 "맑음 12°C, 구름 0%"
    const weatherMatch = text.match(/([가-힣\s]+?)\s+([\d.]+)°C[,\s]*구름\s*(\d+)%/)
    
    // 설명 추출 (날씨 정보 이후)
    let description = ''
    if (weatherMatch) {
      // 날씨 정보 이후의 모든 텍스트를 설명으로
      const weatherEndIndex = weatherMatch.index + weatherMatch[0].length
      description = text.substring(weatherEndIndex).trim()
      // 앞뒤 공백 제거
      description = description.replace(/^\s+|\s+$/g, '')
    } else {
      // 날씨 정보가 없으면 난이도 이후부터 설명으로 간주
      const difficultyEndIndex = text.indexOf('난이도')
      if (difficultyEndIndex !== -1) {
        const afterDifficulty = text.substring(difficultyEndIndex)
        const dotIndex = afterDifficulty.indexOf('.')
        if (dotIndex !== -1) {
          description = afterDifficulty.substring(dotIndex + 1).trim()
        }
      }
    }
    
    return {
      mountain,
      mountainFull,
      course: courseName,
      distance: distanceMatch ? `${distanceMatch[1]}km` : '',
      duration: durationMatch ? `${durationMatch[1]}분` : '',
      difficulty: difficultyMatch ? difficultyMatch[1] : '',
      weather: weatherMatch ? `${weatherMatch[1].trim()} ${weatherMatch[2]}°C, 구름 ${weatherMatch[3]}%` : '',
      description: description || ''
    }
  }

  // 산 이름으로 mountain_code 조회 (정확히 일치하는 이름만)
  const getMountainCode = async (mountainFullName) => {
    if (!mountainFullName) return null

    const targetFull = mountainFullName.trim()
    const targetWithoutParentheses = targetFull.split('(')[0].trim()

    // 캐시 확인
    if (mountainCodeMap[targetFull]) {
      return mountainCodeMap[targetFull]
    }

    // 1차: ai-service의 KB 기반 매핑 API 호출
    try {
      const resp = await fetch(`${API_URL}/api/ai/mountain-code?name=${encodeURIComponent(targetFull)}`)
      if (resp.ok) {
        const data = await resp.json()
        if (data.code) {
          setMountainCodeMap(prev => ({ ...prev, [targetFull]: data.code }))
          return data.code
        }
      }
    } catch (e) {
      console.warn('mountain-code lookup (ai-service) 실패:', e)
    }

    try {
      const response = await fetch(`${API_URL}/api/mountains`)
      if (!response.ok) return null
      
      const data = await response.json()
      const mountains = data.mountains || []
      
      // 산 이름으로 검색 (정확히 일치하는 것만)
      const found = mountains.find(m => {
        const name = m.name || ''
        const nameFull = name.trim()
        const nameWithoutParentheses = name.split('(')[0].trim()
        return (
          nameFull === targetFull ||
          nameWithoutParentheses === targetWithoutParentheses
        )
      })
      
      if (found) {
        const mountainCode =
          (found.mntilistno !== undefined && found.mntilistno !== null && found.mntilistno !== '') ? String(found.mntilistno) :
          (found.code !== undefined && found.code !== null && found.code !== '') ? String(found.code) :
          (found.MNTN_CD !== undefined && found.MNTN_CD !== null && found.MNTN_CD !== '') ? String(found.MNTN_CD) :
          (found._id !== undefined && found._id !== null && found._id !== '') ? String(found._id) :
          null

        if (!mountainCode) {
          console.warn(`산 이름 매칭: "${targetFull}" -> "${found.name}" but 코드 필드 없음`)
          return null
        }

        console.log(`산 이름 매칭: "${targetFull}" -> "${found.name}" (code: ${mountainCode})`)
        // 캐시에 저장
        setMountainCodeMap(prev => ({
          ...prev,
          [targetFull]: mountainCode
        }))
        return mountainCode
      }
      
      console.warn(`산 이름을 찾을 수 없음: "${targetFull}"`)
    } catch (error) {
      console.error('산 코드 조회 오류:', error)
    }
    
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!userInput.trim()) {
      setError('조건을 입력해주세요.')
      return
    }

    console.log('=== handleSubmit 실행됨 ===')
    console.log('selectedCategory:', selectedCategory)
    console.log('userInput:', userInput)

    setLoading(true)
    setError(null)
    setRecommendations([])

    try {
      if (selectedCategory === 'course') {
        console.log('=== API 호출 시작 ===')
        console.log('API_URL:', API_URL)
        console.log('API 엔드포인트:', `${API_URL}/api/ai/recommend-course`)
        console.log('요청 데이터:', { userInput })
        
        // API 호출 (코스)
        const response = await fetch(`${API_URL}/api/ai/recommend-course`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ userInput })
        })
        
        console.log('API 응답 상태:', response.status, response.ok)
        
        if (!response.ok) {
          const errorText = await response.text()
          console.error('API 에러 응답:', errorText)
          throw new Error(`추천 요청에 실패했습니다. (${response.status})`)
        }
        
        const data = await response.json()
        console.log('API 응답 데이터:', data)
        const recommendationText = data.recommendation || ''
        console.log('추천 텍스트:', recommendationText)
        
        // 응답 파싱
        const parsedCourses = parseRecommendationResponse(recommendationText)
        console.log('파싱된 코스:', parsedCourses)
        
        // 각 코스의 mountain_code 조회
        const coursesWithCode = await Promise.all(
          parsedCourses.map(async (course) => {
            const code = await getMountainCode(course.mountainFull || course.mountain)
            return {
              ...course,
              mountainCode: code
            }
          })
        )
        
        console.log('최종 코스 데이터:', coursesWithCode)
        setRecommendations(coursesWithCode)
      } else {
        // 장비 추천: Bedrock 호출 결과를 그대로 카드로 표시
        console.log('=== 장비 추천 API 호출 시작 ===')
        console.log('API_URL:', API_URL)
        console.log('API 엔드포인트:', `${API_URL}/api/ai/recommend-equipment`)
        console.log('요청 데이터:', { userInput })

        const response = await fetch(`${API_URL}/api/ai/recommend-equipment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ userInput })
        })

        console.log('장비 추천 응답 상태:', response.status, response.ok)

        if (!response.ok) {
          const errorText = await response.text()
          console.error('장비 추천 API 에러 응답:', errorText)
          throw new Error(`장비 추천 요청에 실패했습니다. (${response.status})`)
        }

        const data = await response.json()
        console.log('장비 추천 응답 데이터:', data)

        const items = Array.isArray(data.recommendations) ? data.recommendations : []
        const normalized = items.map((item, idx) => ({
          id: item.id || idx + 1,
          title: item.title || item.name || '',
          brand: item.brand || '',
          category: item.category || '',
          price: item.price ?? '',
          url: item.url || '',
          reason: item.reason || item.description || ''
        }))

        setRecommendations(normalized)
      }
    } catch (error) {
      console.error('추천 요청 오류:', error)
      console.error('에러 상세:', error.stack)
      setError(error.message || '추천을 받는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ai-course-page">
      <Header />
      <main className="ai-course-main">
        <div className="ai-course-container">
          <h1 className="ai-course-title">AI 등산 코스 추천</h1>
          
          <div className="ai-course-description">
            <p>
              {selectedCategory === 'course' && '원하는 조건을 입력하시면 AI가 최적의 등산 코스를 추천해드립니다.'}
              {selectedCategory === 'equipment' && '원하는 조건을 입력하시면 AI가 최적의 등산 장비를 추천해드립니다.'}
            </p>
          </div>

          <div className="category-tabs">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={`category-tab ${selectedCategory === category.id ? 'active' : ''}`}
                onClick={() => {
                  setSelectedCategory(category.id)
                  setUserInput('')
                  setRecommendations([])
                }}
              >
                {category.name}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="ai-course-form">
            <div className="form-group">
              <label htmlFor="userInput">
                {selectedCategory === 'equipment' ? '원하는 장비 조건을 입력해주세요' : '원하는 조건을 입력해주세요'}
              </label>
              <textarea
                id="userInput"
                name="userInput"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder={
                  selectedCategory === 'course' 
                    ? '예: 초보자도 갈 수 있는 서울 근교 산, 2-3시간 코스, 가을 단풍이 아름다운 곳'
                    : '예: 초보자용 등산화, 가벼운 백팩, 비용 10만원 이하'
                }
                className="ai-input"
                rows="5"
                required
              />
            </div>

            <button type="submit" className="ai-submit-btn" disabled={loading}>
              {loading ? '추천받는 중...' : selectedCategory === 'equipment' ? '장비 추천받기' : '코스 추천받기'}
            </button>
          </form>

          {error && (
            <div className="error-message" style={{ color: 'red', marginTop: '1rem', padding: '1rem', backgroundColor: '#ffe6e6', borderRadius: '4px' }}>
              {error}
            </div>
          )}

          {loading && (
            <div className="loading-message" style={{ marginTop: '2rem', textAlign: 'center', padding: '2rem' }}>
              <p>{selectedCategory === 'equipment' ? 'AI가 최적의 장비를 추천하고 있습니다...' : 'AI가 최적의 코스를 추천하고 있습니다...'}</p>
            </div>
          )}

          {recommendations.length > 0 && (
            <div className="recommendations-section">
              <h2>{selectedCategory === 'equipment' ? '추천 장비' : '추천 코스'}</h2>
              <div className="recommendations-list">
                {recommendations.map((item) => (
                  <div 
                    key={item.id} 
                    className="course-card"
                    onClick={() => {
                      if (selectedCategory === 'course' && item.mountainCode) {
                        navigate(`/mountain/${item.mountainCode}`)
                      }
                      if (selectedCategory === 'equipment' && item.url) {
                        console.log('장비 카드 클릭 - 연결 URL:', item.url)
                        window.open(item.url, '_blank', 'noopener,noreferrer')
                      }
                    }}
                    style={{
                      cursor:
                        selectedCategory === 'course'
                          ? (item.mountainCode ? 'pointer' : 'default')
                          : (item.url ? 'pointer' : 'default'),
                      transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => {
                      const isClickable =
                        (selectedCategory === 'course' && item.mountainCode) ||
                        (selectedCategory === 'equipment' && item.url)
                      if (isClickable) {
                        e.currentTarget.style.transform = 'translateY(-2px)'
                        e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = ''
                    }}
                  >
                    {selectedCategory === 'equipment' ? (
                      <>
                        <h3>{item.title || '상품명 없음'}</h3>
                        <div className="course-info">
                          <span className="course-difficulty">브랜드: {item.brand || '-'}</span>
                          <span className="course-duration">카테고리: {item.category || '-'}</span>
                          <span className="course-distance">가격: {formatPrice(item.price) || '-'}</span>
                        </div>
                        {item.reason && (
                          <p className="course-description">{item.reason}</p>
                        )}
                        {!item.url && (
                          <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#999' }}>
                            이동할 URL이 없습니다.
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <h3>{item.mountainFull || item.mountain} - {item.course}</h3>
                        <div className="course-info">
                          <span className="course-distance">거리: {item.distance}</span>
                          <span className="course-duration">소요시간: {item.duration}</span>
                          <span className="course-difficulty">난이도: {item.difficulty}</span>
                        </div>
                        {item.weather && (
                          <div className="course-weather" style={{ marginTop: '0.5rem', color: '#666', fontSize: '0.9rem' }}>
                            날씨: {item.weather}
                          </div>
                        )}
                        {item.description && (
                          <p className="course-description" style={{ marginTop: '0.75rem' }}>{item.description}</p>
                        )}
                        {!item.mountainCode && (
                          <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#999' }}>
                            산 정보를 불러오는 중...
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default AICourse

