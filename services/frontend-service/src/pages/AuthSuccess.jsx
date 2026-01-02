import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getCurrentSession } from '../utils/cognito'
import { API_URL } from '../utils/api'

function AuthSuccess() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const processedRef = useRef(false)

  useEffect(() => {
    // 중복 처리 방지
    if (processedRef.current) {
      return
    }
    processedRef.current = true

    const token = searchParams.get('token') // 기존 JWT 토큰 (하위 호환성)
    const userStr = searchParams.get('user')
    const provider = searchParams.get('provider') // Cognito 소셜 로그인
    const username = searchParams.get('username') // Cognito 사용자명

    console.log('=== AuthSuccess 디버깅 ===')
    console.log('전체 URL:', window.location.href)
    console.log('searchParams 전체:', searchParams.toString())
    console.log('token:', token ? token.substring(0, 20) + '...' : '없음')
    console.log('userStr:', userStr ? userStr.substring(0, 50) + '...' : '없음')
    console.log('provider:', provider)
    console.log('username:', username)

    // Cognito 소셜 로그인 처리
    if (provider && username) {
      try {
        // Cognito 세션 가져오기
        getCurrentSession().then(session => {
          // Cognito 토큰 저장
          localStorage.setItem('accessToken', session.accessToken)
          localStorage.setItem('idToken', session.idToken)
          localStorage.setItem('refreshToken', session.refreshToken)
          
          // 사용자 정보 가져오기
          fetch(`${API_URL}/api/auth/me`, {
            headers: {
              'Authorization': `Bearer ${session.idToken}`
            }
          }).then(response => {
            if (response.ok) {
              return response.json()
            }
            throw new Error('사용자 정보 가져오기 실패')
          }).then(data => {
            localStorage.setItem('user', JSON.stringify(data.user))
            window.location.replace('/')
          }).catch(error => {
            console.error('사용자 정보 가져오기 오류:', error)
            // 사용자 정보 없어도 로그인은 성공
            window.location.replace('/')
          })
        }).catch(error => {
          console.error('Cognito 세션 가져오기 오류:', error)
          alert('로그인 처리 중 오류가 발생했습니다.')
          navigate('/login', { replace: true })
        })
      } catch (error) {
        console.error('소셜 로그인 처리 오류:', error)
        alert('로그인 처리 중 오류가 발생했습니다: ' + error.message)
        navigate('/login', { replace: true })
      }
    }
    // 기존 JWT 토큰 처리 (하위 호환성)
    else if (token && userStr) {
      try {
        console.log('토큰과 사용자 정보 파싱 시작')
        const decodedUserStr = decodeURIComponent(userStr)
        console.log('decodedUserStr:', decodedUserStr.substring(0, 100) + '...')
        const user = JSON.parse(decodedUserStr)
        console.log('파싱된 user:', user)
        
        // 기존 JWT 토큰 저장 (하위 호환성)
        localStorage.setItem('token', token)
        localStorage.setItem('user', JSON.stringify(user))
        console.log('localStorage 저장 완료')
        
        // 즉시 리다이렉트 (타임아웃 방지)
        console.log('홈으로 리다이렉트 시작')
        setTimeout(() => {
          window.location.replace('/')
        }, 100)
      } catch (error) {
        console.error('소셜 로그인 처리 오류:', error)
        console.error('에러 상세:', error.message)
        alert('로그인 처리 중 오류가 발생했습니다: ' + error.message)
        navigate('/login', { replace: true })
      }
    } else {
      console.error('토큰 또는 사용자 정보 없음')
      console.error('token:', token)
      console.error('userStr:', userStr)
      console.error('provider:', provider)
      console.error('username:', username)
      alert('로그인 정보를 받아오지 못했습니다.')
      navigate('/login', { replace: true })
    }
  }, [navigate, searchParams])

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      flexDirection: 'column',
      gap: '20px'
    }}>
      <div>로그인 처리 중...</div>
    </div>
  )
}

export default AuthSuccess

