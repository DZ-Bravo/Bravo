import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:admin123@mongodb:27017/hiking?authSource=admin'

async function testRestaurantQuery() {
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
    
    // 테스트할 산 코드 (실제 존재하는 코드)
    const testMountainCode = '491301801' // 성산일출봉
    console.log(`\n=== 테스트 산 코드: ${testMountainCode} ===`)
    
    // 쿼리 생성 (서버와 동일한 로직)
    const restaurantFields = ['mountainCode', 'mountain_code', 'mntilistno', 'mountain_name', 'mountainName', 'code', 'mtn_cd', 'mountainId', 'area']
    const restaurantIds = [testMountainCode, String(testMountainCode), parseInt(testMountainCode)].filter(v => v !== undefined && v !== null && v !== '' && !Number.isNaN(v))
    const restaurantOr = []
    
    // restaurants 배열 내부 필드로 검색
    restaurantFields.forEach(f => {
      restaurantIds.forEach(id => {
        restaurantOr.push({ [`restaurants.${f}`]: id })
      })
    })
    
    // 최상위 레벨도 확인
    restaurantFields.forEach(f => {
      restaurantIds.forEach(id => {
        restaurantOr.push({ [f]: id })
      })
    })
    
    const restaurantQuery = restaurantOr.length > 0 ? { $or: restaurantOr } : {}
    
    console.log('쿼리 조건 수:', restaurantOr.length)
    console.log('쿼리 샘플 (처음 3개):', JSON.stringify(restaurantOr.slice(0, 3), null, 2))
    
    // 쿼리 실행
    const restaurants = await restaurantCollection.find(restaurantQuery).limit(5).toArray()
    
    console.log(`\n매칭된 문서: ${restaurants.length}개`)
    
    if (restaurants.length > 0) {
      console.log('\n첫 번째 문서:')
      const firstDoc = restaurants[0]
      console.log('문서 필드:', Object.keys(firstDoc))
      if (Array.isArray(firstDoc.restaurants) && firstDoc.restaurants.length > 0) {
        const firstRestaurant = firstDoc.restaurants[0]
        console.log('첫 번째 맛집 항목:')
        console.log('  name:', firstRestaurant.name)
        console.log('  mntilistno:', firstRestaurant.mntilistno)
        console.log('  mountainCode:', firstRestaurant.mountainCode)
        console.log('  mountain_name:', firstRestaurant.mountain_name)
      }
    } else {
      console.log('\n매칭된 문서가 없습니다.')
      console.log('전체 문서 중 하나 확인:')
      const anyDoc = await restaurantCollection.findOne({})
      if (anyDoc && Array.isArray(anyDoc.restaurants) && anyDoc.restaurants.length > 0) {
        const firstItem = anyDoc.restaurants[0]
        console.log('  mntilistno:', firstItem.mntilistno)
        console.log('  mountainCode:', firstItem.mountainCode)
        console.log('  타입:', typeof firstItem.mntilistno, typeof firstItem.mountainCode)
      }
    }
    
    await mongoose.disconnect()
    process.exit(0)
  } catch (error) {
    console.error('오류:', error)
    process.exit(1)
  }
}

testRestaurantQuery()

