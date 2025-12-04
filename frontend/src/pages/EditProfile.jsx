import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import './MyPage.css'
import './Signup.css'

function EditProfile() {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    name: '',
    password: '',
    confirmPassword: '',
    gender: '',
    fitnessLevel: '',
    birthYear: '',
    phone: '',
    profileImage: null
  })
  const [profileImageName, setProfileImageName] = useState('')
  const [profileImagePreview, setProfileImagePreview] = useState('')
  const [isFitnessDropdownOpen, setIsFitnessDropdownOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const fitnessDropdownRef = useRef(null)

  const fitnessLevels = [
    { value: 'level1', label: '등산 3회 이하' },
    { value: 'level2', label: '왕복 2시간 이상 등산 가능' },
    { value: 'level3', label: '왕복 3시간 이상 등산 가능 / 등산 경험 10회 전후' },
    { value: 'level4', label: '왕복 5시간 이상 등산 가능 / 1,000m 이상 경험 있음' },
    { value: 'level5', label: '왕복 6시간 이상 등산 가능 / 1,000m 이상 경험 많음' },
    { value: 'level6', label: '장시간 등산가능 / 종주 경험 有' }
  ]

  const selectedFitnessLabel = fitnessLevels.find(level => level.value === formData.fitnessLevel)?.label || '선택하세요'

  useEffect(() => {
    // 로그인 상태 확인
    const token = localStorage.getItem('token')
    const userData = localStorage.getItem('user')

    if (!token || !userData) {
      alert('로그인이 필요합니다.')
      navigate('/login', { replace: true })
      return
    }

    // 사용자 정보 로드
    const loadUserData = async () => {
      try {
        const parsedUser = JSON.parse(userData)
        
        // 사용자 정보를 폼에 설정
        setFormData({
          name: parsedUser.name || '',
          password: '',
          confirmPassword: '',
          gender: parsedUser.gender || '',
          fitnessLevel: parsedUser.fitnessLevel || '',
          birthYear: parsedUser.birthYear || '',
          phone: parsedUser.phone || '',
          profileImage: null
        })
        
        // 프로필 이미지 미리보기 설정
        if (parsedUser.profileImage) {
          if (parsedUser.profileImage.startsWith('http')) {
            setProfileImagePreview(parsedUser.profileImage)
          } else {
            setProfileImagePreview(`${API_URL}${parsedUser.profileImage}`)
          }
        }
      } catch (error) {
        console.error('사용자 정보 파싱 오류:', error)
        alert('사용자 정보를 불러올 수 없습니다.')
        navigate('/mypage', { replace: true })
      }
    }

    loadUserData()
  }, [navigate])

  const handleChange = (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setFormData({
      ...formData,
      [e.target.name]: value
    })
  }

  const handlePhoneChange = (e) => {
    let value = e.target.value.replace(/[^0-9]/g, '')
    
    // 하이픈 자동 추가
    if (value.length > 3 && value.length <= 7) {
      value = value.slice(0, 3) + '-' + value.slice(3)
    } else if (value.length > 7) {
      value = value.slice(0, 3) + '-' + value.slice(3, 7) + '-' + value.slice(7, 11)
    }
    
    setFormData({
      ...formData,
      phone: value
    })
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setFormData({
        ...formData,
        profileImage: file
      })
      setProfileImageName(file.name)
      
      // 미리보기 생성
      const reader = new FileReader()
      reader.onloadend = () => {
        setProfileImagePreview(reader.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorMessage('')
    
    // 비밀번호가 입력된 경우에만 검증
    if (formData.password) {
      if (formData.password.length < 6) {
        alert('비밀번호는 최소 6자 이상이어야 합니다.')
        setIsLoading(false)
        return
      }
      
      if (formData.password !== formData.confirmPassword) {
        alert('비밀번호가 일치하지 않습니다.')
        setIsLoading(false)
        return
      }
    }
    
    try {
      const token = localStorage.getItem('token')
      
      // FormData 생성 (파일 업로드를 위해)
      const submitData = new FormData()
      submitData.append('name', formData.name || '')
      if (formData.password) {
        submitData.append('password', formData.password)
      }
      submitData.append('gender', formData.gender || '')
      submitData.append('fitnessLevel', formData.fitnessLevel || '')
      submitData.append('birthYear', formData.birthYear ? formData.birthYear.toString() : '')
      submitData.append('phone', formData.phone || '')
      
      if (formData.profileImage) {
        submitData.append('profileImage', formData.profileImage)
      }
      
      const apiUrl = `${API_URL}/api/auth/update`
      console.log('API URL:', apiUrl)
      console.log('API_URL value:', API_URL)
      
      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: submitData
      })
      
      let data
      try {
        data = await response.json()
      } catch (e) {
        console.error('JSON 파싱 오류:', e)
        data = { error: '서버 응답을 파싱할 수 없습니다.' }
      }
      
      if (response.ok) {
        // 업데이트된 사용자 정보를 localStorage에 저장
        if (data.user) {
          localStorage.setItem('user', JSON.stringify(data.user))
        }
        alert('회원정보가 수정되었습니다.')
        navigate('/mypage')
      } else {
        const errorMsg = data.error || data.message || '회원정보 수정 중 오류가 발생했습니다.'
        setErrorMessage(errorMsg)
        alert(errorMsg)
      }
    } catch (error) {
      console.error('회원정보 수정 오류:', error)
      setErrorMessage('서버 오류가 발생했습니다.')
      alert('서버 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleFitnessLevelSelect = (value) => {
    setFormData({
      ...formData,
      fitnessLevel: value
    })
    setIsFitnessDropdownOpen(false)
  }

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (fitnessDropdownRef.current && !fitnessDropdownRef.current.contains(event.target)) {
        setIsFitnessDropdownOpen(false)
      }
    }

    if (isFitnessDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isFitnessDropdownOpen])

  return (
    <div className="mypage-page">
      <Header />
      <main className="mypage-main">
        <div className="mypage-container">
          <h1 className="mypage-title">회원수정</h1>
          
          <form onSubmit={handleSubmit} className="signup-form">
            <div className="form-field">
              <label htmlFor="name" className="form-label">이름/닉네임</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="form-input"
                placeholder="이름 또는 닉네임을 입력해주세요."
              />
            </div>

            <div className="form-field">
              <label htmlFor="password" className="form-label">비밀번호 (변경 시에만 입력)</label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                autoComplete="new-password"
                className="form-input"
                placeholder="변경할 비밀번호를 입력해주세요. (6자 이상)"
              />
            </div>

            {formData.password && (
              <div className="form-field">
                <label htmlFor="confirmPassword" className="form-label">비밀번호 확인</label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                  className="form-input"
                  placeholder="비밀번호를 다시 입력해주세요."
                />
              </div>
            )}

            <div className="form-field">
              <label htmlFor="gender" className="form-label">성별</label>
              <select
                id="gender"
                name="gender"
                value={formData.gender}
                onChange={handleChange}
                required
                className="form-input"
              >
                <option value="">선택하세요</option>
                <option value="male">남성</option>
                <option value="female">여성</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="fitnessLevel" className="form-label">등력</label>
              <div className="fitness-dropdown-wrapper" ref={fitnessDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsFitnessDropdownOpen(!isFitnessDropdownOpen)}
                  className={`form-input fitness-dropdown-trigger ${isFitnessDropdownOpen ? 'open' : ''}`}
                >
                  {selectedFitnessLabel}
                  <span className="dropdown-arrow">▼</span>
                </button>
                {isFitnessDropdownOpen && (
                  <div className="fitness-dropdown">
                    {fitnessLevels.map((level) => (
                      <div
                        key={level.value}
                        onClick={() => handleFitnessLevelSelect(level.value)}
                        className={`fitness-option ${formData.fitnessLevel === level.value ? 'selected' : ''}`}
                      >
                        {level.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="birthYear" className="form-label">출생년도</label>
              <input
                type="number"
                id="birthYear"
                name="birthYear"
                value={formData.birthYear}
                onChange={handleChange}
                required
                className="form-input"
                placeholder="출생년도를 입력해주세요. (예: 1990)"
                min="1900"
                max={new Date().getFullYear()}
              />
            </div>

            <div className="form-field">
              <label htmlFor="phone" className="form-label">전화번호 (선택)</label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handlePhoneChange}
                className="form-input"
                placeholder="전화번호를 입력해주세요. (예: 010-1234-5678)"
                maxLength="13"
              />
            </div>

            <div className="form-field">
              <label htmlFor="profileImage" className="form-label">프로필 이미지 (선택)</label>
              <div className="profile-image-upload">
                {profileImagePreview && (
                  <div className="profile-image-preview">
                    <img src={profileImagePreview} alt="프로필 미리보기" />
                  </div>
                )}
                <div className="file-input-wrapper">
                  <input
                    type="file"
                    id="profileImage"
                    name="profileImage"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="file-input"
                  />
                  <label htmlFor="profileImage" className="file-input-label">
                    {profileImageName || '이미지 선택'}
                  </label>
                </div>
              </div>
            </div>

            {errorMessage && (
              <div className="error-message" style={{ color: '#e74c3c', marginTop: '16px', textAlign: 'center', fontSize: '0.9rem' }}>{errorMessage}</div>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '40px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => navigate('/mypage')}
                className="edit-profile-cancel-btn"
                disabled={isLoading}
              >
                취소
              </button>
              <button
                type="submit"
                className="edit-profile-submit-btn"
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

export default EditProfile

