import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:admin123@mongodb:27017/hiking?authSource=admin'

async function checkRestaurantStructure() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('MongoDB 연결 성공')
    
    const db = mongoose.connection.db
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(c => c.name)
    
    const restaurantCollectionName = collectionNames.find(name => 
      name.toLowerCase().includes('rastaurant') || name.toLowerCase().includes('restaurant')
    ) || 'mountain_rastaurant'
    
    const restaurantCollection = db.collection(restaurantCollectionName)
    
    // 산 정보가 있는 맛집 샘플 가져오기
    const sampleWithMountain = await restaurantCollection.findOne({
      $or: [
        { mntilistno: { $exists: true } },
        { mountainCode: { $exists: true } },
        { 'restaurants.mntilistno': { $exists: true } },
        { 'restaurants.mountainCode': { $exists: true } }
      ]
    })
    
    console.log('\n=== 산 정보가 있는 맛집 샘플 ===')
    if (sampleWithMountain) {
      console.log('문서 필드:', Object.keys(sampleWithMountain))
      console.log('mntilistno:', sampleWithMountain.mntilistno)
      console.log('mountainCode:', sampleWithMountain.mountainCode)
      console.log('mountain_name:', sampleWithMountain.mountain_name)
      console.log('restaurants 배열 여부:', Array.isArray(sampleWithMountain.restaurants))
      
      if (Array.isArray(sampleWithMountain.restaurants) && sampleWithMountain.restaurants.length > 0) {
        console.log('\n첫 번째 맛집 항목:')
        const firstItem = sampleWithMountain.restaurants[0]
        console.log('필드:', Object.keys(firstItem))
        console.log('mntilistno:', firstItem.mntilistno)
        console.log('mountainCode:', firstItem.mountainCode)
        console.log('mountain_name:', firstItem.mountain_name)
        console.log('name:', firstItem.name)
      }
    } else {
      console.log('산 정보가 있는 맛집을 찾을 수 없습니다.')
    }
    
    // 통계
    const totalCount = await restaurantCollection.countDocuments({})
    const withMntilistno = await restaurantCollection.countDocuments({ mntilistno: { $exists: true } })
    const withMountainCode = await restaurantCollection.countDocuments({ mountainCode: { $exists: true } })
    const withRestaurantsArray = await restaurantCollection.countDocuments({ 
      restaurants: { $exists: true, $type: 'array' } 
    })
    const withNestedMntilistno = await restaurantCollection.countDocuments({ 
      'restaurants.mntilistno': { $exists: true } 
    })
    
    console.log('\n=== 통계 ===')
    console.log(`총 맛집 문서: ${totalCount}개`)
    console.log(`mntilistno 필드가 있는 문서: ${withMntilistno}개`)
    console.log(`mountainCode 필드가 있는 문서: ${withMountainCode}개`)
    console.log(`restaurants 배열이 있는 문서: ${withRestaurantsArray}개`)
    console.log(`restaurants 배열 내부에 mntilistno가 있는 문서: ${withNestedMntilistno}개`)
    
    // 특정 산 코드로 테스트 (예: 113050202)
    const testCode = '113050202'
    const testQuery = {
      $or: [
        { mntilistno: testCode },
        { mountainCode: testCode },
        { 'restaurants.mntilistno': testCode },
        { 'restaurants.mountainCode': testCode }
      ]
    }
    const testResults = await restaurantCollection.find(testQuery).limit(3).toArray()
    console.log(`\n=== 테스트 쿼리 (산 코드: ${testCode}) ===`)
    console.log(`매칭된 문서: ${testResults.length}개`)
    
    await mongoose.disconnect()
    process.exit(0)
  } catch (error) {
    console.error('오류:', error)
    process.exit(1)
  }
}

checkRestaurantStructure()

