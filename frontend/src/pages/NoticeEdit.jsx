import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import './NoticeWrite.css'

function NoticeEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    icon: '📢',
    type: 'announcement',
    images: [],
    existingImages: [],
    removedImages: []
  })
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const checkAdminAndLoadNotice = async () => {
      const token = localStorage.getItem('token')
      if (!token) {
        alert('로그인이 필요합니다.')
        navigate('/login')
        return
      }

      try {
        // 관리자 권한 확인
        const userResponse = await fetch(`${API_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        if (userResponse.ok) {
          const userData = await userResponse.json()
          if (userData.user?.role !== 'admin') {
            alert('관리자만 접근할 수 있습니다.')
            navigate('/notice')
            return
          }
          setIsAdmin(true)
        } else {
          alert('권한 확인 중 오류가 발생했습니다.')
          navigate('/notice')
          return
        }

        // 공지사항 데이터 가져오기
        const noticeResponse = await fetch(`${API_URL}/api/notices/${id}`)
        if (!noticeResponse.ok) {
          throw new Error('공지사항을 불러오는데 실패했습니다.')
        }
        const noticeData = await noticeResponse.json()
        setFormData({
          title: noticeData.title || '',
          content: noticeData.content || '',
          icon: noticeData.icon || '📢',
          type: noticeData.type || 'announcement',
          images: [],
          existingImages: noticeData.images || [],
          removedImages: []
        })
      } catch (error) {
        console.error('공지사항 로드 오류:', error)
        alert('공지사항을 불러오는데 실패했습니다.')
        navigate('/notice')
      }
    }

    checkAdminAndLoadNotice()
  }, [id, navigate, API_URL])

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
    setErrorMessage('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorMessage('')

    if (!formData.title.trim()) {
      alert('제목을 입력해주세요.')
      setIsLoading(false)
      return
    }

    if (!formData.content.trim()) {
      alert('내용을 입력해주세요.')
      setIsLoading(false)
      return
    }

    const token = localStorage.getItem('token')
    if (!token) {
      alert('로그인이 필요합니다.')
      navigate('/login')
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/notices/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      })

      const data = await response.json()

      if (response.ok) {
        alert('공지사항이 수정되었습니다.')
        navigate(`/notice/${id}`)
      } else {
        const errorMsg = data.error || '공지사항 수정 중 오류가 발생했습니다.'
        setErrorMessage(errorMsg)
        alert(errorMsg)
      }
    } catch (error) {
      console.error('공지사항 수정 오류:', error)
      setErrorMessage('공지사항 수정 중 오류가 발생했습니다.')
      alert('공지사항 수정 중 오류가 발생했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="notice-write-page">
        <Header />
        <main className="notice-write-main">
          <div className="notice-write-container">
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              권한 확인 중...
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="notice-write-page">
      <Header />
      <main className="notice-write-main">
        <div className="notice-write-container">
          <div className="write-header">
            <h1 className="write-title">공지사항 수정</h1>
            <button onClick={() => navigate(`/notice/${id}`)} className="cancel-btn">
              취소
            </button>
          </div>

          <form onSubmit={handleSubmit} className="notice-form">
            <div className="form-group">
              <label htmlFor="icon">아이콘</label>
              <select
                id="icon"
                name="icon"
                value={formData.icon}
                onChange={handleChange}
                className="form-input"
              >
                <option value="📢">📢 공지</option>
                <option value="💡">💡 정보</option>
                <option value="🎁">🎁 이벤트</option>
                <option value="👤">👤 업데이트</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="type">유형</label>
              <select
                id="type"
                name="type"
                value={formData.type}
                onChange={handleChange}
                className="form-input"
              >
                <option value="announcement">공지</option>
                <option value="info">정보</option>
                <option value="event">이벤트</option>
                <option value="update">업데이트</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="title">제목</label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="제목을 입력해주세요"
                className="form-input"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="content">내용</label>
              <textarea
                id="content"
                name="content"
                value={formData.content}
                onChange={handleChange}
                placeholder="내용을 입력해주세요"
                className="form-textarea"
                rows="15"
                required
              />
            </div>

            <div className="form-group">
              <label>기존 이미지</label>
              {formData.existingImages && formData.existingImages.length > 0 ? (
                <div className="existing-images-list">
                  {formData.existingImages.map((image, index) => (
                    <div key={index} className="existing-image-item">
                      <img
                        src={`${API_URL}${image}`}
                        alt={`기존 이미지 ${index + 1}`}
                        className="existing-image"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setFormData({
                            ...formData,
                            existingImages: formData.existingImages.filter((_, i) => i !== index),
                            removedImages: [...formData.removedImages, image]
                          })
                        }}
                        className="remove-image-btn"
                      >
                        삭제
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-images">기존 이미지가 없습니다.</p>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="images">새 이미지 첨부 (최대 5개)</label>
              <input
                type="file"
                id="images"
                name="images"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files).slice(0, 5)
                  setFormData({
                    ...formData,
                    images: [...formData.images, ...files].slice(0, 5)
                  })
                }}
                className="form-input"
              />
              {formData.images.length > 0 && (
                <div className="image-preview-list">
                  {formData.images.map((image, index) => (
                    <div key={index} className="image-preview-item">
                      <img
                        src={URL.createObjectURL(image)}
                        alt={`미리보기 ${index + 1}`}
                        className="preview-image"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setFormData({
                            ...formData,
                            images: formData.images.filter((_, i) => i !== index)
                          })
                        }}
                        className="remove-image-btn"
                      >
                        삭제
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {errorMessage && (
              <div className="error-message">{errorMessage}</div>
            )}

            <div className="form-actions">
              <button type="submit" className="submit-btn" disabled={isLoading}>
                {isLoading ? '수정 중...' : '수정하기'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}

export default NoticeEdit

