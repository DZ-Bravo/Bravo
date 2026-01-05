import mongoose from 'mongoose'

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://admin:admin123@mongodb:27017/hiking?authSource=admin'
    
    await mongoose.connect(mongoURI)
    
    console.log('MongoDB 연결 성공')
    
    // 연결 이벤트 리스너
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB 연결 오류:', err)
    })
    
    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB 연결이 끊어졌습니다.')
    })
  } catch (error) {
    console.error('MongoDB 연결 실패:', error.message)
    console.warn('MongoDB 없이 서버를 계속 실행합니다. (파일 기반 데이터 사용)')
    // 연결 실패해도 서버는 계속 실행
  }
}

export default connectDB

