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
    const idToken = searchParams.get('idToken') // Lambda에서 받은 Cognito 토큰
    const accessToken = searchParams.get('accessToken')
    const refreshToken = searchParams.get('refreshToken')

    console.log('=== AuthSuccess 디버깅 ===')
    console.log('전체 URL:', window.location.href)
    console.log('searchParams 전체:', searchParams.toString())
    console.log('token:', token ? token.substring(0, 20) + '...' : 'null')
    console.log('userStr:', userStr ? userStr.substring(0, 50) + '...' : 'null')
    console.log('provider:', provider || 'null')
    console.log('username:', username || 'null')
    console.log('idToken:', idToken ? idToken.substring(0, 20) + '...' : 'null')
    console.log('accessToken:', accessToken ? accessToken.substring(0, 20) + '...' : 'null')
    console.log('refreshToken:', refreshToken ? refreshToken.substring(0, 20) + '...' : 'null')

    // userStr만 있는 경우 최우선 처리 (Cognito 토큰 생성 실패했지만 사용자 정보는 있음)
    // provider와 username이 있어도 idToken이 없으면 userStr만 처리
    if (userStr && !token && !idToken) {
      console.log('✅ userStr만 있는 경우 처리 시작')
      try {
        console.log('사용자 정보만 파싱 시작 (token/idToken 없음)')
        const decodedUserStr = decodeURIComponent(userStr)
        console.log('decodedUserStr:', decodedUserStr.substring(0, 100) + '...')
        const user = JSON.parse(decodedUserStr)
        console.log('파싱된 user:', user)
        
        // 사용자 정보 저장
        localStorage.setItem('user', JSON.stringify(user))
        console.log('localStorage 저장 완료')
        
        // 즉시 리다이렉트 (타임아웃 방지)
        console.log('홈으로 리다이렉트 시작')
        setTimeout(() => {
          window.location.replace('/')
        }, 100)
        return
      } catch (error) {
        console.error('사용자 정보 파싱 오류:', error)
        console.error('에러 상세:', error.message)
        // 에러가 발생해도 계속 진행하지 않고 다음 조건으로
      }
    }
    
    // Cognito 소셜 로그인 처리 (idToken이 있는 경우만)
    if (provider && username && idToken) {
      try {
        // Lambda에서 받은 Cognito 토큰이 있으면 바로 사용
        if (idToken && accessToken && refreshToken) {
          // Cognito 토큰 저장
          localStorage.setItem('accessToken', accessToken)
          localStorage.setItem('idToken', idToken)
          localStorage.setItem('refreshToken', refreshToken)
          
          // userStr이 있으면 사용자 정보 저장
          if (userStr) {
            try {
              const decodedUserStr = decodeURIComponent(userStr)
              const user = JSON.parse(decodedUserStr)
              localStorage.setItem('user', JSON.stringify(user))
            } catch (e) {
              console.error('사용자 정보 파싱 오류:', e)
            }
          }
          
          // 사용자 정보 가져오기
          fetch(`${API_URL}/api/auth/me`, {
            headers: {
              'Authorization': `Bearer ${idToken}`
            }
          }).then(response => {
            if (response.ok) {
              return response.json()
            }
            throw new Error('사용자 정보 가져오기 실패')
          }).then(data => {
            if (data.user) {
              localStorage.setItem('user', JSON.stringify(data.user))
            }
            window.location.replace('/')
          }).catch(error => {
            console.error('사용자 정보 가져오기 오류:', error)
            // 사용자 정보 없어도 로그인은 성공
            window.location.replace('/')
          })
        } else {
          // 토큰이 없으면 Cognito SDK로 세션 가져오기 시도
          getCurrentSession().then(session => {
            // Cognito 토큰 저장
            localStorage.setItem('accessToken', session.accessToken)
            localStorage.setItem('idToken', session.idToken)
            localStorage.setItem('refreshToken', session.refreshToken)
            
            // userStr이 있으면 사용자 정보 저장
            if (userStr) {
              try {
                const decodedUserStr = decodeURIComponent(userStr)
                const user = JSON.parse(decodedUserStr)
                localStorage.setItem('user', JSON.stringify(user))
              } catch (e) {
                console.error('사용자 정보 파싱 오류:', e)
              }
            }
            
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
              if (data.user) {
                localStorage.setItem('user', JSON.stringify(data.user))
              }
              window.location.replace('/')
            }).catch(error => {
              console.error('사용자 정보 가져오기 오류:', error)
              // 사용자 정보 없어도 로그인은 성공
              window.location.replace('/')
            })
          }).catch(error => {
            console.error('Cognito 세션 가져오기 오류:', error)
            // userStr이 있으면 사용자 정보만 저장하고 진행
            if (userStr) {
              try {
                const decodedUserStr = decodeURIComponent(userStr)
                const user = JSON.parse(decodedUserStr)
                localStorage.setItem('user', JSON.stringify(user))
                window.location.replace('/')
                return
              } catch (e) {
                console.error('사용자 정보 파싱 오류:', e)
              }
            }
            alert('로그인 처리 중 오류가 발생했습니다.')
            navigate('/login', { replace: true })
          })
        }
      } catch (error) {
        console.error('소셜 로그인 처리 오류:', error)
        // userStr이 있으면 사용자 정보만 저장하고 진행
        if (userStr) {
          try {
            const decodedUserStr = decodeURIComponent(userStr)
            const user = JSON.parse(decodedUserStr)
            localStorage.setItem('user', JSON.stringify(user))
            window.location.replace('/')
            return
          } catch (e) {
            console.error('사용자 정보 파싱 오류:', e)
          }
        }
        alert('로그인 처리 중 오류가 발생했습니다: ' + error.message)
        navigate('/login', { replace: true })
      }
    }
    // userStr만 있는 경우 (Cognito 토큰 생성 실패했지만 사용자 정보는 있음)
    else if (userStr && !token) {
      try {
        console.log('사용자 정보만 파싱 시작')
        const decodedUserStr = decodeURIComponent(userStr)
        console.log('decodedUserStr:', decodedUserStr.substring(0, 100) + '...')
        const user = JSON.parse(decodedUserStr)
        console.log('파싱된 user:', user)
        
        // 사용자 정보 저장
        localStorage.setItem('user', JSON.stringify(user))
        console.log('localStorage 저장 완료')
        
        // 즉시 리다이렉트 (타임아웃 방지)
        console.log('홈으로 리다이렉트 시작')
        setTimeout(() => {
          window.location.replace('/')
        }, 100)
      } catch (error) {
        console.error('사용자 정보 파싱 오류:', error)
        console.error('에러 상세:', error.message)
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

