/**
 * Keycloak 연동 인증 라우터
 * 기존 auth.js의 로그인/회원가입/소셜 로그인을 Keycloak으로 전환
 */

import express from 'express'
import {
  loginUser,
  verifyToken,
  getUserInfo,
  createUser,
  getAdminToken,
  getUserByUsername
} from './keycloak-client.js'

const router = express.Router()

// Keycloak 설정
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'https://keycloak.hiker-cloud.site'
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'hiking'
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://hiker-cloud.site'

/**
 * 일반 로그인 (Keycloak Password Grant)
 */
router.post('/login', async (req, res) => {
  try {
    const { id, password } = req.body

    if (!id || !password) {
      return res.status(400).json({ error: 'ID와 비밀번호를 입력해주세요.' })
    }

    try {
      // Keycloak에서 로그인 (username은 id 또는 email)
      const tokenData = await loginUser(id, password)

      // Keycloak에서 사용자 정보 조회
      const userInfo = await getUserInfo(tokenData.access_token)

      res.json({
        message: '로그인 성공',
        token: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
        user: {
          id: userInfo.preferred_username || userInfo.sub,
          name: userInfo.name || userInfo.preferred_username,
          email: userInfo.email,
          // Keycloak attributes에서 추가 정보 가져오기
          gender: userInfo.gender || userInfo['custom:gender'],
          fitnessLevel: userInfo.fitnessLevel || userInfo['custom:fitnessLevel'],
          profileImage: userInfo.profileImage || userInfo['custom:profileImage'],
          role: userInfo.realm_access?.roles?.[0] || 'user'
        }
      })
    } catch (keycloakError) {
      console.error('Keycloak 로그인 오류:', keycloakError)
      if (keycloakError.response?.status === 401) {
        return res.status(401).json({ error: 'ID 또는 비밀번호가 올바르지 않습니다.' })
      }
      return res.status(500).json({ error: '로그인 중 오류가 발생했습니다.' })
    }
  } catch (error) {
    console.error('로그인 오류:', error)
    res.status(500).json({ error: '로그인 중 오류가 발생했습니다.' })
  }
})

/**
 * Keycloak 토큰 검증 미들웨어
 */
export const verifyKeycloakToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '인증 토큰이 필요합니다.' })
    }

    const token = authHeader.substring(7)
    const tokenInfo = await verifyToken(token)

    if (!tokenInfo.active) {
      return res.status(401).json({ error: '유효하지 않은 토큰입니다.' })
    }

    // 사용자 정보를 req에 추가
    req.user = {
      userId: tokenInfo.sub,
      username: tokenInfo.preferred_username,
      email: tokenInfo.email,
      roles: tokenInfo.realm_access?.roles || []
    }

    next()
  } catch (error) {
    console.error('토큰 검증 오류:', error)
    return res.status(401).json({ error: '토큰 검증에 실패했습니다.' })
  }
}

/**
 * Keycloak 회원가입 (Admin API 사용)
 */
router.post('/signup-keycloak', async (req, res) => {
  try {
    const { id, name, password, email, gender, fitnessLevel, birthYear } = req.body

    if (!id || !name || !password || !email) {
      return res.status(400).json({ error: '필수 항목을 입력해주세요.' })
    }

    try {
      // Keycloak Admin 토큰 획득
      const adminToken = await getAdminToken()

      // 기존 사용자 확인
      const existingUser = await getUserByUsername(adminToken, id)
      if (existingUser) {
        return res.status(409).json({ error: '이미 사용 중인 ID입니다.' })
      }

      // Keycloak에 사용자 생성
      const userId = await createUser(adminToken, {
        username: id,
        email: email,
        firstName: name,
        lastName: '',
        password: password,
        attributes: {
          gender: [gender || ''],
          fitnessLevel: [fitnessLevel || ''],
          birthYear: [birthYear?.toString() || '']
        }
      })

      if (!userId) {
        return res.status(500).json({ error: '회원가입에 실패했습니다.' })
      }

      // 로그인하여 토큰 반환
      const tokenData = await loginUser(id, password)
      const userInfo = await getUserInfo(tokenData.access_token)

      res.status(201).json({
        message: '회원가입이 완료되었습니다.',
        token: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        user: {
          id: userInfo.preferred_username || userInfo.sub,
          name: userInfo.name || userInfo.preferred_username,
          email: userInfo.email,
          gender: userInfo.gender || userInfo['custom:gender'],
          fitnessLevel: userInfo.fitnessLevel || userInfo['custom:fitnessLevel']
        }
      })
    } catch (keycloakError) {
      console.error('Keycloak 회원가입 오류:', keycloakError)
      if (keycloakError.response?.status === 409) {
        return res.status(409).json({ error: '이미 사용 중인 ID입니다.' })
      }
      return res.status(500).json({ error: '회원가입 중 오류가 발생했습니다.' })
    }
  } catch (error) {
    console.error('회원가입 오류:', error)
    res.status(500).json({ error: '회원가입 중 오류가 발생했습니다.' })
  }
})

/**
 * Keycloak 소셜 로그인 리다이렉트
 */
router.get('/kakao', (req, res) => {
  const redirectUri = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/broker/kakao/login`
  res.redirect(redirectUri)
})

router.get('/naver', (req, res) => {
  const redirectUri = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/broker/naver/login`
  res.redirect(redirectUri)
})

/**
 * Keycloak 소셜 로그인 콜백
 * Keycloak이 자동으로 처리하므로 프론트엔드로 리다이렉트
 */
router.get('/kakao/callback', (req, res) => {
  // Keycloak이 처리한 후 여기로 오지 않음
  // Keycloak은 직접 프론트엔드로 리다이렉트
  res.redirect(`${FRONTEND_URL}/auth/success`)
})

router.get('/naver/callback', (req, res) => {
  res.redirect(`${FRONTEND_URL}/auth/success`)
})

export default router

