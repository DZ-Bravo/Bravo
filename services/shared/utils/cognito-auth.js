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

// 키 가져오기 함수
function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      return callback(err)
    }
    const signingKey = key.publicKey || key.rsaPublicKey
    callback(null, signingKey)
  })
}

// Cognito JWT 검증 미들웨어
export const authenticateCognitoToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1] // Bearer TOKEN 형식
  
  if (!token) {
    return res.status(401).json({ error: '인증 토큰이 필요합니다.' })
  }
  
  jwt.verify(token, getKey, {
    audience: process.env.COGNITO_CLIENT_ID,
    issuer: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`,
    algorithms: ['RS256']
  }, (err, decoded) => {
    if (err) {
      console.error('Cognito JWT 검증 실패:', err.message)
      return res.status(403).json({ error: '유효하지 않은 토큰입니다.' })
    }
    
    // Cognito 토큰에서 사용자 정보 추출
    req.user = {
      userId: decoded['custom:userId'] || decoded['custom:mongoId'] || decoded.sub, // MongoDB ObjectId 또는 Cognito sub
      id: decoded['cognito:username'] || decoded.username || decoded.sub,
      role: decoded['custom:userRole'] || 'user',
      cognitoSub: decoded.sub // Cognito 고유 ID
    }
    next()
  })
}

// Optional 인증 미들웨어
export const optionalAuthenticateCognitoToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]
  
  if (!token) {
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
        cognitoSub: decoded.sub
      }
    }
    next()
  })
}

