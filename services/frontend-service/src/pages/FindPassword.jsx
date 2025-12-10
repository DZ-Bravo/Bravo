import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import './FindPassword.css'

function FindPassword() {
  const [id, setId] = useState('')
  const [email, setEmail] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [isCodeSent, setIsCodeSent] = useState(false)
  const [isEmailVerified, setIsEmailVerified] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isPasswordChanged, setIsPasswordChanged] = useState(false)
  const [timeLeft, setTimeLeft] = useState(300) // 5분 = 300초

  const handleEmailChange = (e) => {
    const value = e.target.value
    setEmail(value)
    setErrorMessage('')
    setIsCodeSent(false)
    setIsEmailVerified(false)
    setVerificationCode('')
  }

  const handleSendCode = async () => {
    if (!id.trim()) {
      setErrorMessage('ID를 입력해주세요.')
      return
    }

    if (!email) {
      setErrorMessage('이메일을 입력해주세요.')
      return
    }

    if (!email.includes('@')) {
      setErrorMessage('올바른 이메일 형식을 입력해주세요.')
      return
    }

    setIsLoading(true)
    setErrorMessage('')

    try {
      const response = await fetch(`${API_URL}/api/auth/send-email-verification-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: id.trim(), email })
      })

      const data = await response.json()

      if (response.ok) {
        setIsCodeSent(true)
        setTimeLeft(300) // 5분 타이머 시작
        alert('인증번호가 전송되었습니다. 이메일을 확인해주세요.')
        if (data.code) {
          console.log('인증번호:', data.code)
          alert(`인증번호: ${data.code}\n\n(테스트 모드에서는 이메일 전송이 제한될 수 있습니다.)`)
        }
      } else {
        setErrorMessage(data.error || '인증번호 전송에 실패했습니다.')
      }
    } catch (error) {
      console.error('인증번호 전송 오류:', error)
      setErrorMessage('서버 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyCode = async () => {
    if (!verificationCode) {
      setErrorMessage('인증번호를 입력해주세요.')
      return
    }

    setIsLoading(true)
    setErrorMessage('')

    try {
      const response = await fetch(`${API_URL}/api/auth/verify-email-code-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: id.trim(),
          email,
          verificationCode
        })
      })

      const data = await response.json()

      if (response.ok && data.verified) {
        setIsEmailVerified(true)
        alert('이메일 인증이 완료되었습니다. 비밀번호를 변경해주세요.')
      } else {
        setErrorMessage(data.error || '인증번호가 일치하지 않습니다.')
      }
    } catch (error) {
      console.error('인증번호 검증 오류:', error)
      setErrorMessage('서버 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      setErrorMessage('비밀번호는 최소 6자 이상이어야 합니다.')
      return
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('비밀번호가 일치하지 않습니다.')
      return
    }

    setIsLoading(true)
    setErrorMessage('')

    try {
      const response = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: id.trim(),
          email,
          newPassword
        })
      })

      const data = await response.json()

      if (response.ok) {
        setIsPasswordChanged(true)
        alert('비밀번호가 성공적으로 변경되었습니다. 로그인해주세요.')
      } else {
        setErrorMessage(data.error || '비밀번호 변경에 실패했습니다.')
      }
    } catch (error) {
      console.error('비밀번호 변경 오류:', error)
      setErrorMessage('서버 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsLoading(false)
    }
  }

  // 5분 타이머
  useEffect(() => {
    if (isCodeSent && timeLeft > 0 && !isEmailVerified) {
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            setIsCodeSent(false)
            setVerificationCode('')
            setErrorMessage('인증번호가 만료되었습니다. 다시 요청해주세요.')
            return 0
          }
          return prev - 1
        })
      }, 1000)

      return () => clearInterval(timer)
    }
  }, [isCodeSent, timeLeft, isEmailVerified])

  // 시간 포맷팅 (MM:SS)
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="find-password-page">
      <Header hideNav={true} />
      <main className="find-password-main">
        <div className="find-password-container">
          <h1 className="find-password-title">비밀번호 찾기</h1>

          {isPasswordChanged ? (
            <div className="result-container">
              <div className="result-success">
                <div className="success-icon">✓</div>
                <h2 className="result-title">비밀번호가 변경되었습니다</h2>
                <div className="result-actions">
                  <Link to="/login" className="btn-primary">
                    로그인
                  </Link>
                  <button
                    onClick={() => {
                      setIsPasswordChanged(false)
                      setId('')
                      setEmail('')
                      setVerificationCode('')
                      setIsCodeSent(false)
                      setIsEmailVerified(false)
                      setNewPassword('')
                      setConfirmPassword('')
                    }}
                    className="btn-secondary"
                  >
                    다시 찾기
                  </button>
                  <Link to="/find-id" className="btn-secondary">
                    아이디 찾기
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="find-password-form">
              <div className="form-field">
                <label htmlFor="id" className="form-label">아이디</label>
                <input
                  type="text"
                  id="id"
                  name="id"
                  value={id}
                  onChange={(e) => {
                    setId(e.target.value)
                    setErrorMessage('')
                    setIsEmailVerified(false)
                  }}
                  placeholder="아이디를 입력해주세요."
                  className="form-input"
                  disabled={isEmailVerified}
                />
              </div>

              <div className="form-field">
                <label htmlFor="email" className="form-label">이메일</label>
                <div className="phone-input-wrapper">
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={email}
                    onChange={handleEmailChange}
                    placeholder="이메일을 입력해 주세요."
                    className="form-input phone-input"
                    disabled={isEmailVerified}
                  />
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={isLoading || !id.trim() || !email || !email.includes('@') || isEmailVerified}
                    className="send-code-btn"
                  >
                    인증번호전송
                  </button>
                </div>
              </div>

              {isCodeSent && !isEmailVerified && (
                <div className="form-field">
                  <div className="verification-code-wrapper">
                    <input
                      type="text"
                      value={verificationCode}
                      onChange={(e) => {
                        setVerificationCode(e.target.value.replace(/[^0-9]/g, ''))
                        setErrorMessage('')
                      }}
                      placeholder="인증번호 입력"
                      maxLength="6"
                      className="form-input verification-code-input"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !isLoading && verificationCode) {
                          handleVerifyCode()
                        }
                      }}
                    />
                    <div className="timer-display">
                      {formatTime(timeLeft)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleVerifyCode}
                    disabled={isLoading || !verificationCode}
                    className="verify-code-btn"
                    style={{ marginTop: '8px', width: '100%' }}
                  >
                    인증 확인
                  </button>
                </div>
              )}

              {isEmailVerified && (
                <>
                  <div className="form-field">
                    <div className="verification-success">
                      ✓ 이메일 인증이 완료되었습니다.
                    </div>
                  </div>
                  <div className="form-field">
                    <label htmlFor="newPassword" className="form-label">새 비밀번호</label>
                    <input
                      type="password"
                      id="newPassword"
                      name="newPassword"
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value)
                        setErrorMessage('')
                      }}
                      placeholder="새 비밀번호를 입력해주세요. (최소 6자)"
                      className="form-input"
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="confirmPassword" className="form-label">새 비밀번호 확인</label>
                    <input
                      type="password"
                      id="confirmPassword"
                      name="confirmPassword"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value)
                        setErrorMessage('')
                      }}
                      placeholder="새 비밀번호를 다시 입력해주세요."
                      className="form-input"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleChangePassword}
                    disabled={isLoading || !newPassword || !confirmPassword}
                    className="verify-btn"
                  >
                    비밀번호 변경
                  </button>
                </>
              )}

              {errorMessage && (
                <div className="error-message">{errorMessage}</div>
              )}
            </div>
          )}

          {!isPasswordChanged && (
            <div className="auth-links">
              <Link to="/login" className="auth-link">로그인</Link>
              <Link to="/find-id" className="auth-link">아이디 찾기</Link>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default FindPassword

