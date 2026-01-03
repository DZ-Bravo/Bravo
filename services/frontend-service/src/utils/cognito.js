import { CognitoUserPool, CognitoUser, AuthenticationDetails } from 'amazon-cognito-identity-js'

// 런타임 환경 변수 가져오기 (window.__RUNTIME_ENV__ 또는 import.meta.env)
const getEnv = (key) => {
  if (typeof window !== 'undefined' && window.__RUNTIME_ENV__ && window.__RUNTIME_ENV__[key]) {
    return window.__RUNTIME_ENV__[key]
  }
  return import.meta.env[key] || process.env[key]
}

const poolData = {
  UserPoolId: getEnv('VITE_COGNITO_USER_POOL_ID') || '',
  ClientId: getEnv('VITE_COGNITO_CLIENT_ID') || ''
}

// UserPoolId와 ClientId가 없으면 Cognito 초기화하지 않음 (선택적 사용)
let userPool = null
let isCognitoConfigured = false

if (poolData.UserPoolId && poolData.ClientId) {
  try {
    userPool = new CognitoUserPool(poolData)
    isCognitoConfigured = true
    console.log('[Cognito] 초기화 완료:', { UserPoolId: poolData.UserPoolId, ClientId: poolData.ClientId.substring(0, 10) + '...' })
  } catch (error) {
    console.error('[Cognito] 초기화 실패:', error)
    userPool = null
    isCognitoConfigured = false
  }
} else {
  console.warn('[Cognito] UserPoolId 또는 ClientId가 설정되지 않았습니다. Cognito 기능이 비활성화됩니다.')
  userPool = null
  isCognitoConfigured = false
}

export { userPool, isCognitoConfigured }

// 로그인 함수
export const login = (username, password) => {
  return new Promise((resolve, reject) => {
    if (!isCognitoConfigured || !userPool) {
      return reject(new Error('Cognito is not configured. UserPoolId and ClientId are required.'))
    }
    
    const authenticationDetails = new AuthenticationDetails({
      Username: username,
      Password: password
    })
    
    const cognitoUser = new CognitoUser({
      Username: username,
      Pool: userPool
    })
    
    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: (result) => {
        resolve({
          accessToken: result.getAccessToken().getJwtToken(),
          idToken: result.getIdToken().getJwtToken(),
          refreshToken: result.getRefreshToken().getToken()
        })
      },
      onFailure: (err) => {
        reject(err)
      }
    })
  })
}

// 토큰 갱신 함수
export const refreshToken = (refreshToken) => {
  return new Promise((resolve, reject) => {
    if (!isCognitoConfigured || !userPool) {
      return reject(new Error('Cognito is not configured. UserPoolId and ClientId are required.'))
    }
    
    const cognitoUser = userPool.getCurrentUser()
    if (!cognitoUser) {
      return reject(new Error('No user found'))
    }
    
    cognitoUser.getSession((err, session) => {
      if (err) {
        return reject(err)
      }
      
      cognitoUser.refreshSession(session.getRefreshToken(), (err, session) => {
        if (err) {
          return reject(err)
        }
        resolve({
          accessToken: session.getAccessToken().getJwtToken(),
          idToken: session.getIdToken().getJwtToken()
        })
      })
    })
  })
}

// 현재 사용자 세션 가져오기
export const getCurrentSession = () => {
  return new Promise((resolve, reject) => {
    if (!isCognitoConfigured || !userPool) {
      return reject(new Error('Cognito is not configured. UserPoolId and ClientId are required.'))
    }
    
    const cognitoUser = userPool.getCurrentUser()
    if (!cognitoUser) {
      return reject(new Error('No user found'))
    }
    
    cognitoUser.getSession((err, session) => {
      if (err) {
        return reject(err)
      }
      if (!session.isValid()) {
        return reject(new Error('Session is not valid'))
      }
      resolve({
        accessToken: session.getAccessToken().getJwtToken(),
        idToken: session.getIdToken().getJwtToken(),
        refreshToken: session.getRefreshToken().getToken()
      })
    })
  })
}

// 로그아웃 함수
export const logout = () => {
  if (isCognitoConfigured && userPool) {
    const cognitoUser = userPool.getCurrentUser()
    if (cognitoUser) {
      cognitoUser.signOut()
    }
  }
  // localStorage에서 토큰 제거
  localStorage.removeItem('accessToken')
  localStorage.removeItem('idToken')
  localStorage.removeItem('refreshToken')
}

