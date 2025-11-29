import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import './Signup.css'

function Signup() {
  const [formData, setFormData] = useState({
    id: '',
    password: '',
    confirmPassword: '',
    gender: '',
    fitnessLevel: '',
    phone: '',
    verificationCode: '',
    birthYear: '',
    termsAgreed: false
  })
  const [isCodeSent, setIsCodeSent] = useState(false)
  const [isFitnessDropdownOpen, setIsFitnessDropdownOpen] = useState(false)
  const [isIdChecked, setIsIdChecked] = useState(false)
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
    setFormData({
      ...formData,
      [e.target.name]: value
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    // 회원가입 로직 구현
    console.log('Signup:', formData)
    // TODO: API 호출하여 회원가입 처리
    // 성공 시 로그인 페이지로 이동
    // navigate('/login')
  }

  const handleSocialLogin = (provider) => {
    console.log(`Social login with ${provider}`)
    // TODO: 소셜 로그인 구현
  }

  const handleCheckIdDuplicate = () => {
    if (!formData.id) {
      alert('ID를 입력해주세요.')
      return
    }
    // TODO: ID 중복체크 API 호출
    console.log('ID 중복체크:', formData.id)
    // 실제 구현 시 API 호출 후 결과에 따라 처리
    setIsIdChecked(true)
    alert('사용 가능한 ID입니다.')
    // 중복인 경우: alert('이미 사용 중인 ID입니다.')
  }

  const handleSendVerificationCode = () => {
    if (!formData.phone) {
      alert('휴대폰 번호를 입력해주세요.')
      return
    }
    // TODO: 인증번호 전송 API 호출
    console.log('인증번호 전송:', formData.phone)
    setIsCodeSent(true)
    // 실제 구현 시 API 호출 후 성공 시 setIsCodeSent(true)
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
            </div>

            <div className="form-group">
              <label htmlFor="password">비밀번호</label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
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
              <label htmlFor="phone">휴대폰 번호</label>
              <div className="phone-input-group">
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="010-1234-5678"
                  required
                  className="form-input phone-input"
                />
                <button
                  type="button"
                  onClick={handleSendVerificationCode}
                  className="verify-btn"
                >
                  인증번호 전송
                </button>
              </div>
            </div>

            {isCodeSent && (
              <div className="form-group">
                <label htmlFor="verificationCode">인증번호</label>
                <input
                  type="text"
                  id="verificationCode"
                  name="verificationCode"
                  value={formData.verificationCode}
                  onChange={handleChange}
                  placeholder="인증번호를 입력하세요"
                  required
                  className="form-input"
                />
              </div>
            )}

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

            <button type="submit" className="signup-submit-btn">
              회원가입
            </button>
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

