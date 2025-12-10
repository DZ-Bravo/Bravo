import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

// JWT 토큰 인증 미들웨어
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1] // Bearer TOKEN 형식
  
  if (!token) {
    return res.status(401).json({ error: '인증 토큰이 필요합니다.' })
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: '유효하지 않은 토큰입니다.' })
    }
    req.user = user
    next()
  })
}

// Optional 인증 미들웨어 (토큰이 있으면 req.user 설정, 없으면 통과)
export const optionalAuthenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]
  
  if (!token) {
    return next() // 토큰이 없으면 그냥 통과
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (!err) {
      req.user = user
    }
    next() // 에러가 있어도 통과 (선택적 인증)
  })
}

