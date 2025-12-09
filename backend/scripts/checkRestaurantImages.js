import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:admin123@mongodb:27017/hiking?authSource=admin'

async function checkRestaurantImages() {
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
    
    // 샘플 맛집 가져오기
    const sampleRestaurants = await restaurantCollection.find({}).limit(3).toArray()
    
    console.log('\n=== 맛집 이미지 필드 확인 ===')
    sampleRestaurants.forEach((doc, docIndex) => {
      console.log(`\n[문서 ${docIndex + 1}]`)
      console.log('문서 최상위 필드:', Object.keys(doc))
      
      if (Array.isArray(doc.restaurants) && doc.restaurants.length > 0) {
        const firstRestaurant = doc.restaurants[0]
        console.log('\n첫 번째 맛집 항목 필드:')
        console.log('  모든 필드:', Object.keys(firstRestaurant))
        console.log('  name:', firstRestaurant.name)
        console.log('  photo:', firstRestaurant.photo)
        console.log('  photo 타입:', typeof firstRestaurant.photo)
        console.log('  image:', firstRestaurant.image)
        console.log('  thumbnail:', firstRestaurant.thumbnail)
        console.log('  photo_reference:', firstRestaurant.photo_reference)
        console.log('  photos:', firstRestaurant.photos ? '있음' : '없음')
        if (firstRestaurant.photos && Array.isArray(firstRestaurant.photos) && firstRestaurant.photos.length > 0) {
          console.log('  photos[0]:', firstRestaurant.photos[0])
        }
        console.log('  geometry:', firstRestaurant.geometry ? '있음' : '없음')
        if (firstRestaurant.geometry) {
          console.log('  geometry 필드:', Object.keys(firstRestaurant.geometry))
        }
      }
    })
    
    // 이미지가 있는 맛집 개수 확인
    let withPhoto = 0
    let withImage = 0
    let withThumbnail = 0
    let withPhotoReference = 0
    let withPhotos = 0
    
    const allRestaurants = await restaurantCollection.find({}).toArray()
    
    for (const doc of allRestaurants) {
      if (Array.isArray(doc.restaurants)) {
        for (const r of doc.restaurants) {
          if (r.photo) withPhoto++
          if (r.image) withImage++
          if (r.thumbnail) withThumbnail++
          if (r.photo_reference) withPhotoReference++
          if (r.photos && Array.isArray(r.photos) && r.photos.length > 0) withPhotos++
        }
      } else {
        if (doc.photo) withPhoto++
        if (doc.image) withImage++
        if (doc.thumbnail) withThumbnail++
        if (doc.photo_reference) withPhotoReference++
        if (doc.photos && Array.isArray(doc.photos) && doc.photos.length > 0) withPhotos++
      }
    }
    
    console.log('\n=== 통계 ===')
    console.log(`photo 필드가 있는 맛집: ${withPhoto}개`)
    console.log(`image 필드가 있는 맛집: ${withImage}개`)
    console.log(`thumbnail 필드가 있는 맛집: ${withThumbnail}개`)
    console.log(`photo_reference 필드가 있는 맛집: ${withPhotoReference}개`)
    console.log(`photos 배열이 있는 맛집: ${withPhotos}개`)
    
    await mongoose.disconnect()
    process.exit(0)
  } catch (error) {
    console.error('오류:', error)
    process.exit(1)
  }
}

checkRestaurantImages()

