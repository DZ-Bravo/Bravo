import mongoose from 'mongoose'

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://admin:admin123@mongodb:27017/hiking?authSource=admin'
    
    console.log('[Stamp Service] MongoDB 연결 시도...')
    console.log('[Stamp Service] MONGODB_URI:', mongoURI.replace(/:[^:@]+@/, ':****@')) // 비밀번호 숨김
    
    await mongoose.connect(mongoURI)
    
    console.log('[Stamp Service] MongoDB 연결 성공')
    
    // 연결 이벤트 리스너
    mongoose.connection.on('error', (err) => {
      console.error('[Stamp Service] MongoDB 연결 오류:', err)
    })
    
    mongoose.connection.on('disconnected', () => {
      console.warn('[Stamp Service] MongoDB 연결이 끊어졌습니다.')
    })
    
    mongoose.connection.on('reconnected', () => {
      console.log('[Stamp Service] MongoDB 재연결 성공')
    })
  } catch (error) {
    console.error('[Stamp Service] MongoDB 연결 실패:', error.message)
    console.error('[Stamp Service] 연결 실패 상세:', error)
    // 연결 실패해도 서버는 계속 실행 (다른 기능에 영향 없도록)
  }
}

export default connectDB

