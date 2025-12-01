import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import './CommunityDetail.css'

function CommunityDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [post, setPost] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isLiked, setIsLiked] = useState(false)
  const hasFetched = useRef(false)
  const currentId = useRef(null)

  const categories = [
    { id: 'diary', name: '등산일지' },
    { id: 'qa', name: 'Q&A' },
    { id: 'free', name: '자유게시판' }
  ]

  // 게시글 상세 정보 가져오기
  useEffect(() => {
    // id가 변경되면 리셋
    if (currentId.current !== id) {
      currentId.current = id
      hasFetched.current = false
      setPost(null)
      setIsLoading(true)
      setError('')
    }
    
    // 중복 호출 방지
    if (hasFetched.current || !id) {
      return
    }

    const fetchPost = async () => {
      // 중복 호출 방지 체크 (비동기 함수 내에서도 체크)
      if (hasFetched.current) {
        return
      }
      hasFetched.current = true
      
      setIsLoading(true)
      setError('')
      try {
        const response = await fetch(`${API_URL}/api/posts/${id}`)
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('게시글을 찾을 수 없습니다.')
          }
          throw new Error('게시글을 불러오는데 실패했습니다.')
        }
        const data = await response.json()
        console.log('게시글 데이터:', data) // 디버깅용
        
        // id가 여전히 같은지 확인 (컴포넌트가 언마운트되었거나 id가 변경되었을 수 있음)
        if (currentId.current === id) {
          setPost(data)
          
          // 로그인한 사용자의 좋아요 여부 확인
          const token = localStorage.getItem('token')
          if (token) {
            // 좋아요 상태는 백엔드에서 확인해야 하지만, 일단 기본값으로 설정
            setIsLiked(false)
          }
        }
      } catch (err) {
        console.error('게시글 상세 조회 오류:', err)
        if (currentId.current === id) {
          setError(err.message || '게시글을 불러오는데 실패했습니다.')
        }
        hasFetched.current = false // 에러 시 다시 시도할 수 있도록
      } finally {
        if (currentId.current === id) {
          setIsLoading(false)
        }
      }
    }

    fetchPost()
  }, [id, API_URL])

  // 좋아요 토글
  const handleLike = async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      alert('로그인이 필요합니다.')
      navigate('/login')
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/posts/${id}/like`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        setIsLiked(data.isLiked)
        if (post) {
          setPost({
            ...post,
            likes: data.likes
          })
        }
      } else {
        const errorData = await response.json()
        alert(errorData.error || '좋아요 처리 중 오류가 발생했습니다.')
      }
    } catch (error) {
      console.error('좋아요 처리 오류:', error)
      alert('좋아요 처리 중 오류가 발생했습니다.')
    }
  }

  // 게시글 삭제
  const handleDelete = async () => {
    if (!window.confirm('정말 삭제하시겠습니까?')) {
      return
    }

    const token = localStorage.getItem('token')
    if (!token) {
      alert('로그인이 필요합니다.')
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/posts/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        alert('게시글이 삭제되었습니다.')
        navigate('/community')
      } else {
        const errorData = await response.json()
        alert(errorData.error || '게시글 삭제 중 오류가 발생했습니다.')
      }
    } catch (error) {
      console.error('게시글 삭제 오류:', error)
      alert('게시글 삭제 중 오류가 발생했습니다.')
    }
  }

  // 현재 사용자가 작성자인지 확인
  const isAuthor = () => {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    return post && post.authorId === user.id
  }

  if (isLoading) {
    return (
      <div className="community-detail-page">
        <Header />
        <main className="community-detail-main">
          <div className="community-detail-container">
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              게시글을 불러오는 중...
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (error || !post) {
    return (
      <div className="community-detail-page">
        <Header />
        <main className="community-detail-main">
          <div className="community-detail-container">
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {error || '게시글을 찾을 수 없습니다.'}
            </div>
            <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <Link to="/community" className="back-link">
                목록으로 돌아가기
              </Link>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="community-detail-page">
      <Header />
      <main className="community-detail-main">
        <div className="community-detail-container">
          <div className="detail-header">
            <Link to="/community" className="back-link">
              ← 목록으로
            </Link>
            
            {isAuthor() && (
              <div className="post-actions">
                <button
                  onClick={() => navigate(`/community/edit/${id}`)}
                  className="edit-btn"
                >
                  수정
                </button>
                <button
                  onClick={handleDelete}
                  className="delete-btn"
                >
                  삭제
                </button>
              </div>
            )}
          </div>

          <div className="post-detail">
            <div className="post-detail-header">
              <span className="post-category">
                {categories.find(c => c.id === post.category)?.name}
              </span>
              <h1 className="post-title">{post.title}</h1>
            </div>

            <div className="post-meta">
              <div className="author-info">
                {post.authorProfileImage && (
                  <img
                    src={`${API_URL}${post.authorProfileImage}`}
                    alt={post.author}
                    className="author-avatar"
                  />
                )}
                <span className="post-author">{post.author}</span>
              </div>
              <div className="post-stats">
                <span className="post-date">{post.date}</span>
                <span className="post-views">조회 {post.views}</span>
                <button
                  onClick={handleLike}
                  className={`like-btn ${isLiked ? 'liked' : ''}`}
                >
                  ♥ {post.likes}
                </button>
              </div>
            </div>

            <div className="post-content">
              {post.images && post.images.length > 0 && (
                <div className="post-images">
                  {post.images.map((image, index) => (
                    <img
                      key={index}
                      src={`${API_URL}${image}`}
                      alt={`게시글 이미지 ${index + 1}`}
                      className="content-image"
                      onError={(e) => {
                        e.target.style.display = 'none'
                      }}
                    />
                  ))}
                </div>
              )}
              <div className="post-text">
                {post.content ? (
                  post.content.split('\n').map((line, index) => (
                    <p key={index}>{line || '\u00A0'}</p>
                  ))
                ) : (
                  <p>내용이 없습니다.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default CommunityDetail

