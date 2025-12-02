import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import './CommunityWrite.css'

function CommunityWrite() {
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category: 'diary',
    images: []
  })
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const navigate = useNavigate()

  const categories = [
    { id: 'diary', name: '등산일지' },
    { id: 'qa', name: 'Q&A' },
    { id: 'free', name: '자유게시판' }
  ]

  const handleChange = (e) => {
    const value = e.target.value
    setFormData({
      ...formData,
      [e.target.name]: value
    })
  }

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files)
    if (files.length + formData.images.length > 5) {
      alert('이미지는 최대 5개까지 업로드 가능합니다.')
      return
    }
    setFormData({
      ...formData,
      images: [...formData.images, ...files]
    })
  }

  const removeImage = (index) => {
    setFormData({
      ...formData,
      images: formData.images.filter((_, i) => i !== index)
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

      console.log('게시글 작성 요청 - 카테고리:', formData.category, '전체 formData:', formData)

      // 이미지 추가
      formData.images.forEach((image) => {
        submitData.append('images', image)
      })

      console.log('FormData 카테고리 확인:', submitData.get('category'))

      const response = await fetch(`${API_URL}/api/posts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: submitData
      })

      const data = await response.json()

      if (response.ok) {
        alert('게시글이 작성되었습니다.')
        navigate('/community')
      } else {
        const errorMsg = data.error || '게시글 작성 중 오류가 발생했습니다.'
        setErrorMessage(errorMsg)
        alert(errorMsg)
      }
    } catch (error) {
      console.error('게시글 작성 오류:', error)
      setErrorMessage('서버 오류가 발생했습니다.')
      alert('서버 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="community-write-page">
      <Header />
      <main className="community-write-main">
        <div className="community-write-container">
          <h1 className="write-page-title">글 작성하기</h1>

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
              <div className="image-upload-group">
                <input
                  type="file"
                  id="images"
                  name="images"
                  accept="image/*"
                  multiple
                  onChange={handleImageChange}
                  className="file-input"
                  disabled={formData.images.length >= 5}
                />
                <label htmlFor="images" className="file-upload-btn">
                  파일 선택
                </label>
                {formData.images.length > 0 && (
                  <span className="file-count">
                    {formData.images.length}개 선택됨
                  </span>
                )}
              </div>
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
                onClick={() => navigate('/community')}
                className="cancel-btn"
              >
                취소
              </button>
              <button
                type="submit"
                className="submit-btn"
                disabled={isLoading}
              >
                {isLoading ? '작성 중...' : '작성하기'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}

export default CommunityWrite

