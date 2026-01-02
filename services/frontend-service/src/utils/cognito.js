import { CognitoUserPool, CognitoUser, AuthenticationDetails } from 'amazon-cognito-identity-js'

const poolData = {
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || process.env.VITE_COGNITO_USER_POOL_ID,
  ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID || process.env.VITE_COGNITO_CLIENT_ID
}

export const userPool = new CognitoUserPool(poolData)

// 로그인 함수
export const login = (username, password) => {
  return new Promise((resolve, reject) => {
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
  const cognitoUser = userPool.getCurrentUser()
  if (cognitoUser) {
    cognitoUser.signOut()
  }
  // localStorage에서 토큰 제거
  localStorage.removeItem('accessToken')
  localStorage.removeItem('idToken')
  localStorage.removeItem('refreshToken')
}

