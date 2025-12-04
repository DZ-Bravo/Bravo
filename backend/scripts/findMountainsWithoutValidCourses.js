import mongoose from 'mongoose'
import { readdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongo:27017/hiking'

// 등산 코스 필터링 기준 (서버와 동일)
function filterCourses(courses) {
  const filtered = courses.filter(course => {
    const props = course.properties || {}
    
    // upTime과 downTime 계산
    let totalTime = 0
    if (props.upTime !== undefined && props.downTime !== undefined) {
      totalTime = (props.upTime || 0) + (props.downTime || 0)
    } else if (props.PMNTN_UPPL !== undefined || props.PMNTN_GODN !== undefined) {
      totalTime = (props.PMNTN_UPPL || 0) + (props.PMNTN_GODN || 0)
    } else if (props.duration) {
      const durationMatch = props.duration.match(/(\d+)시간\s*(\d+)분|(\d+)시간|(\d+)분/)
      if (durationMatch) {
        const hours = parseInt(durationMatch[1] || durationMatch[3] || 0)
        const minutes = parseInt(durationMatch[2] || durationMatch[4] || 0)
        totalTime = hours * 60 + minutes
      }
    }
    
    const distance = props.distance || props.PMNTN_LT || 0
    
    // 코스 이름이 비어있는 경우 제외
    const courseName = (props.name || props.PMNTN_NM || '').trim()
    if (!courseName || courseName === '' || courseName === ' ') {
      return false
    }
    
    // 10분 이하 또는 0.5km 이하 제외
    if (totalTime <= 10 || distance <= 0.5) {
      return false
    }
    
    return true
  })
  
  return filtered
}

async function findMountainsWithoutValidCourses() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('MongoDB 연결 성공')
    
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
    const Course = mongoose.model('Course', new mongoose.Schema({}, { strict: false }))
    
    // 모든 산 가져오기
    const mountains = await actualCollection.find({}).toArray()
    console.log(`전체 산 개수: ${mountains.length}`)
    
    // Course 컬렉션에서 코스가 있는 산 코드 목록
    const coursesWithMountainCode = await Course.distinct('mountainCode')
    const hasCourseInDB = new Set(coursesWithMountainCode.map(c => String(c)))
    
    const mountainsWithoutValidCourses = []
    
    for (const mountain of mountains) {
      const mntilistno = mountain.mntilistno || mountain.trail_match?.mountain_info?.mntilistno
      if (!mntilistno) continue
      
      const code = String(mntilistno)
      const name = mountain.mntiname || mountain.trail_match?.mountain_info?.mntiname || mountain.name || '이름 없음'
      
      let hasValidCourses = false
      
      // 1. Course 컬렉션 확인
      const coursesInDB = await Course.find({ 
        $or: [
          { mountainCode: code },
          { mountainCode: parseInt(code) }
        ]
      }).lean()
      
      if (coursesInDB.length > 0) {
        // Course 컬렉션의 코스 데이터를 필터링
        const validCourses = filterCourses(coursesInDB.map(c => ({
          properties: c.courseData?.properties || c.courseData || {}
        })))
        if (validCourses.length > 0) {
          hasValidCourses = true
        }
      }
      
      // 2. 파일 시스템 확인
      if (!hasValidCourses) {
        const geojsonDir = join('/app', 'mountain', `${code}_geojson`)
        
        if (existsSync(geojsonDir)) {
          try {
            const files = await readdir(geojsonDir)
            const courseFiles = files.filter(f => 
              f.startsWith('PMNTN_') && 
              f.endsWith('.json') && 
              !f.includes('SPOT') && 
              !f.includes('SAFE_SPOT')
            )
            
            if (courseFiles.length > 0) {
              // 첫 번째 코스 파일 읽기
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
              const processedCourses = rawCourses.map(course => {
                // ArcGIS 형식 (attributes가 있는 경우)
                if (course.attributes && course.geometry) {
                  const attrs = course.attributes
                  return {
                    properties: {
                      name: attrs.PMNTN_NM || attrs.PMNTN_MAIN || '',
                      PMNTN_NM: attrs.PMNTN_NM || '',
                      PMNTN_UPPL: attrs.PMNTN_UPPL || 0,
                      PMNTN_GODN: attrs.PMNTN_GODN || 0,
                      PMNTN_LT: attrs.PMNTN_LT || 0,
                      distance: attrs.PMNTN_LT || 0,
                      upTime: attrs.PMNTN_UPPL || 0,
                      downTime: attrs.PMNTN_GODN || 0
                    }
                  }
                }
                // 이미 GeoJSON 형식
                return course
              })
              
              // 필터링 적용
              const validCourses = filterCourses(processedCourses)
              
              if (validCourses.length > 0) {
                hasValidCourses = true
              }
            }
          } catch (e) {
            // 파일 읽기 실패
            console.error(`파일 읽기 실패 (${code}):`, e.message)
          }
        }
      }
      
      // 유효한 코스가 없으면 삭제 대상
      if (!hasValidCourses) {
        mountainsWithoutValidCourses.push({
          _id: mountain._id,
          code,
          name,
          mntilistno: mntilistno,
          location: mountain.mntiadd || mountain.trail_match?.mountain_info?.mntiadd || '',
          height: mountain.mntihigh || mountain.trail_match?.mountain_info?.mntihigh || ''
        })
      }
    }
    
    console.log('\n=== 등산 코스 정보가 없는 산 리스트 (필터링 기준 적용) ===\n')
    console.log(`총 ${mountainsWithoutValidCourses.length}개\n`)
    
    mountainsWithoutValidCourses.forEach((m, index) => {
      console.log(`${index + 1}. ${m.name} (코드: ${m.code}, _id: ${m._id})`)
      if (m.location) console.log(`   위치: ${m.location}`)
      if (m.height) console.log(`   높이: ${m.height}m`)
      console.log('')
    })
    
    await mongoose.disconnect()
    return mountainsWithoutValidCourses
  } catch (error) {
    console.error('오류:', error)
    process.exit(1)
  }
}

findMountainsWithoutValidCourses().then(mountains => {
  if (mountains && mountains.length > 0) {
    console.log(`\n삭제할 산 개수: ${mountains.length}개`)
    console.log('삭제하려면 deleteMountainsWithoutValidCourses.js 스크립트를 실행하세요.')
  }
  process.exit(0)
})

