import { MongoClient } from 'mongodb'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const DB_NAME = process.env.DB_NAME || 'mountain_db'

// 연화산 좌표 정보 (정확한 위치)
const yeonhwasanData = {
  '421901801': { // 울산 연화산
    name: '연화산 (울주군, 울산광역시)',
    location: '울산광역시 울주군 두동면 은편리',
    correctCenter: { lat: 35.1651385, lon: 129.0856007 } // 실제 좌표로 수정 필요
  },
  '488205101': { // 고성 연화산
    name: '연화산 (고성군, 경상남도)',
    location: '경상남도 고성군 개천면 좌연리',
    correctCenter: { lat: 35.0708957, lon: 128.2650066 }
  },
  '488702501': { // 함양 연화산
    name: '연화산 (함양군, 경상남도)',
    location: '경상남도 함양군 수동면 원평리',
    correctCenter: { lat: 35.5355556, lon: 127.7947222 }
  }
}

async function fixYeonhwasan() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    console.log('MongoDB 연결 성공')
    
    const db = client.db(DB_NAME)
    const mountainsCollection = db.collection('mountain_list')
    
    console.log('\n=== 연화산 좌표 확인 및 수정 ===\n')
    
    for (const [code, data] of Object.entries(yeonhwasanData)) {
      console.log(`\n[${data.name}]`)
      console.log(`코드: ${code}`)
      console.log(`주소: ${data.location}`)
      
      // DB에서 찾기
      const codeNum = parseInt(code)
      const mountain = await mountainsCollection.findOne({
        $or: [
          { mntilistno: codeNum },
          { mntilistno: code },
          { code: codeNum },
          { code: code }
        ]
      })
      
      if (mountain) {
        console.log('DB에서 발견됨')
        
        // 현재 좌표 확인
        let currentCenter = null
        if (mountain.center) {
          if (typeof mountain.center === 'object' && !Array.isArray(mountain.center)) {
            currentCenter = { lat: mountain.center.lat, lon: mountain.center.lon }
          } else if (Array.isArray(mountain.center)) {
            currentCenter = { lat: mountain.center[0], lon: mountain.center[1] }
          }
        }
        
        if (!currentCenter && mountain.MNTN_CTR) {
          if (Array.isArray(mountain.MNTN_CTR)) {
            currentCenter = { lat: mountain.MNTN_CTR[0], lon: mountain.MNTN_CTR[1] }
          } else if (typeof mountain.MNTN_CTR === 'object') {
            currentCenter = { 
              lat: mountain.MNTN_CTR.lat || mountain.MNTN_CTR[0] || mountain.MNTN_CTR.y, 
              lon: mountain.MNTN_CTR.lon || mountain.MNTN_CTR[1] || mountain.MNTN_CTR.x 
            }
          }
        }
        
        if (currentCenter) {
          console.log(`현재 좌표: lat=${currentCenter.lat}, lon=${currentCenter.lon}`)
          console.log(`올바른 좌표: lat=${data.correctCenter.lat}, lon=${data.correctCenter.lon}`)
          
          const latDiff = Math.abs(currentCenter.lat - data.correctCenter.lat)
          const lonDiff = Math.abs(currentCenter.lon - data.correctCenter.lon)
          
          if (latDiff > 0.01 || lonDiff > 0.01) {
            console.log(`⚠️  좌표 차이 발견! (lat 차이: ${latDiff.toFixed(6)}, lon 차이: ${lonDiff.toFixed(6)})`)
            console.log(`수정 필요: ${latDiff > 0.01 || lonDiff > 0.01 ? 'YES' : 'NO'}`)
          } else {
            console.log('✅ 좌표가 올바릅니다')
          }
        } else {
          console.log('⚠️  좌표가 없습니다')
        }
      } else {
        console.log('❌ DB에서 찾을 수 없습니다')
      }
    }
    
  } catch (error) {
    console.error('오류:', error)
  } finally {
    await client.close()
    console.log('\nMongoDB 연결 종료')
  }
}

fixYeonhwasan()

