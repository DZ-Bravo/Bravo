import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import Header from '../components/Header'
import { MOUNTAIN_ROUTES } from '../utils/mountainRoutes'
import { API_URL } from '../utils/api'
import './SearchResults.css'

function SearchResults() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  const [searchInput, setSearchInput] = useState(query)
  const [activeTab, setActiveTab] = useState('all') // 'all', 'mountains', 'posts', 'products'
  const [recentSearches, setRecentSearches] = useState([])
  
  // 검색 결과
  const [mountainResults, setMountainResults] = useState([])
  const [postResults, setPostResults] = useState([])
  const [productResults, setProductResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)

  // 인기 검색어
  const popularSearches = [
    '소백산', '도봉산', '관악산', '지리산', '설악산', 
    '한라산', '북한산', '천마산', '태백산', '덕유산'
  ]

  // 테마별 등산일지
  const themes = [
    { icon: '☀️', name: '일출산행', link: '/course/sunrise' },
    { icon: '☁️', name: '운해사냥', link: '/course/cloud' },
    { icon: '🏆', name: '오등추천', link: '/course/recommended' },
    { icon: '🌱', name: '초보산쟁이', link: '/course/beginner' }
  ]

  // 스토어 상품 데이터
  const products = [
    { id: 1, name: '등산화 A', price: '129,000원', category: 'shoes' },
    { id: 2, name: '등산화 B', price: '159,000원', category: 'shoes' },
    { id: 3, name: '등산용 상의', price: '89,000원', category: 'top' },
    { id: 4, name: '등산용 티셔츠', price: '45,000원', category: 'top' },
    { id: 5, name: '등산용 바지', price: '79,000원', category: 'bottom' },
    { id: 6, name: '등산용 반바지', price: '55,000원', category: 'bottom' },
    { id: 7, name: '등산용 백팩', price: '89,000원', category: 'accessories' },
    { id: 8, name: '등산 스틱', price: '45,000원', category: 'accessories' },
    { id: 9, name: '등산용 물병', price: '18,000원', category: 'accessories' }
  ]

  useEffect(() => {
    // 최근 검색어 불러오기
    const saved = localStorage.getItem('recentSearches')
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved))
      } catch (e) {
        setRecentSearches([])
      }
    }

    // 검색어가 있으면 검색 실행
    if (query) {
      performSearch(query)
    }
  }, [query])

  const performSearch = async (searchTerm) => {
    if (!searchTerm.trim()) {
      setMountainResults([])
      setPostResults([])
      setProductResults([])
      return
    }

    setIsLoading(true)

    try {
      // 산 검색
      const mountains = Object.values(MOUNTAIN_ROUTES).filter(mountain => 
        mountain.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        searchTerm.toLowerCase().includes(mountain.name.toLowerCase())
      )
      setMountainResults(mountains)

      // 커뮤니티 게시글 검색
      try {
        const searchUrl = `${API_URL}/api/posts/search?q=${encodeURIComponent(searchTerm)}`
        console.log('게시글 검색 URL:', searchUrl)
        const postsResponse = await fetch(searchUrl)
        if (postsResponse.ok) {
          const postsData = await postsResponse.json()
          console.log('게시글 검색 결과:', postsData)
          setPostResults(postsData.posts || [])
        } else {
          const errorData = await postsResponse.json()
          console.error('게시글 검색 응답 오류:', errorData)
          setPostResults([])
        }
      } catch (error) {
        console.error('게시글 검색 오류:', error)
        setPostResults([])
      }

      // 스토어 상품 검색
      const filteredProducts = products.filter(product =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
      setProductResults(filteredProducts)

      // 최근 검색어에 추가
      if (searchTerm.trim() && !recentSearches.includes(searchTerm.trim())) {
        const updated = [searchTerm.trim(), ...recentSearches].slice(0, 10)
        setRecentSearches(updated)
        localStorage.setItem('recentSearches', JSON.stringify(updated))
      }
    } catch (error) {
      console.error('검색 오류:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    if (searchInput.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchInput.trim())}`)
    }
  }

  const handleRecentSearchClick = (term) => {
    setSearchInput(term)
    navigate(`/search?q=${encodeURIComponent(term)}`)
  }

  const handlePopularSearchClick = (term) => {
    setSearchInput(term)
    navigate(`/search?q=${encodeURIComponent(term)}`)
  }

  const removeRecentSearch = (term, e) => {
    e.stopPropagation()
    const updated = recentSearches.filter(s => s !== term)
    setRecentSearches(updated)
    localStorage.setItem('recentSearches', JSON.stringify(updated))
  }

  const clearRecentSearches = () => {
    setRecentSearches([])
    localStorage.removeItem('recentSearches')
  }

  const totalResults = mountainResults.length + postResults.length + productResults.length

  return (
    <div className="search-results-page">
      <Header />
      <main className="search-results-main">
        <div className="search-results-container">
          {/* 검색 바 */}
          <div className="search-bar-section">
            <button className="back-button" onClick={() => navigate(-1)}>
              ←
            </button>
            <form onSubmit={handleSearch} className="search-form">
              <input
                type="text"
                placeholder="검색어를 입력해주세요."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="search-input"
              />
              <button type="submit" className="search-icon-btn">
                🔍
              </button>
            </form>
          </div>

          {/* 검색 결과가 없을 때 */}
          {!query && (
            <>
              {/* 최근 검색어 */}
              {recentSearches.length > 0 && (
                <div className="search-section">
                  <div className="section-header">
                    <h2 className="section-title">최근 검색어</h2>
                    <button className="clear-button" onClick={clearRecentSearches}>
                      전체 삭제
                    </button>
                  </div>
                  <div className="search-tags">
                    {recentSearches.map((term, index) => (
                      <div
                        key={index}
                        className="search-tag recent-tag"
                        onClick={() => handleRecentSearchClick(term)}
                      >
                        {term}
                        <button
                          className="tag-remove"
                          onClick={(e) => removeRecentSearch(term, e)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 인기 검색어 */}
              <div className="search-section">
                <h2 className="section-title">인기 검색어</h2>
                <div className="search-tags">
                  {popularSearches.map((term, index) => (
                    <div
                      key={index}
                      className="search-tag popular-tag"
                      onClick={() => handlePopularSearchClick(term)}
                    >
                      {term}
                    </div>
                  ))}
                </div>
              </div>

              {/* 다양한 테마의 등산일지 */}
              <div className="search-section">
                <h2 className="section-title">다양한 테마의 등산일지</h2>
                <div className="theme-grid">
                  {themes.map((theme, index) => (
                    <Link key={index} to={theme.link} className="theme-card">
                      <div className="theme-icon">{theme.icon}</div>
                      <div className="theme-name">{theme.name}</div>
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* 검색 결과 */}
          {query && (
            <div className="search-results-section">
              <h2 className="results-title">
                '{query}' 검색 결과 ({totalResults}개)
              </h2>

              {/* 탭 */}
              <div className="results-tabs">
                <button
                  className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                  onClick={() => setActiveTab('all')}
                >
                  전체 ({totalResults})
                </button>
                <button
                  className={`tab-btn ${activeTab === 'mountains' ? 'active' : ''}`}
                  onClick={() => setActiveTab('mountains')}
                >
                  산 ({mountainResults.length})
                </button>
                <button
                  className={`tab-btn ${activeTab === 'posts' ? 'active' : ''}`}
                  onClick={() => setActiveTab('posts')}
                >
                  커뮤니티 ({postResults.length})
                </button>
                <button
                  className={`tab-btn ${activeTab === 'products' ? 'active' : ''}`}
                  onClick={() => setActiveTab('products')}
                >
                  스토어 ({productResults.length})
                </button>
              </div>

              {isLoading ? (
                <div className="loading">검색 중...</div>
              ) : (
                <>
                  {/* 전체 또는 산 탭 */}
                  {(activeTab === 'all' || activeTab === 'mountains') && mountainResults.length > 0 && (
                    <div className="results-category">
                      <h3 className="category-title">산</h3>
                      <div className="results-list">
                        {mountainResults.map((mountain) => (
                          <Link
                            key={mountain.code}
                            to={`/mountain/${mountain.code}`}
                            className="result-item"
                          >
                            <div className="result-icon">⛰️</div>
                            <div className="result-content">
                              <div className="result-name">{mountain.name}</div>
                              <div className="result-location">등산 코스 정보</div>
                            </div>
                            <div className="result-arrow">→</div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 전체 또는 커뮤니티 탭 */}
                  {(activeTab === 'all' || activeTab === 'posts') && postResults.length > 0 && (
                    <div className="results-category">
                      <h3 className="category-title">커뮤니티</h3>
                      <div className="results-list">
                        {postResults.map((post) => {
                          const categoryLabels = {
                            'diary': '등산일지',
                            'qa': 'Q&A',
                            'free': '자유게시판'
                          }
                          const categoryLabel = categoryLabels[post.category] || post.category
                          
                          return (
                            <Link
                              key={post.id}
                              to={`/community/${post.id}`}
                              className="result-item"
                            >
                              <div className="result-icon">📝</div>
                              <div className="result-content">
                                <div className="result-name-row">
                                  <div className="result-name">{post.title}</div>
                                  <span className="result-category-badge">{categoryLabel}</span>
                                </div>
                                <div className="result-location">
                                  {post.previewContent || '게시글 내용'}
                                </div>
                              </div>
                              <div className="result-arrow">→</div>
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* 전체 또는 스토어 탭 */}
                  {(activeTab === 'all' || activeTab === 'products') && productResults.length > 0 && (
                    <div className="results-category">
                      <h3 className="category-title">스토어</h3>
                      <div className="results-list">
                        {productResults.map((product) => (
                          <Link
                            key={product.id}
                            to="/store"
                            className="result-item"
                          >
                            <div className="result-icon">🛍️</div>
                            <div className="result-content">
                              <div className="result-name">{product.name}</div>
                              <div className="result-location">{product.price}</div>
                            </div>
                            <div className="result-arrow">→</div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 검색 결과 없음 */}
                  {totalResults === 0 && (
                    <div className="no-results">
                      <p>검색 결과가 없습니다.</p>
                      <p className="no-results-sub">다른 검색어를 입력해보세요.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default SearchResults
