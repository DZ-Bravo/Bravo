import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:admin123@mongodb:27017/hiking?authSource=admin'

async function checkMountainImages() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('MongoDB 연결 성공\n')
    
    const db = mongoose.connection.db
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(c => c.name)
    
    let mountainListCollectionName = collectionNames.find(name => name === 'Mountain_list')
    if (!mountainListCollectionName) {
      mountainListCollectionName = collectionNames.find(name => 
        name.toLowerCase() === 'mountain_list'
      ) || 'Mountain_list'
    }
    
    const mountainCollection = db.collection(mountainListCollectionName)
    
    // 인기 산 코드들 (등산일지에서 많이 언급된 산)
    const popularCodes = [
      '287201304', // 북한산
      '428302602', // 설악산
      '488605302', // 지리산
      '421902904', // 태백산
      '483100401', // 계룡산
      '457300301', // 덕유산
      '438001301'  // 소백산
    ]
    
    console.log('=== 인기 산 이미지 필드 확인 ===\n')
    
    for (const code of popularCodes) {
      const codeNum = parseInt(code)
      
      // 여러 쿼리로 시도
      const searchQueries = [
        { mntilistno: codeNum },
        { mntilistno: code },
        { code: codeNum },
        { code: code }
      ]
      
      let mountain = null
      for (const query of searchQueries) {
        mountain = await mountainCollection.findOne(query)
        if (mountain) break
      }
      
      if (mountain) {
        const name = mountain.mntiname || mountain.name || '이름 없음'
        console.log(`[${code}] ${name}`)
        
        // 이미지 관련 필드 확인
        const imageFields = {
          image: mountain.image,
          photo: mountain.photo,
          thumbnail: mountain.thumbnail,
          img: mountain.img,
          picture: mountain.picture,
          imageUrl: mountain.imageUrl,
          image_url: mountain.image_url,
          photoUrl: mountain.photoUrl,
          photo_url: mountain.photo_url,
          mntiimage: mountain.mntiimage,
          MNTN_IMG: mountain.MNTN_IMG,
          trail_match_image: mountain.trail_match?.mountain_info?.image,
          trail_match_photo: mountain.trail_match?.mountain_info?.photo,
          trail_match_thumbnail: mountain.trail_match?.mountain_info?.thumbnail
        }
        
        // 이미지 필드 중 값이 있는 것만 출력
        const hasImage = Object.entries(imageFields).some(([key, value]) => {
          return value && typeof value === 'string' && value.trim() !== ''
        })
        
        if (hasImage) {
          console.log('  이미지 필드:')
          Object.entries(imageFields).forEach(([key, value]) => {
            if (value && typeof value === 'string' && value.trim() !== '') {
              console.log(`    - ${key}: ${value.substring(0, 80)}${value.length > 80 ? '...' : ''}`)
            }
          })
        } else {
          console.log('  ❌ 이미지 필드 없음')
        }
        
        // 모든 필드명 출력 (디버깅용)
        console.log(`  전체 필드: ${Object.keys(mountain).join(', ')}`)
        console.log('')
      } else {
        console.log(`[${code}] ❌ DB에서 찾을 수 없음\n`)
      }
    }
    
    // 이미지 필드가 있는 산 개수 확인
    console.log('\n=== 이미지 필드 통계 ===')
    const allMountains = await mountainCollection.find({}).toArray()
    
    let withImage = 0
    const imageFieldNames = new Set()
    
    for (const m of allMountains) {
      const imageFields = [
        m.image, m.photo, m.thumbnail, m.img, m.picture,
        m.imageUrl, m.image_url, m.photoUrl, m.photo_url,
        m.mntiimage, m.MNTN_IMG,
        m.trail_match?.mountain_info?.image,
        m.trail_match?.mountain_info?.photo,
        m.trail_match?.mountain_info?.thumbnail
      ]
      
      const hasImage = imageFields.some(img => 
        img && typeof img === 'string' && img.trim() !== ''
      )
      
      if (hasImage) {
        withImage++
        // 어떤 필드에 이미지가 있는지 확인
        if (m.image) imageFieldNames.add('image')
        if (m.photo) imageFieldNames.add('photo')
        if (m.thumbnail) imageFieldNames.add('thumbnail')
        if (m.mntiimage) imageFieldNames.add('mntiimage')
        if (m.MNTN_IMG) imageFieldNames.add('MNTN_IMG')
        if (m.trail_match?.mountain_info?.image) imageFieldNames.add('trail_match.mountain_info.image')
      }
    }
    
    console.log(`총 산 개수: ${allMountains.length}`)
    console.log(`이미지가 있는 산: ${withImage}개`)
    console.log(`사용된 이미지 필드명: ${Array.from(imageFieldNames).join(', ')}`)
    
    await mongoose.disconnect()
    process.exit(0)
  } catch (error) {
    console.error('오류:', error)
    process.exit(1)
  }
}

checkMountainImages()

