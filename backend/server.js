import express from 'express'
import cors from 'cors'
import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import axios from 'axios'
import connectDB from './config/database.js'
import { MOUNTAIN_ROUTES, getMountainInfo, getAllMountains } from './utils/mountainRoutes.js'
import { MountainList } from './models/Mountain.js'
import Course from './models/Course.js'
import Lodging from './models/Lodging.js'
import Schedule from './models/Schedule.js'
import Notification from './models/Notification.js'
import authRoutes from './routes/auth.js'
import postsRoutes from './routes/posts.js'
import noticesRoutes from './routes/notices.js'
import schedulesRoutes from './routes/schedules.js'
import notificationsRoutes from './routes/notifications.js'
import storeRoutes from './routes/store.js'
import chatbotRoutes from './routes/chatbot.js'
import { authenticateToken } from './routes/auth.js'
import User from './models/User.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 5000

// Middleware
app.use(cors())
app.use(express.json())
// express.urlencoded는 multer가 multipart/form-data를 처리할 때 필요하지 않음
// multer가 자동으로 텍스트 필드를 req.body에 추가함
app.use('/uploads', express.static(join(__dirname, 'uploads'))) // 정적 파일 서빙
app.use('/mountain', express.static(join(__dirname, '..', 'mountain'))) // mountain 폴더 정적 파일 서빙

// MongoDB 연결 (비동기로 처리, 서버 시작은 계속 진행)
connectDB()

// Redis는 store.js에서 직접 관리하므로 여기서는 초기화하지 않음

// 인증 라우트
app.use('/api/auth', authRoutes)

// 게시글 라우트
app.use('/api/posts', postsRoutes)

// 공지사항 라우트
app.use('/api/notices', noticesRoutes)

// 등산일정 라우트
app.use('/api/schedules', schedulesRoutes)

// 알림 라우트
app.use('/api/notifications', notificationsRoutes)

// 스토어 라우트
app.use('/api/store', storeRoutes)

// 챗봇 라우트
app.use('/api/chatbot', chatbotRoutes)

// CCTV 프록시 엔드포인트 (X-Frame-Options 우회)
app.get('/api/cctv/proxy', async (req, res) => {
  try {
    const targetUrl = req.query.url
    if (!targetUrl) {
      return res.status(400).json({ error: 'URL 파라미터가 필요합니다.' })
    }

    console.log(`[CCTV 프록시] 요청 URL: ${targetUrl}`)
    
    // 외부 URL에서 HTML 가져오기
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      responseType: 'text',
      timeout: 10000
    })

    const html = response.data
    
    // X-Frame-Options 헤더 제거를 위해 HTML 수정
    // X-Frame-Options 메타 태그 제거
    let modifiedHtml = html.replace(/<meta[^>]*http-equiv=["']X-Frame-Options["'][^>]*>/gi, '')
    modifiedHtml = modifiedHtml.replace(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*frame-ancestors[^>]*>/gi, '')
    
    // Content-Security-Policy에서 frame-ancestors 제거
    modifiedHtml = modifiedHtml.replace(/content-security-policy[^>]*frame-ancestors[^;]*;?/gi, '')
    
    // 비디오 플레이어 크기 조정 및 텍스트 크기 조정을 위한 CSS 추가
    const videoSizeStyle = `
    <style>
      /* 공통 리셋 */
      html, body {
        margin: 0 !important;
        padding: 10px !important;
        width: 100% !important;
        height: auto !important;
        overflow-x: auto !important;
        overflow-y: auto !important;
        font-size: 15px !important;
      }
      /* 비디오 요소 공통 크기 */
      video, object, embed, img {
        max-width: 100% !important;
        height: auto !important;
        object-fit: contain !important;
        display: block !important;
        margin: 0 auto !important;
      }
      /* flowplayer 전용 */
      .flowplayer {
        max-width: 500px !important;
        width: 100% !important;
        height: auto !important;
        margin: 0 auto !important;
      }
      .flowplayer video {
        width: 100% !important;
        height: auto !important;
        object-fit: contain !important;
      }
      .flowplayer .fp-ui,
      .flowplayer .fp-controls {
        transform: none !important;
      }
      * {
        box-sizing: border-box;
      }
      h1, h2, h3, h4, h5, h6 {
        font-size: 1.3em !important;
      }
      p, div, span {
        font-size: 0.95em !important;
      }
      #unload-trigger-element div h1 {
        font-size: 1.1em !important;
      }
    </style>
    `
    // </head> 태그 앞에 스타일 추가
    modifiedHtml = modifiedHtml.replace(/<\/head>/i, videoSizeStyle + '</head>')
    
    // 응답 헤더 설정 (X-Frame-Options 제거)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('X-Frame-Options', 'ALLOWALL')
    res.setHeader('Content-Security-Policy', "frame-ancestors *")
    
    res.send(modifiedHtml)
  } catch (error) {
    console.error('[CCTV 프록시] 오류:', error)
    res.status(500).json({ error: 'CCTV 프록시 오류가 발생했습니다.', message: error.message })
  }
})

// 디버깅: Mountain_list 컬렉션 구조 확인
app.get('/api/debug/mountain-list', async (req, res) => {
  try {
    // Mountain_list 컬렉션에서 샘플 데이터 여러 개 가져오기
    const samples = await MountainList.find({}).limit(5).lean()
    const totalCount = await MountainList.countDocuments()
    
    // Course 컬렉션에서 mountainCode 목록
    const courseMountainCodes = await Course.distinct('mountainCode')
    const courseCount = await Course.countDocuments()
    
    // Mountain_list의 모든 code 목록 (실제 필드명 사용)
    let mountainListCodes = []
    try {
      // 실제 필드명 mntilistno 사용
      const codes = await actualCollection.distinct('mntilistno')
      mountainListCodes = codes.map(c => String(c))
    } catch (e) {
      console.error('mntilistno 필드를 찾을 수 없음:', e.message)
      try {
        mountainListCodes = await actualCollection.distinct('code')
      } catch (e2) {
        console.error('code 필드도 찾을 수 없음')
      }
    }
    
    // 실제로 가져온 데이터 개수
    const actualCount = await actualCollection.countDocuments()
    
    res.json({
      mountainList: {
        totalCount,
        actualCount,
        samples: samples.map(s => ({
          fields: Object.keys(s),
          sample: s
        })),
        codes: mountainListCodes.slice(0, 20) // 처음 20개
      },
      course: {
        count: courseCount,
        mountainCodes: courseMountainCodes.slice(0, 20) // 처음 20개
      },
      matching: {
        courseCodes: courseMountainCodes.length,
        mountainListCodes: mountainListCodes.length,
        matched: mountainListCodes.filter(code => courseMountainCodes.includes(code)).length
      }
    })
  } catch (error) {
    console.error('Debug error:', error)
    res.status(500).json({ error: error.message, stack: error.stack })
  }
})

// 산 정보 라우트 - Mountain_list 컬렉션에서 모든 산 가져오기
app.get('/api/mountains', async (req, res) => {
  try {
    // MongoDB 연결 확인
    const mongoose = await import('mongoose')
    const db = mongoose.default.connection.db
    
    // 실제 컬렉션 목록 확인
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(c => c.name)
    console.log('MongoDB 컬렉션 목록:', collectionNames)
    
    // Mountain_list 컬렉션 찾기 (정확한 이름 우선)
    let mountainListCollectionName = collectionNames.find(name => name === 'Mountain_list')
    
    // 없으면 대소문자 구분 없이 찾기
    if (!mountainListCollectionName) {
      mountainListCollectionName = collectionNames.find(name => 
        name.toLowerCase() === 'mountain_list'
      )
    }
    
    // 그래도 없으면 mountain_lists 시도
    if (!mountainListCollectionName) {
      mountainListCollectionName = collectionNames.find(name => 
        name.toLowerCase() === 'mountain_lists'
      )
    }
    
    console.log('찾은 산 컬렉션 이름:', mountainListCollectionName)
    
    // 직접 컬렉션에 접근
    let actualCollection
    if (mountainListCollectionName) {
      actualCollection = db.collection(mountainListCollectionName)
    } else {
      // 기본값으로 Mountain_list 시도
      actualCollection = db.collection('Mountain_list')
    }
    
    // Mountain_list 컬렉션 전체 개수 확인
    const totalMountainListCount = await actualCollection.countDocuments()
    console.log('Mountain_list 컬렉션 전체 개수:', totalMountainListCount)
    
    // Mountain_list 컬렉션에서 모든 산 정보 가져오기 (제한 없음)
    const mountains = await actualCollection.find({}).toArray()
    
    console.log('가져온 산 개수 (매핑 전):', mountains.length)
    if (mountains.length > 0) {
      console.log('첫 번째 산 샘플 (원본):', JSON.stringify(mountains[0], null, 2))
      console.log('첫 번째 산의 모든 필드명:', Object.keys(mountains[0]))
    }
    
    // Course 컬렉션에서 등산코스가 있는 산 코드 목록 (선택적 정보)
    let coursesWithMountainCode = []
    let hasCourseSet = new Set()
    try {
      coursesWithMountainCode = await Course.distinct('mountainCode')
      hasCourseSet = new Set(coursesWithMountainCode)
    } catch (e) {
      console.log('Course 컬렉션 조회 실패:', e.message)
    }
    
    // 위치 문자열에서 시/군/구와 도 추출
    const parseCityProvince = (locationStr) => {
      if (!locationStr || typeof locationStr !== 'string') {
        return { province: null, city: null }
      }
      const parts = locationStr.replace(/\s+/g, ' ').trim().split(' ')
      if (parts.length < 2) {
        return { province: null, city: null }
      }
      
      // 첫 번째 단어는 도/특별시/광역시
      const province = parts[0] || null
      
      // 시/군/구로 끝나는 두 번째 단어 찾기
      let city = null
      for (let i = 1; i < parts.length; i++) {
        if (/시$|군$|구$/.test(parts[i])) {
          city = parts[i]
          break
        }
      }
      // 시/군/구를 못 찾으면 두 번째 단어 사용
      if (!city && parts[1]) {
        city = parts[1]
      }
      
      return { province, city }
    }
    
    // 필드명 매핑 - 실제 DB 필드명 사용
    // mntilistno가 있는 산만 반환 (등산 코스 파일과 매칭하기 위해)
    const mappedMountains = mountains
      .filter((m) => {
        // mntilistno가 직접 있거나 trail_match.mountain_info.mntilistno에 있는 경우
        const mntilistno = m.mntilistno || m.trail_match?.mountain_info?.mntilistno
        return mntilistno !== undefined && mntilistno !== null && mntilistno !== ''
      })
      .map((m) => {
      // 실제 필드명: mntilistno, mntiname, mntiadd, mntihigh, mntiadmin
      // trail_match.mountain_info에 있을 수도 있음
      const mntilistno = m.mntilistno || m.trail_match?.mountain_info?.mntilistno
      const code = String(mntilistno) // mntilistno를 우선 사용 (필터링했으므로 항상 존재)
      const mountainInfo = m.trail_match?.mountain_info || {}
      const name = m.mntiname || mountainInfo.mntiname || m.name || m.MNTN_NM || m.mountainName || '이름 없음'
      let location = m.location || m.mntiadd || mountainInfo.mntiadd || m.MNTN_LOC || m.mountainLocation
      // 오른쪽 끝의 하이픈 제거
      if (location && typeof location === 'string') {
        location = location.replace(/-+$/, '').trim()
      }
      // mntihigh 처리: 문자열 "0" 또는 숫자 0이면 null, 그 외에는 값 + 'm'
      const mntihighValue = m.mntihigh !== undefined && m.mntihigh !== null ? m.mntihigh : (mountainInfo.mntihigh !== undefined && mountainInfo.mntihigh !== null ? mountainInfo.mntihigh : null)
      const height = mntihighValue !== null && mntihighValue !== undefined
        ? (mntihighValue === 0 || mntihighValue === '0' || String(mntihighValue).trim() === '0' ? null : String(mntihighValue) + 'm')
        : (m.height || m.MNTN_HG || m.mountainHeight)
      const admin = m.mntiadmin || mountainInfo.mntiadmin || m.admin
      
      // description 필드 찾기
      const description = m.description || m.MNTN_DESC || m.mountainDescription
      
      // center/coordinates 필드 찾기
      let center = null
      if (m.center) {
        if (typeof m.center === 'object') {
          if (m.center.lat !== undefined && m.center.lon !== undefined) {
            center = { lat: m.center.lat, lon: m.center.lon }
          } else if (Array.isArray(m.center) && m.center.length >= 2) {
            center = { lat: m.center[0], lon: m.center[1] }
          }
        }
      }
      
      if (!center && m.MNTN_CTR) {
        if (Array.isArray(m.MNTN_CTR) && m.MNTN_CTR.length >= 2) {
          center = { lat: m.MNTN_CTR[0], lon: m.MNTN_CTR[1] }
        } else if (typeof m.MNTN_CTR === 'object') {
          center = { 
            lat: m.MNTN_CTR.lat || m.MNTN_CTR[0] || m.MNTN_CTR.y, 
            lon: m.MNTN_CTR.lon || m.MNTN_CTR[1] || m.MNTN_CTR.x 
          }
        }
      }
      
      if (!center && m.coordinates) {
        if (typeof m.coordinates === 'object') {
          if (m.coordinates.lat !== undefined && m.coordinates.lon !== undefined) {
            center = { lat: m.coordinates.lat, lon: m.coordinates.lon }
          } else if (Array.isArray(m.coordinates) && m.coordinates.length >= 2) {
            center = { lat: m.coordinates[0], lon: m.coordinates[1] }
          }
        }
      }
      
      // lat, lon 또는 lat, lng 필드 확인
      if (!center) {
        const latValue = m.lat !== undefined ? m.lat : (m.LAT !== undefined ? m.LAT : null)
        const lonValue = (m.lon !== undefined ? m.lon : null) || 
                        (m.lng !== undefined ? m.lng : null) || 
                        (m.LON !== undefined ? m.LON : null) || 
                        (m.LNG !== undefined ? m.LNG : null)
        
        if (latValue !== null && latValue !== undefined && lonValue !== null && lonValue !== undefined) {
          center = { lat: latValue, lon: lonValue }
        }
      }
      
      // trail_match.mountain_info에서도 좌표 찾기
      if (!center && m.trail_match && m.trail_match.mountain_info) {
        const info = m.trail_match.mountain_info
        const latValue = info.lat !== undefined ? info.lat : (info.LAT !== undefined ? info.LAT : null)
        const lonValue = (info.lon !== undefined ? info.lon : null) || 
                        (info.lng !== undefined ? info.lng : null) || 
                        (info.LON !== undefined ? info.LON : null) || 
                        (info.LNG !== undefined ? info.LNG : null)
        
        if (latValue !== null && latValue !== undefined && lonValue !== null && lonValue !== undefined) {
          center = { lat: latValue, lon: lonValue }
        }
      }
      
      // 좌표 유효성 검사
      if (center) {
        const lat = Number(center.lat)
        const lon = Number(center.lon)
        if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
          center = null
        } else {
          center = { lat, lon }
        }
      }
      
      // zoom 필드
      const zoom = m.zoom || m.ZOOM || 13
      
      // origin 필드
      const origin = m.origin || m.MNTN_ORIGIN || m.mountainOrigin
      
      return {
        code: String(code), // mntilistno를 code로 사용 (검색 결과 링크용)
        _id: String(m._id), // _id도 포함 (필요시 사용)
        name: name,
        height: height,
        location: location,
        description: description,
        center: center,
        zoom: zoom,
        origin: origin,
        admin: admin,
        hasCourse: hasCourseSet.has(String(code)) // 등산코스가 있는지 여부
      }
    }).filter(m => m.code && m.name !== '이름 없음') // code가 없거나 이름이 없는 것은 제외
    
    // 이름이 중복되는 산은 위치(시, 도) 정보를 괄호에 추가
    const nameCounts = mappedMountains.reduce((acc, m) => {
      acc[m.name] = (acc[m.name] || 0) + 1
      return acc
    }, {})
    
    // 모든 산 이름에서 중복된 괄호 제거 (중복 여부와 관계없이)
    const cleanDuplicateParentheses = (name) => {
      if (!name || typeof name !== 'string') return name
      
      // 모든 괄호 쌍 찾기 (닫는 괄호가 없는 경우도 처리)
      // 패턴 1: "산이름 (시, 도) (도)" - 정상적인 두 개의 괄호
      let match = name.match(/^(.+?)\s*\(([^)]+)\)\s*\(([^)]+)\)\s*$/)
      if (match) {
        const baseName = match[1].trim()
        const firstLocation = match[2].trim()
        const secondLocation = match[3].trim()
        
        // 두 번째 괄호가 첫 번째 괄호의 끝 부분과 일치하는지 확인
        const firstParts = firstLocation.split(',').map(p => p.trim())
        const lastPartOfFirst = firstParts[firstParts.length - 1]
        
        if (secondLocation === lastPartOfFirst || firstLocation.includes(secondLocation)) {
          return `${baseName} (${firstLocation})`
        }
      }
      
      // 패턴 2: "산이름 (시, 도 (도)" - 닫는 괄호가 하나 빠진 경우
      match = name.match(/^(.+?)\s*\(([^)]+)\s*\(([^)]+)\)\s*$/)
      if (match) {
        const baseName = match[1].trim()
        const firstLocation = match[2].trim()
        const secondLocation = match[3].trim()
        
        const firstParts = firstLocation.split(',').map(p => p.trim())
        const lastPartOfFirst = firstParts[firstParts.length - 1]
        
        if (secondLocation === lastPartOfFirst || firstLocation.includes(secondLocation)) {
          return `${baseName} (${firstLocation})`
        }
      }
      
      // 패턴 3: 마지막에 반복되는 괄호가 있는 경우 (더 일반적인 패턴)
      // "산이름 (시, 도) (도)" 또는 "산이름 (시, 도) (시, 도)" 형식
      // 마지막 두 개의 괄호를 찾아서 비교
      const allMatches = name.match(/\(([^)]+)\)/g)
      if (allMatches && allMatches.length >= 2) {
        const lastTwo = allMatches.slice(-2)
        const firstLoc = lastTwo[0].replace(/[()]/g, '').trim()
        const secondLoc = lastTwo[1].replace(/[()]/g, '').trim()
        
        const firstParts = firstLoc.split(',').map(p => p.trim())
        const lastPartOfFirst = firstParts[firstParts.length - 1]
        
        // 두 번째가 첫 번째의 마지막 부분과 일치하면 제거
        if (secondLoc === lastPartOfFirst || firstLoc.includes(secondLoc)) {
          // 마지막 괄호 제거
          const lastParenIndex = name.lastIndexOf('(')
          if (lastParenIndex !== -1) {
            return name.substring(0, lastParenIndex).trim()
          }
        }
      }
      
      return name
    }
    
    const dedupedMountains = mappedMountains.map((m) => {
      // 먼저 중복된 괄호 제거
      let cleanedName = cleanDuplicateParentheses(m.name)
      
      if (nameCounts[m.name] > 1) {
        // 기존 이름에서 모든 괄호 안의 내용 제거 (중복 방지)
        const baseName = cleanedName.replace(/\s*\([^)]*\)\s*/g, '').trim()
        
        const { province, city } = parseCityProvince(m.location)
        const locationLabel = city && province ? `${city}, ${province}` : (city || province || '')
        if (locationLabel) {
          const newName = `${baseName} (${locationLabel})`
          console.log(`중복 산 이름 변경: "${m.name}" -> "${newName}" (location: ${m.location})`)
          return { ...m, name: newName }
        } else {
          console.log(`중복 산이지만 location 파싱 실패: "${m.name}" (location: ${m.location})`)
        }
      }
      
      // 중복이 아니어도 중복된 괄호가 있으면 제거
      if (cleanedName !== m.name) {
        console.log(`중복 괄호 제거: "${m.name}" -> "${cleanedName}"`)
        return { ...m, name: cleanedName }
      }
      
      return m
    })
    
    // code 기준으로 중복 제거 (동일한 code를 가진 산 중 첫 번째만 유지)
    const codeMap = new Map()
    const finalMountains = []
    for (const mountain of dedupedMountains) {
      if (!codeMap.has(mountain.code)) {
        codeMap.set(mountain.code, true)
        finalMountains.push(mountain)
      } else {
        console.log(`중복 code 제거: ${mountain.name} (code: ${mountain.code})`)
      }
    }
    
    console.log('매핑된 산 개수:', dedupedMountains.length)
    console.log('code 중복 제거 후 개수:', finalMountains.length)
    console.log('반환할 산 개수:', finalMountains.length)
    
    // 디버깅 정보 포함 (개발 환경에서만)
    const response = { 
      mountains: finalMountains,
      total: totalMountainListCount,
      returned: finalMountains.length
    }
    
    // 첫 번째 샘플 데이터도 포함 (필드명 확인용)
    if (mountains.length > 0 && process.env.NODE_ENV !== 'production') {
      response.debug = {
        sampleFields: Object.keys(mountains[0]),
        sampleData: mountains[0],
        firstMapped: dedupedMountains[0]
      }
    }
    
    res.json(response)
  } catch (error) {
    console.error('Error loading mountains from Mountain_list:', error)
    console.error('Error stack:', error.stack)
    // 에러 발생 시 기존 하드코딩된 목록으로 폴백
    try {
      const mountains = getAllMountains()
      res.json({ mountains })
    } catch (fallbackError) {
      res.status(500).json({ error: 'Failed to load mountain codes', details: error.message })
    }
  }
})

