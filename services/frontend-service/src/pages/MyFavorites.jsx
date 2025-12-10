import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import './MyPosts.css'

function MyFavorites() {
  const navigate = useNavigate()
  const [allPosts, setAllPosts] = useState([])
  const [favoriteMountains, setFavoriteMountains] = useState([])
  const [favoriteStores, setFavoriteStores] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null) // null = 전체
  const [sortBy, setSortBy] = useState('date') // 정렬 기준: 'date', 'views', 'likes', 'comments'
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const hasChecked = useRef(false)

  const categories = [
    { id: null, name: '전체' },
    { id: 'mountain', name: '산' },
    { id: 'product', name: '제품' },
    { id: 'community', name: '커뮤니티' },
    { id: 'diary', name: '등산일지' },
    { id: 'qa', name: 'Q&A' },
    { id: 'free', name: '자유게시판' }
  ]

  // 선택된 카테고리에 따라 게시글 필터링 및 정렬
  const filteredPosts = selectedCategory === null 
    ? allPosts 
    : selectedCategory === 'community'
    ? allPosts.filter(post => ['diary', 'qa', 'free'].includes(post.category))
    : selectedCategory === 'mountain'
    ? [] // 산은 별도로 표시
    : selectedCategory === 'product'
    ? [] // 제품은 별도로 표시
    : allPosts.filter(post => post.category === selectedCategory)

  // 정렬 적용
  const posts = [...filteredPosts].sort((a, b) => {
    switch (sortBy) {
      case 'views':
        return (b.views || 0) - (a.views || 0) // 조회수 내림차순
      case 'likes':
        return (b.likes || 0) - (a.likes || 0) // 좋아요 내림차순
      case 'comments':
        return (b.comments || 0) - (a.comments || 0) // 댓글 내림차순
      case 'date':
      default:
        // 날짜 기준 정렬 (최신순)
        const dateA = new Date(a.date?.replace(/\./g, '-') || 0)
        const dateB = new Date(b.date?.replace(/\./g, '-') || 0)
        return dateB - dateA
    }
  })

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      if (!hasChecked.current) {
        hasChecked.current = true
        alert('로그인이 필요합니다.')
        navigate('/login', { replace: true })
      }
      return
    }

    const fetchFavorites = async () => {
      setIsLoading(true)
      setError('')
      try {
        // 게시글 즐겨찾기 목록
        const postsResponse = await fetch(`${API_URL}/api/posts/favorites/my`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        if (postsResponse.status === 401) {
          alert('로그인이 필요합니다.')
          navigate('/login', { replace: true })
          return
        }

        if (postsResponse.ok) {
          const postsData = await postsResponse.json()
          setAllPosts(postsData.posts || [])
        }

        // 산 즐겨찾기 목록
        const mountainsResponse = await fetch(`${API_URL}/api/auth/mountains/favorites/my`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        if (mountainsResponse.ok) {
          const mountainsData = await mountainsResponse.json()
          console.log('즐겨찾기한 산 목록:', mountainsData.mountains)
          setFavoriteMountains(mountainsData.mountains || [])
        } else {
          console.error('산 즐겨찾기 목록 조회 실패:', mountainsResponse.status, mountainsResponse.statusText)
          const errorText = await mountainsResponse.text()
          console.error('에러 응답:', errorText)
        }

        // 스토어 즐겨찾기 목록
        const storesResponse = await fetch(`${API_URL}/api/store/favorites/my`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        if (storesResponse.ok) {
          const storesData = await storesResponse.json()
          console.log('즐겨찾기한 스토어 목록:', storesData.products)
          setFavoriteStores(storesData.products || [])
        } else {
          console.error('스토어 즐겨찾기 목록 조회 실패:', storesResponse.status, storesResponse.statusText)
        }
      } catch (err) {
        console.error('즐겨찾기 목록 조회 오류:', err)
        setError('즐겨찾기 목록을 불러오는데 실패했습니다.')
        setAllPosts([])
        setFavoriteMountains([])
        setFavoriteStores([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchFavorites()
  }, [navigate])

  // 즐겨찾기 목록 새로고침 함수
  const refreshFavorites = async () => {
    const token = localStorage.getItem('token')
    if (!token) return

    try {
      // 게시글 즐겨찾기 목록
      const postsResponse = await fetch(`${API_URL}/api/posts/favorites/my`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (postsResponse.ok) {
        const postsData = await postsResponse.json()
        setAllPosts(postsData.posts || [])
      }

      // 산 즐겨찾기 목록
      const mountainsResponse = await fetch(`${API_URL}/api/auth/mountains/favorites/my`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (mountainsResponse.ok) {
        const mountainsData = await mountainsResponse.json()
        console.log('즐겨찾기한 산 목록 (새로고침):', mountainsData.mountains)
        setFavoriteMountains(mountainsData.mountains || [])
      } else {
        console.error('산 즐겨찾기 목록 조회 실패:', mountainsResponse.status)
        const errorText = await mountainsResponse.text()
        console.error('에러 응답:', errorText)
      }

      // 스토어 즐겨찾기 목록
      const storesResponse = await fetch(`${API_URL}/api/store/favorites/my`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (storesResponse.ok) {
        const storesData = await storesResponse.json()
        setFavoriteStores(storesData.products || [])
      }
    } catch (err) {
      console.error('즐겨찾기 목록 새로고침 오류:', err)
    }
  }

  // 페이지 포커스 시 새로고침
  useEffect(() => {
    const handleFocus = () => {
      if (localStorage.getItem('token')) {
        refreshFavorites()
      }
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  // 즐겨찾기 업데이트 이벤트 리스너
  useEffect(() => {
    const handleFavoritesUpdate = () => {
      console.log('즐겨찾기 업데이트 이벤트 수신 - MyFavorites')
      refreshFavorites()
    }

    window.addEventListener('favoritesUpdated', handleFavoritesUpdate)
    
    // localStorage 플래그 확인
    const checkInterval = setInterval(() => {
      const favoritesUpdated = localStorage.getItem('favoritesUpdated')
      if (favoritesUpdated) {
        console.log('localStorage 플래그 발견 - 찜목록 새로고침')
        refreshFavorites()
        localStorage.removeItem('favoritesUpdated')
      }
    }, 500)

    return () => {
      window.removeEventListener('favoritesUpdated', handleFavoritesUpdate)
      clearInterval(checkInterval)
    }
  }, [])

  return (
    <div className="my-posts-page">
      <Header />
      <main className="my-posts-main">
        <div className="my-posts-container">
          <div className="my-posts-header">
            <Link to="/mypage" className="back-link">
              ←
            </Link>
            <h1 className="my-posts-title">찜 목록</h1>
          </div>

          {/* 카테고리 탭 */}
          <div className="category-tabs">
            {categories.map((category) => (
              <button
                key={category.id || 'all'}
                className={`category-tab ${selectedCategory === category.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>

          {/* 정렬 옵션 (게시글이 있을 때만 표시) */}
          {(selectedCategory === null || selectedCategory === 'community' || selectedCategory === 'diary' || selectedCategory === 'qa' || selectedCategory === 'free') && posts.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px', gap: '10px', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', color: '#666' }}>정렬:</span>
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  backgroundColor: '#fff'
                }}
              >
                <option value="date">최신순</option>
                <option value="views">조회수순</option>
                <option value="likes">좋아요순</option>
                <option value="comments">댓글순</option>
              </select>
            </div>
          )}

          {isLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              즐겨찾기 목록을 불러오는 중...
            </div>
          ) : error ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {error}
            </div>
          ) : selectedCategory === 'mountain' ? (
            favoriteMountains.length === 0 ? (
              <div className="no-posts">
                <p>즐겨찾기한 산이 없습니다.</p>
                <Link to="/mountains-map" className="write-link">
                  산 지도 둘러보기
                </Link>
              </div>
            ) : (
              <div className="post-list">
                {favoriteMountains.map((mountain) => (
                  <Link
                    key={mountain.code}
                    to={`/mountain/${mountain.code}`}
                    className="post-card diary-card"
                  >
                    <div className="post-card-content">
                      <div className="post-card-header">
                        <span className="post-category-badge diary-badge-card">
                          ⛰️ 산
                        </span>
                        <h3 className="post-card-title">{mountain.name}</h3>
                      </div>
                      <div className="post-card-footer">
                        {mountain.height && <span className="post-time">높이: {mountain.height}</span>}
                        {mountain.location && <span className="post-views-count">위치: {mountain.location}</span>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )
          ) : selectedCategory === 'product' ? (
            favoriteStores.length === 0 ? (
              <div className="no-posts">
                <p>즐겨찾기한 상품이 없습니다.</p>
                <Link to="/store" className="write-link">
                  스토어 둘러보기
                </Link>
              </div>
            ) : (
              <div className="post-list">
                {favoriteStores.map((product) => {
                  const productId = product._id || product.id
                  const productUrl = product.url || null
                  const discountRate = product.original_price && product.price && product.original_price > product.price
                    ? Math.round(((product.original_price - product.price) / product.original_price) * 100)
                    : 0
                  
                  return (
                    <div
                      key={productId}
                      className="post-card"
                      onClick={() => {
                        if (productUrl) {
                          window.open(productUrl, '_blank', 'noopener,noreferrer')
                        }
                      }}
                      style={{ cursor: productUrl ? 'pointer' : 'default' }}
                    >
                      {product.thumbnails && (
                        <div className="post-card-thumbnail">
                          <img 
                            src={product.thumbnails} 
                            alt={product.title}
                            onError={(e) => {
                              e.target.style.display = 'none'
                            }}
                          />
                        </div>
                      )}
                      <div className="post-card-content">
                        <div className="post-card-header">
                          <span className="post-category-badge">
                            🛍️ 스토어
                          </span>
                          <h3 className="post-card-title">{product.title}</h3>
                        </div>
                        {product.brand && (
                          <p className="post-card-preview">{product.brand}</p>
                        )}
                        <div className="post-card-footer">
                          <span className="post-time">
                            {product.price?.toLocaleString() || 0}원
                            {product.original_price && product.original_price > product.price && (
                              <>
                                <span style={{ textDecoration: 'line-through', marginLeft: '8px', color: '#999' }}>
                                  {product.original_price.toLocaleString()}원
                                </span>
                                {discountRate > 0 && (
                                  <span style={{ marginLeft: '8px', color: '#e74c3c' }}>
                                    {discountRate}%
                                  </span>
                                )}
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          ) : posts.length === 0 && (selectedCategory === null ? favoriteMountains.length === 0 && favoriteStores.length === 0 : true) ? (
            <div className="no-posts">
              <p>즐겨찾기한 {selectedCategory === null ? '항목이' : '게시글이'} 없습니다.</p>
              <Link to="/community" className="write-link">
                커뮤니티 둘러보기
              </Link>
            </div>
          ) : (
            <div className="post-list">
              {/* 게시글 목록 */}
              {posts.map((post) => (
                <Link
                  key={post.id}
                  to={`/community/${post.id}`}
                  className="post-card"
                >
                  <div className="post-card-content">
                    <div className="post-card-header">
                      <span className={`post-category-badge ${
                        post.category === 'qa' ? 'qa-badge-card' :
                        post.category === 'diary' ? 'diary-badge-card' :
                        post.category === 'free' ? 'free-badge-card' : ''
                      }`}>
                        {post.category === 'qa' && '❓ '}
                        {post.category === 'diary' && '⛰️ '}
                        {post.category === 'free' && '💬 '}
                        {categories.find(c => c.id === post.category)?.name}
                      </span>
                      <h3 className="post-card-title">{post.title}</h3>
                    </div>
                    {post.content && (
                      <p className="post-card-preview">{post.content}</p>
                    )}
                    <div className="post-card-footer">
                      <div className="post-author-section">
                        <span className="post-author-label">작성자</span>
                        <span className="post-author-name">{post.author || '알 수 없음'}</span>
                      </div>
                      <div className="post-meta-section">
                        <span className="post-time">{post.date}</span>
                        <span className="post-views-count">조회 {post.views || 0}</span>
                        <span className="post-likes-count">❤️ {post.likes || 0}</span>
                        <span className="post-comments-count">
                          {post.category === 'qa' ? '💡' : '💬'} {post.comments || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                  {post.thumbnail && (
                    <div className="post-card-thumbnail">
                      <img 
                        src={`${API_URL}${post.thumbnail}`} 
                        alt="썸네일"
                        onError={(e) => {
                          e.target.style.display = 'none'
                        }}
                      />
                    </div>
                  )}
                </Link>
              ))}
              {/* 전체 카테고리일 때 산 목록도 표시 */}
              {selectedCategory === null && favoriteMountains.length > 0 && (
                <>
                  {favoriteMountains.map((mountain) => (
                    <Link
                      key={mountain.code}
                      to={`/mountain/${mountain.code}`}
                      className="post-card diary-card"
                    >
                      <div className="post-card-content">
                        <div className="post-card-header">
                          <span className="post-category-badge diary-badge-card">
                            ⛰️ 산
                          </span>
                          <h3 className="post-card-title">{mountain.name}</h3>
                        </div>
                        <div className="post-card-footer">
                          {mountain.height && <span className="post-time">높이: {mountain.height}</span>}
                          {mountain.location && <span className="post-views-count">위치: {mountain.location}</span>}
                        </div>
                      </div>
                    </Link>
                  ))}
                </>
              )}
              {/* 전체 카테고리일 때 스토어 목록도 표시 */}
              {selectedCategory === null && favoriteStores.length > 0 && (
                <>
                  {favoriteStores.map((product) => {
                    const productId = product._id || product.id
                    const productUrl = product.url || null
                    const discountRate = product.original_price && product.price && product.original_price > product.price
                      ? Math.round(((product.original_price - product.price) / product.original_price) * 100)
                      : 0
                    
                    return (
                      <div
                        key={productId}
                        className="post-card"
                        onClick={() => {
                          if (productUrl) {
                            window.open(productUrl, '_blank', 'noopener,noreferrer')
                          }
                        }}
                        style={{ cursor: productUrl ? 'pointer' : 'default' }}
                      >
                        {product.thumbnails && (
                          <div className="post-card-thumbnail">
                            <img 
                              src={product.thumbnails} 
                              alt={product.title}
                              onError={(e) => {
                                e.target.style.display = 'none'
                              }}
                            />
                          </div>
                        )}
                        <div className="post-card-content">
                          <div className="post-card-header">
                            <span className="post-category-badge">
                              🛍️ 스토어
                            </span>
                            <h3 className="post-card-title">{product.title}</h3>
                          </div>
                          {product.brand && (
                            <p className="post-card-preview">{product.brand}</p>
                          )}
                          <div className="post-card-footer">
                            <span className="post-time">
                              {product.price?.toLocaleString() || 0}원
                              {product.original_price && product.original_price > product.price && (
                                <>
                                  <span style={{ textDecoration: 'line-through', marginLeft: '8px', color: '#999' }}>
                                    {product.original_price.toLocaleString()}원
                                  </span>
                                  {discountRate > 0 && (
                                    <span style={{ marginLeft: '8px', color: '#e74c3c' }}>
                                      {discountRate}%
                                    </span>
                                  )}
                                </>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default MyFavorites

