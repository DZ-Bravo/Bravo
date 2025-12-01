import { useState } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import './FindId.css'

function FindId() {
  const [phone, setPhone] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [isCodeSent, setIsCodeSent] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [foundId, setFoundId] = useState(null)

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
    setFoundId(null)
  }

  const handleSendCode = async () => {
    if (!phone || phone.length < 10) {
      setErrorMessage('올바른 휴대폰 번호를 입력해주세요.')
      return
    }

    setIsLoading(true)
    setErrorMessage('')

    try {
      const response = await fetch(`${API_URL}/api/auth/send-verification-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ phone })
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
      const response = await fetch(`${API_URL}/api/auth/find-id`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone,
          verificationCode
        })
      })

      const data = await response.json()

      if (response.ok) {
        setFoundId(data.id)
      } else {
        setErrorMessage(data.error || '인증번호가 일치하지 않거나 아이디를 찾을 수 없습니다.')
      }
    } catch (error) {
      console.error('아이디 찾기 오류:', error)
      setErrorMessage('서버 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="find-id-page">
      <Header />
      <main className="find-id-main">
        <div className="find-id-container">
          <h1 className="find-id-title">Find your ID</h1>

          {foundId ? (
            <div className="result-container">
              <div className="result-success">
                <div className="success-icon">✓</div>
                <h2 className="result-title">아이디를 찾았습니다</h2>
                <div className="found-id-box">
                  <span className="found-id-label">아이디:</span>
                  <span className="found-id-value">{foundId}</span>
                </div>
                <div className="result-actions">
                  <Link to="/login" className="btn-primary">
                    로그인하기
                  </Link>
                  <button
                    onClick={() => {
                      setFoundId(null)
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
            <div className="find-id-form">
              <div className="phone-group">
                <label htmlFor="phone" className="phone-label">휴대폰 번호</label>
                <div className="phone-input-group">
                  <input
                    type="text"
                    id="phone"
                    name="phone"
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="EX)010-1111-2222"
                    maxLength="13"
                    className="phone-input"
                  />
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={isLoading || !phone || phone.length < 10}
                    className="send-code-btn"
                  >
                    인증번호전송
                  </button>
                </div>
              </div>

              {isCodeSent && (
                <div className="verification-group">
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => {
                      setVerificationCode(e.target.value.replace(/[^0-9]/g, ''))
                      setErrorMessage('')
                    }}
                    placeholder="인증번호 입력"
                    maxLength="6"
                    className="verification-input"
                  />
                  <button
                    type="button"
                    onClick={handleVerifyCode}
                    disabled={isLoading || !verificationCode}
                    className="verify-btn"
                  >
                    확인
                  </button>
                </div>
              )}

              {errorMessage && (
                <div className="error-message">{errorMessage}</div>
              )}
            </div>
          )}

          <div className="auth-links">
            <Link to="/login" className="auth-link">로그인</Link>
            <Link to="/find-password" className="auth-link">비밀번호 찾기</Link>
          </div>
        </div>
      </main>
    </div>
  )
}

export default FindId