// 인기 있는 산 가져오기 (등산일지에 가장 많이 언급된 산)
app.get('/api/mountains/popular', async (req, res) => {
  try {
    const Post = (await import('./models/Post.js')).default
    
    // 등산일지(diary) 카테고리에서 mountainCode별로 집계
    const popularMountains = await Post.aggregate([
      {
        $match: {
          category: 'diary',
          mountainCode: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$mountainCode',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 7 // 상위 7개
      }
    ])
    
    // mountainCode로 산 정보 가져오기
    const mongoose = await import('mongoose')
    const db = mongoose.default.connection.db
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(c => c.name)
    
    let mountainListCollectionName = collectionNames.find(name => name === 'Mountain_list')
    if (!mountainListCollectionName) {
      mountainListCollectionName = collectionNames.find(name => name.toLowerCase() === 'mountain_list') || 'Mountain_list'
    }
    const actualCollection = db.collection(mountainListCollectionName)
    
    // DB에서 이미지 추출하는 헬퍼 함수 (상세 페이지와 동일한 로직)
    const getImageFromMountain = (mountain, mountainInfo = null) => {
      const imageFields = [
        // photo_url을 우선순위로 올림 (DB에 실제로 있는 필드)
        mountain.photo_url,
        mountain.image_url,
        mountain.photoUrl,
        mountain.imageUrl,
        mountain.image,
        mountain.photo,
        mountain.thumbnail,
        mountain.img,
        mountain.picture,
        mountain.mntiimage,
        mountain.MNTN_IMG,
        // trail_match 내부 필드들
        mountain.trail_match?.mountain_info?.photo_url,
        mountain.trail_match?.mountain_info?.image_url,
        mountain.trail_match?.mountain_info?.photoUrl,
        mountain.trail_match?.mountain_info?.imageUrl,
        mountain.trail_match?.mountain_info?.image,
        mountain.trail_match?.mountain_info?.photo,
        mountain.trail_match?.mountain_info?.thumbnail,
        // mountainInfo 파라미터로 전달된 경우
        mountainInfo?.photo_url,
        mountainInfo?.image_url,
        mountainInfo?.photoUrl,
        mountainInfo?.imageUrl,
        mountainInfo?.image,
        mountainInfo?.photo,
        mountainInfo?.thumbnail
      ]
      
      // null이 아닌 첫 번째 유효한 값 반환
      for (const img of imageFields) {
        if (img && typeof img === 'string' && img.trim() !== '') {
          let imageUrl = img.trim()
          
          // 빈 문자열이나 공백만 있는 경우 제외
          if (imageUrl.length === 0) continue
          
          // imgbb.co 페이지 URL인 경우 실제 이미지 URL 추출 시도
          if (imageUrl.includes('ibb.co/') && !imageUrl.includes('i.ibb.co')) {
            // 동기적으로는 불가능하므로 원본 URL 반환 (프론트엔드에서 처리)
            return imageUrl
          }
          
          // 유효한 URL 형식인지 간단히 확인 (http:// 또는 https://로 시작)
          if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://') || imageUrl.startsWith('/')) {
            return imageUrl
          }
        }
      }
      return null
    }
    
    const popularMountainsWithInfo = await Promise.all(
      popularMountains.map(async (item) => {
        const code = String(item._id)
        const codeNum = parseInt(code)
        
        // ObjectId 형식인지 확인
        const isObjectId = /^[0-9a-fA-F]{24}$/.test(code)
        let mountain = null
        
        if (isObjectId) {
          try {
            const objectId = new mongoose.default.Types.ObjectId(code)
            mountain = await actualCollection.findOne({ _id: objectId })
          } catch (e) {
            console.error('ObjectId 변환 실패:', e)
          }
        } else {
          // 더 넓은 범위로 검색 시도 (우선순위 순서)
          const searchQueries = [
            { mntilistno: codeNum },
            { mntilistno: code },
            { mntilistno: String(codeNum) },
            { 'trail_match.mountain_info.mntilistno': codeNum },
            { 'trail_match.mountain_info.mntilistno': code },
            { code: codeNum },
            { code: code },
            { code: String(codeNum) }
          ]
          
          for (const query of searchQueries) {
            mountain = await actualCollection.findOne(query)
            if (mountain) {
              console.log(`[인기 산] 찾음 - code: ${code}, 쿼리:`, Object.keys(query)[0], '이름:', mountain.mntiname || mountain.name)
              break
            }
          }
          
          // 찾지 못한 경우 로그
          if (!mountain) {
            console.log(`[인기 산] ❌ 찾지 못함 - code: ${code}`)
          }
        }
        
        if (mountain) {
          // DB에 저장된 실제 필드에서 산 이름 가져오기
          const mountainInfo = mountain.trail_match?.mountain_info || {}
          const fullName = mountain.mntiname || 
                      mountainInfo.mntiname || 
                      mountain.name ||
                      mountain.MNTN_NM ||
                      mountain.mountainName ||
                      '이름 없음'
          
          // 목록에서는 짧은 이름 사용 (예: "북한산 백운대" -> "북한산")
          const name = fullName
            .replace(/\s+(백운대|대청봉|천왕봉|인수봉|만경대|주봉|정상).*$/, '')
            .trim()
          
          // DB에서 이미지 가져오기 (상세 페이지와 동일한 로직)
          let image = getImageFromMountain(mountain, mountainInfo)
          
          // 디버깅: 이미지 필드 확인
          if (!image) {
            console.log(`[인기 산] ⚠️ 이미지 없음 - code: ${code}, name: ${name}`)
          } else {
            console.log(`[인기 산] ✅ 이미지 찾음 - code: ${code}, name: ${name}, image: ${image.substring(0, 60)}...`)
          }
          
          // DB에 이미지가 없으면 기본 이미지 매핑 사용 (폴백)
          if (!image) {
            const imageMap = {
              '287201304': '/images/popularity_img1.png',
              '428302602': '/images/popularity_img2.png',
              '488605302': '/images/popularity_img3.png',
              '421902904': '/images/popularity_img4.png',
              '483100401': '/images/popularity_img5.png',
              '457300301': '/images/popularity_img6.png',
              '438001301': '/images/popularity_img7.png'
            }
            image = imageMap[code] || '/images/popularity_img1.png'
          }
          
          return {
            id: code,
            name: name,
            image: image,
            count: item.count
          }
        } else {
          // 산 정보를 찾지 못한 경우에도 기본 정보로 반환
          console.log(`산 정보를 찾지 못함 - code: ${code}, codeNum: ${codeNum}`)
          
          // 기본 이름 매핑 (하드코딩)
          const nameMap = {
            '287201304': '북한산',
            '428302602': '설악산',
            '488605302': '지리산',
            '421902904': '태백산',
            '483100401': '계룡산',
            '457300301': '덕유산',
            '438001301': '소백산'
          }
          
          const imageMap = {
            '287201304': '/images/popularity_img1.png',
            '428302602': '/images/popularity_img2.png',
            '488605302': '/images/popularity_img3.png',
            '421902904': '/images/popularity_img4.png',
            '483100401': '/images/popularity_img5.png',
            '457300301': '/images/popularity_img6.png',
            '438001301': '/images/popularity_img7.png'
          }
          
          // 기본 이름 매핑에 있으면 반환
          if (nameMap[code]) {
            return {
              id: code,
              name: nameMap[code],
              image: imageMap[code] || '/images/popularity_img1.png',
              count: item.count
            }
          }
        }
        return null
      })
    )
    
    // null 제거 및 정렬
    const result = popularMountainsWithInfo
      .filter(item => item !== null)
      .sort((a, b) => b.count - a.count)
    
    // 최소 7개가 되도록 기본 산 추가 (DB에 없는 경우)
    const defaultMountains = [
      { id: '287201304', name: '북한산', image: '/images/popularity_img1.png' },
      { id: '428302602', name: '설악산', image: '/images/popularity_img2.png' },
      { id: '488605302', name: '지리산', image: '/images/popularity_img3.png' },
      { id: '421902904', name: '태백산', image: '/images/popularity_img4.png' },
      { id: '483100401', name: '계룡산', image: '/images/popularity_img5.png' },
      { id: '457300301', name: '덕유산', image: '/images/popularity_img6.png' },
      { id: '438001301', name: '소백산', image: '/images/popularity_img7.png' }
    ]
    
    // DB에서 가져온 산의 ID 목록
    const existingIds = new Set(result.map(m => m.id))
    
    // 기본 산 중에서 DB에 없는 것만 추가
    defaultMountains.forEach(mountain => {
      if (!existingIds.has(mountain.id) && result.length < 7) {
        result.push({ ...mountain, count: 0 })
      }
    })
    
    // 최대 7개로 제한
    res.json({ mountains: result.slice(0, 7) })
  } catch (error) {
    console.error('인기 있는 산 가져오기 오류:', error)
    // 에러 발생 시 기본 목록 반환
    res.json({
      mountains: [
        { id: '287201304', name: '북한산', image: '/images/popularity_img1.png' },
        { id: '428302602', name: '설악산', image: '/images/popularity_img2.png' },
        { id: '488605302', name: '지리산', image: '/images/popularity_img3.png' },
        { id: '421902904', name: '태백산', image: '/images/popularity_img4.png' },
        { id: '483100401', name: '계룡산', image: '/images/popularity_img5.png' },
        { id: '457300301', name: '덕유산', image: '/images/popularity_img6.png' },
        { id: '438001301', name: '소백산', image: '/images/popularity_img7.png' }
      ]
    })
  }
})

// 즐겨찾기한 산 목록 조회 (인증 필요) - /api/mountains/:code보다 먼저 정의해야 함
app.get('/api/mountains/favorites/my', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const user = await User.findById(userId).select('favoriteMountains').lean()
    
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    }

    const favoriteMountainCodes = user.favoriteMountains || []
    
    console.log('즐겨찾기한 산 목록 조회 - userId:', userId, 'codes:', favoriteMountainCodes)
    
    if (favoriteMountainCodes.length === 0) {
      console.log('즐겨찾기한 산이 없음')
      return res.json({ mountains: [] })
    }

    // MongoDB 연결 확인
    const mongoose = await import('mongoose')
    const db = mongoose.default.connection.db
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(c => c.name)
    
    let mountainListCollectionName = collectionNames.find(name => name === 'Mountain_list')
    if (!mountainListCollectionName) {
      mountainListCollectionName = collectionNames.find(name => 
        name.toLowerCase() === 'mountain_list'
      ) || 'Mountain_list'
    }
    
    const actualCollection = db.collection(mountainListCollectionName)
    
    // 즐겨찾기한 산 코드들로 산 정보 조회
    // 산 상세 정보 API를 재사용하여 일관된 데이터 형식 보장
    const mountains = []
    for (const code of favoriteMountainCodes) {
      console.log('산 정보 조회 시도 - code:', code, 'type:', typeof code)
      
      try {
        // 내부적으로 산 상세 정보 조회 로직 재사용
        const codeNum = parseInt(code)
        const isObjectId = /^[0-9a-fA-F]{24}$/.test(code)
        
        let mountain = null
        if (isObjectId) {
          try {
            const objectId = new mongoose.default.Types.ObjectId(code)
            mountain = await actualCollection.findOne({ _id: objectId })
          } catch (e) {
            console.log('ObjectId 변환 실패:', e)
          }
        } else {
          // 여러 형식으로 검색 시도
          const searchQueries = [
            { mntilistno: codeNum },
            { mntilistno: Number(code) },
            { mntilistno: code },
            { mntilistno: String(codeNum) },
            { code: codeNum },
            { code: Number(code) },
            { code: code },
            { code: String(codeNum) },
            { 'trail_match.mountain_info.mntilistno': codeNum },
            { 'trail_match.mountain_info.mntilistno': code }
          ]
          
          for (const query of searchQueries) {
            mountain = await actualCollection.findOne(query)
            if (mountain) {
              console.log('산 정보 찾음 (query:', query, ')')
              break
            }
          }
        }
        
        if (mountain) {
          console.log('산 정보 찾음:', mountain.mntiname || mountain.name)
          const mountainInfo = mountain.trail_match?.mountain_info || {}
          const mappedMountain = {
            code: String(mountain.mntilistno || mountainInfo.mntilistno || mountain.code || mountain.MNTN_CD || code),
            name: mountain.mntiname || mountainInfo.mntiname || mountain.name || mountain.MNTN_NM || '이름 없음',
            height: (() => {
              const mntihighValue = mountain.mntihigh !== undefined && mountain.mntihigh !== null 
                ? mountain.mntihigh 
                : (mountainInfo.mntihigh !== undefined && mountainInfo.mntihigh !== null 
                  ? mountainInfo.mntihigh 
                  : null)
              if (mntihighValue !== null && mntihighValue !== undefined) {
                if (mntihighValue === 0 || mntihighValue === '0' || String(mntihighValue).trim() === '0') {
                  return null
                }
                return String(mntihighValue) + 'm'
              }
              return mountain.height || mountain.MNTN_HG || null
            })(),
            location: (() => {
              const loc = mountain.mntiadd || mountainInfo.mntiadd || mountain.location || mountain.MNTN_LOC || null
              if (loc && typeof loc === 'string') {
                return loc.replace(/-+$/, '').trim()
              }
              return loc
            })(),
            center: mountain.center || (mountain.MNTN_CTR ? { lat: mountain.MNTN_CTR.lat || mountain.MNTN_CTR[0], lon: mountain.MNTN_CTR.lon || mountain.MNTN_CTR[1] } : null) || null
          }
          mountains.push(mappedMountain)
        } else {
          console.log('DB에서 산 정보를 찾지 못함, MOUNTAIN_ROUTES에서 검색 - code:', code)
          // DB에 없으면 MOUNTAIN_ROUTES에서 찾기
          const mountainInfo = getMountainInfo(code)
          if (mountainInfo) {
            console.log('MOUNTAIN_ROUTES에서 산 정보 찾음:', mountainInfo.name)
            mountains.push({
              code: code,
              name: mountainInfo.name,
              height: null,
              location: null,
              center: mountainInfo.center ? { lat: mountainInfo.center[0], lon: mountainInfo.center[1] } : null
            })
          } else {
            console.log('MOUNTAIN_ROUTES에서도 산 정보를 찾지 못함 - code:', code)
            // 그래도 코드와 함께 추가 (최소한 링크는 작동하도록)
            mountains.push({
              code: code,
              name: `산 (코드: ${code})`,
              height: null,
              location: null,
              center: null
            })
          }
        }
      } catch (err) {
        console.error('산 정보 조회 중 오류 - code:', code, 'error:', err)
        // 오류가 발생해도 최소한 코드는 포함
        mountains.push({
          code: code,
          name: `산 (코드: ${code})`,
          height: null,
          location: null,
          center: null
        })
      }
    }
    
    console.log('최종 반환할 산 목록:', mountains.length, '개', mountains.map(m => m.name))
    res.json({ mountains })
  } catch (error) {
    console.error('즐겨찾기한 산 목록 조회 오류:', error)
    res.status(500).json({ error: '즐겨찾기한 산 목록을 불러오는 중 오류가 발생했습니다.' })
  }
})

// 산 즐겨찾기 토글 (인증 필요) - /api/mountains/:code보다 먼저 정의해야 함
app.post('/api/mountains/:code/favorite', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const { code } = req.params
    const mountainCode = String(code)

    console.log('산 즐겨찾기 토글 요청 - userId:', userId, 'code:', mountainCode)

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    }

    // 즐겨찾기 목록 초기화 (없으면)
    if (!user.favoriteMountains) {
      user.favoriteMountains = []
    }

    console.log('현재 즐겨찾기 목록:', user.favoriteMountains)

    const favoriteIndex = user.favoriteMountains.indexOf(mountainCode)
    if (favoriteIndex > -1) {
      // 이미 즐겨찾기에 있으면 제거
      user.favoriteMountains.splice(favoriteIndex, 1)
      await user.save()
      console.log('즐겨찾기 제거 완료 - 새로운 목록:', user.favoriteMountains)
      res.json({ 
        isFavorited: false, 
        message: '즐겨찾기에서 제거되었습니다.' 
      })
    } else {
      // 즐겨찾기에 추가
      user.favoriteMountains.push(mountainCode)
      await user.save()
      console.log('즐겨찾기 추가 완료 - 새로운 목록:', user.favoriteMountains)
      res.json({ 
        isFavorited: true, 
        message: '즐겨찾기에 추가되었습니다.' 
      })
    }
  } catch (error) {
    console.error('산 즐겨찾기 처리 오류:', error)
    res.status(500).json({ error: '즐겨찾기 처리 중 오류가 발생했습니다.' })
  }
})

