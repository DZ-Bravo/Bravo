import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import axios from 'axios'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { existsSync, readFileSync, statSync } from 'fs'
import { promisify } from 'util'
import connectDB from './shared/config/database.js'
import { MOUNTAIN_ROUTES, getMountainInfo, getAllMountains } from './shared/utils/mountainRoutes.js'
import { MountainList } from './shared/models/Mountain.js'
import Course from './shared/models/Course.js'
import Lodging from './shared/models/Lodging.js'
import Post from './shared/models/Post.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3008

// 미들웨어
app.use(cors())
app.use(express.json())

// 정적 파일 서빙: /mountain 경로 (GeoJSON 파일, GPX 파일 등)
// mountain 폴더는 docker-compose.yml에서 볼륨 마운트됨
// 한글 파일명 지원을 위한 커스텀 파일 서빙
app.use('/mountain', (req, res, next) => {
  try {
    // URL 디코딩된 경로 사용 (한글 파일명 지원)
    let filePath = decodeURIComponent(req.path)
    
    // 디버깅 로그
    console.log('[정적 파일] 요청 경로:', req.path)
    console.log('[정적 파일] 디코딩된 경로:', filePath)
    
    // /mountain 접두사 제거
    if (filePath.startsWith('/mountain')) {
      filePath = filePath.replace(/^\/mountain/, '')
    }
    
    // 빈 경로나 디렉토리인지 확인
    if (!filePath || filePath === '/' || filePath === '') {
      return next()
    }
    
    // 선행 슬래시 제거
    if (filePath.startsWith('/')) {
      filePath = filePath.substring(1)
    }
    
    const fullPath = join('/app', 'mountain', filePath)
    console.log('[정적 파일] 최종 경로:', fullPath)
    console.log('[정적 파일] 파일 존재 여부:', existsSync(fullPath))
    
    // 파일이 존재하는지 확인 (한글 파일명 지원)
    if (existsSync(fullPath)) {
      const stats = statSync(fullPath)
      if (stats.isFile()) {
        console.log('[정적 파일] 파일 전송 성공:', fullPath)
        // Content-Type 설정
        if (fullPath.endsWith('.gpx')) {
          res.setHeader('Content-Type', 'application/gpx+xml; charset=utf-8')
        } else if (fullPath.endsWith('.json') || fullPath.endsWith('.geojson')) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
        }
        
        // 파일 읽기 및 전송
        const fileContent = readFileSync(fullPath, 'utf-8')
        return res.send(fileContent)
      }
    }
    
    // 파일을 찾지 못한 경우
    console.log('[정적 파일] 파일을 찾지 못함:', fullPath)
    next()
  } catch (error) {
    console.error('정적 파일 서빙 오류:', error.message, req.path)
    next()
  }
})

// express.static을 fallback으로 사용 (다른 파일들용)
app.use('/mountain', express.static(join('/app', 'mountain'), {
  index: false,
  dotfiles: 'ignore'
}))

// /mountain/{code} 경로로 접근 시 (숫자만 있는 경우) 나중에 처리
// 실제 파일은 /mountain/{code}_geojson/ 또는 /mountain/{code}_gpx/ 경로에 있음
// 이 라우트는 정적 파일 경로가 아닌 경우에만 처리되도록 함
app.get('/mountain/:code', (req, res, next) => {
  const { code } = req.params
  
  // 확장자가 있는 경우 (파일)는 next()로 넘김
  if (req.path.match(/\.(gpx|json|geojson)$/i)) {
    return next()
  }
  
  // 숫자로만 이루어진 경우 (산 코드) - 디렉토리이므로 404
  if (/^\d+$/.test(code)) {
    return res.status(404).json({ 
      error: 'Directory listing not available',
      message: `Please use /api/mountains/${code}/courses to get course data, or access specific files like /mountain/${code}_geojson/PMNTN_*.json`,
      redirect: `/api/mountains/${code}/courses`
    })
  }
  next()
})

// DB 연결
connectDB()

// 이미지 URL 변환 헬퍼 함수 (ibb.co 처리)
const normalizeImageUrl = (imageUrl) => {
  if (!imageUrl || typeof imageUrl !== 'string') return null
  
  let url = imageUrl.trim()
  if (url.length === 0) return null
  
  // ibb.co URL은 원본 그대로 반환 (프론트엔드에서 처리하거나, 실제 이미지 URL로 변환 필요)
  // imgbb.com의 실제 이미지 URL은 페이지 파싱이 필요하므로 원본 URL 반환
  // 프론트엔드에서 이미지 로드 실패 시 기본 이미지 사용
  if (url.includes('ibb.co/') && !url.includes('i.ibb.co')) {
    // 원본 URL 반환 (프론트엔드에서 처리)
    return url
  }
  
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) {
    return url
  }
  
  return null
}

// 산 정보 라우트 - Mountain_list 컬렉션에서 모든 산 가져오기
app.get('/api/mountains', async (req, res) => {
  try {
    const mongoose = await import('mongoose')
    const db = mongoose.default.connection.db
    
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(c => c.name)
    
    let mountainListCollectionName = collectionNames.find(name => name === 'Mountain_list') ||
      collectionNames.find(name => name.toLowerCase() === 'mountain_list') ||
      collectionNames.find(name => name.toLowerCase() === 'mountain_lists') ||
      'Mountain_list'
    
    const actualCollection = db.collection(mountainListCollectionName)
    const mountains = await actualCollection.find({}).toArray()
    
    // DB에서 이미지 추출하는 헬퍼 함수
    const getImageFromMountain = (mountain, mountainInfo = null) => {
      const imageFields = [
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
        mountain.trail_match?.mountain_info?.photo_url,
        mountain.trail_match?.mountain_info?.image_url,
        mountain.trail_match?.mountain_info?.photoUrl,
        mountain.trail_match?.mountain_info?.imageUrl,
        mountain.trail_match?.mountain_info?.image,
        mountain.trail_match?.mountain_info?.photo,
        mountain.trail_match?.mountain_info?.thumbnail,
        mountainInfo?.photo_url,
        mountainInfo?.image_url,
        mountainInfo?.photoUrl,
        mountainInfo?.imageUrl,
        mountainInfo?.image,
        mountainInfo?.photo,
        mountainInfo?.thumbnail
      ]
      
      for (const img of imageFields) {
        const normalizedUrl = normalizeImageUrl(img)
        if (normalizedUrl) {
          return normalizedUrl
        }
      }
      return null
    }
    
    // 데이터 매핑
    const mappedMountains = mountains.map(mountain => {
      const center = mountain.center || 
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
      
      const mountainInfo = mountain.trail_match?.mountain_info || {}
      
      return {
        code: String(mountain.mntilistno || mountain.code || mountain._id),
        name: mountain.mntiname || mountain.name || mountain.trail_match?.mountain_info?.mntiname,
        location: mountain.location || mountain.mntiadd || '',
        height: mountain.mntihigh || mountain.height || '',
        center: center ? [center.lat, center.lon] : null,
        description: mountain.description || '',
        image: getImageFromMountain(mountain, mountainInfo)
      }
    })
    
    res.json({ mountains: mappedMountains })
  } catch (error) {
    console.error('산 목록 조회 오류:', error)
    res.status(500).json({ error: error.message })
  }
})

