import mongoose from 'mongoose'
import dotenv from 'dotenv'
dotenv.config()

const mongoURI = process.env.MONGODB_URI || 'mongodb://admin:admin123@mongodb:27017/hiking?authSource=admin'

async function testSearch() {
  try {
    console.log('MongoDB 연결 중...')
    await mongoose.connect(mongoURI)
    console.log('MongoDB 연결 성공\n')
    
    const db = mongoose.connection.db
    const categories = ['shoes', 'top', 'bottom', 'goods']
    const searchTitle = '샬레 포르테 보아 v3 (R9)'
    
    console.log(`=== "${searchTitle}" 검색 테스트 ===\n`)
    
    // 현재 코드에서 사용하는 검색 로직 시뮬레이션
    const titleRegex = new RegExp(searchTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    console.log(`정규식 패턴: ${titleRegex}`)
    console.log(`검색어: "${searchTitle}"\n`)
    
    for (const category of categories) {
      console.log(`\n--- ${category} 컬렉션 검색 ---`)
      const collection = db.collection(category)
      
      // 1. 정확히 일치하는지 확인
      const exactMatch = await collection.findOne({ title: searchTitle })
      if (exactMatch) {
        console.log(`✅ 정확 일치 발견!`)
        console.log(`   제품명: ${exactMatch.title}`)
        console.log(`   URL: ${exactMatch.url || exactMatch.link || exactMatch.productUrl || exactMatch.product_link || '없음'}`)
        console.log(`   브랜드: ${exactMatch.brand || exactMatch.brandName || exactMatch.manufacturer || '없음'}`)
      } else {
        console.log(`❌ 정확 일치 없음`)
      }
      
      // 2. 대소문자 무시 정확 일치
      const caseInsensitiveExact = await collection.findOne({ 
        title: { $regex: `^${searchTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } 
      })
      if (caseInsensitiveExact) {
        console.log(`✅ 대소문자 무시 정확 일치 발견!`)
        console.log(`   제품명: ${caseInsensitiveExact.title}`)
        console.log(`   URL: ${caseInsensitiveExact.url || caseInsensitiveExact.link || caseInsensitiveExact.productUrl || caseInsensitiveExact.product_link || '없음'}`)
      } else {
        console.log(`❌ 대소문자 무시 정확 일치 없음`)
      }
      
      // 3. 현재 코드에서 사용하는 부분 일치 검색
      const partialMatch = await collection.findOne({ title: titleRegex })
      if (partialMatch) {
        console.log(`✅ 부분 일치 발견 (현재 코드 로직)`)
        console.log(`   제품명: ${partialMatch.title}`)
        console.log(`   URL: ${partialMatch.url || partialMatch.link || partialMatch.productUrl || partialMatch.product_link || '없음'}`)
      } else {
        console.log(`❌ 부분 일치 없음 (현재 코드 로직)`)
      }
      
      // 4. "샬레" 또는 "포르테" 또는 "보아" 키워드로 검색
      const keywordMatch = await collection.findOne({ 
        title: { $regex: '샬레|포르테|보아', $options: 'i' } 
      })
      if (keywordMatch) {
        console.log(`✅ 키워드 일치 발견 (샬레|포르테|보아)`)
        console.log(`   제품명: ${keywordMatch.title}`)
        console.log(`   URL: ${keywordMatch.url || keywordMatch.link || keywordMatch.productUrl || keywordMatch.product_link || '없음'}`)
      }
      
      // 5. "샬레"로 시작하는 제품들 확인
      const startsWith = await collection.find({ 
        title: { $regex: '^샬레', $options: 'i' } 
      }).limit(5).toArray()
      if (startsWith.length > 0) {
        console.log(`\n📋 "샬레"로 시작하는 제품들 (최대 5개):`)
        startsWith.forEach((p, idx) => {
          console.log(`   ${idx + 1}. ${p.title}`)
        })
      }
      
      // 6. 전체 컬렉션에서 "샬레" 포함 제품 확인
      const contains = await collection.find({ 
        title: { $regex: '샬레', $options: 'i' } 
      }).limit(10).toArray()
      if (contains.length > 0) {
        console.log(`\n📋 "샬레" 포함 제품들 (최대 10개):`)
        contains.forEach((p, idx) => {
          console.log(`   ${idx + 1}. ${p.title}`)
          console.log(`      URL: ${p.url || p.link || p.productUrl || p.product_link || '없음'}`)
        })
      }
    }
    
  } catch (error) {
    console.error('오류 발생:', error)
  } finally {
    await mongoose.disconnect()
    console.log('\nMongoDB 연결 종료')
    process.exit(0)
  }
}

testSearch()