// 특정 산의 통제 정보 조회
app.get('/api/mountains/:code/control', async (req, res) => {
  try {
    const { code } = req.params
    const mountainCode = String(code)

    // MongoDB 연결
    const mongoose = await import('mongoose')
    const db = mongoose.default.connection.db

    // mountain_control 컬렉션 찾기
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(c => c.name)
    const controlCollectionName = collectionNames.find(name => 
      name.toLowerCase().includes('control')
    ) || 'mountain_control'

    // 모델이 이미 존재하면 삭제 후 재생성
    if (mongoose.default.models.Control) {
      delete mongoose.default.models.Control
    }
    const Control = mongoose.default.model('Control', 
      new mongoose.default.Schema({}, { strict: false }), 
      controlCollectionName
    )

    // mountainRoutes에서 산 이름 가져오기
    const mountainInfo = getMountainInfo(mountainCode)
    let mountainName = null

    if (mountainInfo && mountainInfo.name) {
      mountainName = mountainInfo.name
    } else {
      // Mountain_list에서 산 정보 가져오기
      // 모델이 이미 존재하면 삭제 후 재생성
      if (mongoose.default.models.Mountain) {
        delete mongoose.default.models.Mountain
      }
      const Mountain = mongoose.default.model('Mountain', 
        new mongoose.default.Schema({}, { strict: false }), 
        'Mountain_list'
      )
      
      const mountain = await Mountain.findOne({
        $or: [
          { mntilistno: mountainCode },
          { code: mountainCode },
          { 'trail_match.mountain_info.mntilistno': mountainCode }
        ]
      }).lean()

      if (mountain) {
        mountainName = mountain.mntiname || mountain.trail_match?.mountain_info?.mntiname || mountain.name
      }
    }

    console.log(`통제 정보 조회 - 산 코드: ${mountainCode}, 산 이름: ${mountainName}`)

    if (!mountainName) {
      console.log('산 이름을 찾을 수 없음 - 통제 없음 반환')
      return res.json({ 
        control_status: '통제 없음',
        updated_at: null
      })
    }

    // 산 이름으로 통제 정보 찾기 (여러 방법 시도)
    let controlInfo = null
    
    // 산 이름 정리 (괄호 제거, 공백 정리)
    const nameWithoutParentheses = mountainName.split('(')[0].trim()
    const cleanName = nameWithoutParentheses.replace(/\s+/g, ' ').trim()
    
    console.log(`통제 정보 매칭 시도 - 원본: "${mountainName}", 정리: "${cleanName}"`)
    
    // 모든 통제 정보 가져와서 직접 매칭 (더 확실한 방법)
    // Control은 Mongoose 모델이므로 .lean() 사용 가능
    let allControls = []
    try {
      allControls = await Control.find({}).lean()
      console.log(`총 ${allControls.length}개 통제 정보 발견`)
      if (allControls.length > 0) {
        console.log('통제 정보 목록:', allControls.map(c => c?.mountain_name || '이름 없음'))
      }
    } catch (findError) {
      console.error('통제 정보 조회 중 오류:', findError)
      // 컬렉션 직접 사용으로 폴백
      const controlCollection = db.collection(controlCollectionName)
      const controlsArray = await controlCollection.find({}).toArray()
      allControls = controlsArray
      console.log(`폴백: 총 ${allControls.length}개 통제 정보 발견 (컬렉션 직접 사용)`)
    }
    
    // 1. 정확한 매칭 (대소문자 무시, 공백 무시)
    controlInfo = allControls.find(control => {
      if (!control || !control.mountain_name) return false
      const controlName = (control.mountain_name || '').split('(')[0].trim().replace(/\s+/g, ' ')
      return controlName.toLowerCase() === cleanName.toLowerCase()
    })
    
    if (controlInfo) {
      console.log(`1. 정확한 매칭 성공: "${controlInfo.mountain_name}"`)
    }
    
    // 2. 포함 관계 매칭
    if (!controlInfo) {
      controlInfo = allControls.find(control => {
        if (!control || !control.mountain_name) return false
        const controlName = (control.mountain_name || '').split('(')[0].trim().replace(/\s+/g, ' ')
        return controlName.toLowerCase().includes(cleanName.toLowerCase()) || 
               cleanName.toLowerCase().includes(controlName.toLowerCase())
      })
      if (controlInfo) {
        console.log(`2. 포함 관계 매칭 성공: "${controlInfo.mountain_name}"`)
      }
    }
    
    // 3. 부분 문자열 매칭 (최소 2글자 이상 일치)
    if (!controlInfo && cleanName.length >= 2) {
      controlInfo = allControls.find(control => {
        if (!control || !control.mountain_name) return false
        const controlName = (control.mountain_name || '').split('(')[0].trim().replace(/\s+/g, ' ')
        // 최소 2글자 이상 일치하는지 확인
        for (let i = 0; i <= cleanName.length - 2; i++) {
          const substr = cleanName.substring(i, i + 2)
          if (controlName.toLowerCase().includes(substr.toLowerCase())) {
            return true
          }
        }
        return false
      })
      if (controlInfo) {
        console.log(`3. 부분 문자열 매칭 성공: "${controlInfo.mountain_name}"`)
      }
    }

    console.log(`통제 정보 조회 결과:`, controlInfo ? { 
      mountain_name: controlInfo.mountain_name,
      control_status: controlInfo.control_status, 
      updated_at: controlInfo.updated_at 
    } : '없음')

    if (controlInfo) {
      // control_status가 산 이름과 같으면 "통제 없음"으로 처리 (데이터 오류 방지)
      let controlStatus = controlInfo.control_status || '정보 없음'
      if (controlStatus === controlInfo.mountain_name || controlStatus === cleanName) {
        console.log(`통제 상태가 산 이름과 동일함 (${controlStatus}) - "통제 없음"으로 처리`)
        controlStatus = '통제 없음'
      }
      
      const response = {
        control_status: controlStatus,
        updated_at: controlInfo.updated_at || null
      }
      console.log('응답 데이터:', response)
      res.json(response)
    } else {
      console.log('통제 정보를 찾을 수 없음 - "통제 없음" 반환')
      res.json({ 
        control_status: '통제 없음',
        updated_at: null
      })
    }
  } catch (error) {
    console.error('통제 정보 조회 오류:', error)
    console.error('에러 스택:', error.stack)
    res.status(500).json({ 
      error: '통제 정보를 불러오는 중 오류가 발생했습니다.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
})

// 특정 산 주변 숙소 조회 (더 구체적인 라우트를 먼저 정의)
app.get('/api/mountains/:code/lodgings', async (req, res) => {
  try {
    const { code } = req.params
    const mountainCode = String(code)

    // 거리 계산 함수 (Haversine 공식) - km 단위
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
      const R = 6371 // 지구 반지름 (km)
      const dLat = (lat2 - lat1) * Math.PI / 180
      const dLon = (lon2 - lon1) * Math.PI / 180
      const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      return R * c
    }

    // MongoDB 연결
    const mongoose = await import('mongoose')
    const db = mongoose.default.connection.db

    // mountain_lodging 컬렉션 찾기
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(c => c.name)
    const lodgingCollectionName = collectionNames.find(name => 
      name.toLowerCase().includes('lodging')
    ) || 'mountain_lodging'

    // 모델이 이미 존재하면 삭제 후 재생성
    if (mongoose.default.models.Lodging) {
      delete mongoose.default.models.Lodging
    }
    const Lodging = mongoose.default.model('Lodging', 
      new mongoose.default.Schema({}, { strict: false }), 
      lodgingCollectionName
    )

    // mountainRoutes에서 산 이름 가져오기
    const mountainInfo = getMountainInfo(mountainCode)
    let mountainName = null
    let mountainLocation = null // 산의 주소 정보
    let mountainCenter = null

    if (mountainInfo && mountainInfo.name) {
      mountainName = mountainInfo.name
      mountainLocation = mountainInfo.location || null
      if (mountainInfo.center && Array.isArray(mountainInfo.center) && mountainInfo.center.length >= 2) {
        mountainCenter = { lat: mountainInfo.center[0], lon: mountainInfo.center[1] }
      }
    } else {
      // Mountain_list에서 산 이름 찾기
      const actualCollections = await db.listCollections().toArray()
      const actualCollectionNames = actualCollections.map(c => c.name)
      let mountainListCollectionName = actualCollectionNames.find(name => name === 'Mountain_list')
      if (!mountainListCollectionName) {
        mountainListCollectionName = actualCollectionNames.find(name => 
          name.toLowerCase() === 'mountain_list'
        ) || 'Mountain_list'
      }
      const actualCollection = db.collection(mountainListCollectionName)
      
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(code)
      let mountain = null
      
      if (isObjectId) {
        try {
          const objectId = new mongoose.default.Types.ObjectId(code)
          mountain = await actualCollection.findOne({ _id: objectId })
        } catch (e) {
          console.error('ObjectId 변환 실패:', e)
        }
      } else {
        const codeNum = parseInt(code)
        mountain = await actualCollection.findOne({
          $or: [
            { mntilistno: codeNum },
            { mntilistno: code },
            { 'trail_match.mountain_info.mntilistno': codeNum },
            { 'trail_match.mountain_info.mntilistno': code },
            { code: codeNum },
            { code: code }
          ]
        })
      }
      
      if (mountain) {
        mountainName = mountain.mntiname || mountain.trail_match?.mountain_info?.mntiname || mountain.name
        mountainLocation = mountain.mntiadd || mountain.location || mountain.trail_match?.mountain_info?.mntiadd || null
        
        // 산의 좌표 가져오기
        if (mountain.center) {
          if (typeof mountain.center === 'object' && mountain.center.lat !== undefined && mountain.center.lon !== undefined) {
            mountainCenter = { lat: mountain.center.lat, lon: mountain.center.lon }
          } else if (Array.isArray(mountain.center) && mountain.center.length >= 2) {
            mountainCenter = { lat: mountain.center[0], lon: mountain.center[1] }
          }
        }
        // trail_match.mountain_info에서도 좌표 찾기
        if (!mountainCenter && mountain.trail_match?.mountain_info) {
          const info = mountain.trail_match.mountain_info
          if (info.lat !== undefined && info.lon !== undefined) {
            mountainCenter = { lat: info.lat, lon: info.lon }
          } else if (info.LAT !== undefined && info.LON !== undefined) {
            mountainCenter = { lat: info.LAT, lon: info.LON }
          }
        }
      }
    }

    let lodgings = []
    
    // 산 코드로만 숙소 필터링 (거리 제한 없음, 매칭된 숙소만 가져오기)
    const lodgingCodeFields = ['mountainCode', 'mountain_code', 'mntilistno', 'code', 'mtn_cd']
    const lodgingCodeIds = [mountainCode, String(mountainCode), parseInt(mountainCode)].filter(v => v !== undefined && v !== null && v !== '' && !Number.isNaN(v))
    console.log(`숙소 쿼리 생성 - mountainCode: ${mountainCode} (산 이름 제외, 코드만 사용)`)
    const lodgingOr = []
    lodgingCodeFields.forEach(f => lodgingCodeIds.forEach(id => lodgingOr.push({ [f]: id })))
    const lodgingQuery = lodgingOr.length > 0 ? { $or: lodgingOr } : {}
    console.log(`숙소 조회 - 산 코드로만 매칭 (거리 제한 없음), 조건 수: ${lodgingOr.length}`)
    
    lodgings = await Lodging.find(lodgingQuery).lean()
    console.log(`숙소 조회 - 총 ${lodgings.length}개 숙소 문서 (산 코드로만 매칭)`)
    
    // 컬렉션에 데이터가 있는지 확인
    const totalCount = await Lodging.countDocuments({})
    console.log(`mountain_lodging 컬렉션 총 문서 수: ${totalCount}`)
    
    // 좌표가 있는 숙소 개수 확인
    const withCoords = lodgings.filter(l => {
      const lat = l.lodging_lat || l.lat || l.geometry?.location?.lat
      const lng = l.lodging_lng || l.lng || l.geometry?.location?.lng
      return lat && lng && !isNaN(lat) && !isNaN(lng)
    })
    console.log(`좌표가 있는 숙소: ${withCoords.length}개 / ${lodgings.length}개`)

    // 숙소 데이터 형식 변환 (거리 제한 없음, 산 코드로 매칭된 숙소만)
    console.log(`=== 숙소 필터링 시작 ===`)
    console.log(`산 이름: ${mountainName}`)
    console.log(`산 좌표:`, mountainCenter)
    console.log(`총 ${lodgings.length}개 숙소 발견`)
    console.log(`거리 제한: 없음 (산 코드로 매칭된 숙소만)`)
    
    // 처음 3개 숙소의 데이터 구조 확인
    if (lodgings.length > 0) {
      console.log(`첫 번째 숙소 샘플:`, {
        name: lodgings[0].lodging_name || lodgings[0].name,
        lat: lodgings[0].lodging_lat || lodgings[0].lat || lodgings[0].geometry?.location?.lat,
        lng: lodgings[0].lodging_lng || lodgings[0].lng || lodgings[0].geometry?.location?.lng,
        keys: Object.keys(lodgings[0])
      })
    }
    
    const lodgingList = lodgings
      .map(lodging => {
        // 산 코드가 정확히 일치하는지 확인 (이름이 아닌 코드로만 매칭)
        const lodgingMountainCode = lodging.mntilistno || lodging.mountainCode || lodging.code
        const lodgingMountainCodeStr = lodgingMountainCode ? String(lodgingMountainCode) : null
        const requestedMountainCodeStr = String(mountainCode)
        
        // 산 코드가 일치하지 않으면 제외
        if (!lodgingMountainCodeStr || lodgingMountainCodeStr !== requestedMountainCodeStr) {
          return null
        }

        const lat = lodging.lodging_lat || lodging.lat || lodging.geometry?.location?.lat
        const lng = lodging.lodging_lng || lodging.lng || lodging.geometry?.location?.lng
        
        // 거리 계산 (표시용, 필터링은 하지 않음)
        let distance = null
        if (mountainCenter && lat && lng && !isNaN(lat) && !isNaN(lng)) {
          distance = calculateDistance(mountainCenter.lat, mountainCenter.lon, lat, lng)
          // 처음 10개만 상세 로그 출력
          if (lodgings.indexOf(lodging) < 10) {
            console.log(`숙소 거리 계산 - ${lodging.lodging_name || lodging.name}: 산(${mountainCenter.lat}, ${mountainCenter.lon}) -> 숙소(${lat}, ${lng}) = ${distance?.toFixed(2)}km`)
          }
        }
        
        return {
          name: lodging.lodging_name || lodging.name,
          address: lodging.lodging_address || lodging.address || lodging.vicinity,
          rating: lodging.lodging_rating || lodging.rating,
          user_ratings_total: lodging.lodging_user_ratings_total || lodging.user_ratings_total || 0,
          place_id: lodging.lodging_place_id || lodging.place_id,
          lat: lat,
          lng: lng,
          geometry: {
            location: {
              lat: lat,
              lng: lng
            }
          },
          maps_url: lodging.lodging_detail_url || lodging.maps_url,
          // photo_reference는 별도 필드로만 전달, photo에는 직접 URL만
          photo: (() => {
            const photoUrl = lodging.lodging_photo_url || lodging.photo
            // 직접 URL인 경우만 반환 (http/https로 시작)
            if (photoUrl && (photoUrl.startsWith('http') || photoUrl.startsWith('https'))) {
              return photoUrl
            }
            return null
          })(),
          photo_reference: lodging.lodging_photo_reference || lodging.photo_reference,
          image: lodging.image || lodging.thumbnail,
          thumbnail: lodging.thumbnail || lodging.image,
          mountainName: mountainName,
          distance: distance // 거리 정보 추가
        }
      })
      .filter(lodging => lodging !== null) // null 제거 (거리 제한으로 제외된 항목)
    
    // 거리 순으로 정렬 (가까운 순)
    lodgingList.sort((a, b) => {
      if (a.distance === null && b.distance === null) return 0
      if (a.distance === null) return 1
      if (b.distance === null) return -1
      return a.distance - b.distance
    })
    
    console.log(`=== 최종 응답 ===`)
    console.log(`반환할 숙소 개수: ${lodgingList.length}개 (산 코드로 매칭, 거리 제한 없음, 거리 순 정렬)`)
    
    res.json({ lodgings: lodgingList })
  } catch (error) {
    console.error('주변 숙소 조회 오류:', error)
    console.error('오류 스택:', error.stack)
    res.status(500).json({ error: '주변 숙소 정보를 불러오는 중 오류가 발생했습니다.', details: error.message })
  }
})

// 특정 산 주변 맛집 조회 (더 구체적인 라우트를 먼저 정의)
app.get('/api/mountains/:code/restaurants', async (req, res) => {
  try {
    const { code } = req.params
    const mountainCode = String(code)

    // 거리 계산 함수 (Haversine 공식) - km 단위
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
      const R = 6371 // 지구 반지름 (km)
      const dLat = (lat2 - lat1) * Math.PI / 180
      const dLon = (lon2 - lon1) * Math.PI / 180
      const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      return R * c
    }

    // MongoDB 연결
    const mongoose = await import('mongoose')
    const db = mongoose.default.connection.db

    // mountain_rastaurant 컬렉션 찾기
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(c => c.name)
    const restaurantCollectionName = collectionNames.find(name => 
      name.toLowerCase().includes('rastaurant') || name.toLowerCase().includes('restaurant')
    ) || 'mountain_rastaurant'

    // 모델이 이미 존재하면 삭제 후 재생성
    if (mongoose.default.models.Restaurant) {
      delete mongoose.default.models.Restaurant
    }
    const Restaurant = mongoose.default.model('Restaurant', 
      new mongoose.default.Schema({}, { strict: false }), 
      restaurantCollectionName
    )

    // mountainRoutes에서 산 이름 가져오기
    const mountainInfo = getMountainInfo(mountainCode)
    let mountainName = null
    let mountainLocation = null // 산의 주소 정보
    let mountainCenter = null

    if (mountainInfo && mountainInfo.name) {
      mountainName = mountainInfo.name
      mountainLocation = mountainInfo.location || null
      if (mountainInfo.center && Array.isArray(mountainInfo.center) && mountainInfo.center.length >= 2) {
        mountainCenter = { lat: mountainInfo.center[0], lon: mountainInfo.center[1] }
      }
    } else {
      // Mountain_list에서 산 이름 찾기
      const actualCollections = await db.listCollections().toArray()
      const actualCollectionNames = actualCollections.map(c => c.name)
      let mountainListCollectionName = actualCollectionNames.find(name => name === 'Mountain_list')
      if (!mountainListCollectionName) {
        mountainListCollectionName = actualCollectionNames.find(name => 
          name.toLowerCase() === 'mountain_list'
        ) || 'Mountain_list'
      }
      const actualCollection = db.collection(mountainListCollectionName)
      
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(code)
      let mountain = null
      
      if (isObjectId) {
        try {
          const objectId = new mongoose.default.Types.ObjectId(code)
          mountain = await actualCollection.findOne({ _id: objectId })
        } catch (e) {
          console.error('ObjectId 변환 실패:', e)
        }
      } else {
        const codeNum = parseInt(code)
        mountain = await actualCollection.findOne({
          $or: [
            { mntilistno: codeNum },
            { mntilistno: code },
            { 'trail_match.mountain_info.mntilistno': codeNum },
            { 'trail_match.mountain_info.mntilistno': code },
            { code: codeNum },
            { code: code }
          ]
        })
      }
      
      if (mountain) {
        mountainName = mountain.mntiname || mountain.trail_match?.mountain_info?.mntiname || mountain.name
        mountainLocation = mountain.mntiadd || mountain.location || mountain.trail_match?.mountain_info?.mntiadd || null
        
        // 산의 좌표 가져오기
        if (mountain.center) {
          if (typeof mountain.center === 'object' && mountain.center.lat !== undefined && mountain.center.lon !== undefined) {
            mountainCenter = { lat: mountain.center.lat, lon: mountain.center.lon }
          } else if (Array.isArray(mountain.center) && mountain.center.length >= 2) {
            mountainCenter = { lat: mountain.center[0], lon: mountain.center[1] }
          }
        }
        // trail_match.mountain_info에서도 좌표 찾기
        if (!mountainCenter && mountain.trail_match?.mountain_info) {
          const info = mountain.trail_match.mountain_info
          if (info.lat !== undefined && info.lon !== undefined) {
            mountainCenter = { lat: info.lat, lon: info.lon }
          } else if (info.LAT !== undefined && info.LON !== undefined) {
            mountainCenter = { lat: info.LAT, lon: info.LON }
          }
        }
      }
    }

    let restaurants = []
    
    // 산 코드로만 맛집 필터링 (이름 제외, 중복 방지)
    // 맛집 데이터는 restaurants 배열 내부에 산 정보가 있음
    const restaurantCodeFields = ['mountainCode', 'mountain_code', 'mntilistno', 'code', 'mtn_cd']
    const restaurantCodeIds = [mountainCode, String(mountainCode), parseInt(mountainCode)].filter(v => v !== undefined && v !== null && v !== '' && !Number.isNaN(v))
    console.log(`맛집 쿼리 생성 - mountainCode: ${mountainCode} (산 이름 제외, 코드만 사용)`)
    const restaurantOr = []
    
    // restaurants 배열 내부 필드로 검색 (코드 필드만)
    restaurantCodeFields.forEach(f => {
      restaurantCodeIds.forEach(id => {
        restaurantOr.push({ [`restaurants.${f}`]: id })
      })
    })
    
    // 최상위 레벨도 확인 (코드 필드만)
    restaurantCodeFields.forEach(f => {
      restaurantCodeIds.forEach(id => {
        restaurantOr.push({ [f]: id })
      })
    })
    
    const restaurantQuery = restaurantOr.length > 0 ? { $or: restaurantOr } : {}
    console.log(`맛집 조회 - 산 코드로만 매칭 (거리 제한 없음), 조건 수: ${restaurantOr.length}`)
    
    restaurants = await Restaurant.find(restaurantQuery).lean()
    console.log(`맛집 조회 - 총 ${restaurants.length}개 맛집 문서 (산 코드로만 매칭)`)
    
    // 좌표가 있는 맛집 개수 확인
    let withCoords = 0
    restaurants.forEach(r => {
      const items = r.restaurants && Array.isArray(r.restaurants) ? r.restaurants : [r]
      items.forEach(item => {
        const lat = item.lat || item.geometry?.location?.lat
        const lng = item.lng || item.geometry?.location?.lng
        if (lat && lng && !isNaN(lat) && !isNaN(lng)) withCoords++
      })
    })
    console.log(`좌표가 있는 맛집: ${withCoords}개`)

    // 맛집 데이터 형식 변환 (거리 제한 없음, 산 이름/코드로 매칭된 맛집만)
    console.log(`=== 맛집 필터링 시작 ===`)
    console.log(`산 이름: ${mountainName}`)
    console.log(`산 좌표:`, mountainCenter)
    console.log(`총 ${restaurants.length}개 맛집 문서 발견`)
    console.log(`거리 제한: 없음 (산 이름/코드로 매칭된 맛집만)`)
    
    // 처음 3개 맛집의 데이터 구조 확인
    if (restaurants.length > 0) {
      const firstRestaurant = restaurants[0]
      const firstItem = firstRestaurant.restaurants && Array.isArray(firstRestaurant.restaurants) 
        ? firstRestaurant.restaurants[0] 
        : firstRestaurant
      console.log(`첫 번째 맛집 샘플:`, {
        name: firstItem.name,
        lat: firstItem.lat || firstItem.geometry?.location?.lat,
        lng: firstItem.lng || firstItem.geometry?.location?.lng,
        keys: Object.keys(firstItem)
      })
    }
    
    const restaurantList = []

    const pushRestaurant = (restaurant) => {
      if (!restaurant) return
      
      // 산 코드가 정확히 일치하는지 확인 (이름이 아닌 코드로만 매칭)
      const restaurantMountainCode = restaurant.mntilistno || restaurant.mountainCode || restaurant.code
      const restaurantMountainCodeStr = restaurantMountainCode ? String(restaurantMountainCode) : null
      const requestedMountainCodeStr = String(mountainCode)
      
      // 산 코드가 일치하지 않으면 제외
      if (!restaurantMountainCodeStr || restaurantMountainCodeStr !== requestedMountainCodeStr) {
        console.log(`맛집 제외 - ${restaurant.name}: 맛집 산 코드(${restaurantMountainCodeStr}) !== 요청 산 코드(${requestedMountainCodeStr})`)
        return
      }

      const lat = restaurant.lat || restaurant.geometry?.location?.lat
      const lng = restaurant.lng || restaurant.geometry?.location?.lng
      
      // 거리 계산 (표시용, 필터링은 하지 않음)
      let distance = null
      if (mountainCenter && lat && lng && !isNaN(lat) && !isNaN(lng)) {
        distance = calculateDistance(mountainCenter.lat, mountainCenter.lon, lat, lng)
        // 처음 10개만 상세 로그 출력
        if (restaurantList.length < 10) {
          console.log(`맛집 거리 계산 - ${restaurant.name}: 산(${mountainCenter.lat}, ${mountainCenter.lon}) -> 맛집(${lat}, ${lng}) = ${distance?.toFixed(2)}km`)
        }
      }

      restaurantList.push({
        name: restaurant.name,
        address: restaurant.address || restaurant.vicinity,
        rating: restaurant.rating,
        user_ratings_total: restaurant.user_ratings_total || 0,
        place_id: restaurant.place_id,
        lat: lat,
        lng: lng,
        geometry: {
          location: {
            lat: lat,
            lng: lng
          }
        },
        maps_url: restaurant.maps_url,
        photo: (() => {
          // photo 필드 확인 (이미 완전한 URL일 수 있음)
          let photoUrl = restaurant.photo
          
          // photo가 없으면 photos 배열에서 photo_reference 추출
          if (!photoUrl && restaurant.photos && Array.isArray(restaurant.photos) && restaurant.photos.length > 0) {
            const firstPhoto = restaurant.photos[0]
            if (firstPhoto.photo_reference) {
              // photo_reference가 있으면 나중에 프론트엔드에서 URL 생성
              // 여기서는 photo_reference만 저장
              return null // photo_reference는 별도 필드로 반환
            }
          }
          
          // 직접 URL인 경우만 반환 (http/https로 시작)
          if (photoUrl && (photoUrl.startsWith('http') || photoUrl.startsWith('https'))) {
            return photoUrl
          }
          return null
        })(),
        photo_reference: (() => {
          // photo_reference 필드 확인
          if (restaurant.photo_reference) {
            return restaurant.photo_reference
          }
          // photos 배열에서 추출
          if (restaurant.photos && Array.isArray(restaurant.photos) && restaurant.photos.length > 0) {
            const firstPhoto = restaurant.photos[0]
            if (firstPhoto.photo_reference) {
              return firstPhoto.photo_reference
            }
          }
          return null
        })(),
        image: restaurant.image || restaurant.thumbnail || restaurant.photo,
        thumbnail: restaurant.thumbnail || restaurant.image || restaurant.photo,
        phone: restaurant.phone || restaurant.international_phone_number,
        mountainName: mountainName,
        distance: distance // 거리 정보 추가
      })
    }

    restaurants.forEach(restaurantData => {
      if (restaurantData.restaurants && Array.isArray(restaurantData.restaurants)) {
        restaurantData.restaurants.forEach(r => pushRestaurant(r))
      } else {
        // 문서가 개별 맛집인 경우도 처리
        pushRestaurant(restaurantData)
      }
    })
    
    // 거리 순으로 정렬 (가까운 순)
    restaurantList.sort((a, b) => {
      if (a.distance === null && b.distance === null) return 0
      if (a.distance === null) return 1
      if (b.distance === null) return -1
      return a.distance - b.distance
    })
    
    console.log(`=== 최종 응답 ===`)
    console.log(`반환할 맛집 개수: ${restaurantList.length}개 (산 이름/코드로 매칭, 거리 제한 없음, 거리 순 정렬)`)
    
    // 디버깅 정보 포함 (쿼리 결과가 없을 때)
    const response = { restaurants: restaurantList }
    if (restaurants.length === 0 && totalCount > 0) {
      response.debug = {
        query: restaurantQuery,
        queryCount: restaurantOr.length,
        restaurantIds: restaurantIds,
        mountainCode: mountainCode,
        mountainName: mountainName,
        totalCount: totalCount
      }
    }
    
    res.json(response)
  } catch (error) {
    console.error('주변 맛집 조회 오류:', error)
    console.error('오류 스택:', error.stack)
    res.status(500).json({ error: '주변 맛집 정보를 불러오는 중 오류가 발생했습니다.', details: error.message })
  }
})

// 특정 산의 상세 정보 가져오기 (Mountain_list에서) - 더 일반적인 라우트는 나중에
app.get('/api/mountains/:code', async (req, res) => {
  try {
    const { code } = req.params
    console.log('산 상세 정보 요청 - code:', code)
    
    // MongoDB 연결 확인
    const mongoose = await import('mongoose')
    const db = mongoose.default.connection.db
    
      // 실제 컬렉션 찾기
      const collections = await db.listCollections().toArray()
      const collectionNames = collections.map(c => c.name)
      
      // Mountain_list 컬렉션 찾기 (정확한 이름 우선)
      let mountainListCollectionName = collectionNames.find(name => name === 'Mountain_list')
      
      // 없으면 대소문자 구분 없이 찾기
      if (!mountainListCollectionName) {
        mountainListCollectionName = collectionNames.find(name => 
          name.toLowerCase() === 'mountain_list'
        )
      }
      
      // 그래도 없으면 mountain_lists 시도
      if (!mountainListCollectionName) {
        mountainListCollectionName = collectionNames.find(name => 
          name.toLowerCase() === 'mountain_lists'
        )
      }
      
      mountainListCollectionName = mountainListCollectionName || 'Mountain_list'
    
    const actualCollection = db.collection(mountainListCollectionName)
    
    // code가 ObjectId 형식인지 확인 (24자리 16진수 문자열)
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(code)
    
    console.log('검색 시도 - code:', code, 'isObjectId:', isObjectId)
    
    let mountain = null
    
    // ObjectId 형식이면 _id로 검색
    if (isObjectId) {
      try {
        const mongoose = await import('mongoose')
        if (mongoose.default.Types.ObjectId.isValid(code)) {
          const objectId = new mongoose.default.Types.ObjectId(code)
          mountain = await actualCollection.findOne({ _id: objectId })
          console.log('ObjectId로 검색 결과:', mountain ? '찾음' : '없음')
        }
      } catch (e) {
        console.error('ObjectId 변환 실패:', e)
      }
    }
    
    // _id로 찾지 못했으면 mntilistno로 검색 시도
    if (!mountain) {
      const codeNum = parseInt(code)
      const codeStr = String(code)
      const codeNumStr = String(codeNum)
      
      console.log('mntilistno로 검색 시도 - codeNum:', codeNum, 'codeStr:', codeStr)
      
      // mntilistno는 숫자일 수 있으므로 여러 형식으로 시도
      // trail_match.mountain_info.mntilistno도 확인
      mountain = await actualCollection.findOne({ 
        $or: [
          { mntilistno: codeNum },      // 숫자로 먼저 시도 (가장 가능성 높음)
          { mntilistno: Number(code) }, // 명시적 숫자 변환
          { mntilistno: codeStr },      // 문자열로 시도
          { mntilistno: codeNumStr },   // 숫자를 문자열로 변환한 값
          { mntilistno: code },         // 원본으로 시도
          { 'trail_match.mountain_info.mntilistno': codeNum }, // 중첩된 필드 확인
          { 'trail_match.mountain_info.mntilistno': codeStr },
          { 'trail_match.mountain_info.mntilistno': code },
          { code: codeNum },
          { code: codeStr },
          { code: code }
        ]
      })
      
      // 숫자로 변환 가능한 경우 추가 시도 (다양한 숫자 형식)
      if (!mountain && !isNaN(codeNum)) {
        mountain = await actualCollection.findOne({ 
          $or: [
            { mntilistno: codeNum },
            { mntilistno: parseFloat(code) },
            { 'trail_match.mountain_info.mntilistno': codeNum },
            { 'trail_match.mountain_info.mntilistno': parseFloat(code) }
          ]
        })
      }
    }
    
    // 다른 필드명도 시도
    if (!mountain) {
      mountain = await actualCollection.findOne({ MNTN_CD: code })
    }
    if (!mountain) {
      mountain = await actualCollection.findOne({ mountainCode: code })
    }
    
    console.log('Mountain_list에서 찾은 데이터:', mountain ? '찾음' : '없음')
    if (mountain) {
      console.log('원본 데이터 샘플:', JSON.stringify(mountain, null, 2).substring(0, 500))
      console.log('mntilistno 값:', mountain.mntilistno, '타입:', typeof mountain.mntilistno)
    } else {
      // 디버깅: 실제 컬렉션에 어떤 데이터가 있는지 확인
      const sample = await actualCollection.findOne({})
      if (sample) {
        console.log('샘플 데이터의 mntilistno:', sample.mntilistno, '타입:', typeof sample.mntilistno)
        console.log('샘플 데이터의 모든 필드:', Object.keys(sample))
        console.log('샘플 데이터 전체:', JSON.stringify(sample, null, 2).substring(0, 1000))
        
        // 북한산 관련 필드 찾기
        const bukhansanFields = Object.keys(sample).filter(k => 
          k.toLowerCase().includes('mnt') || 
          k.toLowerCase().includes('mountain') ||
          k.toLowerCase().includes('code') ||
          k.toLowerCase().includes('name')
        )
        console.log('산 관련 필드들:', bukhansanFields)
        
        // 287201304 값이 있는 필드 찾기
        for (const key of Object.keys(sample)) {
          const value = sample[key]
          if (value === 287201304 || value === '287201304' || String(value).includes('287201304')) {
            console.log(`287201304 값을 가진 필드 발견: ${key} = ${value}`)
          }
        }
      }
      
      // 북한산 이름으로 검색 시도
      if (code === '287201304') {
        console.log('북한산 이름으로 검색 시도...')
        const nameSearch = await actualCollection.findOne({
          $or: [
            { mntiname: /북한산/ },
            { name: /북한산/ },
            { MNTN_NM: /북한산/ },
            { 'trail_match.mountain_info.mntiname': /북한산/ }
          ]
        })
        if (nameSearch) {
          console.log('이름으로 북한산 찾음!', {
            mntiname: nameSearch.mntiname,
            name: nameSearch.name,
            모든필드: Object.keys(nameSearch)
          })
          mountain = nameSearch
        }
      }
    }
    
    if (!mountain) {
      // Mountain_list에 없으면 기존 하드코딩된 정보로 폴백
      const mountainInfo = getMountainInfo(code)
      if (!mountainInfo) {
        return res.status(404).json({ error: 'Mountain not found' })
      }
      return res.json({
        code: mountainInfo.code,
        name: mountainInfo.name,
        height: null,
        location: null,
        description: null,
        center: { lat: mountainInfo.center[0], lon: mountainInfo.center[1] },
        zoom: mountainInfo.zoom,
        origin: null
      })
    }
    
    // 필드명 매핑 - 실제 DB 필드명 사용
    // trail_match.mountain_info도 확인
    const mountainInfo = mountain.trail_match?.mountain_info || {}
    const mappedMountain = {
      code: String(mountain.mntilistno || mountainInfo.mntilistno || mountain.code || mountain.MNTN_CD || code),
      name: mountain.mntiname || mountainInfo.mntiname || mountain.name || mountain.MNTN_NM || mountain.mountainName,
      height: (() => {
        // mntihigh 처리: 문자열 "0" 또는 숫자 0이면 null, 그 외에는 값 + 'm'
        const mntihighValue = mountain.mntihigh !== undefined && mountain.mntihigh !== null 
          ? mountain.mntihigh 
          : (mountainInfo.mntihigh !== undefined && mountainInfo.mntihigh !== null 
            ? mountainInfo.mntihigh 
            : null)
        if (mntihighValue !== null && mntihighValue !== undefined) {
          if (mntihighValue === 0 || mntihighValue === '0' || String(mntihighValue).trim() === '0') {
            return null
          }
          return String(mntihighValue) + 'm'
        }
        return mountain.height || mountain.MNTN_HG || mountain.mountainHeight
      })(),
      location: mountain.mntiadd || mountainInfo.mntiadd || mountain.location || mountain.MNTN_LOC || mountain.mountainLocation,
      description: mountain.description || mountain.MNTN_DESC || mountain.mountainDescription,
      center: (() => {
        // /api/mountains와 동일한 로직 사용
        let center = null
        
        // 1. mountain.center 확인
        if (mountain.center) {
          if (typeof mountain.center === 'object' && !Array.isArray(mountain.center)) {
            if (mountain.center.lat !== undefined && mountain.center.lon !== undefined) {
              center = { lat: mountain.center.lat, lon: mountain.center.lon }
            }
          } else if (Array.isArray(mountain.center) && mountain.center.length >= 2) {
            center = { lat: mountain.center[0], lon: mountain.center[1] }
          }
        }
        
        // 2. MNTN_CTR 확인
        if (!center && mountain.MNTN_CTR) {
          if (Array.isArray(mountain.MNTN_CTR) && mountain.MNTN_CTR.length >= 2) {
            center = { lat: mountain.MNTN_CTR[0], lon: mountain.MNTN_CTR[1] }
          } else if (typeof mountain.MNTN_CTR === 'object') {
            center = { 
              lat: mountain.MNTN_CTR.lat || mountain.MNTN_CTR[0] || mountain.MNTN_CTR.y, 
              lon: mountain.MNTN_CTR.lon || mountain.MNTN_CTR[1] || mountain.MNTN_CTR.x 
            }
          }
        }
        
        // 3. coordinates 확인
        if (!center && mountain.coordinates) {
          if (typeof mountain.coordinates === 'object' && !Array.isArray(mountain.coordinates)) {
            if (mountain.coordinates.lat !== undefined && mountain.coordinates.lon !== undefined) {
              center = { lat: mountain.coordinates.lat, lon: mountain.coordinates.lon }
            }
          } else if (Array.isArray(mountain.coordinates) && mountain.coordinates.length >= 2) {
            center = { lat: mountain.coordinates[0], lon: mountain.coordinates[1] }
          }
        }
        
        // 4. lat, lon 또는 lat, lng 필드 확인 (중요!)
        if (!center) {
          const latValue = mountain.lat !== undefined ? mountain.lat : (mountain.LAT !== undefined ? mountain.LAT : null)
          const lonValue = (mountain.lon !== undefined ? mountain.lon : null) || 
                          (mountain.lng !== undefined ? mountain.lng : null) || 
                          (mountain.LON !== undefined ? mountain.LON : null) || 
                          (mountain.LNG !== undefined ? mountain.LNG : null)
          
          if (latValue !== null && latValue !== undefined && lonValue !== null && lonValue !== undefined) {
            center = { lat: latValue, lon: lonValue }
          }
        }
        
        // 5. trail_match.mountain_info에서도 좌표 찾기
        if (!center && mountain.trail_match && mountain.trail_match.mountain_info) {
          const info = mountain.trail_match.mountain_info
          const latValue = info.lat !== undefined ? info.lat : (info.LAT !== undefined ? info.LAT : null)
          const lonValue = (info.lon !== undefined ? info.lon : null) || 
                          (info.lng !== undefined ? info.lng : null) || 
                          (info.LON !== undefined ? info.LON : null) || 
                          (info.LNG !== undefined ? info.LNG : null)
          
          if (latValue !== null && latValue !== undefined && lonValue !== null && lonValue !== undefined) {
            center = { lat: latValue, lon: lonValue }
          }
        }
        
        // 좌표 유효성 검사
        if (center) {
          const lat = Number(center.lat)
          const lon = Number(center.lon)
          if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
            center = null
          } else {
            center = { lat, lon }
          }
        }
        
        return center
      })(),
      zoom: mountain.zoom || 13,
      origin: mountain.origin || mountain.MNTN_ORIGIN || mountain.mountainOrigin,
      admin: mountain.mntiadmin || mountain.admin,
      image: (() => {
        // 여러 필드에서 이미지 찾기 (photo_url 우선순위)
        const imageFields = [
          // photo_url을 우선순위로 올림 (DB에 실제로 있는 필드)
          mountain.photo_url,
          mountain.image_url,
          mountain.photoUrl,
          mountain.imageUrl,
          mountain.image,
          mountain.photo,
          mountain.thumbnail,
          mountain.img,
          mountain.picture,
          mountain.mntiimage,
          mountain.MNTN_IMG,
          // trail_match 내부 필드들
          mountain.trail_match?.mountain_info?.photo_url,
          mountain.trail_match?.mountain_info?.image_url,
          mountain.trail_match?.mountain_info?.photoUrl,
          mountain.trail_match?.mountain_info?.imageUrl,
          mountain.trail_match?.mountain_info?.image,
          mountain.trail_match?.mountain_info?.photo,
          mountain.trail_match?.mountain_info?.thumbnail,
          // mountainInfo 파라미터로 전달된 경우
          mountainInfo?.photo_url,
          mountainInfo?.image_url,
          mountainInfo?.photoUrl,
          mountainInfo?.imageUrl,
          mountainInfo?.image,
          mountainInfo?.photo,
          mountainInfo?.thumbnail
        ]
        
        // null이 아닌 첫 번째 값 반환
        for (const img of imageFields) {
          if (img && typeof img === 'string' && img.trim() !== '') {
            let imageUrl = img.trim()
            
            // imgbb.co 페이지 URL인 경우 실제 이미지 URL 추출 시도
            if (imageUrl.includes('ibb.co/') && !imageUrl.includes('i.ibb.co')) {
              try {
                // 동기적으로는 불가능하므로 원본 URL 반환 (프론트엔드에서 처리)
                // 또는 백엔드에서 비동기로 처리할 수도 있지만, 여기서는 원본 반환
                return imageUrl
              } catch (error) {
                console.error('imgbb.co URL 처리 실패:', error)
                return imageUrl
              }
            }
            
            return imageUrl
          }
        }
        return null
      })()
    }
    
    console.log('매핑된 데이터:', JSON.stringify(mappedMountain, null, 2))
    
    // 즐겨찾기 상태 확인 (인증된 사용자인 경우)
    let isFavorited = false
    const authHeader = req.headers['authorization']
    if (authHeader) {
      const token = authHeader.split(' ')[1]
      if (token) {
        try {
          const jwt = await import('jsonwebtoken')
          const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'
          const decoded = jwt.default.verify(token, JWT_SECRET)
          const user = await User.findById(decoded.userId).select('favoriteMountains').lean()
          if (user && user.favoriteMountains) {
            const mountainCode = String(mappedMountain.code)
            isFavorited = user.favoriteMountains.includes(mountainCode)
          }
        } catch (err) {
          // 토큰이 유효하지 않으면 무시
        }
      }
    }
    
    res.json({
      ...mappedMountain,
      isFavorited
    })
  } catch (error) {
    console.error('Error loading mountain detail:', error)
    res.status(500).json({ error: 'Failed to load mountain detail', details: error.message })
  }
})


