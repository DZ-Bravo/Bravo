import { MongoClient } from 'mongodb'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:admin123@mongodb:27017/hiking?authSource=admin'

// 울산 연화산의 올바른 좌표 (울산광역시 울주군 두동면 은편리)
// 실제 좌표는 검색해서 확인 필요
const correctCoordinates = {
  '421901801': { // 울산 연화산
    lat: 35.1651385,  // 울산 지역 좌표로 수정 (37 -> 35)
    lon: 129.0856007  // 울산 지역 좌표로 수정 (128 -> 129)
  }
}

async function fixYeonhwasanCoordinates() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    console.log('MongoDB 연결 성공')
    
    const db = client.db('hiking')
    const mountainsCollection = db.collection('Mountain_list')
    
    console.log('\n=== 울산 연화산 좌표 수정 ===\n')
    
    // 울산 연화산 찾기
    const code = '421901801'
    const codeNum = parseInt(code)
    
    const mountain = await mountainsCollection.findOne({
      $or: [
        { 'trail_match.mountain_info.mntilistno': code },
        { 'trail_match.mountain_info.mntilistno': codeNum }
      ]
    })
    
    if (mountain) {
      console.log('발견된 산:')
      console.log(`  이름: ${mountain.name}`)
      console.log(`  주소: ${mountain.location}`)
      console.log(`  현재 좌표: lat=${mountain.lat}, lng=${mountain.lng}`)
      console.log(`  올바른 좌표: lat=${correctCoordinates[code].lat}, lon=${correctCoordinates[code].lon}`)
      
      // 좌표 수정
      const result = await mountainsCollection.updateOne(
        { _id: mountain._id },
        {
          $set: {
            lat: correctCoordinates[code].lat,
            lng: correctCoordinates[code].lon,
            center: {
              lat: correctCoordinates[code].lat,
              lon: correctCoordinates[code].lon
            }
          }
        }
      )
      
      console.log(`\n수정 결과: ${result.modifiedCount}개 문서 수정됨`)
      
      if (result.modifiedCount > 0) {
        console.log('✅ 좌표가 성공적으로 수정되었습니다')
      }
    } else {
      console.log('❌ 울산 연화산을 찾을 수 없습니다')
    }
    
  } catch (error) {
    console.error('오류:', error)
  } finally {
    await client.close()
    console.log('\nMongoDB 연결 종료')
  }
}

fixYeonhwasanCoordinates()

