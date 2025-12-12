import express from 'express'
import mongoose from 'mongoose'
import Stamp from './shared/models/Stamp.js'
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

// 스탬프 생성 (이미 있으면 무시)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId
    const { mountainCode } = req.body

    if (!mountainCode) {
      return res.status(400).json({ error: 'mountainCode가 필요합니다.' })
    }

    // mountainCode를 Number로 변환
    const codeNum = parseInt(mountainCode)
    if (isNaN(codeNum)) {
      return res.status(400).json({ error: '유효한 mountainCode가 아닙니다.' })
    }

    // 이미 스탬프가 있는지 확인
    const existingStamp = await Stamp.findOne({
      userId: userId,
      mountainCode: codeNum
    })

    if (existingStamp) {
      console.log(`[스탬프] 이미 존재하는 스탬프 - userId: ${userId}, mountainCode: ${codeNum}`)
      return res.json({
        message: '이미 스탬프가 존재합니다.',
        stamp: existingStamp
      })
    }

    // 새 스탬프 생성
    const stamp = new Stamp({
      userId: userId,
      mountainCode: codeNum,
      stampedAt: new Date()
    })

    await stamp.save()
    console.log(`[스탬프] 새 스탬프 생성 - userId: ${userId}, mountainCode: ${codeNum}`)

    res.status(201).json({
      message: '스탬프가 생성되었습니다.',
      stamp: stamp
    })
  } catch (error) {
    if (error.code === 11000) {
      // 중복 키 에러 (unique index 위반)
      console.log(`[스탬프] 중복 스탬프 시도 - userId: ${req.userId}, mountainCode: ${req.body.mountainCode}`)
      return res.json({
        message: '이미 스탬프가 존재합니다.'
      })
    }
    console.error('스탬프 생성 오류:', error)
    res.status(500).json({ error: '스탬프 생성 중 오류가 발생했습니다.' })
  }
})

// 완등 탭용 API - 사용자의 완등한 산 정보 반환
router.get('/completed/:userId', async (req, res) => {
  try {
    const { userId } = req.params

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: '유효하지 않은 userId입니다.' })
    }

    // stamps에서 userId의 mountainCode 목록 가져오기
    const stamps = await Stamp.find({ userId: userId })
      .select('mountainCode stampedAt')
      .sort({ stampedAt: -1 })
      .lean()

    const mountainCodes = stamps.map(stamp => Number(stamp.mountainCode))

    if (mountainCodes.length === 0) {
      return res.json({
        userId: userId,
        mountains: [],
        count: 0
      })
    }

    // MongoDB 연결 및 Mountain_list 컬렉션 접근
    const db = mongoose.connection.db
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(c => c.name)

    let mountainListCollectionName = collectionNames.find(name => name === 'Mountain_list')
    if (!mountainListCollectionName) {
      mountainListCollectionName = collectionNames.find(name =>
        name.toLowerCase() === 'mountain_list'
      ) || 'Mountain_list'
    }
    const actualCollection = db.collection(mountainListCollectionName)

    // mountains 컬렉션에서 해당 mountainCode들의 산 정보 가져오기
    const mountains = []
    const processedCodes = new Set()

    for (const codeNum of mountainCodes) {
      if (processedCodes.has(codeNum)) continue

      const searchQueries = [
        { mntilistno: codeNum },
        { mntilistno: Number(codeNum) },
        { 'trail_match.mountain_info.mntilistno': codeNum },
        { 'trail_match.mountain_info.mntilistno': Number(codeNum) }
      ]

      let foundMountain = null
      for (const query of searchQueries) {
        try {
          foundMountain = await actualCollection.findOne(query)
          if (foundMountain) break
        } catch (e) {
          console.log(`[스탬프] 쿼리 실패: ${JSON.stringify(query)} - ${e.message}`)
        }
      }

      if (foundMountain) {
        const mntilistno = foundMountain.mntilistno || foundMountain.trail_match?.mountain_info?.mntilistno
        const mntiname = foundMountain.mntiname || foundMountain.trail_match?.mountain_info?.mntiname || foundMountain.name
        const mntiadd = foundMountain.mntiadd || foundMountain.trail_match?.mountain_info?.mntiadd || foundMountain.location
        const mntihigh = foundMountain.mntihigh || foundMountain.trail_match?.mountain_info?.mntihigh || foundMountain.height

        // 이미지 URL 찾기
        let imageUrl = foundMountain.image || 
                      foundMountain.trail_match?.mountain_info?.photo_url ||
                      foundMountain.trail_match?.mountain_info?.image_url ||
                      foundMountain.trail_match?.mountain_info?.photoUrl ||
                      foundMountain.trail_match?.mountain_info?.imageUrl ||
                      null

        mountains.push({
          code: String(mntilistno || codeNum),
          name: mntiname || `산 (코드: ${codeNum})`,
          location: mntiadd || null,
          height: mntihigh || null,
          image: imageUrl
        })

        processedCodes.add(codeNum)
      } else {
        // 매칭 실패 시 최소한 코드만 포함
        mountains.push({
          code: String(codeNum),
          name: `산 (코드: ${codeNum})`,
          location: null,
          height: null,
          image: null
        })
        processedCodes.add(codeNum)
      }
    }

    res.json({
      userId: userId,
      mountains: mountains,
      count: mountains.length
    })
  } catch (error) {
    console.error('완등 산 목록 조회 오류:', error)
    res.status(500).json({ error: '완등 산 목록을 가져오는데 실패했습니다.' })
  }
})

// 기존 API 유지 (하위 호환성) - stamps 컬렉션 기반으로 변경
router.get('/completed', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId
    console.log(`[스탬프] API 호출됨 - 사용자 ID: ${userId}`)
    
    // stamps 컬렉션에서 사용자의 mountainCode 목록 가져오기
    const stamps = await Stamp.find({ userId: userId })
      .select('mountainCode')
      .lean()

    const mountainCodes = stamps.map(stamp => String(stamp.mountainCode))

    console.log(`[스탬프] 사용자 ${userId}의 스탬프 개수: ${stamps.length}`)
    console.log(`[스탬프] 완료 산 코드 목록:`, mountainCodes)

    res.json({
      completedMountainCodes: mountainCodes,
      count: mountainCodes.length
    })
  } catch (error) {
    console.error('등산 완료 산 목록 조회 오류:', error)
    res.status(500).json({ error: '등산 완료 산 목록을 가져오는데 실패했습니다.' })
  }
})

// 특정 사용자의 스탬프 목록 가져오기 (mountainCode 리스트만)
// 주의: 동적 파라미터 라우트는 마지막에 배치하여 /completed 등과 충돌하지 않도록 함
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: '유효하지 않은 userId입니다.' })
    }

    const stamps = await Stamp.find({ userId: userId })
      .select('mountainCode stampedAt')
      .sort({ stampedAt: -1 })
      .lean()

    const mountainCodes = stamps.map(stamp => stamp.mountainCode)

    res.json({
      userId: userId,
      mountainCodes: mountainCodes,
      count: mountainCodes.length,
      stamps: stamps
    })
  } catch (error) {
    console.error('스탬프 목록 조회 오류:', error)
    res.status(500).json({ error: '스탬프 목록을 가져오는데 실패했습니다.' })
  }
})

export default router