// 특정 산의 등산 코스 가져오기
app.get('/api/mountains/:code/courses', async (req, res) => {
  try {
    const { code } = req.params
    console.log('등산 코스 요청 - code:', code)
    
    // code가 ObjectId 형식인지 확인
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(code)
    const codeNum = parseInt(code)
    
    // 먼저 실제 mntilistno 값을 찾아야 함
    let actualMountainCode = code
    let mountainName = null
    
    // ObjectId인 경우 실제 mntilistno를 찾기
    if (isObjectId) {
      const mongoose = await import('mongoose')
      const db = mongoose.default.connection.db
      const collections = await db.listCollections().toArray()
      const collectionNames = collections.map(c => c.name)
      let mountainListCollectionName = collectionNames.find(name => name === 'Mountain_list')
      if (!mountainListCollectionName) {
        mountainListCollectionName = collectionNames.find(name => name.toLowerCase() === 'mountain_list') || 'Mountain_list'
      }
      const actualCollection = db.collection(mountainListCollectionName)
      
      try {
        const objectId = new mongoose.default.Types.ObjectId(code)
        const mountain = await actualCollection.findOne({ _id: objectId })
        console.log('ObjectId로 찾은 산 데이터:', mountain ? '찾음' : '없음')
        if (mountain) {
          console.log('산 데이터의 모든 필드:', Object.keys(mountain))
          console.log('mntilistno 값:', mountain.mntilistno, '타입:', typeof mountain.mntilistno)
          
          if (mountain.mntilistno) {
            actualMountainCode = String(mountain.mntilistno)
            mountainName = mountain.mntiname || mountain.name
            console.log('ObjectId로 찾은 실제 mntilistno:', actualMountainCode)
          } else {
            console.error('mntilistno 필드를 찾을 수 없음. 산 데이터:', JSON.stringify(mountain, null, 2).substring(0, 500))
          }
        }
      } catch (e) {
        console.error('ObjectId 변환 실패:', e)
      }
    }
    
    // Course 컬렉션에서 가져오기 시도 (여러 형식으로 시도)
    let courses = []
    
    // 1. 실제 mntilistno로 검색 (문자열)
    courses = await Course.find({ mountainCode: actualMountainCode }).lean()
    console.log('Course 컬렉션에서 찾은 코스 개수 (문자열):', courses.length, 'mountainCode:', actualMountainCode)
    
    // 2. 숫자로 변환해서 검색
    const actualCodeNum = parseInt(actualMountainCode)
    if (courses.length === 0 && !isNaN(actualCodeNum)) {
      courses = await Course.find({ mountainCode: actualCodeNum }).lean()
      console.log('Course 컬렉션에서 찾은 코스 개수 (숫자):', courses.length, 'mountainCode:', actualCodeNum)
    }
    
    // 3. 원본 code로도 시도 (혹시 모를 경우)
    if (courses.length === 0) {
      courses = await Course.find({ mountainCode: code }).lean()
      console.log('Course 컬렉션에서 찾은 코스 개수 (원본 code):', courses.length, 'mountainCode:', code)
    }
    
    // 4. 숫자로 변환한 원본 code로도 시도
    if (courses.length === 0 && !isNaN(codeNum)) {
      courses = await Course.find({ mountainCode: codeNum }).lean()
      console.log('Course 컬렉션에서 찾은 코스 개수 (원본 code 숫자):', courses.length, 'mountainCode:', codeNum)
    }
    
    console.log('최종 Course 컬렉션에서 찾은 코스 개수:', courses.length)
    
    // Course 컬렉션에 없으면 파일에서 가져오기 시도
    if (courses.length === 0) {
      try {
        // mountain 폴더에서 파일 찾기
        const { readdir, readFile } = await import('fs/promises')
        const { existsSync } = await import('fs')
        
        // 실제 mntilistno로 파일 경로 생성
        const geojsonDir = join('/app', 'mountain', `${actualMountainCode}_geojson`)
        console.log('파일에서 코스 찾기 시도 - 경로:', geojsonDir)
        
        if (existsSync(geojsonDir)) {
          // PMNTN_로 시작하는 JSON 파일 찾기 (등산 코스 파일)
          const files = await readdir(geojsonDir)
          const courseFiles = files.filter(f => 
            f.startsWith('PMNTN_') && 
            f.endsWith('.json') && 
            !f.includes('SPOT') && 
            !f.includes('SAFE_SPOT')
          )
          
          console.log('찾은 코스 파일들:', courseFiles)
          
          if (courseFiles.length > 0) {
            // 첫 번째 코스 파일 읽기 (보통 하나의 파일에 모든 코스가 있음)
            const courseFilePath = join(geojsonDir, courseFiles[0])
            const courseData = JSON.parse(await readFile(courseFilePath, 'utf-8'))
            
            // GeoJSON 형식으로 변환
            let rawCourses = []
            if (courseData.features) {
              rawCourses = courseData.features
            } else if (courseData.type === 'FeatureCollection') {
              rawCourses = courseData.features || []
            } else {
              rawCourses = [courseData]
            }
            
            // ArcGIS 형식인 경우 attributes를 properties로 변환
            courses = rawCourses.map((course, index) => {
              // ArcGIS 형식 (attributes와 geometry.paths가 있는 경우)
              if (course.attributes && course.geometry && course.geometry.paths) {
                const attrs = course.attributes
                
                // 코스 이름 확인 (이름이 없으면 null 반환하여 필터링)
                let courseName = (attrs.PMNTN_NM || attrs.PMNTN_MAIN || '').trim()
                if (!courseName || courseName === '' || courseName === ' ') {
                  // 이름이 없으면 제외
                  return null
                }
                
                // 시간 계산 (상행 + 하행)
                const upTime = attrs.PMNTN_UPPL || 0
                const downTime = attrs.PMNTN_GODN || 0
                const totalMinutes = upTime + downTime
                const distance = attrs.PMNTN_LT || 0
                const surfaceMaterial = (attrs.PMNTN_MTRQ || '').trim() // 노면 재질
                
                // 난이도 추정 함수 (국립공원 관리공단 기준 참고)
                // 쉬움: 평탄, 비교적 매끈한 노면, 짧은 거리/시간
                // 보통: 약간의 경사, 비교적 거친 노면, 중간 거리/시간
                // 어려움: 심한 경사, 거친 노면, 긴 거리/시간
                const estimateDifficulty = (distance, totalMinutes, surfaceMaterial) => {
                  // 노면 재질이 가장 중요한 기준
                  const hardSurfaces = ['암석', '바위', '암벽', '절벽']
                  const mediumSurfaces = ['토사', '자갈', '돌']
                  const easySurfaces = ['포장', '콘크리트', '데크']
                  
                  // 노면 재질 기준으로 기본 난이도 결정
                  let baseDifficulty = '보통' // 기본값
                  if (hardSurfaces.some(s => surfaceMaterial.includes(s))) {
                    baseDifficulty = '어려움' // 거친 노면 → 어려움
                  } else if (easySurfaces.some(s => surfaceMaterial.includes(s))) {
                    baseDifficulty = '쉬움' // 매끈한 포장 → 쉬움
                  } else if (mediumSurfaces.some(s => surfaceMaterial.includes(s))) {
                    baseDifficulty = '보통' // 비교적 거친 노면 → 보통
                  }
                  
                  // 거리와 시간으로 난이도 조정
                  // 매우 짧은 코스는 쉬움으로
                  if (distance <= 1.5 && totalMinutes <= 60) {
                    return '쉬움'
                  }
                  
                  // 매우 긴 코스는 어려움으로
                  if (distance >= 10 || totalMinutes >= 240) {
                    return '어려움'
                  }
                  
                  // 중간 거리/시간은 노면 재질 기준 따름
                  if (baseDifficulty === '쉬움') {
                    // 포장된 노면이면 거리/시간이 길어도 쉬움 유지 (최대 5km, 2시간까지)
                    if (distance <= 5 && totalMinutes <= 120) {
                      return '쉬움'
                    } else {
                      return '보통'
                    }
                  } else if (baseDifficulty === '어려움') {
                    // 거친 노면이면 거리/시간이 짧아도 어려움 유지
                    return '어려움'
                  } else {
                    // 보통 노면은 거리/시간에 따라 조정
                    if (distance <= 3 && totalMinutes <= 90) {
                      return '쉬움'
                    } else if (distance >= 8 || totalMinutes >= 180) {
                      return '어려움'
                    } else {
                      return '보통'
                    }
                  }
                }
                
                const difficulty = estimateDifficulty(distance, totalMinutes, surfaceMaterial)
                console.log(`코스 난이도 추정: ${courseName}, 추정: ${difficulty}, 거리: ${distance}km, 시간: ${totalMinutes}분, 노면: ${surfaceMaterial}`)
                let duration = ''
                if (totalMinutes >= 60) {
                  const hours = Math.floor(totalMinutes / 60)
                  const minutes = totalMinutes % 60
                  duration = minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`
                } else {
                  duration = `${totalMinutes}분`
                }
                
                return {
                  type: 'Feature',
                  properties: {
                    name: courseName,
                    description: (attrs.PMNTN_MAIN || '').trim() || '',
                    difficulty: difficulty || attrs.PMNTN_DFFL || '보통',
                    distance: attrs.PMNTN_LT || 0,
                    duration: duration,
                    upTime: upTime,
                    downTime: downTime,
                    PMNTN_SN: attrs.PMNTN_SN,
                    MNTN_CODE: attrs.MNTN_CODE,
                    MNTN_NM: attrs.MNTN_NM
                  },
                  // ArcGIS 형식 유지 (프론트엔드에서 변환)
                  geometry: course.geometry
                }
              }
              // 이미 GeoJSON Feature 형식인 경우
              else if (course.type === 'Feature' && course.properties) {
                // 코스 이름 확인 (이름이 없으면 제외)
                const courseName = (course.properties.name || course.properties.PMNTN_NM || course.attributes?.PMNTN_NM || '').trim()
                if (!courseName || courseName === '' || courseName === ' ') {
                  return null
                }
                
                // properties에 난이도 정보가 없으면 attributes에서 가져오기
                if (!course.properties.difficulty && course.attributes) {
                  const attrs = course.attributes
                  const upTime = attrs.PMNTN_UPPL || 0
                  const downTime = attrs.PMNTN_GODN || 0
                  const totalMinutes = upTime + downTime
                  const distance = attrs.PMNTN_LT || 0
                  const surfaceMaterial = (attrs.PMNTN_MTRQ || '').trim()
                  
                  // 난이도 추정 함수 (국립공원 관리공단 기준 참고)
                  // 쉬움: 평탄, 비교적 매끈한 노면, 짧은 거리/시간
                  // 보통: 약간의 경사, 비교적 거친 노면, 중간 거리/시간
                  // 어려움: 심한 경사, 거친 노면, 긴 거리/시간
                  const estimateDifficulty = (distance, totalMinutes, surfaceMaterial) => {
                    // 노면 재질이 가장 중요한 기준
                    const hardSurfaces = ['암석', '바위', '암벽', '절벽']
                    const mediumSurfaces = ['토사', '자갈', '돌']
                    const easySurfaces = ['포장', '콘크리트', '데크']
                    
                    // 노면 재질 기준으로 기본 난이도 결정
                    let baseDifficulty = '보통' // 기본값
                    if (hardSurfaces.some(s => surfaceMaterial.includes(s))) {
                      baseDifficulty = '어려움' // 거친 노면 → 어려움
                    } else if (easySurfaces.some(s => surfaceMaterial.includes(s))) {
                      baseDifficulty = '쉬움' // 매끈한 포장 → 쉬움
                    } else if (mediumSurfaces.some(s => surfaceMaterial.includes(s))) {
                      baseDifficulty = '보통' // 비교적 거친 노면 → 보통
                    }
                    
                    // 거리와 시간으로 난이도 조정
                    // 매우 짧은 코스는 쉬움으로
                    if (distance <= 1.5 && totalMinutes <= 60) {
                      return '쉬움'
                    }
                    
                    // 매우 긴 코스는 어려움으로
                    if (distance >= 10 || totalMinutes >= 240) {
                      return '어려움'
                    }
                    
                    // 중간 거리/시간은 노면 재질 기준 따름
                    if (baseDifficulty === '쉬움') {
                      // 포장된 노면이면 거리/시간이 길어도 쉬움 유지 (최대 5km, 2시간까지)
                      if (distance <= 5 && totalMinutes <= 120) {
                        return '쉬움'
                      } else {
                        return '보통'
                      }
                    } else if (baseDifficulty === '어려움') {
                      // 거친 노면이면 거리/시간이 짧아도 어려움 유지
                      return '어려움'
                    } else {
                      // 보통 노면은 거리/시간에 따라 조정
                      if (distance <= 3 && totalMinutes <= 90) {
                        return '쉬움'
                      } else if (distance >= 8 || totalMinutes >= 180) {
                        return '어려움'
                      } else {
                        return '보통'
                      }
                    }
                  }
                  
                  const difficulty = estimateDifficulty(distance, totalMinutes, surfaceMaterial)
                  
                  let duration = ''
                  if (totalMinutes >= 60) {
                    const hours = Math.floor(totalMinutes / 60)
                    const minutes = totalMinutes % 60
                    duration = minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`
                  } else {
                    duration = `${totalMinutes}분`
                  }
                  
                  course.properties.difficulty = difficulty
                  course.properties.distance = course.properties.distance || distance
                  course.properties.duration = course.properties.duration || duration
                  course.properties.upTime = course.properties.upTime || upTime
                  course.properties.downTime = course.properties.downTime || downTime
                  course.properties.name = course.properties.name || attrs.PMNTN_NM || attrs.PMNTN_MAIN
                  course.properties.description = course.properties.description || attrs.PMNTN_MAIN || ''
                }
                // upTime과 downTime이 없으면 properties에서 직접 계산
                if (!course.properties.upTime && !course.properties.downTime) {
                  const props = course.properties
                  // duration에서 시간 추출 시도
                  if (props.duration) {
                    const durationMatch = props.duration.match(/(\d+)시간\s*(\d+)분|(\d+)시간|(\d+)분/)
                    if (durationMatch) {
                      const hours = parseInt(durationMatch[1] || durationMatch[3] || 0)
                      const minutes = parseInt(durationMatch[2] || durationMatch[4] || 0)
                      const totalMinutes = hours * 60 + minutes
                      // upTime과 downTime을 대략적으로 분배 (상행:하행 = 1:1로 가정)
                      course.properties.upTime = Math.floor(totalMinutes / 2)
                      course.properties.downTime = Math.ceil(totalMinutes / 2)
                    }
                  }
                }
                return course
              }
              // 그 외의 경우
              else {
                // 이름이 있는지 확인
                const courseName = (course.properties?.name || course.name || '').trim()
                if (!courseName || courseName === '' || courseName === ' ') {
                  return null
                }
                return course
              }
            })
            .filter(course => course !== null) // null인 항목 제거
            
            console.log('파일에서 가져온 코스 개수 (이름 있는 것만):', courses.length)
            
            // 코스 필터링 및 그룹화
            // 1. 10분 이하 또는 0.5km 이하 코스 제외
            const filteredCourses = courses.filter(course => {
              const props = course.properties || {}
              
              // upTime과 downTime 계산 (여러 방법 시도)
              let totalTime = 0
              if (props.upTime !== undefined && props.downTime !== undefined) {
                totalTime = (props.upTime || 0) + (props.downTime || 0)
              } else if (props.PMNTN_UPPL !== undefined || props.PMNTN_GODN !== undefined) {
                totalTime = (props.PMNTN_UPPL || 0) + (props.PMNTN_GODN || 0)
              } else if (props.duration) {
                // duration 문자열에서 시간 파싱
                const durationMatch = props.duration.match(/(\d+)시간\s*(\d+)분|(\d+)시간|(\d+)분/)
                if (durationMatch) {
                  const hours = parseInt(durationMatch[1] || durationMatch[3] || 0)
                  const minutes = parseInt(durationMatch[2] || durationMatch[4] || 0)
                  totalTime = hours * 60 + minutes
                }
              }
              
              const distance = props.distance || props.PMNTN_LT || 0
              
              // 10분 이하 또는 0.5km 이하 제외
              if (totalTime <= 10 || distance <= 0.5) {
                return false
              }
              return true
            })
            
            console.log('필터링 후 코스 개수 (10분 이상, 0.5km 이상):', filteredCourses.length)
            
            // 2. 같은 코스명을 가진 구간들을 하나의 코스로 묶기
            const courseGroups = {}
            filteredCourses.forEach(course => {
              const props = course.properties || {}
              const courseName = props.name || ''
              
              if (!courseName) return
              
              if (!courseGroups[courseName]) {
                courseGroups[courseName] = {
                  course: course,
                  segments: [course],
                  totalTime: (props.upTime || 0) + (props.downTime || 0),
                  totalDistance: props.distance || 0
                }
              } else {
                // 같은 코스명이면 구간 추가
                courseGroups[courseName].segments.push(course)
                // 가장 긴 시간과 거리로 업데이트
                const currentTime = (props.upTime || 0) + (props.downTime || 0)
                const currentDistance = props.distance || 0
                if (currentTime > courseGroups[courseName].totalTime) {
                  courseGroups[courseName].totalTime = currentTime
                  courseGroups[courseName].course = course // 가장 긴 구간을 대표 코스로
                }
                if (currentDistance > courseGroups[courseName].totalDistance) {
                  courseGroups[courseName].totalDistance = currentDistance
                }
              }
            })
            
            // 3. 그룹화된 코스들을 배열로 변환 (가장 긴 구간을 대표로 사용)
            courses = Object.values(courseGroups).map(group => {
              const representativeCourse = group.course
              const props = representativeCourse.properties || {}
              
              // 여러 구간이 있으면 총 시간과 거리를 업데이트
              if (group.segments.length > 1) {
                // 모든 구간의 시간과 거리 합산
                let totalTime = 0
                let totalDistance = 0
                group.segments.forEach(seg => {
                  const segProps = seg.properties || {}
                  totalTime += (segProps.upTime || 0) + (segProps.downTime || 0)
                  totalDistance += segProps.distance || 0
                })
                
                // properties 업데이트
                if (!props.upTime && !props.downTime) {
                  // 시간 정보가 없으면 합산된 값 사용
                  const hours = Math.floor(totalTime / 60)
                  const minutes = totalTime % 60
                  props.duration = minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`
                }
                props.distance = totalDistance
                props.segmentCount = group.segments.length // 구간 개수 정보 추가
              }
              
              return representativeCourse
            })
            
            console.log('그룹화 후 코스 개수:', courses.length)
            if (courses.length > 0) {
              console.log('첫 번째 코스 샘플:', JSON.stringify(courses[0].properties || courses[0], null, 2).substring(0, 500))
            }
          }
        } else {
          console.log('geojson 디렉토리가 없음:', geojsonDir)
          // 실제 mntilistno가 숫자가 아니면 파일을 찾을 수 없음
          if (isNaN(actualCodeNum)) {
            console.error('actualMountainCode가 숫자가 아님:', actualMountainCode, 'ObjectId에서 mntilistno를 찾지 못했을 수 있음')
          }
        }
      } catch (fileError) {
        console.error('파일에서 코스 읽기 실패:', fileError)
      }
    }
    
    // 코스가 없어도 빈 배열로 반환 (404 대신 200)
    // Mountain_list에서 산 이름 가져오기
    if (!mountainName) {
      const mongoose = await import('mongoose')
      const db = mongoose.default.connection.db
      const collections = await db.listCollections().toArray()
      const collectionNames = collections.map(c => c.name)
      
      let mountainListCollectionName = collectionNames.find(name => name === 'Mountain_list')
      if (!mountainListCollectionName) {
        mountainListCollectionName = collectionNames.find(name => name.toLowerCase() === 'mountain_list') || 'Mountain_list'
      }
      const actualCollection = db.collection(mountainListCollectionName)
      
      let mountain = null
      if (isObjectId) {
        try {
          const objectId = new mongoose.default.Types.ObjectId(code)
          mountain = await actualCollection.findOne({ _id: objectId })
        } catch (e) {
          console.error('ObjectId 변환 실패:', e)
        }
      } else {
        const codeNum = parseInt(actualMountainCode)
        mountain = await actualCollection.findOne({
          $or: [
            { mntilistno: actualMountainCode },
            { mntilistno: codeNum },
            { code: actualMountainCode },
            { code: codeNum }
          ]
        })
      }
      mountainName = mountain?.mntiname || mountain?.name || mountain?.MNTN_NM || mountain?.mountainName || '이름 없음'
    }
    
    if (courses.length > 0) {
      // 데이터가 이미 GeoJSON Feature 형식인지 확인
      const isGeoJSONFeature = courses[0] && courses[0].type === 'Feature' && courses[0].geometry
      
      let geoJsonCourses = []
      
      if (isGeoJSONFeature) {
        // 이미 GeoJSON 형식이면 properties 확인 및 보완
        geoJsonCourses = courses.map(course => {
          // properties에 난이도 정보가 없으면 attributes에서 가져오기
          if (course.attributes && (!course.properties || !course.properties.difficulty)) {
            const attrs = course.attributes
            const upTime = attrs.PMNTN_UPPL || 0
            const downTime = attrs.PMNTN_GODN || 0
            const totalMinutes = upTime + downTime
            const distance = attrs.PMNTN_LT || 0
            const surfaceMaterial = (attrs.PMNTN_MTRQ || '').trim()
            
            // 난이도 추정 함수 (국립공원 관리공단 기준 참고)
            // 쉬움: 평탄, 비교적 매끈한 노면, 짧은 거리/시간
            // 보통: 약간의 경사, 비교적 거친 노면, 중간 거리/시간
            // 어려움: 심한 경사, 거친 노면, 긴 거리/시간
            const estimateDifficulty = (distance, totalMinutes, surfaceMaterial) => {
              // 노면 재질이 가장 중요한 기준
              const hardSurfaces = ['암석', '바위', '암벽', '절벽']
              const mediumSurfaces = ['토사', '자갈', '돌']
              const easySurfaces = ['포장', '콘크리트', '데크']
              
              // 노면 재질 기준으로 기본 난이도 결정
              let baseDifficulty = '보통' // 기본값
              if (hardSurfaces.some(s => surfaceMaterial.includes(s))) {
                baseDifficulty = '어려움' // 거친 노면 → 어려움
              } else if (easySurfaces.some(s => surfaceMaterial.includes(s))) {
                baseDifficulty = '쉬움' // 매끈한 포장 → 쉬움
              } else if (mediumSurfaces.some(s => surfaceMaterial.includes(s))) {
                baseDifficulty = '보통' // 비교적 거친 노면 → 보통
              }
              
              // 거리와 시간으로 난이도 조정
              // 매우 짧은 코스는 쉬움으로
              if (distance <= 1.5 && totalMinutes <= 60) {
                return '쉬움'
              }
              
              // 매우 긴 코스는 어려움으로
              if (distance >= 10 || totalMinutes >= 240) {
                return '어려움'
              }
              
              // 중간 거리/시간은 노면 재질 기준 따름
              if (baseDifficulty === '쉬움') {
                // 포장된 노면이면 거리/시간이 길어도 쉬움 유지 (최대 5km, 2시간까지)
                if (distance <= 5 && totalMinutes <= 120) {
                  return '쉬움'
                } else {
                  return '보통'
                }
              } else if (baseDifficulty === '어려움') {
                // 거친 노면이면 거리/시간이 짧아도 어려움 유지
                return '어려움'
              } else {
                // 보통 노면은 거리/시간에 따라 조정
                if (distance <= 3 && totalMinutes <= 90) {
                  return '쉬움'
                } else if (distance >= 8 || totalMinutes >= 180) {
                  return '어려움'
                } else {
                  return '보통'
                }
              }
            }
            
            const difficulty = estimateDifficulty(distance, totalMinutes, surfaceMaterial)
            
            let duration = ''
            if (totalMinutes >= 60) {
              const hours = Math.floor(totalMinutes / 60)
              const minutes = totalMinutes % 60
              duration = minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`
            } else {
              duration = `${totalMinutes}분`
            }
            
            // properties가 없으면 생성
            if (!course.properties) {
              course.properties = {}
            }
            
            course.properties.name = course.properties.name || attrs.PMNTN_NM || attrs.PMNTN_MAIN || '등산 코스'
            course.properties.description = course.properties.description || attrs.PMNTN_MAIN || ''
            course.properties.difficulty = course.properties.difficulty || difficulty
            course.properties.distance = course.properties.distance || distance
            course.properties.duration = course.properties.duration || duration
            course.properties.upTime = course.properties.upTime || upTime
            course.properties.downTime = course.properties.downTime || downTime
          }
          return course
        })
      } else {
        // Course 컬렉션에서 가져온 데이터를 GeoJSON 형식으로 변환
        geoJsonCourses = courses.map(course => {
          // courseData가 있으면 사용, 없으면 빈 geometry
          let geometry = null
          if (course.courseData && course.courseData.geometry) {
            geometry = course.courseData.geometry
          } else if (course.courseData && course.courseData.paths) {
            // ArcGIS 형식인 경우
            geometry = {
              type: 'LineString',
              coordinates: course.courseData.paths[0] || []
            }
          } else if (course.geometry) {
            // 이미 geometry가 있는 경우
            geometry = course.geometry
          }
          
          return {
            type: 'Feature',
            properties: {
              name: course.courseName || course.properties?.name || course.properties?.PMNTN_NM || '등산 코스',
              difficulty: course.difficulty || course.properties?.difficulty,
              distance: course.distance || course.properties?.distance,
              duration: course.duration || course.properties?.duration
            },
            geometry: geometry || {
              type: 'LineString',
              coordinates: []
            }
          }
        })
      }
      
      // Mountain_list에서 산 이름 가져오기
      const mongoose = await import('mongoose')
      const db = mongoose.default.connection.db
      const collections = await db.listCollections().toArray()
      const collectionNames = collections.map(c => c.name)
      
      // Mountain_list 컬렉션 찾기 (정확한 이름 우선)
      let mountainListCollectionName = collectionNames.find(name => name === 'Mountain_list')
      
      // 없으면 대소문자 구분 없이 찾기
      if (!mountainListCollectionName) {
        mountainListCollectionName = collectionNames.find(name => 
          name.toLowerCase() === 'mountain_list'
        )
      }
      
      // 그래도 없으면 mountain_lists 시도
      if (!mountainListCollectionName) {
        mountainListCollectionName = collectionNames.find(name => 
          name.toLowerCase() === 'mountain_lists'
        )
      }
      
      mountainListCollectionName = mountainListCollectionName || 'Mountain_list'
      const actualCollection = db.collection(mountainListCollectionName)
      
      const codeNum = parseInt(code)
      const mountain = await actualCollection.findOne({ 
        $or: [
          { mntilistno: code },
          { mntilistno: codeNum },
          { code: code },
          { code: codeNum }
        ]
      })
      const mountainName = mountain?.mntiname || mountain?.name || mountain?.MNTN_NM || mountain?.mountainName || code
      
      return res.json({
        code,
        name: mountainName,
        courses: geoJsonCourses
      })
    }
    
    // 코스가 없어도 빈 배열로 반환 (404 대신 200)
    // 실제 mntilistno를 code로 사용
    const finalCode = actualMountainCode !== code ? actualMountainCode : code
    
    // Mountain_list에서 산 이름 가져오기 (아직 가져오지 않은 경우)
    if (!mountainName) {
      const mongoose = await import('mongoose')
      const db = mongoose.default.connection.db
      const collections = await db.listCollections().toArray()
      const collectionNames = collections.map(c => c.name)
      
      let mountainListCollectionName = collectionNames.find(name => name === 'Mountain_list')
      if (!mountainListCollectionName) {
        mountainListCollectionName = collectionNames.find(name => name.toLowerCase() === 'mountain_list') || 'Mountain_list'
      }
      const actualCollection = db.collection(mountainListCollectionName)
      
      let mountain = null
      if (isObjectId) {
        try {
          const objectId = new mongoose.default.Types.ObjectId(code)
          mountain = await actualCollection.findOne({ _id: objectId })
        } catch (e) {
          console.error('ObjectId 변환 실패:', e)
        }
      } else {
        const codeNum = parseInt(finalCode)
        mountain = await actualCollection.findOne({
          $or: [
            { mntilistno: finalCode },
            { mntilistno: codeNum },
            { code: finalCode },
            { code: codeNum }
          ]
        })
      }
      mountainName = mountain?.mntiname || mountain?.name || mountain?.MNTN_NM || mountain?.mountainName || '이름 없음'
    }
    
    return res.json({
      code: finalCode,
      name: mountainName,
      courses: []
    })

    // Docker 컨테이너 내부에서는 /app/mountain 경로 사용
    // mountainInfo.courseFile은 'mountain/287201304_geojson/...' 형식
    const relativePath = mountainInfo.courseFile.startsWith('mountain/') 
      ? mountainInfo.courseFile.substring('mountain/'.length)
      : mountainInfo.courseFile
    // __dirname은 /app이므로 /app/mountain/... 경로 생성
    const courseFilePath = join('/app', 'mountain', relativePath)
    console.log('Loading course file from:', courseFilePath)
    console.log('__dirname:', __dirname)
    const courseData = JSON.parse(await readFile(courseFilePath, 'utf-8'))
    
    res.json({ 
      code,
      name: mountainInfo.name,
      courses: courseData.features || [courseData]
    })
  } catch (error) {
    console.error('Error loading course data:', error)
    res.status(500).json({ error: 'Failed to load course data', details: error.message })
  }
})

// 테마별 코스 큐레이션 가져오기
app.get('/api/courses/theme/:theme', async (req, res) => {
  try {
    const { theme } = req.params
    const { limit = 10 } = req.query
    
    console.log('[테마별 코스] 요청 - theme:', theme, 'limit:', limit)
    
    // Mountain_list 컬렉션 찾기
    const mongoose = await import('mongoose')
    const db = mongoose.default.connection.db
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(c => c.name)
    const mountainListCollectionName = collectionNames.find(name => 
      name === 'Mountain_list' || name.toLowerCase() === 'mountain_list'
    ) || 'Mountain_list'
    const mountainCollection = db.collection(mountainListCollectionName)
    
    // 테마별 우선 코스 목록 (인터넷에서 찾은 실제 유명 코스)
    const themeCourseMap = {
      winter: [
        // 눈꽃 산행지 BEST 10
        { mountainName: '설악산', courseName: '대청봉', priority: 1 },
        { mountainName: '지리산', courseName: '천왕봉', priority: 2 },
        { mountainName: '덕유산', courseName: '향적봉', priority: 3 },
        { mountainName: '한라산', courseName: '백록담', priority: 4 },
        { mountainName: '태백산', courseName: '천제단', priority: 5 },
        { mountainName: '오대산', courseName: '비로봉', priority: 6 },
        { mountainName: '소백산', courseName: '비로봉', priority: 7 },
        { mountainName: '북한산', courseName: '백운대', priority: 8 },
        { mountainName: '치악산', courseName: '비로봉', priority: 9 },
        { mountainName: '가야산', courseName: '칠불봉', priority: 10 }
      ],
      beginner: [
        // 초보 산쟁이 코스 BEST 5
        { mountainName: '남산', courseName: '순환', priority: 1 },
        { mountainName: '북한산', courseName: '둘레길', priority: 2 },
        { mountainName: '관악산', courseName: '연주대', priority: 3 },
        { mountainName: '인왕산', courseName: '성곽길', priority: 4 },
        { mountainName: '아차산', courseName: '고구려정', priority: 5 },
        // 매칭 실패 시 대체 산
        { mountainName: '검단산', courseName: '', priority: 1 },
        { mountainName: '청계산', courseName: '', priority: 2 }
      ],
      sunrise: [
        // 일몰&야경 코스 BEST 8
        { mountainName: '남산', courseName: '팔각정', priority: 1 },
        { mountainName: '북한산', courseName: '인수봉', priority: 2 },
        { mountainName: '관악산', courseName: '연주대', priority: 3 },
        { mountainName: '용마산', courseName: '정상', priority: 4 },
        { mountainName: '응봉산', courseName: '', priority: 5 },
        { mountainName: '남한산성', courseName: '남문', priority: 6 },
        { mountainName: '안산', courseName: '봉수대', priority: 7 },
        { mountainName: '청계산', courseName: '매봉', priority: 8 },
        // 매칭 실패 시 대체 산
        { mountainName: '검단산', courseName: '', priority: 1 },
        { mountainName: '검둔산', courseName: '', priority: 6 }
      ]
    }
    
    const priorityCourses = themeCourseMap[theme] || []
    
    // 우선 코스 찾기
    const foundPriorityCourses = []
    for (const priorityCourse of priorityCourses) {
      try {
        // 산 찾기 (더 넓은 범위로 검색)
        let mountain = await mountainCollection.findOne({
          $or: [
            { mntiname: { $regex: priorityCourse.mountainName, $options: 'i' } },
            { name: { $regex: priorityCourse.mountainName, $options: 'i' } },
            { MNTN_NM: { $regex: priorityCourse.mountainName, $options: 'i' } },
            { mntiname: priorityCourse.mountainName },
            { name: priorityCourse.mountainName }
          ]
        })
        
        // 산 이름에서 일부만 포함되어도 찾기 (예: "설악산" -> "설악")
        if (!mountain && priorityCourse.mountainName.length > 2) {
          const shortName = priorityCourse.mountainName.replace('산', '')
          mountain = await mountainCollection.findOne({
            $or: [
              { mntiname: { $regex: shortName, $options: 'i' } },
              { name: { $regex: shortName, $options: 'i' } },
              { MNTN_NM: { $regex: shortName, $options: 'i' } }
            ]
          })
        }
        
        if (mountain) {
          // mountainCode 추출 (여러 필드에서 시도)
          let mountainCode = String(mountain.mntilistno || mountain.code || '')
          
          // mntilistno가 없으면 다른 필드에서 찾기
          if (!mountainCode || mountainCode === 'undefined' || mountainCode === 'null' || mountainCode === '') {
            if (mountain.trail_match?.mountain_info?.mntilistno) {
              mountainCode = String(mountain.trail_match.mountain_info.mntilistno)
            } else if (mountain._id) {
              // ObjectId를 문자열로 사용
              mountainCode = String(mountain._id)
            }
          }
          
          console.log(`[테마별 코스] 산 찾음 - ${priorityCourse.mountainName}: ${mountainCode}, 실제 이름: ${mountain.mntiname || mountain.name}`)
          
          // /api/mountains/:code/courses와 동일한 로직으로 코스 가져오기
          let courses = []
          
          if (mountainCode && mountainCode !== 'undefined' && mountainCode !== 'null' && mountainCode !== '') {
            try {
              // 파일에서 코스 읽기 (기존 /api/mountains/:code/courses 로직과 동일)
              const { readFile, readdir } = await import('fs/promises')
              const { join } = await import('path')
              const { existsSync } = await import('fs')
              
              const codeNum = parseInt(mountainCode)
              if (!isNaN(codeNum)) {
                // {code}_geojson 디렉토리에서 파일 찾기
                const geojsonDir = join('/app', 'mountain', `${codeNum}_geojson`)
                
                if (existsSync(geojsonDir)) {
                  try {
                    const files = await readdir(geojsonDir)
                    // PMNTN_로 시작하는 .json 파일 찾기 (SPOT 제외)
                    const courseFile = files.find(f => 
                      f.startsWith('PMNTN_') && 
                      f.endsWith('.json') && 
                      !f.includes('SPOT')
                    )
                    
                    if (courseFile) {
                      const filePath = join(geojsonDir, courseFile)
                      const fileData = JSON.parse(await readFile(filePath, 'utf-8'))
                      const features = fileData.features || (fileData.type === 'FeatureCollection' ? fileData.features : (fileData.type === 'Feature' ? [fileData] : []))
                      
                      if (features.length > 0) {
                        // GeoJSON features를 코스 형식으로 변환 (기존 로직과 동일)
                        const processedFeatures = features
                          .map(course => {
                            if (course.attributes && (!course.properties || !course.properties.difficulty)) {
                              const attrs = course.attributes
                              const upTime = attrs.PMNTN_UPPL || 0
                              const downTime = attrs.PMNTN_GODN || 0
                              const totalMinutes = upTime + downTime
                              const distance = attrs.PMNTN_LT || 0
                              const surfaceMaterial = (attrs.PMNTN_MTRQ || '').trim()
                              
                              // 난이도 추정
                              const estimateDifficulty = (distance, totalMinutes, surfaceMaterial) => {
                                const hardSurfaces = ['암석', '바위', '암벽', '절벽']
                                const easySurfaces = ['포장', '콘크리트', '데크']
                                
                                let baseDifficulty = '보통'
                                if (hardSurfaces.some(s => surfaceMaterial.includes(s))) {
                                  baseDifficulty = '어려움'
                                } else if (easySurfaces.some(s => surfaceMaterial.includes(s))) {
                                  baseDifficulty = '쉬움'
                                }
                                
                                if (distance <= 1.5 && totalMinutes <= 60) return '쉬움'
                                if (distance >= 10 || totalMinutes >= 240) return '어려움'
                                
                                if (baseDifficulty === '쉬움') {
                                  return (distance <= 5 && totalMinutes <= 120) ? '쉬움' : '보통'
                                } else if (baseDifficulty === '어려움') {
                                  return '어려움'
                                } else {
                                  if (distance <= 3 && totalMinutes <= 90) return '쉬움'
                                  if (distance >= 8 || totalMinutes >= 180) return '어려움'
                                  return '보통'
                                }
                              }
                              
                              const difficulty = estimateDifficulty(distance, totalMinutes, surfaceMaterial)
                              
                              let duration = ''
                              if (totalMinutes >= 60) {
                                const hours = Math.floor(totalMinutes / 60)
                                const minutes = totalMinutes % 60
                                duration = minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`
                              } else {
                                duration = `${totalMinutes}분`
                              }
                              
                              if (!course.properties) {
                                course.properties = {}
                              }
                              
                              course.properties.difficulty = difficulty
                              course.properties.distance = course.properties.distance || distance
                              course.properties.duration = course.properties.duration || duration
                              course.properties.upTime = upTime
                              course.properties.downTime = downTime
                              course.properties.name = course.properties.name || attrs.PMNTN_NM || attrs.PMNTN_MAIN
                              course.properties.description = course.properties.description || attrs.PMNTN_MAIN || ''
                            }
                            
                            const courseName = (course.properties?.name || course.name || '').trim()
                            if (!courseName || courseName === '' || courseName === ' ') {
                              return null
                            }
                            return course
                          })
                          .filter(course => course !== null)
                          
                        // 10분 이하 또는 0.5km 이하 코스 제외
                        const filteredCourses = processedFeatures.filter(course => {
                          const props = course.properties || {}
                          let totalTime = 0
                          if (props.upTime !== undefined && props.downTime !== undefined) {
                            totalTime = (props.upTime || 0) + (props.downTime || 0)
                          } else if (props.PMNTN_UPPL !== undefined || props.PMNTN_GODN !== undefined) {
                            totalTime = (props.PMNTN_UPPL || 0) + (props.PMNTN_GODN || 0)
                          }
                          const distance = props.distance || props.PMNTN_LT || 0
                          return !(totalTime <= 10 || distance <= 0.5)
                        })
                        
                        // 같은 코스명으로 그룹화
                        const courseGroups = {}
                        filteredCourses.forEach(course => {
                          const props = course.properties || {}
                          const courseName = props.name || ''
                          if (!courseName) return
                          
                          if (!courseGroups[courseName]) {
                            courseGroups[courseName] = {
                              course: course,
                              segments: [course],
                              totalTime: (props.upTime || 0) + (props.downTime || 0),
                              totalDistance: props.distance || 0
                            }
                          } else {
                            courseGroups[courseName].segments.push(course)
                            const currentTime = (props.upTime || 0) + (props.downTime || 0)
                            const currentDistance = props.distance || 0
                            if (currentTime > courseGroups[courseName].totalTime) {
                              courseGroups[courseName].totalTime = currentTime
                              courseGroups[courseName].course = course
                            }
                            if (currentDistance > courseGroups[courseName].totalDistance) {
                              courseGroups[courseName].totalDistance = currentDistance
                            }
                          }
                        })
                        
                        courses = Object.values(courseGroups).map(group => {
                          const representativeCourse = group.course
                          const props = representativeCourse.properties || {}
                          
                          if (group.segments.length > 1) {
                            let totalTime = 0
                            let totalDistance = 0
                            group.segments.forEach(seg => {
                              const segProps = seg.properties || {}
                              totalTime += (segProps.upTime || 0) + (segProps.downTime || 0)
                              totalDistance += segProps.distance || 0
                            })
                            
                            if (!props.upTime && !props.downTime) {
                              const hours = Math.floor(totalTime / 60)
                              const minutes = totalTime % 60
                              props.duration = minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`
                            }
                            props.distance = totalDistance
                          }
                          
                          return representativeCourse
                        })
                        
                        console.log(`[테마별 코스] ${priorityCourse.mountainName} 파일에서 코스 ${courses.length}개 찾음: ${filePath}`)
                      }
                    }
                  } catch (dirError) {
                    console.error(`[테마별 코스] 디렉토리 읽기 오류 - ${priorityCourse.mountainName}:`, dirError.message)
                  }
                }
              }
            } catch (fileReadError) {
              console.error(`[테마별 코스] 파일 읽기 오류 - ${priorityCourse.mountainName}:`, fileReadError.message)
            }
          }
          
          console.log(`[테마별 코스] ${priorityCourse.mountainName} 코스 개수: ${courses.length}, mountainCode: ${mountainCode}`)
          
          // 코스 이름으로 필터링 (우선 코스명이 있으면)
          let matchedCourse = null
          if (priorityCourse.courseName && courses.length > 0) {
            matchedCourse = courses.find(course => {
              const courseName = (course.courseName || '').toLowerCase()
              const props = course.properties || {}
              const propsName = (props.name || props.PMNTN_NM || '').toLowerCase()
              const searchName = priorityCourse.courseName.toLowerCase()
              
              return courseName.includes(searchName) ||
                     propsName.includes(searchName) ||
                     courseName.includes(searchName.replace('봉', '')) ||
                     propsName.includes(searchName.replace('봉', ''))
            })
          }
          
          // 매칭된 코스가 없으면 첫 번째 코스 사용 (초보 코스는 어려움 제외)
          if (!matchedCourse && courses.length > 0) {
            if (theme === 'beginner') {
              // 초보 코스는 쉬움/보통만 선택
              matchedCourse = courses.find(c => {
                const diff = (c.properties?.difficulty || c.difficulty || '').toLowerCase()
                return !diff.includes('어려움') && !diff.includes('고급') && !diff.includes('hard')
              }) || courses[0]
            } else {
              matchedCourse = courses[0]
            }
            console.log(`[테마별 코스] ${priorityCourse.mountainName} 첫 번째 코스 사용: ${matchedCourse?.courseName || matchedCourse?.properties?.name || '이름 없음'}`)
          }
          
          // 초보 코스는 어려움 난이도 제외
          if (matchedCourse && theme === 'beginner') {
            const diff = (matchedCourse.properties?.difficulty || matchedCourse.difficulty || '').toLowerCase()
            if (diff.includes('어려움') || diff.includes('고급') || diff.includes('hard')) {
              matchedCourse = null
              console.log(`[테마별 코스] ${priorityCourse.mountainName} 어려움 난이도 제외`)
            }
          }
          
          if (matchedCourse) {
            const props = matchedCourse.properties || {}
            const distance = matchedCourse.distance || props.distance || props.PMNTN_LT || 0
            const duration = matchedCourse.duration || props.duration || ''
            const difficulty = matchedCourse.difficulty || props.difficulty || '보통'
            
            // location 추출 (여러 필드에서 시도)
            let location = mountain.location || ''
            if (!location) {
              const mntiadd = mountain.mntiadd || mountain.MNTN_LOC || ''
              if (mntiadd) {
                // 주소에서 시/도 추출
                const locationMatch = mntiadd.match(/([가-힣]+(?:시|도|특별시|광역시))/)
                if (locationMatch) {
                  location = locationMatch[1]
                } else {
                  location = mntiadd.split(' ')[0] || mntiadd
                }
              }
            }
            
            // description 추출
            let description = props.description || props.PMNTN_MAIN || ''
            if (!description || description.trim() === '') {
              description = `${priorityCourse.mountainName}의 ${priorityCourse.courseName || '등산'} 코스입니다.`
            }
            
            // 코스 이름을 "~산의 ~ 구간" 형식으로 만들기
            const courseNameOnly = matchedCourse.courseName || props.name || props.PMNTN_NM || '구간'
            // 산 이름에서 주소 제거 (괄호 안의 내용 제거)
            let mountainNameOnly = mountain.mntiname || mountain.name || priorityCourse.mountainName
            // 괄호와 그 안의 내용 제거 (예: "검봉산(강원특별자치도...)" -> "검봉산")
            mountainNameOnly = mountainNameOnly.replace(/\([^)]*\)/g, '').trim()
            // "구간"이 이미 포함되어 있으면 그대로 사용, 없으면 "구간" 추가
            const finalCourseName = courseNameOnly.includes('구간') 
              ? `${mountainNameOnly}의 ${courseNameOnly}`
              : `${mountainNameOnly}의 ${courseNameOnly}구간`
            
            foundPriorityCourses.push({
              id: matchedCourse._id,
              name: finalCourseName,
              location: location,
              mountainName: mountainNameOnly,
              mountainCode: mountainCode,
              difficulty: difficulty,
              duration: duration,
              distance: typeof distance === 'number' ? distance.toFixed(1) + 'km' : String(distance),
              description: description,
              priority: priorityCourse.priority
            })
            console.log(`[테마별 코스] 우선 코스 추가: ${priorityCourse.mountainName} - ${matchedCourse.courseName || props.name || '이름 없음'}`)
          } else {
            console.log(`[테마별 코스] ${priorityCourse.mountainName} 코스를 찾지 못함 (코스 개수: ${courses.length})`)
          }
        } else {
          console.log(`[테마별 코스] 산을 찾지 못함: ${priorityCourse.mountainName}`)
        }
      } catch (error) {
        console.error(`[테마별 코스] 우선 코스 찾기 실패 - ${priorityCourse.mountainName}:`, error)
      }
    }
    
    // 우선순위로 정렬
    foundPriorityCourses.sort((a, b) => (a.priority || 999) - (b.priority || 999))
    
    // 우선 코스가 부족하면 추가 코스 찾기
    let additionalCourses = []
    if (foundPriorityCourses.length < parseInt(limit)) {
      // 모든 코스 가져오기
      let allCourses = await Course.find({}).lean()
      
      // 코스에 산 정보 추가
      const coursesWithMountain = await Promise.all(
        allCourses.map(async (course) => {
          try {
            const mountainCode = String(course.mountainCode || '')
            const mountain = await mountainCollection.findOne({ 
              mntilistno: mountainCode 
            })
            
            if (!mountain) {
              const codeNum = parseInt(mountainCode)
              if (!isNaN(codeNum)) {
                const mountain2 = await mountainCollection.findOne({ 
                  mntilistno: codeNum 
                })
                if (mountain2) {
                  return {
                    ...course,
                    mountainName: mountain2.mntiname || mountain2.name || '',
                    mountainLocation: mountain2.location || '',
                    mountainCode: String(mountain2.mntilistno || mountainCode)
                  }
                }
              }
            }
            
            return {
              ...course,
              mountainName: mountain?.mntiname || mountain?.name || '',
              mountainLocation: mountain?.location || '',
              mountainCode: String(mountain?.mntilistno || mountainCode)
            }
          } catch (error) {
            return {
              ...course,
              mountainName: '',
              mountainLocation: '',
              mountainCode: String(course.mountainCode || '')
            }
          }
        })
      )
      
      // 이미 포함된 코스 제외
      const includedIds = new Set(foundPriorityCourses.map(c => String(c.id)))
      const remainingCourses = coursesWithMountain.filter(c => 
        !includedIds.has(String(c._id))
      )
      
      // 테마별 필터링
      let filtered = []
      switch(theme) {
        case 'winter':
          filtered = remainingCourses.filter(course => {
            const mountainName = (course.mountainName || '').toLowerCase()
            return ['설악', '한라', '지리', '태백', '덕유', '소백', '계룡', '내장', '오대', '치악', '가야'].some(name => 
              mountainName.includes(name.toLowerCase())
            )
          })
          filtered.sort((a, b) => (b.distance || 0) - (a.distance || 0))
          break
        case 'beginner':
          filtered = remainingCourses.filter(course => {
            const difficulty = (course.difficulty || '').toLowerCase()
            const distance = course.distance || 0
            // 어려움 난이도는 제외
            if (difficulty.includes('어려움') || difficulty.includes('고급') || difficulty.includes('hard')) {
              return false
            }
            return difficulty.includes('쉬움') || 
                   difficulty.includes('초급') || 
                   difficulty.includes('easy') ||
                   (distance > 0 && distance <= 5)
          })
          filtered.sort((a, b) => (a.distance || 999) - (b.distance || 999))
          break
        case 'sunrise':
          filtered = remainingCourses.filter(course => {
            const mountainName = (course.mountainName || '').toLowerCase()
            const courseName = (course.courseName || '').toLowerCase()
            return ['남산', '북한', '관악', '용마', '응봉', '남한산성', '안산', '청계'].some(name => 
              mountainName.includes(name.toLowerCase()) || 
              courseName.includes(name.toLowerCase())
            )
          })
          filtered.sort((a, b) => (b.distance || 0) - (a.distance || 0))
          break
        default:
          filtered = remainingCourses
      }
      
      // 추가 코스 포맷팅
      additionalCourses = filtered.slice(0, parseInt(limit) - foundPriorityCourses.length).map((course, index) => {
        const props = course.courseData?.properties || course.properties || {}
        const distance = course.distance || props.distance || props.PMNTN_LT || 0
        const duration = course.duration || props.duration || ''
        const difficulty = course.difficulty || props.difficulty || '보통'
        
        // 코스 이름을 "~산의 ~ 구간" 형식으로 만들기
        const courseNameOnly = course.courseName || props.name || props.PMNTN_NM || '구간'
        // 산 이름에서 주소 제거 (괄호 안의 내용 제거)
        let mountainNameOnly = course.mountainName || ''
        mountainNameOnly = mountainNameOnly.replace(/\([^)]*\)/g, '').trim()
        const finalCourseName = mountainNameOnly 
          ? (courseNameOnly.includes('구간') 
              ? `${mountainNameOnly}의 ${courseNameOnly}`
              : `${mountainNameOnly}의 ${courseNameOnly}구간`)
          : courseNameOnly
        
        return {
          id: course._id || `additional_${index}`,
          name: finalCourseName,
          location: course.mountainLocation || '',
          mountainName: mountainNameOnly,
          mountainCode: course.mountainCode || '',
          difficulty: difficulty,
          duration: duration,
          distance: typeof distance === 'number' ? distance.toFixed(1) + 'km' : String(distance),
          description: props.description || props.PMNTN_MAIN || `${mountainNameOnly}의 등산 코스입니다.`
        }
      })
    }
    
    // 우선 코스 + 추가 코스 합치기
    const allFormattedCourses = [...foundPriorityCourses, ...additionalCourses]
    const finalCourses = allFormattedCourses.slice(0, parseInt(limit))
    
    console.log('[테마별 코스] 우선 코스:', foundPriorityCourses.length, '추가 코스:', additionalCourses.length, '최종:', finalCourses.length)
    
    res.json({ 
      theme,
      courses: finalCourses,
      count: finalCourses.length
    })
  } catch (error) {
    console.error('[테마별 코스] 조회 오류:', error)
    res.status(500).json({ error: '테마별 코스 조회 실패', details: error.message })
  }
})

