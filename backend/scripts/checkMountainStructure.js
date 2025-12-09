import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:admin123@mongodb:27017/hiking?authSource=admin'

async function checkMountainStructure() {
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
    
    const mountainCollection = db.collection(mountainListCollectionName)
    
    // 샘플 산 5개 가져오기
    const sampleMountains = await mountainCollection.find({}).limit(5).toArray()
    
    console.log(`\n=== 샘플 산 데이터 구조 ===`)
    sampleMountains.forEach((mountain, index) => {
      console.log(`\n[산 ${index + 1}]`)
      console.log('모든 필드:', Object.keys(mountain))
      console.log('mntilistno:', mountain.mntilistno)
      console.log('mntiname:', mountain.mntiname)
      console.log('center:', mountain.center)
      console.log('MNTN_CTR:', mountain.MNTN_CTR)
      console.log('coordinates:', mountain.coordinates)
      console.log('lat:', mountain.lat, 'lon:', mountain.lon, 'lng:', mountain.lng)
      console.log('LAT:', mountain.LAT, 'LON:', mountain.LON, 'LNG:', mountain.LNG)
      console.log('trail_match:', mountain.trail_match ? '있음' : '없음')
      if (mountain.trail_match?.mountain_info) {
        console.log('trail_match.mountain_info:', Object.keys(mountain.trail_match.mountain_info))
        console.log('trail_match.mountain_info.lat:', mountain.trail_match.mountain_info.lat)
        console.log('trail_match.mountain_info.lon:', mountain.trail_match.mountain_info.lon)
      }
    })
    
    // 좌표가 있는 산 개수 확인
    let withCoords = 0
    const mountains = await mountainCollection.find({}).toArray()
    
    for (const m of mountains) {
      let hasCoords = false
      
      if (m.center) hasCoords = true
      if (m.MNTN_CTR) hasCoords = true
      if (m.coordinates) hasCoords = true
      if (m.lat && (m.lon || m.lng)) hasCoords = true
      if (m.LAT && (m.LON || m.LNG)) hasCoords = true
      if (m.trail_match?.mountain_info) {
        const info = m.trail_match.mountain_info
        if (info.lat || info.LAT) hasCoords = true
      }
      
      if (hasCoords) withCoords++
    }
    
    console.log(`\n=== 통계 ===`)
    console.log(`총 산 개수: ${mountains.length}`)
    console.log(`좌표 필드가 있는 산: ${withCoords}개`)
    
    await mongoose.disconnect()
    process.exit(0)
  } catch (error) {
    console.error('오류:', error)
    process.exit(1)
  }
}

checkMountainStructure()

