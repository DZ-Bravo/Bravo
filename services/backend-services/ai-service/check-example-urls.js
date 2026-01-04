import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

const mongoURI = process.env.MONGODB_URI || 'mongodb://admin:admin123@mongodb:27017/hiking?authSource=admin'

async function checkExampleUrls() {
  try {
    console.log('MongoDB 연결 중...')
    await mongoose.connect(mongoURI)
    console.log('MongoDB 연결 성공\n')

    const db = mongoose.connection.db
    const categories = ['shoes', 'top', 'bottom', 'goods']
    
    let totalCount = 0
    let exampleCount = 0
    
    for (const category of categories) {
      console.log(`\n=== ${category} 컬렉션 검색 중 ===`)
      const collection = db.collection(category)
      
      // example.com이 포함된 URL 검색
      const exampleUrls = await collection.find({
        $or: [
          { url: { $regex: 'example.com', $options: 'i' } },
          { link: { $regex: 'example.com', $options: 'i' } },
          { productUrl: { $regex: 'example.com', $options: 'i' } },
          { product_link: { $regex: 'example.com', $options: 'i' } }
        ]
      }).toArray()
      
      const total = await collection.countDocuments()
      totalCount += total
      
      if (exampleUrls.length > 0) {
        console.log(`⚠️  ${exampleUrls.length}개 상품에서 example.com URL 발견:`)
        exampleUrls.forEach((product, idx) => {
          const url = product.url || product.link || product.productUrl || product.product_link || '없음'
          console.log(`  ${idx + 1}. 제품명: ${product.title || 'N/A'}`)
          console.log(`     브랜드: ${product.brand || product.brandName || 'N/A'}`)
          console.log(`     URL: ${url}`)
          console.log(`     _id: ${product._id}`)
          console.log('')
        })
        exampleCount += exampleUrls.length
      } else {
        console.log(`✅ example.com URL 없음 (전체 ${total}개 상품)`)
      }
    }
    
    console.log('\n=== 검색 결과 요약 ===')
    console.log(`전체 상품 수: ${totalCount}`)
    console.log(`example.com URL 포함 상품: ${exampleCount}`)
    
    if (exampleCount > 0) {
      console.log('\n⚠️  DB에 example.com URL이 저장되어 있습니다!')
      console.log('이 URL들은 제거하거나 실제 상품 URL로 교체해야 합니다.')
    } else {
      console.log('\n✅ DB에는 example.com URL이 없습니다.')
      console.log('문제는 Bedrock Agent 응답이나 다른 곳에서 발생할 수 있습니다.')
    }
    
  } catch (error) {
    console.error('오류 발생:', error)
  } finally {
    await mongoose.disconnect()
    console.log('\nMongoDB 연결 종료')
    process.exit(0)
  }
}

checkExampleUrls()
