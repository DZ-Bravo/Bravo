import express from 'express'
import mongoose from 'mongoose'
import Post from './shared/models/Post.js'
import jwt from 'jsonwebtoken'

const router = express.Router()

// JWT 토큰 검증 미들웨어
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: '인증 토큰이 필요합니다.' })
  }

  try {
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'
    const decoded = jwt.verify(token, JWT_SECRET)
    req.userId = decoded.userId
    req.userIdStr = decoded.id
    next()
  } catch (error) {
    return res.status(403).json({ error: '유효하지 않은 토큰입니다.' })
  }
}

// 사용자의 등산 완료 산 목록 가져오기
router.get('/completed', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId
    console.log(`[스탬프] API 호출됨 - 사용자 ID: ${userId}, 타입: ${typeof userId}`)
    
    // userId를 ObjectId로 변환
    let authorQuery = userId
    try {
      // ObjectId로 변환 시도
      if (userId) {
        authorQuery = new mongoose.Types.ObjectId(userId)
        console.log(`[스탬프] ObjectId로 변환 성공: ${authorQuery}`)
      }
    } catch (e) {
      console.error('[스탬프] userId 변환 실패:', e)
      // 변환 실패 시 원본 사용
      authorQuery = userId
    }
    
    console.log(`[스탬프] 최종 쿼리 author: ${authorQuery}`)

    // 먼저 모든 등산일지 조회 (디버깅용)
    const allDiaries = await Post.find({ category: 'diary' })
      .select('author mountainCode title createdAt')
      .lean()
    console.log(`[스탬프] 전체 등산일지 개수: ${allDiaries.length}`)
    if (allDiaries.length > 0) {
      console.log(`[스탬프] 전체 등산일지 샘플 (처음 5개):`, allDiaries.slice(0, 5).map(d => ({
        title: d.title,
        author: d.author,
        authorType: typeof d.author,
        authorStr: String(d.author),
        mountainCode: d.mountainCode,
        createdAt: d.createdAt
      })))
    }

    // 사용자가 작성한 등산일지(diary)에서 mountainCode 추출
    // ObjectId로 정확히 매칭
    const userDiaries = await Post.find({
      author: authorQuery,
      category: 'diary',
      mountainCode: { $exists: true, $ne: null, $ne: '' }
    }).select('mountainCode title createdAt author').lean()
    
    console.log(`[스탬프] ObjectId 매칭 결과 - 등산일지 개수: ${userDiaries.length}`)
    
    // 매칭 실패 시 다른 방법 시도
    if (userDiaries.length === 0) {
      console.log(`[스탬프] ObjectId 매칭 실패, 다른 방법 시도...`)
      const userDiariesAlt = await Post.find({
        $or: [
          { author: userId },
          { author: String(userId) },
          { 'author._id': userId },
          { 'author._id': String(userId) }
        ],
        category: 'diary',
        mountainCode: { $exists: true, $ne: null, $ne: '' }
      }).select('mountainCode title createdAt author').lean()
      console.log(`[스탬프] 대체 방법 결과 - 등산일지 개수: ${userDiariesAlt.length}`)
      if (userDiariesAlt.length > 0) {
        userDiaries.push(...userDiariesAlt)
      }
    }

    console.log(`[스탬프] 사용자 ${userId}의 등산일지 개수: ${userDiaries.length}`)
    
    // 등산일지 상세 정보 로그
    if (userDiaries.length > 0) {
      console.log(`[스탬프] 등산일지 상세:`, userDiaries.map(d => ({
        title: d.title,
        mountainCode: d.mountainCode,
        mountainCodeType: typeof d.mountainCode,
        createdAt: d.createdAt
      })))
    }
    
    // mountainCode 추출 및 유효성 검사
    const mountainCodes = userDiaries
      .map(diary => {
        const code = diary.mountainCode
        if (!code) {
          console.log(`[스탬프] mountainCode 없음 - 제목: ${diary.title}`)
          return null
        }
        
        // String으로 변환하고 빈 문자열 체크
        const codeStr = String(code).trim()
        if (codeStr === '' || codeStr === 'null' || codeStr === 'undefined') {
          console.log(`[스탬프] 유효하지 않은 mountainCode - 제목: ${diary.title}, 코드: ${codeStr}`)
          return null
        }
        
        console.log(`[스탬프] 유효한 mountainCode - 제목: ${diary.title}, 코드: ${codeStr} (원본 타입: ${typeof code})`)
        return codeStr
      })
      .filter(code => code !== null)

    console.log(`[스탬프] 추출된 mountainCode 개수: ${mountainCodes.length}`)
    if (mountainCodes.length > 0) {
      console.log(`[스탬프] mountainCode 전체 목록:`, mountainCodes)
      console.log(`[스탬프] mountainCode 타입 확인:`, mountainCodes.map(c => ({ code: c, type: typeof c })))
    }

    // 중복 제거하여 완료한 산 코드 목록 생성
    const completedMountainCodes = [...new Set(mountainCodes)]

    console.log(`[스탬프] 최종 완료 산 개수: ${completedMountainCodes.length}`)

    res.json({
      completedMountainCodes,
      count: completedMountainCodes.length
    })
  } catch (error) {
    console.error('등산 완료 산 목록 조회 오류:', error)
    res.status(500).json({ error: '등산 완료 산 목록을 가져오는데 실패했습니다.' })
  }
})

export default router

