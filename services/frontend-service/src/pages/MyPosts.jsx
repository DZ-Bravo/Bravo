import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import './MyPosts.css'

function MyPosts() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const categoryParam = searchParams.get('category')
  
  // URL 파라미터에서 category가 있으면 해당 카테고리로 초기화, 없으면 전체
  const [selectedCategory, setSelectedCategory] = useState(
    categoryParam === 'diary' ? 'diary' : null
  )
  const [allPosts, setAllPosts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const hasChecked = useRef(false)

  const categories = [
    { id: null, name: '전체' },
    { id: 'diary', name: '등산일지' },
    { id: 'qa', name: 'Q&A' },
    { id: 'free', name: '자유게시판' }
  ]

  // URL 파라미터 변경 시 selectedCategory 업데이트
  useEffect(() => {
    if (categoryParam === 'diary') {
      setSelectedCategory('diary')
    } else if (categoryParam === null) {
      setSelectedCategory(null)
    }
  }, [categoryParam])

  // 선택된 카테고리에 따라 게시글 필터링
  const posts = selectedCategory === null 
    ? allPosts 
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

    const fetchMyPosts = async () => {
      setIsLoading(true)
      setError('')
      try {
        const response = await fetch(`${API_URL}/api/posts/my`, {
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
          throw new Error('게시글을 불러오는데 실패했습니다.')
        }

        const data = await response.json()
        setAllPosts(data.posts || [])
      } catch (err) {
        console.error('내 게시글 조회 오류:', err)
        setError('게시글을 불러오는데 실패했습니다.')
        setAllPosts([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchMyPosts()
  }, [navigate, API_URL])

  return (
    <div className="my-posts-page">
      <Header />
      <main className="my-posts-main">
        <div className="my-posts-container">
          <div className="my-posts-header">
            <Link to="/mypage" className="back-link">
              ←
            </Link>
            <h1 className="my-posts-title">
              {categoryParam === 'diary' ? '등산일지' : '내 게시글'}
            </h1>
          </div>

          {/* 카테고리 탭 - category 파라미터가 있으면 숨김 */}
          {!categoryParam && (
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
          )}

          {isLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              게시글을 불러오는 중...
            </div>
          ) : error ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {error}
            </div>
          ) : posts.length === 0 ? (
            <div className="no-posts">
              <p>작성한 게시글이 없습니다.</p>
              <Link to="/community/write" className="write-link">
                게시글 작성하기
              </Link>
            </div>
          ) : (
            <div className="post-list">
              {posts.map((post) => (
                <Link
                  key={post.id}
                  to={`/community/${post.id}`}
                  className={`post-card ${post.thumbnail ? 'has-thumbnail' : ''}`}
                >
                  <div className="post-card-content">
                    <div className="post-card-header">
                      <span className="post-category-badge">
                        {categories.find(c => c.id === post.category)?.name}
                      </span>
                    </div>
                    <h3 className="post-card-title">{post.title}</h3>
                    {post.content && (
                      <p className="post-card-preview">{post.content}</p>
                    )}
                    <div className="post-card-footer">
                      <div className="post-author-section">
                        <span className="post-author-label">작성자</span>
                        <span className="post-author-name">{post.author}</span>
                      </div>
                      <div className="post-meta-section">
                        <span className="post-time">{post.date}</span>
                        <span className="post-views-count">조회 {post.views}</span>
                        <span className="post-likes-count">❤️ {post.likes || 0}</span>
                        <span className="post-comments-count">💬 {post.comments || 0}</span>
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
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default MyPosts

