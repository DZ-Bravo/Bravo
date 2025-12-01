import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import './MyPosts.css'

function MyPosts() {
  const navigate = useNavigate()
  const [posts, setPosts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const hasChecked = useRef(false)

  const categories = [
    { id: 'diary', name: '등산일지' },
    { id: 'qa', name: 'Q&A' },
    { id: 'free', name: '자유게시판' }
  ]

  useEffect(() => {
    // 중복 체크 방지
    if (hasChecked.current) {
      return
    }
    hasChecked.current = true

    const token = localStorage.getItem('token')
    if (!token) {
      alert('로그인이 필요합니다.')
      navigate('/login', { replace: true })
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
        setPosts(data.posts || [])
      } catch (err) {
        console.error('내 게시글 조회 오류:', err)
        setError('게시글을 불러오는데 실패했습니다.')
        setPosts([])
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
              ← 마이페이지
            </Link>
            <h1 className="my-posts-title">내 게시글</h1>
          </div>

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

export default MyPosts

