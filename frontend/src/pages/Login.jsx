import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import './Login.css'

function Login() {
  const [formData, setFormData] = useState({
    id: '',
    password: ''
  })
  const navigate = useNavigate()

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    // 로그인 로직 구현
    console.log('Login:', formData)
    // TODO: API 호출하여 로그인 처리
    // 성공 시 홈 페이지로 이동
    // navigate('/')
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
                required
                className="form-input"
              />
            </div>

            <button type="submit" className="login-submit-btn">
              로그인
            </button>
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

