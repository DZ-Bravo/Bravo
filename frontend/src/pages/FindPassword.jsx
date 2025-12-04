import { useState } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import './FindPassword.css'

function FindPassword() {
  const [id, setId] = useState('')
  const [phone, setPhone] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [isCodeSent, setIsCodeSent] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [tempPassword, setTempPassword] = useState(null)

  const handlePhoneChange = (e) => {
    let value = e.target.value.replace(/[^0-9]/g, '')
    
    // 하이픈 자동 추가
    if (value.length > 3 && value.length <= 7) {
      value = value.slice(0, 3) + '-' + value.slice(3)
    } else if (value.length > 7) {
      value = value.slice(0, 3) + '-' + value.slice(3, 7) + '-' + value.slice(7, 11)
    }
    
    setPhone(value)
    setErrorMessage('')
    setTempPassword(null)
  }

  const handleSendCode = async () => {
    if (!id.trim()) {
      setErrorMessage('ID를 입력해주세요.')
      return
    }

    if (!phone || phone.length < 10) {
      setErrorMessage('올바른 휴대폰 번호를 입력해주세요.')
      return
    }

    setIsLoading(true)
    setErrorMessage('')

    try {
      const response = await fetch(`${API_URL}/api/auth/send-verification-code-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: id.trim(), phone })
      })

      const data = await response.json()

      if (response.ok) {
        setIsCodeSent(true)
        alert('인증번호가 전송되었습니다.')
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
      const response = await fetch(`${API_URL}/api/auth/find-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: id.trim(),
          phone,
          verificationCode
        })
      })

      const data = await response.json()

      if (response.ok) {
        setTempPassword(data.tempPassword)
        alert('임시 비밀번호가 발급되었습니다. 로그인 후 비밀번호를 변경해주세요.')
      } else {
        setErrorMessage(data.error || '인증번호가 일치하지 않거나 비밀번호를 찾을 수 없습니다.')
      }
    } catch (error) {
      console.error('비밀번호 찾기 오류:', error)
      setErrorMessage('서버 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="find-password-page">
      <Header hideNav={true} />
      <main className="find-password-main">
        <div className="find-password-container">
          <h1 className="find-password-title">비밀번호 찾기</h1>

          {tempPassword ? (
            <div className="result-container">
              <div className="result-success">
                <div className="success-icon">✓</div>
                <h2 className="result-title">임시 비밀번호가 발급되었습니다</h2>
                <div className="temp-password-box">
                  <span className="temp-password-label">임시 비밀번호:</span>
                  <span className="temp-password-value">{tempPassword}</span>
                </div>
                <div className="warning-box">
                  <p className="warning-text">
                    ⚠️ 임시 비밀번호를 안전하게 보관하시고,<br />
                    로그인 후 반드시 비밀번호를 변경해주세요.
                  </p>
                </div>
                <div className="result-actions">
                  <Link to="/login" className="btn-primary">
                    로그인하기
                  </Link>
                  <button
                    onClick={() => {
                      setTempPassword(null)
                      setId('')
                      setPhone('')
                      setVerificationCode('')
                      setIsCodeSent(false)
                    }}
                    className="btn-secondary"
                  >
                    다시 찾기
                  </button>
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
                    setTempPassword(null)
                  }}
                  placeholder="아이디를 입력해주세요."
                  className="form-input"
                />
              </div>

              <div className="form-field">
                <label htmlFor="phone" className="form-label">휴대폰 번호</label>
                <div className="phone-input-wrapper">
                  <input
                    type="text"
                    id="phone"
                    name="phone"
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="휴대폰 번호를 입력해 주세요."
                    maxLength="13"
                    className="form-input phone-input"
                  />
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={isLoading || !id.trim() || !phone || phone.length < 10}
                    className="send-code-btn"
                  >
                    인증번호전송
                  </button>
                </div>
              </div>

              {isCodeSent && (
                <div className="form-field">
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
                </div>
              )}

              {errorMessage && (
                <div className="error-message">{errorMessage}</div>
              )}
            </div>
          )}

          <div className="auth-links">
            <Link to="/login" className="auth-link">로그인</Link>
            <Link to="/find-id" className="auth-link">아이디 찾기</Link>
          </div>
        </div>
      </main>
    </div>
  )
}

export default FindPassword

