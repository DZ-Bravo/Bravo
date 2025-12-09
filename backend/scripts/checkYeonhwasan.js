import { MongoClient } from 'mongodb'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const DB_NAME = process.env.DB_NAME || 'mountain_db'

async function checkYeonhwasan() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    console.log('MongoDB 연결 성공')
    
    const db = client.db(DB_NAME)
    const mountainsCollection = db.collection('mountain_list')
    
    // 연화산 검색 (다양한 이름 패턴)
    const searchPatterns = [
      /연화산/i,
      /연화/i,
      /yeonhwa/i
    ]
    
    console.log('\n=== 연화산 검색 ===')
    
    for (const pattern of searchPatterns) {
      const mountains = await mountainsCollection.find({
        $or: [
          { mntiname: pattern },
          { name: pattern },
          { MNTN_NM: pattern }
        ]
      }).toArray()
      
      if (mountains.length > 0) {
        console.log(`\n패턴 "${pattern}"으로 ${mountains.length}개 발견:`)
        mountains.forEach((m, idx) => {
          console.log(`\n[${idx + 1}] ${m.mntiname || m.name || m.MNTN_NM || '이름 없음'}`)
          console.log(`  코드: ${m.mntilistno || m.code || m.MNTN_CD || 'N/A'}`)
          console.log(`  주소: ${m.mntiadd || m.location || m.MNTN_LOC || 'N/A'}`)
          console.log(`  높이: ${m.mntihigh || m.height || m.MNTN_HG || 'N/A'}`)
          
          // 좌표 정보 확인
          let center = null
          if (m.center) {
            if (typeof m.center === 'object' && !Array.isArray(m.center)) {
              center = { lat: m.center.lat, lon: m.center.lon }
            } else if (Array.isArray(m.center)) {
              center = { lat: m.center[0], lon: m.center[1] }
            }
          }
          
          if (!center && m.MNTN_CTR) {
            if (Array.isArray(m.MNTN_CTR)) {
              center = { lat: m.MNTN_CTR[0], lon: m.MNTN_CTR[1] }
            } else if (typeof m.MNTN_CTR === 'object') {
              center = { 
                lat: m.MNTN_CTR.lat || m.MNTN_CTR[0] || m.MNTN_CTR.y, 
                lon: m.MNTN_CTR.lon || m.MNTN_CTR[1] || m.MNTN_CTR.x 
              }
            }
          }
          
          if (!center && m.coordinates) {
            if (typeof m.coordinates === 'object' && !Array.isArray(m.coordinates)) {
              center = { lat: m.coordinates.lat, lon: m.coordinates.lon }
            } else if (Array.isArray(m.coordinates)) {
              center = { lat: m.coordinates[0], lon: m.coordinates[1] }
            }
          }
          
          if (!center) {
            const lat = m.lat || m.LAT
            const lon = m.lon || m.lng || m.LON || m.LNG
            if (lat !== undefined && lon !== undefined) {
              center = { lat, lon }
            }
          }
          
          if (center) {
            console.log(`  좌표: lat=${center.lat}, lon=${center.lon}`)
            console.log(`  Google Maps: https://www.google.com/maps?q=${center.lat},${center.lon}`)
          } else {
            console.log(`  좌표: 없음`)
          }
          
          // trail_match.mountain_info 확인
          if (m.trail_match && m.trail_match.mountain_info) {
            const info = m.trail_match.mountain_info
            console.log(`  trail_match.mountain_info:`)
            console.log(`    이름: ${info.mntiname || info.name || 'N/A'}`)
            console.log(`    주소: ${info.mntiadd || info.location || 'N/A'}`)
            if (info.center) {
              console.log(`    좌표: ${JSON.stringify(info.center)}`)
            }
          }
        })
      }
    }
    
    // 모든 산 이름에서 "연화" 포함 검색
    console.log('\n=== "연화" 포함 모든 산 검색 ===')
    const allWithYeonhwa = await mountainsCollection.find({
      $or: [
        { mntiname: /연화/ },
        { name: /연화/ },
        { MNTN_NM: /연화/ }
      ]
    }).toArray()
    
    console.log(`총 ${allWithYeonhwa.length}개 발견`)
    allWithYeonhwa.forEach((m, idx) => {
      console.log(`${idx + 1}. ${m.mntiname || m.name || m.MNTN_NM} (${m.mntiadd || m.location || m.MNTN_LOC || '주소 없음'})`)
    })
    
  } catch (error) {
    console.error('오류:', error)
  } finally {
    await client.close()
    console.log('\nMongoDB 연결 종료')
  }
}

checkYeonhwasan()

