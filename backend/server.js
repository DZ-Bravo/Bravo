import express from 'express'
import cors from 'cors'
import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
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

// MongoDB 연결 (비동기로 처리, 서버 시작은 계속 진행)
connectDB()

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
    
    console.log('매핑된 산 개수:', dedupedMountains.length)
    console.log('반환할 산 개수:', dedupedMountains.length)
    
    // 디버깅 정보 포함 (개발 환경에서만)
    const response = { 
      mountains: dedupedMountains,
      total: totalMountainListCount,
      returned: dedupedMountains.length
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
          // 더 넓은 범위로 검색 시도
          const searchQueries = [
            { mntilistno: codeNum },
            { mntilistno: Number(code) },
            { mntilistno: code },
            { mntilistno: String(codeNum) },
            { 'trail_match.mountain_info.mntilistno': codeNum },
            { 'trail_match.mountain_info.mntilistno': Number(code) },
            { 'trail_match.mountain_info.mntilistno': code },
            { 'trail_match.mountain_info.mntilistno': String(codeNum) },
            { code: codeNum },
            { code: Number(code) },
            { code: code },
            { code: String(codeNum) }
          ]
          
          console.log(`인기 산 검색 - code: ${code}, codeNum: ${codeNum}, 쿼리 개수: ${searchQueries.length}`)
          
          for (const query of searchQueries) {
            mountain = await actualCollection.findOne(query)
            if (mountain) {
              console.log(`인기 산 찾음 - 쿼리:`, query, '결과:', mountain.mntiname || mountain.name)
              break
            }
          }
          
          // 그래도 못 찾으면 모든 문서를 확인 (디버깅용)
          if (!mountain && code === '287201304') {
            console.log('북한산을 찾지 못함 - 모든 문서 확인 중...')
            const allMountains = await actualCollection.find({}).limit(10).toArray()
            console.log('샘플 문서들:', allMountains.map(m => ({
              mntilistno: m.mntilistno,
              mntiname: m.mntiname,
              name: m.name,
              _id: m._id
            })))
          }
        }
        
        if (mountain) {
          // DB에 저장된 실제 필드에서 산 이름 가져오기
          // mntiname 필드를 우선 사용 (DB에 실제 저장된 필드)
          const fullName = mountain.mntiname || 
                      mountain.trail_match?.mountain_info?.mntiname || 
                      mountain.name ||
                      mountain.MNTN_NM ||
                      mountain.mountainName ||
                      '이름 없음'
          
          // 목록에서는 짧은 이름 사용 (예: "북한산 백운대" -> "북한산")
          // "백운대", "대청봉", "천왕봉" 등 봉우리 이름 제거
          const name = fullName
            .replace(/\s+(백운대|대청봉|천왕봉|인수봉|만경대|주봉|정상).*$/, '')
            .trim()
          
          // 이미지 경로 매핑 (기존 하드코딩된 이미지 사용)
          const imageMap = {
            '287201304': '/images/popularity_img1.png',
            '428302602': '/images/popularity_img2.png',
            '488605302': '/images/popularity_img3.png',
            '421902904': '/images/popularity_img4.png',
            '483100401': '/images/popularity_img5.png',
            '457300301': '/images/popularity_img6.png',
            '438001301': '/images/popularity_img7.png'
          }
          
          return {
            id: code,
            name: name,
            image: imageMap[code] || '/images/popularity_img1.png', // 기본 이미지
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
    let mountainCenter = null

    if (mountainInfo && mountainInfo.name) {
      mountainName = mountainInfo.name
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
    // 산 코드/이름으로 바로 필터 (필드 존재 여부와 상관없이 OR로 시도)
    const lodgingFields = ['mountainCode', 'mountain_code', 'mntilistno', 'mountain_name', 'mountainName', 'code', 'mtn_cd', 'mountainId', 'area']
    const lodgingIds = [mountainCode, String(mountainCode), parseInt(mountainCode), mountainName].filter(v => v !== undefined && v !== null && v !== '' && !Number.isNaN(v))
    const lodgingOr = []
    lodgingFields.forEach(f => lodgingIds.forEach(id => lodgingOr.push({ [f]: id })))
    const lodgingQuery = lodgingOr.length > 0 ? { $or: lodgingOr } : {}
    console.log(`숙소 조회 - 산 코드/이름으로 OR 필터, 조건 수: ${lodgingOr.length}`)
    
    // 산 좌표가 없어도 데이터는 조회하여 반환 (거리 계산만 생략)
    lodgings = await Lodging.find(lodgingQuery).lean()
    console.log(`숙소 조회 - 총 ${lodgings.length}개 숙소 (산 좌표 ${mountainCenter ? '있음' : '없음'})`)
    
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

    // 숙소 데이터 형식 변환 (거리 제한 없음)
    console.log(`=== 숙소 필터링 시작 ===`)
    console.log(`산 이름: ${mountainName}`)
    console.log(`산 좌표:`, mountainCenter)
    console.log(`총 ${lodgings.length}개 숙소 발견`)
    
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
        // 산 코드/이름 매칭 여부 확인
        const matchesMountain = (() => {
          const fields = ['mountainCode', 'mountain_code', 'mntilistno', 'mountain_name', 'mountainName', 'code']
          const targets = [mountainCode, String(mountainCode), parseInt(mountainCode), mountainName].filter(Boolean)
          for (const f of fields) {
            if (lodging[f] !== undefined && lodging[f] !== null) {
              const value = String(lodging[f]).trim()
              if (targets.some(t => String(t).trim() === value)) return true
            }
          }
          return null // 매칭 정보가 없는 경우
        })()

        const lat = lodging.lodging_lat || lodging.lat || lodging.geometry?.location?.lat
        const lng = lodging.lodging_lng || lodging.lng || lodging.geometry?.location?.lng
        
        // 거리 계산 (산의 좌표가 있고 숙소의 좌표가 있는 경우만)
        let distance = null
        if (mountainCenter && lat && lng && !isNaN(lat) && !isNaN(lng)) {
          distance = calculateDistance(mountainCenter.lat, mountainCenter.lon, lat, lng)
          // 처음 10개만 상세 로그 출력
          if (lodgings.indexOf(lodging) < 10) {
            console.log(`숙소 거리 계산 - ${lodging.lodging_name || lodging.name}: 산(${mountainCenter.lat}, ${mountainCenter.lon}) -> 숙소(${lat}, ${lng}) = ${distance?.toFixed(2)}km`)
          }
        } else {
          if (lodgings.indexOf(lodging) < 5) {
            console.log(`숙소 거리 계산 실패 - ${lodging.lodging_name || lodging.name}: mountainCenter=${!!mountainCenter}, lat=${lat}, lng=${lng}`)
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
          distance: distance, // 거리 정보 추가
          __matchesMountain: matchesMountain
        }
      })
    
    console.log(`=== 최종 응답 ===`)
    console.log(`반환할 숙소 개수: ${lodgingList.length}개 (필터링 없음, DB 데이터 그대로)`)
    
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
    let mountainCenter = null

    if (mountainInfo && mountainInfo.name) {
      mountainName = mountainInfo.name
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
    // 산 코드/이름으로 바로 필터 (필드 존재 여부와 상관없이 OR로 시도)
    const restaurantFields = ['mountainCode', 'mountain_code', 'mntilistno', 'mountain_name', 'mountainName', 'code', 'mtn_cd', 'mountainId', 'area']
    const restaurantIds = [mountainCode, String(mountainCode), parseInt(mountainCode), mountainName].filter(v => v !== undefined && v !== null && v !== '' && !Number.isNaN(v))
    console.log(`맛집 쿼리 생성 - mountainCode: ${mountainCode}, mountainName: ${mountainName}, restaurantIds:`, restaurantIds)
    const restaurantOr = []
    restaurantFields.forEach(f => restaurantIds.forEach(id => restaurantOr.push({ [f]: id })))
    
    // 쿼리 조건 생성 (숙소와 동일)
    const restaurantQuery = restaurantOr.length > 0 ? { $or: restaurantOr } : {}
    console.log(`맛집 조회 - 산 코드/이름으로 OR 필터, 조건 수: ${restaurantOr.length}`)
    if (restaurantOr.length > 0) {
      console.log(`맛집 쿼리 조건 (처음 3개):`, JSON.stringify(restaurantOr.slice(0, 3), null, 2))
    } else {
      console.log(`⚠️ 맛집 쿼리 조건이 비어있음 - 산 코드: ${mountainCode}, 산 이름: ${mountainName}, restaurantIds:`, restaurantIds)
    }
    
    // 산 좌표가 없어도 데이터는 조회하여 반환 (거리 계산만 생략)
    restaurants = await Restaurant.find(restaurantQuery).lean()
    console.log(`맛집 조회 - 총 ${restaurants.length}개 맛집 문서 (산 좌표 ${mountainCenter ? '있음' : '없음'})`)
    console.log(`맛집 쿼리 조건:`, JSON.stringify(restaurantQuery, null, 2))
    console.log(`맛집 쿼리 조건 상세 - restaurantOr.length: ${restaurantOr.length}, restaurantIds:`, restaurantIds)
    
    // 컬렉션에 데이터가 있는지 확인
    const totalCount = await Restaurant.countDocuments({})
    console.log(`mountain_rastaurant 컬렉션 총 문서 수: ${totalCount}`)
    
    // 쿼리 결과가 없고 컬렉션에 데이터가 있으면 샘플 문서 확인 후 쿼리 조건 수정 시도
    if (restaurants.length === 0 && totalCount > 0) {
      console.log(`⚠️ 맛집 쿼리 결과가 없음. 샘플 문서 확인 후 쿼리 조건 수정 시도...`)
      console.log(`  - 산 코드: ${mountainCode}`)
      console.log(`  - 산 이름: ${mountainName}`)
      console.log(`  - 쿼리 조건:`, JSON.stringify(restaurantQuery, null, 2))
      
      // 샘플 문서 확인
      const sampleDoc = await Restaurant.findOne({}).lean()
      if (sampleDoc) {
        console.log(`  - 샘플 문서 필드:`, Object.keys(sampleDoc))
        // 산 관련 필드 확인
        const mountainFields = ['mountainCode', 'mountain_code', 'mntilistno', 'mountain_name', 'mountainName', 'code', 'mtn_cd', 'mountainId', 'area']
        const foundFields = mountainFields.filter(f => sampleDoc[f] !== undefined)
        console.log(`  - 샘플 문서의 산 관련 필드:`, foundFields)
        if (foundFields.length > 0) {
          foundFields.forEach(f => {
            console.log(`    - ${f}: ${sampleDoc[f]} (타입: ${typeof sampleDoc[f]})`)
          })
          
          // 실제 DB 필드에 맞는 쿼리 조건 재생성
          const newRestaurantOr = []
          foundFields.forEach(f => {
            restaurantIds.forEach(id => {
              // 타입 변환 시도
              const fieldValue = sampleDoc[f]
              const fieldType = typeof fieldValue
              if (fieldType === 'number') {
                newRestaurantOr.push({ [f]: Number(id) })
                newRestaurantOr.push({ [f]: String(id) })
              } else if (fieldType === 'string') {
                newRestaurantOr.push({ [f]: String(id) })
                if (!isNaN(id)) {
                  newRestaurantOr.push({ [f]: Number(id) })
                }
              } else {
                newRestaurantOr.push({ [f]: id })
              }
            })
          })
          
          if (newRestaurantOr.length > 0) {
            console.log(`  - 수정된 쿼리 조건으로 재시도 (조건 수: ${newRestaurantOr.length})`)
            restaurants = await Restaurant.find({ $or: newRestaurantOr }).lean()
            console.log(`  - 재시도 결과: ${restaurants.length}개 문서`)
          }
        }
      }
      
      // 여전히 결과가 없으면 전체 컬렉션 조회 (임시)
      if (restaurants.length === 0) {
        console.log(`  - 여전히 결과가 없음. 전체 컬렉션 조회 (임시)`)
        restaurants = await Restaurant.find({}).lean()
        console.log(`  - 전체 컬렉션 조회 결과: ${restaurants.length}개 문서`)
      }
    }
    
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

    // 맛집 데이터 형식 변환 (거리 제한 없음)
    console.log(`=== 맛집 필터링 시작 ===`)
    console.log(`산 이름: ${mountainName}`)
    console.log(`산 좌표:`, mountainCenter)
    console.log(`총 ${restaurants.length}개 맛집 문서 발견`)
    
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
      
      // 산 코드/이름 매칭 여부 확인
      const matchesMountain = (() => {
        const fields = ['mountainCode', 'mountain_code', 'mntilistno', 'mountain_name', 'mountainName', 'code']
        const targets = [mountainCode, String(mountainCode), parseInt(mountainCode), mountainName].filter(Boolean)
        for (const f of fields) {
          if (restaurant[f] !== undefined && restaurant[f] !== null) {
            const value = String(restaurant[f]).trim()
            if (targets.some(t => String(t).trim() === value)) return true
          }
        }
        return null // 매칭 정보가 없는 경우
      })()

      const lat = restaurant.lat || restaurant.geometry?.location?.lat
      const lng = restaurant.lng || restaurant.geometry?.location?.lng
      
      // 거리 계산 (산의 좌표가 있고 맛집의 좌표가 있는 경우만)
      let distance = null
      if (mountainCenter && lat && lng && !isNaN(lat) && !isNaN(lng)) {
        distance = calculateDistance(mountainCenter.lat, mountainCenter.lon, lat, lng)
        // 처음 10개만 상세 로그 출력
        if (restaurantList.length < 10) {
          console.log(`맛집 거리 계산 - ${restaurant.name}: 산(${mountainCenter.lat}, ${mountainCenter.lon}) -> 맛집(${lat}, ${lng}) = ${distance?.toFixed(2)}km`)
        }
      } else {
        if (restaurantList.length < 5) {
          console.log(`맛집 거리 계산 실패 - ${restaurant.name}: mountainCenter=${!!mountainCenter}, lat=${lat}, lng=${lng}`)
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
          const photoUrl = restaurant.photo
          // 직접 URL인 경우만 반환 (http/https로 시작)
          if (photoUrl && (photoUrl.startsWith('http') || photoUrl.startsWith('https'))) {
            return photoUrl
          }
          return null
        })(),
        photo_reference: restaurant.photo_reference,
        image: restaurant.image || restaurant.thumbnail,
        thumbnail: restaurant.thumbnail || restaurant.image,
        phone: restaurant.phone || restaurant.international_phone_number,
        mountainName: mountainName,
        distance: distance, // 거리 정보 추가
        __matchesMountain: matchesMountain
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
    
    console.log(`=== 최종 응답 ===`)
    console.log(`반환할 맛집 개수: ${restaurantList.length}개 (필터링 없음, DB 데이터 그대로)`)
    
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
      center: mountain.center || (mountain.MNTN_CTR ? { lat: mountain.MNTN_CTR.lat || mountain.MNTN_CTR[0], lon: mountain.MNTN_CTR.lon || mountain.MNTN_CTR[1] } : null) || (mountain.coordinates ? { lat: mountain.coordinates.lat, lon: mountain.coordinates.lon } : null),
      zoom: mountain.zoom || 13,
      origin: mountain.origin || mountain.MNTN_ORIGIN || mountain.mountainOrigin,
      admin: mountain.mntiadmin || mountain.admin
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`)
})

