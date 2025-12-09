import { MongoClient } from 'mongodb'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:admin123@mongodb:27017/hiking?authSource=admin'

async function fixMudeungsan() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    console.log('MongoDB 연결 성공')
    
    const db = client.db('hiking')
    const mountainsCollection = db.collection('Mountain_list')
    
    console.log('\n=== 무등산 정보 확인 및 수정 ===\n')
    
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
      console.log(`  좌표: lat=${mountain.lat}, lng=${mountain.lng}`)
      
      if (mountain.trail_match && mountain.trail_match.mountain_info) {
        console.log(`  trail_match.mountain_info.mntiadd: ${mountain.trail_match.mountain_info.mntiadd}`)
      }
      
      // 무등산의 올바른 주소는 "광주광역시" 또는 "전라남도 화순군" 등이어야 함
      // 현재 "충청북도 제천시"로 잘못되어 있음
      console.log('\n⚠️  무등산의 주소가 잘못되었을 수 있습니다')
      console.log('무등산은 광주광역시에 있는 산입니다')
      
      // 무등산의 올바른 좌표 (광주광역시 무등산)
      const correctLocation = '광주광역시 북구 용봉동'
      const correctLat = 35.1333  // 무등산 대략 좌표
      const correctLon = 126.9833
      
      console.log(`\n올바른 주소: ${correctLocation}`)
      console.log(`올바른 좌표: lat=${correctLat}, lon=${correctLon}`)
      
      // 수정
      const updateResult = await mountainsCollection.updateOne(
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
            'trail_match.mountain_info.mntiadd': correctLocation
          }
        }
      )
      
      console.log(`\n수정 결과: ${updateResult.modifiedCount}개 문서 수정됨`)
      
      if (updateResult.modifiedCount > 0) {
        console.log('✅ 무등산 정보가 성공적으로 수정되었습니다')
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

fixMudeungsan()

