import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import './Community.css'

function Community() {
  const navigate = useNavigate()
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [posts, setPosts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [showBookmarks, setShowBookmarks] = useState(false)
  
  // 최신 게시글 상태
  const [latestDiary, setLatestDiary] = useState([])
  const [latestFree, setLatestFree] = useState([])
  const [latestQa, setLatestQa] = useState([])
  const [isLoadingLatest, setIsLoadingLatest] = useState(true)

  const categories = [
    { id: 'all', name: '전체' },
    { id: 'diary', name: '등산일지' },
    { id: 'free', name: '자유게시판' },
    { id: 'qa', name: 'Q&A' }
  ]

  // 최신 게시글 가져오기 (전체 탭용)
  useEffect(() => {
    const fetchLatestPosts = async () => {
      setIsLoadingLatest(true)
      try {
        const token = localStorage.getItem('token')
        const headers = {
          'Content-Type': 'application/json'
        }
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }

        // 최신 등산일지 4개
        const diaryResponse = await fetch(`${API_URL}/api/posts?category=diary&page=1&limit=4`, { headers })
        if (diaryResponse.ok) {
          const diaryData = await diaryResponse.json()
          setLatestDiary(diaryData.posts || [])
        }

        // 최신 자유게시판 5개
        const freeResponse = await fetch(`${API_URL}/api/posts?category=free&page=1&limit=5`, { headers })
        if (freeResponse.ok) {
          const freeData = await freeResponse.json()
          setLatestFree(freeData.posts || [])
        }

        // 최신 Q&A 5개
        const qaResponse = await fetch(`${API_URL}/api/posts?category=qa&page=1&limit=5`, { headers })
        if (qaResponse.ok) {
          const qaData = await qaResponse.json()
          setLatestQa(qaData.posts || [])
        }
      } catch (err) {
        console.error('최신 게시글 조회 오류:', err)
      } finally {
        setIsLoadingLatest(false)
      }
    }

    if (selectedCategory === 'all') {
      fetchLatestPosts()
    }
  }, [selectedCategory, API_URL])

  // 게시글 목록 가져오기
  useEffect(() => {
    if (selectedCategory === 'all') {
      setIsLoading(false)
      return
    }

    const fetchPosts = async () => {
      setIsLoading(true)
      setError('')
      try {
        const token = localStorage.getItem('token')
        const headers = {
          'Content-Type': 'application/json'
        }
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }

        let url = ''
        // 등산일지는 9개씩, 자유게시판/Q&A는 15개씩
        const limit = (selectedCategory === 'diary' || showBookmarks) ? 9 : 15
        if (showBookmarks) {
          // 북마크 목록 조회
          url = `${API_URL}/api/posts/bookmarks/my?page=${currentPage}&limit=${limit}`
          console.log('북마크 목록 조회:', url)
        } else {
          // 일반 게시글 목록 조회
          url = `${API_URL}/api/posts?category=${selectedCategory}&page=${currentPage}&limit=${limit}`
        }

        const response = await fetch(url, { headers })
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          console.error('게시글 목록 조회 실패:', response.status, errorData)
          throw new Error(errorData.error || '게시글을 불러오는데 실패했습니다.')
        }
        const data = await response.json()
        console.log('게시글 목록 조회 성공:', {
          showBookmarks,
          postsCount: data.posts?.length || 0,
          total: data.total,
          totalPages: data.totalPages
        })
        setPosts(data.posts || [])
        setTotalPages(data.totalPages || 1)
      } catch (err) {
        console.error('게시글 목록 조회 오류:', err)
        setError('게시글을 불러오는데 실패했습니다.')
        setPosts([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchPosts()
  }, [selectedCategory, currentPage, showBookmarks, API_URL])

  // 북마크 업데이트 이벤트 리스너
  useEffect(() => {
    const handleBookmarkUpdate = (event) => {
      const { postId, isBookmarked } = event.detail || {}
      if (postId && showBookmarks) {
        // 북마크 목록 보기 모드일 경우 목록 새로고침
        const fetchPosts = async () => {
          try {
            const token = localStorage.getItem('token')
            const headers = {
              'Content-Type': 'application/json'
            }
            if (token) {
              headers['Authorization'] = `Bearer ${token}`
            }
            const response = await fetch(`${API_URL}/api/posts/bookmarks/my?page=${currentPage}&limit=9`, { headers })
            if (response.ok) {
              const data = await response.json()
              setPosts(data.posts || [])
              setTotalPages(data.totalPages || 1)
            }
          } catch (err) {
            console.error('북마크 목록 갱신 오류:', err)
          }
        }
        fetchPosts()
      } else if (postId) {
        // 일반 목록 모드일 경우 해당 게시글만 업데이트
        setPosts(prevPosts => 
          prevPosts.map(post => 
            post.id === postId 
              ? { ...post, isFavorited: isBookmarked, isBookmarked: isBookmarked }
              : post
          )
        )
      }
    }

    window.addEventListener('bookmarkUpdated', handleBookmarkUpdate)
    return () => {
      window.removeEventListener('bookmarkUpdated', handleBookmarkUpdate)
    }
  }, [showBookmarks, currentPage, API_URL])

  // 좋아요 토글
  const handleLike = async (postId, e) => {
    e.preventDefault()
    e.stopPropagation()
    
    const token = localStorage.getItem('token')
    if (!token) {
      alert('로그인이 필요합니다.')
      navigate('/login')
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/posts/${postId}/like`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        // 게시글 목록 업데이트
        setPosts(prevPosts => 
          prevPosts.map(post => 
            post.id === postId 
              ? { ...post, isLiked: data.isLiked, likes: data.likes }
              : post
          )
        )
      } else {
        const errorData = await response.json()
        alert(errorData.error || '좋아요 처리 중 오류가 발생했습니다.')
      }
    } catch (error) {
      console.error('좋아요 처리 오류:', error)
      alert('좋아요 처리 중 오류가 발생했습니다.')
    }
  }

  // 북마크 토글
  const handleBookmark = async (postId, e) => {
    e.preventDefault()
    e.stopPropagation()
    
    const token = localStorage.getItem('token')
    if (!token) {
      alert('로그인이 필요합니다.')
      navigate('/login')
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/posts/${postId}/bookmark`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        // 게시글 목록 업데이트
        const isBookmarked = data.isBookmarked !== undefined ? data.isBookmarked : data.isFavorited
        
        if (showBookmarks) {
          // 북마크 목록 보기 모드일 경우 목록 다시 불러오기
          if (isBookmarked) {
            // 북마크 추가된 경우 목록 새로고침
            const refreshResponse = await fetch(`${API_URL}/api/posts/bookmarks/my?page=${currentPage}&limit=9`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            })
            if (refreshResponse.ok) {
              const refreshData = await refreshResponse.json()
              setPosts(refreshData.posts || [])
              setTotalPages(refreshData.totalPages || 1)
            }
          } else {
            // 북마크 해제된 경우 목록에서 제거
            setPosts(prevPosts => prevPosts.filter(post => post.id !== postId))
          }
        } else {
          // 일반 목록 모드일 경우 해당 게시글만 업데이트
          setPosts(prevPosts => 
            prevPosts.map(post => 
              post.id === postId 
                ? { ...post, isFavorited: isBookmarked, isBookmarked: isBookmarked }
                : post
            )
          )
        }
        // 찜목록 카운터 갱신을 위한 이벤트 발생
        window.dispatchEvent(new CustomEvent('favoritesUpdated'))
      } else {
        const errorData = await response.json()
        alert(errorData.error || '북마크 처리 중 오류가 발생했습니다.')
      }
    } catch (error) {
      console.error('북마크 처리 오류:', error)
      alert('북마크 처리 중 오류가 발생했습니다.')
    }
  }

  // 북마크 목록 보기 토글
  const handleShowBookmarks = () => {
    const token = localStorage.getItem('token')
    if (!token) {
      alert('로그인이 필요합니다.')
      navigate('/login')
      return
    }
    setShowBookmarks(true)
    setCurrentPage(1)
    // 카테고리 선택 해제
    setSelectedCategory('diary')
  }

  // 카테고리 변경 시 페이지 초기화
  const handleCategoryChange = (categoryId) => {
    setSelectedCategory(categoryId)
    setCurrentPage(1)
    setShowBookmarks(false)
  }

  // 페이지 변경
  const handlePageChange = (page) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // 카테고리 이름 매핑
  const getCategoryName = (category) => {
    const categoryMap = {
      'diary': '등산일지',
      'free': '자유게시판',
      'qa': 'Q&A'
    }
    return categoryMap[category] || category
  }

  return (
    <div className="community-page">
      <Header />
      <main className="community-main">
        <div className="community-container">
          <h1 className="community-page-title">커뮤니티</h1>
          <div className="community-subtitle-wrapper">
            <p className="community-subtitle">같은 취향, 같은 산을 사랑하는 사람들과 연결되세요!</p>
            <button
              type="button"
              className="bookmark-view-btn"
              onClick={handleShowBookmarks}
            >
              <img src="/images/cm_bookmark_btn_icon.png" alt="북마크" />
              북마크
            </button>
          </div>
          
          <div className="category-tabs-wrapper">
            <div className="category-tabs">
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={`category-tab ${selectedCategory === category.id && !showBookmarks ? 'active' : ''}`}
                  onClick={(e) => {
                    e.preventDefault()
                    handleCategoryChange(category.id)
                  }}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>

          {/* 전체 탭: 최신 게시글 섹션 */}
          {selectedCategory === 'all' && !showBookmarks && (
            <>
              {/* 최신 등산일지 */}
              <div className="latest-section">
                <div className="latest-section-header">
                  <h2 className="latest-section-title">최신 등산일지</h2>
                  <Link to="/community" onClick={(e) => { e.preventDefault(); handleCategoryChange('diary'); }} className="more-link">
                    더보기 &gt;
                  </Link>
                </div>
                {isLoadingLatest ? (
                  <div className="loading-message">게시글을 불러오는 중...</div>
                ) : (
                  <div className="latest-diary-grid">
                    {latestDiary.map((post) => (
                      <Link
                        key={post.id}
                        to={`/community/${post.id}`}
                        className="latest-diary-item"
                      >
                        {post.thumbnail && (
                          <div className="latest-diary-image">
                            <img 
                              src={`${API_URL}${post.thumbnail}`} 
                              alt={post.title}
                              onError={(e) => {
                                e.target.style.display = 'none'
                              }}
                            />
                          </div>
                        )}
                        {!post.thumbnail && (
                          <div className="latest-diary-placeholder">
                            <span>이미지 없음</span>
                          </div>
                        )}
                        <h3 className="latest-diary-title">{post.title}</h3>
                        <span className="latest-diary-date">{post.date}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* 최신 자유게시판 & 최신 Q&A */}
              <div className="latest-list-container">
                {/* 최신 자유게시판 */}
                <div className="latest-list-section">
                  <div className="latest-section-header">
                    <h2 className="latest-section-title">최신 자유게시판</h2>
                    <Link to="/community" onClick={(e) => { e.preventDefault(); handleCategoryChange('free'); }} className="more-link">
                      더보기 &gt;
                    </Link>
                  </div>
                  {isLoadingLatest ? (
                    <div className="loading-message">게시글을 불러오는 중...</div>
                  ) : (
                    <div className="latest-list">
                      {latestFree.map((post) => (
                        <Link
                          key={post.id}
                          to={`/community/${post.id}`}
                          className="latest-list-item"
                        >
                          <span className={`post-category-badge ${post.category}-badge`}>
                            {getCategoryName(post.category)}
                          </span>
                          <div className="latest-list-title">{post.title}</div>
                          <span className="latest-list-date">{post.date}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* 최신 Q&A */}
                <div className="latest-list-section">
                  <div className="latest-section-header">
                    <h2 className="latest-section-title">최신 Q&A</h2>
                    <Link to="/community" onClick={(e) => { e.preventDefault(); handleCategoryChange('qa'); }} className="more-link">
                      더보기 &gt;
                    </Link>
                  </div>
                  {isLoadingLatest ? (
                    <div className="loading-message">게시글을 불러오는 중...</div>
                  ) : (
                    <div className="latest-list">
                      {latestQa.map((post) => (
                        <Link
                          key={post.id}
                          to={`/community/${post.id}`}
                          className="latest-list-item"
                        >
                          <span className={`post-category-badge ${post.category}-badge`}>
                            {getCategoryName(post.category)}
                          </span>
                          <div className="latest-list-title">{post.title}</div>
                          <div className="latest-list-meta">
                            <span className="latest-list-date">{post.date}</span>
                            <span className="latest-list-author">{post.author}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {showBookmarks && (
            <div style={{ marginBottom: '24px', padding: '16px', background: 'var(--bg)', borderRadius: '8px', textAlign: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>북마크한 게시글</h2>
              <button
                type="button"
                onClick={() => setShowBookmarks(false)}
                style={{ marginTop: '8px', padding: '4px 12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}
              >
                일반 목록으로 돌아가기
              </button>
            </div>
          )}

          {(selectedCategory === 'diary' || showBookmarks) && selectedCategory !== 'all' ? (
            <div className="post-grid">
              {isLoading ? (
                <div className="loading-message">게시글을 불러오는 중...</div>
              ) : error ? (
                <div className="error-message">{error}</div>
              ) : posts.length > 0 && (
                posts.map((post) => (
                  <Link
                    key={post.id}
                    to={`/community/${post.id}`}
                    className="post-thumbnail-card"
                  >
                    {post.thumbnail && (
                      <div className="post-thumbnail-image">
                        <img 
                          src={`${API_URL}${post.thumbnail}`} 
                          alt={post.title}
                          onError={(e) => {
                            e.target.style.display = 'none'
                          }}
                        />
                      </div>
                    )}
                    {!post.thumbnail && (
                      <div className="post-thumbnail-placeholder">
                        <span>이미지 없음</span>
                      </div>
                    )}
                    <div className="post-thumbnail-content">
                      <span className={`post-category-badge ${post.category}-badge`}>
                        {getCategoryName(post.category)}
                      </span>
                      <h3 className="post-thumbnail-title">{post.title}</h3>
                      <div className="post-thumbnail-date">{post.date}</div>
                      <div className="post-thumbnail-footer">
                        <div className="post-thumbnail-actions-left">
                          <button
                            type="button"
                            className="like-btn"
                            onClick={(e) => handleLike(post.id, e)}
                          >
                            <img 
                              src={post.isLiked ? "/images/cm_like_hover_icon.png" : "/images/cm_like_icon.png"} 
                              alt="좋아요"
                            />
                            <span>{post.likes || 0}</span>
                          </button>
                          <div className="comment-count">
                            <img src="/images/cm_chat_icon.png" alt="댓글" />
                            <span>{post.comments || 0}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className={`bookmark-btn ${post.isBookmarked ? 'bookmarked' : ''}`}
                          onClick={(e) => handleBookmark(post.id, e)}
                        >
                          <img src="/images/cm_bookmark_icon.png" alt="북마크" />
                        </button>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          ) : (
            <div className="post-list">
              {isLoading ? (
                <div className="loading-message">게시글을 불러오는 중...</div>
              ) : error ? (
                <div className="error-message">{error}</div>
              ) : posts.length > 0 && (
                posts.map((post) => (
                  <Link
                    key={post.id}
                    to={`/community/${post.id}`}
                    className="post-list-item"
                  >
                    <span className={`post-category-badge ${post.category}-badge`}>
                      {getCategoryName(post.category)}
                    </span>
                    <div className="post-list-title">{post.title}</div>
                    <div className="post-list-meta">
                      <span className="post-list-author">{post.author}</span>
                      <span className="post-list-date">{post.date}</span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          )}

          <div className="write-button-container">
            <Link to="/community/write" className="write-btn">
              작성하기
            </Link>
          </div>

          {(selectedCategory === 'free' || selectedCategory === 'qa') && selectedCategory !== 'all' && totalPages > 1 && (
            <div className="pagination">
              <button
                type="button"
                className="pagination-btn"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                &lt;
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  type="button"
                  className={`pagination-btn ${currentPage === page ? 'active' : ''}`}
                  onClick={() => handlePageChange(page)}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                className="pagination-btn"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                &gt;
              </button>
            </div>
          )}

          {(selectedCategory === 'diary' || showBookmarks) && selectedCategory !== 'all' && totalPages > 1 && (
            <div className="pagination">
              <button
                type="button"
                className="pagination-btn"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                &lt;
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  type="button"
                  className={`pagination-btn ${currentPage === page ? 'active' : ''}`}
                  onClick={() => handlePageChange(page)}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                className="pagination-btn"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                &gt;
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default Community
