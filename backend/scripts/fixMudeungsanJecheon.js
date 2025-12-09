import { MongoClient } from 'mongodb'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:admin123@mongodb:27017/hiking?authSource=admin'
const DB_NAME = 'hiking'
const COLLECTION_NAME = 'Mountain_list'
const code = '431502001'
const codeNum = parseInt(code, 10)

async function fixMudeungsanJecheon() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    console.log('MongoDB 연결 성공')
    
    const db = client.db(DB_NAME)
    const mountainsCollection = db.collection(COLLECTION_NAME)
    
    // 무등산 찾기 (code 431502001)
    const mountain = await mountainsCollection.findOne({
      $or: [
        { name: '무등산', 'trail_match.mountain_info.mntilistno': code },
        { name: '무등산', 'trail_match.mountain_info.mntilistno': codeNum },
        { 'trail_match.mountain_info.mntilistno': code },
        { 'trail_match.mountain_info.mntilistno': codeNum }
      ]
    })
    
    if (mountain) {
      console.log('발견된 무등산:')
      console.log(`  이름: ${mountain.name}`)
      console.log(`  현재 주소: ${mountain.location}`)
      console.log(`  현재 좌표: lat=${mountain.lat}, lng=${mountain.lng}`)
      console.log(`  현재 mntiadd: ${mountain.trail_match?.mountain_info?.mntiadd || '없음'}`)
      console.log(`  현재 mntiadmin: ${mountain.trail_match?.mountain_info?.mntiadmin || '없음'}`)
      
      // 충청북도 제천시 송학면 무도리 무등산의 올바른 정보
      const correctLocation = '충청북도 제천시 송학면 무도리'
      // 제천시 송학면 무도리 좌표 (제천시는 약 37.1, 128.2 부근)
      const correctLat = 37.1690222  // 제천시 송학면 무도리 대략 좌표
      const correctLon = 128.2614901
      const correctAdmin = '제천시청'
      
      console.log(`\n올바른 주소: ${correctLocation}`)
      console.log(`올바른 좌표: lat=${correctLat}, lon=${correctLon}`)
      console.log(`올바른 mntiadmin: ${correctAdmin}`)
      
      // 수정
      const result = await mountainsCollection.updateOne(
        { _id: mountain._id },
        {
          $set: {
            location: correctLocation,
            lat: correctLat,
            lng: correctLon,
            center: {
              lat: correctLat,
              lon: correctLon
            },
            'trail_match.mountain_info.mntiadd': correctLocation,
            'trail_match.mountain_info.mntiadmin': correctAdmin
          }
        }
      )
      
      console.log(`\n수정 결과: ${result.modifiedCount}개 문서 수정됨`)
      
      if (result.modifiedCount > 0) {
        console.log('✅ 무등산 정보가 성공적으로 수정되었습니다')
        
        // 수정된 데이터 확인
        const updated = await mountainsCollection.findOne({ _id: mountain._id })
        console.log(`\n수정된 정보:`)
        console.log(`  location: ${updated.location}`)
        console.log(`  좌표: lat=${updated.lat}, lng=${updated.lng}`)
        console.log(`  mntiadd: ${updated.trail_match?.mountain_info?.mntiadd}`)
        console.log(`  mntiadmin: ${updated.trail_match?.mountain_info?.mntiadmin}`)
      }
    } else {
      console.log('❌ 무등산을 찾을 수 없습니다')
    }
    
  } catch (error) {
    console.error('오류:', error)
  } finally {
    await client.close()
    console.log('\nMongoDB 연결 종료')
  }
}

fixMudeungsanJecheon()
