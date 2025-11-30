import { Link } from 'react-router-dom'
import { useState } from 'react'
import Header from '../components/Header'
import './Community.css'

function Community() {
  const [selectedCategory, setSelectedCategory] = useState('diary')

  const categories = [
    { id: 'diary', name: '등산일지' },
    { id: 'qa', name: 'Q&A' },
    { id: 'free', name: '자유게시판' }
  ]

  const posts = [
    {
      id: 1,
      category: 'diary',
      title: '북한산 등반 후기 공유합니다',
      author: '등산러123',
      date: '2025-11-21',
      views: 245,
      likes: 12
    },
    {
      id: 2,
      category: 'diary',
      title: '설악산 대청봉 정상까지 완등!',
      author: '산행러',
      date: '2025-11-20',
      views: 189,
      likes: 28
    },
    {
      id: 3,
      category: 'qa',
      title: '초보자도 갈 수 있는 산 추천해주세요',
      author: '등산초보',
      date: '2025-11-19',
      views: 156,
      likes: 8
    },
    {
      id: 4,
      category: 'free',
      title: '이번 주말 지리산 등반 같이 가실 분 구합니다',
      author: '등산모임',
      date: '2025-11-18',
      views: 98,
      likes: 15
    },
    {
      id: 5,
      category: 'free',
      title: '가을 단풍 명소 추천합니다',
      author: '자연인',
      date: '2025-11-17',
      views: 312,
      likes: 45
    },
    {
      id: 6,
      category: 'diary',
      title: '한라산 정상 등반 성공기',
      author: '정상도전',
      date: '2025-11-16',
      views: 278,
      likes: 32
    },
    {
      id: 7,
      category: 'qa',
      title: '등산 장비 추천 부탁드립니다',
      author: '장비고수',
      date: '2025-11-15',
      views: 201,
      likes: 11
    },
    {
      id: 8,
      category: 'free',
      title: '겨울 산행 모임 참여하실 분',
      author: '겨울산행',
      date: '2025-11-14',
      views: 134,
      likes: 19
    }
  ]

  const filteredPosts = posts.filter(post => post.category === selectedCategory)

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
            {filteredPosts.map((post) => (
              <Link
                key={post.id}
                to={`/community/${post.id}`}
                className="post-item"
              >
                <div className="post-content">
                  <div className="post-header">
                    <span className="post-category">
                      {categories.find(c => c.id === post.category)?.name}
                    </span>
                    <span className="post-title">{post.title}</span>
                  </div>
                  <div className="post-meta">
                    <span className="post-author">{post.author}</span>
                    <span className="post-date">{post.date}</span>
                    <span className="post-views">조회 {post.views}</span>
                    <span className="post-likes">좋아요 {post.likes}</span>
                  </div>
                </div>
                <div className="post-arrow">→</div>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

export default Community

