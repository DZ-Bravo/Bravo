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
import authRoutes from './routes/auth.js'
import postsRoutes from './routes/posts.js'
import noticesRoutes from './routes/notices.js'

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
      const location = m.mntiadd || mountainInfo.mntiadd || m.location || m.MNTN_LOC || m.mountainLocation
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
        center = { lat: m.center.lat, lon: m.center.lon }
      } else if (m.MNTN_CTR) {
        center = { 
          lat: m.MNTN_CTR.lat || m.MNTN_CTR[0] || m.MNTN_CTR.y, 
          lon: m.MNTN_CTR.lon || m.MNTN_CTR[1] || m.MNTN_CTR.x 
        }
      } else if (m.coordinates) {
        center = { lat: m.coordinates.lat, lon: m.coordinates.lon }
      } else if (m.lat && m.lon) {
        center = { lat: m.lat, lon: m.lon }
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
    
    console.log('매핑된 산 개수:', mappedMountains.length)
    console.log('반환할 산 개수:', mappedMountains.length)
    
    // 디버깅 정보 포함 (개발 환경에서만)
    const response = { 
      mountains: mappedMountains,
      total: totalMountainListCount,
      returned: mappedMountains.length
    }
    
    // 첫 번째 샘플 데이터도 포함 (필드명 확인용)
    if (mountains.length > 0 && process.env.NODE_ENV !== 'production') {
      response.debug = {
        sampleFields: Object.keys(mountains[0]),
        sampleData: mountains[0],
        firstMapped: mappedMountains[0]
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

// 특정 산의 상세 정보 가져오기 (Mountain_list에서)
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
    
    res.json(mappedMountain)
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
          const courseFiles = files.filter(f => f.startsWith('PMNTN_') && f.endsWith('.json') && !f.includes('SPOT'))
          
          console.log('찾은 코스 파일들:', courseFiles)
          
          if (courseFiles.length > 0) {
            // 첫 번째 코스 파일 읽기 (보통 하나의 파일에 모든 코스가 있음)
            const courseFilePath = join(geojsonDir, courseFiles[0])
            const courseData = JSON.parse(await readFile(courseFilePath, 'utf-8'))
            
            // GeoJSON 형식으로 변환
            if (courseData.features) {
              courses = courseData.features
            } else if (courseData.type === 'FeatureCollection') {
              courses = courseData.features || []
            } else {
              courses = [courseData]
            }
            
            console.log('파일에서 가져온 코스 개수:', courses.length)
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
        // 이미 GeoJSON 형식이면 그대로 사용
        geoJsonCourses = courses
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
    
    // 오전(0-11시)과 오후(12-23시)로 분류
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
  
  const sortedDates = allDates
    .map(dateKey => ({
      dateKey,
      dateNum: parseInt(dateKey.replace(/-/g, ''))
    }))
    .filter(({ dateKey, dateNum }) => {
      // 오늘 날짜 이상만 포함 (어제는 완전히 제외)
      const isTodayOrAfter = dateNum >= todayKeyNum
      if (!isTodayOrAfter) {
        console.log(`날씨 API - 어제 날짜 필터링 제외: ${dateKey} (${dateNum} < ${todayKeyNum})`)
      }
      return isTodayOrAfter
    })
    .sort((a, b) => a.dateNum - b.dateNum) // 날짜순 정렬
    .slice(0, 5) // 정확히 5일만
    .map(({ dateKey }) => dateKey) // dateKey만 추출
  
  console.log(`날씨 API - 오늘 날짜: ${todayKey} (${todayKeyNum}), 필터링 후 날짜 개수: ${sortedDates.length}, 날짜들: ${sortedDates.join(', ')}`)
  
  // 어제 날짜가 포함되어 있으면 경고
  sortedDates.forEach(dateKey => {
    const dateKeyNum = parseInt(dateKey.replace(/-/g, ''))
    if (dateKeyNum < todayKeyNum) {
      console.error(`날씨 API - 오류: 어제 날짜가 포함됨: ${dateKey} (${dateKeyNum} < ${todayKeyNum})`)
    }
  })
  
  sortedDates.forEach(dateKey => {
    // 한 번 더 확인: 어제 날짜는 절대 포함하지 않음 (이중 체크)
    const dateKeyNum = parseInt(dateKey.replace(/-/g, ''))
    if (dateKeyNum < todayKeyNum || dateKey < todayKey) {
      console.error(`날씨 API - 오류: 어제 날짜가 최종 결과에 포함됨! ${dateKey} (${dateKeyNum} < ${todayKeyNum}) - 건너뜀`)
      return // 이 날짜는 건너뛰기
    }
    
    const day = dailyForecast[dateKey]
    const date = new Date(dateKey + 'T00:00:00+09:00')
    const dayNames = ['일', '월', '화', '수', '목', '금', '토']
    
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
        result.push({
          date: dateKey,
          dayName: dayNames[date.getDay()],
          month: date.getMonth() + 1,
          day: date.getDate(),
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
        result.push({
          date: dateKey,
          dayName: dayNames[date.getDay()],
          month: date.getMonth() + 1,
          day: date.getDate(),
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
  
  return { code, lat, lon, forecast: result }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`)
})

