import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:admin123@mongodb:27017/hiking?authSource=admin'

async function testControlAPI() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('MongoDB 연결 성공')
    
    const db = mongoose.connection.db
    
    // mountain_control 컬렉션 찾기
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(c => c.name)
    const controlCollectionName = collectionNames.find(name => 
      name.toLowerCase().includes('control')
    ) || 'mountain_control'
    
    const Control = mongoose.model('Control', 
      new mongoose.Schema({}, { strict: false }), 
      controlCollectionName
    )
    
    // 덕유산 코드로 테스트
    const mountainCode = '457300301'
    const mountainName = '덕유산'
    const cleanName = mountainName.trim()
    
    console.log(`\n=== 통제 정보 조회 테스트 ===`)
    console.log(`산 코드: ${mountainCode}`)
    console.log(`산 이름: ${mountainName}`)
    console.log(`정리된 이름: "${cleanName}"`)
    
    // 모든 통제 정보 가져오기
    const allControls = await Control.find({}).lean()
    console.log(`\n총 ${allControls.length}개 통제 정보 발견`)
    console.log('통제 정보 목록:', allControls.map(c => c.mountain_name))
    
    // 매칭 시도
    let controlInfo = allControls.find(control => {
      const controlName = (control.mountain_name || '').split('(')[0].trim().replace(/\s+/g, ' ')
      return controlName.toLowerCase() === cleanName.toLowerCase()
    })
    
    if (controlInfo) {
      console.log(`\n✅ 매칭 성공!`)
      console.log(`통제 정보:`, {
        mountain_name: controlInfo.mountain_name,
        control_status: controlInfo.control_status,
        updated_at: controlInfo.updated_at
      })
    } else {
      console.log(`\n❌ 매칭 실패`)
    }
    
    await mongoose.disconnect()
    process.exit(0)
  } catch (error) {
    console.error('오류:', error)
    process.exit(1)
  }
}

testControlAPI()

