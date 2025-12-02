import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import './MyPosts.css'

function MyFavorites() {
  const navigate = useNavigate()
  const [allPosts, setAllPosts] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null) // null = 전체
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const hasChecked = useRef(false)

  const categories = [
    { id: null, name: '전체' },
    { id: 'mountain', name: '산' },
    { id: 'product', name: '제품' },
    { id: 'community', name: '커뮤니티' },
    { id: 'diary', name: '등산일지' },
    { id: 'qa', name: 'Q&A' }
  ]

  // 선택된 카테고리에 따라 게시글 필터링
  const posts = selectedCategory === null 
    ? allPosts 
    : selectedCategory === 'community'
    ? allPosts.filter(post => ['diary', 'qa', 'free'].includes(post.category))
    : selectedCategory === 'mountain' || selectedCategory === 'product'
    ? [] // 산과 제품은 아직 구현되지 않음
    : allPosts.filter(post => post.category === selectedCategory)

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
        const response = await fetch(`${API_URL}/api/posts/favorites/my`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        if (response.status === 401) {
          alert('로그인이 필요합니다.')
          navigate('/login', { replace: true })
          return
        }

        if (!response.ok) {
          throw new Error('즐겨찾기 목록을 불러오는데 실패했습니다.')
        }

        const data = await response.json()
        setAllPosts(data.posts || [])
      } catch (err) {
        console.error('즐겨찾기 목록 조회 오류:', err)
        setError('즐겨찾기 목록을 불러오는데 실패했습니다.')
        setAllPosts([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchFavorites()
  }, [navigate, API_URL])

  return (
    <div className="my-posts-page">
      <Header />
      <main className="my-posts-main">
        <div className="my-posts-container">
          <div className="my-posts-header">
            <Link to="/mypage" className="back-link">
              ← 마이페이지
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

          {isLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              즐겨찾기 목록을 불러오는 중...
            </div>
          ) : error ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {error}
            </div>
          ) : posts.length === 0 ? (
            <div className="no-posts">
              <p>즐겨찾기한 게시글이 없습니다.</p>
              <Link to="/community" className="write-link">
                커뮤니티 둘러보기
              </Link>
            </div>
          ) : (
            <div className="post-list">
              {posts.map((post) => (
                <Link
                  key={post.id}
                  to={`/community/${post.id}`}
                  className="post-card"
                >
                  <div className="post-card-content">
                    <div className="post-card-header">
                      <span className="post-category-badge">
                        {categories.find(c => c.id === post.category)?.name}
                      </span>
                      <h3 className="post-card-title">{post.title}</h3>
                    </div>
                    {post.content && (
                      <p className="post-card-preview">{post.content}</p>
                    )}
                    <div className="post-card-footer">
                      <span className="post-time">{post.date}</span>
                      <span className="post-views-count">조회 {post.views}</span>
                      <span className="post-likes-count">좋아요 {post.likes}</span>
                      <span className="post-comments-count">💬 {post.comments || 0}</span>
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
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default MyFavorites