// 특정 산의 등산 지점 가져오기
app.get('/api/mountains/:code/spots', async (req, res) => {
  try {
    const { code } = req.params
    console.log('등산 지점 요청 - code:', code)
    
    // 먼저 하드코딩된 정보에서 찾기
    let mountainInfo = getMountainInfo(code)
    let actualMountainCode = code
    let mountainName = null
    
    // 하드코딩된 정보에 없으면 Mountain_list에서 찾기
    if (!mountainInfo) {
      const mongoose = await import('mongoose')
      const db = mongoose.default.connection.db
      const collections = await db.listCollections().toArray()
      const collectionNames = collections.map(c => c.name)
      
      let mountainListCollectionName = collectionNames.find(name => name === 'Mountain_list')
      if (!mountainListCollectionName) {
        mountainListCollectionName = collectionNames.find(name => name.toLowerCase() === 'mountain_list') || 'Mountain_list'
      }
      const actualCollection = db.collection(mountainListCollectionName)
      
      // code가 ObjectId 형식인지 확인
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(code)
      let mountain = null
      
      if (isObjectId) {
        try {
          const objectId = new mongoose.default.Types.ObjectId(code)
          mountain = await actualCollection.findOne({ _id: objectId })
        } catch (e) {
          console.error('ObjectId 변환 실패:', e)
        }
      } else {
        const codeNum = parseInt(code)
        mountain = await actualCollection.findOne({
          $or: [
            { mntilistno: codeNum },
            { mntilistno: code },
            { 'trail_match.mountain_info.mntilistno': codeNum },
            { 'trail_match.mountain_info.mntilistno': code },
            { code: codeNum },
            { code: code }
          ]
        })
      }
      
      if (mountain) {
        const mountainInfoData = mountain.trail_match?.mountain_info || {}
        actualMountainCode = String(mountain.mntilistno || mountainInfoData.mntilistno || code)
        mountainName = mountain.mntiname || mountainInfoData.mntiname || mountain.name || '이름 없음'
      }
    } else {
      actualMountainCode = code
      mountainName = mountainInfo.name
    }
    
    // 파일 경로 생성: mountain/{mntilistno}_geojson/PMNTN_SPOT_*.json
    const { readdir, readFile } = await import('fs/promises')
    const { existsSync } = await import('fs')
    const geojsonDir = join('/app', 'mountain', `${actualMountainCode}_geojson`)
    
    console.log('지점 파일 찾기 시도 - 경로:', geojsonDir)
    
    if (existsSync(geojsonDir)) {
      // PMNTN_SPOT_로 시작하는 JSON 파일 찾기
      const files = await readdir(geojsonDir)
      const spotFiles = files.filter(f => f.startsWith('PMNTN_SPOT_') && f.endsWith('.json'))
      
      console.log('찾은 지점 파일들:', spotFiles)
      
      if (spotFiles.length > 0) {
        // 첫 번째 지점 파일 읽기
        const spotFilePath = join(geojsonDir, spotFiles[0])
        const spotData = JSON.parse(await readFile(spotFilePath, 'utf-8'))
        
        return res.json({
          code: actualMountainCode,
          name: mountainName || mountainInfo?.name || '이름 없음',
          spots: spotData.features || (Array.isArray(spotData) ? spotData : [spotData])
        })
      }
    }
    
    // 파일이 없으면 빈 배열 반환 (404 대신 200)
    return res.json({
      code: actualMountainCode,
      name: mountainName || mountainInfo?.name || '이름 없음',
      spots: []
    })
  } catch (error) {
    console.error('Error loading spot data:', error)
    // 에러 발생 시에도 빈 배열 반환 (404 대신 200)
    return res.json({
      code: req.params.code,
      name: '이름 없음',
      spots: []
    })
  }
})

