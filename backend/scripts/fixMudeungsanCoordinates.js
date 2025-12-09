import { MongoClient } from 'mongodb'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:admin123@mongodb:27017/hiking?authSource=admin'

// 무등산의 정확한 좌표 (광주광역시 북구 용봉동)
// 무등산 정상 좌표: 약 35.134722, 126.988889 (무등산 정상)
// 또는 무등산 국립공원 입구: 약 35.133056, 126.992222
const correctCoordinates = {
  lat: 35.134722,  // 무등산 정상 좌표
  lon: 126.988889
}

async function fixMudeungsanCoordinates() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    console.log('MongoDB 연결 성공')
    
    const db = client.db('hiking')
    const mountainsCollection = db.collection('Mountain_list')
    
    console.log('\n=== 무등산 좌표 수정 ===\n')
    
    // 무등산 찾기 (코드 431502001)
    const code = '431502001'
    const codeNum = parseInt(code)
    
    const mountain = await mountainsCollection.findOne({
      $or: [
        { 'trail_match.mountain_info.mntilistno': code },
        { 'trail_match.mountain_info.mntilistno': codeNum },
        { mntilistno: codeNum },
        { code: code }
      ]
    })
    
    if (mountain) {
      console.log('발견된 무등산:')
      console.log(`  이름: ${mountain.name}`)
      console.log(`  주소: ${mountain.location}`)
      console.log(`  현재 좌표: lat=${mountain.lat}, lng=${mountain.lng}`)
      console.log(`  올바른 좌표: lat=${correctCoordinates.lat}, lon=${correctCoordinates.lon}`)
      
      // 좌표 수정
      const result = await mountainsCollection.updateOne(
        { _id: mountain._id },
        {
          $set: {
            lat: correctCoordinates.lat,
            lng: correctCoordinates.lon,
            center: {
              lat: correctCoordinates.lat,
              lon: correctCoordinates.lon
            },
            location: '광주광역시 북구 용봉동',
            'trail_match.mountain_info.mntiadd': '광주광역시 북구 용봉동'
          }
        }
      )
      
      console.log(`\n수정 결과: ${result.modifiedCount}개 문서 수정됨`)
      
      if (result.modifiedCount > 0) {
        console.log('✅ 무등산 좌표가 성공적으로 수정되었습니다')
        console.log(`Google Maps: https://www.google.com/maps?q=${correctCoordinates.lat},${correctCoordinates.lon}`)
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

fixMudeungsanCoordinates()

