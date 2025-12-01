import mongoose from 'mongoose'
import User from '../models/User.js'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:admin123@localhost:27017/hiking?authSource=admin'

async function createAdmin() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('MongoDB 연결 성공')

    // 기존 admin 계정 확인
    const existingAdmin = await User.findOne({ id: 'admin' })
    if (existingAdmin) {
      console.log('admin 계정이 이미 존재합니다. role을 admin으로 설정합니다.')
      existingAdmin.role = 'admin'
      await existingAdmin.save()
      console.log('admin 계정의 role이 업데이트되었습니다.')
    } else {
      // 새 admin 계정 생성
      const admin = new User({
        id: 'admin',
        name: '관리자',
        password: 'admin123', // pre-save 훅에서 자동으로 해싱됨 (최소 6자)
        gender: 'male',
        fitnessLevel: 'beginner',
        birthYear: 1990,
        role: 'admin'
      })
      
      await admin.save()
      console.log('admin 계정이 생성되었습니다.')
    }

    // 123456 계정을 일반 유저로 변경
    const user123456 = await User.findOne({ id: '123456' })
    if (user123456) {
      user123456.role = 'user'
      await user123456.save()
      console.log('123456 계정이 일반 유저로 변경되었습니다.')
    }

    await mongoose.disconnect()
    console.log('완료')
  } catch (error) {
    console.error('오류:', error)
    process.exit(1)
  }
}

createAdmin()

