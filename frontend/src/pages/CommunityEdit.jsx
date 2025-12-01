import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import './CommunityWrite.css'

function CommunityEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category: 'diary',
    images: [],
    existingImages: [],
    removedImages: []
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const categories = [
    { id: 'diary', name: '등산일지' },
    { id: 'qa', name: 'Q&A' },
    { id: 'free', name: '자유게시판' }
  ]

  // 기존 게시글 데이터 불러오기
  useEffect(() => {
    const fetchPost = async () => {
      const token = localStorage.getItem('token')
      if (!token) {
        alert('로그인이 필요합니다.')
        navigate('/login')
        return
      }

      try {
        const response = await fetch(`${API_URL}/api/posts/${id}`)
        if (!response.ok) {
          if (response.status === 404) {
            alert('게시글을 찾을 수 없습니다.')
            navigate('/community')
            return
          }
          throw new Error('게시글을 불러오는데 실패했습니다.')
        }

        const data = await response.json()
        
        // 작성자 확인
        const user = JSON.parse(localStorage.getItem('user') || '{}')
        if (data.authorId !== user.id) {
          alert('게시글을 수정할 권한이 없습니다.')
          navigate('/community')
          return
        }

        setFormData({
          title: data.title || '',
          content: data.content || '',
          category: data.category || 'diary',
          images: [],
          existingImages: data.images || [],
          removedImages: []
        })
      } catch (error) {
        console.error('게시글 불러오기 오류:', error)
        alert('게시글을 불러오는데 실패했습니다.')
        navigate('/community')
      } finally {
        setIsFetching(false)
      }
    }

    if (id) {
      fetchPost()
    }
  }, [id, navigate, API_URL])

  const handleChange = (e) => {
    const value = e.target.value
    setFormData({
      ...formData,
      [e.target.name]: value
    })
  }

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files)
    const currentImages = formData.images || []
    const existingImages = formData.existingImages || []
    const totalImages = currentImages.length + existingImages.length
    if (files.length + totalImages > 5) {
      alert('이미지는 최대 5개까지 업로드 가능합니다.')
      return
    }
    setFormData({
      ...formData,
      images: [...currentImages, ...files]
    })
  }

  const removeImage = (index) => {
    const currentImages = formData.images || []
    setFormData({
      ...formData,
      images: currentImages.filter((_, i) => i !== index)
    })
  }

  const removeExistingImage = (index) => {
    const existingImages = formData.existingImages || []
    const removedImages = formData.removedImages || []
    const imageToRemove = existingImages[index]
    setFormData({
      ...formData,
      existingImages: existingImages.filter((_, i) => i !== index),
      removedImages: [...removedImages, imageToRemove]
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorMessage('')

    // 유효성 검사
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

    // 로그인 확인
    const token = localStorage.getItem('token')
    if (!token) {
      alert('로그인이 필요합니다.')
      navigate('/login')
      setIsLoading(false)
      return
    }

    try {
      // FormData 생성
      const submitData = new FormData()
      submitData.append('title', formData.title)
      submitData.append('content', formData.content)
      submitData.append('category', formData.category)
      
      // 제거할 이미지 목록 추가
      if (formData.removedImages && formData.removedImages.length > 0) {
        submitData.append('removedImages', JSON.stringify(formData.removedImages))
      }

      // 새로 추가할 이미지 추가
      if (formData.images && formData.images.length > 0) {
        formData.images.forEach((image) => {
          submitData.append('images', image)
        })
      }

      const response = await fetch(`${API_URL}/api/posts/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: submitData
      })

      const data = await response.json()

      if (response.ok) {
        alert('게시글이 수정되었습니다.')
        navigate(`/community/${id}`)
      } else {
        const errorMsg = data.error || '게시글 수정 중 오류가 발생했습니다.'
        setErrorMessage(errorMsg)
        alert(errorMsg)
      }
    } catch (error) {
      console.error('게시글 수정 오류:', error)
      setErrorMessage('서버 오류가 발생했습니다.')
      alert('서버 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsLoading(false)
    }
  }

  if (isFetching) {
    return (
      <div className="community-write-page">
        <Header />
        <main className="community-write-main">
          <div className="community-write-container">
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              게시글을 불러오는 중...
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="community-write-page">
      <Header />
      <main className="community-write-main">
        <div className="community-write-container">
          <h1 className="write-page-title">글 수정하기</h1>

          <form onSubmit={handleSubmit} className="write-form">
            <div className="form-group">
              <label htmlFor="category">카테고리</label>
              <select
                id="category"
                name="category"
                value={formData.category}
                onChange={handleChange}
                required
                className="form-select"
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
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
                required
                className="form-input"
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
                rows={15}
                required
                className="form-textarea"
              />
            </div>

            <div className="form-group">
              <label htmlFor="images">이미지 첨부 (최대 5개)</label>
              
              {/* 기존 이미지 표시 */}
              {formData.existingImages && formData.existingImages.length > 0 && (
                <div className="existing-images-section">
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                    기존 이미지 ({formData.existingImages.length}개)
                  </p>
                  <div className="image-preview-list">
                    {formData.existingImages.map((image, index) => (
                      <div key={index} className="image-preview-item">
                        <img
                          src={`${API_URL}${image}`}
                          alt={`기존 이미지 ${index + 1}`}
                          className="preview-image"
                        />
                        <button
                          type="button"
                          onClick={() => removeExistingImage(index)}
                          className="remove-image-btn"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 새 이미지 추가 */}
              <div className="image-upload-group">
                <input
                  type="file"
                  id="images"
                  name="images"
                  accept="image/*"
                  multiple
                  onChange={handleImageChange}
                  className="file-input"
                  disabled={(formData.images?.length || 0) + (formData.existingImages?.length || 0) >= 5}
                />
                <label htmlFor="images" className="file-upload-btn">
                  파일 선택
                </label>
                {formData.images.length > 0 && (
                  <span className="file-count">
                    새 이미지 {formData.images.length}개 선택됨
                  </span>
                )}
              </div>
              
              {/* 새로 추가한 이미지 미리보기 */}
              {formData.images && formData.images.length > 0 && (
                <div className="image-preview-list" style={{ marginTop: '16px' }}>
                  {formData.images.map((image, index) => (
                    <div key={index} className="image-preview-item">
                      <img
                        src={URL.createObjectURL(image)}
                        alt={`미리보기 ${index + 1}`}
                        className="preview-image"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="remove-image-btn"
                      >
                        ✕
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
              <button
                type="button"
                onClick={() => navigate(`/community/${id}`)}
                className="cancel-btn"
              >
                취소
              </button>
              <button
                type="submit"
                className="submit-btn"
                disabled={isLoading}
              >
                {isLoading ? '수정 중...' : '수정하기'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}

export default CommunityEdit

