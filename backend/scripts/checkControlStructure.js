import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:admin123@mongodb:27017/hiking?authSource=admin'

async function checkControlStructure() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('MongoDB 연결 성공')
    
    const db = mongoose.connection.db
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(c => c.name)
    
    const controlCollectionName = collectionNames.find(name => 
      name.toLowerCase().includes('control')
    ) || 'mountain_control'
    
    console.log(`통제 컬렉션: ${controlCollectionName}`)
    
    const controlCollection = db.collection(controlCollectionName)
    
    // 샘플 통제 정보 가져오기
    const sampleControls = await controlCollection.find({}).limit(3).toArray()
    
    console.log('\n=== 통제 정보 구조 확인 ===')
    sampleControls.forEach((doc, docIndex) => {
      console.log(`\n[문서 ${docIndex + 1}]`)
      console.log('문서 최상위 필드:', Object.keys(doc))
      console.log('전체 문서:', JSON.stringify(doc, null, 2))
    })
    
    // 특정 산 코드로 테스트
    const testCode = '287201304' // 북한산
    const testQuery = {
      $or: [
        { mntilistno: testCode },
        { mountainCode: testCode },
        { code: testCode }
      ]
    }
    const testResults = await controlCollection.find(testQuery).limit(3).toArray()
    console.log(`\n=== 테스트 쿼리 (산 코드: ${testCode}) ===`)
    console.log(`매칭된 문서: ${testResults.length}개`)
    if (testResults.length > 0) {
      console.log('첫 번째 결과:', JSON.stringify(testResults[0], null, 2))
    }
    
    // 총 문서 수
    const totalCount = await controlCollection.countDocuments({})
    console.log(`\n총 통제 정보 문서: ${totalCount}개`)
    
    await mongoose.disconnect()
    process.exit(0)
  } catch (error) {
    console.error('오류:', error)
    process.exit(1)
  }
}

checkControlStructure()

