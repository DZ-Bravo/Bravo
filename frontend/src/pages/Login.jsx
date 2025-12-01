import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import './Login.css'

function Login() {
  const [formData, setFormData] = useState({
    id: '',
    password: ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const navigate = useNavigate()
  
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorMessage('')
    
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      })
      
      const data = await response.json()
      
      if (response.ok) {
        // 토큰 저장
        localStorage.setItem('token', data.token)
        localStorage.setItem('user', JSON.stringify(data.user))
        
        // 페이지 새로고침하여 Header 컴포넌트 업데이트
        window.location.href = '/'
      } else {
        setErrorMessage(data.error || '로그인에 실패했습니다.')
        alert(data.error || 'ID 또는 비밀번호가 올바르지 않습니다.')
      }
    } catch (error) {
      console.error('로그인 오류:', error)
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

  return (
    <div className="login-page">
      <Header />
      <main className="login-main">
        <div className="login-container">
          <h1 className="login-title">Hello! Today's Hike</h1>
          
          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="id">ID</label>
              <input
                type="text"
                id="id"
                name="id"
                value={formData.id}
                onChange={handleChange}
                required
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">비밀번호</label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                autoComplete="current-password"
                required
                className="form-input"
              />
            </div>

            <button type="submit" className="login-submit-btn" disabled={isLoading}>
              {isLoading ? '로그인 중...' : '로그인'}
            </button>
            {errorMessage && (
              <div className="error-message">{errorMessage}</div>
            )}
          </form>

          <div className="social-login">
            <h3 className="social-title">소셜 로그인으로 간편하게 로그인하기</h3>
            <div className="social-buttons">
              <button
                type="button"
                className="social-btn social-naver"
                onClick={() => handleSocialLogin('naver')}
                aria-label="네이버로 로그인"
              >
                N
              </button>
              <button
                type="button"
                className="social-btn social-kakao"
                onClick={() => handleSocialLogin('kakao')}
                aria-label="카카오로 로그인"
              >
                K
              </button>
              <button
                type="button"
                className="social-btn social-google"
                onClick={() => handleSocialLogin('google')}
                aria-label="구글로 로그인"
              >
                G
              </button>
            </div>
          </div>

          <div className="auth-links">
            <Link to="/find-id" className="auth-link">아이디 찾기</Link>
            <Link to="/find-password" className="auth-link">비밀번호 찾기</Link>
            <Link to="/signup" className="auth-link">회원가입</Link>
          </div>
        </div>
      </main>
    </div>
  )
}

export default Login

