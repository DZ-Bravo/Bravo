import { MongoClient } from 'mongodb'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:admin123@mongodb:27017/hiking?authSource=admin'

async function checkAllGwangjuMountains() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    console.log('MongoDB 연결 성공')
    
    const db = client.db('hiking')
    const mountainsCollection = db.collection('Mountain_list')
    
    console.log('\n=== 광주광역시 모든 산 확인 ===\n')
    
    // 광주광역시 산 찾기
    const mountains = await mountainsCollection.find({
      location: { $regex: /^광주광역시/ }
    }).toArray()
    
    console.log(`총 ${mountains.length}개 발견:\n`)
    
    mountains.forEach((m, idx) => {
      console.log(`[${idx + 1}] ${m.name || '이름 없음'}`)
      console.log(`  코드: ${m.mntilistno || m.code || 'N/A'}`)
      console.log(`  주소: ${m.location}`)
      console.log(`  좌표: lat=${m.lat}, lng=${m.lng}`)
      if (m.center) {
        console.log(`  center: ${JSON.stringify(m.center)}`)
      }
      console.log('')
    })
    
    // 무등산 특별 확인
    console.log('\n=== 무등산 상세 확인 ===\n')
    const mudeungsan = mountains.find(m => 
      (m.name && m.name.includes('무등')) ||
      (m.mntilistno && String(m.mntilistno) === '431502001') ||
      (m.code && String(m.code) === '431502001')
    )
    
    if (mudeungsan) {
      console.log('무등산 발견:')
      console.log(JSON.stringify(mudeungsan, null, 2))
    } else {
      console.log('무등산을 찾을 수 없습니다')
    }
    
  } catch (error) {
    console.error('오류:', error)
  } finally {
    await client.close()
    console.log('\nMongoDB 연결 종료')
  }
}

checkAllGwangjuMountains()

