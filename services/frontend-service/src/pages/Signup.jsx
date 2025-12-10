import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import './Signup.css'

function Signup() {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    password: '',
    confirmPassword: '',
    email: '',
    gender: '',
    fitnessLevel: '',
    birthYear: '',
    phone: '',
    profileImage: null,
    termsAgreed: false
  })
  const [profileImageName, setProfileImageName] = useState('')
  const [isFitnessDropdownOpen, setIsFitnessDropdownOpen] = useState(false)
  const [isIdChecked, setIsIdChecked] = useState(false)
  const [isNameChecked, setIsNameChecked] = useState(false)
  const [isEmailVerified, setIsEmailVerified] = useState(false)
  const [emailVerificationCode, setEmailVerificationCode] = useState('')
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [nameErrorMessage, setNameErrorMessage] = useState('')
  const [emailErrorMessage, setEmailErrorMessage] = useState('')
  const fitnessDropdownRef = useRef(null)
  const navigate = useNavigate()

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
    const name = e.target.name
    
    setFormData({
      ...formData,
      [name]: value
    })
    
    // 이름 변경 시 중복체크 상태 초기화
    if (name === 'name') {
      setIsNameChecked(false)
      setNameErrorMessage('')
    }
    
    // 이메일 변경 시 검증 및 인증 상태 초기화
    if (name === 'email') {
      validateEmail(value)
      setIsEmailVerified(false)
      setEmailVerificationCode('')
    }
  }
  
  const validateEmail = (email) => {
    if (email && !email.includes('@')) {
      setEmailErrorMessage('올바른 이메일 형식을 적으세요.')
    } else {
      setEmailErrorMessage('')
    }
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
    
    // 이름/닉네임 중복체크 확인
    if (!isNameChecked) {
      alert('이름/닉네임 중복체크를 먼저 해주세요.')
      setIsLoading(false)
      return
    }
    
    // 이메일 필수 검증
    if (!formData.email || !formData.email.trim()) {
      alert('이메일을 입력하고 인증받아주세요.')
      setIsLoading(false)
      return
    }
    
    // 이메일 형식 검증
    if (!formData.email.includes('@')) {
      alert('올바른 이메일 형식을 입력해주세요.')
      setIsLoading(false)
      return
    }
    
    // 이메일 인증 확인 (필수)
    if (!isEmailVerified) {
      alert('이메일 인증을 완료해주세요.')
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
      submitData.append('email', formData.email || '')
      submitData.append('gender', formData.gender || '')
      submitData.append('fitnessLevel', formData.fitnessLevel || '')
      submitData.append('birthYear', formData.birthYear ? formData.birthYear.toString() : '')
      submitData.append('phone', formData.phone || '')
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
    // 백엔드 OAuth 시작 엔드포인트로 리다이렉트
    window.location.href = `${API_URL}/api/auth/${provider}`
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

  const handleCheckNameDuplicate = async () => {
    if (!formData.name) {
      alert('이름/닉네임을 입력해주세요.')
      return
    }
    
    try {
      const response = await fetch(`${API_URL}/api/auth/check-name`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: formData.name })
      })
      
      if (!response.ok && response.status === 0) {
        throw new Error('백엔드 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.')
      }
      
      const data = await response.json()
      
      if (response.ok && data.available) {
        setIsNameChecked(true)
        setNameErrorMessage('')
        alert('사용 가능한 이름/닉네임입니다.')
      } else {
        setIsNameChecked(false)
        const errorMsg = data.error || '이미 사용 중인 아이디입니다.'
        setNameErrorMessage(errorMsg)
        alert(errorMsg)
      }
    } catch (error) {
      console.error('이름/닉네임 중복체크 오류:', error)
      setIsNameChecked(false)
      let errorMsg = '서버에 연결할 수 없습니다.'
      if (error.message.includes('Failed to fetch') || error.message.includes('ERR_EMPTY_RESPONSE')) {
        errorMsg = '백엔드 서버에 연결할 수 없습니다.\n\n백엔드 서버가 실행 중인지 확인해주세요:\n- Docker: docker-compose up backend\n- 직접 실행: cd backend && npm start'
      } else {
        errorMsg = error.message || errorMsg
      }
      setNameErrorMessage(errorMsg)
      alert(errorMsg)
    }
  }

  const handleSendEmailVerification = async () => {
    if (!formData.email) {
      alert('이메일을 입력해주세요.')
      return
    }
    
    if (!formData.email.includes('@')) {
      alert('올바른 이메일 형식을 입력해주세요.')
      return
    }
    
    setIsSendingEmail(true)
    setEmailErrorMessage('')
    
    try {
      const response = await fetch(`${API_URL}/api/auth/send-email-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: formData.email })
      })
      
      if (!response.ok && response.status === 0) {
        throw new Error('백엔드 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.')
      }
      
      const data = await response.json()
      
      if (response.ok) {
        alert('인증번호가 전송되었습니다. 이메일을 확인해주세요.')
        if (data.code) {
          console.log('개발 모드 인증번호:', data.code)
        }
      } else {
        const errorMsg = data.error || '이메일 전송에 실패했습니다.'
        setEmailErrorMessage(errorMsg)
        alert(errorMsg)
      }
    } catch (error) {
      console.error('이메일 인증번호 전송 오류:', error)
      let errorMsg = '서버에 연결할 수 없습니다.'
      if (error.message.includes('Failed to fetch') || error.message.includes('ERR_EMPTY_RESPONSE')) {
        errorMsg = '백엔드 서버에 연결할 수 없습니다.\n\n백엔드 서버가 실행 중인지 확인해주세요.'
      } else {
        errorMsg = error.message || errorMsg
      }
      setEmailErrorMessage(errorMsg)
      alert(errorMsg)
    } finally {
      setIsSendingEmail(false)
    }
  }

  const handleVerifyEmailCode = async () => {
    if (!formData.email) {
      alert('이메일을 입력해주세요.')
      return
    }
    
    if (!emailVerificationCode) {
      alert('인증번호를 입력해주세요.')
      return
    }
    
    try {
      const response = await fetch(`${API_URL}/api/auth/verify-email-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          email: formData.email,
          verificationCode: emailVerificationCode
        })
      })
      
      if (!response.ok && response.status === 0) {
        throw new Error('백엔드 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.')
      }
      
      const data = await response.json()
      
      if (response.ok && data.verified) {
        setIsEmailVerified(true)
        setEmailErrorMessage('')
        alert('이메일 인증이 완료되었습니다.')
      } else {
        setIsEmailVerified(false)
        const errorMsg = data.error || '인증번호가 일치하지 않습니다.'
        setEmailErrorMessage(errorMsg)
        alert(errorMsg)
      }
    } catch (error) {
      console.error('이메일 인증번호 검증 오류:', error)
      setIsEmailVerified(false)
      let errorMsg = '서버에 연결할 수 없습니다.'
      if (error.message.includes('Failed to fetch') || error.message.includes('ERR_EMPTY_RESPONSE')) {
        errorMsg = '백엔드 서버에 연결할 수 없습니다.\n\n백엔드 서버가 실행 중인지 확인해주세요.'
      } else {
        errorMsg = error.message || errorMsg
      }
      setEmailErrorMessage(errorMsg)
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
      <Header hideNav={true} />
      <main className="signup-main">
        <div className="signup-container">
          <h1 className="signup-title">회원가입</h1>
          
          <form onSubmit={handleSubmit} className="signup-form">
            <div className="form-field">
              <label htmlFor="id" className="form-label">아이디</label>
              <div className="id-input-wrapper">
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
                  placeholder="아이디를 입력해주세요."
                />
                <button
                  type="button"
                  onClick={handleCheckIdDuplicate}
                  className="duplicate-check-btn"
                >
                  중복체크
                </button>
              </div>
              {isIdChecked && (
                <span className="id-check-message">✓ 사용 가능한 ID입니다</span>
              )}
              {errorMessage && !isIdChecked && formData.id && (
                <span className="id-check-message error">{errorMessage}</span>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="password" className="form-label">비밀번호</label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                autoComplete="new-password"
                required
                className="form-input"
                placeholder="비밀번호를 입력해주세요."
              />
            </div>

            <div className="form-field">
              <label htmlFor="confirmPassword" className="form-label">비밀번호 확인</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                autoComplete="new-password"
                required
                className="form-input"
                placeholder="비밀번호를 다시 입력해주세요."
              />
            </div>

            <div className="form-field">
              <label htmlFor="email" className="form-label">이메일</label>
              <div className="id-input-wrapper">
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={(e) => {
                    handleChange(e)
                    setIsEmailVerified(false)
                    setEmailVerificationCode('')
                  }}
                  className="form-input id-input"
                  placeholder="이메일을 입력해주세요."
                />
                <button
                  type="button"
                  onClick={handleSendEmailVerification}
                  className="duplicate-check-btn"
                  disabled={isSendingEmail}
                >
                  {isSendingEmail ? '전송중...' : '인증'}
                </button>
              </div>
              {isEmailVerified && (
                <span className="id-check-message">✓ 이메일 인증이 완료되었습니다</span>
              )}
              {emailErrorMessage && !isEmailVerified && (
                <span className="id-check-message error">{emailErrorMessage}</span>
              )}
              {!isEmailVerified && formData.email && (
                <div style={{ marginTop: '8px' }}>
                  <div className="id-input-wrapper" style={{ marginTop: '4px' }}>
                    <input
                      type="text"
                      value={emailVerificationCode}
                      onChange={(e) => setEmailVerificationCode(e.target.value)}
                      className="form-input id-input"
                      placeholder="인증번호를 입력해주세요."
                      maxLength="6"
                    />
                    <button
                      type="button"
                      onClick={handleVerifyEmailCode}
                      className="duplicate-check-btn"
                    >
                      확인
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="name" className="form-label">이름/닉네임</label>
              <div className="id-input-wrapper">
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={(e) => {
                    handleChange(e)
                    setIsNameChecked(false)
                  }}
                  required
                  className="form-input id-input"
                  placeholder="이름 또는 닉네임을 입력해주세요."
                />
                <button
                  type="button"
                  onClick={handleCheckNameDuplicate}
                  className="duplicate-check-btn"
                >
                  중복체크
                </button>
              </div>
              {isNameChecked && (
                <span className="id-check-message">✓ 사용 가능한 이름/닉네임입니다</span>
              )}
              {nameErrorMessage && !isNameChecked && formData.name && (
                <span className="id-check-message error">{nameErrorMessage}</span>
              )}
            </div>

            <div className="form-field">
              <label className="form-label">성별</label>
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

            <div className="form-field">
              <label className="form-label">등력</label>
              <div className="fitness-dropdown-container" ref={fitnessDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsFitnessDropdownOpen(!isFitnessDropdownOpen)}
                  className={`fitness-dropdown-trigger ${formData.fitnessLevel ? 'selected' : ''}`}
                >
                  {formData.fitnessLevel ? selectedFitnessLabel : '등력을 선택해 주세요.'}
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

            <div className="form-field">
              <label htmlFor="phone" className="form-label">휴대폰 번호 (선택사항)</label>
              <input
                type="text"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handlePhoneChange}
                placeholder="휴대폰 번호를 입력해 주세요. (선택사항)"
                maxLength="13"
                className="form-input"
              />
            </div>

            <div className="form-field">
              <label htmlFor="birthYear" className="form-label">출생년도</label>
              <select
                id="birthYear"
                name="birthYear"
                value={formData.birthYear}
                onChange={handleChange}
                required
                className="form-input"
              >
                <option value="">몇 년도에 태어나셨나요?</option>
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

            <div className="form-field">
              <label className="form-label">프로필 사진</label>
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

            <div className="terms-section">
              <div className="terms-link">
                이용약관 <Link to="#" className="terms-view-link">[보기]</Link>
              </div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="termsAgreed"
                  checked={formData.termsAgreed}
                  onChange={handleChange}
                  required
                />
                <span>모두 동의합니다</span>
              </label>
            </div>

            <button type="submit" className="signup-submit-btn" disabled={isLoading}>
              {isLoading ? '처리 중...' : '가입하기'}
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
                <img src="/images/login_naver_icon.png" alt="네이버 가입" />
              </button>
              <button
                type="button"
                className="social-btn social-kakao"
                onClick={() => handleSocialLogin('kakao')}
                aria-label="카카오로 가입"
              >
                <img src="/images/login_kakao_icon.png" alt="카카오 가입" />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default Signup

