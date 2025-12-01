import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import './Signup.css'

function Signup() {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    password: '',
    confirmPassword: '',
    gender: '',
    fitnessLevel: '',
    birthYear: '',
    profileImage: null,
    termsAgreed: false
  })
  const [profileImageName, setProfileImageName] = useState('')
  const [isFitnessDropdownOpen, setIsFitnessDropdownOpen] = useState(false)
  const [isIdChecked, setIsIdChecked] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const fitnessDropdownRef = useRef(null)
  const navigate = useNavigate()
  
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

  const fitnessLevels = [
    { value: 'level1', label: '등산 3회 이하' },
    { value: 'level2', label: '왕복 2시간 이상 등산 가능' },
    { value: 'level3', label: '왕복 3시간 이상 등산 가능 / 등산 경험 10회 전후' },
    { value: 'level4', label: '왕복 5시간 이상 등산 가능 / 1,000m 이상 경험 있음' },
    { value: 'level5', label: '왕복 6시간 이상 등산 가능 / 1,000m 이상 경험 많음' },
    { value: 'level6', label: '장시간 등산가능 / 종주 경험 有' }
  ]

  const selectedFitnessLabel = fitnessLevels.find(level => level.value === formData.fitnessLevel)?.label || '선택하세요'

  const handleChange = (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setFormData({
      ...formData,
      [e.target.name]: value
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
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorMessage('')
    
    // ID 중복체크 확인
    if (!isIdChecked) {
      alert('ID 중복체크를 먼저 해주세요.')
      setIsLoading(false)
      return
    }
    
    // 비밀번호 길이 검증
    if (formData.password.length < 6) {
      alert('비밀번호는 최소 6자 이상이어야 합니다.')
      setIsLoading(false)
      return
    }
    
    // 비밀번호 일치 확인
    if (formData.password !== formData.confirmPassword) {
      alert('비밀번호가 일치하지 않습니다.')
      setIsLoading(false)
      return
    }
    
    // 이용약관 동의 확인
    if (!formData.termsAgreed) {
      alert('이용약관에 동의해주세요.')
      setIsLoading(false)
      return
    }
    
    try {
      // 전송 전 값 확인
      console.log('전송할 데이터:', {
        id: formData.id,
        name: formData.name,
        gender: formData.gender,
        fitnessLevel: formData.fitnessLevel,
        birthYear: formData.birthYear,
        termsAgreed: formData.termsAgreed,
        hasPassword: !!formData.password,
        hasConfirmPassword: !!formData.confirmPassword
      })
      
      // FormData 생성 (파일 업로드를 위해)
      const submitData = new FormData()
      submitData.append('id', formData.id || '')
      submitData.append('name', formData.name || '')
      submitData.append('password', formData.password || '')
      submitData.append('confirmPassword', formData.confirmPassword || '')
      submitData.append('gender', formData.gender || '')
      submitData.append('fitnessLevel', formData.fitnessLevel || '')
      submitData.append('birthYear', formData.birthYear ? formData.birthYear.toString() : '')
      submitData.append('termsAgreed', formData.termsAgreed.toString())
      
      if (formData.profileImage) {
        submitData.append('profileImage', formData.profileImage)
      }
      
      // FormData 내용 확인 (디버깅용)
      for (let pair of submitData.entries()) {
        console.log(pair[0] + ': ' + (pair[0].includes('password') ? '***' : pair[1]))
      }
      
      const response = await fetch(`${API_URL}/api/auth/signup`, {
        method: 'POST',
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
        alert('회원가입이 완료되었습니다! 로그인해주세요.')
        navigate('/login')
      } else {
        const errorMsg = data.error || data.message || '회원가입 중 오류가 발생했습니다.'
        setErrorMessage(errorMsg)
        alert(errorMsg)
        console.error('회원가입 오류 응답:', {
          status: response.status,
          statusText: response.statusText,
          data: data
        })
      }
    } catch (error) {
      console.error('회원가입 오류:', error)
      setErrorMessage('서버 오류가 발생했습니다.')
      alert('서버 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSocialLogin = (provider) => {
    console.log(`Social login with ${provider}`)
    // TODO: 소셜 로그인 구현
  }

  const handleCheckIdDuplicate = async () => {
    if (!formData.id) {
      alert('ID를 입력해주세요.')
      return
    }
    
    try {
      const response = await fetch(`${API_URL}/api/auth/check-id`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: formData.id })
      })
      
      if (!response.ok && response.status === 0) {
        throw new Error('백엔드 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.')
      }
      
      const data = await response.json()
      
      if (response.ok && data.available) {
        setIsIdChecked(true)
        setErrorMessage('')
        alert('사용 가능한 ID입니다.')
      } else {
        setIsIdChecked(false)
        const errorMsg = data.error || '이미 사용 중인 ID입니다.'
        setErrorMessage(errorMsg)
        alert(errorMsg)
      }
    } catch (error) {
      console.error('ID 중복체크 오류:', error)
      setIsIdChecked(false)
      let errorMsg = '서버에 연결할 수 없습니다.'
      if (error.message.includes('Failed to fetch') || error.message.includes('ERR_EMPTY_RESPONSE')) {
        errorMsg = '백엔드 서버에 연결할 수 없습니다.\n\n백엔드 서버가 실행 중인지 확인해주세요:\n- Docker: docker-compose up backend\n- 직접 실행: cd backend && npm start'
      } else {
        errorMsg = error.message || errorMsg
      }
      setErrorMessage(errorMsg)
      alert(errorMsg)
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
    <div className="signup-page">
      <Header />
      <main className="signup-main">
        <div className="signup-container">
          <h1 className="signup-title">Hello! Today's Hike</h1>
          
          <form onSubmit={handleSubmit} className="signup-form">
            <div className="form-group">
              <label htmlFor="id">ID</label>
              <div className="id-input-group">
                <input
                  type="text"
                  id="id"
                  name="id"
                  value={formData.id}
                  onChange={(e) => {
                    handleChange(e)
                    setIsIdChecked(false)
                  }}
                  required
                  className="form-input id-input"
                />
                <button
                  type="button"
                  onClick={handleCheckIdDuplicate}
                  className="check-id-btn"
                >
                  중복체크
                </button>
              </div>
              {isIdChecked && (
                <span className="id-check-message">✓ 사용 가능한 ID입니다</span>
              )}
            {errorMessage && !isIdChecked && (
                <span className="id-check-message error">{errorMessage}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="password">비밀번호</label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                autoComplete="new-password"
                required
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">비밀번호 확인</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                autoComplete="new-password"
                required
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="name">이름/닉네임</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label>성별</label>
              <div className="radio-group">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="gender"
                    value="male"
                    checked={formData.gender === 'male'}
                    onChange={handleChange}
                    required
                  />
                  <span>남자</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="gender"
                    value="female"
                    checked={formData.gender === 'female'}
                    onChange={handleChange}
                    required
                  />
                  <span>여자</span>
                </label>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="fitnessLevel">등력</label>
              <div className="fitness-dropdown-container" ref={fitnessDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsFitnessDropdownOpen(!isFitnessDropdownOpen)}
                  className={`fitness-dropdown-trigger ${formData.fitnessLevel ? 'selected' : ''}`}
                >
                  {selectedFitnessLabel}
                </button>
                {isFitnessDropdownOpen && (
                  <div className="fitness-dropdown">
                    <div className="fitness-dropdown-header">
                      등력을 선택해 주세요
                    </div>
                    <div className="fitness-dropdown-list">
                      {fitnessLevels.map((level) => (
                        <div
                          key={level.value}
                          className={`fitness-dropdown-item ${formData.fitnessLevel === level.value ? 'selected' : ''}`}
                          onClick={() => handleFitnessLevelSelect(level.value)}
                        >
                          {level.label}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="birthYear">출생년도</label>
              <select
                id="birthYear"
                name="birthYear"
                value={formData.birthYear}
                onChange={handleChange}
                required
                className="form-input"
              >
                <option value="">선택하세요</option>
                {Array.from({ length: 100 }, (_, i) => {
                  const year = new Date().getFullYear() - i
                  return (
                    <option key={year} value={year}>
                      {year}년
                    </option>
                  )
                })}
              </select>
            </div>

            <div className="form-group">
              <label>프로필 사진 첨부</label>
              <div className="file-upload-group">
                <input
                  type="file"
                  id="profileImage"
                  name="profileImage"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="file-input"
                />
                <label htmlFor="profileImage" className="file-upload-btn">
                  파일첨부
                </label>
                {profileImageName && (
                  <span className="file-name">{profileImageName}</span>
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="termsAgreed"
                  checked={formData.termsAgreed}
                  onChange={handleChange}
                  required
                />
                <span>이용약관에 동의합니다</span>
              </label>
            </div>

            <button type="submit" className="signup-submit-btn" disabled={isLoading}>
              {isLoading ? '처리 중...' : '회원가입'}
            </button>
            {errorMessage && (
              <div className="error-message">{errorMessage}</div>
            )}
          </form>

          <div className="social-login">
            <h3 className="social-title">소셜 로그인으로 간편하게 가입하기</h3>
            <div className="social-buttons">
              <button
                type="button"
                className="social-btn social-naver"
                onClick={() => handleSocialLogin('naver')}
                aria-label="네이버로 가입"
              >
                N
              </button>
              <button
                type="button"
                className="social-btn social-kakao"
                onClick={() => handleSocialLogin('kakao')}
                aria-label="카카오로 가입"
              >
                K
              </button>
              <button
                type="button"
                className="social-btn social-google"
                onClick={() => handleSocialLogin('google')}
                aria-label="구글로 가입"
              >
                G
              </button>
            </div>
          </div>

          <div className="auth-links">
            <Link to="/find-id" className="auth-link">아이디 찾기</Link>
            <Link to="/find-password" className="auth-link">비밀번호 찾기</Link>
            <Link to="/login" className="auth-link">로그인</Link>
          </div>
        </div>
      </main>
    </div>
  )
}

export default Signup

