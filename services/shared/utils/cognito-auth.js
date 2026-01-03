import jwt from 'jsonwebtoken'
import jwksClient from 'jwks-rsa'

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID // ap-northeast-2_XXXXXXXXX
const REGION = process.env.AWS_REGION || 'ap-northeast-2'

// JWKS 클라이언트 생성
const client = jwksClient({
  jwksUri: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`,
  cache: true,
  cacheMaxAge: 86400000 // 24시간
})

// 키 가져오기 함수 (Promise 기반)
function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      return callback(err)
    }
    const signingKey = key.publicKey || key.rsaPublicKey
    callback(null, signingKey)
  })
}

// Cognito JWT 검증 미들웨어 (JWT 토큰도 지원 - 하위 호환성)
export const authenticateCognitoToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1] // Bearer TOKEN 형식
  
  if (!token) {
    return res.status(401).json({ error: '인증 토큰이 필요합니다.' })
  }
  
  // USER_POOL_ID가 없으면 JWT 토큰으로 처리 (하위 호환성)
  if (!USER_POOL_ID) {
    console.warn('COGNITO_USER_POOL_ID 환경 변수가 설정되지 않았습니다. JWT 토큰으로 처리합니다.')
    try {
      const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'
      const decoded = jwt.verify(token, JWT_SECRET)
      req.user = {
        userId: decoded.userId || decoded.id,
        id: decoded.id || decoded.userId,
        role: decoded.role || 'user',
        email: decoded.email || null
      }
      return next()
    } catch (jwtError) {
      console.error('JWT 토큰 검증 실패:', jwtError.message)
      return res.status(403).json({ error: '유효하지 않은 토큰입니다.', details: jwtError.message })
    }
  }
  
  // Cognito JWT 검증 시도
  jwt.verify(token, getKey, {
    audience: process.env.COGNITO_CLIENT_ID,
    issuer: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`,
    algorithms: ['RS256']
  }, (err, decoded) => {
    if (err) {
      // Cognito 토큰 검증 실패 시 JWT 토큰으로 폴백 (하위 호환성)
      console.warn('Cognito JWT 검증 실패, JWT 토큰으로 폴백:', err.message)
      try {
        const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'
        const jwtDecoded = jwt.verify(token, JWT_SECRET)
        req.user = {
          userId: jwtDecoded.userId || jwtDecoded.id,
          id: jwtDecoded.id || jwtDecoded.userId,
          role: jwtDecoded.role || 'user',
          email: jwtDecoded.email || null
        }
        return next()
      } catch (jwtError) {
        console.error('JWT 토큰 검증도 실패:', jwtError.message)
        return res.status(403).json({ error: '유효하지 않은 토큰입니다.', details: jwtError.message })
      }
    }
    
    // Cognito 토큰에서 사용자 정보 추출
    // MongoDB에서 사용자 찾기 위해 userId를 사용해야 함
    // custom:userId가 없으면 sub를 사용하고, MongoDB에서 email로 사용자 찾기
    req.user = {
      userId: decoded['custom:userId'] || decoded['custom:mongoId'] || decoded.sub, // MongoDB ObjectId 또는 Cognito sub
      id: decoded['cognito:username'] || decoded.username || decoded.sub,
      role: decoded['custom:userRole'] || 'user',
      cognitoSub: decoded.sub, // Cognito 고유 ID
      email: decoded.email || decoded['cognito:email'] || null
    }
    next()
  })
}

// Optional 인증 미들웨어 (JWT 토큰도 지원 - 하위 호환성)
export const optionalAuthenticateCognitoToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]
  
  if (!token) {
    return next()
  }
  
  // USER_POOL_ID가 없으면 JWT 토큰으로 처리 (하위 호환성)
  if (!USER_POOL_ID) {
    try {
      const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'
      const decoded = jwt.verify(token, JWT_SECRET)
      req.user = {
        userId: decoded.userId || decoded.id,
        id: decoded.id || decoded.userId,
        role: decoded.role || 'user',
        email: decoded.email || null
      }
    } catch (jwtError) {
      // JWT 토큰 검증 실패해도 통과
    }
    return next()
  }
  
  jwt.verify(token, getKey, {
    audience: process.env.COGNITO_CLIENT_ID,
    issuer: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`,
    algorithms: ['RS256']
  }, (err, decoded) => {
    if (!err) {
      req.user = {
        userId: decoded['custom:userId'] || decoded['custom:mongoId'] || decoded.sub,
        id: decoded['cognito:username'] || decoded.username || decoded.sub,
        role: decoded['custom:userRole'] || 'user',
        cognitoSub: decoded.sub,
        email: decoded.email || decoded['cognito:email'] || null
      }
    } else {
      // Cognito 토큰 검증 실패 시 JWT 토큰으로 폴백 (하위 호환성)
      try {
        const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'
        const jwtDecoded = jwt.verify(token, JWT_SECRET)
        req.user = {
          userId: jwtDecoded.userId || jwtDecoded.id,
          id: jwtDecoded.id || jwtDecoded.userId,
          role: jwtDecoded.role || 'user',
          email: jwtDecoded.email || null
        }
      } catch (jwtError) {
        // JWT 토큰 검증도 실패해도 통과 (req.user는 undefined)
      }
    }
    // 토큰이 유효하지 않아도 통과 (req.user는 undefined)
    next()
  })
}