// 산별 날씨 정보 (5일 예보)
app.get('/api/mountains/:code/weather', async (req, res) => {
  try {
    const { code } = req.params
    const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || '5845f67e1cb9eac922b39d43844a8fc1'
    
    // 먼저 /api/mountains/:code를 호출해서 center 정보 가져오기 (가장 확실한 방법)
    let lat = null
    let lon = null
    
    try {
      // 내부적으로 직접 DB 조회 (더 효율적)
      const mongoose = await import('mongoose')
      if (mongoose.default.connection.readyState === 1) {
        const db = mongoose.default.connection.db
        const collections = await db.listCollections().toArray()
        const actualCollectionName = collections.find(c => 
          c.name.toLowerCase() === 'mountain_list' || 
          c.name.toLowerCase() === 'mountain_lists'
        )?.name || 'Mountain_list'
        
        const actualCollection = db.collection(actualCollectionName)
        
        const codeStr = String(code)
        let codeNum = parseInt(code)
        if (isNaN(codeNum)) codeNum = null
        
        let mountain = null
        
        // ObjectId로 시도
        if (code.match(/^[0-9a-fA-F]{24}$/)) {
          mountain = await actualCollection.findOne({ _id: new mongoose.default.Types.ObjectId(code) })
        }
        
        // mntilistno로 시도
        if (!mountain) {
          const query = { $or: [] }
          if (codeNum !== null) {
            query.$or.push(
              { mntilistno: codeNum },
              { mntilistno: parseFloat(code) },
              { 'trail_match.mountain_info.mntilistno': codeNum },
              { 'trail_match.mountain_info.mntilistno': parseFloat(code) }
            )
          }
          query.$or.push(
            { mntilistno: codeStr },
            { mntilistno: code },
            { 'trail_match.mountain_info.mntilistno': codeStr },
            { 'trail_match.mountain_info.mntilistno': code }
          )
          mountain = await actualCollection.findOne(query)
        }
        
        if (mountain) {
          // /api/mountains/:code와 동일한 center 매핑 로직 사용
          const mountainInfo = mountain.trail_match?.mountain_info || {}
          const mappedCenter = mountain.center || 
            (mountain.MNTN_CTR ? { 
              lat: mountain.MNTN_CTR.lat || mountain.MNTN_CTR[0], 
              lon: mountain.MNTN_CTR.lon || mountain.MNTN_CTR[1] 
            } : null) || 
            (mountain.coordinates ? { 
              lat: mountain.coordinates.lat, 
              lon: mountain.coordinates.lon 
            } : null) ||
            (mountain.lat && (mountain.lon || mountain.lng) ? {
              lat: mountain.lat,
              lon: mountain.lon || mountain.lng
            } : null)
          
          if (mappedCenter && mappedCenter.lat && mappedCenter.lon) {
            lat = mappedCenter.lat
            lon = mappedCenter.lon
            console.log(`날씨 API - /api/mountains와 동일한 로직으로 좌표 찾음: lat=${lat}, lon=${lon}`)
          }
        }
      }
    } catch (err) {
      console.error('날씨 API - 좌표 찾기 오류:', err)
    }
    
    // 좌표가 없으면 추가로 찾기 시도
    if (!lat || !lon) {
      // 실제 컬렉션 이름 찾기
      const mongoose = await import('mongoose')
      if (mongoose.default.connection.readyState === 1) {
        const db = mongoose.default.connection.db
        const collections = await db.listCollections().toArray()
        const actualCollectionName = collections.find(c => 
          c.name.toLowerCase() === 'mountain_list' || 
          c.name.toLowerCase() === 'mountain_lists'
        )?.name || 'Mountain_list'
        
        const actualCollection = db.collection(actualCollectionName)
        
        // 다양한 방법으로 산 찾기
        const codeStr = String(code)
        let codeNum = parseInt(code)
        if (isNaN(codeNum)) codeNum = null
        
        let foundMountain = null
        
        // ObjectId로 시도
        if (code.match(/^[0-9a-fA-F]{24}$/)) {
          foundMountain = await actualCollection.findOne({ _id: new mongoose.default.Types.ObjectId(code) })
        }
        
        // mntilistno로 시도
        if (!foundMountain) {
          foundMountain = await actualCollection.findOne({ 
            $or: [
              { mntilistno: code },
              { mntilistno: codeStr },
              { mntilistno: codeNum },
              { 'trail_match.mountain_info.mntilistno': code },
              { 'trail_match.mountain_info.mntilistno': codeStr },
              { 'trail_match.mountain_info.mntilistno': codeNum }
            ]
          })
        }
        
        if (foundMountain) {
          // /api/mountains/:code와 동일한 center 매핑 로직 사용
          const mappedCenter = foundMountain.center || 
            (foundMountain.MNTN_CTR ? { 
              lat: foundMountain.MNTN_CTR.lat || foundMountain.MNTN_CTR[0] || foundMountain.MNTN_CTR.y, 
              lon: foundMountain.MNTN_CTR.lon || foundMountain.MNTN_CTR[1] || foundMountain.MNTN_CTR.x 
            } : null) || 
            (foundMountain.coordinates ? { 
              lat: foundMountain.coordinates.lat, 
              lon: foundMountain.coordinates.lon 
            } : null) ||
            (foundMountain.lat && (foundMountain.lon || foundMountain.lng) ? {
              lat: foundMountain.lat,
              lon: foundMountain.lon || foundMountain.lng
            } : null)
          
          if (mappedCenter && mappedCenter.lat && mappedCenter.lon) {
            lat = mappedCenter.lat
            lon = mappedCenter.lon
            console.log(`날씨 API - /api/mountains와 동일한 로직으로 좌표 찾음: lat=${lat}, lon=${lon}`)
          } else {
            // 좌표 찾기 - 다양한 필드명 확인 (fallback)
            if (foundMountain.lat && (foundMountain.lon || foundMountain.lng)) {
              lat = foundMountain.lat
              lon = foundMountain.lon || foundMountain.lng
              console.log(`날씨 API - DB에서 lat/lng로 좌표 찾음: lat=${lat}, lon=${lon}`)
            } else if (foundMountain.center) {
              if (foundMountain.center.lat && foundMountain.center.lon) {
                lat = foundMountain.center.lat
                lon = foundMountain.center.lon
                console.log(`날씨 API - DB에서 center 객체로 좌표 찾음: lat=${lat}, lon=${lon}`)
              } else if (Array.isArray(foundMountain.center) && foundMountain.center.length >= 2) {
                lat = foundMountain.center[0]
                lon = foundMountain.center[1]
                console.log(`날씨 API - DB에서 center 배열로 좌표 찾음: lat=${lat}, lon=${lon}`)
              }
            } else if (foundMountain.MNTN_CTR) {
              if (Array.isArray(foundMountain.MNTN_CTR) && foundMountain.MNTN_CTR.length >= 2) {
                lat = foundMountain.MNTN_CTR[0]
                lon = foundMountain.MNTN_CTR[1]
                console.log(`날씨 API - DB에서 MNTN_CTR 배열로 좌표 찾음: lat=${lat}, lon=${lon}`)
              } else if (foundMountain.MNTN_CTR.lat && foundMountain.MNTN_CTR.lon) {
                lat = foundMountain.MNTN_CTR.lat
                lon = foundMountain.MNTN_CTR.lon
                console.log(`날씨 API - DB에서 MNTN_CTR 객체로 좌표 찾음: lat=${lat}, lon=${lon}`)
              }
            } else if (foundMountain.trail_match?.mountain_info) {
              const info = foundMountain.trail_match.mountain_info
              if (info.lat && (info.lon || info.lng)) {
                lat = info.lat
                lon = info.lon || info.lng
                console.log(`날씨 API - DB에서 trail_match.mountain_info로 좌표 찾음: lat=${lat}, lon=${lon}`)
              } else if (info.center) {
                if (Array.isArray(info.center) && info.center.length >= 2) {
                  lat = info.center[0]
                  lon = info.center[1]
                  console.log(`날씨 API - DB에서 trail_match.mountain_info.center 배열로 좌표 찾음: lat=${lat}, lon=${lon}`)
                } else if (info.center.lat && info.center.lon) {
                  lat = info.center.lat
                  lon = info.center.lon
                  console.log(`날씨 API - DB에서 trail_match.mountain_info.center 객체로 좌표 찾음: lat=${lat}, lon=${lon}`)
                }
              }
            }
          }
        }
      }
    }
    
    // 여전히 좌표가 없으면 기본값 사용 (서울) - 경고 로그
    if (!lat || !lon) {
      console.warn(`날씨 API - 좌표를 찾을 수 없어 기본값(서울) 사용: code=${code}`)
      lat = 37.5665
      lon = 126.9780
    }
    
    console.log(`날씨 API - 최종 사용 좌표: lat=${lat}, lon=${lon}, code=${code}`)
    
    // OpenWeatherMap API 호출 (3시간 간격, 5일 예보)
    const openWeatherUrl = 'https://api.openweathermap.org/data/2.5/forecast'
    const openWeatherParams = new URLSearchParams({
      lat: lat.toString(),
      lon: lon.toString(),
      appid: OPENWEATHER_API_KEY,
      units: 'metric',
      lang: 'kr'
    })
    
    console.log(`날씨 API - OpenWeatherMap API 호출: lat=${lat}, lon=${lon}`)
    const forecastResponse = await fetch(`${openWeatherUrl}?${openWeatherParams}`)
    if (!forecastResponse.ok) {
      const errorText = await forecastResponse.text()
      console.error(`날씨 API - OpenWeatherMap API 실패: ${forecastResponse.status}`, errorText)
      throw new Error(`Weather API error: ${forecastResponse.status}`)
    }
    
    const forecastData = await forecastResponse.json()
    console.log(`날씨 API - OpenWeatherMap 응답 받음: list.length=${forecastData.list?.length}`)
    
    const result = await processOpenWeatherData(forecastData, code, lat, lon)
    console.log(`날씨 API - 처리 완료: forecast.length=${result.forecast?.length}`)
    return res.json(result)
  } catch (error) {
    console.error('날씨 정보 가져오기 오류:', error)
    res.status(500).json({ 
      error: '날씨 정보를 가져오는데 실패했습니다.',
      message: error.message 
    })
  }
})

