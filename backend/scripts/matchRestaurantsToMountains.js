import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:admin123@mongodb:27017/hiking?authSource=admin'

// 거리 계산 함수 (Haversine 공식) - km 단위
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371 // 지구 반지름 (km)
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

async function matchRestaurantsToMountains() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('MongoDB 연결 성공')
    
    const db = mongoose.connection.db
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(c => c.name)
    
    // Mountain_list 컬렉션 찾기
    let mountainListCollectionName = collectionNames.find(name => name === 'Mountain_list')
    if (!mountainListCollectionName) {
      mountainListCollectionName = collectionNames.find(name => 
        name.toLowerCase() === 'mountain_list'
      ) || 'Mountain_list'
    }
    
    // mountain_restaurant 컬렉션 찾기
    const restaurantCollectionName = collectionNames.find(name => 
      name.toLowerCase().includes('rastaurant') || name.toLowerCase().includes('restaurant')
    ) || 'mountain_rastaurant'
    
    console.log(`산 컬렉션: ${mountainListCollectionName}`)
    console.log(`맛집 컬렉션: ${restaurantCollectionName}`)
    
    const mountainCollection = db.collection(mountainListCollectionName)
    const restaurantCollection = db.collection(restaurantCollectionName)
    
    // 모든 산 가져오기
    const mountains = await mountainCollection.find({}).toArray()
    console.log(`총 ${mountains.length}개 산 발견`)
    
    // 산 좌표 추출 및 정리 (server.js와 동일한 로직 사용)
    const mountainData = mountains.map(mountain => {
      let center = null
      const m = mountain
      
      // center 필드에서 좌표 찾기
      if (m.center) {
        if (typeof m.center === 'object' && m.center.lat !== undefined && m.center.lon !== undefined) {
          center = { lat: m.center.lat, lon: m.center.lon }
        } else if (Array.isArray(m.center) && m.center.length >= 2) {
          center = { lat: m.center[0], lon: m.center[1] }
        }
      }
      
      // MNTN_CTR 필드 확인
      if (!center && m.MNTN_CTR) {
        if (Array.isArray(m.MNTN_CTR) && m.MNTN_CTR.length >= 2) {
          center = { lat: m.MNTN_CTR[0], lon: m.MNTN_CTR[1] }
        } else if (typeof m.MNTN_CTR === 'object') {
          center = { 
            lat: m.MNTN_CTR.lat || m.MNTN_CTR[0] || m.MNTN_CTR.y, 
            lon: m.MNTN_CTR.lon || m.MNTN_CTR[1] || m.MNTN_CTR.x 
          }
        }
      }
      
      // coordinates 필드 확인
      if (!center && m.coordinates) {
        if (typeof m.coordinates === 'object') {
          if (m.coordinates.lat !== undefined && m.coordinates.lon !== undefined) {
            center = { lat: m.coordinates.lat, lon: m.coordinates.lon }
          } else if (Array.isArray(m.coordinates) && m.coordinates.length >= 2) {
            center = { lat: m.coordinates[0], lon: m.coordinates[1] }
          }
        }
      }
      
      // lat, lon 또는 lat, lng 필드 확인 (lng 우선)
      if (!center) {
        const latValue = m.lat !== undefined ? m.lat : (m.LAT !== undefined ? m.LAT : null)
        const lonValue = (m.lng !== undefined ? m.lng : null) || 
                        (m.lon !== undefined ? m.lon : null) || 
                        (m.LNG !== undefined ? m.LNG : null) || 
                        (m.LON !== undefined ? m.LON : null)
        
        if (latValue !== null && latValue !== undefined && lonValue !== null && lonValue !== undefined) {
          center = { lat: latValue, lon: lonValue }
        }
      }
      
      // trail_match.mountain_info에서도 좌표 찾기
      if (!center && m.trail_match && m.trail_match.mountain_info) {
        const info = m.trail_match.mountain_info
        const latValue = info.lat !== undefined ? info.lat : (info.LAT !== undefined ? info.LAT : null)
        const lonValue = (info.lon !== undefined ? info.lon : null) || 
                        (info.lng !== undefined ? info.lng : null) || 
                        (info.LON !== undefined ? info.LON : null) || 
                        (info.LNG !== undefined ? info.LNG : null)
        
        if (latValue !== null && latValue !== undefined && lonValue !== null && lonValue !== undefined) {
          center = { lat: latValue, lon: lonValue }
        }
      }
      
      // 좌표 유효성 검사
      if (center) {
        const lat = Number(center.lat)
        const lon = Number(center.lon)
        if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
          center = null
        } else {
          center = { lat, lon }
        }
      }
      
      // 코드는 trail_match.mountain_info에서 찾기
      const code = mountain.trail_match?.mountain_info?.mntilistno || 
                   mountain.mntilistno || 
                   mountain.code || 
                   mountain.MNTN_CD
      const name = mountain.trail_match?.mountain_info?.mntiname || 
                   mountain.mntiname || 
                   mountain.name || 
                   mountain.MNTN_NM
      const location = mountain.trail_match?.mountain_info?.mntiadd || 
                       mountain.mntiadd || 
                       mountain.location || 
                       mountain.MNTN_LOC
      
      return {
        _id: mountain._id,
        code: code ? String(code) : null,
        name: name || null,
        location: location || null,
        center: center
      }
    }).filter(m => m.center !== null && m.code !== null) // 좌표와 코드가 있는 산만
    
    console.log(`좌표가 있는 산: ${mountainData.length}개`)
    
    // 모든 맛집 가져오기
    const restaurants = await restaurantCollection.find({}).toArray()
    console.log(`총 ${restaurants.length}개 맛집 문서 발견`)
    
    let matchedCount = 0
    let updatedCount = 0
    let skippedCount = 0
    
    // 각 맛집 문서 처리
    for (const restaurantDoc of restaurants) {
      try {
        // 맛집이 배열 형태로 저장되어 있는지 확인
        const restaurantItems = restaurantDoc.restaurants && Array.isArray(restaurantDoc.restaurants) 
          ? restaurantDoc.restaurants 
          : [restaurantDoc]
        
        let hasUpdate = false
        const updatedItems = []
        
        for (const restaurant of restaurantItems) {
          const lat = restaurant.lat || restaurant.geometry?.location?.lat
          const lng = restaurant.lng || restaurant.geometry?.location?.lng
          
          if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
            // 좌표가 없으면 스킵
            updatedItems.push(restaurant)
            skippedCount++
            continue
          }
          
          // 가장 가까운 산 찾기
          let nearestMountain = null
          let minDistance = Infinity
          
          for (const mountain of mountainData) {
            const distance = calculateDistance(mountain.center.lat, mountain.center.lon, lat, lng)
            if (distance < minDistance && distance <= 10) { // 10km 이내
              minDistance = distance
              nearestMountain = mountain
            }
          }
          
          if (nearestMountain) {
            // 맛집에 산 정보 추가
            const updatedRestaurant = {
              ...restaurant,
              mntilistno: nearestMountain.code,
              mountainCode: nearestMountain.code,
              mountain_name: nearestMountain.name,
              mountainName: nearestMountain.name,
              mountainLocation: nearestMountain.location,
              distanceToMountain: minDistance
            }
            updatedItems.push(updatedRestaurant)
            matchedCount++
            hasUpdate = true
          } else {
            updatedItems.push(restaurant)
            skippedCount++
          }
        }
        
        // 문서 업데이트
        if (hasUpdate) {
          if (restaurantDoc.restaurants && Array.isArray(restaurantDoc.restaurants)) {
            // 배열 형태인 경우
            await restaurantCollection.updateOne(
              { _id: restaurantDoc._id },
              { $set: { restaurants: updatedItems } }
            )
          } else {
            // 단일 맛집인 경우
            await restaurantCollection.updateOne(
              { _id: restaurantDoc._id },
              { $set: updatedItems[0] }
            )
          }
          updatedCount++
        }
        
        if (updatedCount % 100 === 0) {
          console.log(`진행 중... ${updatedCount}개 문서 업데이트됨`)
        }
      } catch (error) {
        console.error(`맛집 문서 처리 오류 (ID: ${restaurantDoc._id}):`, error.message)
      }
    }
    
    console.log('\n=== 매칭 완료 ===')
    console.log(`매칭된 맛집: ${matchedCount}개`)
    console.log(`업데이트된 문서: ${updatedCount}개`)
    console.log(`스킵된 맛집 (좌표 없음 또는 10km 이내 산 없음): ${skippedCount}개`)
    
    await mongoose.disconnect()
    process.exit(0)
  } catch (error) {
    console.error('오류:', error)
    process.exit(1)
  }
}

matchRestaurantsToMountains()

