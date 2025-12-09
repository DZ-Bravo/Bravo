import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:admin123@mongodb:27017/hiking?authSource=admin'

async function checkLodgingStructure() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('MongoDB 연결 성공')
    
    const db = mongoose.connection.db
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(c => c.name)
    
    const lodgingCollectionName = collectionNames.find(name => 
      name.toLowerCase().includes('lodging')
    ) || 'mountain_lodging'
    
    const lodgingCollection = db.collection(lodgingCollectionName)
    
    // 샘플 숙소 가져오기
    const sampleLodgings = await lodgingCollection.find({}).limit(3).toArray()
    
    console.log('\n=== 숙소 데이터 구조 확인 ===')
    sampleLodgings.forEach((doc, docIndex) => {
      console.log(`\n[문서 ${docIndex + 1}]`)
      console.log('문서 최상위 필드:', Object.keys(doc))
      console.log('mntilistno:', doc.mntilistno)
      console.log('mountainCode:', doc.mountainCode)
      console.log('lodging_name:', doc.lodging_name)
      console.log('name:', doc.name)
    })
    
    // 산 정보가 있는 숙소 개수 확인
    const totalCount = await lodgingCollection.countDocuments({})
    const withMntilistno = await lodgingCollection.countDocuments({ mntilistno: { $exists: true } })
    const withMountainCode = await lodgingCollection.countDocuments({ mountainCode: { $exists: true } })
    
    console.log('\n=== 통계 ===')
    console.log(`총 숙소 문서: ${totalCount}개`)
    console.log(`mntilistno 필드가 있는 문서: ${withMntilistno}개`)
    console.log(`mountainCode 필드가 있는 문서: ${withMountainCode}개`)
    
    // 특정 산 코드로 테스트
    const testCode = '491301801'
    const testQuery = {
      $or: [
        { mntilistno: testCode },
        { mountainCode: testCode }
      ]
    }
    const testResults = await lodgingCollection.find(testQuery).limit(3).toArray()
    console.log(`\n=== 테스트 쿼리 (산 코드: ${testCode}) ===`)
    console.log(`매칭된 문서: ${testResults.length}개`)
    
    await mongoose.disconnect()
    process.exit(0)
  } catch (error) {
    console.error('오류:', error)
    process.exit(1)
  }
}

checkLodgingStructure()

