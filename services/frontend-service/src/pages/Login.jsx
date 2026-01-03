import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import { login } from '../utils/cognito'
import './Login.css'

function Login() {
  const [formData, setFormData] = useState({
    id: '',
    password: ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const navigate = useNavigate()

  // URL 파라미터에서 에러 메시지 확인
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const error = urlParams.get('error')
    const message = urlParams.get('message')
    
    if (error) {
      let errorMsg = '소셜 로그인에 실패했습니다.'
      if (message) {
        errorMsg = decodeURIComponent(message)
      } else if (error === 'kakao_auth_failed') {
        errorMsg = '카카오 인증에 실패했습니다.'
      } else if (error === 'kakao_token_failed') {
        errorMsg = '카카오 토큰 요청에 실패했습니다.'
      } else if (error === 'kakao_user_info_failed') {
        errorMsg = '카카오 사용자 정보를 가져오는데 실패했습니다.'
      } else if (error === 'kakao_oauth_error') {
        errorMsg = '카카오 OAuth 오류가 발생했습니다.'
      } else if (error === 'naver_auth_failed') {
        errorMsg = '네이버 인증에 실패했습니다.'
      } else if (error === 'naver_token_failed') {
        errorMsg = '네이버 토큰 요청에 실패했습니다.'
      } else if (error === 'naver_user_info_failed') {
        errorMsg = '네이버 사용자 정보를 가져오는데 실패했습니다.'
      } else if (error === 'naver_oauth_error') {
        errorMsg = '네이버 OAuth 오류가 발생했습니다.'
      }
      
      setErrorMessage(errorMsg)
      alert(errorMsg)
      
      // URL에서 에러 파라미터 제거
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [])

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
      // 먼저 Cognito 로그인 시도
      let tokens = null
      try {
        tokens = await login(formData.id, formData.password)
        console.log('Cognito 로그인 성공')
      } catch (cognitoError) {
        console.log('Cognito 로그인 실패, 백엔드 API로 폴백:', cognitoError)
        // Cognito 로그인 실패 시 백엔드 API로 폴백
        // 백엔드는 Cognito 실패 시 MongoDB로 폴백하고, 성공 시 Cognito로 마이그레이션
        const response = await fetch(`${API_URL}/api/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            id: formData.id,
            password: formData.password
          })
        })
        
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || '로그인에 실패했습니다.')
        }
        
        const data = await response.json()
        
        // 백엔드 응답 형식에 따라 토큰 처리
        if (data.IdToken && data.AccessToken && data.RefreshToken) {
          // Cognito 토큰
          tokens = {
            idToken: data.IdToken,
            accessToken: data.AccessToken,
            refreshToken: data.RefreshToken
          }
        } else if (data.token) {
          // JWT 토큰 (하위 호환성)
          localStorage.setItem('token', data.token)
        }
        
        // 사용자 정보 저장
        if (data.user) {
          localStorage.setItem('user', JSON.stringify(data.user))
        }
      }
      
      // Cognito 토큰이 있으면 저장
      if (tokens) {
        localStorage.setItem('accessToken', tokens.accessToken)
        localStorage.setItem('idToken', tokens.idToken)
        localStorage.setItem('refreshToken', tokens.refreshToken)
        
        // 사용자 정보 가져오기 (백엔드 API 호출)
        try {
          const userResponse = await fetch(`${API_URL}/api/auth/me`, {
            headers: {
              'Authorization': `Bearer ${tokens.idToken}`
            }
          })
          
          if (userResponse.ok) {
            const userData = await userResponse.json()
            localStorage.setItem('user', JSON.stringify(userData.user))
          }
        } catch (userError) {
          console.warn('사용자 정보 가져오기 실패:', userError)
          // 사용자 정보 가져오기 실패해도 로그인은 계속 진행
        }
      }
      
      // 페이지 새로고침하여 Header 컴포넌트 업데이트
      window.location.href = '/'
    } catch (error) {
      console.error('로그인 오류:', error)
      let errorMsg = '로그인에 실패했습니다.'
      
      if (error.message) {
        errorMsg = error.message
      } else if (error.code === 'NotAuthorizedException') {
        errorMsg = 'ID 또는 비밀번호가 올바르지 않습니다.'
      } else if (error.code === 'UserNotConfirmedException') {
        errorMsg = '이메일 인증이 완료되지 않았습니다.'
      }
      
      setErrorMessage(errorMsg)
      alert(errorMsg)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSocialLogin = (provider) => {
    // 백엔드 OAuth 시작 엔드포인트로 리다이렉트
    window.location.href = `${API_URL}/api/auth/${provider}`
  }

  return (
    <div className="login-page">
      <Header hideNav={true} />
      <main className="login-main">
        <div className="login-container">
          <h1 className="login-title">로그인</h1>
          
          <form onSubmit={handleSubmit} className="login-form">
            <input
              type="text"
              id="id"
              name="id"
              value={formData.id}
              onChange={handleChange}
              required
              className="form-input"
              placeholder="아이디를 입력해주세요."
            />

            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              autoComplete="current-password"
              required
              className="form-input"
              placeholder="비밀번호를 입력해주세요."
            />

            <button type="submit" className="login-submit-btn" disabled={isLoading}>
              {isLoading ? '로그인 중...' : '로그인'}
            </button>
            {errorMessage && (
              <div className="error-message">{errorMessage}</div>
            )}
          </form>

          <Link to="/signup" className="signup-btn">
            회원가입
          </Link>

          <div className="auth-links">
            <Link to="/find-id" className="auth-link">아이디 찾기</Link>
            <Link to="/find-password" className="auth-link">비밀번호 찾기</Link>
          </div>

          <div className="social-login">
            <h3 className="social-title">소셜 간편 로그인</h3>
            <div className="social-buttons">
              <button
                type="button"
                className="social-btn social-naver"
                onClick={() => handleSocialLogin('naver')}
                aria-label="네이버로 로그인"
              >
                <img src="/images/login_naver_icon.png" alt="네이버 로그인" />
              </button>
              <button
                type="button"
                className="social-btn social-kakao"
                onClick={() => handleSocialLogin('kakao')}
                aria-label="카카오로 로그인"
              >
                <img src="/images/login_kakao_icon.png" alt="카카오 로그인" />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default Login