// OpenWeatherMap 데이터 처리 함수 (3시간 간격, 5일 예보)
// current_weather_refine.json 형식으로 변환
async function processOpenWeatherData(forecastData, code, lat, lon) {
  const dailyForecast = {}
  const city = forecastData.city || {}
  
  // 오늘 날짜 기준으로 필터링 (어제 제외) - 한국 시간 기준 (KST, UTC+9)
  const now = new Date()
  // 한국 시간대(UTC+9)로 변환
  const kstOffset = 9 * 60 * 60 * 1000 // 9시간을 밀리초로
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000)
  const koreaTime = new Date(utcTime + kstOffset)
  
  const todayYear = koreaTime.getFullYear()
  const todayMonth = String(koreaTime.getMonth() + 1).padStart(2, '0')
  const todayDay = String(koreaTime.getDate()).padStart(2, '0')
  const todayKey = `${todayYear}-${todayMonth}-${todayDay}`
  const todayKeyNum = parseInt(todayKey.replace(/-/g, ''))
  
  console.log(`날씨 API - 현재 시간 (UTC): ${now.toISOString()}`)
  console.log(`날씨 API - 오늘 날짜 (KST): ${todayKey} (숫자: ${todayKeyNum})`)
  
  // 3시간 간격 데이터를 일별로 그룹화하고 오전/오후로 분류
  forecastData.list.forEach(item => {
    const utcTimestamp = item.dt * 1000
    const utcDate = new Date(utcTimestamp)
    const formatter = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false
    })
    const parts = formatter.formatToParts(utcDate)
    const year = parts.find(p => p.type === 'year').value
    const month = parts.find(p => p.type === 'month').value
    const day = parts.find(p => p.type === 'day').value
    const hour = parseInt(parts.find(p => p.type === 'hour').value)
    const dateKey = `${year}-${month}-${day}`
    
    // 오늘 날짜 이후만 포함 (어제 완전히 제외) - 날짜를 숫자로 변환해서 엄격하게 비교
    const dateKeyNum = parseInt(dateKey.replace(/-/g, ''))
    const todayKeyNum = parseInt(todayKey.replace(/-/g, ''))
    
    // 어제 날짜는 완전히 제외 (오늘 날짜부터만 포함) - 엄격한 비교
    if (dateKeyNum < todayKeyNum) {
      console.log(`날씨 API - 어제 날짜 제외: ${dateKey} (${dateKeyNum}) < 오늘: ${todayKey} (${todayKeyNum})`)
      return // 어제 날짜는 완전히 제외
    }
    
    // 오늘 날짜보다 작으면 무조건 제외 (안전장치)
    if (dateKey < todayKey) {
      console.log(`날씨 API - 어제 날짜 제외 (문자열 비교): ${dateKey} < ${todayKey}`)
      return
    }
    
    // 오늘 날짜부터만 포함 (오전/오후 모두 표시)
    
    if (!dailyForecast[dateKey]) {
      dailyForecast[dateKey] = {
        date: dateKey,
        morning: { temps: [], weathers: [], winds: [], icons: [], items: [] },
        afternoon: { temps: [], weathers: [], winds: [], icons: [], items: [] }
      }
    }
    
    // current_weather_refine.json 형식으로 변환하여 저장
    const refinedItem = {
      coord: city.coord || { lat, lon },
      weather: item.weather,
      main: {
        temp: item.main.temp,
        feels_like: item.main.feels_like,
        temp_min: item.main.temp_min,
        temp_max: item.main.temp_max,
        humidity: item.main.humidity
      },
      wind: item.wind || {},
      clouds: item.clouds || {},
      dt: item.dt,
      sys: {
        country: city.country || 'KR',
        sunrise: city.sunrise,
        sunset: city.sunset
      },
      timezone: city.timezone || 32400,
      id: city.id || null,
      name: city.name || null,
      cod: forecastData.cod || '200',
      hour: hour // 시간 정보 추가
    }
    
    // 오전(0시~11시59분)과 오후(12시~23시59분)로 분류
    if (hour < 12) {
      dailyForecast[dateKey].morning.temps.push(item.main.temp)
      dailyForecast[dateKey].morning.weathers.push(item.weather[0])
      dailyForecast[dateKey].morning.winds.push(item.wind?.speed || 0)
      dailyForecast[dateKey].morning.icons.push(item.weather[0].icon)
      dailyForecast[dateKey].morning.items.push(refinedItem)
    } else {
      dailyForecast[dateKey].afternoon.temps.push(item.main.temp)
      dailyForecast[dateKey].afternoon.weathers.push(item.weather[0])
      dailyForecast[dateKey].afternoon.winds.push(item.wind?.speed || 0)
      dailyForecast[dateKey].afternoon.icons.push(item.weather[0].icon)
      dailyForecast[dateKey].afternoon.items.push(refinedItem)
    }
  })
  
  // 일별 데이터 변환 (오늘부터 정확히 5일) - 오전/오후로 분리
  const result = []
  
  // 날짜를 숫자로 변환해서 정확히 필터링 (어제 완전히 제외)
  const allDates = Object.keys(dailyForecast)
  console.log(`날씨 API - 필터링 전 모든 날짜: ${allDates.join(', ')}`)
  
  // 어제 날짜를 dailyForecast에서 완전히 제거
  Object.keys(dailyForecast).forEach(dateKey => {
    const dateKeyNum = parseInt(dateKey.replace(/-/g, ''))
    if (dateKeyNum < todayKeyNum) {
      console.log(`날씨 API - dailyForecast에서 어제 날짜 삭제: ${dateKey}`)
      delete dailyForecast[dateKey]
    }
  })
  
  const sortedDates = Object.keys(dailyForecast)
    .map(dateKey => ({
      dateKey,
      dateNum: parseInt(dateKey.replace(/-/g, ''))
    }))
    .filter(({ dateKey, dateNum }) => {
      // 오늘 날짜 이상만 포함 (어제는 완전히 제외) - 이중 체크
      if (dateNum < todayKeyNum || dateKey < todayKey) {
        console.error(`날씨 API - 오류: 어제 날짜가 여전히 존재함! ${dateKey} (${dateNum} < ${todayKeyNum})`)
        return false
      }
      return true
    })
    .sort((a, b) => a.dateNum - b.dateNum) // 날짜순 정렬
    .slice(0, 5) // 정확히 5일만
    .map(({ dateKey }) => dateKey) // dateKey만 추출
  
  console.log(`날씨 API - 오늘 날짜: ${todayKey} (${todayKeyNum}), 필터링 후 날짜 개수: ${sortedDates.length}, 날짜들: ${sortedDates.join(', ')}`)
  
  // 어제 날짜가 포함되어 있으면 에러
  sortedDates.forEach(dateKey => {
    const dateKeyNum = parseInt(dateKey.replace(/-/g, ''))
    if (dateKeyNum < todayKeyNum) {
      console.error(`날씨 API - 치명적 오류: 어제 날짜가 최종 결과에 포함됨! ${dateKey} (${dateKeyNum} < ${todayKeyNum})`)
    }
  })
  
  sortedDates.forEach(dateKey => {
    // 한 번 더 확인: 어제 날짜는 절대 포함하지 않음 (삼중 체크)
    const dateKeyNum = parseInt(dateKey.replace(/-/g, ''))
    if (dateKeyNum < todayKeyNum || dateKey < todayKey) {
      console.error(`날씨 API - 오류: 어제 날짜가 최종 결과에 포함됨! ${dateKey} (${dateKeyNum} < ${todayKeyNum}) - 건너뜀`)
      return // 이 날짜는 건너뛰기
    }
    
    // dailyForecast에 해당 날짜가 없으면 건너뛰기 (이미 삭제된 경우)
    if (!dailyForecast[dateKey]) {
      console.log(`날씨 API - dailyForecast에 ${dateKey} 없음 (이미 삭제됨)`)
      return
    }
    
    const day = dailyForecast[dateKey]
    // 날짜를 직접 파싱 (시간대 문제 방지)
    const [year, month, dayNum] = dateKey.split('-').map(Number)
    const date = new Date(year, month - 1, dayNum) // 월은 0부터 시작하므로 -1
    const dayNames = ['일', '월', '화', '수', '목', '금', '토']
    
    // 오늘 날짜인지 확인
    const isToday = dateKey === todayKey
    
    // 오전 데이터 (9시 시간대 기준, 없으면 가장 가까운 시간)
    if (day.morning.items.length > 0) {
      let morningItem = null
      let morningHour = 9
      
      // 9시 시간대 찾기
      const morning9 = day.morning.items.find(item => item.hour === 9)
      if (morning9) {
        morningItem = morning9
        morningHour = 9
      } else {
        // 가장 가까운 시간대 찾기
        let minDiff = Infinity
        day.morning.items.forEach(item => {
          const diff = Math.abs(item.hour - 9)
          if (diff < minDiff) {
            minDiff = diff
            morningItem = item
            morningHour = item.hour
          }
        })
      }
      
      if (morningItem) {
        // 오전: 0시 ~ 11시 59분까지
        result.push({
          date: dateKey,
          dayName: dayNames[date.getDay()],
          month: month, // 직접 파싱한 월 사용
          day: dayNum, // 직접 파싱한 일 사용
          period: '오전',
          tempMin: Math.round(Math.min(...day.morning.temps)),
          tempMax: Math.round(Math.max(...day.morning.temps)),
          weather: morningItem.weather[0],
          windSpeed: (day.morning.winds.reduce((a, b) => a + b, 0) / day.morning.winds.length).toFixed(1),
          icon: morningItem.weather[0].icon,
          // current_weather_refine.json 형식 데이터 추가
          refined: {
            coord: morningItem.coord,
            weather: morningItem.weather,
            main: morningItem.main,
            wind: morningItem.wind,
            clouds: morningItem.clouds,
            dt: morningItem.dt,
            sys: morningItem.sys,
            timezone: morningItem.timezone,
            id: morningItem.id,
            name: morningItem.name,
            cod: morningItem.cod
          }
        })
      }
    } else if (isToday && day.afternoon.items.length > 0) {
      // 오늘 날짜인데 오전 데이터가 없으면, 오후 데이터를 기반으로 오전 데이터 생성
      // 가장 이른 오후 시간대 데이터 사용 (12시 또는 가장 가까운 시간)
      let morningItem = null
      let minHour = Infinity
      
      day.afternoon.items.forEach(item => {
        if (item.hour < minHour) {
          minHour = item.hour
          morningItem = item
        }
      })
      
      if (morningItem) {
        // 오전 데이터로 변환 (온도는 약간 낮게 조정)
        const adjustedTemp = morningItem.main.temp - 2 // 오전은 약간 낮게
        const adjustedTempMin = Math.min(morningItem.main.temp_min, adjustedTemp)
        const adjustedTempMax = Math.max(morningItem.main.temp_max, adjustedTemp)
        
        // 오전: 0시 ~ 11시 59분까지
        result.push({
          date: dateKey,
          dayName: dayNames[date.getDay()],
          month: month,
          day: dayNum,
          period: '오전',
          tempMin: Math.round(adjustedTempMin),
          tempMax: Math.round(adjustedTempMax),
          weather: morningItem.weather[0],
          windSpeed: (morningItem.wind?.speed || 0).toFixed(1),
          icon: morningItem.weather[0].icon,
          refined: {
            coord: morningItem.coord,
            weather: morningItem.weather,
            main: {
              ...morningItem.main,
              temp: adjustedTemp,
              temp_min: adjustedTempMin,
              temp_max: adjustedTempMax
            },
            wind: morningItem.wind,
            clouds: morningItem.clouds,
            dt: morningItem.dt,
            sys: morningItem.sys,
            timezone: morningItem.timezone,
            id: morningItem.id,
            name: morningItem.name,
            cod: morningItem.cod
          }
        })
        console.log(`날씨 API - 오늘 날짜 오전 데이터 생성 (오후 데이터 기반): ${dateKey}`)
      }
    }
    
    // 오후 데이터 (15시 시간대 기준, 없으면 가장 가까운 시간)
    if (day.afternoon.items.length > 0) {
      let afternoonItem = null
      let afternoonHour = 15
      
      // 15시 시간대 찾기
      const afternoon15 = day.afternoon.items.find(item => item.hour === 15)
      if (afternoon15) {
        afternoonItem = afternoon15
        afternoonHour = 15
      } else {
        // 가장 가까운 시간대 찾기
        let minDiff = Infinity
        day.afternoon.items.forEach(item => {
          const diff = Math.abs(item.hour - 15)
          if (diff < minDiff) {
            minDiff = diff
            afternoonItem = item
            afternoonHour = item.hour
          }
        })
      }
      
      if (afternoonItem) {
        // 오후: 12시 ~ 23시 59분까지 (자정 전까지)
        result.push({
          date: dateKey,
          dayName: dayNames[date.getDay()],
          month: month, // 직접 파싱한 월 사용
          day: dayNum, // 직접 파싱한 일 사용
          period: '오후',
          tempMin: Math.round(Math.min(...day.afternoon.temps)),
          tempMax: Math.round(Math.max(...day.afternoon.temps)),
          weather: afternoonItem.weather[0],
          windSpeed: (day.afternoon.winds.reduce((a, b) => a + b, 0) / day.afternoon.winds.length).toFixed(1),
          icon: afternoonItem.weather[0].icon,
          // current_weather_refine.json 형식 데이터 추가
          refined: {
            coord: afternoonItem.coord,
            weather: afternoonItem.weather,
            main: afternoonItem.main,
            wind: afternoonItem.wind,
            clouds: afternoonItem.clouds,
            dt: afternoonItem.dt,
            sys: afternoonItem.sys,
            timezone: afternoonItem.timezone,
            id: afternoonItem.id,
            name: afternoonItem.name,
            cod: afternoonItem.cod
          }
        })
      }
    }
  })
  
  // 최종 결과에서도 어제 날짜 제거 (최종 안전장치)
  const finalResult = result.filter(item => {
    const itemDateNum = parseInt(item.date.replace(/-/g, ''))
    if (itemDateNum < todayKeyNum) {
      console.error(`날씨 API - 최종 결과에서 어제 날짜 제거: ${item.date}`)
      return false
    }
    return true
  })
  
  console.log(`날씨 API - 최종 반환 날짜: ${finalResult.map(r => r.date).join(', ')}`)
  
  return { code, lat, lon, forecast: finalResult }
}

