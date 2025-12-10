import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

function AuthSuccess() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const token = searchParams.get('token')
    const userStr = searchParams.get('user')

    if (token && userStr) {
      try {
        const user = JSON.parse(decodeURIComponent(userStr))
        
        // 토큰과 사용자 정보를 localStorage에 저장
        localStorage.setItem('token', token)
        localStorage.setItem('user', JSON.stringify(user))
        
        // 홈으로 리다이렉트
        window.location.href = '/'
      } catch (error) {
        console.error('소셜 로그인 처리 오류:', error)
        alert('로그인 처리 중 오류가 발생했습니다.')
        navigate('/login')
      }
    } else {
      alert('로그인 정보를 받아오지 못했습니다.')
      navigate('/login')
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

