import { MongoClient } from 'mongodb'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:admin123@mongodb:27017/hiking?authSource=admin'

async function checkYeonhwasanInDB() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    console.log('MongoDB 연결 성공')
    
    const db = client.db('hiking')
    
    // 모든 컬렉션 확인
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(c => c.name)
    console.log('컬렉션 목록:', collectionNames)
    
    // Mountain_list 컬렉션 찾기
    let mountainListCollectionName = collectionNames.find(name => name === 'Mountain_list')
    if (!mountainListCollectionName) {
      mountainListCollectionName = collectionNames.find(name => 
        name.toLowerCase() === 'mountain_list'
      )
    }
    
    if (!mountainListCollectionName) {
      console.log('Mountain_list 컬렉션을 찾을 수 없습니다')
      return
    }
    
    const mountainsCollection = db.collection(mountainListCollectionName)
    
    // 연화산 검색 (코드로)
    const codes = ['421901801', '488205101', '488702501']
    
    for (const code of codes) {
      const codeNum = parseInt(code)
      const mountains = await mountainsCollection.find({
        $or: [
          { mntilistno: codeNum },
          { mntilistno: code },
          { code: codeNum },
          { code: code },
          { 'trail_match.mountain_info.mntilistno': codeNum },
          { 'trail_match.mountain_info.mntilistno': code }
        ]
      }).toArray()
      
      if (mountains.length > 0) {
        console.log(`\n=== 코드 ${code} ===`)
        mountains.forEach((m, idx) => {
          console.log(`\n[${idx + 1}]`)
          console.log(`이름: ${m.mntiname || m.name || m.MNTN_NM || 'N/A'}`)
          console.log(`코드: ${m.mntilistno || m.code || m.MNTN_CD || 'N/A'}`)
          console.log(`주소: ${m.mntiadd || m.location || m.MNTN_LOC || 'N/A'}`)
          
          // 좌표 확인
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
          
          if (center) {
            console.log(`좌표: lat=${center.lat}, lon=${center.lon}`)
            console.log(`Google Maps: https://www.google.com/maps?q=${center.lat},${center.lon}`)
          } else {
            console.log('좌표: 없음')
          }
          
          // 전체 문서 출력
          console.log('\n전체 문서:')
          console.log(JSON.stringify(m, null, 2))
        })
      } else {
        console.log(`\n코드 ${code}: DB에서 찾을 수 없음`)
      }
    }
    
  } catch (error) {
    console.error('오류:', error)
  } finally {
    await client.close()
    console.log('\nMongoDB 연결 종료')
  }
}

checkYeonhwasanInDB()

