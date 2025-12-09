import { MongoClient } from 'mongodb'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongo:27017/mountain_db'
const DB_NAME = 'mountain_db'
const COLLECTION_NAME = 'Mountain_list'
const code = '431502001'
const codeNum = parseInt(code, 10)

async function fixMudeungsanAdmin() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    console.log('MongoDB 연결 성공')
    
    const db = client.db(DB_NAME)
    const mountainsCollection = db.collection(COLLECTION_NAME)
    
    // 무등산 찾기
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
      console.log(`  주소: ${mountain.location}`)
      console.log(`  현재 mntiadmin: ${mountain.trail_match?.mountain_info?.mntiadmin || '없음'}`)
      
      // 무등산은 광주광역시에 있으므로 mntiadmin을 "광주광역시청"으로 수정
      const correctAdmin = '광주광역시청'
      
      console.log(`\n올바른 mntiadmin: ${correctAdmin}`)
      
      // 수정
      const result = await mountainsCollection.updateOne(
        { _id: mountain._id },
        {
          $set: {
            'trail_match.mountain_info.mntiadmin': correctAdmin
          }
        }
      )
      
      console.log(`\n수정 결과: ${result.modifiedCount}개 문서 수정됨`)
      
      if (result.modifiedCount > 0) {
        console.log('✅ 무등산 mntiadmin이 성공적으로 수정되었습니다')
        
        // 수정된 데이터 확인
        const updated = await mountainsCollection.findOne({ _id: mountain._id })
        console.log(`\n수정된 mntiadmin: ${updated.trail_match?.mountain_info?.mntiadmin}`)
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

fixMudeungsanAdmin()

