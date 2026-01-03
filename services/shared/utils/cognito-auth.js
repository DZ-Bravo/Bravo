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
  // kid가 없으면 에러 반환 (이 경우 jwt.verify의 에러 핸들러에서 JWT 토큰으로 폴백)
  if (!header || !header.kid) {
    const error = new Error('No KID in token header - may be JWT token')
    error.name = 'NoKIDError'
    return callback(error)
  }
  
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
  
  // 먼저 토큰 헤더를 확인하여 Cognito 토큰인지 JWT 토큰인지 판단
  let tokenHeader
  let isCognitoToken = false
  try {
    tokenHeader = jwt.decode(token, { complete: true })?.header
    console.log('[인증] 토큰 헤더:', tokenHeader ? JSON.stringify(tokenHeader) : '없음')
    if (tokenHeader && tokenHeader.kid) {
      isCognitoToken = true
      console.log('[인증] Cognito 토큰 감지 (kid 있음)')
    } else {
      console.log('[인증] JWT 토큰 감지 (kid 없음) - JWT로 직접 처리')
      // kid가 없으면 바로 JWT 토큰으로 처리
      try {
        const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'
        console.log('[인증] JWT_SECRET 사용:', JWT_SECRET ? (JWT_SECRET.substring(0, 10) + '...') : '없음')
        const jwtDecoded = jwt.verify(token, JWT_SECRET)
        req.user = {
          userId: jwtDecoded.userId || jwtDecoded.id,
          id: jwtDecoded.id || jwtDecoded.userId,
          role: jwtDecoded.role || 'user',
          email: jwtDecoded.email || null
        }
        console.log('[인증] JWT 토큰 검증 성공, userId:', req.user.userId)
        return next()
      } catch (jwtError) {
        console.error('[인증] JWT 토큰 검증 실패:', jwtError.message)
        console.error('[인증] 토큰 디코딩 시도 (검증 없이):', jwt.decode(token, { complete: true }))
        return res.status(403).json({ error: '유효하지 않은 토큰입니다.', details: jwtError.message })
      }
    }
  } catch (decodeError) {
    console.warn('[인증] 토큰 디코딩 실패:', decodeError.message)
    // 디코딩 실패해도 JWT 토큰으로 시도
    try {
      const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'
      const jwtDecoded = jwt.verify(token, JWT_SECRET)
      req.user = {
        userId: jwtDecoded.userId || jwtDecoded.id,
        id: jwtDecoded.id || jwtDecoded.userId,
        role: jwtDecoded.role || 'user',
        email: jwtDecoded.email || null
      }
      console.log('[인증] JWT 토큰 검증 성공 (디코딩 실패 후)')
      return next()
    } catch (jwtError) {
      console.error('[인증] JWT 토큰 검증 실패:', jwtError.message)
      return res.status(403).json({ error: '유효하지 않은 토큰입니다.', details: decodeError.message })
    }
  }
  
  // Cognito 토큰인 경우에만 Cognito 검증 시도
  if (isCognitoToken) {
    jwt.verify(token, getKey, {
      audience: process.env.COGNITO_CLIENT_ID,
      issuer: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`,
      algorithms: ['RS256']
    }, (err, decoded) => {
      if (err) {
        // Cognito 토큰 검증 실패 시 JWT 토큰으로 폴백 (하위 호환성)
        console.warn('[인증] Cognito JWT 검증 실패, JWT 토큰으로 폴백:', err.message)
        try {
          const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'
          const jwtDecoded = jwt.verify(token, JWT_SECRET)
          req.user = {
            userId: jwtDecoded.userId || jwtDecoded.id,
            id: jwtDecoded.id || jwtDecoded.userId,
            role: jwtDecoded.role || 'user',
            email: jwtDecoded.email || null
          }
          console.log('[인증] JWT 토큰 폴백 성공')
          return next()
        } catch (jwtError) {
          console.error('[인증] JWT 토큰 폴백도 실패:', jwtError.message)
          return res.status(403).json({ error: '유효하지 않은 토큰입니다.', details: jwtError.message })
        }
      }
      
      // Cognito 토큰에서 사용자 정보 추출
      req.user = {
        userId: decoded['custom:userId'] || decoded['custom:mongoId'] || decoded.sub,
        id: decoded['cognito:username'] || decoded.username || decoded.sub,
        role: decoded['custom:userRole'] || 'user',
        cognitoSub: decoded.sub,
        email: decoded.email || decoded['cognito:email'] || null
      }
      console.log('[인증] Cognito 토큰 검증 성공')
      next()
    })
  } else {
    // 이 경우는 위에서 이미 처리됨 (JWT 토큰)
    // 여기 도달하면 안 됨
    console.error('[인증] 예상치 못한 상황: isCognitoToken이 false인데 여기 도달')
    return res.status(403).json({ error: '유효하지 않은 토큰입니다.' })
  }
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

