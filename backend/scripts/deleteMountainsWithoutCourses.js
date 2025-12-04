import mongoose from 'mongoose'
import { readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongo:27017/hiking'

async function deleteMountainsWithoutCourses() {
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
    
    const mountainsToDelete = []
    
    for (const mountain of mountains) {
      const mntilistno = mountain.mntilistno || mountain.trail_match?.mountain_info?.mntilistno
      if (!mntilistno) continue
      
      const code = String(mntilistno)
      const name = mountain.mntiname || mountain.trail_match?.mountain_info?.mntiname || mountain.name || '이름 없음'
      
      // 1. Course 컬렉션 확인
      const hasInDB = hasCourseInDB.has(code) || hasCourseInDB.has(String(parseInt(code)))
      
      // 2. 파일 시스템 확인
      const geojsonDir = join('/app', 'mountain', `${code}_geojson`)
      let hasInFile = false
      
      if (existsSync(geojsonDir)) {
        try {
          const files = await readdir(geojsonDir)
          const courseFiles = files.filter(f => 
            f.startsWith('PMNTN_') && 
            f.endsWith('.json') && 
            !f.includes('SPOT') && 
            !f.includes('SAFE_SPOT')
          )
          hasInFile = courseFiles.length > 0
        } catch (e) {
          // 디렉토리 읽기 실패
        }
      }
      
      // 둘 다 없으면 코스가 없는 산
      if (!hasInDB && !hasInFile) {
        mountainsToDelete.push({
          _id: mountain._id,
          code,
          name
        })
      }
    }
    
    console.log(`\n삭제할 산 개수: ${mountainsToDelete.length}개\n`)
    
    if (mountainsToDelete.length === 0) {
      console.log('삭제할 산이 없습니다.')
      await mongoose.disconnect()
      process.exit(0)
    }
    
    // 삭제할 산 목록 출력
    mountainsToDelete.forEach((m, index) => {
      console.log(`${index + 1}. ${m.name} (코드: ${m.code})`)
    })
    
    // 삭제 실행
    const idsToDelete = mountainsToDelete.map(m => m._id)
    const result = await actualCollection.deleteMany({ _id: { $in: idsToDelete } })
    
    console.log(`\n삭제 완료: ${result.deletedCount}개`)
    
    await mongoose.disconnect()
    process.exit(0)
  } catch (error) {
    console.error('오류:', error)
    process.exit(1)
  }
}

deleteMountainsWithoutCourses()

