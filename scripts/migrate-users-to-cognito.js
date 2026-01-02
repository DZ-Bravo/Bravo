import mongoose from 'mongoose'
import { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand } from '@aws-sdk/client-cognito-identity-provider'
import User from '../services/shared/models/User.js'
import dotenv from 'dotenv'

dotenv.config()

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'ap-northeast-2' })
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID

if (!USER_POOL_ID) {
  console.error('COGNITO_USER_POOL_ID 환경 변수가 설정되지 않았습니다.')
  process.exit(1)
}

async function migrateUsers() {
  try {
    // MongoDB 연결
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hiking'
    await mongoose.connect(MONGODB_URI)
    console.log('MongoDB 연결 성공')
    
    // 모든 사용자 조회
    const users = await User.find({})
    console.log(`총 ${users.length}명의 사용자를 마이그레이션합니다.`)
    
    let successCount = 0
    let skipCount = 0
    let errorCount = 0
    
    for (const user of users) {
      try {
        const username = user.id // 또는 user.email
        
        // Cognito에 사용자 생성
        const createUserCommand = new AdminCreateUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: username,
          UserAttributes: [
            { Name: 'email', Value: user.email || `${username}@temp.com` },
            { Name: 'name', Value: user.name || username },
            { Name: 'custom:provider', Value: user.socialProvider || 'local' },
            { Name: 'custom:userId', Value: user._id.toString() },
            { Name: 'custom:userRole', Value: user.role || 'user' },
            { Name: 'custom:mongoId', Value: user._id.toString() }
          ],
          MessageAction: 'SUPPRESS' // 이메일 인증 스킵
        })
        
        await cognitoClient.send(createUserCommand)
        
        // 비밀번호 설정
        // 소셜 로그인 사용자는 임시 비밀번호, 일반 사용자는 기존 비밀번호 해시 사용 불가 (Cognito는 평문 비밀번호 필요)
        // 일반 사용자는 첫 로그인 시 비밀번호 재설정 필요
        const password = user.socialProvider 
          ? Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12).toUpperCase()
          : `Temp${Math.random().toString(36).slice(-8)}!` // 임시 비밀번호 (첫 로그인 시 변경 필요)
        
        const setPasswordCommand = new AdminSetUserPasswordCommand({
          UserPoolId: USER_POOL_ID,
          Username: username,
          Password: password,
          Permanent: true
        })
        
        await cognitoClient.send(setPasswordCommand)
        
        console.log(`✅ 사용자 마이그레이션 완료: ${username} (${user.name})`)
        successCount++
      } catch (error) {
        if (error.name === 'UsernameExistsException') {
          console.log(`⚠️ 사용자 이미 존재: ${user.id}`)
          skipCount++
        } else {
          console.error(`❌ 사용자 마이그레이션 실패: ${user.id}`, error.message)
          errorCount++
        }
      }
    }
    
    console.log('\n=== 마이그레이션 완료 ===')
    console.log(`성공: ${successCount}명`)
    console.log(`건너뜀 (이미 존재): ${skipCount}명`)
    console.log(`실패: ${errorCount}명`)
    
    await mongoose.disconnect()
    console.log('MongoDB 연결 종료')
  } catch (error) {
    console.error('마이그레이션 오류:', error)
    process.exit(1)
  }
}

migrateUsers()