// 등산일정 하루 전 알림 체크 함수
async function checkScheduleReminders() {
  try {
    // 내일 날짜 계산
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    
    const tomorrowEnd = new Date(tomorrow)
    tomorrowEnd.setHours(23, 59, 59, 999)
    
    // 내일 등산일정이 있는 사용자 찾기
    const schedules = await Schedule.find({
      scheduledDate: {
        $gte: tomorrow,
        $lte: tomorrowEnd
      }
    }).populate('user', 'id name').lean()
    
    console.log(`등산일정 알림 체크 - 내일 등산일정이 있는 사용자 수: ${schedules.length}`)
    
    for (const schedule of schedules) {
      // 이미 오늘 알림이 있는지 확인 (중복 방지)
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      
      const existingNotification = await Notification.findOne({
        user: schedule.user._id,
        type: 'schedule_reminder',
        relatedId: schedule._id,
        createdAt: {
          $gte: todayStart
        }
      })
      
      if (!existingNotification) {
        const notification = new Notification({
          user: schedule.user._id,
          type: 'schedule_reminder',
          title: '등산일정 알림',
          message: `내일 ${schedule.mountainName} 등산일정이 있습니다.`,
          relatedId: schedule._id,
          relatedModel: 'Schedule'
        })
        await notification.save()
        console.log(`등산일정 알림 생성: ${schedule.user.name} - ${schedule.mountainName}`)
      }
    }
  } catch (error) {
    console.error('등산일정 알림 체크 오류:', error)
  }
}

// 서버 시작 시 등산일정 알림 체크
// 이후 매일 자정에 실행되도록 설정 (24시간마다)
setInterval(checkScheduleReminders, 24 * 60 * 60 * 1000) // 24시간
// 서버 시작 시 즉시 한 번 실행
setTimeout(checkScheduleReminders, 10000) // 10초 후 실행 (DB 연결 대기)


// 즐겨찾기한 산 목록 조회 (인증 필요) - /api/mountains/:code보다 먼저 정의해야 함
app.get('/api/mountains/favorites/my', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const user = await User.findById(userId).select('favoriteMountains').lean()
    
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    }

    const favoriteMountainCodes = user.favoriteMountains || []
    
    console.log('즐겨찾기한 산 목록 조회 - userId:', userId, 'codes:', favoriteMountainCodes)
    
    if (favoriteMountainCodes.length === 0) {
      console.log('즐겨찾기한 산이 없음')
      return res.json({ mountains: [] })
    }

    // MongoDB 연결 확인
    const mongoose = await import('mongoose')
    const db = mongoose.default.connection.db
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(c => c.name)
    
    let mountainListCollectionName = collectionNames.find(name => name === 'Mountain_list')
    if (!mountainListCollectionName) {
      mountainListCollectionName = collectionNames.find(name => 
        name.toLowerCase() === 'mountain_list'
      ) || 'Mountain_list'
    }
    
    const actualCollection = db.collection(mountainListCollectionName)
    
    // 즐겨찾기한 산 코드들로 산 정보 조회
    const mountains = []
    for (const code of favoriteMountainCodes) {
      console.log('산 정보 조회 시도 - code:', code, 'type:', typeof code)
      
      try {
        // 내부적으로 산 상세 정보 조회 로직 재사용
        const codeNum = parseInt(code)
        const isObjectId = /^[0-9a-fA-F]{24}$/.test(code)
        
        let mountain = null
        if (isObjectId) {
          try {
            const objectId = new mongoose.default.Types.ObjectId(code)
            mountain = await actualCollection.findOne({ _id: objectId })
          } catch (e) {
            console.log('ObjectId 변환 실패:', e)
          }
        } else {
          // 여러 형식으로 검색 시도
          const searchQueries = [
            { mntilistno: codeNum },
            { mntilistno: Number(code) },
            { mntilistno: code },
            { mntilistno: String(codeNum) },
            { code: codeNum },
            { code: Number(code) },
            { code: code },
            { code: String(codeNum) },
            { 'trail_match.mountain_info.mntilistno': codeNum },
            { 'trail_match.mountain_info.mntilistno': code }
          ]
          
          for (const query of searchQueries) {
            mountain = await actualCollection.findOne(query)
            if (mountain) {
              console.log('산 정보 찾음 (query:', query, ')')
              break
            }
          }
        }
        
        if (mountain) {
          console.log('산 정보 찾음:', mountain.mntiname || mountain.name)
          const mountainInfo = mountain.trail_match?.mountain_info || {}
          const mappedMountain = {
            code: String(mountain.mntilistno || mountainInfo.mntilistno || mountain.code || mountain.MNTN_CD || code),
            name: mountain.mntiname || mountainInfo.mntiname || mountain.name || mountain.MNTN_NM || '이름 없음',
            height: (() => {
              const mntihighValue = mountain.mntihigh !== undefined && mountain.mntihigh !== null 
                ? mountain.mntihigh 
                : (mountainInfo.mntihigh !== undefined && mountainInfo.mntihigh !== null 
                  ? mountainInfo.mntihigh 
                  : null)
              if (mntihighValue !== null && mntihighValue !== undefined) {
                if (mntihighValue === 0 || mntihighValue === '0' || String(mntihighValue).trim() === '0') {
                  return null
                }
                return String(mntihighValue) + 'm'
              }
              return mountain.height || mountain.MNTN_HG || null
            })(),
            location: (() => {
              const loc = mountain.mntiadd || mountainInfo.mntiadd || mountain.location || mountain.MNTN_LOC || null
              if (loc && typeof loc === 'string') {
                return loc.replace(/-+$/, '').trim()
              }
              return loc
            })(),
            center: mountain.center || (mountain.MNTN_CTR ? { lat: mountain.MNTN_CTR.lat || mountain.MNTN_CTR[0], lon: mountain.MNTN_CTR.lon || mountain.MNTN_CTR[1] } : null) || null
          }
          mountains.push(mappedMountain)
        } else {
          console.log('DB에서 산 정보를 찾지 못함, MOUNTAIN_ROUTES에서 검색 - code:', code)
          // DB에 없으면 MOUNTAIN_ROUTES에서 찾기
          const mountainInfo = getMountainInfo(code)
          if (mountainInfo) {
            console.log('MOUNTAIN_ROUTES에서 산 정보 찾음:', mountainInfo.name)
            mountains.push({
              code: code,
              name: mountainInfo.name,
              height: null,
              location: null,
              center: mountainInfo.center ? { lat: mountainInfo.center[0], lon: mountainInfo.center[1] } : null
            })
          } else {
            console.log('MOUNTAIN_ROUTES에서도 산 정보를 찾지 못함 - code:', code)
            // 그래도 코드와 함께 추가 (최소한 링크는 작동하도록)
            mountains.push({
              code: code,
              name: `산 (코드: ${code})`,
              height: null,
              location: null,
              center: null
            })
          }
        }
      } catch (err) {
        console.error('산 정보 조회 중 오류 - code:', code, 'error:', err)
        // 오류가 발생해도 최소한 코드는 포함
        mountains.push({
          code: code,
          name: `산 (코드: ${code})`,
          height: null,
          location: null,
          center: null
        })
      }
    }
    
    console.log('최종 반환할 산 목록:', mountains.length, '개', mountains.map(m => m.name))
    res.json({ mountains })
  } catch (error) {
    console.error('즐겨찾기한 산 목록 조회 오류:', error)
    res.status(500).json({ error: '즐겨찾기한 산 목록을 불러오는 중 오류가 발생했습니다.' })
  }
})

// imgbb.co 페이지 URL에서 실제 이미지 URL 추출 API
app.get('/api/utils/imgbb-url', async (req, res) => {
  try {
    const { url } = req.query
    
    if (!url || !url.includes('ibb.co/')) {
      return res.status(400).json({ error: 'Invalid imgbb.co URL' })
    }
    
    // imgbb.co 페이지에서 실제 이미지 URL 추출
    const https = await import('https')
    const http = await import('http')
    
    return new Promise((resolve) => {
      const protocol = url.startsWith('https') ? https : http
      protocol.get(url, (response) => {
        let html = ''
        response.on('data', (chunk) => {
          html += chunk.toString()
        })
        response.on('end', () => {
          // HTML에서 실제 이미지 URL 찾기
          const imgMatch = html.match(/https:\/\/i\.ibb\.co\/[^"\s<>]+\.(jpg|jpeg|png|gif|webp)/i)
          
          if (imgMatch) {
            resolve(res.json({ imageUrl: imgMatch[0] }))
          } else {
            // 찾지 못하면 원본 URL 반환
            resolve(res.json({ imageUrl: url }))
          }
        })
      }).on('error', (error) => {
        console.error('imgbb.co URL 추출 실패:', error)
        resolve(res.status(500).json({ error: 'Failed to extract image URL', imageUrl: url }))
      })
    })
  } catch (error) {
    console.error('imgbb.co URL 추출 실패:', error)
    return res.status(500).json({ error: 'Failed to extract image URL', imageUrl: req.query.url })
  }
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`)
})

