import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import './Community.css'

function Community() {
  const [selectedCategory, setSelectedCategory] = useState('diary')
  const [posts, setPosts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const categories = [
    { id: 'diary', name: '등산일지' },
    { id: 'qa', name: 'Q&A' },
    { id: 'free', name: '자유게시판' }
  ]

  // 게시글 목록 가져오기
  useEffect(() => {
    const fetchPosts = async () => {
      setIsLoading(true)
      setError('')
      try {
        const response = await fetch(`${API_URL}/api/posts?category=${selectedCategory}`)
        if (!response.ok) {
          throw new Error('게시글을 불러오는데 실패했습니다.')
        }
        const data = await response.json()
        setPosts(data.posts || [])
      } catch (err) {
        console.error('게시글 목록 조회 오류:', err)
        setError('게시글을 불러오는데 실패했습니다.')
        setPosts([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchPosts()
  }, [selectedCategory, API_URL])

  return (
    <div className="community-page">
      <Header />
      <main className="community-main">
        <div className="community-container">
          <h1 className="community-page-title">커뮤니티</h1>
          
          <div className="category-tabs">
            {categories.map((category) => (
              <button
                key={category.id}
                className={`category-tab ${selectedCategory === category.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>

          <div className="write-button-container">
            <Link to="/community/write" className="write-btn">
              ✏️ 작성하기
            </Link>
          </div>

          <div className="post-list">
            {isLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                게시글을 불러오는 중...
              </div>
            ) : error ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                {error}
              </div>
            ) : posts.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                게시글이 없습니다.
              </div>
            ) : (
              posts.map((post) => (
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
                      <span className="post-author-name">{post.author}</span>
                      <span className="post-time">{post.date}</span>
                      <span className="post-views-count">조회 {post.views}</span>
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
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default Community