// 인기 있는 산 가져오기 (등산일지에 가장 많이 언급된 산) - /api/mountains/:code보다 먼저 정의해야 함
app.get('/api/mountains/popular', async (req, res) => {
  try {
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
    
    // DB에서 이미지 추출하는 헬퍼 함수
    const getImageFromMountain = (mountain, mountainInfo = null) => {
      const imageFields = [
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
        mountain.trail_match?.mountain_info?.photo_url,
        mountain.trail_match?.mountain_info?.image_url,
        mountain.trail_match?.mountain_info?.photoUrl,
        mountain.trail_match?.mountain_info?.imageUrl,
        mountain.trail_match?.mountain_info?.image,
        mountain.trail_match?.mountain_info?.photo,
        mountain.trail_match?.mountain_info?.thumbnail,
        mountainInfo?.photo_url,
        mountainInfo?.image_url,
        mountainInfo?.photoUrl,
        mountainInfo?.imageUrl,
        mountainInfo?.image,
        mountainInfo?.photo,
        mountainInfo?.thumbnail
      ]
      
      for (const img of imageFields) {
        const normalizedUrl = normalizeImageUrl(img)
        if (normalizedUrl) {
          return normalizedUrl
        }
      }
      return null
    }
    
    const popularMountainsWithInfo = await Promise.all(
      popularMountains.map(async (item) => {
        const code = String(item._id)
        const codeNum = parseInt(code)
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
            if (mountain) break
          }
        }
        
        if (mountain) {
          const mountainInfo = mountain.trail_match?.mountain_info || {}
          const fullName = mountain.mntiname || 
                      mountainInfo.mntiname || 
                      mountain.name ||
                      mountain.MNTN_NM ||
                      mountain.mountainName ||
                      '이름 없음'
          
          const name = fullName
            .replace(/\s+(백운대|대청봉|천왕봉|인수봉|만경대|주봉|정상).*$/, '')
            .trim()
          
          let image = getImageFromMountain(mountain, mountainInfo)
          
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
    
    const result = popularMountainsWithInfo
      .filter(item => item !== null)
      .sort((a, b) => b.count - a.count)
    
    const defaultMountains = [
      { id: '287201304', name: '북한산', image: '/images/popularity_img1.png' },
      { id: '428302602', name: '설악산', image: '/images/popularity_img2.png' },
      { id: '488605302', name: '지리산', image: '/images/popularity_img3.png' },
      { id: '421902904', name: '태백산', image: '/images/popularity_img4.png' },
      { id: '483100401', name: '계룡산', image: '/images/popularity_img5.png' },
      { id: '457300301', name: '덕유산', image: '/images/popularity_img6.png' },
      { id: '438001301', name: '소백산', image: '/images/popularity_img7.png' }
    ]
    
    const existingIds = new Set(result.map(m => m.id))
    defaultMountains.forEach(mountain => {
      if (!existingIds.has(mountain.id) && result.length < 7) {
        result.push({ ...mountain, count: 0 })
      }
    })
    
    res.json({ mountains: result.slice(0, 7) })
  } catch (error) {
    console.error('인기 있는 산 가져오기 오류:', error)
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

// 특정 산의 통제 정보 조회 (더 구체적인 라우트를 먼저 정의)
app.get('/api/mountains/:code/control', async (req, res) => {
  try {
    const { code } = req.params
    const mongoose = await import('mongoose')
    const db = mongoose.default.connection.db
    
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(c => c.name)
    const controlCollectionName = collectionNames.find(name => 
      name.toLowerCase().includes('control')
    ) || 'mountain_control'
    
    const controlCollection = db.collection(controlCollectionName)
    const mountainInfo = getMountainInfo(code)
    let mountainName = mountainInfo?.name || null
    
    if (!mountainName) {
      const actualCollection = db.collection('Mountain_list')
      const codeNum = parseInt(code)
      const mountain = await actualCollection.findOne({
        $or: [
          { mntilistno: codeNum },
          { mntilistno: code },
          { 'trail_match.mountain_info.mntilistno': codeNum }
        ]
      })
      if (mountain) {
        mountainName = mountain.mntiname || mountain.trail_match?.mountain_info?.mntiname || mountain.name
      }
    }
    
    if (!mountainName) {
      return res.json({ control_status: '통제 없음', updated_at: null })
    }
    
    // 산 이름 정리: 괄호 제거, 언더스코어 제거, 공백 정리
    const nameWithoutParentheses = mountainName.split('(')[0].trim()
    const nameWithoutUnderscore = nameWithoutParentheses.split('_')[0].trim()
    const cleanName = nameWithoutUnderscore.replace(/\s+/g, ' ').trim()
    
    console.log(`통제 정보 조회 - 산 이름: ${mountainName}, cleanName: ${cleanName}`)
    
    // 먼저 MongoDB 쿼리로 직접 검색 시도 (여러 패턴으로)
    let controlInfo = await controlCollection.findOne({
      $or: [
        { mountain_name: cleanName },
        { mountain_name: mountainName },
        { mountain_name: nameWithoutParentheses },
        { mountain_name: { $regex: `^${cleanName}`, $options: 'i' } },
        { mountain_name: { $regex: cleanName, $options: 'i' } }
      ]
    })
    
    // 찾지 못하면 전체 데이터를 가져와서 메모리에서 검색
    if (!controlInfo) {
      const allControls = await controlCollection.find({}).toArray()
      console.log(`통제 정보 전체 개수: ${allControls.length}, 검색 대상: ${cleanName}`)
      
      controlInfo = allControls.find(control => {
        if (!control || !control.mountain_name) return false
        // control 컬렉션의 산 이름도 정리
        const controlNameRaw = (control.mountain_name || '').split('(')[0].trim()
        const controlName = controlNameRaw.split('_')[0].trim().replace(/\s+/g, ' ')
        
        // 정확히 일치
        if (controlName.toLowerCase() === cleanName.toLowerCase()) {
          console.log(`정확 일치: ${control.mountain_name} === ${cleanName}`)
          return true
        }
        // 포함 관계 확인 (양방향)
        if (controlName.toLowerCase().includes(cleanName.toLowerCase()) || 
            cleanName.toLowerCase().includes(controlName.toLowerCase())) {
          console.log(`부분 일치: ${control.mountain_name} <-> ${cleanName}`)
          return true
        }
        return false
      })
      
      if (controlInfo) {
        console.log(`통제 정보 찾음 (메모리 검색): ${controlInfo.mountain_name} -> ${controlInfo.control_status}`)
      } else {
        console.log(`통제 정보 없음 - 검색한 산 이름: ${cleanName}, 전체 통제 목록:`, allControls.map(c => c.mountain_name).join(', '))
      }
    } else {
      console.log(`통제 정보 찾음 (DB 쿼리): ${controlInfo.mountain_name} -> ${controlInfo.control_status}`)
    }
    
    if (controlInfo) {
      let controlStatus = controlInfo.control_status || '정보 없음'
      if (controlStatus === controlInfo.mountain_name || controlStatus === cleanName) {
        controlStatus = '통제 없음'
      }
      res.json({
        control_status: controlStatus,
        updated_at: controlInfo.updated_at || null
      })
    } else {
      res.json({ control_status: '통제 없음', updated_at: null })
    }
  } catch (error) {
    console.error('통제 정보 조회 오류:', error)
    res.json({ control_status: '통제 없음', updated_at: null })
  }
})

// 특정 산 주변 숙소 조회 (더 구체적인 라우트를 먼저 정의)
app.get('/api/mountains/:code/lodgings', async (req, res) => {
  try {
    const { code } = req.params
    const mongoose = await import('mongoose')
    const db = mongoose.default.connection.db
    
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
    
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(c => c.name)
    // mountain_lodging 컬렉션 우선 사용 (데이터가 더 많음)
    let lodgingCollectionName = collectionNames.find(name => 
      name === 'mountain_lodging' || name.toLowerCase() === 'mountain_lodging'
    )
    if (!lodgingCollectionName) {
      lodgingCollectionName = collectionNames.find(name => 
        name.toLowerCase().includes('lodging')
      ) || 'mountain_lodging'
    }
    
    // 모델이 이미 존재하면 삭제 후 재생성
    if (mongoose.default.models.Lodging) {
      delete mongoose.default.models.Lodging
    }
    const Lodging = mongoose.default.model('Lodging', 
      new mongoose.default.Schema({}, { strict: false }), 
      lodgingCollectionName
    )
    
    // mountainRoutes에서 산 이름 가져오기
    const mountainInfo = getMountainInfo(code)
    let mountainName = null
    let mountainLocation = null
    let mountainCenter = null
    
    if (mountainInfo && mountainInfo.name) {
      mountainName = mountainInfo.name
      mountainLocation = mountainInfo.location || null
      if (mountainInfo.center && Array.isArray(mountainInfo.center) && mountainInfo.center.length >= 2) {
        mountainCenter = { lat: mountainInfo.center[0], lon: mountainInfo.center[1] }
      }
    } else {
      // Mountain_list에서 산 정보 찾기
      let mountainListCollectionName = collectionNames.find(name => name === 'Mountain_list')
      if (!mountainListCollectionName) {
        mountainListCollectionName = collectionNames.find(name => 
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
        
        // 산의 좌표 가져오기 (여러 경로 확인)
        if (mountain.center) {
          if (typeof mountain.center === 'object' && mountain.center.lat !== undefined && mountain.center.lon !== undefined) {
            mountainCenter = { lat: mountain.center.lat, lon: mountain.center.lon }
          } else if (Array.isArray(mountain.center) && mountain.center.length >= 2) {
            mountainCenter = { lat: mountain.center[0], lon: mountain.center[1] }
          }
        }
        // MNTN_CTR 필드 확인
        if (!mountainCenter && mountain.MNTN_CTR) {
          if (typeof mountain.MNTN_CTR === 'object' && mountain.MNTN_CTR.lat !== undefined && mountain.MNTN_CTR.lon !== undefined) {
            mountainCenter = { lat: mountain.MNTN_CTR.lat, lon: mountain.MNTN_CTR.lon }
          } else if (Array.isArray(mountain.MNTN_CTR) && mountain.MNTN_CTR.length >= 2) {
            mountainCenter = { lat: mountain.MNTN_CTR[0], lon: mountain.MNTN_CTR[1] }
          }
        }
        // lat/lng 필드 직접 확인
        if (!mountainCenter && mountain.lat !== undefined && (mountain.lng !== undefined || mountain.lon !== undefined)) {
          mountainCenter = { lat: mountain.lat, lon: mountain.lng || mountain.lon }
        }
        // trail_match.mountain_info에서도 좌표 찾기
        if (!mountainCenter && mountain.trail_match?.mountain_info) {
          const info = mountain.trail_match.mountain_info
          if (info.lat !== undefined && info.lon !== undefined) {
            mountainCenter = { lat: info.lat, lon: info.lon }
          } else if (info.LAT !== undefined && info.LON !== undefined) {
            mountainCenter = { lat: info.LAT, lon: info.LON }
          } else if (info.center) {
            if (typeof info.center === 'object' && info.center.lat !== undefined && info.center.lon !== undefined) {
              mountainCenter = { lat: info.center.lat, lon: info.center.lon }
            } else if (Array.isArray(info.center) && info.center.length >= 2) {
              mountainCenter = { lat: info.center[0], lon: info.center[1] }
            }
          }
        }
        
        console.log(`[디버깅] 산 좌표 추출 - mountainName: ${mountainName}, mountainCenter:`, mountainCenter)
      }
    }
    
    const mountainCode = String(code)
    
    // 산 코드로만 숙소 필터링 (거리 제한 없음, 매칭된 숙소만 가져오기)
    const lodgingCodeFields = ['mountainCode', 'mountain_code', 'mntilistno', 'code', 'mtn_cd']
    const lodgingCodeIds = [mountainCode, String(mountainCode), parseInt(mountainCode)].filter(v => v !== undefined && v !== null && v !== '' && !Number.isNaN(v))
    console.log(`숙소 쿼리 생성 - mountainCode: ${mountainCode} (산 이름 제외, 코드만 사용)`)
    const lodgingOr = []
    lodgingCodeFields.forEach(f => lodgingCodeIds.forEach(id => lodgingOr.push({ [f]: id })))
    const lodgingQuery = lodgingOr.length > 0 ? { $or: lodgingOr } : {}
    console.log(`숙소 조회 - 산 코드로만 매칭 (거리 제한 없음), 조건 수: ${lodgingOr.length}`)
    
    let lodgings = await Lodging.find(lodgingQuery).lean()
    console.log(`숙소 조회 - 총 ${lodgings.length}개 숙소 문서 (산 코드로만 매칭)`)
    
    // 컬렉션에 데이터가 있는지 확인
    const totalCount = await Lodging.countDocuments({})
    console.log(`${lodgingCollectionName} 컬렉션 총 문서 수: ${totalCount}`)
    
    // 쿼리 결과가 없으면 디버깅 정보 출력 및 대체 검색
    if (lodgings.length === 0 && totalCount > 0) {
      console.log(`[디버깅] 쿼리 결과 없음 - 요청한 산 코드: ${mountainCode}`)
      console.log(`[디버깅] 쿼리 조건:`, JSON.stringify(lodgingQuery, null, 2))
      
      // 샘플 숙소 확인
      const sampleLodging = await Lodging.findOne({}).lean()
      if (sampleLodging) {
        console.log(`[디버깅] 샘플 숙소 필드:`, Object.keys(sampleLodging))
        console.log(`[디버깅] 샘플 숙소 코드 값:`, {
          mntilistno: sampleLodging.mntilistno,
          mountainCode: sampleLodging.mountainCode,
          mountain_code: sampleLodging.mountain_code,
          code: sampleLodging.code,
          mtn_cd: sampleLodging.mtn_cd
        })
        console.log(`[디버깅] 샘플 숙소 mountain_name:`, sampleLodging.mountain_name)
      }
      
      // 해당 코드를 가진 숙소가 실제로 있는지 확인 (모든 필드에서 검색)
      const testQuery = {
        $or: [
          { mntilistno: mountainCode },
          { mntilistno: parseInt(mountainCode) },
          { mountainCode: mountainCode },
          { mountainCode: parseInt(mountainCode) },
          { mountain_code: mountainCode },
          { code: mountainCode },
          { code: parseInt(mountainCode) }
        ]
      }
      const testResults = await Lodging.find(testQuery).limit(5).lean()
      console.log(`[디버깅] 대체 쿼리 결과: ${testResults.length}개`)
      if (testResults.length > 0) {
        console.log(`[디버깅] 대체 쿼리로 찾은 숙소:`, testResults.map(l => ({
          name: l.lodging_name || l.name,
          mntilistno: l.mntilistno,
          mountainCode: l.mountainCode,
          code: l.code
        })))
        lodgings = testResults
      }
      
      // 코드 기반 매칭이 실패하고 산 이름이 있으면, 산 이름으로 매칭 시도
      // 좌표가 있으면 거리 필터링 적용, 없으면 매우 엄격한 이름 매칭만 허용
      if (lodgings.length === 0 && mountainName) {
        console.log(`[디버깅] 산 이름으로 매칭 시도: ${mountainName} (좌표: ${mountainCenter ? '있음' : '없음'})`)
        
        // 산 이름 정리 (괄호 제거, 언더스코어 제거, 공백 정리)
        const cleanMountainName = mountainName.split('(')[0].split('_')[0].trim().replace(/\s+/g, ' ')
        
        // mountain_name 필드로 검색 (정확 일치만 허용하여 중복 방지)
        const nameQuery = {
          $or: [
            { mountain_name: mountainName },
            { mountain_name: cleanMountainName },
            { mountain_name: { $regex: `^${cleanMountainName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } }
          ]
        }
        
        const nameResults = await Lodging.find(nameQuery).lean()
        console.log(`[디버깅] 산 이름으로 찾은 숙소 (필터링 전): ${nameResults.length}개`)
        
        if (nameResults.length > 0) {
          let filteredResults = nameResults
          
          // 좌표가 있으면 거리 필터링 적용 (50km 이내만 허용)
          if (mountainCenter) {
            const MAX_DISTANCE_KM = 50
            filteredResults = nameResults.filter(lodging => {
              const lat = lodging.lodging_lat || lodging.lat || lodging.geometry?.location?.lat
              const lng = lodging.lodging_lng || lodging.lng || lodging.geometry?.location?.lng
              
              if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
                return false // 좌표가 없으면 제외
              }
              
              const distance = calculateDistance(mountainCenter.lat, mountainCenter.lon, lat, lng)
              return distance <= MAX_DISTANCE_KM
            })
            
            console.log(`[디버깅] 산 이름으로 찾은 숙소 (${MAX_DISTANCE_KM}km 이내): ${filteredResults.length}개`)
          } else {
            // 좌표가 없으면 매우 엄격한 이름 매칭만 허용 (정확 일치만)
            filteredResults = nameResults.filter(lodging => {
              const lodgingMountainName = (lodging.mountain_name || '').trim()
              return lodgingMountainName === mountainName || 
                     lodgingMountainName === cleanMountainName ||
                     lodgingMountainName.toLowerCase() === mountainName.toLowerCase() ||
                     lodgingMountainName.toLowerCase() === cleanMountainName.toLowerCase()
            })
            
            console.log(`[디버깅] 산 이름으로 찾은 숙소 (엄격한 이름 매칭): ${filteredResults.length}개`)
          }
          
          if (filteredResults.length > 0) {
            // 샘플 확인
            const sampleLodging = filteredResults[0]
            const sampleInfo = {
              name: sampleLodging.lodging_name || sampleLodging.name,
              mountain_name: sampleLodging.mountain_name
            }
            
            if (mountainCenter) {
              const lat = sampleLodging.lodging_lat || sampleLodging.lat || sampleLodging.geometry?.location?.lat
              const lng = sampleLodging.lodging_lng || sampleLodging.lng || sampleLodging.geometry?.location?.lng
              if (lat && lng) {
                sampleInfo.distance = calculateDistance(mountainCenter.lat, mountainCenter.lon, lat, lng).toFixed(2) + 'km'
              }
            }
            
            console.log(`[디버깅] 첫 번째 매칭된 숙소:`, sampleInfo)
            lodgings = filteredResults
          }
        }
      }
    }
    
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
    
    // 처음 3개 숙소의 데이터 구조 확인
    if (lodgings.length > 0) {
      console.log(`첫 번째 숙소 샘플:`, {
        name: lodgings[0].lodging_name || lodgings[0].name,
        mntilistno: lodgings[0].mntilistno,
        mountainCode: lodgings[0].mountainCode,
        code: lodgings[0].code,
        lat: lodgings[0].lodging_lat || lodgings[0].lat || lodgings[0].geometry?.location?.lat,
        lng: lodgings[0].lodging_lng || lodgings[0].lng || lodgings[0].geometry?.location?.lng,
        keys: Object.keys(lodgings[0])
      })
    }
    
    const lodgingList = lodgings
      .map(lodging => {
        // 산 코드가 정확히 일치하는지 확인
        const lodgingMountainCode = lodging.mntilistno || lodging.mountainCode || lodging.code
        const lodgingMountainCodeStr = lodgingMountainCode ? String(lodgingMountainCode) : null
        const requestedMountainCodeStr = String(mountainCode)
        
        // 산 이름 확인
        const lodgingMountainName = (lodging.mountain_name || '').trim()
        
        // 산 코드가 정확히 일치하는 경우 (우선)
        const codeMatches = lodgingMountainCodeStr && lodgingMountainCodeStr === requestedMountainCodeStr
        
        // 산 이름이 정확히 일치하는 경우 (코드가 없을 때만)
        let nameMatches = false
        if (!codeMatches && mountainName && lodgingMountainName) {
          const cleanMountainName = mountainName.split('(')[0].split('_')[0].trim().replace(/\s+/g, ' ')
          nameMatches = lodgingMountainName === mountainName ||
                       lodgingMountainName === cleanMountainName ||
                       lodgingMountainName.toLowerCase() === mountainName.toLowerCase() ||
                       lodgingMountainName.toLowerCase() === cleanMountainName.toLowerCase()
        }
        
        // 이름 매칭인 경우 추가 검증
        let nameMatchValid = false
        if (nameMatches) {
          // 좌표가 있으면 거리 검증 (50km 이내)
          if (mountainCenter) {
            const lat = lodging.lodging_lat || lodging.lat || lodging.geometry?.location?.lat
            const lng = lodging.lodging_lng || lodging.lng || lodging.geometry?.location?.lng
            if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
              const distance = calculateDistance(mountainCenter.lat, mountainCenter.lon, lat, lng)
              nameMatchValid = distance <= 50 // 50km 이내
            }
          } else {
            // 좌표가 없으면 정확한 이름 일치만 허용 (이미 위에서 확인됨)
            nameMatchValid = true
          }
        }
        
        // 코드가 일치하거나, 이름이 일치하고 검증을 통과한 경우만 포함
        if (!codeMatches && !(nameMatches && nameMatchValid)) {
          if (lodgings.indexOf(lodging) < 3) {
            console.log(`[필터링] 불일치 제외: ${lodging.lodging_name || lodging.name}, 숙소코드=${lodgingMountainCodeStr}, 요청코드=${requestedMountainCodeStr}, 숙소산이름=${lodgingMountainName}, 요청산이름=${mountainName}`)
          }
          return null
        }
        
        const lat = lodging.lodging_lat || lodging.lat || lodging.geometry?.location?.lat
        const lng = lodging.lodging_lng || lodging.lng || lodging.geometry?.location?.lng
        
        // 거리 계산 (표시용, 필터링은 하지 않음)
        let distance = null
        if (mountainCenter && lat && lng && !isNaN(lat) && !isNaN(lng)) {
          distance = calculateDistance(mountainCenter.lat, mountainCenter.lon, lat, lng)
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
          photo: (() => {
            const photoUrl = lodging.lodging_photo_url || lodging.photo
            if (photoUrl && (photoUrl.startsWith('http') || photoUrl.startsWith('https'))) {
              return photoUrl
            }
            return null
          })(),
          photo_reference: lodging.lodging_photo_reference || lodging.photo_reference,
          image: lodging.image || lodging.thumbnail,
          thumbnail: lodging.thumbnail || lodging.image,
          mountainName: mountainName,
          distance: distance
        }
      })
      .filter(lodging => lodging !== null)
    
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
    const mongoose = await import('mongoose')
    const db = mongoose.default.connection.db
    
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(c => c.name)
    const restaurantCollectionName = collectionNames.find(name => 
      name.toLowerCase().includes('rastaurant') || name.toLowerCase().includes('restaurant')
    ) || 'mountain_rastaurant'
    
    const restaurantCollection = db.collection(restaurantCollectionName)
    const mountainCode = String(code)
    const codeNum = parseInt(mountainCode)
    
    const restaurants = await restaurantCollection.find({
      $or: [
        { mountainCode: mountainCode },
        { mountainCode: codeNum },
        { mntilistno: mountainCode },
        { mntilistno: codeNum },
        { code: mountainCode },
        { code: codeNum },
        { 'restaurants.mountainCode': mountainCode },
        { 'restaurants.mountainCode': codeNum }
      ]
    }).toArray()
    
    const restaurantList = []
    restaurants.forEach(restaurantData => {
      const items = restaurantData.restaurants && Array.isArray(restaurantData.restaurants) 
        ? restaurantData.restaurants 
        : [restaurantData]
      
      items.forEach(restaurant => {
        const restaurantMountainCode = restaurant.mntilistno || restaurant.mountainCode || restaurant.code
        if (String(restaurantMountainCode) === mountainCode) {
          restaurantList.push({
            name: restaurant.name,
            address: restaurant.address || restaurant.vicinity,
            rating: restaurant.rating,
            user_ratings_total: restaurant.user_ratings_total || 0,
            place_id: restaurant.place_id,
            lat: restaurant.lat || restaurant.geometry?.location?.lat,
            lng: restaurant.lng || restaurant.geometry?.location?.lng,
            geometry: {
              location: {
                lat: restaurant.lat || restaurant.geometry?.location?.lat,
                lng: restaurant.lng || restaurant.geometry?.location?.lng
              }
            },
            maps_url: restaurant.maps_url,
            photo: restaurant.photo?.startsWith('http') ? restaurant.photo : null,
            photo_reference: restaurant.photo_reference || restaurant.photos?.[0]?.photo_reference,
            image: restaurant.image || restaurant.thumbnail || restaurant.photo,
            thumbnail: restaurant.thumbnail || restaurant.image || restaurant.photo,
            phone: restaurant.phone || restaurant.international_phone_number
          })
        }
      })
    })
    
    res.json({ restaurants: restaurantList })
  } catch (error) {
    console.error('주변 맛집 조회 오류:', error)
    res.json({ restaurants: [] })
  }
})

// 특정 산 편의시설(스팟) 조회 - 현재 데이터가 없으므로 빈 배열 반환 (404 방지)
app.get('/api/mountains/:code/spots', async (req, res) => {
  try {
    res.json({ spots: [] })
  } catch (error) {
    console.error('스팟 데이터 조회 오류:', error)
    res.json({ spots: [] })
  }
})

// 특정 산의 등산 코스 가져오기 (더 구체적인 라우트를 먼저 정의)
app.get('/api/mountains/:code/courses', async (req, res) => {
  try {
    const { code } = req.params
    const mongoose = await import('mongoose')
    const db = mongoose.default.connection.db
    
    // code가 ObjectId 형식인지 확인
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(code)
    const codeNum = parseInt(code)
    const codeStr = String(code)
    
    // 실제 mntilistno 값을 찾기
    let actualMountainCode = code
    let mountainName = null
    
    // ObjectId인 경우 실제 mntilistno를 찾기
    if (isObjectId) {
      const collections = await db.listCollections().toArray()
      const collectionNames = collections.map(c => c.name)
      const mountainListCollectionName = collectionNames.find(name => name === 'Mountain_list') ||
        collectionNames.find(name => name.toLowerCase() === 'mountain_list') ||
        'Mountain_list'
      const actualCollection = db.collection(mountainListCollectionName)
      
      try {
        const objectId = new mongoose.default.Types.ObjectId(code)
        const mountain = await actualCollection.findOne({ _id: objectId })
        
        if (mountain) {
          const mountainInfo = mountain.trail_match?.mountain_info || {}
          if (mountainInfo.mntilistno) {
            actualMountainCode = String(mountainInfo.mntilistno)
            mountainName = mountainInfo.mntiname || mountain.mntiname || mountain.name
          } else if (mountain.mntilistno) {
            actualMountainCode = String(mountain.mntilistno)
            mountainName = mountain.mntiname || mountain.name
          }
        }
      } catch (e) {
        console.error('ObjectId 변환 실패:', e)
      }
    }
    
    const actualCodeNum = parseInt(actualMountainCode)
    
    // mountain 폴더의 GeoJSON 파일에서 직접 가져오기
    let courses = []
    try {
      const { readdir, readFile } = await import('fs/promises')
      const { existsSync } = await import('fs')
      const { join } = await import('path')
      
      // 실제 mntilistno로 파일 경로 생성
      const geojsonDir = join('/app', 'mountain', `${actualMountainCode}_geojson`)
      
      console.log(`등산 코스 요청 - 파일 경로: ${geojsonDir}, code: ${code}, actualMountainCode: ${actualMountainCode}`)
      
      if (existsSync(geojsonDir)) {
          const files = await readdir(geojsonDir)
          const courseFiles = files.filter(f => 
            f.startsWith('PMNTN_') && 
            f.endsWith('.json') && 
            !f.includes('SPOT') &&
            !f.includes('SAFE_SPOT')
          )
          
          if (courseFiles.length > 0) {
            // 모든 코스 파일 읽기
            let allRawCourses = []
            
            for (const courseFile of courseFiles) {
              try {
                const courseFilePath = join(geojsonDir, courseFile)
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
                
                allRawCourses = allRawCourses.concat(rawCourses)
                console.log(`파일 ${courseFile}에서 ${rawCourses.length}개 코스 읽음`)
              } catch (fileReadError) {
                console.error(`파일 ${courseFile} 읽기 오류:`, fileReadError)
              }
            }
            
            console.log(`총 ${courseFiles.length}개 파일에서 ${allRawCourses.length}개 코스 읽음`)
            
            // ArcGIS 형식인 경우 attributes를 properties로 변환
            courses = allRawCourses
              .map(course => {
                // ArcGIS 형식 (attributes와 geometry.paths가 있는 경우)
                if (course.attributes && course.geometry && course.geometry.paths) {
                  const attrs = course.attributes
                  const courseName = (attrs.PMNTN_NM || attrs.PMNTN_MAIN || '').trim()
                  
                  // 이름이 없으면 제외
                  if (!courseName || courseName === '' || courseName === ' ') {
                    return null
                  }
                  
                  const upTime = attrs.PMNTN_UPPL || 0
                  const downTime = attrs.PMNTN_GODN || 0
                  const totalMinutes = upTime + downTime
                  const distance = attrs.PMNTN_LT || 0
                  const surfaceMaterial = (attrs.PMNTN_MTRQ || '').trim()
                  
                  // 난이도 추정
                  let difficulty = '보통'
                  if (distance <= 1.5 && totalMinutes <= 60) {
                    difficulty = '쉬움'
                  } else if (distance >= 10 || totalMinutes >= 240) {
                    difficulty = '어려움'
                  } else if (surfaceMaterial && (surfaceMaterial.includes('암석') || surfaceMaterial.includes('바위'))) {
                    difficulty = '어려움'
                  }
                  
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
                      PMNTN_NM: courseName,
                      difficulty: difficulty,
                      distance: distance,
                      PMNTN_LT: distance,
                      duration: duration,
                      upTime: upTime,
                      PMNTN_UPPL: upTime,
                      downTime: downTime,
                      PMNTN_GODN: downTime,
                      PMNTN_MTRQ: surfaceMaterial
                    },
                    geometry: course.geometry
                  }
                }
                // 이미 GeoJSON 형식인 경우
                if (course.properties && !course.properties.name && course.properties.PMNTN_NM) {
                  course.properties.name = course.properties.PMNTN_NM
                }
                return course
              })
              .filter(course => {
                if (!course) return false
                const name = course.properties?.name || course.properties?.PMNTN_NM || ''
                return name && name.trim() !== ''
              })
            
            console.log(`파일에서 읽은 코스 개수: ${courses.length}`)
          }
        } else {
          console.log(`파일 경로가 존재하지 않음: ${geojsonDir}`)
        }
    } catch (fileError) {
      console.error('파일에서 코스 읽기 오류:', fileError)
    }
    
    res.json({ courses: courses })
  } catch (error) {
    console.error('등산 코스 조회 오류:', error)
    res.json({ courses: [] })
  }
})

// 특정 산 상세 정보
app.get('/api/mountains/:code', async (req, res) => {
  try {
    const { code } = req.params
    const mongoose = await import('mongoose')
    const db = mongoose.default.connection.db
    
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(c => c.name)
    const mountainListCollectionName = collectionNames.find(name => name === 'Mountain_list') ||
      collectionNames.find(name => name.toLowerCase() === 'mountain_list') ||
      'Mountain_list'
    
    const actualCollection = db.collection(mountainListCollectionName)
    
    const codeNum = parseInt(code)
    const codeStr = String(code)
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(code)
    
    // ObjectId로 검색할 쿼리 조건 생성
    const queryConditions = [
      { mntilistno: codeNum },
      { mntilistno: codeStr },
      { code: codeNum },
      { code: codeStr },
      { 'trail_match.mountain_info.mntilistno': codeNum },
      { 'trail_match.mountain_info.mntilistno': codeStr },
      { 'trail_match.trail_files.code': codeStr },
      { 'trail_match.trail_files.code': codeNum }
    ]
    
    // ObjectId 형식이면 _id로도 검색
    if (isObjectId) {
      try {
        const objectId = new mongoose.default.Types.ObjectId(code)
        queryConditions.push({ _id: objectId })
      } catch (e) {
        console.error('ObjectId 변환 실패:', e)
      }
    }
    
    // 다양한 필드와 경로에서 검색
    let mountain = await actualCollection.findOne({
      $or: queryConditions
    })
    
    if (!mountain) {
      // DB에 없으면 하드코딩된 라우트 정보로 폴백
      const fallback = getMountainInfo(String(code))
      if (fallback) {
        const center = fallback.center
        return res.json({
          code: String(fallback.code),
          name: fallback.name || `산 (코드: ${code})`,
          location: fallback.location || '',
          height: fallback.height || null,
          center: center ? [center[0], center[1]] : null,
          description: '',
          image: null
        })
      }
      return res.status(404).json({ error: '산을 찾을 수 없습니다.' })
    }
    
    // 데이터 매핑 - trail_match 구조 지원
    const mountainInfo = mountain.trail_match?.mountain_info || {}
    const mntilistno = mountain.mntilistno || 
                       mountainInfo.mntilistno || 
                       mountain.code ||
                       mountain.trail_match?.trail_files?.[0]?.code ||
                       String(mountain._id)
    
    const mntiname = mountain.mntiname || 
                     mountainInfo.mntiname || 
                     mountain.name || ''
    
    const mntiadd = mountain.mntiadd || 
                    mountainInfo.mntiadd || 
                    mountain.location || ''
    
    const mntihigh = mountain.mntihigh || 
                     mountainInfo.mntihigh || 
                     mountain.height || ''
    
    // 좌표 추출
    const center = mountain.center || 
      (mountain.lat && mountain.lng ? { lat: mountain.lat, lon: mountain.lng } : null) ||
      (mountain.lat && mountain.lon ? { lat: mountain.lat, lon: mountain.lon } : null) ||
      (mountain.MNTN_CTR ? { 
        lat: mountain.MNTN_CTR.lat || mountain.MNTN_CTR[0], 
        lon: mountain.MNTN_CTR.lon || mountain.MNTN_CTR[1] 
      } : null) ||
      (mountainInfo.lat && mountainInfo.lon ? { lat: mountainInfo.lat, lon: mountainInfo.lon } : null)
    
    // DB에서 이미지 추출하는 헬퍼 함수
    const getImageFromMountain = (mountain, mountainInfo = null) => {
      const imageFields = [
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
        mountain.trail_match?.mountain_info?.photo_url,
        mountain.trail_match?.mountain_info?.image_url,
        mountain.trail_match?.mountain_info?.photoUrl,
        mountain.trail_match?.mountain_info?.imageUrl,
        mountain.trail_match?.mountain_info?.image,
        mountain.trail_match?.mountain_info?.photo,
        mountain.trail_match?.mountain_info?.thumbnail,
        mountainInfo?.photo_url,
        mountainInfo?.image_url,
        mountainInfo?.photoUrl,
        mountainInfo?.imageUrl,
        mountainInfo?.image,
        mountainInfo?.photo,
        mountainInfo?.thumbnail
      ]
      
      for (const img of imageFields) {
        const normalizedUrl = normalizeImageUrl(img)
        if (normalizedUrl) {
          return normalizedUrl
        }
      }
      return null
    }
    
    res.json({
      code: String(mntilistno),
      name: mntiname,
      location: mntiadd,
      height: mntihigh,
      center: center ? [center.lat, center.lon] : null,
      description: mountain.description || '',
      image: getImageFromMountain(mountain, mountainInfo)
    })
  } catch (error) {
    console.error('산 상세 정보 조회 오류:', error)
    res.status(500).json({ error: error.message })
  }
})

// CCTV 프록시
app.get('/api/cctv/proxy', async (req, res) => {
  try {
    const targetUrl = req.query.url
    if (!targetUrl) {
      return res.status(400).json({ error: 'URL 파라미터가 필요합니다.' })
    }
    
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      responseType: 'text',
      timeout: 10000
    })
    
    let modifiedHtml = response.data
    modifiedHtml = modifiedHtml.replace(/<meta[^>]*http-equiv=["']X-Frame-Options["'][^>]*>/gi, '')
    
    res.setHeader('Content-Type', 'text/html')
    res.send(modifiedHtml)
  } catch (error) {
    console.error('CCTV 프록시 오류:', error)
    res.status(500).json({ error: error.message })
  }
})

// 날씨 정보 (간단 버전)
app.get('/api/mountains/:code/weather', async (req, res) => {
  try {
    const { code } = req.params
    const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY
    
    // API 키가 없으면 에러 반환
    if (!OPENWEATHER_API_KEY || OPENWEATHER_API_KEY.trim() === '') {
      return res.status(503).json({ 
        error: '날씨 서비스를 사용할 수 없습니다. API 키가 설정되지 않았습니다.',
        message: 'OPENWEATHER_API_KEY 환경 변수를 설정해주세요.'
      })
    }
    
    // 산 좌표 찾기
    const mongoose = await import('mongoose')
    const db = mongoose.default.connection.db
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(c => c.name)
    const mountainListCollectionName = collectionNames.find(name => name === 'Mountain_list') ||
      collectionNames.find(name => name.toLowerCase() === 'mountain_list') ||
      'Mountain_list'
    const actualCollection = db.collection(mountainListCollectionName)
    
    const codeNum = parseInt(code)
    const codeStr = String(code)
    
    const mountain = await actualCollection.findOne({
      $or: [
        { mntilistno: codeNum },
        { mntilistno: codeStr },
        { code: codeNum },
        { code: codeStr },
        { 'trail_match.mountain_info.mntilistno': codeNum },
        { 'trail_match.mountain_info.mntilistno': codeStr },
        { 'trail_match.trail_files.code': codeStr },
        { 'trail_match.trail_files.code': codeNum }
      ]
    })
    
    let lat = 37.5665  // 서울 기본값
    let lon = 126.9780
    
    if (mountain) {
      // 좌표 추출
      const center = mountain.center || 
        (mountain.lat && mountain.lng ? { lat: mountain.lat, lon: mountain.lng } : null) ||
        (mountain.lat && mountain.lon ? { lat: mountain.lat, lon: mountain.lon } : null) ||
        (mountain.MNTN_CTR ? { 
          lat: mountain.MNTN_CTR.lat || mountain.MNTN_CTR[0], 
          lon: mountain.MNTN_CTR.lon || mountain.MNTN_CTR[1] 
        } : null) ||
        (mountain.trail_match?.mountain_info?.lat && mountain.trail_match?.mountain_info?.lon ? {
          lat: mountain.trail_match.mountain_info.lat,
          lon: mountain.trail_match.mountain_info.lon
        } : null)
      
      if (center) {
        lat = center.lat
        lon = center.lon
      }
    }
    
    // OpenWeatherMap API 호출
    const openWeatherUrl = 'https://api.openweathermap.org/data/2.5/forecast'
    const openWeatherParams = new URLSearchParams({
      lat: lat.toString(),
      lon: lon.toString(),
      appid: OPENWEATHER_API_KEY,
      units: 'metric',
      lang: 'kr'
    })
    
    const forecastResponse = await fetch(`${openWeatherUrl}?${openWeatherParams}`)
    if (!forecastResponse.ok) {
      if (forecastResponse.status === 401) {
        return res.status(503).json({ 
          error: '날씨 서비스를 사용할 수 없습니다. API 키가 유효하지 않습니다.',
          message: 'OPENWEATHER_API_KEY를 확인해주세요.'
        })
      }
      throw new Error(`Weather API error: ${forecastResponse.status}`)
    }
    
    const forecastData = await forecastResponse.json()
    
    // OpenWeatherMap 데이터를 프론트엔드가 기대하는 형식으로 변환
    const processedData = await processOpenWeatherData(forecastData, code, lat, lon)
    
    res.json(processedData)
  } catch (error) {
    console.error('날씨 정보 오류:', error)
    res.status(500).json({ error: error.message })
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
    
    // 오늘 날짜 이후만 포함 (어제 완전히 제외)
    const dateKeyNum = parseInt(dateKey.replace(/-/g, ''))
    
    if (dateKeyNum < todayKeyNum) {
      return // 어제 날짜는 완전히 제외
    }
    
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
      hour: hour
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
  
  // 날짜를 숫자로 변환해서 정확히 필터링
  const sortedDates = Object.keys(dailyForecast)
    .map(dateKey => ({
      dateKey,
      dateNum: parseInt(dateKey.replace(/-/g, ''))
    }))
    .filter(({ dateKey, dateNum }) => dateNum >= todayKeyNum)
    .sort((a, b) => a.dateNum - b.dateNum)
    .slice(0, 5)
    .map(({ dateKey }) => dateKey)
  
  sortedDates.forEach(dateKey => {
    const dateKeyNum = parseInt(dateKey.replace(/-/g, ''))
    if (dateKeyNum < todayKeyNum) {
      return
    }
    
    if (!dailyForecast[dateKey]) {
      return
    }
    
    const day = dailyForecast[dateKey]
    const [year, month, dayNum] = dateKey.split('-').map(Number)
    const date = new Date(year, month - 1, dayNum)
    const dayNames = ['일', '월', '화', '수', '목', '금', '토']
    const isToday = dateKey === todayKey
    
    // 오전 데이터 (9시 시간대 기준)
    if (day.morning.items.length > 0) {
      let morningItem = day.morning.items.find(item => item.hour === 9) || 
                       day.morning.items.reduce((closest, item) => 
                         Math.abs(item.hour - 9) < Math.abs(closest.hour - 9) ? item : closest
                       )
      
      if (morningItem) {
        result.push({
          date: dateKey,
          dayName: dayNames[date.getDay()],
          month: month,
          day: dayNum,
          period: '오전',
          tempMin: Math.round(Math.min(...day.morning.temps)),
          tempMax: Math.round(Math.max(...day.morning.temps)),
          weather: morningItem.weather[0],
          windSpeed: (day.morning.winds.reduce((a, b) => a + b, 0) / day.morning.winds.length).toFixed(1),
          icon: morningItem.weather[0].icon,
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
      const morningItem = day.afternoon.items.reduce((earliest, item) => 
        item.hour < earliest.hour ? item : earliest
      )
      
      if (morningItem) {
        const adjustedTemp = morningItem.main.temp - 2
        result.push({
          date: dateKey,
          dayName: dayNames[date.getDay()],
          month: month,
          day: dayNum,
          period: '오전',
          tempMin: Math.round(Math.min(morningItem.main.temp_min, adjustedTemp)),
          tempMax: Math.round(Math.max(morningItem.main.temp_max, adjustedTemp)),
          weather: morningItem.weather[0],
          windSpeed: (morningItem.wind?.speed || 0).toFixed(1),
          icon: morningItem.weather[0].icon,
          refined: {
            coord: morningItem.coord,
            weather: morningItem.weather,
            main: {
              ...morningItem.main,
              temp: adjustedTemp,
              temp_min: Math.min(morningItem.main.temp_min, adjustedTemp),
              temp_max: Math.max(morningItem.main.temp_max, adjustedTemp)
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
      }
    }
    
    // 오후 데이터 (15시 시간대 기준)
    if (day.afternoon.items.length > 0) {
      let afternoonItem = day.afternoon.items.find(item => item.hour === 15) || 
                         day.afternoon.items.reduce((closest, item) => 
                           Math.abs(item.hour - 15) < Math.abs(closest.hour - 15) ? item : closest
                         )
      
      if (afternoonItem) {
        result.push({
          date: dateKey,
          dayName: dayNames[date.getDay()],
          month: month,
          day: dayNum,
          period: '오후',
          tempMin: Math.round(Math.min(...day.afternoon.temps)),
          tempMax: Math.round(Math.max(...day.afternoon.temps)),
          weather: afternoonItem.weather[0],
          windSpeed: (day.afternoon.winds.reduce((a, b) => a + b, 0) / day.afternoon.winds.length).toFixed(1),
          icon: afternoonItem.weather[0].icon,
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
  
  // 최종 결과에서도 어제 날짜 제거
  const finalResult = result.filter(item => {
    const itemDateNum = parseInt(item.date.replace(/-/g, ''))
    return itemDateNum >= todayKeyNum
  })
  
  console.log(`날씨 API - 최종 반환 날짜: ${finalResult.map(r => r.date).join(', ')}`)
  
  return { code, lat, lon, forecast: finalResult }
}

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


// 헬스체크
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'mountain-service' })
})

// 서버 시작
app.listen(PORT, () => {
  console.log(`Mountain Service running on port ${PORT}`)
})

