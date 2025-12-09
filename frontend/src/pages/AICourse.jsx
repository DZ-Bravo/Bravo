import { useState } from 'react'
import Header from '../components/Header'
import './AICourse.css'

function AICourse() {
  const [selectedCategory, setSelectedCategory] = useState('course')
  const [userInput, setUserInput] = useState('')
  const [recommendations, setRecommendations] = useState([])

  const categories = [
    { id: 'course', name: '코스 추천' },
    { id: 'auto', name: '코스 자동 추천' },
    { id: 'equipment', name: '장비 추천' }
  ]

  const handleSubmit = (e) => {
    e.preventDefault()
    // TODO: AI 추천 API 호출
    console.log(`${categories.find(c => c.id === selectedCategory)?.name} 요청:`, userInput)
    // 임시 데이터
    if (selectedCategory === 'course' || selectedCategory === 'auto') {
      setRecommendations([
        {
          id: 1,
          mountain: '북한산',
          difficulty: '중급',
          duration: '3-4시간',
          description: '초보자도 도전 가능한 코스입니다.'
        }
      ])
    } else {
      setRecommendations([
        {
          id: 1,
          name: '등산화',
          category: '신발',
          description: '초보자에게 추천하는 등산화입니다.'
        }
      ])
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
              {selectedCategory === 'auto' && 'AI가 자동으로 당신에게 맞는 등산 코스를 추천해드립니다.'}
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
                    : selectedCategory === 'auto'
                    ? '예: 등산 경력 1년, 서울 거주, 주말 가능'
                    : '예: 초보자용 등산화, 가벼운 백팩, 비용 10만원 이하'
                }
                className="ai-input"
                rows="5"
                required
              />
            </div>

            <button type="submit" className="ai-submit-btn">
              {selectedCategory === 'equipment' ? '장비 추천받기' : '코스 추천받기'}
            </button>
          </form>

          {recommendations.length > 0 && (
            <div className="recommendations-section">
              <h2>{selectedCategory === 'equipment' ? '추천 장비' : '추천 코스'}</h2>
              <div className="recommendations-list">
                {recommendations.map((item) => (
                  <div key={item.id} className="course-card">
                    {selectedCategory === 'equipment' ? (
                      <>
                        <h3>{item.name}</h3>
                        <div className="course-info">
                          <span className="course-difficulty">카테고리: {item.category}</span>
                        </div>
                        <p className="course-description">{item.description}</p>
                      </>
                    ) : (
                      <>
                        <h3>{item.mountain}</h3>
                        <div className="course-info">
                          <span className="course-difficulty">난이도: {item.difficulty}</span>
                          <span className="course-duration">소요시간: {item.duration}</span>
                        </div>
                        <p className="course-description">{item.description}</p>
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

